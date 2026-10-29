import { expect, test } from 'vitest';
import { archiveCommunity, communityOwner } from '../src/hf4.ts';
import { PRESSURE } from '../src/pressure.ts';
import { apply, createGame, exportRun, importRun, step } from '../src/sim.ts';

// The same short disclosure is the predecessor after its offered break expires.
// Actual body acts and timed HF outcomes remain authoritative.
test('short disclosure answer survives expired invitation without a repeated break', () => {
  const s = createGame(42, undefined, undefined, PRESSURE);
  while (s.tick < 60) step(s);
  apply(s, { kind: 'order', ids: ['v7'], target: 'rest' });
  while (s.tick < 65) step(s);
  apply(s, { kind: 'order', ids: ['v7'], target: 'listen' });
  expect(s.villagers[6]!.discovery).toBe(1);
  const source = s.story!.sources.find((e) => e.actor === 'v7' && e.choice === 'disclosure')!;
  while (s.tick < 100) step(s);
  expect(s.villagers[6]!.recoveryUntil).toBe(0);
  expect(() => apply(s, { kind: 'reply', ids: ['v7'], branch: 'sevim-name-wrong' })).not.toThrow();
  const before = archiveCommunity(s.villagers[6]!.person);
  expect(s.story!.events.some((e) => e.choice === 'sevim-name-wrong')).toBe(false);
  while (!s.story!.events.some((e) => e.choice === 'sevim-name-wrong') && s.tick < 180) step(s);
  const answer = s.story!.events.find((e) => e.choice === 'sevim-name-wrong');
  expect(answer?.predecessors).toEqual([source.id]);
  expect(answer?.says).toContain('This is still a private draft');
  expect(archiveCommunity(s.villagers[6]!.person)).not.toEqual(before);
  const restored = importRun(exportRun(s));
  for (let i = 0; i < 7; i++) {
    step(s);
    step(restored);
  }
  expect(exportRun(restored)).toEqual(exportRun(s));
});

test('completed short storehouse remainder advances ordinary consequences and can stop without undo', () => {
  const s = createGame(418, undefined, undefined, PRESSURE);
  const ids = s.villagers.map((v) => v.id);
  apply(s, { kind: 'order', ids, target: 'wood' });
  while (!s.buildings.some((b) => b.kind === 'storehouse' && b.complete) && s.tick < 500) {
    step(s);
    if (
      s.resources.wood >= 180 &&
      !s.buildings.some((b) => b.kind === 'storehouse') &&
      s.villagers.some((v) => v.order?.target === 'wood')
    )
      apply(s, { kind: 'order', ids, target: 'stone' });
    if (
      s.resources.wood >= 180 &&
      s.resources.stone >= 120 &&
      !s.buildings.some((b) => b.kind === 'storehouse')
    )
      apply(s, { kind: 'build', ids, building: 'storehouse', x: 650, y: 500 });
    if (s.tick % 10 === 0)
      for (const v of s.villagers)
        if (v.recoveryUntil <= s.tick && v.person.bodyReadout!.perceived.fatigue > 0.55)
          apply(s, { kind: 'order', ids: [v.id], target: 'rest' });
  }
  expect(s.buildings.some((b) => b.kind === 'storehouse' && b.complete)).toBe(true);
  // Actual completed short storehouse, then Dilek's existing specific object work before the storm.
  const builtAt = s.tick;
  apply(s, { kind: 'order', ids: ['v5'], target: 'rest' });
  while (s.tick < builtAt + 5) step(s);
  apply(s, { kind: 'order', ids: ['v5'], target: 'listen' });
  expect(s.villagers[4]!.discovery).toBe(1);
  while (s.tick < builtAt + 40) step(s);
  apply(s, { kind: 'story-act', ids: ['v5'], choice: 'prepare-recording' });
  while (s.tick < 590 && !s.story!.events.some((e) => e.choice === 'prepare-recording')) step(s);
  expect(s.story!.events.some((e) => e.choice === 'prepare-recording')).toBe(true);
  apply(s, { kind: 'story-act', ids: ['v5'], choice: 'advance-recording' });
  while (s.tick < 599 && !s.story!.events.some((e) => e.choice === 'advance-recording')) step(s);
  expect(s.story!.events.some((e) => e.choice === 'advance-recording')).toBe(true);
  expect(s.tick).toBeLessThan(600);
  const reference = importRun(exportRun(s));
  const at = s.tick;
  apply(s, { kind: 'remainder', action: 'start' } as Parameters<typeof apply>[1]);
  expect((s as unknown as { remainder?: { running: boolean } }).remainder?.running).toBe(true);
  for (let i = 0; i < 12; i++) step(s);
  apply(s, { kind: 'remainder', action: 'stop' } as Parameters<typeof apply>[1]);
  expect(s.tick).toBe(at + 12);
  expect((s as unknown as { remainder: { running: boolean } }).remainder.running).toBe(false);
  while (!s.ended) step(s);
  while (!reference.ended) step(reference);
  expect(s.resources).toEqual(reference.resources);
  expect(s.won).toBe(reference.won);
  expect(archiveCommunity(s.villagers[0]!.person)).toEqual(archiveCommunity(reference.villagers[0]!.person));
});

test('actual late unfinished storehouse storm retains people and intelligible building facts', () => {
  const s = createGame(418, undefined, undefined, PRESSURE),
    ids = s.villagers.map((v) => v.id);
  apply(s, { kind: 'order', ids, target: 'wood' });
  while (s.resources.wood < 180 && s.tick < 200) step(s);
  apply(s, { kind: 'order', ids, target: 'stone' });
  while (s.resources.stone < 120 && s.tick < 350) step(s);
  expect(s.resources.wood).toBeGreaterThanOrEqual(180);
  expect(s.resources.stone).toBeGreaterThanOrEqual(120);
  apply(s, { kind: 'order', ids, target: 'shelter' });
  while (s.tick < 599) step(s);
  apply(s, { kind: 'build', ids: ['v1'], building: 'storehouse', x: 650, y: 500 });
  step(s);
  expect(s.won).toBe(false);
  const storm = s.story!.storm as unknown as {
    people: unknown[];
    buildings?: { id: string; kind: string; complete: boolean }[];
  };
  expect(storm.people).toHaveLength(s.villagers.length);
  expect(storm.buildings?.find((b) => b.kind === 'storehouse')?.complete).toBe(false);
  expect(storm.buildings?.find((b) => b.id === 'town')?.complete).toBe(true);
});

test('short storm continues the same retained Run with helper, paid sheet and source world', () => {
  const s = createGame(42, undefined, undefined, PRESSURE),
    ids = s.villagers.map((v) => v.id);
  apply(s, { kind: 'order', ids: ids.slice(1), target: 'food' });
  while (s.resources.food < 35 && s.tick < 50) step(s);
  expect(s.resources.food).toBeGreaterThanOrEqual(35);
  apply(s, { kind: 'train' });
  while (s.tick < 60) step(s);
  expect(s.villagers).toHaveLength(9);
  apply(s, { kind: 'order', ids: ['v1'], target: 'rest' });
  while (s.tick < 65) step(s);
  apply(s, { kind: 'order', ids: ['v1'], target: 'listen' });
  expect(s.villagers[0]!.discovery).toBe(1);
  while (s.tick < 100) step(s);
  apply(s, { kind: 'reply', ids: ['v1'], branch: 'nora-restore-drawing' });
  while (!s.story!.firstResults.length && s.tick < 180) step(s);
  expect(s.story!.firstResults).toHaveLength(1);
  while (!s.ended) step(s);
  apply(s, { kind: 'pause-chapter' });
  const owner = communityOwner(s.villagers[0]!.person);
  const people = [...s.villagers],
    stock = structuredClone(s.resources),
    buildings = structuredClone(s.buildings),
    objects = structuredClone(s.story!.objects),
    prefix = structuredClone(s.inputs),
    hf = archiveCommunity(s.villagers[0]!.person);
  apply(s, { kind: 'continue-workshop' } as Parameters<typeof apply>[1]);
  expect(s.ended).toBe(false);
  expect(communityOwner(s.villagers[0]!.person)).toBe(owner);
  expect(s.villagers).toHaveLength(9);
  s.villagers.forEach((v, i) => {
    expect(v).toBe(people[i]);
  });
  expect(s.resources).toEqual(stock);
  expect(s.buildings).toEqual(buildings);
  expect(s.story!.objects).toEqual(objects);
  expect(s.inputs.slice(0, -1)).toEqual(prefix);
  expect(archiveCommunity(s.villagers[0]!.person)).toEqual(hf);
  apply(s, { kind: 'story-act', ids: ['v1'], choice: 'nora-drawing-next-question' });
  while (!s.story!.events.some((e) => e.choice === 'nora-drawing-next-question') && s.tick < 700) step(s);
  expect(s.story!.events.some((e) => e.choice === 'nora-drawing-next-question')).toBe(true);
  expect(s.story!.sources.filter((e) => e.actor === 'v1' && e.choice === 'disclosure')).toHaveLength(1);
  expect(s.villagers[0]!.person.now * 60000).toBeGreaterThan(hf.current.at);
  const restored = importRun(exportRun(s));
  for (let i = 0; i < 5; i++) {
    step(s);
    step(restored);
  }
  expect(exportRun(restored)).toEqual(exportRun(s));
});

// The retained-yard adapter must pay and obtain two actual public choices.
test('retained yard grip trial uses two real participants and actual boards', () => {
  const s = createGame(42, undefined, undefined, PRESSURE);
  apply(s, { kind: 'order', ids: ['v3', 'v4', 'v5', 'v6', 'v7'], target: 'wood' });
  apply(s, { kind: 'order', ids: ['v8'], target: 'food' });
  while (s.tick < 60) step(s);
  apply(s, { kind: 'order', ids: ['v1'], target: 'rest' });
  while (s.tick < 65) step(s);
  apply(s, { kind: 'order', ids: ['v1'], target: 'listen' });
  while (s.tick < 100) step(s);
  apply(s, { kind: 'reply', ids: ['v1'], branch: 'nora-restore-drawing' });
  while (!s.story!.firstResults.length && s.tick < 180) step(s);
  expect(s.story!.firstResults).toHaveLength(1);
  apply(s, { kind: 'order', ids: ['v3', 'v4', 'v5', 'v6', 'v7', 'v8'], target: 'shelter' });
  while (!s.ended) step(s);
  apply(s, { kind: 'pause-chapter' });
  apply(s, { kind: 'continue-workshop' });
  const before = s.resources.wood;
  apply(s, { kind: 'story-act', ids: ['v1'], choice: 'advance-drawing' });
  while (s.tick < 700 && !['withheld', 'completed', 'interrupted'].includes(s.story!.attempts.at(-1)!.status))
    step(s);
  expect(s.story!.attempts.at(-1)!.status).toBe('withheld');
  expect(s.resources.wood).toBe(before);
  apply(s, { kind: 'order', ids: ['v1', 'v2'], target: 'meal' });
  while (s.villagers.slice(0, 2).some((v) => v.person.activity) && s.tick < 760) step(s);
  apply(s, { kind: 'story-act', ids: ['v1'], choice: 'advance-drawing' });
  while (s.tick < 850 && !['withheld', 'completed', 'interrupted'].includes(s.story!.attempts.at(-1)!.status))
    step(s);
  const a = s.story!.attempts.findLast((a) => a.choice === 'advance-drawing')!;
  expect(a.status, a.reason).toBe('completed');
  expect(a.spentStock?.wood).toBe(4);
  expect(s.resources.wood).toBe(before - 4);
  expect(Object.keys(a.sceneReceipts ?? {})).toEqual(['v1', 'v2']);
  for (const receipts of Object.values(a.sceneReceipts!)) {
    const start = receipts.find((r) => r.payload.stage === 'start')!,
      end = receipts.find((r) => r.payload.stage === 'finish')!;
    expect(end.at - start.at).toBeGreaterThanOrEqual(25 * 0.5 * 60000);
  }
  expect(exportRun(importRun(exportRun(s)))).toEqual(exportRun(s));
});

// CS-R6: close consumes an actual work/body receipt and retains the unfinished order.
test('continued close stops after the active retained work boundary without starting another activity', () => {
  const s = createGame(418, undefined, undefined, PRESSURE);
  while (!s.ended) step(s);
  apply(s, { kind: 'pause-chapter' });
  apply(s, { kind: 'continue-workshop' });
  apply(s, { kind: 'order', ids: ['v3'], target: 'wood' });
  const v = s.villagers[2]!;
  expect(v.person.activity).toBeDefined();
  const activity = v.person.activity!.id,
    at = s.tick;
  apply(s, { kind: 'evening', action: 'close' });
  while (!s.ended && s.tick < at + 150) {
    step(s);
    expect(!v.person.activity || v.person.activity.id === activity).toBe(true);
  }
  expect(s.ended).toBe(true);
  expect(s.tick).toBeLessThan(at + 150);
  expect(v.order?.target).toBe('wood');
  expect(s.story!.close?.committedAt).toBe(s.tick);
  expect(exportRun(importRun(exportRun(s)))).toEqual(exportRun(s));
});

// CS-R10: a real completed collaboration owns its words and separate source/result IDs.
test('completed short collaboration source records its actual result words', () => {
  const s = createGame(42, undefined, undefined, PRESSURE);
  while (s.tick < 60) step(s);
  apply(s, { kind: 'order', ids: ['v3'], target: 'rest' });
  while (s.tick < 65) step(s);
  apply(s, { kind: 'order', ids: ['v3'], target: 'listen' });
  while (s.tick < 100) step(s);
  const disclosure = s.story!.sources.find((e) => e.actor === 'v3' && e.choice === 'disclosure')!;
  apply(s, { kind: 'order', ids: ['v3'], target: 'collaborate' });
  while (!s.story!.events.some((e) => e.actor === 'v3' && e.choice === 'collaboration-dai') && s.tick < 230)
    step(s);
  const result = s.story!.events.find((e) => e.actor === 'v3' && e.choice === 'collaboration-dai')!;
  const source = s.story!.sources.find((e) => e.actor === 'v3' && e.choice === 'collaboration')!;
  expect(result).toBeDefined();
  expect(source.says).toBe(result.says);
  expect(new Set([disclosure.id, source.id, result.id]).size).toBe(3);
  expect(s.story!.objects.find((o) => o.kind === 'card')?.source).toBe(source.id);
  expect(exportRun(importRun(exportRun(s)))).toEqual(exportRun(s));
});

// CS-R8: ordinary legal paid geometry is retained; a trial gets no replacement point.
test('retained actual cabin at the fixed trial target refuses admission without spending boards', () => {
  const s = createGame(42, undefined, undefined, PRESSURE);
  apply(s, { kind: 'order', ids: ['v3', 'v4', 'v5', 'v6', 'v7'], target: 'wood' });
  while (s.tick < 60) step(s);
  apply(s, { kind: 'order', ids: ['v1'], target: 'rest' });
  while (s.tick < 65) step(s);
  apply(s, { kind: 'order', ids: ['v1'], target: 'listen' });
  while (s.tick < 100) step(s);
  apply(s, { kind: 'reply', ids: ['v1'], branch: 'nora-restore-drawing' });
  while (!s.story!.firstResults.length && s.tick < 180) step(s);
  expect(s.story!.firstResults).toHaveLength(1);
  expect(s.resources.wood).toBeGreaterThanOrEqual(40);
  const race = importRun(exportRun(s));
  while (!race.ended) step(race);
  apply(race, { kind: 'pause-chapter' });
  apply(race, { kind: 'continue-workshop' });
  apply(race, { kind: 'story-act', ids: ['v1'], choice: 'advance-drawing' });
  apply(race, { kind: 'build', ids: ['v3', 'v4', 'v5', 'v6', 'v7'], building: 'house', x: 700, y: 475 });
  const raceWood = race.resources.wood;
  step(race);
  expect(race.story!.attempts.at(-1)!.status).toBe('interrupted');
  expect(race.story!.attempts.at(-1)!.spentStock?.wood ?? 0).toBe(0);
  expect(race.resources.wood).toBe(raceWood);
  apply(s, { kind: 'build', ids: ['v3', 'v4', 'v5', 'v6', 'v7'], building: 'house', x: 700, y: 475 });
  while (!s.buildings.some((b) => b.kind === 'house' && b.complete) && s.tick < 550) step(s);
  expect(s.buildings.some((b) => b.kind === 'house' && b.complete && b.x === 700 && b.y === 475)).toBe(true);
  while (!s.ended) step(s);
  apply(s, { kind: 'pause-chapter' });
  apply(s, { kind: 'continue-workshop' });
  const wood = s.resources.wood,
    inputs = s.inputs.length;
  expect(() => apply(s, { kind: 'story-act', ids: ['v1'], choice: 'advance-drawing' })).toThrow(
    /blocked|occupied/,
  );
  expect(s.resources.wood).toBe(wood);
  expect(s.inputs).toHaveLength(inputs);
});
