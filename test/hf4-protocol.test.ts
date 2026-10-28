import { expect, test } from 'vitest';
import {
  archiveCommunity,
  begin,
  createPerson,
  decide,
  finish,
  openCommunity,
  stageOutcome,
  tick,
  verifyCommunity,
} from '../src/hf4';

const setup = () => {
  openCommunity(7);
  return createPerson({ id: 'p', name: 'Resident', seed: 7 });
};
const offer = {
  id: 'rest',
  action: 'rest',
  label: 'rest',
  duration: 2,
  tags: ['rest'],
  advertises: { rest: 0.5 },
};
test('start waits for host acceptance and tick preserves unresolved completion', () => {
  const p = setup(),
    d = decide(p, [offer]);
  expect(p.activity).toBeNull();
  expect(archiveCommunity(p).current.pending).toHaveLength(1);
  begin(p, offer, d);
  const activity = p.activity!;
  expect(JSON.parse(JSON.stringify(activity))).toStrictEqual(activity);
  expect(archiveCommunity(p).current.world.hostState).toMatchObject({
    active: [{ id: activity.id, person: p.id, offerId: offer.id }],
  });
  expect(archiveCommunity(p).current.world.hostState).not.toHaveProperty('active.0.offer');
  expect(archiveCommunity(p).current.world.hostState).not.toHaveProperty('active.0.decision');
  tick(p, 481);
  expect(archiveCommunity(p).current.at).toBe(481 * 60_000 + 1);
  tick(p, 490);
  expect(p.activity?.id).toBe(activity.id);
  const saved = JSON.parse(JSON.stringify(archiveCommunity(p)));
  expect(saved.current.pending[0].stage).toBe('finish');
  expect(saved.current.at).toBe(activity.endsAt * 60000);
  expect(verifyCommunity(p).verified).toBe(true);
});
test('earlier host interruption never jumps to planned completion', () => {
  const p = setup(),
    d = decide(p, [offer]);
  begin(p, offer, d);
  const end = p.activity!.endsAt;
  const receipt = finish(p, {
    action: 'rest',
    at: p.now,
    status: 'interrupted',
    summary: 'The host stopped the rest.',
  });
  expect(receipt?.status).toBe('interrupted');
  expect(p.now).toBeLessThan(end);
  expect(p.activity).toBeNull();
  expect(verifyCommunity(p).verified).toBe(true);
});
test('only a staged host outcome settles completion', () => {
  const p = setup(),
    d = decide(p, [offer]);
  begin(p, offer, d);
  stageOutcome(p, {
    action: 'rest',
    at: 482,
    status: 'completed',
    summary: 'The host observed the full rest.',
  });
  tick(p, 482);
  const receipt = finish(p, { action: 'rest', at: p.now, status: 'completed' });
  expect(receipt?.summary).toBe('The host observed the full rest.');
  expect(p.activity).toBeNull();
  expect(verifyCommunity(p).verified).toBe(true);
});

test('active whole game restores with identical continuation and complete archives', async () => {
  const { createGame, apply, step, exportRun, importRun } = await import('../src/sim');
  const original = createGame(42);
  apply(original, { kind: 'order', ids: ['v1'], target: 'wood' });
  step(original);
  expect(original.villagers[0]!.person.activity).not.toBeNull();
  const restored = importRun(JSON.parse(JSON.stringify(exportRun(original))));
  for (let i = 0; i < 12; i++) {
    step(original);
    step(restored);
  }
  expect(exportRun(restored)).toEqual(exportRun(original));
}, 20000);

test('unresolved boundary restore keeps request identity and identical continuation', async () => {
  const { restoreCommunity, previewCommunity } = await import('../src/hf4');
  const original = setup();
  begin(original, offer, decide(original, [offer]));
  tick(original, 490);
  const saved = JSON.parse(JSON.stringify(archiveCommunity(original)));
  const before = JSON.stringify(saved);
  previewCommunity(original);
  expect(JSON.stringify(archiveCommunity(original))).toBe(before);
  const restored = setup();
  begin(restored, offer, decide(restored, [offer]));
  tick(restored, 490);
  restoreCommunity(restored, saved);
  expect(archiveCommunity(restored).current.pending).toEqual(saved.current.pending);
  for (const p of [original, restored]) {
    stageOutcome(p, {
      action: 'rest',
      at: p.now,
      status: 'completed',
      summary: 'The host observed the full rest.',
    });
    tick(p, 490);
    finish(p, { action: 'rest', at: p.now, status: 'completed' });
  }
  expect(archiveCommunity(restored)).toEqual(archiveCommunity(original));
  expect(verifyCommunity(restored).verified).toBe(true);
});
