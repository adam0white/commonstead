/** Focused deterministic controls for this host edition. These are builder controls, never player acceptance. */
import assert from 'node:assert/strict';
import { blocked, route } from '../src/paths.ts';
import { EDITION } from '../src/settlement.ts';
import { apply, createGame, exportRun, importRun, stateHash, step } from '../src/sim.ts';

const make = () => createGame(42, undefined, { edition: EDITION });
const advance = (s: ReturnType<typeof make>, n: number) => {
  for (let i = 0; i < n; i++) step(s);
};
const request = (s: ReturnType<typeof make>, ids: string[], action: string, target?: string) =>
  apply(s, { kind: 'settlement', ids, action, ...(target ? { target } : {}) });
const until = (s: ReturnType<typeof make>, condition: () => boolean, bound: number) => {
  for (let i = 0; i < bound && !condition(); i++) step(s);
  assert(condition(), `Control did not reach its actual outcome by tick${s.tick}: ${s.message}`);
};
const story = (s: ReturnType<typeof make>, id: string) => {
  if (s.tick < 60) advance(s, 60 - s.tick);
  request(s, [id], 'story');
  until(s, () => !!s.villagers.find((v) => v.id === id)?.discovery, 100);
};
const body = make(),
  actions = new Set<string>();
for (let i = 0; i < 1800; i++) {
  step(body);
  for (const v of body.villagers) if (v.person.activity) actions.add(v.person.activity.action);
}
assert(body.villagers.every((v) => v.person.now === 1920 && v.person.body.lastSleep));
assert(['eat', 'sleep', 'pray'].every((a) => actions.has(a)));
assert.equal(stateHash(importRun(exportRun(body, true))), stateHash(body));
console.log('day-clock/body/calendar + compact replay:', body.tick, stateHash(body));
const path = route('yard', { x: 225, y: 275 }, { x: 575, y: 275 });
assert(path?.some((p) => p.y > 400 || p.y < 130));
assert(path.every((p) => !blocked('yard', p)));
console.log('path control: actual wall detour', path.length);
const report = make();
request(report, ['v1'], 'inspect');
until(report, () => report.settlement?.events.some((e) => e.text.includes('Nora inspects')) ?? false, 150);
request(report, ['v1', 'v2'], 'talk');
until(report, () => !!report.settlement?.accounts.length, 200);
assert(report.settlement?.accounts.some((a) => a.text.includes('earlier inspection')));
assert.equal(report.villagers[0]?.discovery, 0);
console.log('witness/conversation:', report.settlement?.accounts);
const correction = make();
story(correction, 'v2');
request(correction, ['v2'], 'scene', 'correction');
until(correction, () => correction.settlement?.completed.some((c) => c.scene === 'correction') ?? false, 400);
assert.equal(correction.resources.wood, 80);
assert.equal(correction.settlement?.paper, 3);
request(correction, ['v2'], 'scene', 'visit');
until(correction, () => correction.settlement?.completed.some((c) => c.scene === 'visit') ?? false, 500);
assert.equal(correction.settlement?.actors.v2?.map, 'yard');
console.log('correction + paid visit/return:', correction.tick, correction.settlement?.completed);
const trial = make();
story(trial, 'v1');
story(trial, 'v2');
request(trial, ['v1', 'v2'], 'scene', 'trial');
until(trial, () => trial.settlement?.completed.filter((c) => c.scene === 'trial').length === 2, 300);
assert.equal(trial.resources.wood, 76);
console.log('bilateral fictional grip trial:', trial.tick, trial.settlement?.completed);
const spar = make();
request(spar, ['v1', 'v2'], 'spar');
until(
  spar,
  () => spar.settlement?.events.some((e) => e.text.includes('finish the voluntary practice bout')) ?? false,
  100,
);
console.log('voluntary combat:', spar.tick, spar.message);
const letter = make();
story(letter, 'v7');
request(letter, ['v7'], 'scene', 'letter');
until(letter, () => letter.settlement?.completed.some((c) => c.scene === 'letter') ?? false, 400);
assert.equal(letter.resources.wood, 80);
assert.equal(letter.settlement?.paper, 3);
console.log('actual fictional correspondence:', letter.tick, letter.settlement?.completed);
const telescope = make();
advance(telescope, 740);
story(telescope, 'v4');
request(telescope, ['v4'], 'scene', 'telescope');
until(telescope, () => telescope.settlement?.completed.some((c) => c.scene === 'telescope') ?? false, 250);
console.log('actual evening telescope:', telescope.tick, telescope.message);
