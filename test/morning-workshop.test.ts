// Prepared source-only. UNRUN: the parent must allocate one CPU lane before this control runs.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createFileSession } from '../src/file-session';
import { archiveCommunity, communityOwner, communityTime, readPerson } from '../src/hf4';
import { morningWorkshopEligibility, morningWorkshopView } from '../src/morning-workshop';
import { openPlacementGround } from '../src/placement';
import { apply, createGame, exportRun, importRun, NODES, type State, stateHash, step } from '../src/sim';
import { storyEnd } from '../src/story-records';

function advance(s: State, until: () => boolean, limit: number) {
  while (!until() && s.tick < limit) {
    const before = s.tick;
    step(s);
    expect(s.tick, 'An ordinary step must advance; a stopped path is a failure.').toBe(before + 1);
    if (s.morningWorkshop && s.message.includes(' is finished.')) {
      expect(s.message).toContain(morningWorkshopView(s)!.objective);
      expect(s.message).not.toMatch(/supplies will stay dry|Before the storm|bring everyone under a roof/);
    }
  }
  expect(until(), `The bounded path did not reach its boundary by ${limit}.`).toBe(true);
}

function equalWorlds(worlds: State[]) {
  const source = worlds[0]!;
  for (const s of worlds.slice(1)) {
    expect(s).toEqual(source);
    expect(s.inputs).toEqual(source.inputs);
    expect(stateHash(s)).toBe(stateHash(source));
    expect(exportRun(s)).toEqual(exportRun(source));
    expect(exportRun(s, true)).toEqual(exportRun(source, true));
    expect(archiveCommunity(s.villagers[0]!.person)).toEqual(archiveCommunity(source.villagers[0]!.person));
  }
}

test('winning short day retains its world through early close, actual morning, paid site and 10:00', async () => {
  const s = createGame(418),
    ids = s.villagers.map((v) => v.id);
  expect(() => apply(s, { kind: 'start-morning-workshop' })).toThrow(/08:00/);
  apply(s, { kind: 'order', ids, target: 'wood' });
  // Existing pressure-control recipe, not idle1934, a seed search or injected state.
  while (!s.ended) {
    const before = s.tick;
    step(s);
    expect(s.tick).toBe(before + 1);
    if (s.ended) break;
    const store = s.buildings.find((b) => b.kind === 'storehouse');
    if (s.resources.wood >= 180 && s.resources.stone < 120 && !store)
      if (s.villagers.some((v) => v.order?.target === 'wood'))
        apply(s, { kind: 'order', ids, target: 'stone' });
    if (!store && s.resources.wood >= 180 && s.resources.stone >= 120)
      apply(s, { kind: 'build', ids, building: 'storehouse', x: 650, y: 500 });
    if (s.tick % 10 === 0 && s.tick >= 60)
      for (const v of s.villagers)
        if (v.recoveryUntil <= s.tick && readPerson(v.person).body.perceived.fatigue > 0.55)
          apply(s, { kind: 'order', ids: [v.id], target: 'rest' });
  }
  expect(s.tick).toBe(600);
  expect(s.won, 'This control must actually win its first day.').toBe(true);
  const storm = structuredClone(s.story!.storm);
  apply(s, { kind: 'pause-chapter' });
  const stormEnding = exportRun(s);
  const stormOwner = communityOwner(s.villagers[0]!.person);
  const detachedStorm = structuredClone(s),
    beforeDetachedStorm = structuredClone(detachedStorm);
  expect(() => apply(detachedStorm, { kind: 'continue-workshop' })).toThrow(/Detached resident view/);
  expect(detachedStorm).toEqual(beforeDetachedStorm);
  apply(s, { kind: 'continue-workshop' });
  expect(communityOwner(s.villagers[0]!.person)).toBe(stormOwner);
  expect(archiveCommunity(s.villagers[0]!.person)).toEqual((stormEnding as { hf: unknown }).hf);
  apply(s, { kind: 'order', ids, target: 'wood' });
  // Gather the actual cost of two sites. Refusal/scarcity is a control failure, never repaired by edits.
  advance(s, () => s.resources.wood >= 80, 1000);
  apply(s, { kind: 'build', ids: ids.slice(0, 4), building: 'house', x: 800, y: 500 });
  const oldCabin = s.buildings.find((b) => b.kind === 'house')!;
  expect(oldCabin).toBeDefined();
  // Exercise a real early close while people are active, then the ordinary recorded resume route.
  const closingTick = s.tick;
  apply(s, { kind: 'evening', action: 'close' });
  advance(s, () => s.ended, closingTick + 150);
  const close = structuredClone(s.story!.close);
  expect(close?.committedAt).toBe(s.tick);
  expect(morningWorkshopEligibility(s).eligible).toBe(false);
  const continuation = structuredClone(s.continuedWorkshop);
  apply(s, { kind: 'continue-workshop' });
  expect(s.continuedWorkshop).toEqual(continuation);
  expect(s.story!.closeHistory).toContainEqual(close);
  expect(s.story!.close).toBeUndefined();
  apply(s, { kind: 'order', ids, target: 'shelter' });
  advance(s, () => s.tick === 2879, 2879);
  const beforeMorning = exportRun(s),
    beforeMorningAtMs = communityTime(s.villagers[0]!.person);
  expect(beforeMorningAtMs).toBeLessThan(s.continuedWorkshop!.endAtMs);
  advance(s, () => s.ended, 2880);
  expect(communityTime(s.villagers[0]!.person)).toBeGreaterThanOrEqual(s.continuedWorkshop!.endAtMs);
  expect(communityTime(s.villagers[0]!.person)).toBeLessThan(s.continuedWorkshop!.endAtMs + 30000);
  expect(s.tick).toBe(2880);
  expect(morningWorkshopEligibility(s).eligible).toBe(true);

  const full = JSON.stringify(exportRun(s)),
    compact = JSON.stringify(exportRun(s, true));
  const fileSession = createFileSession();
  await fileSession.select(new File([full], 'winning-morning.json', { lastModified: 42 }));
  const originalFile = fileSession.original();
  const detachedMorning = fileSession.state()!,
    beforeDetachedMorning = structuredClone(detachedMorning);
  expect(morningWorkshopEligibility(detachedMorning).eligible).toBe(true);
  expect(() => apply(detachedMorning, { kind: 'start-morning-workshop' })).toThrow(/Detached resident view/);
  expect(detachedMorning).toEqual(beforeDetachedMorning);
  // Optional proof artifacts from this exact ordinary trace feed the production UI control.
  // No game state is injected, and no browser control runs as part of this test.
  const evidenceDirectory = process.env.COMMONSTEAD_MORNING_CONTROL_DIR;
  if (evidenceDirectory) {
    await mkdir(evidenceDirectory, { recursive: true });
    for (const [name, raw] of Object.entries({ stormEnding, beforeMorning, morningEnding: JSON.parse(full) }))
      await writeFile(join(evidenceDirectory, `${name}.json`), JSON.stringify(raw), { flag: 'wx' });
    await writeFile(
      join(evidenceDirectory, 'morning-crossing.json'),
      JSON.stringify({
        beforeMorningAtMs,
        atMs: communityTime(s.villagers[0]!.person),
        endAtMs: s.continuedWorkshop!.endAtMs,
      }),
      { flag: 'wx' },
    );
  }
  const worlds = [s, importRun(JSON.parse(full)), importRun(JSON.parse(compact))];
  equalWorlds(worlds);
  for (const world of worlds) {
    const before = exportRun(world) as { hf: unknown },
      owner = communityOwner(world.villagers[0]!.person),
      people = [...world.villagers],
      stock = structuredClone(world.resources),
      buildings = structuredClone(world.buildings),
      story = structuredClone(world.story),
      inputs = structuredClone(world.inputs);
    apply(world, { kind: 'start-morning-workshop' });
    expect(world.ended).toBe(false);
    expect(world.chapterPaused).toBe(false);
    expect(world.pauseRequested).toBe(false);
    expect(communityOwner(world.villagers[0]!.person)).toBe(owner);
    world.villagers.forEach((v, i) => {
      expect(v).toBe(people[i]);
    });
    expect(world.resources).toEqual(stock);
    expect(world.buildings).toEqual(buildings);
    expect(world.story).toEqual(story);
    expect(archiveCommunity(world.villagers[0]!.person)).toEqual(before.hf);
    expect(world.inputs.slice(0, -1)).toEqual(inputs);
    expect(world.inputs.at(-1)).toEqual({ tick: 2880, command: { kind: 'start-morning-workshop' } });
    expect(storyEnd(world)).toBe(3120);
    expect(morningWorkshopView(world)?.targetCabinId).toBe(null);
    expect(morningWorkshopView(world)?.cabinComplete).toBe(false);
    const admittedAtEntry = exportRun(world);
    expect(() => apply(world, { kind: 'start-morning-workshop' })).toThrow();
    expect(exportRun(world)).toEqual(admittedAtEntry);
  }
  equalWorlds(worlds);
  fileSession.continueAtEnd({ kind: 'start-morning-workshop' });
  expect(fileSession.snapshot()).toEqual(exportRun(s));
  expect(fileSession.original()).toEqual(originalFile);
  expect(new TextDecoder().decode(fileSession.original()!.bytes)).toBe(full);
  fileSession.apply({ kind: 'evening', action: 'close' });
  fileSession.advance(1);
  expect(fileSession.state()!.ended).toBe(true);
  const early = morningWorkshopView(fileSession.state()!)!;
  expect(early.deadlineReached).toBe(false);
  expect(early.targetsMet).toBe(false);
  expect(early.resultLine).toContain('not assessed');
  expect(fileSession.original()).toEqual(originalFile);
  fileSession.invalidate();

  for (const world of worlds) {
    const before = world.resources.wood,
      count = world.buildings.length,
      inputs = world.inputs.length;
    // A recorded refused request is not an admitted site and spends nothing.
    apply(world, { kind: 'build', ids: ['v1'], building: 'house', x: 500, y: 350 });
    expect(world.inputs).toHaveLength(inputs + 1);
    expect(world.resources.wood).toBe(before);
    expect(world.buildings).toHaveLength(count);
    expect(morningWorkshopView(world)?.targetCabinId).toBe(null);
    expect(openPlacementGround(700, 375, [...world.buildings, ...NODES])).toBe(true);
    apply(world, { kind: 'build', ids: ids.slice(0, 4), building: 'house', x: 700, y: 375 });
    expect(world.resources.wood).toBe(before - 40);
    expect(world.buildings).toHaveLength(count + 1);
    expect(morningWorkshopView(world)?.targetCabinId).toBe(world.buildings.at(-1)!.id);
    expect(morningWorkshopView(world)?.targetCabinId).not.toBe(oldCabin.id);
    apply(world, { kind: 'order', ids: ids.slice(4), target: 'food' });
  }
  equalWorlds(worlds);
  // Same next legal input and ordinary step. Pause must drain actual work, never assert an instant pause.
  for (const world of worlds) apply(world, { kind: 'pause-chapter' });
  for (const world of worlds) step(world);
  equalWorlds(worlds);
  for (const world of worlds) advance(world, () => world.chapterPaused, 3020);
  equalWorlds(worlds);
  for (const world of worlds) {
    apply(world, { kind: 'resume-chapter' });
    advance(world, () => world.ended, 3120);
    const view = morningWorkshopView(world)!;
    expect(world.tick).toBe(3120);
    expect(communityTime(world.villagers[0]!.person)).toBeGreaterThanOrEqual(view.endAtMs);
    expect(communityTime(world.villagers[0]!.person)).toBeLessThan(view.endAtMs + 30000);
    expect(view.endedAtTick).toBe(3120);
    expect(view.deadlineReached).toBe(true);
    expect(view.countedMeals).toBe(world.resources.food);
    expect(view.mealsMet).toBe(world.resources.food >= 40);
    expect(view.cabinComplete).toBe(world.buildings.find((b) => b.id === view.targetCabinId)!.complete);
    expect(world.story!.storm).toEqual(storm);
    expect(world.story!.closeHistory).toContainEqual(close);
    expect(world.won).toBe(true); // Historical storm, not a morning reward.
    const before = exportRun(world);
    step(world);
    expect(exportRun(world)).toEqual(before);
  }
  equalWorlds(worlds);
  equalWorlds([s, importRun(exportRun(s)), importRun(exportRun(s, true))]);
  expect(JSON.stringify(JSON.parse(full))).toBe(full);
  expect(JSON.stringify(JSON.parse(compact))).toBe(compact);
}, 600_000);
