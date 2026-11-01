import { CAST } from './cast';
import { requireCurrentRun } from './current-policy';
import {
  COMPLETE_BYTES,
  database,
  decodeSave,
  encodeSave,
  FILE_AGGREGATE_BYTES,
  type SaveRecord,
} from './save-store';

export type PreparedAdmission = {
  id: string;
  source: string;
  generation: number;
  previousRevision?: string;
  expectedHeads: Record<string, string | null>;
  claims: { castId: string; revision: string; [key: string]: unknown }[];
  accepted: string[];
  nonaccepted: string[];
  rawPrepare: unknown;
  candidate: string;
};
type Intent = Omit<PreparedAdmission, 'candidate'> & {
  candidate: SaveRecord;
  previousRevision?: string;
  phase: 'prepared' | 'forwarded';
};
export type AdmissionPin = {
  id: string;
  source: string;
  generation: number;
  previousRevision?: string;
  candidateRevision: string;
  candidateSha256: string;
};
export const admissionPin = (intent: Intent): AdmissionPin => ({
  id: intent.id,
  source: intent.source,
  generation: intent.generation,
  previousRevision: intent.previousRevision,
  candidateRevision: intent.candidate.revision,
  candidateSha256: intent.candidate.sha256,
});
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export class AdmissionStore {
  private async transaction<T>(work: (tx: IDBTransaction, done: (value: T) => void) => void): Promise<T> {
    const db = await database();
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(['current', 'admission'], 'readwrite');
        let value: T;
        tx.oncomplete = () => resolve(value);
        tx.onabort = tx.onerror = () =>
          reject(tx.error ?? new Error('Prepared chapter changed or was cancelled.'));
        try {
          work(tx, (next) => {
            value = next;
          });
        } catch (error) {
          tx.abort();
          reject(error);
        }
      });
    } finally {
      db.close();
    }
  }
  async stage(input: PreparedAdmission, current: () => boolean) {
    if (!current()) throw new Error('Chapter cancelled before preparation.');
    const candidate = await encodeSave(input.candidate);
    return this.transaction<AdmissionPin>((tx, done) => {
      const held = tx.objectStore('admission').get('intent');
      held.onsuccess = () => {
        if (held.result || !current()) {
          tx.abort();
          return;
        }
        const prior = tx.objectStore('current').get('save');
        prior.onsuccess = () => {
          if (!current() || prior.result?.revision !== input.previousRevision) {
            tx.abort();
            return;
          }
          const { candidate: _text, ...metadata } = input;
          const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata)).byteLength;
          if (
            (prior.result?.decodedBytes ?? 0) + candidate.decodedBytes + metadataBytes >
            FILE_AGGREGATE_BYTES
          ) {
            tx.abort();
            return;
          }
          const intent: Intent = {
            ...structuredClone(input),
            candidate,
            previousRevision: prior.result?.revision,
            phase: 'prepared',
          };
          const put = tx.objectStore('admission').put(intent, 'intent');
          put.onsuccess = () => {
            if (!current()) tx.abort();
          };
          done(admissionPin(intent));
        };
      };
    });
  }
  async markForwarded(id: string, current: () => boolean, expected: AdmissionPin) {
    await this.transaction<void>((tx, done) => {
      const req = tx.objectStore('admission').get('intent');
      req.onsuccess = () => {
        const intent = req.result as Intent | undefined;
        if (!intent || intent.id !== id || !same(admissionPin(intent), expected) || !current()) {
          tx.abort();
          return;
        }
        intent.phase = 'forwarded';
        const put = tx.objectStore('admission').put(intent, 'intent');
        put.onsuccess = () => {
          if (!current()) tx.abort();
        };
        done();
      };
    });
  }
  async read(): Promise<Intent | null> {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const req = db.transaction('admission').objectStore('admission').get('intent');
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }
  async preparedText(): Promise<string | null> {
    const intent = await this.read();
    return intent ? decodeSave(intent.candidate) : null;
  }
  async recover(
    heads: Record<string, unknown>,
  ): Promise<'accepted' | 'unclaimed' | 'unresolved' | 'no-admission'> {
    const intent = await this.read();
    if (!intent) return 'no-admission';
    if (
      Object.keys(intent.expectedHeads).some(
        (id) =>
          !Object.hasOwn(heads, id) ||
          (heads[id] !== null &&
            (typeof heads[id] !== 'object' ||
              typeof (heads[id] as { revision?: unknown })?.revision !== 'string')),
      )
    )
      return 'unresolved';
    // History is deliberately absent: only exact current full custody can authorize recovery.
    const accepted = Object.entries(intent.expectedHeads).every(([id, revision]) => {
      const claim = intent.claims.find((p) => p.castId === id);
      return claim
        ? same(heads[id], claim)
        : ((heads[id] as { revision?: string } | null)?.revision ?? null) === revision;
    });
    if (accepted && intent.claims.length) return 'accepted';
    const unchanged = Object.entries(intent.expectedHeads).every(
      ([id, revision]) => ((heads[id] as { revision?: string } | null)?.revision ?? null) === revision,
    );
    return unchanged ? 'unclaimed' : 'unresolved';
  }
  // A forwarded empty CAS cannot claim anyone. Its pinned candidate must also be empty.
  private async unusedForwarded(intent: Intent): Promise<boolean> {
    if (
      !Array.isArray(intent.claims) ||
      intent.claims.length !== 0 ||
      !Array.isArray(intent.accepted) ||
      intent.accepted.length !== 0
    )
      return false;
    const ids = CAST.map((c) => c.castId);
    if (
      !intent.expectedHeads ||
      Object.keys(intent.expectedHeads).length !== ids.length ||
      ids.some(
        (id) =>
          !Object.hasOwn(intent.expectedHeads, id) ||
          (intent.expectedHeads[id] !== null && !/^[a-f0-9]{64}$/.test(intent.expectedHeads[id] ?? '')),
      ) ||
      !Array.isArray(intent.nonaccepted) ||
      !same([...intent.nonaccepted].sort(), [...ids].sort())
    )
      return false;
    try {
      const saved = JSON.parse(await decodeSave(intent.candidate));
      const run = saved.run;
      requireCurrentRun(run);
      const state = run.state as
        | {
            chapter?: unknown;
            inputs?: unknown;
            tick?: unknown;
            ended?: unknown;
            chapterPaused?: unknown;
            pauseRequested?: unknown;
            trainingUntil?: unknown;
          }
        | undefined;
      const empty = (chapter: unknown) => {
        const c = chapter as { claims?: unknown[]; inputs?: unknown[] } | null;
        return (
          !!c &&
          Array.isArray(c.claims) &&
          c.claims.length === 0 &&
          Array.isArray(c.inputs) &&
          c.inputs.length === 0
        );
      };
      return (
        saved.fileOrigin === false &&
        Array.isArray(saved.heads) &&
        saved.heads.length === 0 &&
        Array.isArray(saved.sources) &&
        saved.sources.length === 0 &&
        run?.tick === 0 &&
        Array.isArray(run.inputs) &&
        run.inputs.length === 0 &&
        state?.tick === 0 &&
        Array.isArray(state.inputs) &&
        state.inputs.length === 0 &&
        state.ended === false &&
        state.chapterPaused === false &&
        state.pauseRequested === false &&
        state.trainingUntil === null &&
        empty(run.chapter) &&
        empty(state?.chapter) &&
        same(run.chapter, state?.chapter)
      );
    } catch {
      return false;
    }
  }
  // Exact source/candidate pin, current heads and previous save still own deletion.
  async discardUnused(
    expected: AdmissionPin,
    heads: Record<string, unknown>,
    current: () => boolean,
  ): Promise<boolean> {
    const snapshot = await this.read();
    if (
      !snapshot ||
      !same(admissionPin(snapshot), expected) ||
      !current() ||
      (snapshot.phase !== 'prepared' &&
        (snapshot.phase !== 'forwarded' || !(await this.unusedForwarded(snapshot))))
    )
      return false;
    // Blob values are immutable, but JSON metadata does not identify their content.
    // Preserve the verified snapshot's actual bytes, then compare under the deletion lock.
    let verifiedBytes: Uint8Array;
    try {
      if (!(snapshot.candidate.bytes instanceof Blob) || snapshot.candidate.bytes.size > COMPLETE_BYTES)
        return false;
      verifiedBytes = new Uint8Array(await snapshot.candidate.bytes.arrayBuffer());
    } catch {
      return false;
    }
    return this.transaction<boolean>((tx, done) => {
      const req = tx.objectStore('admission').get('intent');
      req.onsuccess = () => {
        const intent = req.result as Intent | undefined;
        if (
          !intent ||
          !same(intent, snapshot) ||
          !same(admissionPin(intent), expected) ||
          !current() ||
          Object.entries(intent.expectedHeads).some(
            ([id, revision]) =>
              !Object.hasOwn(heads, id) ||
              (heads[id] !== null &&
                (typeof heads[id] !== 'object' ||
                  typeof (heads[id] as { revision?: unknown }).revision !== 'string')) ||
              ((heads[id] as { revision?: string } | null)?.revision ?? null) !== revision,
          )
        ) {
          done(false);
          return;
        }
        if (
          !(intent.candidate.bytes instanceof Blob) ||
          intent.candidate.bytes.size !== verifiedBytes.byteLength
        ) {
          done(false);
          return;
        }
        // A Blob read resolves outside IDB callbacks. Keep this same read/write
        // transaction open, then finish only inside an active request callback.
        // Both limits and current() abort a stalled or cancelled read without writes.
        let content: ArrayBuffer | null | undefined;
        let active = true;
        let requests = 0;
        const deadline = performance.now() + 10_000;
        tx.addEventListener('abort', () => {
          active = false;
        });
        tx.addEventListener('complete', () => {
          active = false;
        });
        void intent.candidate.bytes.arrayBuffer().then(
          (bytes) => {
            if (active) content = bytes;
          },
          () => {
            if (active) content = null;
          },
        );
        const keepAlive = () => {
          if (!active) return;
          if (!current() || performance.now() >= deadline || ++requests > 16_384) {
            active = false;
            tx.abort();
            return;
          }
          const pulse = tx.objectStore('admission').count('intent');
          pulse.onsuccess = () => {
            if (!active) return;
            if (!current() || performance.now() >= deadline) {
              active = false;
              tx.abort();
              return;
            }
            if (content === undefined) {
              keepAlive();
              return;
            }
            active = false;
            const bytes = content === null ? null : new Uint8Array(content);
            if (
              !current() ||
              !bytes ||
              bytes.length !== verifiedBytes.length ||
              !bytes.every((byte, i) => byte === verifiedBytes[i])
            ) {
              done(false);
              return;
            }
            const prior = tx.objectStore('current').get('save');
            prior.onsuccess = () => {
              if (!current() || prior.result?.revision !== intent.previousRevision) {
                done(false);
                return;
              }
              if (performance.now() >= deadline) {
                tx.abort();
                return;
              }
              const remove = tx.objectStore('admission').delete('intent');
              remove.onsuccess = () => {
                if (!current() || performance.now() >= deadline) tx.abort();
              };
              done(true);
            };
          };
        };
        keepAlive();
      };
    });
  }
  async promote(id: string, current: () => boolean, expected: AdmissionPin): Promise<boolean> {
    return this.transaction<boolean>((tx, done) => {
      const req = tx.objectStore('admission').get('intent');
      req.onsuccess = () => {
        const intent = req.result as Intent | undefined;
        if (
          !intent ||
          intent.id !== id ||
          intent.phase !== 'forwarded' ||
          !same(admissionPin(intent), expected) ||
          !current()
        ) {
          done(false);
          return;
        }
        const old = tx.objectStore('current').get('save');
        old.onsuccess = () => {
          if (!current() || old.result?.revision !== intent.previousRevision) {
            done(false);
            return;
          }
          const put = tx.objectStore('current').put(intent.candidate, 'save');
          put.onsuccess = () => {
            if (!current()) tx.abort();
          };
          const remove = tx.objectStore('admission').delete('intent');
          remove.onsuccess = () => {
            if (!current()) tx.abort();
          };
          done(true);
        };
      };
    });
  }
}
