import {
  type Affordance,
  decide,
  finish,
  type Percept,
  perceive,
  reviewed,
} from '@adam0white/human-framework';
import type { Place } from './paths.ts';
import type { Job } from './settlement.ts';
import { REPLY_EDITION } from './settlement-scenes.ts';
import type { State, Villager } from './sim.ts';

/** Only fresh local settlement-replies/2 owns this bounded public route exchange.
 * These authored words concern witnessed route facts, never private biography or cache testimony.
 * Attention is not agreement. Talking never yields, releases a trolley or repairs a relationship.
 * HF owns choices, duration, reviews, bodies and attention; this module owns peer receipts only.
 */
function requiredPeerValue<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error('Missing replayed peer value');
  return value;
}

export const PEER_EDITION = 'settlement-replies/2';
export const hasReplies = (edition: string) => edition === REPLY_EDITION || edition === PEER_EDITION;
export type PeerCommand = {
  kind: 'peer';
  ids: string[];
  map: Place;
  disputeAt: number;
  branch: 'route-wait';
};
type Decision = { chosenAffordanceId: string | null; verdict?: string; publicSays: string };
type Act = {
  actor: string;
  id: string;
  target: string;
  action: string;
  from: number;
  startedAt: number;
  endsAt: number;
  until: number;
  status: 'running' | 'completed' | 'interrupted';
  endedAt?: number;
  reviews: { at: number; decision: Decision }[];
};
export type RouteWitness = {
  pair: [string, string];
  map: Place;
  disputeAt: number;
  trolley: string | null;
  publicFacts: { actor: string; task: string; status: string }[];
};
type Speech = {
  actor: string;
  decision?: Decision;
  act?: Act;
  text?: string;
  status: 'pending' | 'running' | 'withheld' | 'completed' | 'interrupted';
  at?: number;
  speakerAt?: number;
  listenerAt?: number;
  deliveredAt?: number;
  attended?: boolean;
  returnedAttention?: Percept[];
};
export type PeerAttempt = {
  id: string;
  branch: 'route-wait';
  witness: RouteWitness;
  requestedAt: number;
  requestFacts: { actor: string; map: Place; x: number; y: number; task: string }[];
  status: 'requested' | 'talking' | 'speaking' | 'withheld' | 'interrupted' | 'completed';
  decisions: Record<string, Decision>;
  talk: Act[];
  speech: Speech[];
  talkCompletedAt?: number;
  endedAt?: number;
  reason?: string;
};
export type PeerState = { witnesses: RouteWitness[]; attempts: PeerAttempt[] };
export type PeerHost = {
  bodyChoices: (s: State, v: Villager) => Affordance[];
  startChoice: (
    s: State,
    v: Villager,
    a: Affordance,
    d: ReturnType<typeof decide>,
    purpose: 'job' | 'body',
  ) => boolean;
  setJob: (s: State, v: Villager, j: Job) => void;
  cancel: (s: State, v: Villager) => void;
  event: (s: State, text: string) => void;
};
const person = (s: State, id: string) => {
  const v = s.villagers.find((v) => v.id === id);
  if (!v) throw new Error('Missing route participant');
  return v;
};
const decision = (d: ReturnType<typeof decide>): Decision => ({
  chosenAffordanceId: d.chosenAffordanceId,
  ...(d.suggestion ? { verdict: d.suggestion.verdict } : {}),
  publicSays: d.suggestion?.says || d.narration,
});
export function witnessRoute(s: State, a: Villager, b: Villager): void {
  const w = s.settlement;
  if (!w?.peer) return;
  w.peer.witnesses.push({
    pair: [a.id, b.id].sort() as [string, string],
    map: requiredPeerValue(w.actors[a.id]).map,
    disputeAt: s.tick,
    trolley: w.trolley,
    publicFacts: [a, b].map((v) => ({ actor: v.id, task: v.task, status: v.status })),
  });
}
export function activePeer(s: State, id: string): PeerAttempt | undefined {
  return s.settlement?.peer?.attempts.findLast(
    (a) => a.witness.pair.includes(id) && ['requested', 'talking', 'speaking'].includes(a.status),
  );
}
export function validatePeer(s: State, c: PeerCommand): RouteWitness {
  const w = s.settlement;
  if (!w?.peer || w.config.edition !== PEER_EDITION)
    throw new Error('Start a fresh day with resident conversations.');
  const keys = Object.keys(c);
  if (
    keys.length !== 5 ||
    !['kind', 'ids', 'map', 'disputeAt', 'branch'].every((k) => keys.includes(k)) ||
    c.branch !== 'route-wait' ||
    !Array.isArray(c.ids) ||
    c.ids.length !== 2 ||
    !c.ids.every((id) => typeof id === 'string' && /^v[1-8]$/.test(id)) ||
    requiredPeerValue(c.ids[0]) >= requiredPeerValue(c.ids[1]) ||
    !['yard', 'quay', 'courtyard'].includes(c.map) ||
    !Number.isInteger(c.disputeAt) ||
    c.disputeAt < 0 ||
    c.disputeAt > s.tick
  )
    throw new Error('Choose the two named residents and their recorded route event.');
  const witness = w.peer.witnesses.find(
    (e) => e.map === c.map && e.disputeAt === c.disputeAt && e.pair.every((id, i) => id === c.ids[i]),
  );
  if (!witness) throw new Error('This pair has no matching witnessed route event.');
  if (s.ended || s.pauseRequested || s.chapterPaused || s.tick + 15 >= 1800)
    throw new Error('Resume an active day with time for this conversation.');
  for (const id of c.ids) {
    const v = person(s, id),
      a = requiredPeerValue(w.actors[id]);
    if (!v.person.body.alive || v.availableAt > s.tick || a.map !== c.map)
      throw new Error('Both residents must be present on the recorded map.');
    if (
      activePeer(s, id) ||
      a.job ||
      a.carried ||
      a.path.length ||
      (a.running && a.running.purpose !== 'body') ||
      ['requested', 'running'].includes(w.replyScenes?.[id]?.attempts.at(-1)?.status ?? '')
    )
      throw new Error(
        'Finish the current task and return carried supplies, or explicitly cancel the task first.',
      );
  }
  if (
    w.peer.attempts.some(
      (a) =>
        a.witness.map === c.map &&
        a.witness.disputeAt === c.disputeAt &&
        a.witness.pair.every((id, i) => id === c.ids[i]) &&
        a.status === 'completed',
    )
  )
    throw new Error('These residents already completed this route exchange.');
  return witness;
}
export function requestPeer(s: State, c: PeerCommand, h: PeerHost): void {
  const witness = validatePeer(s, c),
    p = requiredPeerValue(requiredPeerValue(s.settlement).peer);
  const a: PeerAttempt = {
    id: `peer:${p.attempts.length + 1}`,
    branch: c.branch,
    witness: structuredClone(witness),
    requestedAt: s.tick,
    requestFacts: c.ids.map((id) => {
      const v = person(s, id);
      return {
        actor: id,
        map: requiredPeerValue(requiredPeerValue(s.settlement).actors[id]).map,
        x: v.x,
        y: v.y,
        task: v.task,
      };
    }),
    status: 'requested',
    decisions: {},
    talk: [],
    speech: [],
  };
  p.attempts.push(a);
  for (const id of c.ids)
    h.setJob(s, person(s, id), {
      kind: 'talk',
      target: a.id,
      partner: requiredPeerValue(c.ids.find((other) => other !== id)),
      map: c.map,
      point: { x: requiredPeerValue(a.requestFacts[0]).x, y: requiredPeerValue(a.requestFacts[0]).y },
      phase: 'out',
    });
  h.event(
    s,
    'Both residents were invited to discuss their earlier wait for the trolley route. Work and travel take real time. Talking does not open the route.',
  );
}
function offer(a: PeerAttempt, v: Villager, other: Villager, speaking: boolean): Affordance {
  return {
    id: `${a.id}:${speaking ? 'speak' : 'talk'}:${v.id}`,
    action: 'talk',
    label: speaking ? 'Speak about the route' : 'Talk about the route',
    targetId: a.id,
    duration: (speaking ? 2 : 8) * 0.8,
    effort: 0,
    advertises: { belonging: 0.45 },
    placeId: a.witness.map,
    with: [other.person.id],
    tags: ['social'],
  };
}
function options(s: State, v: Villager, o: Affordance, h: PeerHost) {
  return [
    o,
    ...h.bodyChoices(s, v),
    {
      id: `${o.id}:withhold`,
      action: 'wait',
      label: 'Remain quiet',
      duration: 0.8,
      effort: 0,
      advertises: {},
    },
  ];
}
function capture(s: State, v: Villager, target: string): Act | undefined {
  const activity = v.person.activity;
  if (!activity || activity.targetId !== target) return;
  return {
    actor: v.id,
    id: activity.affordanceId,
    target,
    action: activity.action,
    from: s.tick,
    startedAt: activity.startedAt,
    endsAt: activity.endsAt,
    until: s.tick + Math.ceil((activity.endsAt - activity.startedAt) / 0.8),
    status: 'running',
    reviews: [],
  };
}
function same(s: State, a: PeerAttempt, awake = true): boolean {
  const [v, other] = a.witness.pair.map((id) => person(s, id)) as [Villager, Villager];
  return (
    [v, other].every(
      (p) =>
        p.person.body.alive &&
        (!awake || !p.person.body.asleep) &&
        requiredPeerValue(requiredPeerValue(s.settlement).actors[p.id]).map === a.witness.map,
    ) && Math.hypot(v.x - other.x, v.y - other.y) <= 45
  );
}
function matches(v: Villager, act: Act): boolean {
  const x = v.person.activity;
  return (
    !!x &&
    x.affordanceId === act.id &&
    x.action === act.action &&
    x.targetId === act.target &&
    x.startedAt === act.startedAt &&
    x.endsAt === act.endsAt
  );
}
export function interruptPeer(s: State, id: string, reason: string): void {
  const a = activePeer(s, id);
  if (!a) return;
  a.status = 'interrupted';
  a.endedAt = s.tick;
  a.reason = reason;
  for (const act of [...a.talk, ...a.speech.flatMap((p) => (p.act ? [p.act] : []))]) {
    if (act.status !== 'running') continue;
    const v = person(s, act.actor);
    if (matches(v, act))
      finish(v.person, {
        affordanceId: act.id,
        action: act.action,
        targetId: act.target,
        at: v.person.now,
        status: 'interrupted',
        needs: {},
        summary: reason,
      });
    act.status = 'interrupted';
    act.endedAt = s.tick;
    const aw = requiredPeerValue(requiredPeerValue(s.settlement).actors[v.id]);
    aw.running = null;
    aw.job = null;
    aw.path = [];
  }
  for (const id of a.witness.pair) {
    const v = person(s, id),
      aw = requiredPeerValue(requiredPeerValue(s.settlement).actors[id]);
    if (aw.job?.target === a.id) {
      if (v.person.activity)
        finish(v.person, {
          affordanceId: v.person.activity.affordanceId,
          action: v.person.activity.action,
          targetId: v.person.activity.targetId,
          at: v.person.now,
          status: 'interrupted',
          needs: {},
          summary: reason,
        });
      aw.running = null;
      aw.job = null;
      aw.path = [];
    }
  }
  for (const p of a.speech) if (p.status === 'pending' || p.status === 'running') p.status = 'interrupted';
}
export function startPeerPair(s: State, v: Villager, other: Villager, h: PeerHost): boolean {
  const a = activePeer(s, v.id);
  if (!a || requiredPeerValue(requiredPeerValue(s.settlement).actors[v.id]).job?.target !== a.id)
    return false;
  if (a.status !== 'requested') return true;
  if (!same(s, a)) return true;
  const chosen = [v, other].map((p, i) => {
    const opts = options(s, p, offer(a, p, i === 0 ? other : v, false), h);
    const d = decide(p.person, opts, {
      suggestion: { voiceId: 'commander', action: 'talk', strength: 0.35 },
    });
    a.decisions[p.id] = decision(d);
    return { p, opts, d, selected: opts.find((o) => o.id === d.chosenAffordanceId) };
  });
  if (chosen.some((x) => x.selected !== x.opts[0] || x.d.suggestion?.verdict === 'refused')) {
    a.status = 'withheld';
    a.endedAt = s.tick;
    a.reason = 'Both residents did not choose the shared talk.';
    for (const x of chosen) {
      h.cancel(s, x.p);
      x.p.says = requiredPeerValue(a.decisions[x.p.id]).publicSays;
      if (x.selected && x.selected !== x.opts[0]) h.startChoice(s, x.p, x.selected, x.d, 'body');
    }
    h.event(s, a.reason);
    return true;
  }
  a.status = 'talking';
  for (const x of chosen) {
    if (!x.selected || !h.startChoice(s, x.p, x.selected, x.d, 'job')) {
      interruptPeer(s, v.id, 'Both matching talk activities could not begin.');
      return true;
    }
    const act = capture(s, x.p, a.id);
    if (!act) {
      interruptPeer(s, v.id, 'The talk activity did not match.');
      return true;
    }
    a.talk.push(act);
  }
  h.event(
    s,
    'Both residents chose to talk about their recorded wait for the route. No route agreement has been made.',
  );
  return true;
}
function words(s: State, a: PeerAttempt, index: number): string {
  const w = requiredPeerValue(s.settlement),
    id = requiredPeerValue(a.speech[index]).actor;
  const current = w.disputeAt === a.witness.disputeAt && w.dispute?.every((x) => a.witness.pair.includes(x));
  if (current && w.trolley === id && index === 0)
    return 'I have the trolley. We are both trying to use the same route.';
  // A free talking job is not evidence of current route waiting. Date the actual earlier conflict.
  const minute = Math.floor(480 + a.witness.disputeAt * 0.8);
  const clock = `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  const when =
    Math.floor((480 + s.tick * 0.8) / 1440) === Math.floor(minute / 1440)
      ? `At ${clock} earlier today`
      : `Yesterday at ${clock}`;
  return index === 0
    ? a.witness.trolley === id
      ? `${when}, I had the trolley. We were both trying to use the same route.`
      : `${when}, we disagreed about who would use the same trolley route.`
    : `${when}, we could not both use that route at once. Will you make room when we use it again?`;
}
function runningMatches(s: State, act: Act): boolean {
  const run = requiredPeerValue(requiredPeerValue(s.settlement).actors[act.actor]).running;
  return (
    !!run &&
    run.id === act.id &&
    run.action === act.action &&
    run.from === act.from &&
    run.until === act.until &&
    run.purpose === 'job'
  );
}
function finishAct(s: State, v: Villager, act: Act, text: string): boolean {
  const r = finish(v.person, {
    affordanceId: act.id,
    action: act.action,
    targetId: act.target,
    at: v.person.now,
    status: 'completed',
    needs: {},
    summary: text,
  });
  if (r?.status !== 'completed') return false;
  act.status = 'completed';
  act.endedAt = s.tick;
  requiredPeerValue(requiredPeerValue(s.settlement).actors[v.id]).running = null;
  return true;
}
function review(s: State, a: PeerAttempt, v: Villager, act: Act, speaking: boolean, h: PeerHost): boolean {
  if (v.person.now < requiredPeerValue(v.person.activity).reviewAt) return true;
  const other = person(s, requiredPeerValue(a.witness.pair.find((id) => id !== v.id)));
  const opts = options(s, v, offer(a, v, other, speaking), h),
    d = decide(v.person, opts);
  act.reviews.push({ at: v.person.now, decision: decision(d) });
  if (d.chosenAffordanceId === act.id) {
    reviewed(v.person);
    return true;
  }
  interruptPeer(s, v.id, 'A resident chose another activity at review.');
  const selected = opts.find((o) => o.id === d.chosenAffordanceId);
  if (selected) h.startChoice(s, v, selected, d, 'body');
  return false;
}
export function stepPeer(s: State, v: Villager, h: PeerHost): boolean {
  const a =
    activePeer(s, v.id) ??
    s.settlement?.peer?.attempts.findLast((a) => a.witness.pair.includes(v.id) && a.endedAt === s.tick);
  if (!a || a.status === 'requested') return false;
  if (a.endedAt === s.tick || v.id !== a.witness.pair[0]) return true;
  if (!same(s, a, a.status === 'talking') || s.tick >= 1800) {
    interruptPeer(s, v.id, 'The pair lost its shared place, wakefulness or remaining day.');
    return true;
  }
  if (a.status === 'talking') {
    if (
      a.talk.length !== 2 ||
      requiredPeerValue(a.talk[0]).from !== requiredPeerValue(a.talk[1]).from ||
      requiredPeerValue(a.talk[0]).endsAt !== requiredPeerValue(a.talk[1]).endsAt ||
      a.talk.some((act) => {
        const aw = requiredPeerValue(requiredPeerValue(s.settlement).actors[act.actor]);
        return (
          !matches(person(s, act.actor), act) ||
          !runningMatches(s, act) ||
          aw.job?.target !== a.id ||
          aw.job.kind !== 'talk' ||
          aw.job.partner !== a.witness.pair.find((id) => id !== act.actor) ||
          aw.running?.job?.target !== a.id
        );
      })
    ) {
      interruptPeer(s, v.id, 'The paired talk lost its matching activities.');
      return true;
    }
    if (a.talk.every((act) => person(s, act.actor).person.now >= act.endsAt)) {
      const done = a.talk.map((act) =>
        finishAct(s, person(s, act.actor), act, 'We finished talking about our earlier route wait.'),
      );
      if (!done.every(Boolean)) {
        interruptPeer(s, v.id, 'The paired talk did not record two completed finishes.');
        return true;
      }
      a.talkCompletedAt = s.tick;
      a.status = 'speaking';
      const holder = requiredPeerValue(s.settlement).trolley ?? a.witness.trolley;
      const order = [...a.witness.pair].sort((x, y) => Number(y === holder) - Number(x === holder));
      a.speech = order.map((actor) => ({ actor, status: 'pending' }));
      if (s.pauseRequested) {
        interruptPeer(s, v.id, 'The chapter pause stopped the unfinished outward exchange.');
        return true;
      }
      for (const id of a.witness.pair)
        requiredPeerValue(requiredPeerValue(s.settlement).actors[id]).job = null;
      return true;
    }
    for (const act of a.talk) if (!review(s, a, person(s, act.actor), act, false, h)) break;
    return true;
  }
  if (a.status !== 'speaking') return false;
  if (s.pauseRequested) {
    interruptPeer(s, v.id, 'The chapter pause stopped the unfinished outward exchange.');
    return true;
  }
  for (const [index, p] of a.speech.entries()) {
    // The second resident chooses after the first actual utterance or withholding.
    if (index > 0 && ['pending', 'running'].includes(requiredPeerValue(a.speech[index - 1]).status)) break;
    const speaker = person(s, p.actor),
      listener = person(s, requiredPeerValue(a.witness.pair.find((id) => id !== p.actor)));
    if (p.status === 'pending') {
      const opts = options(s, speaker, offer(a, speaker, listener, true), h),
        d = decide(speaker.person, opts);
      p.decision = decision(d);
      const selected = opts.find((o) => o.id === d.chosenAffordanceId);
      if (!selected || selected !== opts[0] || d.suggestion?.verdict === 'refused') {
        p.status = 'withheld';
        speaker.says = p.decision.publicSays;
        h.event(s, `${speaker.name} does not offer a route reply. ${speaker.says}`);
        if (selected) h.startChoice(s, speaker, selected, d, 'body');
        continue;
      }
      p.text = words(s, a, index);
      if (!h.startChoice(s, speaker, selected, d, 'job')) {
        p.status = 'withheld';
        continue;
      }
      p.act = capture(s, speaker, a.id);
      if (!p.act) {
        interruptPeer(s, v.id, 'The speaking activity could not be matched.');
        return true;
      }
      p.status = 'running';
      continue;
    }
    if (p.status !== 'running' || !p.act) continue;
    if (!matches(speaker, p.act) || !runningMatches(s, p.act)) {
      interruptPeer(s, v.id, 'The speaking activity was interrupted.');
      return true;
    }
    if (speaker.person.now < p.act.endsAt) {
      if (!review(s, a, speaker, p.act, true, h)) return true;
      continue;
    }
    // Ordinary driver catch-up happens for all residents before peer processing. Never backdate hearing.
    const now = 480 + s.tick * 0.8;
    if (speaker.person.now !== now || listener.person.now !== now)
      throw new Error('Peer hearing clock mismatch');
    p.text = words(s, a, index);
    if (speaker.person.body.asleep || !p.text || !finishAct(s, speaker, p.act, p.text)) {
      interruptPeer(s, v.id, 'The speaking act did not complete.');
      return true;
    }
    p.status = 'completed';
    p.at = s.tick;
    p.speakerAt = speaker.person.now;
    p.listenerAt = listener.person.now;
    p.deliveredAt = now;
    const heard = perceive(listener.person, [
      {
        at: now,
        channel: 'heard',
        kind: 'route-utterance',
        actorId: speaker.person.id,
        targetId: listener.person.id,
        placeId: a.witness.map,
        salience: 0.7,
        near: true,
        summary: p.text,
      },
    ]);
    p.returnedAttention = structuredClone(heard);
    p.attended = heard.some(
      (x) =>
        x.at === now &&
        x.kind === 'route-utterance' &&
        x.actorId === speaker.person.id &&
        x.summary === p.text,
    );
    speaker.says = p.text;
    speaker.task = 'waiting';
    speaker.status = 'waiting';
    requiredPeerValue(s.settlement).accounts.push({
      at: s.tick,
      speaker: speaker.name,
      listener: listener.name,
      text: p.text,
    });
    h.event(s, `${speaker.name} says at ${now.toFixed(1)} minutes: ${p.text}`);
  }
  if (a.speech.every((p) => ['withheld', 'completed'].includes(p.status))) {
    a.status = a.speech.every((p) => p.status === 'completed') ? 'completed' : 'withheld';
    a.endedAt = s.tick;
    h.event(s, 'The route conversation ended. No Yield or route agreement follows from these words.');
  }
  return true;
}
