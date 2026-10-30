// HF4 current-policy controls use the single canonical long scenario. Historical source stays frozen at c98.
import { expect, test } from 'vitest';
import { archiveCommunity } from '../src/hf4.ts';
import { PRESSURE } from '../src/pressure.ts';
import { apply, createGame, exportRun, importRun, step } from '../src/sim.ts';
import { requireSupportedProducer } from '../src/story-records.ts';

// Public fixed trace: completing a pair-bound yield must precede one actual earlier-work reoffer.
// Calling a selected yield completed or treating another pair as the original must fail this control.
test('physical yield retains actual earlier work and reoffers it only after completion', () => {
  const s = createGame(418, undefined, { edition: 'settlement-replies/2' });
  for (const [i, id] of ['v1', 'v2', 'v3'].entries())
    apply(s, { kind: 'order', ids: [id], target: i < 2 ? 'wood' : 'stone' });
  while (s.tick < 17) step(s);
  expect(s.settlement!.dispute).toEqual(['v2', 'v1']);
  const job = structuredClone(s.settlement!.actors.v2!.job);
  apply(s, { kind: 'yield-return', ids: ['v2'] });
  expect(s.yieldReturn?.[0]?.priorJob).toEqual(job);
  expect(s.yieldReturn?.[0]?.stage).not.toBe('reoffered');
  while (s.tick < 220 && s.yieldReturn?.[0]?.stage !== 'reoffered') step(s);
  const a = s.yieldReturn?.[0];
  expect(a?.completedAt).toBeDefined();
  expect(a?.stage).toBe('reoffered');
  expect(s.settlement!.routeAgreements).toContain('v1/v2');
  expect(s.settlement!.actors.v2!.job?.kind).toBe('gather');
  const full = importRun(exportRun(s)),
    compact = importRun(exportRun(s, true));
  for (let i = 0; i < 17; i++) {
    step(s);
    step(full);
    step(compact);
  }
  expect(exportRun(full)).toEqual(exportRun(s));
  expect(exportRun(compact)).toEqual(exportRun(s));
});

test('same-actor completed first answer opens one real second exchange', () => {
  const s = createGame(42, undefined, { edition: 'settlement-replies/2' });
  apply(s, { kind: 'order', ids: ['v1'], target: 'move', x: 525, y: 475 });
  while (s.tick < 60) step(s);
  apply(s, { kind: 'settlement', ids: ['v1'], action: 'story' });
  while (!s.villagers[0]!.discovery && s.tick < 160) step(s);
  apply(s, { kind: 'reply', ids: ['v1'], branch: 'nora-restore-drawing' });
  while (!s.story!.firstResults!.length && s.tick < 260) step(s);
  expect(s.story!.firstResults).toHaveLength(1);
  apply(s, { kind: 'story-act', ids: ['v1'], choice: 'nora-drawing-next-question' });
  const pending = JSON.stringify(s);
  apply(s, { kind: 'long-roof-break-return', ids: ['v1'] });
  expect(JSON.stringify(s)).toBe(pending);
  while (!s.story?.events.some((e) => e.choice === 'nora-drawing-next-question') && s.tick < 360) step(s);
  expect(s.story?.events.find((e) => e.choice === 'nora-drawing-next-question')?.says).toContain(
    'The person who will use it.',
  );
  expect(s.story!.paper).toBe(3);
});

test('standard Dai completes an actual card; player viewing alone never supplies Nora attendance', () => {
  const s = createGame(418, undefined, undefined, PRESSURE);
  while (s.tick < 60) step(s);
  apply(s, { kind: 'order', ids: ['v3'], target: 'rest' });
  while (s.tick < 65) step(s);
  apply(s, { kind: 'order', ids: ['v3'], target: 'listen' });
  expect(s.villagers[2]!.discovery).toBe(1);
  apply(s, { kind: 'story-act', ids: ['v3'], choice: 'dai-question-card' });
  const pending = JSON.stringify(s);
  apply(s, { kind: 'roof-break-return', ids: ['v3'] });
  expect(JSON.stringify(s)).toBe(pending);
  while (!s.story?.objects.some((o) => o.kind === 'card' && !o.unfinished) && s.tick < 130) step(s);
  expect(s.story?.objects.find((o) => o.kind === 'card')?.text).toContain(
    'old temporary solution: not checked',
  );
  expect(s.story?.reads).toHaveLength(0);
  const offers = archiveCommunity(s.villagers[2]!.person)
    .history.flatMap((tx) => tx.inputs)
    .filter((i) => i.kind === 'offers.received')
    .find((i) => i.kind === 'offers.received' && i.payload.offers.some((o) => o.id.startsWith('story:')));
  if (!offers || offers.kind !== 'offers.received') throw new Error('Missing actual story offers');
  expect(offers.payload.offers.map((o) => o.actionId)).toEqual(
    expect.arrayContaining(['talk', 'rest', 'drink', 'eat']),
  );
  expect(offers.payload.offers.find((o) => o.actionId === 'rest')?.expected.needs.rest).toBe(0.65);
});

// A shown card cannot supply this observation or its writing result.
test('Nora reaches and attends the exact card before annotating; current native files continue', () => {
  const s = createGame(418, undefined, undefined, PRESSURE);
  while (s.tick < 60) step(s);
  apply(s, { kind: 'order', ids: ['v3'], target: 'rest' });
  while (s.tick < 65) step(s);
  apply(s, { kind: 'order', ids: ['v3'], target: 'listen' });
  apply(s, { kind: 'story-act', ids: ['v3'], choice: 'dai-question-card' });
  while (!s.story?.objects.some((o) => o.kind === 'card' && !o.unfinished) && s.tick < 130) step(s);
  const card = s.story!.objects.find((o) => o.kind === 'card')!;
  const unreceived = JSON.stringify(s);
  expect(() => apply(s, { kind: 'story-act', ids: ['v1'], choice: 'nora-card-question' })).toThrow(
    /not read/,
  );
  expect(JSON.stringify(s)).toBe(unreceived);
  apply(s, { kind: 'story-act', ids: ['v1'], choice: 'read-card' });
  while (s.story!.attempts.at(-1)!.status !== 'completed' && s.tick < 180) step(s);
  const read = s.story!.reads[0]!;
  expect(read).toMatchObject({ actor: 'v1', objectId: card.id, version: 1 });
  expect(read.receipts[0]?.perceptId).toBeDefined();
  expect(read.receipts[0]?.summary).toContain(card.id);
  apply(s, { kind: 'story-act', ids: ['v1'], choice: 'nora-card-question' });
  while (!s.story!.events.some((e) => e.choice === 'nora-card-question') && s.tick < 240) step(s);
  expect(card.version).toBe(2);
  expect(card.text).toContain('old temporary solution: not checked');
  expect(s.story!.reads.some((e) => e.actor === 'v3' && e.version === 2)).toBe(false);
  const untouched = JSON.stringify(s);
  expect(() => requireSupportedProducer(s)).toThrow(/cannot leave this chapter/);
  expect(JSON.stringify(s)).toBe(untouched);
  const raw = exportRun(s) as Record<string, unknown>;
  const full = importRun(raw),
    compact = importRun(exportRun(s, true));
  const forged = structuredClone(raw) as { inputs: { command: { kind: string } }[] };
  forged.inputs = forged.inputs.filter((i) => i.command.kind !== 'story-act');
  expect(() => importRun(forged)).toThrow();
  for (let i = 0; i < 17; i++) {
    step(s);
    step(full);
    step(compact);
  }
  expect(exportRun(full)).toEqual(exportRun(s));
  expect(exportRun(compact)).toEqual(exportRun(s));
});

test('explicit cancellation stops earlier-work revival and preserves the actual carried quantity', () => {
  const s = createGame(418, undefined, { edition: 'settlement-replies/2' });
  for (const [i, id] of ['v1', 'v2', 'v3'].entries())
    apply(s, { kind: 'order', ids: [id], target: i < 2 ? 'wood' : 'stone' });
  while (s.tick < 17) step(s);
  apply(s, { kind: 'yield-return', ids: ['v2'] });
  apply(s, { kind: 'settlement', ids: ['v2'], action: 'cancel' });
  expect(s.yieldReturn![0]!.stage).toBe('cancelled');
  while (s.tick < 26) step(s);
  const carried = structuredClone(s.settlement!.actors.v1!.carried);
  expect(carried?.amount).toBeGreaterThan(0);
  apply(s, { kind: 'settlement', ids: ['v1'], action: 'cancel' });
  expect(s.settlement!.actors.v1!.carried).toEqual(carried);
  while (s.tick < 100) step(s);
  expect(s.yieldReturn![0]!.stage).toBe('cancelled');
  expect(s.settlement!.actors.v2!.job).toBeNull();
});

// Evening work needs its own actual object. A building or storm never grants eight stories.
test('later work keeps real costs and closes at its actual boundary with truthful resident facts', () => {
  const s = createGame(42, undefined, { edition: 'settlement-replies/2' });
  apply(s, { kind: 'build', ids: ['v1', 'v2'], building: 'house', x: 653, y: 503 });
  while (s.tick < 60) step(s);
  apply(s, { kind: 'settlement', ids: ['v5'], action: 'story' });
  while (!s.villagers[4]!.discovery && s.tick < 160) step(s);
  apply(s, { kind: 'story-act', ids: ['v5'], choice: 'prepare-recording' });
  while (!s.story?.objects.some((o) => o.kind === 'recording' && !o.unfinished) && s.tick < 280) step(s);
  expect(s.buildings.some((b) => b.kind === 'house' && b.complete)).toBe(true);
  expect(() => apply(s, { kind: 'story-act', ids: ['v7'], choice: 'advance-draft' })).toThrow(
    /disclosure|prepared/,
  );
  apply(s, { kind: 'story-act', ids: ['v5'], choice: 'advance-recording' });
  while (!s.story!.events.some((e) => e.choice === 'advance-recording') && s.tick < 300) step(s);
  expect(s.story!.events.some((e) => e.choice === 'advance-recording')).toBe(true);
  expect(s.story!.paper).toBe(4);
  expect(() => apply(s, { kind: 'evening', action: 'close' })).toThrow(/storm/);
  while (s.tick < 900) step(s);
  apply(s, { kind: 'evening', action: 'close' });
  apply(s, { kind: 'evening', action: 'keep-playing' });
  expect(s.ended).toBe(false);
  apply(s, { kind: 'evening', action: 'close' });
  while (!s.ended && s.tick < 1100) step(s);
  expect(s.tick).toBeLessThan(1800);
  expect(s.story!.close?.committedAt).toBe(s.tick);
  expect(importRun(exportRun(s, true))).toEqual(s);
}, 120000);

test('interrupted authored correction reuses its spent sheet and needs actual native completion', () => {
  const s = createGame(42, undefined, { edition: 'settlement-replies/2' });
  apply(s, { kind: 'build', ids: ['v1'], building: 'house', x: 653, y: 503 });
  while (s.tick < 60) step(s);
  apply(s, { kind: 'settlement', ids: ['v2'], action: 'story' });
  while (!s.villagers[1]!.discovery && s.tick < 170) step(s);
  apply(s, { kind: 'story-act', ids: ['v2'], choice: 'prepare-game-note' });
  while (!s.story?.events.some((e) => e.choice === 'prepare-game-note') && s.tick < 270) step(s);
  while (!s.buildings.some((b) => b.kind === 'house' && b.complete) && s.tick < 400) step(s);
  apply(s, { kind: 'story-act', ids: ['v2'], choice: 'advance-game-note' });
  while (
    !(
      s.settlement!.actors.v2!.running?.purpose === 'job' &&
      s.settlement!.actors.v2!.running?.job?.kind === 'scene'
    ) &&
    s.tick < 650
  )
    step(s);
  expect(s.story!.paper).toBe(2);
  apply(s, { kind: 'settlement', ids: ['v2'], action: 'cancel' });
  expect(s.story!.attempts.at(-1)!.status).toBe('interrupted');
  expect(importRun(exportRun(s, true))).toEqual(s);
  apply(s, { kind: 'story-act', ids: ['v2'], choice: 'advance-game-note' });
  while (!s.story!.events.some((e) => e.choice === 'advance-game-note') && s.tick < 800) step(s);
  expect(s.story!.events.some((e) => e.choice === 'advance-game-note')).toBe(true);
  expect(s.story!.paper).toBe(2);
  expect(() => apply(s, { kind: 'story-act', ids: ['v2'], choice: 'pack-game-note' })).toThrow(
    /already completed/,
  );
  expect(
    s
      .story!.attempts.at(-1)!
      .sceneReceipts?.v2?.some((i) => i.payload.stage === 'finish' && i.payload.disposition === 'completed'),
  ).toBe(true);
});

test('a real storm ends an unfinished yield-return sequence without reviving earlier work', () => {
  const s = createGame(418, undefined, { edition: 'settlement-replies/2' });
  for (const [i, id] of ['v1', 'v2', 'v3'].entries())
    apply(s, { kind: 'order', ids: [id], target: i < 2 ? 'wood' : 'stone' });
  while (s.tick < 895) step(s);
  expect(s.settlement!.dispute).toContain('v2');
  apply(s, { kind: 'yield-return', ids: ['v2'] });
  while (s.tick < 930) step(s);
  const attempt = s.yieldReturn![0]!;
  expect(attempt.stage).toBe('unavailable');
  expect(attempt.reason).toMatch(/storm/);
  expect(attempt.completedAt).toBeUndefined();
  expect(s.settlement!.storm).toBe(true);
}, 120000);
