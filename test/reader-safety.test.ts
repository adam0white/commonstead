import { readFileSync } from 'node:fs';
import {
  acceptPersona,
  acceptPersonaBatch,
  canonicalCast,
  createPersona,
  initialPersonaLife,
  type Lab,
  type PersonaEnvelope,
  type PersonaRequest,
  type PersonaShelfState,
  preparePersonaLife,
} from '@adam0white/lab-client';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, test } from 'vitest';
import { CAST } from '../src/cast';
import { Continuity } from '../src/continuity';
import { FRAMEWORK_VERSION } from '../src/engine';
import { createFileSession } from '../src/file-session';
import { residentTransfer } from '../src/passport';
import { apply, createGame, exportRun, importRun, step } from '../src/sim';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
async function source() {
  const person = createGame(418).villagers[0]!.person;
  const captured = await residentTransfer(person);
  return createPersona({
    format: 'hf-persona/1',
    castId: person.id,
    castRevision: canonicalCast(person.id).revision,
    branchId: 'reader-control',
    parentRevision: null,
    source: {
      game: 'commonstead',
      build: 'reader-control',
      engine: FRAMEWORK_VERSION,
      rules: 'commonstead-4',
    },
    transfer: { ...captured.transfer, life: initialPersonaLife(person.id, 'reader-control', 1790000000000) },
    limitations: captured.limitations,
  });
}
function harness(parents: PersonaEnvelope[] = []) {
  let data: PersonaShelfState = { heads: {}, revisions: [] };
  for (const p of parents) data = acceptPersona(data, p);
  const requests: PersonaRequest[] = [];
  const lab = { build: () => ({ c: 'reader-control' }), setPersonaRecording: () => {} } as unknown as Lab;
  const shelf = {
    enabled: true,
    ready: Promise.resolve(true),
    setEnabled: () => {},
    async request<T>(r: PersonaRequest): Promise<T> {
      requests.push(r);
      if (r.action === 'prepareBatch')
        return {
          expectedHeads: Object.fromEntries(r.castIds!.map((id) => [id, data.heads[id] ?? null])),
          inputs: r.castIds!.flatMap((id) => {
            const p = data.revisions.find((p) => p.revision === data.heads[id]);
            return p ? [preparePersonaLife(p, 1790000000000)] : [];
          }),
          blocked: [],
        } as T;
      if (r.action === 'get')
        return (data.revisions.find((p) => p.revision === data.heads[r.castId!]) ?? null) as T;
      if (r.action === 'putBatch') {
        data = acceptPersonaBatch(data, r.envelopes ?? [], r.expectedHeads);
        return null as T;
      }
      throw new Error('Unexpected shelf action');
    },
  };
  return { c: new Continuity(lab, shelf), requests, shelf, data: () => data };
}
function pause(s: ReturnType<typeof createGame>) {
  step(s);
  apply(s, { kind: 'pause-chapter' });
  while (!s.chapterPaused && s.tick < 80) step(s);
}
test('skipped identity has durable denial authority before any departure, checkpoint or fork', async () => {
  const p = await source(),
    h = harness([p]),
    before = JSON.stringify(h.data());
  const s = await h.c.fresh(418);
  expect(JSON.stringify(h.data())).toBe(before);
  const saved = JSON.parse((await h.c.store.read())!);
  expect(saved.deniedIDs).toEqual([p.castId]);
  expect(saved.run.chapter.inputs).toEqual([]);
  expect(JSON.stringify(saved)).not.toContain(p.revision);
  expect(h.requests[1]!.expectedHeads).toEqual(
    Object.fromEntries(CAST.map((c) => [c.castId, c.castId === p.castId ? p.revision : null])),
  );
  pause(s);
  expect(() => h.c.departure(s, 'v1')).toThrow(/Nora.*history/);
  await expect(h.c.checkpoint(p.castId, true)).rejects.toThrow(/Nora.*history/);
  const reloaded = harness();
  const restored = await reloaded.c.loadLocal(h.c.localSave(s));
  expect(() => reloaded.c.departure(restored, 'v1')).toThrow(/Nora.*history/);
  const replay = importRun(exportRun(s));
  step(s);
  step(replay);
  expect(exportRun(replay)).toEqual(exportRun(s));
});
test('old save without denial authority remains playable but cannot prepare publication', async () => {
  const h = harness(),
    s = await h.c.fresh(418);
  pause(s);
  const old = JSON.parse(h.c.localSave(s));
  delete old.deniedIDs;
  const loaded = await h.c.loadLocal(JSON.stringify(old));
  expect(() => h.c.departure(loaded, 'v1')).toThrow(/authority/);
});
test('malformed denial metadata refuses before replacing held state', async () => {
  const h = harness(),
    s = await h.c.fresh(418),
    before = h.c.localSave(s);
  for (const deniedIDs of [null, ['unknown'], [CAST[0]!.castId, CAST[0]!.castId], 3]) {
    await expect(h.c.loadLocal(JSON.stringify({ ...JSON.parse(before), deniedIDs }))).rejects.toThrow(
      /history|denial/i,
    );
    expect(h.c.localSave(s)).toBe(before);
  }
});

for (const kind of ['portable-v1', 'unknown999', 'occupied'])
  test(`actual SDK ${kind} preparation preserves all unowned data through useful input, native and file replay`, async () => {
    const [fixture] = JSON.parse(
      readFileSync(new URL('./fixtures/days-burak-hf-4.0.0.json', import.meta.url), 'utf8'),
    );
    const { revision: _revision, ...body } = fixture;
    if (kind === 'unknown999') {
      body.transfer.castPassport = 'hf-portable-person/999';
      body.transfer.portable.version = 999;
    }
    if (kind === 'occupied') body.transfer.portableClaim = { game: 'days' };
    const p = await createPersona(body),
      h = harness([p]),
      shelfBefore = JSON.stringify(h.data());
    const s = await h.c.fresh(418);
    apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
    for (let i = 0; i < 4; i++) step(s);
    const exported = h.c.export(s) as Record<string, unknown>;
    expect((exported.inputs as unknown[]).length).toBeGreaterThan(0);
    const { castSources: _sources, castDeniedIDs: _denials, ...native } = exported;
    const restored = importRun(native);
    expect(exportRun(restored)).toEqual(exportRun(s));
    const next = { kind: 'order', ids: ['v2'], target: 'stone' } as const;
    apply(s, { ...next, ids: [...next.ids] });
    apply(restored, { ...next, ids: [...next.ids] });
    step(s);
    step(restored);
    expect(exportRun(restored)).toEqual(exportRun(s));
    const saved = h.c.localSave(s);
    await h.c.store.write(saved);
    const file = createFileSession();
    const bytes = JSON.stringify(h.c.export(s));
    expect(await file.select(new File([bytes], 'reader.json'))).toBe(true);
    expect(file.snapshot()?.castDeniedIDs).toEqual([p.castId]);
    expect(new TextDecoder().decode(file.original()!.bytes)).toBe(bytes);
    file.resume();
    file.advance(1);
    expect(await h.c.store.read()).toBe(saved);
    const imported = await h.c.importFile(bytes);
    expect(h.c.fileOrigin).toBe(true);
    expect(h.c.heads).toEqual([]);
    await expect(h.c.checkpoint(p.castId)).rejects.toThrow(/File/);
    expect(exportRun(imported)).toEqual(exportRun(s));
    expect(JSON.stringify(h.data())).toBe(shelfBefore);
    expect(JSON.stringify(file.snapshot())).not.toContain(p.revision);
  });

test('lost empty-claim reply retains previous save and denial-only preparation without copying unowned histories', async () => {
  const p = await source(),
    h = harness([p]);
  const previous = createGame(419);
  const prior = JSON.stringify({
    run: exportRun(previous),
    runId: 'previous',
    fileOrigin: false,
    heads: [],
    sources: [],
    deniedIDs: [],
  });
  await h.c.store.write(prior);
  const request = h.shelf.request.bind(h.shelf);
  h.shelf.request = async (r) => {
    if (r.action === 'putBatch') throw new Error('Synthetic lost reply');
    return request(r);
  };
  await expect(h.c.fresh(418)).rejects.toThrow(/lost reply/);
  expect(await h.c.store.read()).toBe(prior);
  const intent = await h.c.admissions.read();
  if (!intent) throw new Error('Missing held preparation');
  expect(intent.phase).toBe('forwarded');
  expect((intent.rawPrepare as { inputs?: unknown }).inputs).toBeUndefined();
  expect(JSON.parse((await h.c.admissions.preparedText())!).deniedIDs).toEqual([p.castId]);
});

test('unknown file denial metadata preserves native ownership, save and held file bytes', async () => {
  const h = harness(),
    s = await h.c.fresh(418),
    saved = h.c.localSave(s);
  await h.c.store.write(saved);
  const file = createFileSession(),
    raw = h.c.export(s),
    original = JSON.stringify(raw);
  await file.select(new File([original], 'original.json'));
  for (const castDeniedIDs of [null, ['unknown'], [CAST[0]!.castId, CAST[0]!.castId]]) {
    const malformed = JSON.stringify({ ...raw, castDeniedIDs });
    await expect(file.select(new File([malformed], 'invalid.json'))).rejects.toThrow(/denial/);
    await expect(h.c.importFile(malformed)).rejects.toThrow(/denial/);
    expect(new TextDecoder().decode(file.original()!.bytes)).toBe(original);
    expect(h.c.fileOrigin).toBe(false);
    expect(h.c.localSave(s)).toBe(saved);
    expect(await h.c.store.read()).toBe(saved);
  }
});

test('incomplete actual preparation refuses before atomic write or candidate activation', async () => {
  const h = harness(),
    s = await h.c.fresh(418),
    saved = h.c.localSave(s);
  await h.c.store.write(saved);
  h.requests.length = 0;
  const request = h.shelf.request.bind(h.shelf);
  h.shelf.request = async <T>(r: PersonaRequest): Promise<T> => {
    const result = await request<{ expectedHeads: Record<string, string | null> }>(r);
    if (r.action === 'prepareBatch') delete result.expectedHeads[CAST[0]!.castId];
    return result as T;
  };
  await expect(h.c.fresh(419)).rejects.toThrow(/metadata/);
  expect(h.requests.map((r) => r.action)).toEqual(['prepareBatch']);
  expect(await h.c.admissions.read()).toBeNull();
  expect(h.c.localSave(s)).toBe(saved);
  expect(await h.c.store.read()).toBe(saved);
});

test('actual SDK empty CAS lost reply can be explicitly cleared, preserving the old save, then retried fresh', async () => {
  const p = await source(),
    h = harness([p]);
  const old = await h.c.fresh(419),
    previous = h.c.localSave(old);
  await h.c.store.write(previous);
  const shelfBefore = JSON.stringify(h.data()),
    request = h.shelf.request.bind(h.shelf);
  let lose = true;
  h.shelf.request = async <T>(r: PersonaRequest): Promise<T> => {
    const result = await request<T>(r);
    if (r.action === 'putBatch' && lose) {
      lose = false;
      throw new Error('Synthetic lost empty CAS reply');
    }
    return result;
  };
  await expect(h.c.fresh(418)).rejects.toThrow(/lost empty CAS reply/);
  const intent = await h.c.admissions.read();
  expect(intent?.claims).toEqual([]);
  expect(intent?.accepted).toEqual([]);
  expect(intent?.phase).toBe('forwarded');
  const heads = Object.fromEntries(CAST.map((c) => [c.castId, c.castId === p.castId ? p : null]));
  expect(await h.c.admissions.recover(heads)).toBe('unclaimed');
  expect(await h.c.store.read()).toBe(previous);
  h.requests.length = 0;
  expect(await h.c.discardUnused()).toBe(true);
  expect(h.requests.map((r) => r.action)).toEqual(CAST.map(() => 'get'));
  expect(await h.c.admissions.read()).toBeNull();
  expect(await h.c.store.read()).toBe(previous);
  expect(JSON.stringify(h.data())).toBe(shelfBefore);
  expect(h.c.localSave(old)).toBe(previous);
  const next = await h.c.fresh(418);
  expect(next.tick).toBe(0);
  expect(await h.c.admissions.read()).toBeNull();
  expect(JSON.parse((await h.c.store.read())!).run).toEqual(exportRun(next));
  expect(JSON.stringify(h.data())).toBe(shelfBefore);
});
