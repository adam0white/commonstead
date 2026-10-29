import {
  type Affordance,
  actionResolutions,
  begin,
  decide,
  finish,
  type ObservationReceipt,
  observe,
  reviewed,
  stageOutcome,
} from './hf4';
import type { Place, Point } from './paths';
import { type PublicCommand, type PublicFact, publicVoiceOffer } from './public-voice-content';
import type { State, Villager } from './sim';
import { ensureStory, type StoryHost, storyEnd } from './story-records';

export type PublicExchange = {
  id: string;
  command: PublicCommand;
  requestedAt: number;
  inputIndex: number;
  facts: PublicFact[];
  lines: { speaker: string; text: string; sourceIds: string[] }[];
  map: Place;
  point: Point;
  status: 'requested' | 'active' | 'completed' | 'withheld' | 'interrupted';
  reason?: string;
  endedAt?: number;
  participants: {
    actor: string;
    nativeId: string;
    status:
      | 'waiting'
      | 'travelling'
      | 'ready'
      | 'running'
      | 'completed'
      | 'withheld'
      | 'unheard'
      | 'interrupted'
      | 'continued-work';
    prior?: unknown;
    detached?: boolean;
    reoffered?: boolean;
    invitation?: ObservationReceipt[];
    decision?: { chosenAffordanceId: string | null; publicSays: string };
    activity?: { id: string; affordanceId: string; startedAt: number; endsAt: number };
    until?: number;
    resolutions?: ReturnType<typeof actionResolutions>;
    continuedWork?: { id: string; affordanceId: string; startedAt: number; endsAt: number };
    reviewDecisions?: { at: number; chosenAffordanceId: string | null; publicSays: string }[];
    completedAt?: number;
    heard?: {
      listener: string;
      nativeId: string;
      at: number;
      status: 'heard' | 'unheard';
      receipts: ObservationReceipt[];
    }[];
  }[];
};
export type PublicHost = StoryHost & {
  work: (s: State, v: Villager, prior: unknown) => Affordance | undefined;
  startWork: (s: State, v: Villager, prior: unknown, a: Affordance, d: ReturnType<typeof decide>) => boolean;
  detach: (s: State, v: Villager) => unknown;
  resume: (s: State, v: Villager, prior: unknown, quiet?: boolean) => void;
};
export const activePublic = (s: State, id: string) =>
  s.story?.publicExchanges?.findLast(
    (a) => a.command.ids.includes(id) && ['requested', 'active'].includes(a.status),
  );
const actor = (s: State, id: string) => s.villagers.find((v) => v.id === id)!;
const unit = (s: State) => (s.settlement ? 0.8 : 0.5);
// Short meetings use ordinary yard arrival; no final coordinate snap grants the place.
const atPlace = (s: State, v: Villager, a: PublicExchange) =>
  (s.settlement?.actors[v.id]?.map ?? 'yard') === a.map &&
  Math.hypot(v.x - a.point.x, v.y - a.point.y) <= (s.settlement ? 5 : 15);
const held = (s: State, v: Villager) =>
  !!(
    v.person.activity ||
    s.settlement?.actors[v.id]?.running ||
    s.settlement?.actors[v.id]?.carried ||
    s.settlement?.actors[v.id]?.path.length
  );
export function publicExchangeOffer(s: State, c: PublicCommand) {
  const offer = publicVoiceOffer(s, c);
  if (
    s.ended ||
    s.chapterPaused ||
    s.pauseRequested ||
    s.shortYield ||
    s.story?.close ||
    s.tick + 3 >= storyEnd(s)
  )
    throw new Error('Resume an active workshop with time for this invitation.');
  for (const id of c.ids) {
    const v = actor(s, id);
    if (!v.person.body.alive || v.availableAt > s.tick)
      throw new Error('This resident is unavailable for an invitation.');
    if (
      activePublic(s, id) ||
      s.story?.attempts.some(
        (a) => a.actor === id && ['requested', 'travelling', 'running', 'scene'].includes(a.status),
      ) ||
      s.settlement?.peer?.attempts.some(
        (a) => a.witness.pair.includes(id) && ['requested', 'talking', 'speaking'].includes(a.status),
      ) ||
      ['requested', 'running'].includes(s.settlement?.replyScenes?.[id]?.attempts.at(-1)?.status ?? '') ||
      s.yieldReturn?.some(
        (a) => a.actor === id && ['finish', 'delivery', 'yield', 'return'].includes(a.stage),
      ) ||
      s.roofBreak?.attempts.some((a) => a.id === id && ['roof', 'rest'].includes(a.stage)) ||
      s.longRoofBreak?.attempts.some(
        (a) => a.id === id && ['finish', 'delivery', 'roof', 'rest'].includes(a.stage),
      )
    )
      throw new Error('Finish or stop the earlier exchange or return sequence first.');
  }
  return offer;
}
export function requestPublicExchange(s: State, c: PublicCommand) {
  const offer = publicExchangeOffer(s, c);
  if (s.inputs.length >= 10000) throw new Error('The run input limit has been reached.');
  const r = ensureStory(s);
  r.publicExchanges ??= [];
  const list = r.publicExchanges;
  list.push({
    id: `public:${list.length + 1}`,
    command: structuredClone(c),
    requestedAt: s.tick,
    inputIndex: s.inputs.length,
    ...structuredClone(offer),
    status: 'requested',
    participants: c.ids.map((id) => ({ actor: id, nativeId: actor(s, id).person.id, status: 'waiting' })),
  });
  s.message =
    'The public invitation is waiting for a safe action and delivery boundary. Speaking and hearing remain separate.';
}
function sameActivity(v: Villager, p: PublicExchange['participants'][number]) {
  return (
    !!p.activity &&
    v.person.activity?.id === p.activity.id &&
    v.person.activity.affordanceId === p.activity.affordanceId &&
    v.person.activity.startedAt === p.activity.startedAt &&
    v.person.activity.endsAt === p.activity.endsAt
  );
}
function sourceCurrent(s: State, a: PublicExchange) {
  try {
    return JSON.stringify(publicVoiceOffer(s, a.command).facts) === JSON.stringify(a.facts);
  } catch {
    return false;
  }
}
export function interruptPublic(s: State, id: string, reason: string) {
  const a = activePublic(s, id);
  if (!a) return;
  for (const p of a.participants) {
    const v = actor(s, p.actor);
    if (sameActivity(v, p))
      finish(v.person, {
        action: 'talk',
        affordanceId: p.activity!.affordanceId,
        targetId: a.id,
        at: v.person.now,
        status: 'interrupted',
        summary: reason,
      });
  }
  for (const p of a.participants)
    if (!['completed', 'withheld', 'unheard'].includes(p.status)) p.status = 'interrupted';
  a.status = 'interrupted';
  a.reason = `${reason} Earlier requests remain in this invitation’s record; no work was automatically offered.`;
  a.endedAt = s.tick;
}
function offer(s: State, a: PublicExchange, v: Villager): Affordance {
  return {
    id: `${a.id}:speak:${v.id}`,
    action: 'talk',
    label: 'Speak about public work',
    targetId: a.id,
    duration: 2 * unit(s),
    effort: 0,
    advertises: { belonging: 0.45 },
    placeId: a.map,
    tags: ['social'],
  };
}
// Retained work is a real existing offer, not an automatic completion or a second work request.
export function publicChoiceOptions(
  s: State,
  v: Villager,
  a: PublicExchange,
  p: PublicExchange['participants'][number],
  h: PublicHost,
) {
  const work = p.detached && !p.reoffered ? h.work(s, v, p.prior) : undefined;
  return [
    offer(s, a, v),
    ...(work ? [work] : []),
    ...h.body(s, v),
    { id: `${a.id}:quiet:${v.id}`, action: 'wait', label: 'Remain quiet', duration: unit(s), advertises: {} },
  ];
}
export function startPublicAlternative(
  s: State,
  v: Villager,
  a: PublicExchange,
  p: PublicExchange['participants'][number],
  h: PublicHost,
  selected: Affordance | undefined,
  d: ReturnType<typeof decide>,
  offeredWork?: Affordance,
) {
  if (!['ready', 'running'].includes(p.status)) return;
  if (sameActivity(v, p)) {
    finish(v.person, {
      action: 'talk',
      affordanceId: p.activity!.affordanceId,
      targetId: a.id,
      at: v.person.now,
      status: 'interrupted',
      summary: 'I chose another activity before completing these words.',
    });
    p.resolutions = actionResolutions(v.person, p.activity!.id);
  }
  // Pin the actually offered alternative before decision; eligibility is rechecked by its owner.
  const work = p.detached && !p.reoffered ? (offeredWork ?? h.work(s, v, p.prior)) : undefined;
  if (selected && work && JSON.stringify(selected) === JSON.stringify(work)) {
    p.reoffered = true;
    if (h.startWork(s, v, p.prior, selected, d)) {
      p.status = 'continued-work';
      const x = v.person.activity!;
      p.continuedWork = { id: x.id, affordanceId: x.affordanceId, startedAt: x.startedAt, endsAt: x.endsAt };
    } else {
      p.status = 'interrupted';
      a.reason = 'The selected retained task could not start. No speech completed.';
    }
  } else {
    p.status = 'withheld';
    if (selected) h.alternative(s, v, selected, d);
  }
}
// Invitation, completed speech and actual attention are separate. Ingress alone never proves hearing.
export function stagePublicExchanges(s: State) {
  for (const a of s.story?.publicExchanges ?? [])
    if (['requested', 'active'].includes(a.status) && sourceCurrent(s, a))
      for (const p of a.participants) {
        const v = actor(s, p.actor);
        if (
          p.status === 'running' &&
          sameActivity(v, p) &&
          atPlace(s, v, a) &&
          s.tick >= (p.until ?? Infinity)
        )
          stageOutcome(v.person, {
            action: 'talk',
            affordanceId: p.activity!.affordanceId,
            targetId: a.id,
            at: 480 + s.tick * unit(s),
            status: 'completed',
            summary: a.lines.find((l) => l.speaker === p.actor)!.text,
          });
      }
}
export function stepPublicExchange(s: State, v: Villager, h: PublicHost): boolean {
  const a = activePublic(s, v.id);
  if (!a) return false;
  const p = a.participants.find((p) => p.actor === v.id)!;
  if (
    s.ended ||
    s.tick >= storyEnd(s) ||
    !sourceCurrent(s, a) ||
    a.participants.some(
      (p) => !actor(s, p.actor).person.body.alive || actor(s, p.actor).person.id !== p.nativeId,
    )
  ) {
    interruptPublic(s, v.id, 'The public invitation lost its active day, source or participant.');
    return false;
  }
  const boundary = !!s.story?.close || s.pauseRequested;
  if (
    boundary &&
    p.status !== 'running' &&
    !['completed', 'withheld', 'unheard', 'interrupted', 'continued-work'].includes(p.status)
  ) {
    if (held(s, v)) return false;
    p.status = 'interrupted';
  }
  if (['completed', 'withheld', 'unheard', 'interrupted', 'continued-work'].includes(p.status)) {
    if (
      boundary &&
      a.participants.every((q) =>
        ['completed', 'withheld', 'unheard', 'interrupted', 'continued-work'].includes(q.status),
      )
    ) {
      a.status = a.participants.some((q) => q.status === 'interrupted') ? 'interrupted' : 'withheld';
      a.endedAt = s.tick;
      for (const q of a.participants)
        if (q.detached && !q.reoffered) {
          q.reoffered = true;
          h.resume(s, actor(s, q.actor), q.prior, true);
        }
    }
    return p.status === 'completed';
  }
  if (p.status === 'waiting') {
    const aw = s.settlement?.actors[v.id];
    if (aw?.carried && !aw.job && !aw.running && !v.person.activity) {
      if (!h.move(s, v, 'yard', { x: 525, y: 475 })) {
        interruptPublic(s, v.id, 'The carried load has no ordinary return route.');
        return false;
      }
      return false;
    }
    if (held(s, v) || v.recoveryUntil > s.tick) return false;
    p.prior = h.detach(s, v);
    p.detached = true;
    p.status = 'ready';
    // First speaker's actual safe boundary pins the meeting place; public meaning is independent of travel.
    if (v.id === a.command.ids[0]) {
      a.map = s.settlement?.actors[v.id]?.map ?? 'yard';
      a.point = { x: v.x, y: v.y };
    }
  }
  if (a.participants[0]!.status === 'waiting') return true;
  if (p.status === 'travelling') {
    if (held(s, v) || v.order || s.settlement?.actors[v.id]?.job) return false;
    if (!atPlace(s, v, a)) {
      interruptPublic(s, v.id, 'The ordinary journey did not reach the public meeting place.');
      return false;
    }
    p.status = 'ready';
  }
  if (p.status === 'ready' && !atPlace(s, v, a)) {
    if (!h.move(s, v, a.map, a.point)) {
      interruptPublic(s, v.id, 'The actual public meeting route is unavailable.');
      return false;
    }
    p.status = 'travelling';
    return false;
  }
  if (a.participants.some((p) => ['waiting', 'travelling'].includes(p.status))) return true;
  if (a.participants.some((p) => p.status === 'ready' && !atPlace(s, actor(s, p.actor), a))) return true;
  if (a.participants.some((p) => p.status === 'running' && !atPlace(s, actor(s, p.actor), a))) {
    interruptPublic(s, v.id, 'A participant left the actual meeting place.');
    return false;
  }
  const words = a.lines.find((l) => l.speaker === v.id)!.text;
  if (p.status === 'running') {
    if (!sameActivity(v, p)) {
      interruptPublic(s, v.id, 'The speaking activity was interrupted.');
      return true;
    }
    if (s.tick >= p.until! && v.person.now >= p.activity!.endsAt) {
      const r = finish(v.person, {
        action: 'talk',
        affordanceId: p.activity!.affordanceId,
        targetId: a.id,
        at: v.person.now,
        status: 'completed',
        summary: words,
      });
      p.resolutions = actionResolutions(v.person, p.activity!.id);
      if (
        r?.status !== 'completed' ||
        !p.resolutions.some(
          (i) =>
            i.payload.stage === 'finish' &&
            i.payload.disposition === 'completed' &&
            i.payload.outcome?.activityId === p.activity!.id,
        )
      ) {
        interruptPublic(s, v.id, 'No matching completed speaking receipt was recorded.');
        return true;
      }
      p.status = 'completed';
      p.completedAt = s.tick;
      p.heard = [];
      v.says = words;
      for (const other of a.participants.filter((x) => x.actor !== v.id)) {
        const listener = actor(s, other.actor);
        if (!atPlace(s, listener, a) || !listener.person.body.alive) {
          p.heard.push({
            listener: listener.id,
            nativeId: listener.person.id,
            at: s.tick,
            status: 'unheard',
            receipts: [],
          });
          continue;
        }
        const result = observe(listener.person, [
          {
            at: v.person.now,
            channel: 'heard',
            kind: 'public-work-utterance',
            actorId: v.person.id,
            targetId: listener.person.id,
            placeId: a.map,
            salience: 0.7,
            near: true,
            summary: words,
          },
        ]);
        p.heard.push({
          listener: listener.id,
          nativeId: listener.person.id,
          at: s.tick,
          status: result.receipts.some((r) => r.attention > 0) ? 'heard' : 'unheard',
          receipts: result.receipts,
        });
      }
    } else if (!boundary && v.person.now >= v.person.activity!.reviewAt) {
      const o = offer(s, a, v),
        opts = publicChoiceOptions(s, v, a, p, h),
        offeredWork = p.detached && !p.reoffered ? h.work(s, v, p.prior) : undefined,
        d = decide(v.person, opts);
      if (d.chosenAffordanceId === o.id) reviewed(v.person);
      else {
        p.reviewDecisions ??= [];
        p.reviewDecisions.push({
          at: s.tick,
          chosenAffordanceId: d.chosenAffordanceId,
          publicSays: d.suggestion?.says || d.narration,
        });
        startPublicAlternative(
          s,
          v,
          a,
          p,
          h,
          opts.find((x) => x.id === d.chosenAffordanceId),
          d,
          offeredWork,
        );
      }
    }
  } else if (p.status === 'ready') {
    if (s.tick + 3 >= storyEnd(s)) {
      interruptPublic(s, v.id, 'There is no longer enough ordinary time to speak.');
      return true;
    }
    const observed = observe(v.person, [
      {
        at: v.person.now,
        channel: 'heard',
        kind: a.command.topic === 'yield' ? 'completed-yield-report' : 'public-work-invitation',
        actorId: 'commander',
        targetId: v.person.id,
        placeId: a.map,
        salience: 0.7,
        near: true,
        summary:
          a.command.topic === 'yield'
            ? `Public completed report ${a.facts[0]!.sourceId}: ${words}`
            : `Would you speak about this public fact? ${words}`,
      },
    ]);
    p.invitation = observed.receipts;
    if (!observed.receipts.some((r) => r.attention > 0)) {
      p.status = 'unheard';
    } else {
      const o = offer(s, a, v),
        opts = publicChoiceOptions(s, v, a, p, h),
        offeredWork = p.detached && !p.reoffered ? h.work(s, v, p.prior) : undefined,
        d = decide(v.person, opts, { suggestion: { voiceId: 'commander', action: 'talk', strength: 0.35 } });
      p.decision = {
        chosenAffordanceId: d.chosenAffordanceId,
        publicSays: d.suggestion?.says || d.narration,
      };
      if (d.chosenAffordanceId !== o.id || d.suggestion?.verdict === 'refused') {
        startPublicAlternative(
          s,
          v,
          a,
          p,
          h,
          opts.find((x) => x.id === d.chosenAffordanceId),
          d,
          offeredWork,
        );
      } else {
        const activity = begin(v.person, o, d);
        if (!activity) {
          p.status = 'interrupted';
          a.reason = 'The matching native speaking activity could not start.';
        } else {
          p.activity = {
            id: activity.id,
            affordanceId: activity.affordanceId,
            startedAt: activity.startedAt,
            endsAt: activity.endsAt,
          };
          p.until = s.tick + Math.max(2, Math.ceil((activity.endsAt - activity.startedAt) / unit(s)));
          p.status = 'running';
        }
      }
    }
  }
  a.status = 'active';
  if (
    a.participants.every((p) =>
      ['completed', 'withheld', 'unheard', 'interrupted', 'continued-work'].includes(p.status),
    )
  ) {
    a.status = a.participants.every((p) => p.status === 'completed')
      ? 'completed'
      : a.participants.some((p) => p.status === 'interrupted')
        ? 'interrupted'
        : 'withheld';
    a.endedAt = s.tick;
    for (const p of a.participants)
      if (p.detached && !p.reoffered) {
        p.reoffered = true;
        h.resume(s, actor(s, p.actor), p.prior, boundary);
      }
  }
  return true;
}
export function publicUtterances(s: State, id: string) {
  return (s.story?.publicExchanges ?? []).flatMap((a) =>
    a.participants
      .filter((p) => p.actor === id && p.status === 'completed')
      .map((p) => ({
        source: a.id,
        sourceIds: a.facts.filter((f) => f.actor === id).map((f) => f.sourceId),
        actor: id,
        nativeId: p.nativeId,
        at: p.completedAt!,
        text: a.lines.find((l) => l.speaker === id)!.text,
        status: 'completed',
        heard: p.heard ?? [],
      })),
  );
}
