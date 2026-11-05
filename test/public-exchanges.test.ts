import { readRunHistory } from '@adam0white/human-framework';
// HF4 current-policy controls use the single canonical long scenario. Historical source stays frozen at c98.
import { expect, test } from 'vitest';
import { publicCommands } from '../src/public-voice-content';
import { apply, createGame, type GameCommand } from '../src/sim';

// Public speech scope: a visible role is not a speaking receipt or a private disclosure.
test('a chosen public introduction owns a request without inventing completed speech', () => {
  const s = createGame(418);
  expect(s.story).not.toHaveProperty('publicExchanges');
  apply(s, { kind: 'public-exchange', ids: ['v1'], topic: 'role' } as unknown as GameCommand);
  const exchanges = (
    s.story as unknown as { publicExchanges?: { status: string; lines: { text: string }[] }[] }
  )?.publicExchanges;
  expect(exchanges).toHaveLength(1);
  expect(exchanges![0]!.status).toBe('requested');
  expect(exchanges![0]!.lines[0]!.text).toBe('I design repairs and make things.');
  expect(s.villagers[0]!.discovery).toBe(0);
});

import { CAST } from '../src/cast';
import { archiveCommunity } from '../src/hf4';
import { publicUtterances } from '../src/public-exchanges';
import { PUBLIC_ROLES, publicRole, publicVoiceOffer } from '../src/public-voice-content';
import { exportRun, importRun, step } from '../src/sim';

test('finite public words bind current native identity and public assignment only', () => {
  const s = createGame(418);
  expect(s.villagers.map((v) => publicRole(s, v).text)).toEqual(PUBLIC_ROLES);
  expect(PUBLIC_ROLES[4]).not.toContain('organise');
  for (const [i, v] of s.villagers.entries()) expect(publicRole(s, v).nativeId).toBe(CAST[i]!.castId);
  const before = JSON.stringify(exportRun(s));
  expect(() =>
    apply(s, { kind: 'public-exchange', ids: ['v1'], topic: 'work', sourceId: 'input:0' }),
  ).toThrow(/actual dated/);
  expect(JSON.stringify(exportRun(s))).toBe(before);
  expect(() =>
    publicVoiceOffer(s, {
      kind: 'public-exchange',
      ids: ['v1', 'v2'],
      topic: 'closing',
      sourceId: 'missing',
    }),
  ).toThrow();
});

// A requested line must remain absent until an actual finish. No new act means no lazy state.
test('actual introduction finishes through HF and replays the whole native run', () => {
  const s = createGame(418);
  apply(s, { kind: 'public-exchange', ids: ['v1'], topic: 'role' });
  expect(publicUtterances(s, 'v1')).toEqual([]);
  step(s);
  expect(publicUtterances(s, 'v1')).toEqual([]);
  while (s.tick < 8) step(s);
  const a = s.story!.publicExchanges![0]!;
  expect(a.status).toBe('completed');
  expect(publicUtterances(s, 'v1')[0]!.text).toBe(PUBLIC_ROLES[0]);
  expect(
    a.participants[0]!.resolutions!.some(
      (i) => i.payload.stage === 'finish' && i.payload.disposition === 'completed',
    ),
  ).toBe(true);
  expect(s.villagers[0]!.discovery).toBe(0);
  const copy = importRun(exportRun(s));
  expect(exportRun(copy)).toEqual(exportRun(s));
  expect(archiveCommunity(copy.villagers[0]!.person)).toEqual(archiveCommunity(s.villagers[0]!.person));
});

test('ordinary pair physically meets before independent speech and attention receipts', () => {
  const s = createGame(418, undefined, { edition: 'settlement-replies/2' });
  apply(s, { kind: 'public-exchange', ids: ['v4', 'v8'], topic: 'role' });
  while (s.tick < 100 && !s.story!.publicExchanges![0]!.endedAt) step(s);
  const a = s.story!.publicExchanges![0]!;
  expect(a.status).toBe('completed');
  for (const p of a.participants) {
    expect(p.completedAt).toBeDefined();
    expect(p.heard).toHaveLength(1);
    expect(p.heard![0]!.receipts.length).toBeGreaterThan(0);
  }
  expect(s.settlement!.routeAgreements).toEqual([]);
  expect(exportRun(importRun(exportRun(s)))).toEqual(exportRun(s));
});

// One fixed trace exposes drain/reoffer and close ownership without changing body or choice state.
test('work request waits for the actual boundary and a later order cancels its reoffer', () => {
  const s = createGame(418);
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  const original = s.villagers[0]!.person.activity?.id;
  apply(s, { kind: 'public-exchange', ids: ['v1'], topic: 'work', sourceId: 'input:0' });
  expect(s.villagers[0]!.person.activity?.id).toBe(original);
  while (s.tick < 100 && !s.story!.publicExchanges![0]!.endedAt) step(s);
  expect(s.story!.publicExchanges![0]!.status).toBe('completed');
  expect(s.villagers[0]!.order?.target).toBe('wood');
  apply(s, { kind: 'public-exchange', ids: ['v1'], topic: 'work', sourceId: 'input:0' });
  apply(s, { kind: 'order', ids: ['v1'], target: 'stone' });
  expect(s.story!.publicExchanges![1]!.status).toBe('interrupted');
  expect(s.villagers[0]!.order?.target).toBe('stone');
  expect(() =>
    apply(s, { kind: 'public-exchange', ids: ['v1'], topic: 'work', sourceId: 'input:0' }),
  ).toThrow(/later request/);
  expect(exportRun(importRun(exportRun(s)))).toEqual(exportRun(s));
});

test('invalid competing story request preserves the exact pending public invitation', () => {
  const s = createGame(418);
  apply(s, { kind: 'public-exchange', ids: ['v1'], topic: 'role' });
  const before = JSON.stringify(exportRun(s));
  expect(() => apply(s, { kind: 'story-act', ids: ['v1'], choice: 'prepare-drawing' })).toThrow();
  expect(JSON.stringify(exportRun(s))).toBe(before);
});

import { publicTranscript } from '../src/public-history';

test('transcript separates absent supply accounts and completed new speech from narration', () => {
  const s = createGame(418, undefined, { edition: 'settlement-replies/2' });
  apply(s, { kind: 'settlement', ids: ['v4', 'v8'], action: 'talk' });
  while (s.tick < 40) step(s);
  const lines = publicTranscript(s, 'v4');
  expect(lines.some((l) => l.text === 'No outward supply account was recorded.')).toBe(true);
  expect(lines.find((l) => l.text === 'No outward supply account was recorded.')!.kind).toBe(
    'no outward account',
  );
  apply(s, { kind: 'public-exchange', ids: ['v4'], topic: 'role' });
  while (s.tick < 100 && !s.story!.publicExchanges![0]!.endedAt) step(s);
  expect(
    publicTranscript(s, 'v4').some((l) => l.kind === 'completed public speech' && l.text === PUBLIC_ROLES[3]),
  ).toBe(true);
});

// Actual 418 public Yield source is independent of its failed walk and dispute narration.
test('partner response requires the completed native Yield and current source', () => {
  const s = createGame(418, undefined, { edition: 'settlement-replies/2' });
  for (const [i, id] of ['v1', 'v2', 'v3'].entries())
    apply(s, { kind: 'order', ids: [id], target: i < 2 ? 'wood' : 'stone' });
  while (s.tick < 17) step(s);
  apply(s, { kind: 'yield-return', ids: ['v2'] });
  while (s.tick < 220 && s.yieldReturn![0]!.stage !== 'reoffered') step(s);
  // Map and hub selections are not resident speech invitations, even after a real Yield.
  for (const ids of [['town'], [s.buildings[0]!.id], ['v1', s.buildings[0]!.id]])
    expect(publicCommands(s, ids)).toEqual([]);
  const history = readRunHistory(archiveCommunity(s.villagers[0]!.person)).flatMap((t) => t.inputs);
  const complete = history.find(
    (i) =>
      i.kind === 'action.resolved' &&
      i.payload.stage === 'finish' &&
      i.payload.outcome?.offerId === 'yield' &&
      i.payload.disposition === 'completed',
  )!;
  const failed = history.find(
    (i) =>
      i.kind === 'action.resolved' &&
      i.payload.outcome?.actionId === 'yield' &&
      i.payload.disposition === 'failed',
  )!;
  expect(complete).toBeDefined();
  expect(failed).toBeDefined();
  const before = JSON.stringify(exportRun(s));
  expect(() =>
    apply(s, { kind: 'public-exchange', ids: ['v1'], topic: 'yield', sourceId: failed.id }),
  ).toThrow(/completed Yield/);
  expect(JSON.stringify(exportRun(s))).toBe(before);
  apply(s, { kind: 'public-exchange', ids: ['v1'], topic: 'yield', sourceId: complete.id });
  while (s.tick < 250 && !s.story!.publicExchanges![0]!.endedAt) step(s);
  const a = s.story!.publicExchanges![0]!;
  expect(a.status).toBe('completed');
  expect(a.participants[0]!.invitation!.some((r) => r.attention > 0)).toBe(true);
  expect(a.facts[0]!.sourceId).toBe(complete.id);
  expect(exportRun(importRun(exportRun(s)))).toEqual(exportRun(s));
});

import { closingCommand } from '../src/public-voice-content';

test('short ending stays readable, then actual continuation owns any optional closing speech', () => {
  const s = createGame(418);
  while (s.tick < 600) step(s);
  apply(s, { kind: 'pause-chapter' });
  const before = JSON.stringify(exportRun(s)),
    owner = s.villagers[0]!.person;
  expect(() => apply(s, closingCommand(s, 'v1'))).toThrow();
  expect(JSON.stringify(exportRun(s))).toBe(before);
  apply(s, { kind: 'continue-workshop' });
  expect(s.villagers[0]!.person).toBe(owner);
  const prior = owner.now;
  apply(s, closingCommand(s, 'v1'));
  while (s.tick < 700 && !s.story!.publicExchanges![0]!.endedAt) step(s);
  expect(['completed', 'withheld']).toContain(s.story!.publicExchanges![0]!.status);
  expect(owner.now).toBeGreaterThan(prior);
  expect(s.villagers[0]!.discovery).toBe(0);
  expect(exportRun(importRun(exportRun(s)))).toEqual(exportRun(s));
});

test('pause consumes matching current speech finish and starts no replacement work', () => {
  const s = createGame(418);
  apply(s, { kind: 'public-exchange', ids: ['v1'], topic: 'role' });
  step(s);
  const p = s.story!.publicExchanges![0]!.participants[0]!;
  expect(p.status).toBe('running');
  apply(s, { kind: 'pause-chapter' });
  while (!s.chapterPaused && s.tick < 20) step(s);
  expect(p.status).toBe('completed');
  expect(
    p.resolutions!.some((i) => i.payload.stage === 'finish' && i.payload.disposition === 'completed'),
  ).toBe(true);
  expect(s.villagers[0]!.person.activity).toBeNull();
  expect(s.story!.publicExchanges![0]!.endedAt).toBeDefined();
  expect(exportRun(importRun(exportRun(s)))).toEqual(exportRun(s));
});

import { continueAndAskClosing, publicEnding } from '../src/public-ending';

test('ending projection does not call narrator facts a resident closing utterance', () => {
  const s = createGame(418);
  const before = JSON.stringify(exportRun(s));
  expect(publicEnding(s, 'v1').spoken).toEqual([]);
  expect(JSON.stringify(exportRun(s))).toBe(before);
  apply(s, { kind: 'public-exchange', ids: ['v1'], topic: 'role' });
  while (s.tick < 8) step(s);
  expect(publicEnding(s, 'v1').spoken[0]!.text).toBe(PUBLIC_ROLES[0]);
});

test('continue then refused invitation retains the actual continuation and no fabricated speech', () => {
  const s = createGame(418);
  while (s.tick < 600) step(s);
  apply(s, { kind: 'pause-chapter' });
  expect(() =>
    continueAndAskClosing(
      () => s,
      'missing',
      (c) => apply(s, c),
    ),
  ).toThrow(/current resident/);
  expect(s.continuedWorkshop).toBeDefined();
  expect(s.ended).toBe(false);
  expect(s.inputs.at(-1)!.command).toEqual({ kind: 'continue-workshop' });
  expect(s.story?.publicExchanges).toBeUndefined();
  expect(exportRun(importRun(exportRun(s)))).toEqual(exportRun(s));
});

// A cancelled carrier remains a real carrier. A public invitation must use ordinary return/delivery.
test('invitation returns an actual held load before speaking without losing or creating stock', () => {
  const s = createGame(418, undefined, { edition: 'settlement-replies/2' });
  apply(s, { kind: 'order', ids: ['v3'], target: 'stone' });
  while (s.tick < 180 && !s.settlement!.actors.v3!.carried) step(s);
  expect(s.settlement!.actors.v3!.carried).not.toBeNull();
  apply(s, { kind: 'settlement', ids: ['v3'], action: 'cancel' });
  const load = structuredClone(s.settlement!.actors.v3!.carried)!,
    stock = s.resources.stone;
  apply(s, { kind: 'public-exchange', ids: ['v3'], topic: 'role' });
  while (s.tick < 300 && !s.story!.publicExchanges![0]!.endedAt) step(s);
  expect(s.story!.publicExchanges![0]!.status).toBe('completed');
  expect(s.settlement!.actors.v3!.carried).toBeNull();
  expect(s.resources.stone).toBeCloseTo(stock + load.amount);
  expect(exportRun(importRun(exportRun(s)))).toEqual(exportRun(s));
});

test('closing cites an actual completed answer and dates earlier words without claiming a new result', () => {
  const s = createGame(418);
  while (s.tick < 60) step(s);
  apply(s, { kind: 'order', ids: ['v1'], target: 'rest' });
  while (s.tick < 65) step(s);
  apply(s, { kind: 'order', ids: ['v1'], target: 'listen' });
  while (s.tick < 100) step(s);
  apply(s, { kind: 'story-act', ids: ['v1'], choice: 'prepare-drawing' });
  while (s.tick < 600) step(s);
  apply(s, { kind: 'pause-chapter' });
  apply(s, { kind: 'continue-workshop' });
  const result = s.story!.events.find((e) => e.choice === 'prepare-drawing')!;
  expect(result).toBeDefined();
  const c = closingCommand(s, 'v1');
  expect(c.sourceId).toBe(result.id);
  const offer = publicVoiceOffer(s, c);
  expect(offer.facts[0]!.text).toContain(result.says);
  expect(offer.facts[0]!.text).toMatch(/^At .* the recorded result was:/);
  const before = JSON.stringify(exportRun(s));
  expect(() => apply(s, { ...c, sourceId: 'story:forged:result' })).toThrow();
  expect(JSON.stringify(exportRun(s))).toBe(before);
});

// Fixed ordinary body-history control: one meal is paid before the actual storm; no body edits.
test('late pair retains independent choices and any one-sided completed words', () => {
  const s = createGame(418);
  while (s.tick < 560) step(s);
  apply(s, { kind: 'order', ids: ['v1'], target: 'meal' });
  while (s.tick < 600) step(s);
  apply(s, { kind: 'pause-chapter' });
  apply(s, { kind: 'continue-workshop' });
  apply(s, { kind: 'public-exchange', ids: ['v1', 'v2'], topic: 'role' });
  while (s.tick < 720 && !s.story!.publicExchanges![0]!.endedAt) step(s);
  const a = s.story!.publicExchanges![0]!;
  console.info(
    'Fixed late pair actual statuses',
    a.status,
    a.participants.map((p) => ({
      actor: p.actor,
      status: p.status,
      decision: p.decision?.chosenAffordanceId,
      heard: p.heard?.map((h) => h.status),
    })),
  );
  expect(['completed', 'withheld', 'interrupted']).toContain(a.status);
  for (const p of a.participants) {
    const quotes = publicUtterances(s, p.actor);
    expect(quotes).toHaveLength(p.status === 'completed' ? 1 : 0);
    if (p.status === 'completed')
      expect(p.resolutions!.some((i) => i.payload.disposition === 'completed')).toBe(true);
  }
  expect(exportRun(importRun(exportRun(s)))).toEqual(exportRun(s));
});

test('actual interrupted speaking records no completed quotation or automatic work reoffer', () => {
  const s = createGame(418);
  apply(s, { kind: 'public-exchange', ids: ['v1'], topic: 'role' });
  step(s);
  const a = s.story!.publicExchanges![0]!,
    p = a.participants[0]!;
  expect(p.status).toBe('running');
  apply(s, { kind: 'order', ids: ['v1'], target: 'stone' });
  expect(a.status).toBe('interrupted');
  expect(p.status).toBe('interrupted');
  expect(publicUtterances(s, 'v1')).toEqual([]);
  expect(s.villagers[0]!.order?.target).toBe('stone');
  expect(
    readRunHistory(archiveCommunity(s.villagers[0]!.person))
      .flatMap((t) => t.inputs)
      .some(
        (i) =>
          i.kind === 'action.resolved' &&
          i.payload.activityId === p.activity!.id &&
          i.payload.disposition === 'interrupted',
      ),
  ).toBe(true);
  expect(exportRun(importRun(exportRun(s)))).toEqual(exportRun(s));
});
