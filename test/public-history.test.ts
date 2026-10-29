import { expect, test } from 'vitest';
import { apply, createGame, step } from '../src/sim.ts';
import { observedEvents } from '../src/work-observation.ts';

test('ordinary long actual route witness can own a public pair exchange without a new edition', () => {
  const s = createGame(418, undefined, { edition: 'settlement-day/1' });
  apply(s, { kind: 'order', ids: ['v1', 'v2'], target: 'wood' });
  while (s.tick < 17) step(s);
  expect(s.settlement!.dispute).toEqual(['v2', 'v1']);
  expect(s.settlement!.peer?.witnesses[0]?.pair).toEqual(['v1', 'v2']);
  apply(s, { kind: 'settlement', ids: ['v1', 'v2'], action: 'cancel' });
  apply(s, { kind: 'peer', ids: ['v1', 'v2'], map: 'yard', disputeAt: 17, branch: 'route-wait' });
  while (
    s.tick < 250 &&
    ['requested', 'talking', 'speaking'].includes(s.settlement!.peer!.attempts[0]!.status)
  )
    step(s);
  const a = s.settlement!.peer!.attempts[0]!;
  expect(['completed', 'withheld', 'interrupted']).toContain(a.status);
  expect(s.settlement!.routeAgreements).toEqual([]);
  for (const speech of a.speech) if (speech.status === 'completed') expect(speech.text).toBeTruthy();
});
test('interleaved cache display groups real occurrences without losing personal events', () => {
  const raw = [
    { at: 1, text: 'Nora inspects the yard cache.' },
    { at: 2, text: 'Sevim: actual answer.' },
    { at: 3, text: 'Nora inspects the yard cache.' },
  ];
  const before = JSON.stringify(raw),
    shown = observedEvents(raw);
  expect(shown.filter((s) => s.includes('Nora inspects'))).toHaveLength(1);
  expect(shown.join(' ')).toContain('2 times');
  expect(shown.join(' ')).toContain('Sevim: actual answer');
  expect(JSON.stringify(raw)).toBe(before);
});
