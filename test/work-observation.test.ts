// HF4 current-policy controls use the single canonical long scenario. Historical source stays frozen at c98.
import { expect, test } from 'vitest';
import { apply, createGame, exportRun, importRun, stateHash, step } from '../src/sim.ts';
import {
  currentNotice,
  invitationReadiness,
  milestone,
  observedEvents,
  supplyReadiness,
  WorkObservation,
} from '../src/work-observation.ts';

test('observed break completion reports the actual return without certifying recovery or changing the run', () => {
  const s = createGame(418);
  const observation = new WorkObservation();
  const nora = s.villagers[0];
  if (!nora) throw new Error('Missing Nora');
  const see = () => observation.observe(s.tick, s.villagers, s.buildings);
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  for (let i = 0; i < 214; i++) {
    step(s);
    see();
  }
  apply(s, { kind: 'order', ids: ['v1'], target: 'rest' });
  see();
  expect(observation.line(nora, s.tick, s.buildings)).toContain('35 seconds remain');
  for (let i = 0; i < 35; i++) {
    step(s);
    see();
  }
  const before = stateHash(s);
  const line = observation.line(nora, s.tick, s.buildings);
  expect(line).toContain('finished resting');
  expect(line).toMatch(
    /Nora felt (very tired|tired|a little tired) before the break and feels [a-z ]+ now|did not change how tired Nora feels/,
  );
  expect(line).not.toContain('does not establish');
  expect(line).toContain('collecting prepared boards');
  expect(line).toContain('working');
  expect(nora.says).toContain('I am tired');
  expect(line).not.toMatch(/healed|fully rested|fatigue|trust/);
  expect(stateHash(s)).toBe(before);
  expect(stateHash(importRun(exportRun(s)))).toBe(before);
  apply(s, { kind: 'order', ids: ['v1'], target: 'rest' });
  see();
  step(s);
  see();
  apply(s, { kind: 'order', ids: ['v1'], target: 'move', x: 450, y: 425 });
  see();
  expect(observation.line(nora, s.tick, s.buildings)).toContain('ended before');
});

test('one present-work view separates queued requests, supplies in transit and missing recovery history', () => {
  const s = createGame(418, undefined, { edition: 'settlement-replies/2' });
  const observation = new WorkObservation();
  const nora = s.villagers[0];
  if (!nora || !s.settlement) throw new Error('Missing day');
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  const before = JSON.stringify(s);
  const pending = observation.summary(s, nora);
  expect(pending).toContain('Request waiting');
  expect(pending).toContain('collect and return prepared boards');
  expect(pending).toContain('No break has ended since this view was opened.');
  expect(pending).not.toContain('will go back');
  expect(JSON.stringify(s)).toBe(before);
  let carried = false;
  for (let i = 0; i < 300 && !carried; i++) {
    step(s);
    carried = !!s.settlement.actors.v1?.carried;
  }
  expect(carried).toBe(true);
  const line = observation.summary(s, nora);
  expect(line).toMatch(/Carrying: about \d+(?:\.\d)? prepared boards/);
  expect(line).toContain('not yet in the shared store');
  expect(line).toContain('Last words');
});

test('invitation explains the actual remaining gate and readiness never promises assent', () => {
  const s = createGame(418);
  expect(invitationReadiness(s, [], 'listen')).toContain('Select one person');
  expect(invitationReadiness(s, ['v1'], 'listen')).toContain('60 game seconds');
  for (let i = 0; i < 60; i++) step(s);
  expect(invitationReadiness(s, ['v1'], 'listen')).toContain('Offer this person a break');
  apply(s, { kind: 'order', ids: ['v1'], target: 'rest' });
  expect(invitationReadiness(s, ['v1'], 'listen')).toContain('5 game seconds');
  for (let i = 0; i < 5; i++) step(s);
  expect(invitationReadiness(s, ['v1'], 'listen')).toContain('30 game seconds remain');
  expect(invitationReadiness(s, ['v1'], 'listen')).toContain('may still decline');
  expect(invitationReadiness(s, ['v1'], 'collaborate')).toContain('actual disclosure');
  for (let i = 0; i < 30; i++) step(s);
  expect(invitationReadiness(s, ['v1'], 'listen')).toContain('Offer this person a break');
});

test('the current milestone distinguishes completed preparation from a future storm without changing history', () => {
  const s = createGame(418);
  expect(milestone(s)).toContain('Finish the storehouse');
  s.buildings.push({ id: 'proof-site', kind: 'storehouse', x: 825, y: 575, progress: 1, complete: true });
  s.message = 'The storm will arrive in two minutes. Finish the storehouse.';
  const before = JSON.stringify(s);
  expect(milestone(s)).toContain('The storehouse is ready');
  expect(milestone(s)).toContain('storm still arrives at 10:00');
  expect(milestone(s)).not.toContain('Finish the storehouse');
  expect(currentNotice(s)).toBe(milestone(s));
  expect(JSON.stringify(s)).toBe(before);
});

test('display groups repeated dated observations without discarding the original history', () => {
  const events = [
    { at: 1, text: 'Sam checks supplies.' },
    { at: 4, text: 'Sam checks supplies.' },
    { at: 9, text: 'Nora returns.' },
  ];
  const before = JSON.stringify(events);
  expect(observedEvents(events)).toEqual([
    '0:01–0:04 (2 times) into this game: Sam checks supplies.',
    '0:09 into this game: Nora returns.',
  ]);
  expect(JSON.stringify(events)).toBe(before);
});

// Causal control: real collection and clock steps change public facts, reading never advances a run.
test('counted supply and story projections follow real inputs and preserve exact continuation', () => {
  const s = createGame(418, undefined, { edition: 'settlement-replies/2' });
  const first = invitationReadiness(s, ['v1'], 'listen');
  expect(first).toContain('60 game seconds');
  expect(first).toContain('every speed');
  for (let i = 0; i < 17; i++) step(s);
  expect(invitationReadiness(s, ['v1'], 'listen')).toContain('43 game seconds');
  const short = createGame(418);
  const ids = short.villagers.map((v) => v.id);
  expect(supplyReadiness(short)).toContain('100 more boards');
  apply(short, { kind: 'order', ids, target: 'wood' });
  while (short.resources.wood < 180 && short.tick < 200) step(short);
  expect(supplyReadiness(short)).toContain('Boards are enough');
  expect(supplyReadiness(short)).toContain('120 more ballast bags');
  apply(short, { kind: 'order', ids, target: 'stone' });
  while (short.resources.stone < 120 && short.tick < 400) step(short);
  expect(supplyReadiness(short)).toContain('Ballast bags are enough');
  for (const current of [s, short]) {
    const before = JSON.stringify(current);
    for (let i = 0; i < 20; i++) {
      supplyReadiness(current);
      invitationReadiness(current, ['v1'], 'listen');
    }
    expect(JSON.stringify(current)).toBe(before);
    const full = importRun(exportRun(current)),
      compact = importRun(exportRun(current, true));
    for (let i = 0; i < 9; i++) {
      step(current);
      step(full);
      step(compact);
    }
    expect(full).toEqual(current);
    expect(compact).toEqual(current);
  }
});
