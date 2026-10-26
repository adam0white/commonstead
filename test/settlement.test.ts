import { describe, expect, test } from 'vitest';
import { blocked, route } from '../src/paths.ts';
import { EDITION } from '../src/settlement.ts';
import { REPLIES } from '../src/settlement-scenes.ts';
import { apply, createGame, exportRun, importRun, stateHash, step } from '../src/sim.ts';

const day = (seed = 42) => createGame(seed, undefined, { edition: EDITION });
function resident(s: ReturnType<typeof day>, id: string) {
  const v = s.villagers.find((v) => v.id === id);
  if (!v) throw new Error('Missing resident');
  return v;
}
function advance(s: ReturnType<typeof day>, n: number) {
  for (let i = 0; i < n; i++) step(s);
}
function request(s: ReturnType<typeof day>, ids: string[], action: string, target?: string) {
  apply(s, { kind: 'settlement', ids, action, ...(target ? { target } : {}) });
}
function until(s: ReturnType<typeof day>, condition: () => boolean, bound = 500) {
  for (let i = 0; i < bound && !condition(); i++) step(s);
  expect(condition()).toBe(true);
}
function story(s: ReturnType<typeof day>, id: string) {
  if (s.tick < 60) advance(s, 60 - s.tick);
  request(s, [id], 'story');
  until(s, () => !!s.villagers.find((v) => v.id === id)?.discovery, 100);
}

describe('opt-in settlement day focused headless controls', () => {
  test('full-day bodies, food, sleep and sourced duties actually advance; both exports replay', () => {
    const s = day();
    const actions = new Set<string>();
    for (let i = 0; i < 1800; i++) {
      step(s);
      for (const v of s.villagers) {
        const a = v.person.activity?.action;
        if (a) actions.add(a);
      }
    }
    expect(s.tick).toBe(1800);
    expect(s.villagers.every((v) => v.person.now === 1920)).toBe(true);
    expect(actions.has('sleep')).toBe(true);
    expect(actions.has('eat')).toBe(true);
    expect(actions.has('pray')).toBe(true);
    expect(
      s.villagers.every(
        (v) => v.person.body.lastSleep && v.person.agenda.commitments.some((c) => c.status === 'kept'),
      ),
    ).toBe(true);
    expect(s.resources.food).toBeLessThan(100);
    expect(stateHash(importRun(exportRun(s)))).toBe(stateHash(s));
    expect(stateHash(importRun(exportRun(s, true)))).toBe(stateHash(s));
    const bad = JSON.parse(JSON.stringify(exportRun(s, true)));
    bad.config.edition = 'unknown';
    expect(() => importRun(bad)).toThrow(/replay/);
  });
  test('obstacles require a real route and blocked construction spends no stock', () => {
    const from = { x: 225, y: 275 },
      to = { x: 575, y: 275 },
      path = route('yard', from, to);
    expect(path).not.toBeNull();
    let p = from;
    for (const q of path ?? []) {
      for (let t = 0; t <= 1; t += 0.1)
        expect(blocked('yard', { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })).toBe(false);
      p = q;
    }
    expect((path ?? []).some((p) => p.y > 400 || p.y < 130)).toBe(true);
    const s = day(),
      before = { ...s.resources };
    apply(s, { kind: 'build', ids: ['v1'], building: 'house', x: 375, y: 275 });
    expect(s.resources).toEqual(before);
    expect(s.buildings).toHaveLength(1);
  });
  test('map travel takes actual walking and crossing time; cancellation grants no arrival', () => {
    const s = day();
    request(s, ['v1'], 'map', 'quay');
    advance(s, 10);
    expect(s.settlement?.actors.v1?.map).toBe('yard');
    request(s, ['v1'], 'cancel');
    advance(s, 35);
    expect(s.settlement?.actors.v1?.map).toBe('yard');
    request(s, ['v1'], 'map', 'quay');
    until(s, () => s.settlement?.actors.v1?.map === 'quay', 180);
    expect(s.tick).toBeGreaterThan(69);
  });
  test('supplies deplete only through actual collection and enter central stock only after return', () => {
    const s = day(),
      w = s.settlement;
    if (!w) throw new Error('day');
    apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
    until(s, () => !!w.actors.v1?.carried, 150);
    expect(s.resources.wood).toBe(80);
    expect(w.caches.yard.wood).toBeLessThan(280);
    expect(s.villagers[0]?.person.memory.beliefs.some((b) => b.prop === 'yard:boards-remain')).toBe(true);
    until(s, () => s.resources.wood > 80, 150);
    expect(w.caches.quay.wood).toBe(180);
    expect(s.villagers[1]?.person.memory.beliefs.some((b) => b.prop === 'yard:boards-remain')).toBe(false);
  });
  test('actual conversation delivers witnessed accounts, not instant private disclosure', () => {
    const s = day();
    request(s, ['v1'], 'inspect');
    until(s, () => s.settlement?.events.some((e) => e.text.includes('Nora inspects')) ?? false, 150);
    request(s, ['v1', 'v2'], 'talk');
    until(s, () => !!s.settlement?.accounts.length, 200);
    expect(s.settlement?.accounts.some((a) => a.text.includes('earlier inspection'))).toBe(true);
    expect(s.villagers[1]?.person.memory.beliefs.some((b) => b.prop === 'yard:boards-remain')).toBe(true);
    expect(s.villagers[0]?.discovery).toBe(0);
    expect(JSON.stringify(s.settlement?.accounts)).not.toMatch(/speakerCredence|deceit|confidence/);
  });
  test('two-way practice can be cancelled without a fabricated completed bout', () => {
    const s = day();
    request(s, ['v1', 'v2'], 'spar');
    advance(s, 2);
    request(s, ['v2'], 'cancel');
    advance(s, 60);
    expect(s.settlement?.events.some((e) => e.text.includes('finish the voluntary practice bout'))).toBe(
      false,
    );
    const t = day();
    request(t, ['v1', 'v2'], 'spar');
    until(
      t,
      () => t.settlement?.events.some((e) => e.text.includes('finish the voluntary practice bout')) ?? false,
      100,
    );
    expect(
      t.villagers[0]?.person.social.relationships.some((r) => r.otherId === t.villagers[1]?.person.id),
    ).toBe(true);
  });
  test('shared trolley conflict is observed, and an actual yielding choice opens the route', () => {
    const s = day();
    apply(s, { kind: 'order', ids: ['v1', 'v2'], target: 'wood' });
    until(s, () => !!s.settlement?.dispute, 160);
    const w = s.settlement;
    if (!w?.dispute) throw new Error('Missing actual dispute');
    expect(
      s.villagers.every(
        (v) =>
          !['v1', 'v2'].includes(v.id) ||
          v.person.memory.episodes.some((e) => e.kind === 'witnessed' && e.action === 'conflict'),
      ),
    ).toBe(true);
    const id = w.dispute.find((id) => !w.actors[id]?.carried);
    if (!id) throw new Error('Missing available participant');
    request(s, [id], 'cancel');
    request(s, [id], 'yield');
    until(s, () => w.dispute === null, 160);
    expect(w.routeAgreements).toContain('v1/v2');
    expect(w.events.some((e) => e.text.includes('after choosing to make room'))).toBe(true);
  });
  test('an outsider cannot settle the actual disputants’ route agreement', () => {
    const s = day();
    apply(s, { kind: 'order', ids: ['v1', 'v2'], target: 'wood' });
    advance(s, 17);
    expect(s.settlement?.dispute).toEqual(['v2', 'v1']);
    request(s, ['v3'], 'yield');
    advance(s, 30);
    expect(s.settlement?.dispute).toEqual(['v2', 'v1']);
    expect(s.settlement?.routeAgreements).toEqual([]);
    request(s, ['v2'], 'cancel');
    request(s, ['v2'], 'yield');
    until(s, () => s.settlement?.dispute === null, 160);
    expect(s.settlement?.routeAgreements).toEqual(['v1/v2']);
  });
  test('actual arrival and private story keep their target-bound HF appointments', () => {
    const s = day();
    apply(s, { kind: 'order', ids: ['v1'], target: 'move', x: 575, y: 475 });
    step(s);
    const v = resident(s, 'v1');
    const c = v.person.agenda.commitments.find((c) => c.targetId === 'day:v1:move:ground');
    expect(c?.status).toBe('pending');
    advance(s, 8);
    expect(v.says).toBe('I reached the selected place.');
    expect(c?.status).toBe('kept');
    story(s, 'v1');
    expect(v.person.agenda.commitments.find((c) => c.targetId === 'day:v1:story:share-story')?.status).toBe(
      'kept',
    );
  });
  test('partner withdrawal releases only the tracked host appointment; a completed pair keeps both', () => {
    const s = day();
    const prayer = structuredClone(resident(s, 'v1').person.agenda.commitments);
    request(s, ['v1', 'v2'], 'spar');
    advance(s, 2);
    const c = resident(s, 'v1').person.agenda.commitments.find((c) => c.targetId === 'day:v1:spar:spar');
    expect(c?.status).toBe('pending');
    request(s, ['v2'], 'cancel');
    advance(s, 60);
    expect(c?.status).toBe('released');
    expect(
      resident(s, 'v1').person.agenda.commitments.filter((c) => prayer.some((p) => p.id === c.id)),
    ).toEqual(prayer);
    const t = day();
    request(t, ['v1', 'v2'], 'spar');
    until(
      t,
      () => t.settlement?.events.some((e) => e.text.includes('finish the voluntary practice bout')) ?? false,
      100,
    );
    for (const v of t.villagers.slice(0, 2))
      expect(v.person.agenda.commitments.find((c) => c.targetId === `day:${v.id}:spar:spar`)?.status).toBe(
        'kept',
      );
  });
  test('one ordinary request stays one request; an explicit insist waits for a real action boundary', () => {
    const s = day();
    apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
    advance(s, 120);
    const v = s.villagers[0];
    if (!v) throw new Error('resident');
    const count = () => v.person.trace.filter((r) => r.suggestion?.voiceId === 'commander').length;
    expect(count()).toBe(1);
    expect(s.resources.wood).toBeGreaterThan(80);
    apply(s, { kind: 'order', ids: ['v1'], target: 'wood' });
    expect(s.settlement?.actors.v1?.pendingRequest).toBeNull();
    const before = count(),
      activity = v.person.activity?.startedAt;
    apply(s, { kind: 'order', ids: ['v1'], target: 'push' });
    expect(count()).toBe(before);
    expect(v.person.activity?.startedAt).toBe(activity);
    expect(s.settlement?.actors.v1?.pendingRequest).toBe('insist');
    until(s, () => count() === before + 1, 120);
    advance(s, 60);
    expect(count()).toBe(before + 1);
    expect(v.status).not.toMatch(/is (gather|build|share-story|eat|drink)\./);
    expect(stateHash(importRun(exportRun(s, true)))).toBe(stateHash(s));
  });
  test('talking and sparring do not fabricate assent to share the route', () => {
    for (const action of ['talk', 'spar']) {
      const s = day();
      apply(s, { kind: 'order', ids: ['v1', 'v2'], target: 'wood' });
      until(s, () => !!s.settlement?.dispute, 160);
      request(s, ['v1', 'v2'], 'cancel');
      request(s, ['v1', 'v2'], action);
      until(
        s,
        () =>
          s.settlement?.events.some((e) =>
            action === 'talk'
              ? e.text.includes('finish talking')
              : e.text.includes('finish the voluntary practice bout'),
          ) ?? false,
        160,
      );
      expect(s.settlement?.dispute).not.toBeNull();
      expect(s.settlement?.routeAgreements).toEqual([]);
      request(s, ['v1'], 'yield');
      until(s, () => s.settlement?.dispute === null, 100);
    }
  });
  test('fictional correction and visit require actual story, costs, trip and return', () => {
    const s = day();
    request(s, ['v2'], 'scene', 'correction');
    advance(s, 5);
    expect(s.settlement?.completed).toHaveLength(0);
    story(s, 'v2');
    request(s, ['v2'], 'scene', 'correction');
    until(s, () => s.settlement?.completed.some((c) => c.scene === 'correction') ?? false, 400);
    expect(s.settlement?.actors.v2?.map).toBe('quay');
    expect(s.resources.wood).toBe(80);
    expect(s.settlement?.paper).toBe(3);
    expect(s.settlement?.records.samReport).toContain('did not reproduce');
    request(s, ['v2'], 'scene', 'visit');
    until(s, () => s.settlement?.completed.some((c) => c.scene === 'visit') ?? false, 500);
    expect(s.settlement?.actors.v2?.map).toBe('yard');
    expect(s.resources.food).toBeLessThanOrEqual(96);
    expect(stateHash(importRun(exportRun(s, true)))).toBe(stateHash(s));
  });
  test('fictional grip trial needs both independent assent and a full shared act', () => {
    const s = day();
    story(s, 'v1');
    story(s, 'v2');
    request(s, ['v1', 'v2'], 'scene', 'trial');
    until(s, () => s.settlement?.completed.filter((c) => c.scene === 'trial').length === 2, 300);
    expect(s.resources.wood).toBe(76);
    expect(s.settlement?.records.grip).toBe('tried');
    expect(s.settlement?.events.some((e) => e.text.includes('not a test with real users'))).toBe(true);
  });
});

describe('fresh local personal replies with real HF choices', () => {
  for (const [id, branch, other] of [
    ['v1', 'nora-restore-drawing', 'nora-record-question'],
    ['v7', 'sevim-name-wrong', 'sevim-no-answer'],
  ] as const)
    test(`${id}: disclosure, attended offer, paid completion and interrupted replay fork`, () => {
      const s = createGame(42, undefined, { edition: 'settlement-replies/1' });
      const v = resident(s, id);
      const offer = { kind: 'reply', ids: [id], branch } as const;
      const command = { ...offer, ids: [id] };
      const untouched = JSON.stringify(s);
      expect(() => apply(s, command)).toThrow(/disclosure/);
      expect(JSON.stringify(s)).toBe(untouched);
      apply(s, { kind: 'order', ids: [id], target: 'move', x: 525, y: 475 });
      story(s, id);
      const w = s.settlement;
      if (!w) throw new Error('day');
      const scene = w.replyScenes?.[id];
      if (!scene) throw new Error('No actual disclosure');
      expect(scene.disclosure.at).toBe(78);
      expect(v.invitedBreak).toBe(false);
      expect(v.says).not.toBe('');
      const disclosed = JSON.stringify(s);
      const pre = exportRun(s);
      expect(() => apply(s, { ...command, ids: [id === 'v1' ? 'v7' : 'v1'] })).toThrow();
      expect(() => apply(s, { ...command, extra: true } as unknown as Parameters<typeof apply>[1])).toThrow();
      expect(JSON.stringify(s)).toBe(disclosed);
      apply(s, command);
      const attempt = scene.attempts[0];
      if (!attempt) throw new Error('attempt');
      expect(w.paper).toBe(4);
      until(s, () => attempt.status === 'running', 50);
      expect(attempt.deliveredAt).toBe(s.tick);
      expect(attempt.attended).toBe(true);
      expect(attempt.decision?.chosenAffordanceId).toBe(`reply:${branch}`);
      expect(attempt.decision?.verdict).not.toBe('refused');
      expect(attempt.paperSpent).toBe(1);
      expect(w.paper).toBe(3);
      expect(w.replyResults).toEqual([]);
      const beforeDuplicate = JSON.stringify(s);
      expect(() => apply(s, command)).toThrow();
      expect(() => apply(s, { ...command, branch: other })).toThrow();
      expect(() => apply(s, { kind: 'order', ids: [id], target: 'wood' })).toThrow(/Cancel/);
      expect(JSON.stringify(s)).toBe(beforeDuplicate);
      const running = [exportRun(s), exportRun(s, true)];
      const started = attempt.startedAt;
      if (started === undefined) throw new Error('no begin');
      const fork = importRun(pre);
      apply(fork, command);
      until(fork, () => fork.settlement?.replyScenes?.[id]?.attempts[0]?.status === 'running', 50);
      advance(fork, 3);
      expect(fork.tick).toBe(started + 3);
      request(fork, [id], 'cancel');
      advance(fork, 20);
      expect(fork.settlement?.paper).toBe(3);
      expect(fork.settlement?.replyResults).toEqual([]);
      expect(fork.settlement?.replyScenes?.[id]?.attempts[0]?.status).toBe('interrupted');
      expect(fork.settlement?.replyScenes?.[id]?.completedBranch).toBeUndefined();
      expect(fork.settlement?.events.some((e) => e.text.includes(REPLIES[branch].says))).toBe(false);
      until(s, () => attempt.status === 'completed', 30);
      expect(attempt.endedAt).toBe(attempt.until);
      expect(s.tick - started).toBe(13); // HF rounds 9.6 minutes to ten; never finish early.
      expect(w.replyResults).toEqual([
        expect.objectContaining({
          actor: id,
          branch,
          attemptId: attempt.id,
          text: REPLIES[branch].text,
          says: REPLIES[branch].says,
          at: s.tick,
        }),
      ]);
      expect(scene.completedBranch).toBe(branch);
      expect(
        w.events.filter((e) => e.text === `You said to ${v.name}: ${REPLIES[branch].line}`),
      ).toHaveLength(1);
      const completed = [exportRun(s), exportRun(s, true)];
      for (const raw of running) {
        const r = importRun(raw);
        while (r.tick < s.tick) step(r);
        expect(JSON.stringify(r)).toBe(JSON.stringify(s));
      }
      const copies = [...running, ...completed].map(importRun);
      for (const r of copies) while (r.tick < s.tick) step(r);
      advance(s, 15);
      for (const r of copies) {
        advance(r, 15);
        expect(JSON.stringify(r)).toBe(JSON.stringify(s));
      }
      // Closed envelopes and every supplied state field are replay checked, never trusted.
      const raw = JSON.parse(JSON.stringify(completed[0]));
      raw.state.settlement.replyScenes[id].attempts[0].attended = false;
      expect(() => importRun(raw)).toThrow(/replay/);
      const unknown = JSON.parse(JSON.stringify(completed[1]));
      unknown.inputs.at(-1).command.branch = 'peer-answer';
      expect(() => importRun(unknown)).toThrow(/replay/);
      const badConfig = JSON.parse(JSON.stringify(completed[1]));
      badConfig.config.shelf = true;
      expect(() => importRun(badConfig)).toThrow(/replay/);
      const final = JSON.stringify(s);
      expect(() => apply(s, command)).toThrow();
      expect(JSON.stringify(s)).toBe(final);
      expect(REPLIES[other].actor).toBe(id);
      expect(REPLIES[other].ticks).toBe(8);
      expect(w.records.grip).toBe('drawing');
      expect(w.records.letter).toBe('draft');
    });
});
