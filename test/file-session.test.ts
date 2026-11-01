// Synthetic production codec controls. No browser profile or ownership receipts.
import { describe, expect, test, vi } from 'vitest';
import * as validation from '../src/continuity.ts';
import { createFileSession } from '../src/file-session.ts';
import { PRESSURE } from '../src/pressure.ts';
import { EDITION } from '../src/settlement.ts';
import { apply, createGame, exportRun, importRun, step } from '../src/sim.ts';

const file = (raw: unknown) =>
  new File([JSON.stringify(raw)], 'synthetic.json', { type: 'application/json', lastModified: 42 });
const sources = [
  {
    revision: 'synthetic',
    source: { game: 'commonstead', build: 'control', engine: '2.23.0', rules: 'commonstead-3' },
    snapshot: { full: '界', history: [1, 2, 3] },
  },
];
describe('complete memory file session', () => {
  test('real full and compact codecs retain all people, clocks and history, paused until explicit Resume', async () => {
    for (const config of [undefined, { edition: EDITION }] as const) {
      for (const compact of [false, true]) {
        const state = createGame(418, undefined, config, config ? undefined : PRESSURE);
        step(state);
        apply(state, { kind: 'pause-chapter' });
        const raw = exportRun(state, compact);
        const c = createFileSession();
        expect(await c.select(file(raw))).toBe(true);
        expect(c.state()).toEqual(state);
        expect(c.running).toBe(false);
        expect(c.compact).toBe(compact);
        c.advance(3);
        expect(c.state()).toEqual(state);
        c.resume();
        apply(state, { kind: 'resume-chapter' });
        c.advance(3);
        for (let i = 0; i < 3; i++) step(state);
        expect(c.state()).toEqual(state);
        expect(importRun(c.snapshot())).toEqual(state);
        const original = c.original()!;
        expect(original.name).toBe('synthetic.json');
        expect(original.lastModified).toBe(42);
        expect(original.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(new TextDecoder().decode(original.bytes)).toBe(JSON.stringify(raw));
      }
    }
  }, 30_000);
  test('retains nonempty source archive in replies editions and refuses full clock mutation', async () => {
    const s = createGame(418);
    const raw = { ...(exportRun(s) as object), castSources: sources };
    const c = createFileSession();
    await c.select(file(raw));
    expect(c.snapshot()).toEqual(raw);
    const bad = structuredClone(raw) as typeof raw & { state: { tick: number } };
    bad.state.tick++;
    await expect(c.select(file(bad))).rejects.toThrow();
    expect(c.snapshot()).toEqual(raw);
    const replies = createGame(418, undefined, { edition: EDITION });
    expect(await c.select(file({ ...(exportRun(replies) as object), castSources: sources }))).toBe(true);
    expect(c.snapshot()!.castSources).toEqual(sources);
    c.resume();
    c.advance(3);
    expect(c.snapshot()!.castSources).toEqual(sources);
  }, 30_000);
  test('late A after B, rejection, empty and close cannot install', async () => {
    for (const later of ['B', 'invalid', 'empty', 'close']) {
      let release!: (b: ArrayBuffer) => void;
      const a = file(exportRun(createGame(1)));
      const bytes = await a.arrayBuffer();
      a.arrayBuffer = () =>
        new Promise((resolve) => {
          release = resolve;
        });
      const c = createFileSession();
      const pending = c.select(a);
      if (later === 'B') await c.select(file(exportRun(createGame(2))));
      if (later === 'invalid') await expect(c.select(file({}))).rejects.toThrow();
      if (later === 'empty') await c.select();
      if (later === 'close') c.invalidate();
      release(bytes);
      expect(await pending).toBe(false);
      expect(c.state()?.seed ?? null).toBe(later === 'B' ? 2 : null);
    }
  });
  test('capacity refuses complete proposed frame and retains complete original and export', async () => {
    const s = createGame(418, undefined, undefined, PRESSURE);
    const raw = exportRun(s);
    const size = new TextEncoder().encode(JSON.stringify(raw)).byteLength;
    const c = createFileSession({ currentBytes: size + 20 });
    await c.select(file(raw));
    const before = c.snapshot(),
      original = c.original();
    c.resume();
    expect(() => c.advance(12)).toThrow(/capacity/i);
    expect(c.snapshot()).toEqual(before);
    expect(c.original()).toEqual(original);
    expect(c.running).toBe(false);
  });
});

// The old schema7 control required the removed no-pressure start. Keep its source in c98.
test('file selection refuses a synthetic unsupported schema7 header and preserves its held current file', async () => {
  const c = createFileSession();
  const current = file(exportRun(createGame(418)));
  await c.select(current);
  const before = c.snapshot(),
    original = c.original();
  const historical = { ...(exportRun(createGame(42)) as object), schema: 7 };
  const bytes = JSON.stringify(historical);
  await expect(c.select(file(historical))).rejects.toThrow(/Keep.*start a fresh/);
  expect(c.snapshot()).toEqual(before);
  expect(c.original()).toEqual(original);
  expect(JSON.stringify(historical)).toBe(bytes);
});

test('late digest and real envelope validation completion cannot install after cancellation', async () => {
  for (const gate of ['digest', 'validation']) {
    let unblock!: () => void, entered!: () => void;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    const validate = validation.validateRunEnvelopes;
    const spy =
      gate === 'digest'
        ? vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
            const result = await digest(...args);
            entered();
            await blocked;
            return result;
          })
        : vi.spyOn(validation, 'validateRunEnvelopes').mockImplementation(async (state) => {
            await validate(state);
            entered();
            await blocked;
          });
    try {
      const c = createFileSession(),
        pending = c.select(file(exportRun(createGame(418))));
      await reached;
      c.invalidate();
      unblock();
      expect(await pending).toBe(false);
      expect(c.state()).toBe(null);
    } finally {
      spy.mockRestore();
    }
  }
});

test('selected and streaming expanded bytes are bounded independently from UTF16 source limits', async () => {
  const c = createFileSession({ selectedBytes: 5_000_000, decodedBytes: 5_000_000 });
  const tooLarge = new File(['x'.repeat(5_000_001)], 'large.json');
  const read = vi.spyOn(tooLarge, 'arrayBuffer');
  await expect(c.select(tooLarge)).rejects.toThrow(/Selected/);
  expect(read).not.toHaveBeenCalled();
  const compressed = await new Response(
    new Blob([' '.repeat(5_000_001)]).stream().pipeThrough(new CompressionStream('gzip')),
  ).arrayBuffer();
  await expect(c.select(new File([compressed], 'expanded.gz'))).rejects.toThrow(/Expanded/);
  const raw = {
    ...(exportRun(createGame(418)) as object),
    castSources: [{ ...sources[0], snapshot: '界'.repeat(1_000_000) }],
  };
  await expect(c.select(file(raw))).rejects.toThrow(/source archive bounds/);
  expect(c.snapshot()).toBe(null);
});

// CS-R5: the file command owner records the real short ending before continuation.
test('file short ending establishes a safe command-owned pause before retained continuation', async () => {
  const s = createGame(418, undefined, undefined, PRESSURE);
  while (s.tick < 599) step(s);
  const raw = exportRun(s),
    c = createFileSession();
  await c.select(file(raw));
  const original = c.original();
  c.resume();
  c.advance(1);
  expect(c.state()?.ended).toBe(true);
  expect(c.state()?.chapterPaused).toBe(false);
  (c as unknown as { pauseAtEnd: () => void }).pauseAtEnd();
  expect(c.state()?.chapterPaused).toBe(true);
  const stoppedRaw = c.snapshot()!;
  c.invalidate(); // A loaded/stopped ending must also accept the explicit continuation.
  c.continueAtEnd({ kind: 'continue-workshop' });
  expect(c.running).toBe(true);
  expect(c.state()?.continuedWorkshop).toBeDefined();
  expect(c.state()?.tick).toBe(600);
  expect(c.original()).toEqual(original);
  expect(c.snapshot()).toEqual(exportRun(importRun(c.snapshot())));
  // The same transaction must roll back a stopped-ending continuation when it cannot fit.
  const size = new TextEncoder().encode(JSON.stringify(stoppedRaw)).byteLength;
  const bounded = createFileSession({ currentBytes: size });
  await bounded.select(file(stoppedRaw));
  const prior = bounded.snapshot(),
    priorOriginal = bounded.original();
  expect(() => bounded.continueAtEnd({ kind: 'continue-workshop' })).toThrow(/capacity/);
  expect(bounded.running).toBe(false);
  expect(bounded.snapshot()).toEqual(prior);
  expect(bounded.original()).toEqual(priorOriginal);
});
