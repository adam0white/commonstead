import { expect, test } from 'vitest';
import { readPerson } from '../src/hf4';
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
async function play(opening: (s: State) => void, each: (s: State) => void): Promise<State> {
  const s = createGame(418, undefined, undefined, PRESSURE);
  opening(s);
  for (let n = 0; !s.ended && n < 600; n++) {
    const before = s.tick;
    step(s);
    if (s.tick <= before) throw new Error(`Pressure day stopped at tick ${s.tick}.`);
    each(s);
    if (n % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(s.ended).toBe(true);
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
test('public work completes a real storehouse before the actual storm check', async () => {
  let finished = -1;
  const careful = await play(
    (s) => apply(s, { kind: 'order', ids: ids(s), target: 'wood' }),
    (s) => {
      boardsThenBallast(s);
      buildWhenReady(s);
      restTired(s);
      if (finished < 0 && s.buildings.some((b) => b.kind === 'storehouse' && b.complete)) finished = s.tick;
    },
  );
  expect(careful.won).toBe(true);
  expect(finished).toBeGreaterThan(0);
  expect(finished).toBeLessThan(600);
  // The storm result is the actual completed physical site, never an accepted order alone.
  expect(careful.won).toBe(careful.buildings.some((b) => b.kind === 'storehouse' && b.complete));
  expect(stormSummary(careful).join(' ')).toMatch(/dry store/);
}, 120_000);

test('pressure runs replay exactly through schema 8 and refuse leaving the day early', () => {
  const s = createGame(418, undefined, undefined, PRESSURE);
  apply(s, { kind: 'order', ids: ['v1', 'v2'], target: 'wood' });
  for (let i = 0; i < 10; i++) step(s);
  apply(s, { kind: 'order', ids: ['v1'], target: 'push' });
  apply(s, { kind: 'order', ids: ['v2'], target: 'shelter' });
  for (let i = 0; i < 10; i++) step(s);
  const run = exportRun(s) as { schema: number };
  expect(run.schema).toBe(8);
  expect(stateHash(importRun(JSON.parse(JSON.stringify(run))))).toBe(stateHash(s));
  expect(() => apply(s, { kind: 'yield-day' })).toThrow();
  expect(() => importRun({ ...run, rules: 'pressure/0' })).toThrow();
}, 120_000);

test('closing words reflect accepted treatment and actual current shelter', async () => {
  const s = createGame(418, undefined, undefined, PRESSURE);
  apply(s, { kind: 'order', ids: ['v1', 'v2'], target: 'wood' });
  for (let i = 0; i < 70; i++) step(s);
  apply(s, { kind: 'order', ids: ['v1'], target: 'push' });
  apply(s, { kind: 'order', ids: ['v1'], target: 'push' });
  apply(s, { kind: 'order', ids: ['v2'], target: 'rest' });
  apply(s, { kind: 'order', ids: ['v4'], target: 'push' });
  apply(s, { kind: 'order', ids: ['v2', 'v3'], target: 'shelter' });
  for (let n = 0; n < 40; n++) {
    step(s);
    if (n % 10 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
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
  // Retest 2026-10-27: each resident speaks in their own voice, even with identical treatment.
  expect(new Set(s.villagers.map((v) => closingLine(s, v))).size).toBe(s.villagers.length);
  expect(closingLine(s, sam)).toContain('boards');
}, 120_000);
