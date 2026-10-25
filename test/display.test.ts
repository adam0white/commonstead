import { expect, test } from 'vitest';
import { admissionLine, assignmentText, nextTask, personStatus, residentName } from '../src/display.ts';
import { createGame, exportRun, importRun, stateHash } from '../src/sim.ts';

test('semantic status labels explain breaks and preserve replay state', () => {
  const state = createGame(418);
  const before = stateHash(state);
  expect(personStatus('waiting / refused')).toBe('has refused this task and is waiting.');
  expect(personStatus('resting; then wood')).toBe(
    'is resting. Then This person will go back to collecting prepared boards.',
  );
  expect(personStatus('waiting / refused; eating / drinking; then idle')).toContain(
    'has refused work and is eating and drinking.',
  );
  expect(stateHash(importRun(exportRun(state)))).toBe(before);
});

test('recovery uses actual taskLabel output and literal destinations', () => {
  expect(personStatus('resting; then prepared boards')).toBe(
    'is resting. Then This person will go back to collecting prepared boards.',
  );
  expect(personStatus('eating / drinking; then meals')).toContain('go back to collecting meals.');
  expect(personStatus('resting; then b1', [{ id: 'b1', kind: 'house' }])).toContain(
    'go back to preparing a guest cabin.',
  );
  expect(personStatus('resting; then b2', [{ id: 'b2', kind: 'storehouse' }])).toContain(
    'go back to assembling the storehouse.',
  );
  expect(nextTask('move')).toBe('moving to the selected place');
  expect(nextTask('wood')).toBe('collecting prepared boards');
});

test('continuing assignments are complete sentences without old jargon', () => {
  expect(assignmentText('cold station')).toBe('This person is preparing cold food.');
  expect(assignmentText('invoice reconciliation')).toBe('This person is checking invoices against payments.');
  expect(
    admissionLine({
      cast: { name: 'Dilek' },
      assignment: 'cold station',
      life: { work: 'own-routine', place: 'home' },
      contacts: ['Sam'],
    }),
  ).toBe(
    'Dilek has kept time for the usual routine. The last stop was at home. Dilek read public work notes from Sam. The writers’ views are not recorded.',
  );
});

test('named residents and helpers read clearly without changing identity', () => {
  expect(personStatus('resting; then wood', [], 'Nora')).toBe(
    'is resting. Then Nora will go back to collecting prepared boards.',
  );
  expect(personStatus('chapter paused at action boundary')).toBe('has finished and is waiting.');
  const helper = { id: 'v10', name: 'Helper 10' };
  expect(residentName(helper)).toBe('Mina');
  expect(helper.name).toBe('Helper 10');
  expect(residentName({ id: 'v1', name: 'Nora' })).toBe('Nora');
});
