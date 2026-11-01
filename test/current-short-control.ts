import { expect } from 'vitest';
import { apply, createGame, type State, step } from '../src/sim';

/** Current pressure setup for existing training controls. Earn meals through public actions;
 * never edit stock, clocks, people, RNG or the short scenario's difficulty. */
export function fundedShort(seed: number): State {
  const s = createGame(seed);
  collectTrainingMeals(s);
  return s;
}

export function collectTrainingMeals(s: State) {
  const until = s.tick + 180;
  const ids = s.villagers.map((v) => v.id);
  apply(s, { kind: 'order', ids, target: 'food' });
  while (s.resources.food < 110 && s.tick < until) step(s);
  expect(s.resources.food).toBeGreaterThanOrEqual(110);
  apply(s, { kind: 'order', ids, target: 'move', x: 500, y: 425 });
}
