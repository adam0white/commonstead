import { expect, test } from 'vitest';
import { admissionLine, assignmentText, nextTask, personStatus } from '../src/display.ts';
import { createGame, exportRun, importRun, stateHash } from '../src/sim.ts';

test('semantic status labels explain breaks and preserve replay state', () => {
  const state = createGame(418);
  const before = stateHash(state);
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
  expect(nextTask('move')).toBe('moving to the selected place');
  expect(nextTask('wood')).toBe('collecting prepared boards');
});

test('continuing assignments are complete sentences without old jargon', () => {
  expect(assignmentText('cold station')).toBe('Their current work is preparing cold food.');
  expect(assignmentText('invoice reconciliation')).toBe(
    'Their current work is checking invoices against payments.',
  );
  expect(
    admissionLine({
      cast: { name: 'Dilek' },
      assignment: 'cold station',
      life: { work: 'own-routine', place: 'home' },
      contacts: ['Sam'],
    }),
  ).toBe(
    'Dilek has a current work assignment. Their current work is preparing cold food. They have kept time for their usual routine. They last stopped at home. They read public work notes from Sam. The writers’ views are not recorded.',
  );
});
