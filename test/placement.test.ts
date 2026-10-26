import { expect, test } from 'vitest';
import { openPlacementGround } from '../src/placement.ts';
import { apply, createGame, NODES } from '../src/sim.ts';

test('the displayed edge and spacing keep the actual command boundary', () => {
  const s = createGame(418);
  const selected = ['v1'];
  const obstacles = [...s.buildings, ...NODES];
  expect(openPlacementGround(55, 645, obstacles)).toBe(true);
  expect(openPlacementGround(54.999, 645, obstacles)).toBe(false);
  expect(openPlacementGround(335, 190, obstacles)).toBe(true);
  expect(openPlacementGround(334.999, 190, obstacles)).toBe(false);
  const before = structuredClone(s.resources);
  const refused = { kind: 'build', ids: selected, building: 'house', x: 334.999, y: 190 } as const;
  apply(s, { ...refused, ids: [...selected] });
  expect(s.resources).toEqual(before);
  expect(selected).toEqual(['v1']);
  expect(s.buildings).toHaveLength(1);
  expect(s.message).toBe('Choose open ground, away from cabins and delivered materials.');
  expect(s.inputs.at(-1)?.command).toEqual(refused);
  const accepted = { ...refused, x: 335, ids: [...selected] };
  apply(s, accepted);
  expect(s.resources.wood).toBe(before.wood - 40);
  expect(s.buildings.at(-1)).toMatchObject({ kind: 'house', x: 335, y: 190 });
  expect(s.inputs.at(-1)?.command).toEqual(accepted);
});
