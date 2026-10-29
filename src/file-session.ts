/** Complete memory-only session. No native storage, ownership or browser Shelf effects. */
import { validateRunEnvelopes, validateYieldSources } from './continuity.ts';
import { COMPLETE_BYTES, FILE_AGGREGATE_BYTES } from './save-store.ts';
import {
  apply,
  exportRun,
  type GameCommand,
  importRun,
  importRunAsync,
  type State,
  step,
  stepYieldBatch,
} from './sim.ts';
import { validateSourceArchives } from './source-archives';

const encoder = new TextEncoder();
type Original = {
  bytes: ArrayBuffer;
  size: number;
  name: string;
  type: string;
  lastModified: number;
  sha256: string;
};
type Held = { state: State; source: Record<string, unknown> };
export function createFileSession(
  bounds: {
    selectedBytes?: number;
    decodedBytes?: number;
    currentBytes?: number;
    aggregateBytes?: number;
    progress?: (tick: number) => void;
  } = {},
) {
  let controller = new AbortController();
  let epoch = 0,
    running = false,
    compact = false;
  let held: Held | null = null,
    original: Original | null = null;
  const selectedLimit = bounds.selectedBytes ?? COMPLETE_BYTES;
  const decodedLimit = bounds.decodedBytes ?? COMPLETE_BYTES;
  const currentLimit = bounds.currentBytes ?? COMPLETE_BYTES;
  const aggregateLimit = bounds.aggregateBytes ?? FILE_AGGREGATE_BYTES;
  function invalidate() {
    controller.abort();
    controller = new AbortController();
    epoch++;
    running = false;
  }
  function complete(next: Held) {
    const result = { ...structuredClone(next.source), ...(exportRun(next.state) as object) };
    delete result.compact;
    return result;
  }
  function capacity(next: Held, size = original?.size ?? 0) {
    const currentSize = encoder.encode(JSON.stringify(complete(next))).byteLength;
    if (currentSize > currentLimit || currentSize + size > aggregateLimit) {
      running = false;
      throw new Error('File session capacity reached. Download the complete run or choose another file.');
    }
  }
  function stage(change: (state: State) => void) {
    if (!held) throw new Error('Choose a run first.');
    // Keep the live Run on success. A failed action restores the exact prior game
    // and Run before the error escapes; source bytes and ownership stay unchanged.
    const before = exportRun(held.state);
    const source = held.source;
    try {
      change(held.state);
      capacity(held);
    } catch (error) {
      held = { state: importRun(before), source };
      throw error;
    }
  }
  return {
    invalidate,
    get epoch() {
      return epoch;
    },
    get running() {
      return running;
    },
    get compact() {
      return compact;
    },
    state: () => (held ? structuredClone(held.state) : null),
    original: () => (original ? structuredClone(original) : null),
    snapshot: () => (held ? complete(held) : null),
    async select(file?: File): Promise<boolean> {
      invalidate();
      const selection = epoch,
        current = () => selection === epoch;
      if (!file) return false;
      try {
        if (file.size > selectedLimit) throw new Error('Selected file exceeds complete run capacity.');
        const bytes = await file.arrayBuffer();
        if (!current()) return false;
        if (bytes.byteLength !== file.size || bytes.byteLength > selectedLimit)
          throw new Error('Invalid file size.');
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        if (!current()) return false;
        let decoded = new Uint8Array(bytes);
        if (decoded[0] === 0x1f && decoded[1] === 0x8b) {
          const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
          const chunks: Uint8Array<ArrayBuffer>[] = [];
          let total = 0;
          try {
            for (;;) {
              const part = await reader.read();
              if (!current()) return false;
              if (part.done) break;
              total += part.value.byteLength;
              if (total > decodedLimit) throw new Error('Expanded file exceeds complete run capacity.');
              chunks.push(part.value);
            }
          } finally {
            await reader.cancel();
          }
          if (!current()) return false;
          decoded = new Uint8Array(total);
          let at = 0;
          for (const chunk of chunks) {
            decoded.set(chunk, at);
            at += chunk.byteLength;
          }
        }
        if (decoded.byteLength > decodedLimit) throw new Error('Decoded file exceeds complete run capacity.');
        const source: Record<string, unknown> = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(decoded),
        );
        const { castSources, ...native } = source;
        // Same production archive validator; its count and UTF16-unit limits are not byte limits.
        const sourceArchives = castSources ?? [];
        validateYieldSources(sourceArchives);
        await validateSourceArchives(sourceArchives);
        if (!current()) return false;
        const state = await importRunAsync(native, { signal: controller.signal, progress: bounds.progress });
        if (!current()) return false;
        await validateRunEnvelopes(state);
        if (!current()) return false;
        const next = { state, source };
        capacity(next, bytes.byteLength);
        held = next;
        original = {
          bytes: bytes.slice(0),
          size: bytes.byteLength,
          name: file.name,
          type: file.type,
          lastModified: file.lastModified,
          sha256: Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join(''),
        };
        compact = source.compact === true;
        return true;
      } catch (error) {
        if (!current()) return false;
        throw error;
      }
    },
    // CS-R5: mutate the actual retained owner, never its UI clone.
    pauseAtEnd() {
      stage((state) => {
        if (!state.ended) throw new Error('The chapter has not ended.');
        if (!state.chapterPaused) apply(state, { kind: 'pause-chapter' });
      });
    },
    resume() {
      invalidate();
      stage((state) => {
        if (!state.ended && (state.chapterPaused || state.pauseRequested))
          apply(state, { kind: 'resume-chapter' });
      });
      running = true;
    },
    apply(command: GameCommand) {
      if (running) stage((state) => apply(state, command));
    },
    advance(ticks: number) {
      if (!running) return;
      stage((state) => {
        if (state.shortYield || state.remainder?.running) stepYieldBatch(state, true);
        else for (let i = 0; i < ticks && !state.ended && !state.chapterPaused; i++) step(state);
      });
    },
  };
}
