import { describe, expect, test } from 'vitest';
import { DISCOVERIES } from '../src/cast';
import { FRAMEWORK_VERSION } from '../src/engine';
import { archiveCommunity } from '../src/hf4';
import {
  apply,
  createGame,
  exportRun,
  importRun,
  NODES,
  publicPlaceText,
  replay,
  stateHash,
  step,
  stepYieldBatch,
} from '../src/sim';

const memory = (person: Parameters<typeof archiveCommunity>[0]) =>
  archiveCommunity(person).current.people[person.id]!.memory;

function advance(s: ReturnType<typeof createGame>, n: number) {
  for (let i = 0; i < n; i++) step(s);
}

function first(s: ReturnType<typeof createGame>) {
  const v = s.villagers[0];
  if (!v) throw new Error('Missing opening villager');
  return v;
}

describe('Commonstead fixed-tick simulation', () => {
  test('starts with eight canonical HF people, counted stocks and housing', () => {
    const s = createGame(42);
    expect(s.villagers).toHaveLength(8);
    expect(s.villagers.every((v) => v.person.id.startsWith('hf.cast.') && v.person.body.alive)).toBe(true);
    expect(s.resources).toEqual({ food: 100, wood: 80, stone: 0 });
  });
  test('private workshop discoveries require a chosen break and invitation, and replay', () => {
    const s = createGame(42);
    advance(s, 60);
    for (const v of s.villagers) {
      apply(s, { kind: 'order', ids: [v.id], target: 'listen' });
      expect(v.discovery).toBe(0);
      apply(s, { kind: 'order', ids: [v.id], target: 'rest' });
      apply(s, { kind: 'order', ids: [v.id], target: 'listen' });
      expect(v.discovery).toBe(0);
      advance(s, 5);
      apply(s, { kind: 'order', ids: [v.id], target: 'listen' });
      expect(v.discovery).toBe(1);
      apply(s, { kind: 'order', ids: [v.id], target: 'collaborate' });
      expect(v.discovery).toBe(1);
      const requested = s.tick;
      while (v.discovery !== 2 && s.tick < requested + 60) step(s);
      expect(v.discovery).toBe(2);
    }
    expect(stateHash(importRun(exportRun(s)))).toBe(stateHash(s));
  });
  test('retained pressure and an optional invitation follow the actual HF reply', () => {
    const s = createGame(42);
    apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
    advance(s, 160);
    for (let i = 0; i < 20; i++) apply(s, { kind: 'order', ids: ['v1'], target: 'push' });
    apply(s, { kind: 'order', ids: ['v1'], target: 'rest' });
    advance(s, 5);
    apply(s, { kind: 'order', ids: ['v1'], target: 'listen' });
    const resident = first(s),
      reply = resident.person.trace.at(-1);
    if (!reply) throw new Error('Missing HF invitation decision');
    const accepted = reply.suggestion?.verdict !== 'refused' && !!reply.chosenAffordanceId;
    expect(resident.discovery).toBe(accepted ? 1 : 0);
    expect(resident.says).toBe(accepted ? DISCOVERIES[0]?.[0] : reply.suggestion?.says);
    expect(
      memory(resident.person).episodes.some(
        (e) => e.tags.includes('insisted') || /push|insist|protest/.test(e.summary),
      ),
    ).toBe(true);
  });
  test('episode helpers never duplicate the canonical roster', () => {
    const s = createGame(7);
    apply(s, { kind: 'train' });
    advance(s, 15);
    const helper = s.villagers.at(-1);
    if (!helper) throw new Error('Missing helper');
    expect(helper.person.id).toBe('commonstead.episode.7.9');
    expect(helper.name).toBe('Helper 9');
    expect(new Set(s.villagers.map((v) => v.person.id)).size).toBe(9);
  });
  test('replays changed orders, recovery and training byte identically', () => {
    const s = createGame(42);
    apply(s, { kind: 'order', ids: ['v1', 'v2'], target: 'wood' });
    advance(s, 75);
    apply(s, { kind: 'order', ids: ['v1'], target: 'rest' });
    apply(s, { kind: 'train' });
    advance(s, 105);
    expect(stateHash(replay(s.seed, s.inputs, s.tick))).toBe(stateHash(s));
    expect(s.resources.wood).toBeGreaterThan(80);
    expect(s.villagers).toHaveLength(9);
  });
  test('export roundtrip verifies the full state and rejects tampering', () => {
    const s = createGame(88);
    apply(s, { kind: 'order', ids: ['v1'], target: NODES.at(0)?.id ?? 'food' });
    advance(s, 100);
    const raw = JSON.parse(JSON.stringify(exportRun(s)));
    expect(stateHash(importRun(raw))).toBe(stateHash(s));
    raw.state.resources.wood += 1;
    expect(() => importRun(raw)).toThrow(/replay|state/i);
    expect(() => importRun({ schema: 1, seed: 1, tick: 900000, inputs: [] })).toThrow();
  });
  test('sustained HF exertion slows production by three minutes and names the cause', () => {
    const s = createGame(7);
    const v = first(s);
    apply(s, { kind: 'order', ids: [v.id], target: 'wood' });
    advance(s, 40);
    const early = s.resources.wood;
    advance(s, 20);
    const firstRate = s.resources.wood - early;
    advance(s, 100);
    const late = s.resources.wood;
    advance(s, 20);
    expect(s.resources.wood - late).toBeLessThan(firstRate * 0.9);
    expect(v.person.body.exertion).toBeGreaterThan(0.3);
    expect(v.says).toMatch(/tired|rest|relief|water|eat/i);
  });
  test('ordinary repeated orders do not change treatment; push is remembered by HF', () => {
    const a = createGame(2);
    const b = createGame(2);
    apply(a, { kind: 'order', ids: ['v1'], target: 'wood' });
    apply(b, { kind: 'order', ids: ['v1'], target: 'wood' });
    advance(a, 100);
    advance(b, 100);
    const before = JSON.stringify(archiveCommunity(first(a).person).current.people[first(a).person.id]!.will);
    apply(a, { kind: 'order', ids: ['v1'], target: 'wood' });
    expect(JSON.stringify(archiveCommunity(first(a).person).current.people[first(a).person.id]!.will)).toBe(
      before,
    );
    apply(a, { kind: 'order', ids: ['v1'], target: 'push' });
    expect(
      JSON.stringify(archiveCommunity(first(a).person).current.people[first(a).person.id]!.will),
    ).not.toBe(before);
    expect(
      memory(first(a).person).episodes.some(
        (e) => e.tags.includes('insisted') || /push|insist|protest/.test(e.summary),
      ),
    ).toBe(true);
  });
  test('rest stays in place for 35 ticks then resumes the individual order', () => {
    const s = createGame(1);
    apply(s, { kind: 'order', ids: ['v1'], target: 'stone' });
    advance(s, 45);
    const v = first(s);
    const { x, y } = v;
    apply(s, { kind: 'order', ids: [v.id], target: 'rest' });
    advance(s, 34);
    expect(v.x).toBe(x);
    expect(v.y).toBe(y);
    expect(v.task).toMatch(/rest/);
    advance(s, 1);
    expect(v.task).toMatch(/ballast/);
  });
  test('blocked placement costs nothing; completed houses add two spaces', () => {
    const s = createGame(1);
    apply(s, { kind: 'build', ids: ['v1'], building: 'house', x: 500, y: 350 });
    expect(s.resources.wood).toBe(80);
    apply(s, { kind: 'build', ids: ['v1', 'v2', 'v3'], building: 'house', x: 600, y: 450 });
    advance(s, 100);
    expect(s.buildings.find((b) => b.kind === 'house')?.complete).toBe(true);
    for (let i = 0; i < 2; i++) {
      apply(s, { kind: 'train' });
      advance(s, 15);
    }
    expect(s.villagers).toHaveLength(10); // food limits this opening
  });
  test('a meal costs exactly two food and nourishes through HF', () => {
    const s = createGame(4);
    const v = first(s);
    advance(s, 100);
    const satiety = v.person.body.satiety;
    apply(s, { kind: 'order', ids: [v.id], target: 'meal' });
    advance(s, 8);
    expect(s.resources.food).toBe(98);
    expect(v.person.body.satiety).toBeGreaterThan(satiety);
  });
  test('meal stock is reserved before training can spend it', () => {
    const s = createGame(4);
    apply(s, { kind: 'order', ids: ['v1', 'v2', 'v3', 'v4', 'v5'], target: 'meal' });
    expect(s.resources.food).toBe(90);
    apply(s, { kind: 'train' });
    apply(s, { kind: 'train' });
    apply(s, { kind: 'train' });
    advance(s, 8);
    expect(s.resources.food).toBe(55);
  });
  test('moving interrupts a break and never uses gathering exertion', () => {
    const s = createGame(4);
    const v = first(s);
    apply(s, { kind: 'order', ids: [v.id], target: 'rest' });
    apply(s, { kind: 'order', ids: [v.id], target: 'move', x: 800, y: 600 });
    step(s);
    expect(v.x).toBeGreaterThan(450);
    expect(v.person.activity?.effort).toBeLessThan(0.3);
  });
  test('training reserves food and completes once after fifteen ticks', () => {
    const s = createGame(3);
    apply(s, { kind: 'train' });
    apply(s, { kind: 'train' });
    expect(s.resources.food).toBe(65);
    expect(s.villagers).toHaveLength(8);
    advance(s, 14);
    expect(s.villagers).toHaveLength(8);
    step(s);
    expect(s.villagers).toHaveLength(9);
    expect(s.trainingUntil).toBeNull();
  });
  test('remembered pressure changes HF willingness and the worker states that cause', () => {
    const s = createGame(42);
    apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
    advance(s, 160);
    for (let i = 0; i < 20; i++) apply(s, { kind: 'order', ids: ['v1'], target: 'push' });
    advance(s, 10);
    const v = first(s);
    const response = v.person.trace.at(-1)?.suggestion;
    expect(response?.reason).toBe('distrust');
    expect(v.says).toBe(response?.says);
  });
  test('storm ends at tick 600 and further inputs cannot change the run', () => {
    const s = createGame(1);
    advance(s, 601);
    expect(s.tick).toBe(600);
    expect(s.ended).toBe(true);
    expect(s.won).toBe(false);
    const hash = stateHash(s);
    apply(s, { kind: 'train' });
    step(s);
    expect(stateHash(s)).toBe(hash);
  });
});

describe('published HF plain narration', () => {
  test('opts every fresh canonical resident and episode helper into persisted plain narration', () => {
    const s = createGame(7);
    expect(s.villagers.every((v) => v.person.lexicon?.plainEnglish === true)).toBe(true);
    expect(s.villagers.every((v) => v.person.engine === FRAMEWORK_VERSION)).toBe(true);
    apply(s, { kind: 'train' });
    advance(s, 21);
    expect(s.villagers.length).toBeGreaterThan(8);
    expect(s.villagers.every((v) => v.person.lexicon?.plainEnglish === true)).toBe(true);
    const raw = exportRun(s) as { framework: string };
    expect(raw.framework).toBe(FRAMEWORK_VERSION);
    expect(importRun(raw)).toEqual(s);
  });

  test('displays the published plain HF reply directly', () => {
    const s = createGame(42);
    apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
    advance(s, 5);
    apply(s, { kind: 'order', ids: ['v1'], target: 'push' });
    const decision = first(s).person.trace.at(-1);
    if (!decision) throw new Error('Missing published HF reply');
    expect(first(s).says).toBe(decision.suggestion?.says || decision.narration);
    expect(first(s).says.trim().length).toBeGreaterThan(0);
  });

  test('refuses a different saved narration choice without rewriting the supplied save', () => {
    const s = createGame(42);
    const raw = exportRun(s) as { state: typeof s };
    first(raw.state).person.lexicon = { plainEnglish: false };
    const before = structuredClone(raw);
    expect(() => importRun(raw)).toThrow('Start a new game');
    expect(raw).toEqual(before);
  });
});

test('current reply schema is closed and requires an actual disclosure in every opening', () => {
  const config = { edition: 'settlement-replies/1' } as const;
  const s = createGame(42, undefined, config);
  const full = exportRun(s) as Record<string, unknown>;
  expect(full.schema).toBe(12);
  expect(importRun(full)).toEqual(s);
  expect(importRun(exportRun(s, true))).toEqual(s);
  for (const extra of [{ chapter: {} }, { surplus: true }, { compact: false }])
    expect(() => importRun({ ...full, ...extra })).toThrow(/replay/);
  for (const legacy of [createGame(42), createGame(42, undefined, { edition: 'settlement-day/1' })]) {
    const before = JSON.stringify(legacy);
    expect(() => apply(legacy, { kind: 'reply', ids: ['v1'], branch: 'nora-restore-drawing' })).toThrow();
    expect(JSON.stringify(legacy)).toBe(before);
    const raw = exportRun(legacy) as Record<string, unknown>;
    expect(() =>
      importRun({
        ...raw,
        inputs: [{ tick: 0, command: { kind: 'reply', ids: ['v1'], branch: 'nora-restore-drawing' } }],
      }),
    ).toThrow(/replay/);
  }
  const before = JSON.stringify(s);
  expect(() => apply(s, { kind: 'reply', ids: ['v1'], branch: 'nora-restore-drawing' })).toThrow(
    /disclosure/,
  );
  expect(JSON.stringify(s)).toBe(before);
});

test('reply day preserves existing building orders and pointer coordinates', () => {
  const jobs = [];
  for (const edition of ['settlement-day/1', 'settlement-replies/1'] as const) {
    for (const coordinates of [{}, { x: 650, y: 500 }]) {
      const s = createGame(42, undefined, { edition });
      apply(s, { kind: 'build', ids: ['v1'], building: 'house', x: 650, y: 500 });
      const site = s.buildings.find((b) => !b.complete);
      expect(site).toBeDefined();
      if (!site) throw new Error('Build must create a site');
      apply(s, { kind: 'order', ids: ['v2'], target: site.id, ...coordinates });
      const job = s.settlement?.actors.v2?.job;
      expect(job).toMatchObject({ kind: 'build', target: site.id, map: 'yard', point: site });
      jobs.push(job);
      expect(importRun(exportRun(s))).toEqual(s);
      expect(importRun(exportRun(s, true))).toEqual(s);
      if (edition !== 'settlement-replies/1') continue;
      for (const invalid of [
        { target: 'b999' },
        { target: undefined },
        { target: site.id, surplus: true },
        { target: site.id, x: 650 },
        { target: site.id, y: 500 },
        { target: site.id, x: NaN, y: 500 },
        { target: site.id, x: 650, y: Infinity },
        { target: 'wood', x: 650, y: 500 },
      ]) {
        const before = JSON.stringify(s);
        expect(() =>
          apply(s, { kind: 'order', ids: ['v2'], ...invalid } as Parameters<typeof apply>[1]),
        ).toThrow();
        expect(JSON.stringify(s)).toBe(before);
      }
    }
  }
  for (const job of jobs) expect(job).toEqual(jobs[0]);
});

test('native6 is closed, rejects stale route bindings and refuses peer commands in schema3/4/5 before installation', () => {
  const editions = [undefined, 'settlement-day/1', 'settlement-replies/1', 'settlement-replies/2'] as const;
  for (const edition of editions) {
    const s = createGame(418, undefined, edition ? { edition } : undefined);
    const raw = JSON.parse(JSON.stringify(exportRun(s)));
    raw.inputs.push({
      tick: 0,
      command: { kind: 'peer', ids: ['v1', 'v2'], map: 'yard', disputeAt: 0, branch: 'route-wait' },
    });
    expect(() => importRun(raw)).toThrow(/not loaded/);
    expect(s.tick).toBe(0);
    expect(s.inputs).toEqual([]);
  }
  const s = createGame(418, undefined, { edition: 'settlement-replies/2' });
  const before = JSON.stringify(s);
  for (const field of ['chapter', 'castSources', 'unexpected']) {
    const raw = { ...(exportRun(s) as object), [field]: field === 'chapter' ? {} : [] };
    expect(() => importRun(raw)).toThrow(/not loaded/);
    expect(JSON.stringify(s)).toBe(before);
  }
  const wrongSchema = { ...(exportRun(s) as object), schema: 5 };
  expect(() => importRun(wrongSchema)).toThrow(/not loaded/);
  const wrongInput = {
    ...(exportRun(s) as object),
    inputs: [{ tick: 0.5, command: { kind: 'pause-chapter' } }],
  };
  expect(() => importRun(wrongInput)).toThrow(/not loaded/);
});

function completedShort(seed = 42) {
  const s = createGame(seed);
  const ids = s.villagers.map((v) => v.id);
  apply(s, { kind: 'order', ids, target: 'wood' });
  while (s.resources.wood < 180 && s.tick < 180) step(s);
  apply(s, { kind: 'order', ids, target: 'stone' });
  while (s.resources.stone < 120 && s.tick < 300) step(s);
  apply(s, { kind: 'build', ids, building: 'storehouse', x: 600, y: 450 });
  while (!s.buildings.some((b) => b.kind === 'storehouse' && b.complete) && s.tick < 599) step(s);
  expect(s.buildings.some((b) => b.kind === 'storehouse' && b.complete)).toBe(true);
  expect(s.tick).toBeLessThan(600);
  return s;
}

test('short yield preserves the current host fields and HF archive with one exact game continuation', () => {
  const yielded = completedShort(),
    before = structuredClone(yielded);
  const archiveBefore = archiveCommunity(first(yielded).person),
    prefix = structuredClone(yielded.inputs);
  apply(yielded, { kind: 'yield-day' });
  expect((exportRun(yielded) as { schema: number }).schema).toBe(12);
  expect(yielded.shortYield?.cutover).toBe(before.tick);
  expect(yielded.inputs.slice(0, -1)).toEqual(prefix);
  const { shortYield: _receipt, ...host } = yielded;
  expect({ ...host, inputs: host.inputs.filter((input) => input.command.kind !== 'yield-day') }).toEqual(
    before,
  );
  expect(archiveCommunity(first(yielded).person)).toEqual(archiveBefore);
  advance(yielded, 5);
  const restored = importRun(exportRun(yielded));
  expect(restored).toEqual(yielded);
  for (let i = 0; i < 5; i++) {
    step(yielded);
    step(restored);
  }
  expect(restored).toEqual(yielded);
  expect(archiveCommunity(first(restored).person)).toEqual(archiveCommunity(first(yielded).person));
}, 180_000);

test('short yield rejects malformed cutovers and preserves pause and legacy boundaries', () => {
  const checkpoint = completedShort();
  for (const state of [
    createGame(42),
    createGame(42, undefined, { edition: 'settlement-day/1' }),
    createGame(42, undefined, { edition: 'settlement-replies/1' }),
    createGame(42, undefined, { edition: 'settlement-replies/2' }),
  ]) {
    const before = structuredClone(state);
    expect(() => apply(state, { kind: 'yield-day' })).toThrow();
    expect(state).toEqual(before);
  }
  const paused = importRun(exportRun(checkpoint));
  apply(paused, { kind: 'pause-chapter' });
  const beforePaused = structuredClone(paused);
  expect(() => apply(paused, { kind: 'yield-day' })).toThrow();
  expect(paused).toEqual(beforePaused);
  apply(checkpoint, { kind: 'yield-day' });
  for (const command of [
    { kind: 'yield-day' },
    { kind: 'yield-day', surplus: true },
    { kind: 'train' },
    { kind: 'order', ids: ['v1'], target: 'wood' },
  ]) {
    const before = structuredClone(checkpoint);
    expect(() => apply(checkpoint, command as Parameters<typeof apply>[1])).toThrow();
    expect(checkpoint).toEqual(before);
  }
  apply(checkpoint, { kind: 'pause-chapter' });
  for (let i = 0; i < 100 && !checkpoint.chapterPaused; i++) step(checkpoint);
  expect(checkpoint.chapterPaused).toBe(true);
  const held = structuredClone(checkpoint);
  step(checkpoint);
  expect(checkpoint).toEqual(held);
  expect(importRun(exportRun(checkpoint, true))).toEqual(held);
  apply(checkpoint, { kind: 'resume-chapter' });
  const raw = exportRun(checkpoint) as Record<string, unknown>;
  const compact = exportRun(checkpoint, true) as Record<string, unknown>;
  const inputs = checkpoint.inputs;
  for (const bad of [
    { ...raw, schema: 3 },
    { ...raw, unknown: true },
    { ...raw, config: { edition: 'settlement-day/1' } },
    { ...raw, extension: { version: 'short-yield/2', cutover: held.shortYield?.cutover } },
    { ...raw, extension: { version: 'short-yield/1', cutover: 0 } },
    { ...raw, state: { ...checkpoint, won: true } },
    { ...compact, compact: false },
    { ...compact, state: checkpoint },
    { ...compact, inputs: [...inputs, { tick: checkpoint.tick, command: { kind: 'yield-day' } }] },
    { ...compact, inputs: [...inputs, { tick: checkpoint.tick, command: { kind: 'train' } }] },
    { ...compact, inputs: inputs.map((i, n) => (n === 0 ? { ...i, unknown: true } : i)) },
    { ...compact, inputs: inputs.map((i, n) => (n === 0 ? { ...i, command: { kind: 'unknown' } } : i)) },
    {
      ...compact,
      inputs: inputs.map((i, n) => (n === 0 ? { ...i, command: { ...i.command, ids: ['v1', 'v1'] } } : i)),
    },
    { ...compact, tick: Number.MAX_SAFE_INTEGER + 1 },
    { ...compact, hash: 'x'.repeat(20_000_001) },
    JSON.parse(JSON.stringify(compact).replace('"hash":', '"__proto__":{},"hash":')),
  ]) {
    const before = JSON.stringify(bad);
    expect(() => importRun(bad)).toThrow(/not loaded/);
    expect(JSON.stringify(bad)).toBe(before);
  }
  while (!checkpoint.ended) step(checkpoint);
  const ended = structuredClone(checkpoint);
  expect(() => apply(checkpoint, { kind: 'yield-day' })).toThrow();
  expect(checkpoint).toEqual(ended);
});

test('short yield batches honor inactive and recorded pause boundaries and display rename preserves raw bytes', () => {
  const s = completedShort();
  const originalMessage = createGame(42).message;
  expect(originalMessage).toContain('Alder Quay');
  expect(publicPlaceText(originalMessage)).toContain('Mill Bridge');
  apply(s, { kind: 'yield-day' });
  const held = structuredClone(s);
  expect(stepYieldBatch(s, false)).toBe(0);
  expect(s).toEqual(held);
  expect(stepYieldBatch(s, true)).toBe(12);
  expect(s.tick).toBe(held.tick + 12);
  apply(s, { kind: 'pause-chapter' });
  while (!s.chapterPaused) stepYieldBatch(s, true);
  const paused = structuredClone(s);
  expect(stepYieldBatch(s, true)).toBe(0);
  expect(s).toEqual(paused);
  apply(s, { kind: 'resume-chapter' });
  while (!s.ended) expect(stepYieldBatch(s, true)).toBeLessThanOrEqual(12);
  expect(s.tick).toBe(600);
  expect(stepYieldBatch(s, true)).toBe(0);
  expect(s.shortYield?.chronicle.at(-1)).toEqual({ tick: 600, text: s.message });
});
