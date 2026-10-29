import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { PRESSURE } from '../src/pressure.ts';
import { apply, createGame, exportRun, type GameCommand, importRun, type State, step } from '../src/sim.ts';

const advance = (s: State, n: number) => {
  for (let i = 0; i < n; i++) step(s);
};
const roof = (s: State, ids: string[]) => apply(s, { kind: 'roof-break-return', ids } as GameCommand);

// Removing the new public command must fail before any assertion about extension internals.
test('recorded roof break walks, rests under the real roof, then re-offers each exact earlier request', () => {
  const s = createGame(418, undefined, undefined, PRESSURE);
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  apply(s, { kind: 'order', ids: ['v2'], target: 'stone' });
  advance(s, 20);
  const prior = s.villagers.slice(0, 2).map((v) => structuredClone(v.order));
  const other = JSON.stringify(s.villagers[2]);
  roof(s, ['v1', 'v2']);
  expect(s.villagers.slice(0, 2).map((v) => v.order?.target)).toEqual(['shelter', 'shelter']);
  expect({ ...s.villagers[2], person: undefined }).toEqual({ ...JSON.parse(other), person: undefined });
  const entries = s.roofBreak!.attempts;
  expect(entries.map((a) => a.priorOrder)).toEqual(prior);
  expect(entries.map((a) => a.inputIndex)).toEqual([2, 2]);
  const beforeDuplicate = JSON.stringify(s);
  roof(s, ['v1']);
  expect(JSON.stringify(s)).toBe(beforeDuplicate);
  while (entries.some((a) => a.stage === 'roof') && s.tick < 50) step(s);
  expect(entries.every((a) => a.stage === 'rest')).toBe(true);
  for (const [i, a] of entries.entries()) {
    expect(a.restUntil! - a.restStarted!).toBe(35);
    expect(Math.hypot(s.villagers[i]!.x - 500, s.villagers[i]!.y - 350)).toBeLessThan(50);
  }
  const t = Math.max(...entries.map((a) => a.restUntil!));
  while (s.tick < t) step(s);
  expect(entries.every((a) => a.stage === 'reoffered')).toBe(true);
  expect(s.villagers.slice(0, 2).map((v) => v.order)).toEqual(prior);
  expect(s.villagers.slice(0, 2).every((v) => !v.person.activity?.protest)).toBe(true);
  for (const compact of [false, true]) {
    const raw = exportRun(s, compact) as { schema: number };
    expect(raw.schema).toBe(12);
    const loaded = importRun(JSON.parse(JSON.stringify(raw)));
    expect(loaded).toEqual(s);
    advance(loaded, 17);
    const copy = importRun(exportRun(s));
    advance(copy, 17);
    expect(loaded).toEqual(copy);
    expect(() => importRun({ ...raw, schema: 8 })).toThrow();
    expect(() => importRun({ ...raw, extension: { version: 'roof-break-return/0' } })).toThrow();
    expect(() => importRun({ ...raw, unknown: true })).toThrow();
  }
});

test('explicit interruptions never restore cancelled work; moving and already resting residents retain the actual request', () => {
  const s = createGame(418, undefined, undefined, PRESSURE);
  apply(s, { kind: 'order', ids: ['v1', 'v2'], target: 'wood' });
  advance(s, 1); // still moving
  apply(s, { kind: 'order', ids: ['v2'], target: 'rest' });
  roof(s, ['v1', 'v2', 'v3']);
  expect(s.roofBreak!.attempts[1]!.priorOrder?.target).toBe('wood');
  expect(s.roofBreak!.attempts[1]!.priorTask).toBe('resting');
  apply(s, { kind: 'order', ids: ['v1'], target: 'stone' });
  expect(s.roofBreak!.attempts[0]!.stage).toBe('cancelled');
  advance(s, 60);
  expect(s.villagers[0]!.order?.target).toBe('stone');
  expect(s.villagers[1]!.order?.target).toBe('wood');
  expect(s.roofBreak!.attempts[2]!.stage).toBe('unavailable');
  expect(s.roofBreak!.attempts[2]!.result).toContain('No earlier work');
  roof(s, ['v2']);
  while (s.roofBreak!.attempts.at(-1)!.stage === 'roof') step(s);
  apply(s, { kind: 'order', ids: ['v2'], target: 'shelter' });
  advance(s, 60);
  expect(s.villagers[1]!.order).toBe(null);
  expect(s.roofBreak!.attempts.at(-1)!.stage).toBe('cancelled');
});

test('completed or removed sites are not re-offered and long-day carried work stays literal', () => {
  for (const remove of [false, true]) {
    const s = createGame(418, undefined, undefined, PRESSURE);
    apply(s, { kind: 'build', ids: ['v1'], building: 'house', x: 650, y: 500 });
    roof(s, ['v1']);
    // Counterfactual world intervention tests stale-target validation only; never exported as a legal replay.
    if (remove) s.buildings.pop();
    else s.buildings[1]!.complete = true;
    advance(s, 60);
    expect(s.roofBreak!.attempts[0]!.stage).toBe('unavailable');
    expect(s.villagers[0]!.order).toBe(null);
    expect(s.resources.wood).toBe(40);
  }
  const d = createGame(418, undefined, { edition: 'settlement-day/1' });
  apply(d, { kind: 'order', ids: ['v1'], target: 'wood' });
  advance(d, 26);
  expect(d.settlement!.actors.v1!.carried).not.toBe(null);
  const before = JSON.stringify(d);
  roof(d, ['v1']);
  expect(JSON.stringify(d)).toBe(before);
});

test('old schemas keep literal full/compact bytes and legal continuation without the new input', () => {
  const prefix = process.env.COMMONSTEAD_ROOF_BASELINE;
  if (!prefix) return;
  for (let i = 0; i < 6; i++) {
    const b = JSON.parse(readFileSync(`${prefix}-old-${i}.json`, 'utf8'));
    for (const compact of [false, true]) {
      const text = compact ? b.compact : b.full;
      const s = importRun(JSON.parse(text));
      expect(JSON.stringify(exportRun(s, compact))).toBe(text);
      advance(s, 17);
      expect(JSON.stringify(s)).toBe(b.continuation);
    }
  }
});

test('completed work stays complete; pause and storm cancel only unfinished stages', () => {
  const s = createGame(418, undefined, undefined, PRESSURE);
  apply(s, {
    kind: 'build',
    ids: ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8'],
    building: 'house',
    x: 650,
    y: 500,
  });
  advance(s, 15);
  roof(s, ['v1']);
  advance(s, 60);
  expect(s.buildings[1]!.complete).toBe(true);
  expect(s.roofBreak!.attempts[0]!.stage).toBe('unavailable');
  expect(s.resources.wood).toBe(40);
  expect(s.villagers[0]!.order).toBe(null);
  expect(importRun(exportRun(s))).toEqual(s);
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  roof(s, ['v1']);
  apply(s, { kind: 'pause-chapter' });
  expect(s.roofBreak!.attempts.at(-1)!.stage).toBe('cancelled');
  for (let i = 0; i < 60 && !s.chapterPaused; i++) step(s);
  apply(s, { kind: 'resume-chapter' });
  advance(s, 70);
  expect(s.villagers[0]!.order).toBe(null);
  while (s.tick < 590) step(s);
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  roof(s, ['v1']);
  advance(s, 10);
  expect(s.ended).toBe(true);
  expect(s.roofBreak!.attempts.at(-1)!.stage).toBe('cancelled');
  const ended = JSON.stringify(s);
  advance(s, 100);
  roof(s, ['v1']);
  expect(JSON.stringify(s)).toBe(ended);
  expect(importRun(exportRun(s))).toEqual(JSON.parse(ended));
});

test('complete source archives survive native and file loads; active run requires a departure pause', async () => {
  const { Continuity } = await import('../src/continuity.ts');
  const { createFileSession } = await import('../src/file-session.ts');
  const c = new Continuity({ setPersonaRecording() {} } as never, {} as never);
  const s = createGame(418, undefined, undefined, PRESSURE);
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  roof(s, ['v1']);
  advance(s, 10);
  const sources = [
    {
      revision: 'synthetic-complete-source',
      source: { game: 'commonstead', build: 'control', engine: '2.23.0', rules: 'commonstead-3' },
      snapshot: { world: { materials: 123 }, person: 'opaque retained source' },
    },
  ];
  const native = JSON.stringify({
    run: exportRun(s),
    runId: 'synthetic',
    fileOrigin: false,
    heads: [],
    sources,
  });
  await c.loadLocal(native);
  // Isolate the existing action-boundary control from the earlier live peer gate.
  // The unmocked refusal is covered in shared-write-capability.test.ts.
  const capability = await import('../src/shared-write-capability');
  const { vi } = await import('vitest');
  const readiness = vi.spyOn(capability, 'requireSharedWriteCapability').mockImplementation(() => {});
  try {
    await expect(c.checkpoint('hf.cast.nora.smallworks')).rejects.toThrow(/Play the chapter/);
  } finally {
    readiness.mockRestore();
  }
  const full = c.export(s);
  const f = createFileSession();
  expect(await f.select(new File([JSON.stringify(full)], 'roof.json'))).toBe(true);
  expect(f.snapshot()!.castSources).toEqual(sources);
  const compact = { ...(exportRun(s, true) as object), castSources: sources };
  expect(await f.select(new File([JSON.stringify(compact)], 'roof-compact.json'))).toBe(true);
  expect(f.snapshot()!.castSources).toEqual(sources);
  f.resume();
  f.advance(70);
  expect(f.snapshot()!.castSources).toEqual(sources);
  f.invalidate();
  const frozen = JSON.stringify(f.snapshot());
  f.advance(70);
  expect(JSON.stringify(f.snapshot())).toBe(frozen);
  const tiny = createFileSession({ currentBytes: 10 });
  await expect(tiny.select(new File([JSON.stringify(full)], 'roof.json'))).rejects.toThrow('capacity');
});

// Long-day faculty control: removing the new deliberate input must fail the recorded-capture assertion.
test('long-day roof action delivers the actual held load once, rests at the hub, then offers the source job', () => {
  const s = createGame(418, undefined, { edition: 'settlement-day/1' });
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  advance(s, 26);
  const aw = s.settlement!.actors.v1!;
  expect(aw.carried?.amount).toBeGreaterThan(0);
  const actor = structuredClone(aw);
  const stock = s.resources.wood;
  const index = s.inputs.length;
  apply(s, { kind: 'long-roof-break-return', ids: ['v1'] } as GameCommand);
  const a = s.longRoofBreak?.attempts[0];
  if (!a) throw new Error('Missing deliberate long-day action');
  expect(a?.priorActor).toEqual(actor);
  expect(a.capturedAt).toBe(26);
  expect(a.inputIndex).toBe(index);
  expect(aw.carried).toEqual(actor.carried);
  expect(s.resources.wood).toBe(stock);
  const duplicate = JSON.stringify(s);
  apply(s, { kind: 'long-roof-break-return', ids: ['v1'] } as GameCommand);
  expect(JSON.stringify(s)).toBe(duplicate);
  while (!['reoffered', 'refused', 'unavailable'].includes(a.stage) && s.tick < 200) step(s);
  expect(a.stage, a.result).toBe('reoffered');
  expect(a.deliveredAt).toBeGreaterThan(26);
  expect(a.restStarted).toBeGreaterThanOrEqual(a.deliveredAt!);
  expect(a.restCompleted! - a.restStarted!).toBe(15);
  expect(a.restMap).toBe('yard');
  expect(Math.hypot(a.restPoint!.x - s.buildings[0]!.x, a.restPoint!.y - s.buildings[0]!.y)).toBeLessThan(10);
  expect(s.resources.wood).toBe(stock + actor.carried!.amount);
  expect(aw.carried).toBeNull();
  expect(aw.job).toMatchObject({ kind: 'gather', target: 'wood', map: 'yard', phase: 'out' });
  expect(aw.pendingRequest).not.toBe('insist');
  for (const compact of [false, true]) {
    const raw = exportRun(s, compact) as { schema: number; rules: string };
    expect(raw.schema).toBe(12);
    expect(raw.rules).toBeNull(); // The current envelope binds the roof input through its full history.
    const copy = importRun(JSON.parse(JSON.stringify(raw)));
    expect(copy).toEqual(s);
    advance(copy, 17);
    const expected = importRun(exportRun(s));
    advance(expected, 17);
    expect(copy).toEqual(expected);
    expect(() => importRun({ ...raw, schema: 4 })).toThrow();
    expect(() => importRun({ ...raw, unexpected: true })).toThrow();
  }
});

test('long-day busy acts finish without cancellation; explicit cancellation keeps the load and never restores work', () => {
  const s = createGame(418, undefined, { edition: 'settlement-day/1' });
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  advance(s, 20);
  const aw = s.settlement!.actors.v1!;
  expect(aw.running?.purpose).toBe('job');
  const before = structuredClone(aw);
  apply(s, { kind: 'long-roof-break-return', ids: ['v1'] });
  expect(aw).toEqual(before);
  advance(s, 6);
  expect(aw.carried?.amount).toBeGreaterThan(0);
  const stock = s.resources.wood;
  apply(s, { kind: 'settlement', ids: ['v1'], action: 'cancel' });
  expect(s.longRoofBreak!.attempts[0]!.stage).toBe('cancelled');
  expect(aw.carried).not.toBeNull();
  advance(s, 60);
  expect(s.resources.wood).toBe(stock);
  expect(aw.job).toBeNull();
  expect(importRun(exportRun(s))).toEqual(s);
  // A new deliberate action can deliver a stranded load, but it cannot invent a prior job.
  apply(s, { kind: 'long-roof-break-return', ids: ['v1'] });
  advance(s, 100);
  expect(aw.carried).toBeNull();
  expect(s.resources.wood).toBeGreaterThan(stock);
  expect(s.longRoofBreak!.attempts.at(-1)!.stage).toBe('unavailable');
  expect(s.longRoofBreak!.attempts.at(-1)!.priorActor.job).toBeNull();
});

test('long-day stale targets and no prior work cannot produce a work offer; departure pause interrupts the sequence', () => {
  for (const edition of ['settlement-day/1', 'settlement-replies/1', 'settlement-replies/2'] as const) {
    const s = createGame(418, undefined, { edition });
    apply(s, { kind: 'long-roof-break-return', ids: ['v1'] });
    advance(s, 40);
    expect(s.longRoofBreak!.attempts[0]!.stage).toBe('unavailable');
    expect(importRun(exportRun(s, true))).toEqual(s);
    apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
    apply(s, { kind: 'long-roof-break-return', ids: ['v1'] });
    apply(s, { kind: 'pause-chapter' });
    expect(s.longRoofBreak!.attempts.at(-1)!.stage).toBe('cancelled');
    for (let n = 0; n < 100 && !s.chapterPaused; n++) step(s);
    expect(importRun(exportRun(s))).toEqual(s);
  }
  const s = createGame(418, undefined, { edition: 'settlement-day/1' });
  apply(s, { kind: 'build', ids: ['v1'], building: 'house', x: 575, y: 575 });
  apply(s, { kind: 'long-roof-break-return', ids: ['v1'] });
  // Counterfactual host removal only tests a stale target, never represented as a replayable source.
  s.buildings.pop();
  advance(s, 80);
  expect(s.longRoofBreak!.attempts[0]!.stage).toBe('unavailable');
  expect(s.resources.wood).toBe(40);
  expect(s.settlement!.actors.v1!.job).toBeNull();
});

test('schemas3–9 retain literal raw exports and complete legal continuations without the new action', () => {
  const dir = process.env.COMMONSTEAD_LONG_ROOF_BASELINE;
  if (!dir) return;
  for (let schema = 3; schema <= 9; schema++) {
    const b = JSON.parse(readFileSync(`${dir}/schema-${schema}.json`, 'utf8'));
    for (const compact of [false, true]) {
      const raw = compact ? b.compact : b.full;
      const s = importRun(JSON.parse(raw));
      expect(JSON.stringify(exportRun(s, compact))).toBe(raw);
      advance(s, 17);
      expect(JSON.stringify(s)).toBe(b.continuation);
    }
  }
});

test('schema10 keeps source archives through full, compact, gzip and native loads, and refuses an unpaused departure before shelf access', async () => {
  const { gzipSync } = await import('node:zlib');
  const { Continuity } = await import('../src/continuity.ts');
  const { createFileSession } = await import('../src/file-session.ts');
  const s = createGame(418, undefined, { edition: 'settlement-replies/2' });
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  advance(s, 26);
  apply(s, { kind: 'long-roof-break-return', ids: ['v1'] });
  advance(s, 18);
  const sources = [
    {
      revision: 'synthetic-archive',
      source: { game: 'commonstead', build: 'control', engine: '2.23.0', rules: 'commonstead-3' },
      snapshot: { untouched: ['complete', 'source', 7] },
    },
  ];
  let accessed = 0;
  const c = new Continuity(
    { setPersonaRecording() {} } as never,
    {
      get ready() {
        accessed++;
        throw new Error('Shelf must not be read');
      },
    } as never,
  );
  await c.loadLocal(
    JSON.stringify({ run: exportRun(s), runId: 'synthetic-long', fileOrigin: false, heads: [], sources }),
  );
  // Isolate the existing action-boundary control from the earlier live peer gate.
  // The unmocked refusal is covered in shared-write-capability.test.ts.
  const capability = await import('../src/shared-write-capability');
  const { vi } = await import('vitest');
  const readiness = vi.spyOn(capability, 'requireSharedWriteCapability').mockImplementation(() => {});
  try {
    await expect(c.checkpoint('hf.cast.nora.smallworks')).rejects.toThrow(/Play the chapter/);
  } finally {
    readiness.mockRestore();
  }
  expect(accessed).toBe(0);
  const download = c.export(s) as { castSources: unknown[] };
  expect(download.castSources).toEqual(sources);
  const expected = importRun(exportRun(s));
  advance(expected, 60);
  for (const compact of [false, true]) {
    const raw = { ...(exportRun(s, compact) as object), castSources: sources };
    for (const gzip of [false, true]) {
      const text = JSON.stringify(raw);
      const file = new File(
        [gzip ? new Uint8Array(gzipSync(text)) : text],
        gzip ? 'long.json.gz' : 'long.json',
      );
      const f = createFileSession();
      expect(await f.select(file)).toBe(true);
      expect(f.snapshot()!.castSources).toEqual(sources);
      expect(JSON.stringify(f.state())).toBe(JSON.stringify(s));
      f.resume();
      f.advance(60);
      expect(JSON.stringify(f.state())).toBe(JSON.stringify(expected));
      expect(f.snapshot()!.castSources).toEqual(sources);
      f.invalidate();
      const frozen = JSON.stringify(f.snapshot());
      f.advance(100);
      expect(JSON.stringify(f.snapshot())).toBe(frozen);
    }
    const imported = await c.importFile(JSON.stringify(raw));
    expect(JSON.stringify(imported)).toBe(JSON.stringify(s));
    expect(c.sources).toEqual(sources);
  }
  const tiny = createFileSession({ currentBytes: 10 });
  await expect(tiny.select(new File([JSON.stringify(download)], 'long.json'))).rejects.toThrow('capacity');
});

test('a pending public reply refuses the new action without recording or changing its actor', () => {
  const s = createGame(418, undefined, { edition: 'settlement-replies/1' });
  advance(s, 60);
  apply(s, { kind: 'settlement', ids: ['v1'], action: 'cancel' });
  apply(s, { kind: 'settlement', ids: ['v1'], action: 'story' });
  advance(s, 40);
  expect(s.settlement!.replyScenes!.v1).toBeDefined();
  apply(s, { kind: 'settlement', ids: ['v1'], action: 'cancel' });
  apply(s, { kind: 'reply', ids: ['v1'], branch: 'nora-record-question' });
  const before = JSON.stringify(s);
  apply(s, { kind: 'long-roof-break-return', ids: ['v1'] });
  expect(JSON.stringify(s)).toBe(before);
  expect(s.longRoofBreak).toBeUndefined();
});

test('remote held supplies cross the existing passage before stock delivery, roof rest and the source-map offer', async () => {
  const s = createGame(418, undefined, { edition: 'settlement-day/1' });
  // Sam's ordinary live choices provide a positive remote return. Nora's same
  // journey can remain at the delivery point attending to her needs all day.
  const aw = s.settlement!.actors.v2!;
  const advanceUntil = async (ready: () => boolean, limit: number) => {
    for (let n = 0; !ready() && s.tick < limit && n < limit; n++) {
      const prior = s.tick;
      step(s);
      if (s.tick <= prior) throw new Error(`Remote roof stopped at tick ${s.tick}.`);
      if (n % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(ready(), `Remote roof did not reach the requested boundary by tick ${s.tick}.`).toBe(true);
  };
  apply(s, { kind: 'settlement', ids: ['v2'], action: 'map', target: 'quay' });
  await advanceUntil(() => aw.map === 'quay' && !aw.job, 250);
  apply(s, { kind: 'order', ids: ['v2'], target: 'wood' });
  await advanceUntil(() => !!aw.carried, 500);
  const load = structuredClone(aw.carried);
  expect(load?.amount).toBeGreaterThan(0);
  const stock = s.resources.wood;
  const map = aw.map;
  apply(s, { kind: 'long-roof-break-return', ids: ['v2'] });
  const a = s.longRoofBreak!.attempts[0]!;
  expect(a.source.map).toBe('quay');
  expect(aw.map).toBe(map);
  expect(s.resources.wood).toBe(stock);
  let crossing = false,
    crossed = false,
    delivered = false;
  for (
    let n = 0;
    ['finish', 'delivery', 'roof', 'rest'].includes(a.stage) && s.tick < 1800 && n < 1800;
    n++
  ) {
    crossing ||= aw.running?.id === 'crossing';
    const priorTick = s.tick,
      priorMap = aw.map;
    if (!delivered) expect(s.resources.wood).toBe(stock);
    step(s);
    if (s.tick <= priorTick) throw new Error(`Remote roof stopped at tick ${s.tick}.`);
    crossed ||= priorMap === 'quay' && aw.map === 'yard';
    if (!delivered && !aw.carried) {
      expect(s.resources.wood).toBe(stock + load!.amount);
      expect(a.deliveredAt).toBe(s.tick);
      delivered = true;
    }
    if (!delivered) expect(s.resources.wood).toBe(stock);
    if (n % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect({ crossing, crossed, delivered }).toEqual({ crossing: true, crossed: true, delivered: true });
  expect(a.stage, a.result).toBe('reoffered');
  expect(a.restDecision?.chosenAffordanceId).toBe('rest');
  expect(a.restUntil! - a.restStarted!).toBe(15);
  expect(a.restCompleted).toBeGreaterThanOrEqual(a.restUntil!);
  expect(a.restMap).toBe('yard');
  expect(Math.hypot(a.restPoint!.x - 500, a.restPoint!.y - 350)).toBeLessThan(10);
  expect(aw.map).toBe('yard');
  expect(aw.carried).toBeNull();
  expect(s.resources.wood).toBe(stock + load!.amount);
  expect(aw.job).toMatchObject({ kind: 'gather', map: 'quay', phase: 'out', target: 'wood' });
  // One complete game restore retains the actual remote delivery/rest/reoffer.
  expect(importRun(exportRun(s, true))).toEqual(s);
}, 120_000);

test('an accepted later reply during roof rest keeps its ordinary priority and completed paper result', () => {
  const s = createGame(418, undefined, { edition: 'settlement-replies/1' });
  advance(s, 60);
  apply(s, { kind: 'settlement', ids: ['v1'], action: 'cancel' });
  apply(s, { kind: 'settlement', ids: ['v1'], action: 'story' });
  advance(s, 40);
  const scene = s.settlement!.replyScenes!.v1!;
  expect(scene.disclosure.at).toBe(69);
  apply(s, { kind: 'settlement', ids: ['v1'], action: 'cancel' });
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  const aw = s.settlement!.actors.v1!;
  while (!aw.carried && s.tick < 300) step(s);
  const load = structuredClone(aw.carried)!;
  const stock = s.resources.wood;
  apply(s, { kind: 'long-roof-break-return', ids: ['v1'] });
  const roof = s.longRoofBreak!.attempts[0]!;
  while (roof.stage !== 'rest' && s.tick < 500) step(s);
  expect(roof.deliveredAt).toBeDefined();
  expect(s.resources.wood).toBe(stock + load.amount);
  expect(aw.carried).toBeNull();
  expect(roof.restUntil! - roof.restStarted!).toBe(15);
  const running = structuredClone(aw.running);
  const restStarted = roof.restStarted;
  const restUntil = roof.restUntil!;
  advance(s, 9);
  const beforeRejected = JSON.stringify(s);
  expect(() => apply(s, { kind: 'reply', ids: ['v2'], branch: 'nora-record-question' })).toThrow();
  expect(JSON.stringify(s)).toBe(beforeRejected);
  expect(roof.stage).toBe('rest');
  apply(s, { kind: 'reply', ids: ['v1'], branch: 'nora-record-question' });
  const reply = scene.attempts.at(-1)!;
  expect(reply.status).toBe('requested');
  expect(reply.requestedAt).toBe(s.tick);
  expect(reply.point).toEqual({ x: 500, y: 350 });
  expect(roof.stage).toBe('cancelled');
  expect(aw.running).toEqual(running);
  expect(roof.restStarted).toBe(restStarted);
  expect(s.resources.wood).toBe(stock + load.amount);
  for (const compact of [false, true]) {
    const copy = importRun(JSON.parse(JSON.stringify(exportRun(s, compact))));
    expect(copy).toEqual(s);
    advance(copy, 90);
    const expected = importRun(exportRun(s));
    advance(expected, 90);
    expect(copy).toEqual(expected);
  }
  advance(s, 90);
  expect(s.tick).toBeGreaterThan(restUntil);
  expect(reply.status).toBe('completed');
  expect(reply.paperSpent).toBe(1);
  expect(reply.deliveredAt).toBeGreaterThanOrEqual(restUntil);
  expect(scene.completedBranch).toBe('nora-record-question');
  expect(s.story!.firstResults!.some((r) => r.attemptId === reply.id)).toBe(true);
  expect(aw.job?.kind).not.toBe('gather');
  expect(s.resources.wood).toBe(stock + load.amount);
});
