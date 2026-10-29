import { expect, test } from 'vitest';
import { closingLine, PRESSURE } from '../src/pressure';
import { closingSpeech } from '../src/public-ending';
import { apply, createGame, exportRun, importRun, stateHash, step } from '../src/sim';

// The short-day ending restores the resident's phrasebook voice, not a new timed utterance.
test('the storm ending quotes each resident’s own reaction without changing speech history or replay', () => {
  const s = createGame(418, undefined, undefined, PRESSURE);
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  while (!s.ended) step(s);
  const before = exportRun(s);
  const lines = s.villagers.map((v) => closingSpeech(s, v, (text) => text));
  for (const [i, v] of s.villagers.entries()) {
    expect(lines[i]).toBe(`<p class="speech">“${closingLine(s, v)}”</p>`);
    expect(lines[i]).toContain('I ');
  }
  expect(new Set(lines).size).toBe(s.villagers.length);
  expect(exportRun(s)).toEqual(before);
  expect(stateHash(importRun(before))).toBe(stateHash(s));
});
