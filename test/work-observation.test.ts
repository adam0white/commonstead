import { expect, test } from 'vitest';
import { apply, createGame, exportRun, importRun, stateHash, step } from '../src/sim.ts';
import { WorkObservation } from '../src/work-observation.ts';

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
