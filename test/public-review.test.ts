import { expect, test, vi } from 'vitest';
import * as hf from '../src/hf4';
import { archiveCommunity } from '../src/hf4';
import { apply, createGame, exportRun, importRun, step } from '../src/sim';

// CS-R14: current work must remain an actual native alternative after a safe detach.
test('native speech choices include the still-valid retained ordinary work', () => {
  const s = createGame(418);
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  apply(s, { kind: 'public-exchange', ids: ['v1'], topic: 'role' });
  while (s.tick < 80 && !s.story!.publicExchanges![0]!.participants[0]!.decision) step(s);
  const offered = archiveCommunity(s.villagers[0]!.person)
    .history.flatMap((t) => t.inputs)
    .filter(
      (i) => i.kind === 'offers.received' && i.payload.offers.some((o) => o.id === 'public:1:speak:v1'),
    );
  expect(offered.length).toBeGreaterThan(0);
  expect(
    offered.every((i) => i.kind === 'offers.received' && i.payload.offers.some((o) => o.actionId === 'work')),
  ).toBe(true);
});

// CS-R15: these positions come from ordinary moves, including the nonzero 65-step remainder.
for (const distance of [10, 140])
  test(`short meeting accepts its ordinary physical arrival at ${distance}`, () => {
    const s = createGame(418),
      first = s.villagers[0]!,
      second = s.villagers[1]!;
    apply(s, { kind: 'order', ids: ['v2'], target: 'move', x: first.x + distance, y: first.y });
    while (s.tick < 30 && second.order) step(s);
    const original = { x: second.x, y: second.y };
    expect(Math.hypot(second.x - first.x, second.y - first.y)).toBe(distance);
    apply(s, { kind: 'public-exchange', ids: ['v1', 'v2'], topic: 'role' });
    while (s.tick < 80 && !s.story!.publicExchanges![0]!.endedAt) step(s);
    expect(s.story!.publicExchanges![0]!.status).toBe('completed');
    const remainder = Math.hypot(second.x - first.x, second.y - first.y);
    expect(remainder).toBeGreaterThan(0);
    expect(remainder).toBeLessThanOrEqual(15);
    if (distance === 10) expect({ x: second.x, y: second.y }).toEqual(original);
    else expect(second.x).not.toBe(original.x);
    expect(exportRun(importRun(exportRun(s)))).toEqual(exportRun(s));
  });

// CS-R16: refused replacement inputs may report their reason but cannot take the native speech owner.
for (const [name, x, y] of [
  ['blocked', 500, 350],
  ['materials', 653, 503],
] as const)
  test(`rejected ${name} site preserves the entire public/native owner`, () => {
    const s = createGame(418, undefined, { edition: 'settlement-day/1' });
    apply(s, { kind: 'public-exchange', ids: ['v1'], topic: 'role' });
    step(s);
    const native = archiveCommunity(s.villagers[0]!.person),
      attempt = structuredClone(s.story!.publicExchanges![0]),
      activity = structuredClone(s.villagers[0]!.person.activity),
      resources = { ...s.resources },
      buildings = structuredClone(s.buildings);
    apply(s, { kind: 'build', ids: ['v1'], building: name === 'materials' ? 'storehouse' : 'house', x, y });
    expect(s.message).toMatch(name === 'blocked' ? /blocked/ : /needs/);
    expect(s.story!.publicExchanges![0]).toEqual(attempt);
    expect(s.villagers[0]!.person.activity).toEqual(activity);
    expect(archiveCommunity(s.villagers[0]!.person)).toEqual(native);
    expect(s.resources).toEqual(resources);
    expect(s.buildings).toEqual(buildings);
    expect(exportRun(importRun(exportRun(s)))).toEqual(exportRun(s));
  });

import type { decide } from '../src/hf4';
import { publicUtterances, startPublicAlternative } from '../src/public-exchanges';
import { settlementPublicHost } from '../src/settlement';
import { shortPublicHost } from '../src/sim';

// Causal branch control: the seam restricts this invitation to its already-offered work.
// It calls real HF decide/begin; it does not forge a Decision/Person or claim a natural full-menu refusal.
for (const longer of [false, true])
  test(`selected retained work uses its real native start once (${longer ? 'long' : 'short'})`, () => {
    const original = hf.decide;
    let commitmentBefore: string | null | undefined;
    let actualDecision: ReturnType<typeof decide> | undefined,
      selectedWork: Parameters<typeof decide>[1][number] | undefined,
      before: Record<string, number> | undefined;
    const s = createGame(418, undefined, longer ? { edition: 'settlement-day/1' } : undefined),
      v = s.villagers[0]!,
      h = longer ? settlementPublicHost : shortPublicHost;
    const spy = vi.spyOn(hf, 'decide').mockImplementation((person, offers, options) => {
      if (person === v.person && offers.some((o) => o.id === 'public:1:speak:v1')) {
        const work = offers.find((o) => o.action === 'work' || o.action === 'move');
        expect(work).toBeDefined();
        selectedWork = work!;
        before = { ...s.resources };
        if (longer) commitmentBefore = s.settlement!.actors.v1!.commitment;
        actualDecision = original(person, [work!]);
        return actualDecision;
      }
      return original(person, offers, options);
    });
    try {
      apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
      apply(s, { kind: 'public-exchange', ids: ['v1'], topic: 'role' });
      while (s.tick < 100 && !s.story!.publicExchanges![0]!.endedAt) step(s);
      const a = s.story!.publicExchanges![0]!,
        p = a.participants[0]!;
      expect(
        p.status,
        JSON.stringify({
          longer,
          p,
          activity: v.person.activity,
          decision: actualDecision,
          tail: archiveCommunity(v.person).history.slice(-3),
        }),
      ).toBe('continued-work');
      expect(p.reoffered).toBe(true);
      expect(p.continuedWork!.id).toBe(v.person.activity!.id);
      expect(v.person.activity!.affordanceId).toBe(selectedWork!.id);
      expect(publicUtterances(s, 'v1')).toEqual([]);
      expect(s.resources).toEqual(before);
      const native = archiveCommunity(v.person);
      startPublicAlternative(s, v, a, p, h, selectedWork, actualDecision!);
      expect(archiveCommunity(v.person)).toEqual(native);
      if (longer) {
        expect(s.settlement!.actors.v1!.job).toEqual(p.prior);
        expect(s.settlement!.actors.v1!.commitment).toBe(commitmentBefore);
      } else expect(v.order).toEqual(p.prior);
    } finally {
      spy.mockRestore();
    }
  });

test('valid replacement build and explicit cancel still cancel the public invitation', () => {
  for (const cancel of [false, true]) {
    const s = createGame(418, undefined, { edition: 'settlement-day/1' });
    apply(s, { kind: 'public-exchange', ids: ['v1'], topic: 'role' });
    step(s);
    apply(
      s,
      cancel
        ? { kind: 'settlement', ids: ['v1'], action: 'cancel' }
        : { kind: 'build', ids: ['v1'], building: 'house', x: 653, y: 503 },
    );
    expect(s.story!.publicExchanges![0]!.status).toBe('interrupted');
    if (!cancel) {
      expect(s.buildings).toHaveLength(2);
      expect(s.resources.wood).toBe(40);
      const held = JSON.stringify(exportRun(s)),
        forged = JSON.parse(held);
      forged.state.story.rejectedPublicBuilds = [
        { inputIndex: s.inputs.length - 1, at: s.tick, reason: 'The site is blocked.' },
      ];
      expect(() => importRun(forged)).toThrow();
      expect(JSON.stringify(exportRun(s))).toBe(held);
    }
  }
});

import { publicVoiceOffer } from '../src/public-voice-content';

test('a rejected build input does not stale the retained work source on the next tick', () => {
  const s = createGame(418, undefined, { edition: 'settlement-day/1' });
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  apply(s, { kind: 'public-exchange', ids: ['v1'], topic: 'work', sourceId: 'input:0' });
  const a = s.story!.publicExchanges![0]!,
    facts = structuredClone(a.facts),
    native = archiveCommunity(s.villagers[0]!.person);
  apply(s, { kind: 'build', ids: ['v1'], building: 'storehouse', x: 653, y: 503 });
  expect(archiveCommunity(s.villagers[0]!.person)).toEqual(native);
  expect(publicVoiceOffer(s, a.command).facts).toEqual(facts);
  step(s);
  expect(a.status).not.toBe('interrupted');
  expect(exportRun(importRun(exportRun(s)))).toEqual(exportRun(s));
  const held = JSON.stringify(exportRun(s)),
    forged = JSON.parse(held);
  forged.state.story.rejectedPublicBuilds[0].inputIndex = 0;
  expect(() => importRun(forged)).toThrow();
  expect(JSON.stringify(exportRun(s))).toBe(held);
});

// One work-only causal seam, two actual people: the other speaker's completed words remain.
test('one selected work alternative preserves the other actual completed speaker', () => {
  const original = hf.decide,
    s = createGame(418),
    speaker = s.villagers[0]!;
  const spy = vi.spyOn(hf, 'decide').mockImplementation((person, offers, options) => {
    if (person === speaker.person && offers.some((o) => o.id === 'public:1:speak:v1')) {
      const work = offers.find((o) => o.action === 'work' || o.action === 'move');
      expect(work).toBeDefined();
      return original(person, [work!]);
    }
    return original(person, offers, options);
  });
  try {
    apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
    apply(s, { kind: 'public-exchange', ids: ['v1', 'v2'], topic: 'role' });
    while (s.tick < 100 && !s.story!.publicExchanges![0]!.endedAt) step(s);
    const a = s.story!.publicExchanges![0]!;
    expect(a.participants[0]!.status, JSON.stringify(a)).toBe('continued-work');
    expect(a.participants[1]!.status).toBe('completed');
    expect(publicUtterances(s, 'v1')).toEqual([]);
    expect(publicUtterances(s, 'v2')).toHaveLength(1);
    expect(a.participants[0]!.reoffered).toBe(true);
    expect(s.villagers[0]!.order?.target).toBe('wood');
  } finally {
    spy.mockRestore();
  }
});
