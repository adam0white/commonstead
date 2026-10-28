import { describe, expect, test, vi } from 'vitest';
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
  admitPortablePerson,
  canonicalCast,
  createPersona,
  initialPersonaLife,
  type Lab,
  lifeAdmission,
  type PersonaEnvelope,
  type PersonaRequest,
  type PersonaShelfState,
  preparePersonaLife,
  validatePortablePerson,
} from '@adam0white/lab-client';
import { CAST } from '../src/cast.ts';
import { Continuity, resumeForPlay, watchShelfPreference } from '../src/continuity.ts';
import { assignmentText } from '../src/display.ts';
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
  test('a rejected later selection invalidates an earlier file read without replacing native ownership', async () => {
    const h = harness();
    const continuity = new Continuity(h.lab, h.shelf);
    const native = await continuity.fresh(418);
    const original = continuity.localSave(native);
    const older = continuity.beginEntry();
    let release: (text: string) => void = () => {};
    const read = new Promise<string>((resolve) => {
      release = resolve;
    });
    const pending = read.then((text) => continuity.importFile(text, older));
    const later = continuity.beginEntry();
    await expect(continuity.importFile('{', later)).rejects.toThrow();
    release(JSON.stringify(exportRun(createGame(7))));
    await expect(pending).rejects.toThrow(/changed/);
    expect(continuity.localSave(native)).toBe(original);
  });
  test('unsupported local origins retain playable local residents without pretending to own shelf people', async () => {
    vi.stubGlobal('location', { origin: 'http://127.0.0.1:5273' });
    try {
      const h = harness([await source()]);
      h.shelf.enabled = false;
      h.shelf.request = vi.fn().mockRejectedValue(new Error('Continuity is local to this game. Use a file.'));
      const state = await new Continuity(h.lab, h.shelf).fresh(418);
      expect(h.shelf.enabled).toBe(true);
      expect(state.chapter).toBeNull();
      expect(h.requests).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  test('ordinary new chapters admit available browser people when the shelf is enabled', async () => {
    const h = harness([await source()]);
    const continuity = new Continuity(h.lab, h.shelf);
    const state = await continuity.fresh(418);
    expect(h.shelf.enabled).toBe(true);
    expect(state.chapter?.inputs).toHaveLength(1);
    expect(stateHash(importRun(exportRun(state)))).toBe(stateHash(state));
  });
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
    expect(c.source().engine).toBe('2.23.0');
    expect(s.chapter?.claims.every((p) => p.source.engine === '2.23.0')).toBe(true);
    expect(s.villagers.every((v) => v.person.lexicon?.plainEnglish === true)).toBe(true);
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
    await expect(c.fresh(42)).rejects.toThrow(/cannot carry over/);
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
    expect(v.assignment).toBe(assignmentText(facts.assignment, v.name));
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
  test.each(['2.17.0', '2.21.0'])(
    'Glance engine %s may forward Nerys with strict native semantics only',
    async (engine) => {
      const opening = createGame(42).villagers.find((v) => v.person.id === 'hf.cast.nerys.glance')!.person;
      const captured = await residentTransfer(opening);
      const envelope = await createPersona({
        format: 'hf-persona/1',
        castId: opening.id,
        castRevision: canonicalCast(opening.id).revision,
        branchId: 'synthetic-forward',
        parentRevision: null,
        source: { game: 'glance', build: 'synthetic-control', engine, rules: 'glance-3' },
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
    },
  );
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

// Generated by the actual Repair createPeople/workshopTransfer producers at 83dc661.
// The envelope is a local control, not a browser ownership receipt.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonicalPersona } from '@adam0white/lab-client';

test('admits a real published 2.21.0 Repair Nora source without relaxing its finite dialect', () => {
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/repair-nora-hf-2.21.0.json', import.meta.url), 'utf8'),
  );
  const envelope = fixture.envelope as PersonaEnvelope;
  const opening = createGame(42).villagers[0]!.person;
  expect(fixture.raw.engine).toBe('2.21.0');
  expect(envelope.source.engine).toBe('2.21.0');
  expect(fixture.envelope.transfer.person.person.source.engine).toBe('2.21.0');
  expect(createHash('sha256').update(canonicalPersona(fixture.raw)).digest('hex')).toBe(
    (envelope.transfer.checkpoint as { sha256: string }).sha256,
  );
  const admit = (p: PersonaEnvelope) => admitResident(preparePersonaLife(p, clock), opening);
  const person = admit(envelope);
  const wrongMapping = structuredClone(fixture.envelope);
  wrongMapping.transfer.person.person.mappingVersion = 'unknown-calendar/1';
  expect(() => admit(wrongMapping)).toThrow();
  expect(person.id).toBe(opening.id);
  expect(person.lexicon?.plainEnglish).toBe(true);
  expect(person.rng).toEqual(fixture.raw.rng);
  for (const patch of [
    { source: { ...envelope.source, engine: '9.99.0' } },
    { transfer: { ...envelope.transfer, sourceRole: 'sam' } },
    { transfer: { ...envelope.transfer, castPassport: 'unknown/1' } },
    { castId: 'hf.cast.sam.smallworks' },
  ])
    expect(() => admit({ ...envelope, ...patch })).toThrow();
});

// Actual Small Works producer at signed8002352, legal pause and exact notebook replay.
test('preserves actual HF3 Small Works Nora obligations by refusing the unsupported foreign tuple', async () => {
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/repair-nora-hf-3.0.0.json', import.meta.url), 'utf8'),
  );
  expect(createHash('sha256').update(canonicalPersona(fixture.raw)).digest('hex')).toBe(
    fixture.transfer.checkpoint.sha256,
  );
  expect(fixture.transfer.person.calendar.commitments).toEqual(
    expect.arrayContaining([expect.objectContaining({ actions: ['personal'], status: 'pending' })]),
  );
  const castId = 'hf.cast.nora.smallworks';
  const envelope = await createPersona({
    format: 'hf-persona/1',
    castId,
    castRevision: canonicalCast(castId).revision,
    branchId: 'actual-hf3-source-control',
    parentRevision: null,
    source: fixture.source,
    transfer: { ...fixture.transfer, life: initialPersonaLife(castId, 'actual-hf3-source-control', clock) },
    limitations: fixture.limitations,
  });
  const opening = createGame(42).villagers[0]?.person;
  if (!opening) throw new Error('Missing Nora opening');
  const admit = (p: PersonaEnvelope) => admitResident(preparePersonaLife(p, clock), opening);
  expect(() => admit(envelope)).toThrow(/source/);
  for (const source of [
    { ...envelope.source, rules: 'unknown' },
    { ...envelope.source, game: 'glance', rules: 'glance-3' },
  ])
    expect(() => admit({ ...envelope, source })).toThrow();
});

test('two successive current Commonstead claims retain an actual historical workshop donor', async () => {
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/repair-nora-hf-2.21.0.json', import.meta.url), 'utf8'),
  );
  const h = harness([fixture.envelope]);
  const first = await new Continuity(h.lab, h.shelf).fresh(42);
  expect(first.chapter?.claims[0]?.source.engine).toBe('2.23.0');
  expect(first.chapter?.claims[0]?.transfer.castPassport).toBe('workshop-cast/1');
  expect(importRun(exportRun(first))).toEqual(first);
  const second = await new Continuity(h.lab, h.shelf).fresh(42);
  expect(second.chapter?.inputs[0]?.parent.revision).toBe(first.chapter?.claims[0]?.revision);
  expect(second.chapter?.claims[0]?.transfer.person).toEqual(fixture.envelope.transfer.person);
  expect(importRun(exportRun(second))).toEqual(second);
  const claim = first.chapter?.claims[0];
  const opening = createGame(42).villagers[0]?.person;
  if (!claim || !opening) throw new Error('Missing admitted Nora');
  const wrongRules = { ...claim, source: { ...claim.source, rules: 'unknown' } };
  expect(() => admitResident(preparePersonaLife(wrongRules, clock), opening)).toThrow();
});

// Actual Glance4 producer: host minute1330, untouched Person minute1329.
test('admits actual Glance4 Nerys and preserves successive own claims with strict finite metadata', async () => {
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/glance-nerys-hf-3.0.0.json', import.meta.url), 'utf8'),
  );
  const envelope = fixture.envelope as PersonaEnvelope;
  const sourceClock = fixture.envelope.transfer.life.clock.watermark * 3_600_000;
  expect(createHash('sha256').update(canonicalPersona(fixture.raw)).digest('hex')).toBe(
    (envelope.transfer.checkpoint as { sha256: string }).sha256,
  );
  const h = harness([envelope], sourceClock);
  const first = await new Continuity(h.lab, h.shelf).fresh(42);
  const nerys = first.villagers.find((v) => v.person.id === envelope.castId)?.person;
  if (!nerys) throw new Error('Missing Nerys');
  expect(nerys.rng).toEqual(fixture.raw.rng);
  expect(nerys.traits).toEqual(fixture.raw.traits);
  expect(nerys.values).toEqual(fixture.raw.values);
  expect(nerys.body.fitness).toBe(fixture.raw.body.fitness);
  expect(nerys.now - nerys.life.bornAt).toBe(fixture.raw.now - fixture.raw.life.bornAt);
  expect(importRun(exportRun(first))).toEqual(first);
  const second = await new Continuity(h.lab, h.shelf).fresh(42);
  expect(second.chapter?.inputs[0]?.parent.revision).toBe(first.chapter?.claims[0]?.revision);
  expect(importRun(exportRun(second))).toEqual(second);
  const opening = createGame(42).villagers.find((v) => v.person.id === envelope.castId)?.person;
  if (!opening) throw new Error('Missing Nerys opening');
  const admit = (p: PersonaEnvelope) => admitResident(preparePersonaLife(p, sourceClock), opening);
  for (const patch of [
    { source: { ...envelope.source, rules: 'glance-3' } },
    { source: { ...envelope.source, engine: '2.21.0' } },
    { source: { ...envelope.source, game: 'unknown' } },
    { transfer: { ...envelope.transfer, castPassport: 'unknown/1' } },
    { transfer: { ...envelope.transfer, sourceRole: 'dai' } },
    { castId: 'hf.cast.dai.smallworks' },
  ])
    expect(() => admit({ ...envelope, ...patch })).toThrow();
  const changes: [string[], unknown][] = [
    [['person', 'mappingVersion'], 'unknown/1'],
    [['person', 'source', 'engine'], '2.21.0'],
    [['person', 'health', 'health'], 0.5],
    [
      ['calendar', 'norms'],
      [
        ...fixture.envelope.transfer.person.calendar.norms,
        { id: 'unknown', label: 'unknown', standing: 'obligatory', sources: [] },
      ],
    ],
    [
      ['calendar', 'commitments'],
      [
        {
          id: 'unsupported',
          kind: 'promise',
          actions: ['personal'],
          from: 1329,
          until: 1400,
          importance: 0.5,
          status: 'pending',
        },
      ],
    ],
  ];
  for (const [path, value] of changes) {
    const changed = structuredClone(envelope);
    let cursor = changed.transfer.person as Record<string, unknown>;
    for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
    cursor[path.at(-1) ?? ''] = value;
    expect(() => admit(changed)).toThrow();
  }
});

test.each(['settlement-day/1', 'settlement-replies/1', 'settlement-replies/2'] as const)(
  'native %s admits, keeps prayer duties, publishes only at a real boundary and admits its departure',
  async (edition) => {
    const h = harness([await source()]),
      c = new Continuity(h.lab, h.shelf);
    const s = await c.fresh(42, { edition });
    expect(s.chapter?.inputs).toHaveLength(1);
    expect(s.villagers[0]!.person.body.fitness).toBe(0.61);
    step(s);
    apply(s, { kind: 'pause-chapter' });
    while (!s.chapterPaused && !s.ended) step(s);
    const before = h.data.heads[CAST[0]!.castId];
    await expect(c.checkpoint(CAST[0]!.castId)).rejects.toThrow(/obligation/);
    expect(h.data.heads[CAST[0]!.castId]).toBe(before);
    apply(s, { kind: 'resume-chapter' });
    while (!s.ended) step(s);
    await c.checkpoint(CAST[0]!.castId);
    const departure = c.heads.find((p) => p.castId === CAST[0]!.castId)!;
    expect(departure.parentRevision).toBe(before);
    expect(c.sources[0]!.snapshot).toEqual(s.villagers[0]!.person);
    for (const compact of [false, true]) {
      const raw = c.export(s, compact);
      expect(await new Continuity(h.lab, h.shelf).importFile(JSON.stringify(raw))).toEqual(s);
      const file = (await import('../src/file-session.ts')).createFileSession();
      expect(await file.select(new File([JSON.stringify(raw)], 'day.json'))).toBe(true);
      expect(file.snapshot()!.castSources).toEqual(c.sources);
    }
    const loaded = new Continuity(h.lab, h.shelf);
    expect(await loaded.loadLocal(c.localSave(s))).toEqual(s);
    const next = await new Continuity(h.lab, h.shelf).fresh(43, { edition });
    expect(next.chapter?.inputs[0]?.parent.revision).toBe(departure.revision);
    const files = new Continuity(h.lab, h.shelf);
    await files.importFile(JSON.stringify(c.export(s)));
    await expect(files.checkpoint(CAST[0]!.castId)).rejects.toThrow(/File/);
    expect(files.heads).toEqual([]);
  },
  20_000, // A full1800-tick day plus full/compact replay on the shared host.
);

test('short yield retains actual admitted Repair Nora and run metadata and publishes a real paused departure for the next native admission', async () => {
  // Actual public producer fixture; this harness is not a browser ownership receipt.
  // No joint admitted Nora/Sevim fixture is available in this repository.
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/repair-nora-hf-2.21.0.json', import.meta.url), 'utf8'),
  );
  const h = harness([fixture.envelope]);
  const c = new Continuity(h.lab, h.shelf);
  const s = await c.fresh(42, undefined, null);
  expect(s.chapter?.inputs[0]?.parent.revision).toBe(fixture.envelope.revision);
  c.sources = [
    { revision: fixture.envelope.revision, source: fixture.envelope.source, snapshot: fixture.raw },
  ];
  const provenance = structuredClone({
    runId: c.runId,
    heads: c.heads,
    sources: c.sources,
    fileOrigin: c.fileOrigin,
    chapter: s.chapter,
  });
  const ids = s.villagers.map((v) => v.id);
  while (s.tick < 30) step(s); // Retain the admitted resident's existing responsibility.
  apply(s, { kind: 'order', ids, target: 'wood' });
  while (s.resources.wood < 180 && s.tick < 180) step(s);
  apply(s, { kind: 'order', ids, target: 'stone' });
  while (s.resources.stone < 120 && s.tick < 300) step(s);
  apply(s, { kind: 'build', ids, building: 'storehouse', x: 600, y: 450 });
  while (!s.buildings.some((b) => b.kind === 'storehouse' && b.complete) && s.tick < 599) step(s);
  const passive = structuredClone(s);
  const prefix = structuredClone(s.inputs);
  apply(s, { kind: 'yield-day' });
  expect(s.inputs.slice(0, -1)).toEqual(prefix);
  expect({
    runId: c.runId,
    heads: c.heads,
    sources: c.sources,
    fileOrigin: c.fileOrigin,
    chapter: s.chapter,
  }).toEqual(provenance);
  for (let i = 0; i < 12; i++) {
    step(s);
    step(passive);
  }
  const { shortYield: _extension, ...ordinary } = s;
  expect({ ...ordinary, inputs: ordinary.inputs.filter((i) => i.command.kind !== 'yield-day') }).toEqual(
    passive,
  );
  apply(s, { kind: 'pause-chapter' });
  while (!s.chapterPaused && !s.ended) step(s);
  const saved = c.localSave(s, true);
  const restoredOwner = new Continuity(h.lab, h.shelf);
  const resumed = await restoredOwner.loadLocal(saved);
  expect(resumed).toEqual(s);
  expect(restoredOwner.playPaused).toBe(true);
  expect({
    runId: restoredOwner.runId,
    heads: restoredOwner.heads,
    sources: restoredOwner.sources,
    fileOrigin: restoredOwner.fileOrigin,
    chapter: resumed.chapter,
  }).toEqual(provenance);
  resumeForPlay(resumed);
  expect(resumed).toEqual(s); // Loading must not bypass the recorded action boundary.
  const raw = c.export(s);
  // Reviewer control: JSON overflow must refuse this admitted-Nora archive before Shelf access.
  const overflow = structuredClone(raw) as { castSources: { snapshot: unknown }[] };
  overflow.castSources[0]!.snapshot = { sourceValue: 1 };
  const overflowText = JSON.stringify(overflow).replace('"sourceValue":1', '"sourceValue":1e400');
  expect(JSON.parse(overflowText).castSources[0].snapshot.sourceValue).toBe(Infinity);
  let shelfAccess = 0;
  const refusingShelf = new Proxy(h.shelf, {
    get() {
      shelfAccess++;
      throw new Error('Unexpected Shelf access');
    },
  });
  const refused = new Continuity(h.lab, refusingShelf);
  const beforeRefusal = structuredClone({ heads: refused.heads, sources: refused.sources });
  await expect(refused.importFile(overflowText)).rejects.toThrow(/Invalid source number/);
  expect(shelfAccess).toBe(0);
  expect({ heads: refused.heads, sources: refused.sources }).toEqual(beforeRefusal);
  expect(c.sources).toEqual(provenance.sources);
  const file = new Continuity(h.lab, h.shelf);
  expect(await file.importFile(JSON.stringify(raw))).toEqual(s);
  expect(file.sources).toEqual(c.sources);
  expect(file.fileOrigin).toBe(true);
  expect(file.heads).toEqual([]); // Native files never grant browser ownership.
  const compactFile = new Continuity(h.lab, h.shelf);
  expect(
    await compactFile.importFile(
      JSON.stringify({ ...(exportRun(s, true) as object), castSources: c.sources }),
    ),
  ).toEqual(s);
  const prior = c.heads[0]!.revision;
  h.requests.length = 0;
  await c.checkpoint(CAST[0]!.castId);
  expect(c.heads[0]!.parentRevision).toBe(prior);
  const next = await new Continuity(h.lab, h.shelf).fresh(43);
  expect(next.chapter?.inputs[0]?.parent.revision).toBe(c.heads[0]!.revision);
  await expect(file.importFile(JSON.stringify({ ...raw, castSources: [{ unknown: true }] }))).rejects.toThrow(
    /source/,
  );
  await expect(file.importFile(JSON.stringify({ ...raw, unknown: true }))).rejects.toThrow(/not loaded/);
  apply(resumed, { kind: 'resume-chapter' });
  const full = importRun(exportRun(resumed));
  const compact = importRun(exportRun(resumed, true));
  while (!resumed.ended) {
    step(resumed);
    step(full);
    step(compact);
  }
  expect(full).toEqual(resumed);
  expect(compact).toEqual(resumed);
  expect(resumed.villagers[0]?.person.id).toBe('hf.cast.nora.smallworks');
}, 20_000); // Full recorded yield and multiple native replays.

// Synthetic native sources and SDK reducer only; these are not browser transfer receipts.
test('refuses complete next source capacity before public put and preserves the whole save', async () => {
  const h = harness();
  const changed = vi.fn();
  const c = new Continuity(h.lab, h.shelf, changed);
  let state = await c.fresh(42);
  playedPause(state);
  await c.checkpoint(CAST[0]!.castId);
  const prior = c.sources[0]!;
  prior.snapshot = { complete: prior.snapshot, padding: '' };
  (prior.snapshot as { padding: string }).padding = '界'.repeat(1_000_000 - JSON.stringify(c.sources).length);
  expect(JSON.stringify(c.sources).length).toBe(1_000_000);
  state = await c.loadLocal(c.localSave(state));
  const before = c.localSave(state);
  const world = JSON.stringify(state);
  const shelf = structuredClone(h.data);
  const puts = h.requests.filter((r) => r.action === 'put').length;
  changed.mockClear();
  await expect(c.checkpoint(CAST[0]!.castId)).rejects.toThrow(/archive|capacity/i);
  expect(c.localSave(state)).toBe(before);
  expect(JSON.stringify(state)).toBe(world);
  expect(h.data).toEqual(shelf);
  expect(h.requests.filter((r) => r.action === 'put')).toHaveLength(puts);
  expect(changed).not.toHaveBeenCalled();
});
test('refuses the 101st complete source even when serialized size fits', async () => {
  const h = harness();
  const c = new Continuity(h.lab, h.shelf);
  const state = await c.fresh(42);
  playedPause(state);
  await c.checkpoint(CAST[0]!.castId);
  c.sources = Array.from({ length: 99 }, () => structuredClone(c.sources[0]!));
  await c.checkpoint(CAST[0]!.castId);
  expect(c.sources).toHaveLength(100);
  expect(JSON.stringify(c.sources).length).toBeLessThan(1_000_000);
  const before = c.localSave(state);
  const puts = h.requests.filter((r) => r.action === 'put').length;
  await expect(c.checkpoint(CAST[0]!.castId)).rejects.toThrow(/archive|capacity/i);
  expect(c.localSave(state)).toBe(before);
  expect(h.requests.filter((r) => r.action === 'put')).toHaveLength(puts);
});
test('retains complete failed CAS source while archive fits without changing heads or world', async () => {
  const h = harness();
  const c = new Continuity(h.lab, h.shelf);
  const state = await c.fresh(42);
  playedPause(state);
  await c.checkpoint(CAST[0]!.castId);
  const before = structuredClone(c.sources);
  const heads = structuredClone(c.heads);
  const world = JSON.stringify(state);
  const request = h.shelf.request;
  h.shelf.request = async <T>(r: PersonaRequest): Promise<T> => {
    if (r.action === 'put') throw new Error('synthetic CAS conflict');
    return request<T>(r);
  };
  await expect(c.checkpoint(CAST[0]!.castId)).rejects.toThrow('CAS conflict');
  expect(c.sources.slice(0, -1)).toEqual(before);
  expect(c.sources.at(-1)?.snapshot).toEqual(JSON.parse(JSON.stringify(state.villagers[0]!.person)));
  expect(c.heads).toEqual(heads);
  expect(JSON.stringify(state)).toBe(world);
});
test('a rejected put releases native entry and a deferred preference change cancels the remaining batch', async () => {
  const h = harness(),
    c = new Continuity(h.lab, h.shelf);
  const state = await c.fresh(42);
  playedPause(state);
  const started = Promise.withResolvers<void>(),
    result = Promise.withResolvers<never>();
  const request = h.shelf.request;
  h.shelf.request = async <T>(r: PersonaRequest): Promise<T> => {
    if (r.action !== 'put') return request<T>(r);
    h.requests.push(r);
    started.resolve();
    return result.promise;
  };
  const pending = c.checkpointAll();
  await started.promise;
  expect(() => c.clear()).toThrow(/Wait/);
  c.invalidate();
  result.reject(new Error('old put failed'));
  await pending;
  expect(c.publishing).toBe(false);
  expect(h.requests.filter((r) => r.action === 'put')).toHaveLength(1);
  expect(c.heads).toEqual([]);
  c.clear();
  const next = await c.fresh(43);
  expect(next.seed).toBe(43);
});
test('file-origin chapters cannot publish even after played pause', async () => {
  const h = harness();
  const c = new Continuity(h.lab, h.shelf);
  const state = createGame(42);
  playedPause(state);
  const file = await c.importFile(JSON.stringify(exportRun(state)));
  const before = c.localSave(file);
  await expect(c.checkpoint(CAST[0]!.castId)).rejects.toThrow(/file/i);
  expect(c.localSave(file)).toBe(before);
  expect(h.requests).toHaveLength(0);
});

test('a changed callback cancelling source staging prevents public put', async () => {
  const h = harness();
  const c = new Continuity(h.lab, h.shelf);
  const state = await c.fresh(42);
  playedPause(state);
  let armed = true;
  Object.assign(c, {
    changed: () => {
      if (armed) {
        armed = false;
        c.clear();
      }
    },
  });
  await expect(c.checkpoint(CAST[0]!.castId)).rejects.toThrow(/changed/);
  expect(h.requests.some((r) => r.action === 'put')).toBe(false);
  expect(c.sources).toEqual([]);
  expect(c.heads).toEqual([]);
});

test('a played Burak checkpoint publishes portable state and survives admission and replay', async () => {
  const h = harness();
  const first = new Continuity(h.lab, h.shelf);
  const played = await first.fresh(418);
  playedPause(played);
  expect(played.chapterPaused).toBe(true);
  const burak = CAST.find((c) => c.name === 'Burak')!;
  await first.checkpoint(burak.castId);
  const saved = h.data.revisions.find((p) => p.revision === h.data.heads[burak.castId])!;
  expect(saved.transfer.castPassport).toBe('hf-portable-person/1');
  const second = await new Continuity(h.lab, h.shelf).fresh(418);
  const claim = second.chapter?.claims[0];
  if (!claim || !second.chapter) throw new Error('Missing Burak claim');
  expect(claim.transfer.castPassport).toBe('hf-portable-person/1');
  expect(validatePortablePerson(claim.transfer.portable).source.game).toBe('commonstead');
  expect(validatePortablePerson(claim.transfer.portable).history).toEqual(
    validatePortablePerson(saved.transfer.portable).history,
  );
  expect(importRun(exportRun(second))).toEqual(second);
  const damaged = structuredClone(second.chapter);
  const portable = validatePortablePerson(damaged.claims[0]!.transfer.portable);
  portable.state.traits.honesty = portable.state.traits.honesty === 0 ? 1 : 0;
  damaged.claims[0]!.transfer.portable = portable;
  expect(() => createGame(418, damaged)).toThrow();
});

// Actual Days play and quiet checkpoint, including paid bill and confirmed visit.
test('admits played Days Burak and claims the admitted Commonstead actor with prior history', async () => {
  const ancestry = JSON.parse(
    readFileSync(new URL('./fixtures/days-burak-hf-4.0.0.json', import.meta.url), 'utf8'),
  ) as PersonaEnvelope[];
  const envelope = ancestry[ancestry.length - 1];
  if (!envelope) throw new Error('Missing Days checkpoint');
  expect(envelope.source.engine).toBe('4.0.0');
  const life = envelope.transfer.life as { clock: { watermark: number } };
  const h = harness(ancestry, life.clock.watermark * 3_600_000);
  const c = new Continuity(h.lab, h.shelf);
  const game = await c.fresh(418);
  const claim = game.chapter?.claims[0];
  if (!claim) throw new Error('Missing Burak claim');
  const opening = createGame(418).villagers.find((v) => v.person.id === envelope.castId)?.person;
  if (!opening) throw new Error('Missing Burak opening');
  expect(() => admitPortablePerson(claim, 'days', opening)).toThrow();
  const prior = validatePortablePerson(envelope.transfer.portable);
  const current = validatePortablePerson(claim.transfer.portable);
  expect(current.source.game).toBe('commonstead');
  expect(current.source.engine).toBe('2.23.0');
  expect(current.history).toEqual(prior.history);
  expect(current.state).toEqual(prior.state);
  const beforeUnsupportedLongAction = JSON.stringify(game);
  apply(game, { kind: 'long-roof-break-return', ids: ['v6'] });
  expect(JSON.stringify(game)).toBe(beforeUnsupportedLongAction);
  expect(importRun(exportRun(game))).toEqual(game);
  playedPause(game);
  await c.checkpoint(envelope.castId);
  const checkpoint = h.data.revisions.find((p) => p.revision === h.data.heads[envelope.castId]);
  if (!checkpoint) throw new Error('Missing Burak checkpoint');
  expect(admitPortablePerson(checkpoint, 'days', opening).id).toBe(envelope.castId);
  expect(validatePortablePerson(checkpoint.transfer.portable).history.slice(0, prior.history.length)).toEqual(
    prior.history,
  );
  expect(importRun(exportRun(game))).toEqual(game);
});

test('an arriving Burak with unfinished building work cannot depart through his claim', async () => {
  const ancestry = JSON.parse(
    readFileSync(new URL('./fixtures/days-burak-hf-4.0.0.json', import.meta.url), 'utf8'),
  ) as PersonaEnvelope[];
  const envelope = ancestry[ancestry.length - 1];
  if (!envelope) throw new Error('Missing Days checkpoint');
  const life = envelope.transfer.life as { clock: { watermark: number } };
  const h = harness(ancestry, life.clock.watermark * 3_600_000);
  const c = new Continuity(h.lab, h.shelf);
  const game = await c.fresh(418, undefined, null);
  const burak = game.villagers.find((v) => v.person.id === envelope.castId);
  const claim = game.chapter?.claims[0];
  if (!burak || !claim) throw new Error('Missing Burak');
  while (game.tick < 30) step(game);
  apply(game, { kind: 'build', ids: [burak.id], building: 'house', x: 600, y: 450 });
  expect(game.buildings.some((b) => b.kind === 'house' && !b.complete && b.id === burak.order?.target)).toBe(
    true,
  );
  apply(game, { kind: 'pause-chapter' });
  for (let i = 0; i < 50 && !game.chapterPaused; i++) step(game);
  expect(game.chapterPaused).toBe(true);
  await expect(c.checkpoint(envelope.castId)).rejects.toThrow(/building work/);
  const opening = createGame(418).villagers.find((v) => v.person.id === envelope.castId)?.person;
  if (!opening) throw new Error('Missing Burak opening');
  expect(() => admitPortablePerson(claim, 'days', opening)).toThrow();
  expect(() => admitPortablePerson(claim, 'commonstead', opening)).toThrow();
  expect(h.data.heads[envelope.castId]).toBe(claim.revision);
  expect(importRun(exportRun(game))).toEqual(game);
});

test('a foreign locked Burak is reported and cannot be checkpointed while another resident carries over', async () => {
  const ancestry = JSON.parse(
    readFileSync(new URL('./fixtures/days-burak-hf-4.0.0.json', import.meta.url), 'utf8'),
  ) as PersonaEnvelope[];
  const locked = ancestry[1];
  if (!locked) throw new Error('Missing Days arrival claim');
  const life = locked.transfer.life as { clock: { watermark: number } };
  const h = harness([...ancestry.slice(0, 2), await source()], life.clock.watermark * 3_600_000);
  const c = new Continuity(h.lab, h.shelf);
  const game = await c.fresh(418);
  expect(game.chapter?.inputs.map((i) => i.parent.castId)).toEqual([CAST[0]!.castId]);
  expect(c.status).toMatch(/Burak/);
  const beforeUnsupportedLongAction = JSON.stringify(game);
  apply(game, { kind: 'long-roof-break-return', ids: ['v6'] });
  expect(JSON.stringify(game)).toBe(beforeUnsupportedLongAction);
  playedPause(game);
  await expect(c.checkpoint(locked.castId)).rejects.toThrow(/Burak|another|saved/i);
  await expect(c.checkpoint(locked.castId, true)).rejects.toThrow(/Burak|another|saved/i);
  expect(h.data.heads[locked.castId]).toBe(locked.revision);
  const reloaded = new Continuity(h.lab, h.shelf);
  await reloaded.loadLocal(c.localSave(game));
  await expect(reloaded.checkpoint(locked.castId, true)).rejects.toThrow(/Burak|another|saved/i);
  expect(importRun(exportRun(game))).toEqual(game);
});

test('fresh play automatically enables the shelf and admits saved people', async () => {
  const h = harness([await source()]);
  h.shelf.enabled = false;
  const c = new Continuity(h.lab, h.shelf);
  const game = await c.fresh(418);
  expect(h.shelf.enabled).toBe(true);
  expect(game.chapter?.inputs).toHaveLength(1);
  expect(h.requests.some((r) => r.action === 'putBatch')).toBe(true);
});

test('a foreign locked person alone remains protected after local save and reload', async () => {
  const ancestry = JSON.parse(
    readFileSync(new URL('./fixtures/days-burak-hf-4.0.0.json', import.meta.url), 'utf8'),
  ) as PersonaEnvelope[];
  const locked = ancestry[1];
  if (!locked) throw new Error('Missing Days arrival claim');
  const life = locked.transfer.life as { clock: { watermark: number } };
  const h = harness(ancestry.slice(0, 2), life.clock.watermark * 3_600_000);
  const c = new Continuity(h.lab, h.shelf);
  const game = await c.fresh(418);
  expect(game.chapter?.inputs).toEqual([]);
  expect(c.status).toMatch(/Burak/);
  playedPause(game);
  const loaded = new Continuity(h.lab, h.shelf);
  await loaded.loadLocal(c.localSave(game));
  await expect(loaded.checkpoint(locked.castId, true)).rejects.toThrow(/another game/);
  expect(h.data.heads[locked.castId]).toBe(locked.revision);
  expect(importRun(exportRun(game))).toEqual(game);
});

test('long roof departure retains the arriving person and refuses stranded supplies until actual delivery', async () => {
  const h = harness([await source()]),
    c = new Continuity(h.lab, h.shelf);
  const s = await c.fresh(42, { edition: 'settlement-replies/2' });
  while (s.tick < 30) step(s);
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  const aw = s.settlement!.actors.v1!;
  while (!aw.carried && s.tick < 300) step(s);
  expect(aw.carried).not.toBeNull();
  apply(s, { kind: 'long-roof-break-return', ids: ['v1'] });
  apply(s, { kind: 'settlement', ids: ['v1'], action: 'cancel' });
  apply(s, { kind: 'pause-chapter' });
  while (!s.chapterPaused && !s.ended) step(s);
  const head = c.heads[0]!.revision;
  await expect(c.checkpoint(CAST[0]!.castId)).rejects.toThrow(/unfinished/);
  expect(c.heads[0]!.revision).toBe(head);
  apply(s, { kind: 'resume-chapter' });
  apply(s, { kind: 'long-roof-break-return', ids: ['v1'] });
  while (!s.ended) step(s);
  expect(aw.carried).toBeNull();
  await c.checkpoint(CAST[0]!.castId);
  for (const compact of [false, true]) {
    expect(await new Continuity(h.lab, h.shelf).importFile(JSON.stringify(c.export(s, compact)))).toEqual(s);
  }
  expect(await new Continuity(h.lab, h.shelf).loadLocal(c.localSave(s))).toEqual(s);
  const next = await new Continuity(h.lab, h.shelf).fresh(43);
  expect(next.chapter?.inputs[0]?.parent.revision).toBe(c.heads[0]!.revision);
}, 20_000); // Full settlement day, actual delivery and replayed next admission.

test('recorded short roof work publishes a real departure and continues that actor next time', async () => {
  const h = harness([await source()]),
    c = new Continuity(h.lab, h.shelf);
  const s = await c.fresh(42);
  while (s.tick < 30) step(s);
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  apply(s, { kind: 'roof-break-return', ids: ['v1'] });
  while (s.roofBreak!.attempts[0]!.stage !== 'reoffered' && s.tick < 150) step(s);
  apply(s, { kind: 'pause-chapter' });
  while (!s.chapterPaused && !s.ended) step(s);
  await c.checkpoint(CAST[0]!.castId);
  for (const compact of [false, true])
    expect(await new Continuity(h.lab, h.shelf).importFile(JSON.stringify(c.export(s, compact)))).toEqual(s);
  expect(await new Continuity(h.lab, h.shelf).loadLocal(c.localSave(s))).toEqual(s);
  const next = await new Continuity(h.lab, h.shelf).fresh(43);
  expect(next.chapter?.inputs[0]?.parent.revision).toBe(c.heads[0]!.revision);
});

test('resuming during asynchronous capture cannot publish a stale departure', async () => {
  const h = harness(),
    c = new Continuity(h.lab, h.shelf);
  const s = await c.fresh(42);
  playedPause(s);
  const ready = h.shelf.ready;
  let release!: (value: boolean) => void;
  h.shelf.ready = new Promise((resolve) => {
    release = resolve;
  });
  const pending = c.checkpoint(CAST[0]!.castId);
  await Promise.resolve();
  apply(s, { kind: 'resume-chapter' });
  release(true);
  await expect(pending).rejects.toThrow(/changed/);
  h.shelf.ready = ready;
  expect(h.requests.filter((r) => r.action === 'put')).toHaveLength(0);
});

test('pending shelf put holds the native world and entry until its accepted receipt is saved', async () => {
  const h = harness(),
    c = new Continuity(h.lab, h.shelf);
  const s = await c.fresh(42);
  playedPause(s);
  const request = h.shelf.request.bind(h.shelf);
  let release!: () => void, writing!: () => void;
  const written = new Promise<void>((resolve) => {
    writing = resolve;
  });
  const acknowledgment = new Promise<void>((resolve) => {
    release = resolve;
  });
  h.shelf.request = async <T>(message: PersonaRequest): Promise<T> => {
    const result = await request<T>(message);
    if (message.action === 'put') {
      writing();
      await acknowledgment;
    }
    return result;
  };
  const pending = c.checkpoint(CAST[0]!.castId);
  await written;
  const before = structuredClone(s),
    generation = c.generation;
  expect(c.publishing).toBe(true);
  apply(s, { kind: 'resume-chapter' });
  step(s);
  expect(s).toEqual(before);
  expect(() => c.beginEntry()).toThrow(/Wait/);
  expect(() => c.clear()).toThrow(/Wait/);
  c.invalidate(); // The shelf preference watcher must not discard an accepted receipt.
  expect(c.generation).toBe(generation);
  release();
  await pending;
  expect(c.heads[0]!.revision).toBe(h.data.heads[CAST[0]!.castId]);
  expect(c.sources[0]!.revision).toBe(c.heads[0]!.revision);
  expect(c.publishing).toBe(false);
  expect(c.generation).toBe(generation + 1);
  expect(await new Continuity(h.lab, h.shelf).loadLocal(c.localSave(s))).toEqual(s);
  apply(s, { kind: 'resume-chapter' });
  step(s);
  expect(s.tick).toBe(before.tick + 1);
});

test('a load begun before a pending put cannot replace the run or discard its new source and receipt', async () => {
  const h = harness(),
    c = new Continuity(h.lab, h.shelf);
  const s = await c.fresh(42);
  playedPause(s);
  const saved = c.localSave(s),
    validation = Promise.withResolvers<void>();
  const validate = c.validateRunEnvelopes.bind(c);
  vi.spyOn(c, 'validateRunEnvelopes').mockImplementation(async (state) => {
    await validate(state);
    await validation.promise;
  });
  const load = c.loadLocal(saved);
  const writing = Promise.withResolvers<void>(),
    ack = Promise.withResolvers<void>();
  const request = h.shelf.request.bind(h.shelf);
  h.shelf.request = async <T>(r: PersonaRequest): Promise<T> => {
    const value = await request<T>(r);
    if (r.action === 'put') {
      writing.resolve();
      await ack.promise;
    }
    return value;
  };
  const put = c.checkpoint(CAST[0]!.castId);
  await writing.promise;
  validation.resolve();
  await expect(load).rejects.toThrow(/Wait/);
  ack.resolve();
  await put;
  expect(c.sources).toHaveLength(1);
  expect(c.heads[0]!.revision).toBe(h.data.heads[CAST[0]!.castId]);
  expect(c.sources[0]!.revision).toBe(c.heads[0]!.revision);
});
