import { describe, expect, test } from 'vitest';
import { apply, createGame, exportRun, importRun, NODES, replay, stateHash, step } from '../src/sim';

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
      expect(v.discovery).toBe(2);
    }
    expect(stateHash(importRun(exportRun(s)))).toBe(stateHash(s));
  });
  test('remembered pressure can defer a private invitation', () => {
    const s = createGame(42);
    apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
    advance(s, 160);
    for (let i = 0; i < 20; i++) apply(s, { kind: 'order', ids: ['v1'], target: 'push' });
    apply(s, { kind: 'order', ids: ['v1'], target: 'rest' });
    advance(s, 5);
    apply(s, { kind: 'order', ids: ['v1'], target: 'listen' });
    expect(first(s).discovery).toBe(0);
    expect(first(s).says).toBe(first(s).person.trace.at(-1)?.suggestion?.says);
    expect(first(s).person.memory.episodes.some((e) => e.targetId === first(s).person.id)).toBe(true);
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
    const before = JSON.stringify(first(a).person.will);
    apply(a, { kind: 'order', ids: ['v1'], target: 'wood' });
    expect(JSON.stringify(first(a).person.will)).toBe(before);
    apply(a, { kind: 'order', ids: ['v1'], target: 'push' });
    expect(JSON.stringify(first(a).person.will)).not.toBe(before);
    expect(
      first(a).person.memory.episodes.some(
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
    expect(s.villagers.every((v) => v.person.engine === '2.21.0')).toBe(true);
    apply(s, { kind: 'train' });
    advance(s, 21);
    expect(s.villagers.length).toBeGreaterThan(8);
    expect(s.villagers.every((v) => v.person.lexicon?.plainEnglish === true)).toBe(true);
    const raw = exportRun(s) as { framework: string };
    expect(raw.framework).toBe('2.21.0');
    expect(importRun(raw)).toEqual(s);
  });

  test('displays the published plain HF reply directly', () => {
    const s = createGame(42);
    apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
    advance(s, 5);
    apply(s, { kind: 'order', ids: ['v1'], target: 'push' });
    expect(first(s).says).toBe('I trust you, so I will go.');
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
