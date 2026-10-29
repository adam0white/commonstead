import { expect, test } from 'vitest';
import { apply, createGame, exportRun, importRun, step } from '../src/sim';
import { storyClosing, storyReason } from '../src/story-records';

function paid(id: 'v1' | 'v7', route: 'reply' | 'story-act', building = false) {
  const s = createGame(42, undefined, { edition: 'settlement-replies/1' });
  if (building) apply(s, { kind: 'build', ids: ['v2', 'v3', 'v4', 'v5'], building: 'house', x: 700, y: 475 });
  apply(s, { kind: 'order', ids: [id], target: 'move', x: 525, y: 475 });
  while (s.tick < 60) step(s);
  apply(s, { kind: 'settlement', ids: [id], action: 'story' });
  while (!s.villagers.find((v) => v.id === id)!.discovery && s.tick < 180) step(s);
  const branch = id === 'v1' ? 'nora-record-question' : 'sevim-no-answer';
  const request = (entry: 'reply' | 'story-act') =>
    apply(
      s,
      entry === 'reply'
        ? { kind: 'reply', ids: [id], branch }
        : { kind: 'story-act', ids: [id], choice: branch },
    );
  request(route);
  const scene = s.settlement!.replyScenes![id]!;
  while (scene.attempts.at(-1)!.status === 'requested' && s.tick < 250) step(s);
  expect(scene.attempts.at(-1)!.status).toBe('running');
  expect(s.story!.paper).toBe(3);
  apply(s, { kind: 'settlement', ids: [id], action: 'cancel' });
  const sheet = s.story!.objects.find((o) => o.id === scene.reservation!.sheetId)!;
  return { s, scene, sheet, request };
}
// CS-R12: paid paper is physical unfinished work, never a completed authored fact.
test('cancelled actual paid first sheets stay unfinished until their matching completion', () => {
  for (const id of ['v1', 'v7'] as const) {
    const { s, scene, sheet, request } = paid(id, 'reply', true);
    expect(sheet.unfinished).toBe(true);
    expect(sheet.version).toBe(0);
    expect(s.story!.firstResults).toEqual([]);
    expect(storyClosing(s, id).join(' ')).not.toMatch(/attached the unanswered|private draft|acknowledg/);
    while (!s.buildings.some((b) => b.kind === 'house' && b.complete) && s.tick < 350) step(s);
    expect(s.buildings.some((b) => b.kind === 'house' && b.complete)).toBe(true);
    expect(storyReason(s, id, id === 'v1' ? 'pack-drawing' : 'pack-draft')).toContain(
      'has not been prepared',
    );
    expect(storyReason(s, id, id === 'v1' ? 'prepare-drawing' : 'prepare-draft')).toBe('');
    const reservation = structuredClone(scene.reservation),
      paper = s.story!.paper;
    request('story-act');
    while (!s.story!.firstResults.length && s.tick < 500) step(s);
    expect(s.story!.firstResults).toHaveLength(1);
    expect(sheet.unfinished).toBe(false);
    expect(sheet.version).toBe(1);
    expect(scene.reservation).toEqual(reservation);
    expect(s.story!.paper).toBe(paper);
    expect(exportRun(importRun(exportRun(s)))).toEqual(exportRun(s));
  }
});
// CS-R13: ordinary travel cannot grant access to a paid sheet left at its actual source place.
test('both public retry directions require reaching their original physical sheet', () => {
  for (const route of ['reply', 'story-act'] as const) {
    const { s, scene, sheet, request } = paid('v1', route),
      other = route === 'reply' ? 'story-act' : 'reply';
    const source = structuredClone(sheet),
      paper = s.story!.paper;
    if (route === 'reply') apply(s, { kind: 'order', ids: ['v1'], target: 'move', x: 575, y: 475 });
    else apply(s, { kind: 'settlement', ids: ['v1'], action: 'map', target: 'quay' });
    while (
      (s.settlement!.actors.v1!.job || s.settlement!.actors.v1!.running || s.villagers[0]!.person.activity) &&
      s.tick < 550
    )
      step(s);
    if (route === 'reply') expect(s.villagers[0]!.x).toBeCloseTo(575);
    else expect(s.settlement!.actors.v1!.map).toBe('quay');
    const inputs = s.inputs.length,
      attempts = scene.attempts.length;
    expect(() => request(other)).toThrow(/sheet|place/);
    expect(s.inputs).toHaveLength(inputs);
    expect(scene.attempts).toHaveLength(attempts);
    expect(sheet).toEqual(source);
    expect(s.story!.paper).toBe(paper);
    if (s.settlement!.actors.v1!.map !== 'yard') {
      apply(s, { kind: 'settlement', ids: ['v1'], action: 'map', target: 'yard' });
      while (
        (s.settlement!.actors.v1!.job ||
          s.settlement!.actors.v1!.running ||
          s.villagers[0]!.person.activity) &&
        s.tick < 850
      )
        step(s);
      expect(s.settlement!.actors.v1!.map).toBe('yard');
    }
    apply(s, { kind: 'order', ids: ['v1'], target: 'move', x: source.point.x, y: source.point.y });
    while (
      (s.settlement!.actors.v1!.job || s.settlement!.actors.v1!.running || s.villagers[0]!.person.activity) &&
      s.tick < 950
    )
      step(s);
    request(other);
    while (!s.story!.firstResults.length && s.tick < 1050) step(s);
    expect(s.story!.firstResults).toHaveLength(1);
    expect(sheet.point).toEqual(source.point);
    expect(sheet.map).toBe(source.map);
    expect(s.story!.paper).toBe(paper);
    expect(exportRun(importRun(exportRun(s)))).toEqual(exportRun(s));
  }
});

// Synthetic host-object race only: no Person/HF edits or positive play claim.
test('paid sheet ownership is rechecked after admission and before any delivered retry', () => {
  const { s, scene, sheet, request } = paid('v1', 'reply'),
    paper = s.story!.paper;
  request('story-act');
  const retry = scene.attempts.at(-1)!;
  expect(() => apply(s, { kind: 'order', ids: ['v1'], target: 'move', x: 575, y: 475 })).toThrow();
  expect(() => apply(s, { kind: 'story-act', ids: ['v1'], choice: 'pack-drawing' })).toThrow();
  sheet.holder = 'v2';
  step(s);
  expect(retry.status).toBe('unavailable');
  expect(retry.reason).toContain('sheet');
  expect(retry.deliveredAt).toBeUndefined();
  expect(retry.paperSpent).toBe(0);
  expect(s.story!.paper).toBe(paper);
  expect(s.story!.firstResults).toEqual([]);
  expect(sheet.unfinished).toBe(true);
  expect(sheet.version).toBe(0);
});
