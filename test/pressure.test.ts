import { readPerson } from '@adam0white/human-framework';
import { expect, test } from 'vitest';
import { closingLine, PRESSURE, stormSummary } from '../src/pressure.ts';
import { apply, createGame, exportRun, importRun, type State, stateHash, step } from '../src/sim.ts';

const ids = (s: State) => s.villagers.map((v) => v.id);
function buildWhenReady(s: State) {
  if (
    !s.buildings.some((b) => b.kind === 'storehouse') &&
    s.resources.wood >= 180 &&
    s.resources.stone >= 120
  )
    apply(s, { kind: 'build', ids: ids(s), building: 'storehouse', x: 650, y: 500 });
}
function restTired(s: State) {
  if (s.tick % 10 || s.tick < 60) return;
  for (const v of s.villagers)
    if (v.recoveryUntil <= s.tick && readPerson(v.person).body.perceived.fatigue > 0.55)
      apply(s, { kind: 'order', ids: [v.id], target: 'rest' });
}
function play(opening: (s: State) => void, each: (s: State) => void): State {
  const s = createGame(418, undefined, undefined, PRESSURE);
  opening(s);
  while (!s.ended) {
    step(s);
    each(s);
  }
  return s;
}
const boardsThenBallast = (s: State) => {
  if (
    s.resources.wood >= 180 &&
    s.resources.stone < 120 &&
    s.villagers.some((v) => v.order?.target === 'wood')
  )
    apply(s, { kind: 'order', ids: ids(s), target: 'stone' });
};

// Headless control on the New game seed: choices decide the storm, not the interface.
test('a careful crew wins with time left; spending early strength on meals loses the storehouse', () => {
  let finished = -1;
  const careful = play(
    (s) => apply(s, { kind: 'order', ids: ids(s), target: 'wood' }),
    (s) => {
      boardsThenBallast(s);
      buildWhenReady(s);
      restTired(s);
      if (finished < 0 && s.buildings.some((b) => b.kind === 'storehouse' && b.complete)) finished = s.tick;
    },
  );
  expect(careful.won).toBe(true);
  expect(finished).toBeGreaterThan(240);
  expect(finished).toBeLessThan(420);
  const careless = play(
    (s) => apply(s, { kind: 'order', ids: ids(s), target: 'food' }),
    (s) => {
      if (s.tick === 90) apply(s, { kind: 'order', ids: ids(s), target: 'wood' });
      if (s.tick > 90) boardsThenBallast(s);
      buildWhenReady(s);
    },
  );
  expect(careless.won).toBe(false);
  expect(readPerson(careless.villagers[0]!.person).body.perceived.fatigue).toBeGreaterThan(0.55);
});

test('pressure runs replay exactly through schema 8 and refuse leaving the day early', () => {
  const s = createGame(418, undefined, undefined, PRESSURE);
  apply(s, { kind: 'order', ids: ['v1', 'v2'], target: 'wood' });
  for (let i = 0; i < 90; i++) step(s);
  apply(s, { kind: 'order', ids: ['v1'], target: 'push' });
  apply(s, { kind: 'order', ids: ['v2'], target: 'shelter' });
  for (let i = 0; i < 30; i++) step(s);
  const run = exportRun(s) as { schema: number };
  expect(run.schema).toBe(8);
  expect(stateHash(importRun(JSON.parse(JSON.stringify(run))))).toBe(stateHash(s));
  expect(() => apply(s, { kind: 'yield-day' })).toThrow();
  expect(() => importRun({ ...run, rules: 'pressure/0' })).toThrow();
});

test('the ending reacts to how each resident was treated', () => {
  const s = createGame(418, undefined, undefined, PRESSURE);
  apply(s, { kind: 'order', ids: ['v1', 'v2'], target: 'wood' });
  for (let i = 0; i < 70; i++) step(s);
  apply(s, { kind: 'order', ids: ['v1'], target: 'push' });
  apply(s, { kind: 'order', ids: ['v1'], target: 'push' });
  apply(s, { kind: 'order', ids: ['v2'], target: 'rest' });
  apply(s, { kind: 'order', ids: ['v4'], target: 'push' });
  while (s.tick < 560) step(s);
  apply(s, { kind: 'order', ids: ['v2', 'v3'], target: 'shelter' });
  while (!s.ended) step(s);
  const [nora, sam, dai, nerys] = s.villagers;
  if (!nora || !sam || !dai || !nerys) throw new Error('Missing residents');
  expect(closingLine(s, nora)).toContain('You kept insisting');
  expect(closingLine(s, nora)).toContain('caught me outside');
  expect(closingLine(s, sam)).toContain('You gave me a break');
  expect(closingLine(s, sam)).not.toContain('outside');
  expect(closingLine(s, dai)).toContain('Nobody asked me to help');
  // Residents left idle in the hub yard stay dry; an insist on an idle person changes nothing.
  expect(closingLine(s, nerys)).toContain('dry');
  expect(closingLine(s, nerys)).not.toContain('insisted');
  expect(stormSummary(s).join(' ')).toContain('got soaked');
  // Retest 2026-10-27: each resident speaks in their own voice, even with identical treatment.
  expect(new Set(s.villagers.map((v) => closingLine(s, v))).size).toBe(s.villagers.length);
  expect(closingLine(s, sam)).toContain('boards');
});
