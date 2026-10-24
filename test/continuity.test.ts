import { describe, expect, test } from 'vitest';
import { apply, createGame, exportRun, importRun, stateHash, step } from '../src/sim.ts';

describe('pinned whole-cast chapters', () => {
  test('rejects a chapter that does not pin the complete initial roster', () => {
    expect(() =>
      createGame(42, { version: 'commonstead-cast/1', inputs: [], claims: [], initial: {} }),
    ).toThrow();
  });
  test('departure waits for the real running action boundary and replays', () => {
    const s = createGame(42);
    apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
    step(s);
    apply(s, { kind: 'pause-chapter' });
    expect(s.chapterPaused).toBe(false);
    for (let i = 0; i < 50 && !s.chapterPaused; i++) step(s);
    expect(s.chapterPaused).toBe(true);
    expect(s.villagers.every((v) => !v.person.activity)).toBe(true);
    expect(stateHash(importRun(exportRun(s)))).toBe(stateHash(s));
  });
});

// SYNTHETIC adapter/mechanism controls, not browser journeys or human elapsed-life evidence.
import { createPerson } from '@adam0white/human-framework';
import {
  acceptPersona,
  acceptPersonaBatch,
  canonicalCast,
  createPersona,
  initialPersonaLife,
  type Lab,
  lifeAdmission,
  type PersonaEnvelope,
  type PersonaRequest,
  type PersonaShelfState,
  preparePersonaLife,
} from '@adam0white/lab-client';
import { CAST } from '../src/cast.ts';
import { Continuity, resumeForPlay, watchShelfPreference } from '../src/continuity.ts';
import { admitResident, residentTransfer } from '../src/passport.ts';

const clock = 1_790_000_000_000;
async function source(castId = CAST[0]!.castId, peer = false) {
  const cast = canonicalCast(castId);
  const person = createPerson({
    id: peer ? 'nora' : castId,
    name: cast.name,
    sex: cast.name === 'Nora' ? 'female' : 'male',
    seed: 71,
    now: 555,
    bornAt: 555 - cast.age * 525600,
    traits: cast.traits,
    values: cast.values,
    body: { fitness: 0.61 },
  });
  const captured = await residentTransfer(person);
  if (peer) {
    captured.transfer.castPassport = 'workshop-cast/1';
    captured.transfer.sourceRole = 'nora';
    captured.transfer.person.person.mappingVersion = 'workshop-calendar/1';
  }
  return createPersona({
    format: 'hf-persona/1',
    castId,
    castRevision: cast.revision,
    branchId: `control-${castId}`,
    parentRevision: null,
    source: {
      game: peer ? 'repair' : 'commonstead',
      build: 'synthetic-control',
      engine: '2.17.0',
      rules: 'commonstead-3',
    },
    transfer: { ...captured.transfer, life: initialPersonaLife(castId, `control-${castId}`, clock) },
    limitations: captured.limitations,
  });
}
function harness(initial: PersonaEnvelope[] = [], now = clock) {
  let data: PersonaShelfState = { heads: {}, revisions: [] };
  for (const p of initial) data = acceptPersona(data, p);
  let allowed = false;
  let epoch = 'opaque-control-epoch';
  let rotate = false;
  let key: string | null = null;
  let delay: ((value: unknown) => void) | null = null;
  const requests: PersonaRequest[] = [];
  const lab = {
    setPersonaRecording: (value: string | null) => {
      if (key !== value) {
        allowed = value === null;
        key = value;
      }
    },
    allowPersonaRecording: (value: boolean) => {
      allowed = value;
    },
    build: () => ({ c: 'synthetic-control' }),
  } as unknown as Lab;
  const shelf = {
    enabled: true,
    ready: Promise.resolve(true),
    setEnabled(value: boolean) {
      this.enabled = value;
    },
    async request<T>(request: PersonaRequest): Promise<T> {
      requests.push(request);
      if (request.action === 'prepareBatch')
        return {
          expectedHeads: Object.fromEntries(
            (request.castIds ?? []).map((id) => [id, data.heads[id] ?? null]),
          ),
          inputs: (request.castIds ?? []).flatMap((id) => {
            const p = data.revisions.find((p) => p.revision === data.heads[id]);
            return p ? [preparePersonaLife(p, now)] : [];
          }),
          blocked: [],
        } as T;
      if (request.action === 'putBatch') {
        data = acceptPersonaBatch(data, request.envelopes ?? [], request.expectedHeads);
        return null as T;
      }
      if (request.action === 'put') {
        data = acceptPersona(data, request.envelope!, request.fork);
        return null as T;
      }
      if (request.action === 'recordingBatch') {
        if (new Set(request.envelopes?.map((p) => p.castId)).size !== request.envelopes?.length)
          throw new Error('Batch requires distinct cast IDs');
        const response = {
          sameEpoch: request.allowRecording === true,
          revisions: request.envelopes?.map((p) => p.revision) ?? [],
          recordingEpoch: epoch,
        };
        if (request.allowRecording && rotate) {
          rotate = false;
          epoch = 'different-control-epoch';
        }
        if (delay) {
          const release = delay;
          delay = null;
          return await new Promise<T>((resolve) => release(() => resolve(response as T)));
        }
        return response as T;
      }
      return { recordingEpoch: 'opaque-control-epoch' } as T;
    },
  };
  return {
    lab,
    shelf,
    requests,
    get data() {
      return data;
    },
    get allowed() {
      return allowed;
    },
    rotateAfterApproval() {
      rotate = true;
    },
    defer(callback: (resume: unknown) => void) {
      delay = callback;
    },
  };
}

function playedPause(s: ReturnType<typeof createGame>) {
  apply(s, { kind: 'order', ids: ['v1'], target: 'move', x: 500, y: 425 });
  step(s);
  step(s);
  apply(s, { kind: 'pause-chapter' });
  for (let i = 0; i < 40 && !s.chapterPaused; i++) step(s);
}
describe('finite source, batch ownership and recording controls', () => {
  test('two applicable heads claim together and current replay uses full pinned actors', async () => {
    const nora = await source(CAST[0]!.castId, true);
    const samCast = CAST[1]!;
    const samPerson = createPerson({
      id: samCast.castId,
      name: samCast.name,
      sex: 'male',
      seed: 3,
      now: 480,
      bornAt: 480 - samCast.age * 525600,
      traits: samCast.traits,
      values: samCast.values,
      body: { fitness: 0.54 },
    });
    const captured = await residentTransfer(samPerson);
    const { revision: _revision, ...noraBody } = nora;
    const sam = await createPersona({
      ...noraBody,
      castId: samCast.castId,
      branchId: 'control-sam',
      source: { ...nora.source, game: 'commonstead' },
      transfer: { ...captured.transfer, life: initialPersonaLife(samCast.castId, 'control-sam', clock) },
    });
    const h = harness([nora, sam]);
    const c = new Continuity(h.lab, h.shelf);
    const s = await c.fresh(42);
    expect(s.chapter?.inputs).toHaveLength(2);
    expect(s.chapter?.initial[CAST[0]!.castId]?.body.fitness).toBe(0.61);
    expect(s.villagers[0]?.person.rng).toEqual(
      nora.transfer.person && (nora.transfer.person as typeof captured.transfer.person).person.rng,
    );
    expect(h.requests.filter((r) => r.action === 'putBatch')).toHaveLength(1);
    expect(Object.keys(h.requests.find((r) => r.action === 'putBatch')!.expectedHeads!)).toHaveLength(8);
    apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
    step(s);
    expect(stateHash(importRun(exportRun(s)))).toBe(stateHash(s));
    const edited = structuredClone(exportRun(s)) as {
      chapter: { initial: Record<string, { traits: { honesty: number } }> };
    };
    edited.chapter.initial[CAST[0]!.castId]!.traits.honesty = 0.01;
    expect(() => importRun(edited)).toThrow();
  });
  test('unsupported source preflight mutates no head; even absence is checked atomically', async () => {
    const original = await source();
    const { revision: _revision, ...body } = original;
    const invalid = await createPersona({ ...body, source: { ...original.source, game: 'unknown' } });
    const h = harness([invalid]);
    const c = new Continuity(h.lab, h.shelf);
    await expect(c.fresh(42)).rejects.toThrow(/adapter/);
    expect(h.data.heads[original.castId]).toBe(invalid.revision);
    expect(h.requests.some((r) => r.action === 'putBatch')).toBe(false);
    const empty = harness();
    await new Continuity(empty.lab, empty.shelf).fresh(42);
    expect(empty.requests.find((r) => r.action === 'putBatch')?.envelopes).toEqual([]);
  });
  test('nonzero bounded life changes actual opening placement and work availability', async () => {
    const original = await source();
    const prepared = preparePersonaLife(original, clock + 24 * 60 * 60 * 1000);
    const facts = lifeAdmission(prepared, 'commonstead');
    const h = harness([original], prepared.clockMs);
    const c = new Continuity(h.lab, h.shelf);
    const s = await c.fresh(42);
    const v = s.villagers[0]!;
    expect(v.assignment).toBe(facts.assignment);
    expect(v.x).toBe(facts.life.place === 'public-garden' ? 220 : facts.startsAtHome ? 450 : 750);
    expect(v.availableAt).toBe(facts.availableForExtraWork ? 0 : 30);
    apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
    expect(v.order === null).toBe(!facts.availableForExtraWork);
    expect(stateHash(importRun(exportRun(s)))).toBe(stateHash(s));
  });
  test('local reload checkpoints same owned parent, stale chapter conflicts; files keep no ownership', async () => {
    const h = harness();
    const c = new Continuity(h.lab, h.shelf);
    const s = await c.fresh(42);
    playedPause(s);
    await c.checkpoint(CAST[0]!.castId);
    const first = c.heads[0]!;
    const local = c.localSave(s);
    const restored = new Continuity(h.lab, h.shelf);
    const resumed = await restored.loadLocal(local);
    apply(resumed, { kind: 'resume-chapter' });
    step(resumed);
    apply(resumed, { kind: 'pause-chapter' });
    await restored.checkpoint(CAST[0]!.castId);
    expect(restored.heads[0]?.parentRevision).toBe(first.revision);
    await expect(c.checkpoint(CAST[0]!.castId)).rejects.toThrow(/conflict|parent|stale/i);
    const file = new Continuity(h.lab, h.shelf);
    await file.importFile(JSON.stringify(restored.export(resumed)));
    expect(file.heads).toHaveLength(0);
    expect(file.fileOrigin).toBe(true);
    await file.recording();
    expect(h.allowed).toBe(false);
    const reloaded = new Continuity(h.lab, h.shelf);
    await reloaded.loadLocal(file.localSave(resumed));
    expect(reloaded.fileOrigin).toBe(true);
    expect(reloaded.heads).toHaveLength(0);
    expect(JSON.stringify(exportRun(s))).not.toContain('castSources');
    expect((restored.export(resumed) as { castSources: unknown[] }).castSources.length).toBeGreaterThan(0);
  });

  test('actual owned death writes terminal head and cannot be admitted again', async () => {
    const h = harness();
    const c = new Continuity(h.lab, h.shelf);
    const s = await c.fresh(42);
    playedPause(s);
    await c.checkpoint(CAST[0]!.castId);
    // A synthetic death event isolates the host terminal protocol; no browser actor is altered.
    s.villagers[0]!.person.body.alive = false;
    await c.checkpoint(CAST[0]!.castId);
    expect(c.heads[0]?.terminal?.kind).toBe('dead');
    await expect(new Continuity(h.lab, h.shelf).fresh(42)).rejects.toThrow(/closed|dead/i);
  });
});

describe('review regressions', () => {
  test('terminal receipt directly after admission retains local run ownership on reload', async () => {
    const h = harness([await source()]);
    const c = new Continuity(h.lab, h.shelf);
    const s = await c.fresh(42);
    playedPause(s);
    // Synthetic terminal protocol event. Reset the test actor solely to retain a deterministic
    // pre-event replay fixture; the receipt stays closed and is not a played death claim.
    s.villagers[0]!.person.body.alive = false;
    await c.checkpoint(CAST[0]!.castId);
    s.villagers[0]!.person.body.alive = true;
    const restored = new Continuity(h.lab, h.shelf);
    await restored.loadLocal(c.localSave(s));
    expect(restored.heads[0]?.terminal?.kind).toBe('dead');
    expect(restored.heads[0]?.transfer.hostRun).toBe(restored.runId);
    await expect(new Continuity(h.lab, h.shelf).fresh(42)).rejects.toThrow(/closed|dead/i);
  });
});

test('pause alone cannot publish a profile as played source', async () => {
  const h = harness();
  const c = new Continuity(h.lab, h.shelf);
  const s = await c.fresh(42);
  apply(s, { kind: 'pause-chapter' });
  await expect(c.checkpoint(CAST[0]!.castId)).rejects.toThrow(/Play/);
});
test('storm pause is exportable and deterministic at tick600', () => {
  const s = createGame(42);
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  for (let i = 0; i < 600; i++) step(s);
  apply(s, { kind: 'pause-chapter' });
  expect(s.chapterPaused).toBe(true);
  expect(stateHash(importRun(exportRun(s)))).toBe(stateHash(s));
});

describe('finite forwarded Commonstead passport', () => {
  test('Glance may forward Nerys with strict native semantics only', async () => {
    const opening = createGame(42).villagers.find((v) => v.person.id === 'hf.cast.nerys.glance')!.person;
    const captured = await residentTransfer(opening);
    const envelope = await createPersona({
      format: 'hf-persona/1',
      castId: opening.id,
      castRevision: canonicalCast(opening.id).revision,
      branchId: 'synthetic-forward',
      parentRevision: null,
      source: { game: 'glance', build: 'synthetic-control', engine: '2.17.0', rules: 'glance-3' },
      transfer: { ...captured.transfer, life: initialPersonaLife(opening.id, 'synthetic-forward', clock) },
      limitations: captured.limitations,
    });
    const admit = (p: PersonaEnvelope) => admitResident(preparePersonaLife(p, clock), opening);
    const admitted = admit(envelope);
    expect(admitted.rng).toEqual(opening.rng);
    expect(admitted.body.fitness).toBe(opening.body.fitness);
    for (const patch of [
      { source: { ...envelope.source, rules: 'glance-unknown' } },
      { source: { ...envelope.source, game: 'unknown' } },
      { transfer: { ...envelope.transfer, sourceRole: 'nerys' } },
      { transfer: { ...envelope.transfer, castPassport: 'glance-cast/1' } },
      { castId: 'hf.cast.dai.smallworks' },
    ])
      expect(() => admit({ ...envelope, ...patch })).toThrow();
  });
});

test('recording preference changes do not cancel a chapter waiting for the shelf', async () => {
  const h = harness();
  let finish: (value: boolean) => void = () => {};
  h.shelf.ready = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const continuity = new Continuity(h.lab, h.shelf);
  const events = new EventTarget();
  const stop = watchShelfPreference(() => continuity.invalidate(), events);
  const pending = continuity.fresh(42);
  events.dispatchEvent(new Event('hf-lab-preference'));
  events.dispatchEvent(Object.assign(new Event('storage'), { key: 'hf-persona-recording:old-history' }));
  finish(true);
  await expect(pending).resolves.toBeDefined();
  stop();
});

test('browser-person continuity changes still cancel a chapter waiting for the shelf', async () => {
  const h = harness();
  let finish: (value: boolean) => void = () => {};
  h.shelf.ready = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const continuity = new Continuity(h.lab, h.shelf);
  const events = new EventTarget();
  const stop = watchShelfPreference(() => continuity.invalidate(), events);
  const pending = continuity.fresh(42);
  events.dispatchEvent(new Event('hf-persona-preference'));
  finish(true);
  await expect(pending).rejects.toThrow(/changed/i);
  stop();
});

test('recording metadata and checkpoint publication do not query historical recording permission', async () => {
  const h = harness();
  const request = h.shelf.request.bind(h.shelf);
  h.shelf.request = async (r) => {
    if (r.action === 'recording' || r.action === 'recordingBatch') throw new Error('obsolete recording RPC');
    return request(r);
  };
  const c = new Continuity(h.lab, h.shelf);
  const state = await c.fresh(42);
  await c.recording(true);
  await c.deny();
  playedPause(state);
  await c.checkpoint(CAST[0]!.castId);
});

test.each([false, true])(
  'failed admission preserves installed save and receipts; accepted before lost reply: %s',
  async (accepted) => {
    const h = harness([await source()]);
    const c = new Continuity(h.lab, h.shelf);
    const state = await c.fresh(418);
    const saved = c.localSave(state);
    const receipts = structuredClone(c.heads);
    const request = h.shelf.request.bind(h.shelf);
    h.shelf.request = async (r) => {
      if (r.action === 'putBatch') {
        if (accepted) await request(r);
        throw new Error('Accepted reply unavailable');
      }
      return request(r);
    };
    await expect(c.fresh(418)).rejects.toThrow(/Accepted reply unavailable/);
    expect(c.heads).toEqual(receipts);
    expect(c.localSave(state)).toBe(saved);
    expect(h.requests.filter((r) => r.action === 'putBatch')).toHaveLength(accepted ? 2 : 1);
    if (accepted) expect(h.data.heads[receipts[0]!.castId]).not.toBe(receipts[0]!.revision);
  },
);

test('ordinary restore resumes departure-paused and pending chapters through replayed input', () => {
  for (const pending of [false, true]) {
    const state = createGame(418);
    apply(state, { kind: 'order', ids: ['v1'], target: 'wood' });
    step(state);
    apply(state, { kind: 'pause-chapter' });
    if (!pending) for (let i = 0; i < 50 && !state.chapterPaused; i++) step(state);
    const restored = importRun(exportRun(state));
    resumeForPlay(restored);
    const tick = restored.tick;
    step(restored);
    expect(restored.tick).toBe(tick + 1);
    expect(restored.chapterPaused).toBe(false);
    expect(restored.pauseRequested).toBe(false);
    expect(stateHash(importRun(exportRun(restored)))).toBe(stateHash(restored));
  }
});
