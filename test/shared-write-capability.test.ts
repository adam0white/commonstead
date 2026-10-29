import { readFileSync } from 'node:fs';
import {
  canonicalCast,
  createPersona,
  initialPersonaLife,
  type Lab,
  type PersonaRequest,
  preparePersonaLife,
} from '@adam0white/lab-client';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, test } from 'vitest';
import { CAST } from '../src/cast';
import { Continuity } from '../src/continuity';
import { FRAMEWORK_VERSION } from '../src/engine';
import { residentTransfer } from '../src/passport';
import { apply, createGame, exportRun, importRun, step } from '../src/sim';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
const refusal = /saved history cannot be written across games yet/i;
function harness() {
  const requests: PersonaRequest[] = [];
  let prepare: unknown = {
    inputs: [],
    blocked: [],
    expectedHeads: Object.fromEntries(CAST.map((c) => [c.castId, null])),
  };
  const lab = {
    setPersonaRecording: () => {},
    build: () => ({ c: 'current-capability-control' }),
  } as unknown as Lab;
  const shelf = {
    enabled: true,
    ready: Promise.resolve(true),
    setEnabled: () => {},
    async request<T>(r: PersonaRequest): Promise<T> {
      requests.push(r);
      return (r.action === 'prepareBatch' ? prepare : null) as T;
    },
  };
  const c = new Continuity(lab, shelf);
  return {
    c,
    requests,
    setPrepare: (p: unknown) => {
      prepare = p;
    },
    writes: () => requests.filter((r) => r.action === 'put' || r.action === 'putBatch'),
  };
}
async function parent() {
  const person = createGame(418).villagers[0]!.person,
    captured = await residentTransfer(person),
    cast = canonicalCast(person.id);
  return createPersona({
    format: 'hf-persona/1',
    castId: person.id,
    castRevision: cast.revision,
    branchId: 'historical-source-control',
    parentRevision: null,
    source: {
      game: 'commonstead',
      build: 'historical-source-control',
      engine: FRAMEWORK_VERSION,
      rules: 'commonstead-4',
    },
    transfer: {
      ...captured.transfer,
      life: initialPersonaLife(person.id, 'historical-source-control', 1_790_000_000_000),
    },
    limitations: captured.limitations,
  });
}
for (const blocked of [false, true])
  test(`nonempty ${blocked ? 'blocked metadata' : 'retained arrival'} skips the unavailable person and preserves the source head`, async () => {
    const h = harness(),
      s = await h.c.fresh(418),
      before = h.c.localSave(s),
      p = await parent();
    const expectedHeads = Object.fromEntries(
      CAST.map((c) => [c.castId, c.castId === p.castId ? p.revision : null]),
    );
    h.setPrepare({
      expectedHeads,
      inputs: blocked ? [] : [preparePersonaLife(p, 1_790_000_000_000)],
      blocked: blocked ? [{ castId: p.castId, reason: 'Existing history remains at its source.' }] : [],
    });
    h.requests.length = 0;
    const next = await h.c.fresh(419);
    expect(next.chapter?.inputs).toEqual([]);
    expect(next.chapter?.claims).toEqual([]);
    expect(next.chapter?.blocked?.map((row) => row.castId)).toContain(p.castId);
    expect(h.requests.map((r) => r.action)).toEqual(['prepareBatch', 'putBatch']);
    expect(h.writes()).toHaveLength(1);
    expect(h.writes()[0]).toMatchObject({ envelopes: [], expectedHeads });
    expect(await h.c.admissions.read()).toBeNull();
    expect(JSON.parse((await h.c.store.read())!).run).toEqual(exportRun(next));
    expect(exportRun(s)).toEqual(JSON.parse(before).run);
  });

for (const automatic of [false, true])
  test(`${automatic ? 'automatic batch' : 'manual living'} checkpoint has no current shared-write capability`, async () => {
    const h = harness(),
      s = await h.c.fresh(418);
    step(s);
    apply(s, { kind: 'pause-chapter' });
    while (!s.chapterPaused && s.tick < 80) step(s);
    expect(s.chapterPaused).toBe(true);
    const before = h.c.localSave(s);
    await h.c.store.write(before);
    h.requests.length = 0;
    if (automatic) {
      await h.c.checkpointAll();
      expect(h.c.status).toMatch(refusal);
    } else await expect(h.c.checkpoint(CAST[0]!.castId)).rejects.toThrow(refusal);
    expect(h.requests).toEqual([]);
    expect(h.c.localSave(s)).toBe(before);
    expect(await h.c.store.read()).toBe(before);
    expect(h.c.sources).toEqual([]);
  });

test('dead-terminal and living producers share the refusal before body evaluation, projection, close or put (source control)', () => {
  // This slice has no authored lethal event. This proves the actual shared producer boundary,
  // not played native death; no fake dead Person/body or new lethal scenario is introduced.
  const text = readFileSync(new URL('../src/continuity.ts', import.meta.url), 'utf8');
  const start = text.indexOf('  checkpoint(castId:'),
    end = text.indexOf('  async checkpointAll()', start),
    body = text.slice(start, end);
  const guard = body.indexOf('requireSharedWriteCapability(castId)');
  expect(guard).toBeGreaterThan(0);
  for (const downstream of ['person.body.alive', 'residentTransfer(', 'closePersonaBranch(', "action: 'put'"])
    expect(guard).toBeLessThan(body.indexOf(downstream));
});

test('unknown recovery reads remain inert and native/file same-input continuation stays exact', async () => {
  const h = harness(),
    s = await h.c.fresh(418),
    before = h.c.localSave(s);
  h.requests.length = 0;
  expect(await h.c.recoverPrepared()).toBeNull();
  expect(h.requests).toEqual([]);
  expect(await h.c.store.read()).toBe(before);
  const file = await h.c.importFile(JSON.stringify(h.c.export(s))),
    replay = importRun(exportRun(s));
  for (let i = 0; i < 7; i++) {
    step(file);
    step(replay);
  }
  expect(exportRun(file)).toEqual(exportRun(replay));
  await expect(h.c.checkpoint(CAST[0]!.castId)).rejects.toThrow(/File/);
  expect(h.requests).toEqual([]);
});

// Persisted unknown-intent fixture keeps a complete real native save; it does not
// claim that current code may prepare/forward an entrant or that this candidate can promote.
test('persisted uncertain custody stays read-only and preserves both complete sources', async () => {
  const h = harness(),
    s = await h.c.fresh(418),
    before = h.c.localSave(s),
    p = await parent();
  const id = 'historical-unknown-intent',
    expectedHeads = { [p.castId]: p.revision };
  const pin = await h.c.admissions.stage(
    {
      id,
      source: JSON.stringify(h.c.source()),
      generation: h.c.generation,
      previousRevision: h.c.store.observedRevision,
      expectedHeads,
      claims: [],
      accepted: [],
      nonaccepted: [p.castId],
      rawPrepare: {
        inputs: [],
        blocked: [{ castId: p.castId, reason: 'Historical held source' }],
        expectedHeads,
      },
      candidate: before,
    },
    () => true,
  );
  await h.c.admissions.markForwarded(id, () => true, pin);
  const intent = await h.c.admissions.read(),
    prepared = await h.c.admissions.preparedText();
  h.requests.length = 0;
  await expect(h.c.recoverPrepared()).rejects.toThrow(/custody is unresolved/);
  expect(h.requests.map((r) => r.action)).toEqual(['get']);
  expect(h.writes()).toEqual([]);
  expect(await h.c.admissions.read()).toEqual(intent);
  expect(await h.c.admissions.preparedText()).toBe(prepared);
  expect(await h.c.store.read()).toBe(before);
  expect(h.c.localSave(s)).toBe(before);
});
