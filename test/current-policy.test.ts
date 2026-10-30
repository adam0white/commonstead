import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { createFileSession } from '../src/file-session';
import { PRESSURE } from '../src/pressure';
import { createGame, exportRun, importRun, importRunAsync, step } from '../src/sim';

const evidence = new URL('./fixtures/policy2341-', import.meta.url).pathname;
// Immutable synthetic public-constructor exports captured on c98 before production edits.
// See fixtures/policy2341-provenance.json. These are not retained player files.
const oldFile = (name: string) => gunzipSync(readFileSync(`${evidence}synthetic-old-${name}.json.gz`));

test('public fresh short constructor always starts the pressure scenario', () => {
  expect(createGame(42).rules).toBe(PRESSURE);
});

test('actual same-pin schema12 history is refused before sync or cooperative replay', async () => {
  const raw = JSON.parse(oldFile('short-no-pressure').toString());
  const original = JSON.stringify(raw);
  expect(() => importRun(raw)).toThrow(/Keep.*start a fresh/i);
  await expect(importRunAsync(raw)).rejects.toThrow(/Keep.*start a fresh/i);
  expect(JSON.stringify(raw)).toBe(original);
});

test('public file refusal preserves its occupied current run and exact original bytes', async () => {
  const held = createGame(418, undefined, undefined, PRESSURE);
  step(held);
  const session = createFileSession();
  await session.select(new File([JSON.stringify(exportRun(held))], 'current.json'));
  const before = session.snapshot(),
    original = session.original();
  const bytes = oldFile('long-peer');
  await expect(session.select(new File([bytes], 'synthetic-old-long-peer.json'))).rejects.toThrow(
    /Keep.*start a fresh/i,
  );
  expect(session.snapshot()).toEqual(before);
  expect(session.original()).toEqual(original);
});

test('native Resume, native file and exact-head recovery refuse old policy without replacing occupied bytes', async () => {
  const { IDBFactory } = await import('fake-indexeddb');
  const { Continuity } = await import('../src/continuity');
  const { NativeSaveStore } = await import('../src/save-store');
  globalThis.indexedDB = new IDBFactory();
  let writes = 0;
  const claim = { castId: 'synthetic', revision: 'claimed' };
  const c = new Continuity(
    { setPersonaRecording() {}, build: () => ({ c: 'synthetic' }) } as never,
    {
      request: async ({ action }: { action: string }) => {
        if (action !== 'get') {
          writes++;
          throw new Error('Unexpected shelf mutation');
        }
        return claim;
      },
    } as never,
  );
  const store = new NativeSaveStore();
  await store.read();
  const current = createGame(418, undefined, undefined, PRESSURE);
  const wrapper = (run: unknown) =>
    JSON.stringify({ run, runId: 'synthetic', fileOrigin: false, heads: [], sources: [] });
  const occupied = wrapper(exportRun(current));
  await store.write(occupied);
  await c.loadLocal(occupied);
  const old = JSON.parse(oldFile('long-peer').toString());
  await expect(c.loadLocal(wrapper(old))).rejects.toThrow(/Keep.*start a fresh/i);
  await expect(c.importFile(JSON.stringify(old))).rejects.toThrow(/Keep.*start a fresh/i);
  expect(await store.read()).toBe(occupied);
  const candidate = wrapper(old);
  const pin = await c.admissions.stage(
    {
      id: 'synthetic-old-preparation',
      source: JSON.stringify(c.source()),
      generation: c.generation,
      previousRevision: store.observedRevision,
      expectedHeads: { synthetic: 'parent' },
      claims: [claim],
      accepted: ['synthetic'],
      nonaccepted: [],
      rawPrepare: {},
      candidate,
    },
    () => true,
  );
  await c.admissions.markForwarded(pin.id, () => true, pin);
  const intent = await c.admissions.read();
  await expect(c.recoverPrepared()).rejects.toThrow(/Keep.*start a fresh/i);
  expect(await store.read()).toBe(occupied);
  expect(await c.admissions.preparedText()).toBe(candidate);
  expect(await c.admissions.read()).toEqual(intent);
  expect(writes).toBe(0);
});

test('old variant constructors and forged current headers cannot relabel an old history', () => {
  for (const edition of ['settlement-day/1', 'settlement-replies/1'])
    expect(() => createGame(42, undefined, { edition } as never)).toThrow(/Keep.*start a fresh/i);
  expect(() => createGame(42, undefined, undefined, null as never)).toThrow();
  const old = JSON.parse(oldFile('long-peer').toString());
  const current = exportRun(createGame(42, undefined, { edition: 'settlement-replies/2' })) as Record<
    string,
    unknown
  >;
  expect(() => importRun({ ...old, schema: current.schema, policy: current.policy })).toThrow(/not loaded/);
  const compact = { ...old, schema: current.schema, policy: current.policy, compact: true };
  delete compact.state;
  expect(() => importRun(compact)).toThrow(/not loaded/);
});
