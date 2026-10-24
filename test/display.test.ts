import { expect, test } from 'vitest';
import { displayText, personStatus } from '../src/display.ts';
import { createGame, exportRun, importRun, stateHash } from '../src/sim.ts';

test('display text explains breaks and preserves replay text', () => {
  const state = createGame(418);
  const before = stateHash(state);
  expect(displayText('A short rest, then back to my task.')).toBe(
    'I will rest for a short time, then return to my task.',
  );
  expect(personStatus('waiting / refused')).toBe('has refused this task and is waiting.');
  expect(personStatus('resting; then wood')).toBe(
    'is resting. Then they will resume collecting prepared boards.',
  );
  expect(personStatus('waiting / refused; eating / drinking; then idle')).toContain(
    'has refused work and is eating and drinking.',
  );
  expect(stateHash(importRun(exportRun(state)))).toBe(before);
});

test('recovery uses actual taskLabel output and literal destinations', () => {
  expect(personStatus('resting; then prepared boards')).toBe(
    'is resting. Then they will resume collecting prepared boards.',
  );
  expect(personStatus('eating / drinking; then meals')).toContain('resume collecting meals.');
  expect(personStatus('resting; then b1', [{ id: 'b1', kind: 'house' }])).toContain(
    'resume preparing a guest cabin.',
  );
  expect(personStatus('resting; then b2', [{ id: 'b2', kind: 'storehouse' }])).toContain(
    'resume assembling the storehouse.',
  );
  expect(displayText('Nora → move.')).toBe('Nora will move to the selected place.');
  expect(displayText('Nora → prepared boards.')).toBe('Nora will start collecting prepared boards.');
});
