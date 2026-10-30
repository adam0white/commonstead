// HF4 current-policy controls use the single canonical long scenario. Historical source stays frozen at c98.
import { describe, expect, test } from 'vitest';
import { archiveCommunity } from '../src/hf4';
import { blocked, route } from '../src/paths.ts';
import { EDITION } from '../src/settlement.ts';
import { REPLIES } from '../src/settlement-scenes.ts';
import { apply, createGame, exportRun, importRun, stateHash, step } from '../src/sim.ts';

function retained(person: Parameters<typeof archiveCommunity>[0]) {
  const saved = archiveCommunity(person).current.people[person.id];
  if (!saved) throw new Error('Missing retained resident');
  return saved;
}
const memory = (person: Parameters<typeof archiveCommunity>[0]) => retained(person).memory;

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

describe('current settlement day focused headless controls', () => {
  test('full-day bodies, food, sleep and sourced duties advance with exact public replay', async () => {
    const s = day();
    const actions = new Set<string>();
    let nearFull: unknown, nearCompact: unknown, expected1795: unknown;
    for (let i = 0; i < 1800; i++) {
      step(s);
      if (s.tick === 1790) {
        nearFull = exportRun(s);
        nearCompact = exportRun(s, true);
      }
      if (s.tick === 1795) expected1795 = exportRun(s);
      if (i % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      for (const v of s.villagers) {
        const a = v.person.activity?.action;
        if (a) actions.add(a);
      }
    }
    expect(s.tick).toBe(1800);
    const at = archiveCommunity(resident(s, 'v1').person).current.at / 60_000;
    expect(s.villagers.every((v) => v.person.now === at)).toBe(true);
    expect(at).toBeGreaterThanOrEqual(1920);
    expect(at).toBeLessThan(1921);
    expect(actions.has('sleep')).toBe(true);
    expect(actions.has('eat')).toBe(true);
    expect(actions.has('pray')).toBe(true);
    expect(
      s.villagers.every(
        (v) => v.person.body.lastSleep && v.person.agenda.commitments.some((c) => c.status === 'kept'),
      ),
    ).toBe(true);
    expect(s.resources.food).toBeLessThan(100);
    const restored = importRun(exportRun(s));
    expect(restored).toEqual(s);
    for (const source of [nearFull, nearCompact]) {
      const near = importRun(source);
      expect(near.tick).toBe(1790);
      advance(near, 5);
      expect(near.tick).toBe(1795);
      expect(exportRun(near)).toEqual(expected1795);
    }
    advance(s, 3);
    advance(restored, 3);
    expect(restored).toEqual(s);
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
    expect(memory(resident(s, 'v1').person).beliefs.some((b) => b.prop === 'yard:boards-remain')).toBe(true);
    until(s, () => s.resources.wood > 80, 150);
    expect(w.caches.quay.wood).toBe(180);
    expect(memory(resident(s, 'v2').person).beliefs.some((b) => b.prop === 'yard:boards-remain')).toBe(false);
  });
  test('actual conversation delivers witnessed accounts, not instant private disclosure', () => {
    const s = day();
    request(s, ['v1'], 'inspect');
    until(s, () => s.settlement?.events.some((e) => e.text.includes('Nora inspects')) ?? false, 150);
    request(s, ['v1', 'v2'], 'talk');
    until(s, () => !!s.settlement?.accounts.length, 200);
    const account = s.settlement?.accounts.find((a) => a.speaker === resident(s, 'v1').name);
    expect(account?.text).toContain('yard:boards-remain');
    expect(memory(resident(s, 'v2').person).episodes).toContainEqual(
      expect.objectContaining({
        kind: 'claim',
        actorId: resident(s, 'v1').person.id,
        summary: account?.text,
      }),
    );
    expect(memory(resident(s, 'v2').person).beliefs.some((b) => b.prop === 'yard:boards-remain')).toBe(true);
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
      retained(resident(t, 'v1').person).social.relationships.some(
        (r) => r.otherId === t.villagers[1]?.person.id,
      ),
    ).toBe(true);
  });
  test('shared trolley conflict is observed, and an actual yielding choice opens the route', () => {
    const s = day();
    apply(s, { kind: 'order', ids: ['v1', 'v2'], target: 'wood' });
    until(s, () => !!s.settlement?.dispute, 160);
    const w = s.settlement;
    if (!w?.dispute) throw new Error('Missing actual dispute');
    for (const v of s.villagers.filter((v) => ['v1', 'v2'].includes(v.id))) {
      expect(memory(v.person).episodes).toContainEqual(
        expect.objectContaining({
          kind: 'conflict',
          summary: 'We reached the narrow trolley route together and disagreed about who would use it.',
        }),
      );
    }
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
    expect(v.person.agenda.commitments.find((current) => current.id === c?.id)?.status).toBe('kept');
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
    expect(resident(s, 'v1').person.agenda.commitments.find((current) => current.id === c?.id)?.status).toBe(
      'released',
    );
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
        () => s.settlement?.events.some((e) => e.text.includes('did not gain both people’s assent')) ?? false,
        160,
      );
      expect(
        s.settlement?.events.some(
          (e) => e.text.includes('finish talking') || e.text.includes('finish the voluntary practice bout'),
        ),
      ).toBe(false);
      expect(s.settlement?.accounts).toEqual([]);
      expect(s.resources.wood).toBe(80);
      expect(s.settlement?.dispute).not.toBeNull();
      expect(s.settlement?.routeAgreements).toEqual([]);
      request(s, ['v1'], 'yield');
      until(s, () => s.settlement?.dispute === null, 100);
    }
  });
  test('fictional correction spends paper; an unaffordable visit grants no journey or return', () => {
    const s = day();
    request(s, ['v2'], 'scene', 'correction');
    advance(s, 5);
    expect(s.settlement?.completed).toHaveLength(0);
    story(s, 'v2');
    request(s, ['v2'], 'scene', 'correction');
    until(s, () => s.settlement?.completed.some((c) => c.scene === 'correction') ?? false, 400);
    expect(s.settlement?.actors.v2?.map).toBe('quay');
    expect(s.resources.wood).toBe(80);
    expect(s.story?.paper).toBe(3);
    expect(s.settlement?.records.samReport).toContain('did not reproduce');
    request(s, ['v2'], 'scene', 'visit');
    until(s, () => !s.settlement?.actors.v2?.job, 1000);
    expect(s.resources.food).toBeLessThan(4);
    expect(resident(s, 'v2').person.trace.at(-1)?.chosenAffordanceId).toBe('visit');
    expect(s.settlement?.completed.some((c) => c.scene === 'visit')).toBe(false);
    expect(s.settlement?.actors.v2?.running).toBeNull();
    expect(s.settlement?.actors.v2?.map).toBe('quay');
    expect(s.story?.paper).toBe(3);
    expect(s.settlement?.events.some((e) => e.text.includes('returns from the arranged family visit'))).toBe(
      false,
    );
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
      const s = createGame(42, undefined, { edition: 'settlement-replies/2' });
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
      expect(scene.disclosure.at).toBe(s.tick);
      expect(scene.disclosure.at).toBeGreaterThanOrEqual(60);
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
      expect(s.story!.paper).toBe(4);
      until(s, () => attempt.status === 'running', 50);
      expect(attempt.deliveredAt).toBe(s.tick);
      expect(attempt.attended).toBe(true);
      expect(attempt.decision?.chosenAffordanceId).toBe(`reply:${branch}`);
      expect(attempt.decision?.verdict).not.toBe('refused');
      expect(attempt.paperSpent).toBe(1);
      expect(s.story!.paper).toBe(3);
      expect(s.story!.firstResults).toEqual([]);
      const beforeDuplicate = JSON.stringify(s);
      expect(() => apply(s, command)).toThrow();
      expect(() => apply(s, { ...command, branch: other })).toThrow();
      expect(() => apply(s, { kind: 'order', ids: [id], target: 'wood' })).toThrow(/Cancel/);
      expect(JSON.stringify(s)).toBe(beforeDuplicate);
      const running = exportRun(s);
      const started = attempt.startedAt;
      if (started === undefined) throw new Error('no begin');
      const fork = importRun(pre);
      apply(fork, command);
      until(fork, () => fork.settlement?.replyScenes?.[id]?.attempts[0]?.status === 'running', 50);
      advance(fork, 3);
      expect(fork.tick).toBe(started + 3);
      request(fork, [id], 'cancel');
      advance(fork, 20);
      expect(fork.story?.paper).toBe(3);
      expect(fork.story?.firstResults).toEqual([]);
      expect(fork.settlement?.replyScenes?.[id]?.attempts[0]?.status).toBe('interrupted');
      expect(fork.settlement?.replyScenes?.[id]?.completedBranch).toBeUndefined();
      expect(fork.settlement?.events.some((e) => e.text.includes(REPLIES[branch].says))).toBe(false);
      until(s, () => attempt.status === 'completed', 30);
      expect(attempt.endedAt).toBe(attempt.until);
      expect(s.tick - started).toBeGreaterThanOrEqual(REPLIES[branch].ticks);
      expect(s.tick - started).toBeLessThanOrEqual(REPLIES[branch].ticks + 1);
      expect(s.story!.firstResults).toEqual([
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
      const restored = importRun(running);
      while (restored.tick < s.tick) step(restored);
      expect(restored).toEqual(s);
      advance(s, 3);
      advance(restored, 3);
      expect(restored).toEqual(s);
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

function requiredPeerValue<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error('Missing replayed peer value');
  return value;
}

describe('fresh public route dialogue day', () => {
  test('current native schema retains each edition and refuses peer input without an actual witness', () => {
    const s = createGame(418, undefined, { edition: 'settlement-replies/2' } as never);
    expect((exportRun(s) as { schema: number }).schema).toBe(13);
    expect(s.settlement?.replyScenes).toEqual({});
    expect(importRun(exportRun(s))).toEqual(s);
    expect(importRun(exportRun(s, true))).toEqual(s);
    for (const config of [
      undefined,
      { edition: 'settlement-replies/2' },
      { edition: 'settlement-replies/2' },
    ]) {
      const old = createGame(418, undefined, config as never);
      const before = JSON.stringify(old);
      expect(() =>
        apply(old, {
          kind: 'peer',
          ids: ['v1', 'v2'],
          map: 'yard',
          disputeAt: 0,
          branch: 'route-wait',
        } as never),
      ).toThrow();
      expect(JSON.stringify(old)).toBe(before);
    }
  });
});

test('one ordinary route dispute supports real paired talk, costed words, cancellation and complete native replay', () => {
  const s = createGame(418, undefined, { edition: 'settlement-replies/2' });
  apply(s, { kind: 'order', ids: ['v1', 'v2'], target: 'wood' });
  until(s, () => !!s.settlement?.dispute, 160);
  const w = requiredPeerValue(s.settlement);
  const witness = requiredPeerValue(requiredPeerValue(w.peer).witnesses.at(-1));
  expect(witness.disputeAt).toBe(17);
  expect(witness.trolley).toBe('v1');
  const command = {
    kind: 'peer',
    ids: [...witness.pair],
    map: witness.map,
    disputeAt: witness.disputeAt,
    branch: 'route-wait',
  } as const;
  const input = { ...command, ids: [...command.ids] };
  const before = JSON.stringify(s);
  expect(() => apply(s, input)).toThrow(/current task/);
  expect(JSON.stringify(s)).toBe(before);
  request(s, [...witness.pair], 'cancel');
  const free = JSON.stringify(s);
  for (const bad of [
    { ...input, extra: true },
    { ...input, branch: 'unknown' },
    { ...input, ids: ['v1', 'v3'] },
    { ...input, ids: ['v2', 'v1'] },
    { ...input, ids: ['v1', 'v1'] },
    { ...input, disputeAt: 0 },
    { ...input, disputeAt: s.tick + 1 },
    { ...input, map: 'quay' },
  ]) {
    expect(() => apply(s, bad as never)).toThrow();
    expect(JSON.stringify(s)).toBe(free);
  }
  apply(s, input);
  until(s, () => requiredPeerValue(requiredPeerValue(w.peer).attempts[0]).status === 'talking', 100);
  const attempt = requiredPeerValue(requiredPeerValue(w.peer).attempts[0]);
  expect(attempt.talk).toHaveLength(2);
  expect(attempt.talk.every((a) => a.status === 'running' && a.startedAt >= 480 + a.from * 0.8)).toBe(true);
  expect(new Set(attempt.talk.map((a) => a.startedAt)).size).toBe(1);
  const running = exportRun(s),
    compact = exportRun(s, true);
  expect(importRun(running)).toEqual(s);
  expect(importRun(compact)).toEqual(s);
  const cancelled = importRun(compact),
    untouched = importRun(running);
  const cancelStart = cancelled.tick;
  advance(cancelled, 3);
  request(cancelled, ['v1'], 'cancel');
  const stopped = requiredPeerValue(
    requiredPeerValue(requiredPeerValue(cancelled.settlement).peer).attempts[0],
  );
  expect(cancelled.tick - cancelStart).toBe(3);
  expect(stopped.status).toBe('interrupted');
  expect(stopped.talk.every((a) => a.status === 'interrupted')).toBe(true);
  expect(stopped.talkCompletedAt).toBeUndefined();
  expect(stopped.speech).toEqual([]);
  expect(requiredPeerValue(cancelled.settlement).routeAgreements).toEqual([]);
  expect(requiredPeerValue(cancelled.settlement).disputeAt).toBe(witness.disputeAt);
  expect(requiredPeerValue(cancelled.villagers[0]).person.now).toBeGreaterThan(
    requiredPeerValue(attempt.talk[0]).startedAt,
  );
  expect(importRun(exportRun(cancelled))).toEqual(cancelled);
  expect(importRun(exportRun(cancelled, true))).toEqual(cancelled);
  until(s, () => attempt.status === 'speaking', 100);
  const speaking = importRun(exportRun(s, true));
  expect(speaking).toEqual(s);
  until(s, () => attempt.status === 'completed' || attempt.status === 'withheld', 100);
  // HF owns the outward choice. A withheld utterance must not become delivered words.
  expect(['completed', 'withheld']).toContain(attempt.status);
  expect(attempt.talkCompletedAt).toBeGreaterThan(attempt.requestedAt);
  expect(attempt.endedAt).toBeGreaterThanOrEqual(requiredPeerValue(attempt.talkCompletedAt));
  expect(attempt.speech).toHaveLength(2);
  for (const p of attempt.speech) {
    if (p.status === 'withheld') {
      expect(p.deliveredAt).toBeUndefined();
      continue;
    }
    expect(p.status).toBe('completed');
    expect(requiredPeerValue(requiredPeerValue(p.act).endedAt)).toBeGreaterThan(
      requiredPeerValue(p.act).from,
    );
    expect(requiredPeerValue(p.act).endsAt - requiredPeerValue(p.act).startedAt).toBeCloseTo(1.6);
    expect(p.speakerAt).toBeGreaterThanOrEqual(480 + requiredPeerValue(p.at) * 0.8);
    expect(p.listenerAt).toBe(p.speakerAt);
    expect(p.deliveredAt).toBe(p.speakerAt);
    expect(p.attended).toBe(true);
    const listener = resident(s, requiredPeerValue(witness.pair.find((id) => id !== p.actor)));
    const episode = memory(listener.person).episodes.find((e) => e.summary === p.text);
    expect(episode ? episode.at / 60_000 : undefined).toBe(p.deliveredAt);
  }
  expect(w.routeAgreements).toEqual([]);
  expect(w.disputeAt).toBe(witness.disputeAt);
  expect(w.trolley).toBeNull();
  expect(w.caches.yard.wood).toBe(280);
  expect(s.resources.wood).toBe(80);
  expect(importRun(exportRun(s))).toEqual(s);
  expect(importRun(exportRun(s, true))).toEqual(s);
  while (untouched.tick < s.tick) step(untouched);
  while (speaking.tick < s.tick) step(speaking);
  expect(untouched).toEqual(s);
  expect(speaking).toEqual(s);
  const paused = importRun(running);
  apply(paused, { kind: 'pause-chapter' });
  until(paused, () => paused.chapterPaused, 100);
  expect(
    requiredPeerValue(requiredPeerValue(requiredPeerValue(paused.settlement).peer).attempts[0]).status,
  ).toBe('interrupted');
  expect(
    requiredPeerValue(requiredPeerValue(requiredPeerValue(paused.settlement).peer).attempts[0]).speech.every(
      (p) => p.status !== 'completed',
    ),
  ).toBe(true);
  expect(importRun(exportRun(paused, true))).toEqual(paused);
  const continued = importRun(exportRun(s, true));
  advance(s, 5);
  advance(continued, 5);
  expect(continued).toEqual(s);
  expect(importRun(exportRun(s))).toEqual(s);
  expect(importRun(exportRun(s, true))).toEqual(s);
});

// Retest 2026-10-27: the player answers a resident where she stands, and a load left in hand
// after Cancel task is delivered by the existing walk back to the yard that the UI now offers.
test('a reply needs no walk to the hub, and a cancelled carrier can still deliver', () => {
  const s = createGame(42, undefined, { edition: 'settlement-replies/2' });
  const nora = resident(s, 'v1');
  apply(s, { kind: 'order', ids: ['v1'], target: 'move', x: 300, y: 300 });
  story(s, 'v1');
  until(s, () => !s.settlement?.actors.v1?.job && !s.settlement?.actors.v1?.path.length, 200);
  expect(Math.hypot(nora.x - 525, nora.y - 475)).toBeGreaterThan(45);
  apply(s, { kind: 'reply', ids: ['v1'], branch: 'nora-restore-drawing' });
  const attempt = s.settlement?.replyScenes?.v1?.attempts[0];
  until(s, () => attempt?.status === 'completed', 400);

  const w = s.settlement;
  if (!w) throw new Error('day');
  request(s, ['v2'], 'map', 'yard');
  apply(s, { kind: 'order', ids: ['v2'], target: 'wood' });
  until(s, () => !!w.actors.v2?.carried, 400);
  request(s, ['v2'], 'cancel');
  expect(w.actors.v2?.carried).not.toBeNull();
  const wood = s.resources.wood;
  request(s, ['v2'], 'map', 'yard');
  until(s, () => !w.actors.v2?.carried, 300);
  expect(s.resources.wood).toBeGreaterThan(wood);
  expect(stateHash(importRun(JSON.parse(JSON.stringify(exportRun(s)))))).toBe(stateHash(s));
});
