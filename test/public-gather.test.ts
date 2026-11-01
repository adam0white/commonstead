// HF4 current-policy controls use the single canonical long scenario. Historical source stays frozen at c98.
import { expect, test, vi } from 'vitest';
import * as hf from '../src/hf4';
import { CACHE_POINT, settlementPublicHost } from '../src/settlement';
import { apply, createGame, step } from '../src/sim';

function atCache() {
  const s = createGame(418, undefined, { edition: 'settlement-replies/2' });
  apply(s, { kind: 'order', ids: ['v1'], target: 'move', ...CACHE_POINT });
  while (s.tick < 80 && s.settlement!.actors.v1!.job) step(s);
  expect(
    Math.hypot(s.villagers[0]!.x - CACHE_POINT.x, s.villagers[0]!.y - CACHE_POINT.y),
  ).toBeLessThanOrEqual(5);
  return s;
}
// Host-world race fixtures exercise the physical boundary, never modify a Person/Run,
// and do not claim a natural full-menu choice or a replayable player input sequence.
for (const blocking of ['dispute', 'owner'] as const)
  test(`retained gather preview is pure and excludes a current ${blocking}`, () => {
    const s = atCache(),
      v = s.villagers[0]!,
      w = s.settlement!;
    apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
    const prior = settlementPublicHost.detach(s, v);
    if (blocking === 'dispute') w.dispute = ['v1', 'v2'];
    else w.trolley = 'v2';
    const before = structuredClone(w),
      native = hf.archiveCommunity(v.person);
    expect(settlementPublicHost.work(s, v, prior)).toBeUndefined();
    expect(w).toEqual(before);
    expect(hf.archiveCommunity(v.person)).toEqual(native);
  });

test('conflict-free retained gather takes the actual trolley reservation once', () => {
  const s = atCache(),
    v = s.villagers[0]!,
    w = s.settlement!;
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  const prior = settlementPublicHost.detach(s, v),
    a = settlementPublicHost.work(s, v, prior)!;
  expect(a.id).not.toMatch(/walk|crossing/);
  const d = hf.decide(v.person, [a]),
    cache = structuredClone(w.caches);
  expect(d.chosenAffordanceId).toBe(a.id);
  expect(settlementPublicHost.startWork(s, v, prior, a, d)).toBe(true);
  expect(w.trolley).toBe(v.id);
  expect(w.actors.v1!.running!.purpose).toBe('job');
  expect(w.actors.v1!.job).toEqual(prior);
  expect(w.caches).toEqual(cache);
});

for (const blocking of ['dispute', 'owner'] as const)
  test(`a ${blocking} arriving after the native work offer refuses its actual start`, () => {
    const s = atCache(),
      v = s.villagers[0]!,
      w = s.settlement!,
      original = hf.decide;
    let beforeInputs = 0;
    const spy = vi.spyOn(hf, 'decide').mockImplementation((person, offers, options) => {
      if (person === v.person && offers.some((o) => o.id === 'public:1:speak:v1')) {
        const a = offers.find((o) => o.action === 'work')!;
        expect(a).toBeDefined();
        beforeInputs = hf.archiveCommunity(person).history.flatMap((t) => t.inputs).length;
        const d = original(person, [a]);
        expect(d.chosenAffordanceId).toBe(a.id);
        if (blocking === 'dispute') w.dispute = ['v1', 'v2'];
        else {
          // Existing host physical positions only; this fixture does not move a native body.
          w.trolley = 'v2';
          s.villagers[1]!.x = v.x;
          s.villagers[1]!.y = v.y;
        }
        return d;
      }
      return original(person, offers, options);
    });
    try {
      apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
      apply(s, { kind: 'public-exchange', ids: ['v1'], topic: 'role' });
      const cache = structuredClone(w.caches);
      while (s.tick < 100 && !s.story!.publicExchanges![0]!.endedAt) step(s);
      const p = s.story!.publicExchanges![0]!.participants[0]!;
      expect(p.status).toBe('interrupted');
      expect(p.continuedWork).toBeUndefined();
      expect(v.person.activity?.action).not.toBe('work');
      expect(w.actors.v1!.running?.purpose).not.toBe('job');
      expect(w.caches).toEqual(cache);
      expect(w.trolley).toBe(blocking === 'owner' ? 'v2' : null);
      const rejected = hf
        .archiveCommunity(v.person)
        .history.flatMap((t) => t.inputs)
        .slice(beforeInputs)
        .filter(
          (i) =>
            i.kind === 'action.resolved' &&
            i.payload.person === v.person.id &&
            i.payload.stage === 'start' &&
            i.payload.disposition === 'rejected',
        );
      expect(rejected).toHaveLength(1);
      if (blocking === 'owner') {
        expect(w.dispute).toEqual(['v1', 'v2']);
        expect(w.peer!.witnesses).toHaveLength(1);
      }
    } finally {
      spy.mockRestore();
    }
  });

// Finishing a gather releases its own actual reservation, never a later distinct owner.
for (const changed of [false, true])
  test(`gather finish releases only its matching owner (${changed ? 'other owner' : 'self'})`, () => {
    const s = atCache(),
      v = s.villagers[0]!,
      w = s.settlement!;
    apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
    const prior = settlementPublicHost.detach(s, v),
      a = settlementPublicHost.work(s, v, prior)!;
    const d = hf.decide(v.person, [a]);
    expect(settlementPublicHost.startWork(s, v, prior, a, d)).toBe(true);
    expect(w.trolley).toBe('v1');
    const activity = v.person.activity!.id;
    if (changed) w.trolley = 'v2';
    while (s.tick < 100 && !w.actors.v1!.carried) step(s);
    expect(w.actors.v1!.carried!.resource).toBe('wood');
    expect(
      hf
        .actionResolutions(v.person, activity)
        .filter((i) => i.payload.stage === 'finish' && i.payload.disposition === 'completed'),
    ).toHaveLength(1);
    expect(w.trolley).toBe(changed ? 'v2' : null);
  });

test('retained travel toward a blocked gather neither witnesses conflict nor reserves the trolley', () => {
  const s = createGame(418, undefined, { edition: 'settlement-replies/2' }),
    v = s.villagers[0]!,
    w = s.settlement!;
  apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
  const prior = settlementPublicHost.detach(s, v);
  w.trolley = 'v2';
  const before = structuredClone(w),
    a = settlementPublicHost.work(s, v, prior)!;
  expect(a.id).toBe('walk');
  expect(w).toEqual(before);
  const d = hf.decide(v.person, [a]);
  expect(settlementPublicHost.startWork(s, v, prior, a, d)).toBe(true);
  expect(w.actors.v1!.running!.purpose).toBe('travel');
  expect(w.trolley).toBe('v2');
  expect(w.dispute).toBeNull();
  expect(w.caches).toEqual(before.caches);
});
