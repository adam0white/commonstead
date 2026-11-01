import { DISCOVERIES } from './cast';
import {
  type Affordance,
  actionResolutions,
  begin,
  beginTogether,
  decide,
  decideTogether,
  finish,
  type ObservationReceipt,
  observe,
  reviewed,
  stageOutcome,
} from './hf4';
import { workshopEndTick } from './morning-workshop';
import type { Place, Point } from './paths.ts';
import { openPlacementGround } from './placement';
import { indoors } from './pressure.ts';
import { activePublic, type PublicExchange } from './public-exchanges';
import { REPLIES, type ReplyResult } from './settlement-scenes.ts';
import type { State, Villager } from './sim.ts';
import { ACKNOWLEDGEMENT_TEXT, STORY_CHOICES, type StoryChoice } from './story-content.ts';

/** Scope: finite authored paper/object/evening acts. HF owns choice, attention, body and
 * activity receipts. Only actual matching finishes change these game objects. */
export type StoryObject = {
  id: string;
  version: number;
  kind: string;
  actor: string;
  map: Place;
  point: Point;
  holder: string | null;
  source: string;
  text: string;
  packed: boolean;
  sendable?: boolean;
  restored?: boolean;
  unfinished?: boolean;
};
export type StoryEvent = {
  id: string;
  actor: string;
  at: number;
  choice: string;
  predecessors: string[];
  objectId?: string;
  version?: number;
  says: string;
};
export type StoryAttempt = {
  id: string;
  actor: string;
  choice: StoryChoice | 'read-card';
  predecessors: string[];
  requestedAt: number;
  deliveredAt?: number;
  map: Place;
  point: Point;
  objectId?: string;
  version?: number;
  status:
    | 'requested'
    | 'travelling'
    | 'running'
    | 'scene'
    | 'withheld'
    | 'completed'
    | 'interrupted'
    | 'unavailable';
  reason?: string;
  decision?: { chosenAffordanceId: string | null; publicSays: string };
  activity?: { id: string; affordanceId: string; startedAt: number; endsAt: number };
  until?: number;
  spent: number;
  reservedId?: string;
  packing?: boolean;
  origin?: { map: Place; point: Point };
  breakUntil?: number;
  endedAt?: number;
  observation?: ObservationReceipt[];
  resolutionInputs?: ReturnType<typeof actionResolutions>;
  sceneReceipts?: Record<string, ReturnType<typeof actionResolutions>>;
  nativeActivities?: Record<string, string>;
  yardTrial?: { phase: 'travel' | 'running'; until?: number };
  spentStock?: { wood: number; food: number; paper: number };
};
export type StoryState = {
  version: 'commonstead-residual/1';
  publicExchanges?: PublicExchange[];
  rejectedPublicBuilds?: { inputIndex: number; at: number; reason: string }[];
  paper: number;
  firstResults: ReplyResult[];
  sources: StoryEvent[];
  events: StoryEvent[];
  objects: StoryObject[];
  attempts: StoryAttempt[];
  reads: { actor: string; objectId: string; version: number; at: number; receipts: ObservationReceipt[] }[];
  work: {
    actor: string;
    at: number;
    kind: string;
    target: string;
    amount: number;
    before?: number;
    after?: number;
    activityId?: string;
  }[];
  storm?: {
    at: number;
    buildings: State['buildings'];
    resources: State['resources'];
    people: { actor: string; map: Place; point: Point; underRoof: boolean | null }[];
  };
  close?: { requestedAt: number; committedAt?: number; reason?: string };
  closeHistory?: { requestedAt: number; committedAt?: number; reason?: string }[];
};
export type StoryHost = {
  body: (s: State, v: Villager) => Affordance[];
  alternative: (s: State, v: Villager, a: Affordance, d: ReturnType<typeof decide>) => void;
  move: (s: State, v: Villager, map: Place, point: Point) => boolean;
  scene: (s: State, actor: string, scene: string) => void;
};
const HOME = { x: 525, y: 475 };
export const ensureStory = (s: State) =>
  (s.story ??= {
    version: 'commonstead-residual/1',
    paper: 4,
    firstResults: [],
    sources: [],
    events: [],
    objects: [],
    attempts: [],
    reads: [],
    work: [],
  });
const long = (s: State) => !!s.settlement;
const unit = (s: State) => (long(s) ? 0.8 : 0.5);
export const storyEnd = (s: State) => (long(s) ? 1800 : workshopEndTick(s));
const end = storyEnd;
const person = (s: State, id: string) => s.villagers.find((v) => v.id === id)!;
export function recordDisclosure(s: State, v: Villager, collaboration = false, completed?: StoryEvent) {
  const r = ensureStory(s),
    choice = collaboration ? 'collaboration' : 'disclosure';
  if (r.sources.some((e) => e.actor === v.id && e.choice === choice)) return;
  const e: StoryEvent = {
    id: `source:${v.id}:${choice}:${s.tick}`,
    actor: v.id,
    at: s.tick,
    choice,
    predecessors: completed ? [completed.id] : [],
    says: completed?.says ?? v.says,
  };
  r.sources.push(e);
  if (collaboration && v.id === 'v3' && !r.objects.some((o) => o.kind === 'card'))
    r.objects.push({
      id: `card:${e.id}`,
      version: 1,
      kind: 'card',
      actor: v.id,
      map: 'yard',
      point: { x: v.x, y: v.y },
      holder: null,
      source: e.id,
      text: 'old temporary solution: not checked',
      packed: false,
    });
}
/** Current short conversation predicates shared by commands and their visible reasons. */
export function shortConversationReason(s: State, id: string, action: 'disclosure' | StoryChoice): string {
  if (action !== 'disclosure') return storyReason(s, id, action);
  const v = s.villagers.find((v) => v.id === id);
  if (!v || !DISCOVERIES[Number(id.slice(1)) - 1])
    return 'This helper has no authored private conversation in this chapter.';
  if (s.ended || s.pauseRequested || s.chapterPaused)
    return 'Resume an active day before inviting this conversation.';
  if (!v.person.body.alive || v.availableAt > s.tick)
    return 'This resident is unavailable for this conversation.';
  if (v.discovery) return 'This disclosure is already recorded. Choose its follow-up or collaboration.';
  if (s.tick < 60) return `Wait ${60 - s.tick} game seconds before the first private conversation.`;
  if (!v.invitedBreak || v.recoveryUntil <= s.tick)
    return 'Offer this person a break, then invite the first private conversation during that break.';
  if (s.tick - v.breakStarted < 5)
    return `Wait ${5 - (s.tick - v.breakStarted)} game seconds during this break before asking.`;
  return '';
}
export const activeStory = (s: State, id: string) =>
  s.story?.attempts.findLast(
    (a) =>
      (a.actor === id || (id === 'v2' && a.yardTrial !== undefined)) &&
      ['requested', 'travelling', 'running', 'scene'].includes(a.status),
  );
const object = (s: State, kind: string) => s.story?.objects.find((o) => o.kind === kind && !o.unfinished);
const def = (id: StoryChoice) =>
  STORY_CHOICES[id] as {
    actor: string;
    group: string;
    ticks: number;
    paper: number;
    line: string;
    says: string;
    text: string;
    object: string;
    prior?: string;
    scene?: string;
  };
// A second answer belongs to its actual first-result sheet, even when an earlier
// independently paid preparation has the same kind. The stable sheet ID survives retries.
const firstSheet = (s: State, id: string, choice: StoryChoice) => {
  const d = def(choice);
  const first = s.story?.firstResults?.find((e) => e.actor === id && e.branch === d.prior);
  return (
    first &&
    s.story?.objects.find(
      (o) =>
        o.id === `sheet:${first.id}` &&
        o.actor === id &&
        o.kind === d.object &&
        o.source === first.id &&
        !o.unfinished,
    )
  );
};
const sendableDraft = (o: StoryObject) =>
  o.kind === 'draft' &&
  o.actor === 'v7' &&
  o.sendable === true &&
  (o.text === ACKNOWLEDGEMENT_TEXT || o.text.startsWith(`${ACKNOWLEDGEMENT_TEXT}\n`));
const ticks = (s: State, id: StoryChoice | 'read-card') =>
  id === 'read-card'
    ? long(s)
      ? 8
      : 5
    : !long(s) && ['dai', 'card'].includes(def(id).group)
      ? 8
      : def(id).ticks;
export function storyReason(s: State, id: string, choice: StoryChoice | 'read-card'): string {
  const v = person(s, id),
    r = s.story,
    aw = s.settlement?.actors[id];
  if (
    !v ||
    s.ended ||
    s.pauseRequested ||
    s.chapterPaused ||
    r?.close ||
    !v.person.body.alive ||
    v.availableAt > s.tick
  )
    return 'Resume an active day with this resident available.';
  if (activePublic(s, id)) return 'Finish or stop the public invitation first.';
  if (activeStory(s, id)) return 'Finish or explicitly stop the current exchange first.';
  if (
    s.settlement?.peer?.attempts.some(
      (a) => a.witness.pair.includes(id) && ['requested', 'talking', 'speaking'].includes(a.status),
    )
  )
    return 'Finish or explicitly stop the route conversation first.';
  if (
    aw?.job ||
    aw?.carried ||
    aw?.path.length ||
    (aw?.running && aw.running.purpose !== 'body') ||
    (!long(s) && v.order)
  )
    return 'Finish the current task and delivery, or stop that task explicitly first.';
  if (
    s.roofBreak?.attempts.some((a) => a.id === id && ['roof', 'rest'].includes(a.stage)) ||
    s.longRoofBreak?.attempts.some(
      (a) => a.id === id && ['finish', 'delivery', 'roof', 'rest'].includes(a.stage),
    ) ||
    s.yieldReturn?.some((a) => a.actor === id && ['finish', 'delivery', 'yield', 'return'].includes(a.stage))
  )
    return 'Finish or cancel the earlier-work sequence first.';
  if (['requested', 'running'].includes(s.settlement?.replyScenes?.[id]?.attempts.at(-1)?.status ?? ''))
    return 'Finish the first answer first.';
  if (s.tick + ticks(s, choice) + 1 >= end(s)) return 'There is not enough time left for this act.';
  if (choice === 'read-card')
    return id !== 'v1' || !object(s, 'card') ? 'Dai has not completed an inspection card in this run.' : '';
  const d = def(choice);
  if (!d || d.actor !== id) return 'Choose the matching resident.';
  const locked = r?.attempts.find(
    (a) =>
      a.actor === id &&
      a.choice !== 'read-card' &&
      a.activity &&
      def(a.choice).group === d.group &&
      ['second', 'dai', 'card'].includes(d.group),
  );
  if (locked && locked.choice !== choice)
    return 'The unfinished sheet keeps its selected line. Retry it or leave it unfinished.';
  if (r?.events.some((e) => e.actor === id && e.choice === choice))
    return 'This act already completed. Read its recorded result.';
  const candidate = d.group === 'second' ? firstSheet(s, id, choice as StoryChoice) : object(s, d.object);
  if (
    candidate &&
    r?.attempts.some(
      (a) =>
        a.actor !== id &&
        a.objectId === candidate.id &&
        ['requested', 'travelling', 'running', 'scene'].includes(a.status),
    )
  )
    return 'This object is in another unfinished act.';
  const first = s.story?.firstResults?.find((e) => e.actor === id && e.branch === d.prior);
  // Second-reply scope: this exact actor's completed first sheet is the sole predecessor.
  if (d.group === 'second') {
    if (!first) return 'This resident has not completed the matching first answer in this run.';
    if (!candidate) return 'The matching completed first-answer sheet is unavailable.';
    if (r?.events.some((e) => e.predecessors.includes(first.id)))
      return 'The second answer to this sheet already completed.';
  } else if (d.group === 'card') {
    const card = object(s, 'card');
    if (
      !card ||
      !r?.reads.some((e) => e.actor === id && e.objectId === card.id && e.version === card.version)
    )
      return 'Nora has not read this version of Dai’s card.';
    if (r.events.some((e) => e.choice.startsWith('nora-card-')))
      return 'Nora already completed her annotation.';
  } else if (!r?.sources.some((e) => e.actor === id && e.choice === 'disclosure'))
    return 'Wait for this resident’s actual disclosure in this run.';
  if (
    d.group === 'first' &&
    (r?.firstResults.some((e) => e.actor === id) ||
      (s.settlement?.replyScenes?.[id]?.selectedBranch &&
        s.settlement.replyScenes[id]!.selectedBranch !== choice) ||
      r?.attempts.some(
        (a) =>
          a.actor === id &&
          a.choice !== 'read-card' &&
          def(a.choice).group === 'first' &&
          a.choice !== choice &&
          a.spent > 0,
      ))
  )
    return 'This resident already has a paid or completed first answer. Retry that line.';
  if (d.group === 'collaboration' && v.discovery !== 1)
    return 'Hear this resident’s disclosure first; the collaboration can complete once.';
  // Standard Dai scope: the real disclosure and ordinary break gate remain authoritative.
  if (d.group === 'dai') {
    if (r?.events.some((e) => e.actor === id && e.choice.startsWith('dai-')))
      return 'Dai already completed this answer.';
    if (
      !long(s) &&
      (!v.invitedBreak || v.recoveryUntil <= s.tick || s.tick - v.breakStarted < 5 || s.tick < 60)
    )
      return 'Offer an ordinary break and wait five seconds before answering Dai.';
  }
  if (d.group === 'prepare' && object(s, d.object))
    return 'This object already exists. Read its completed record.';
  if (['advance', 'pack'].includes(d.group)) {
    if (!(s.settlement?.storm || s.story?.storm || s.buildings.some((b) => b.kind !== 'town' && b.complete)))
      return 'Tonight’s choices open after a completed building or the storm.';
    const o = object(s, d.object);
    if (!o) return 'The actual unfinished object has not been prepared in this run.';
    if (o.packed) return 'This object is already put away.';
    const excludedScene =
      choice === 'pack-game-note' || choice === 'pack-caption'
        ? 'correction'
        : choice === 'pack-draft'
          ? 'letter'
          : undefined;
    if (excludedScene && s.settlement?.completed.some((e) => e.actor === id && e.scene === excludedScene))
      return 'This work already completed. Its earlier unfinished answer no longer applies.';
    if (d.group === 'pack' && !s.buildings.some((b) => b.kind === 'town' && b.complete))
      return 'The workshop roof is unavailable.';
    if (!long(s) && d.scene && d.scene !== 'trial')
      return 'This event needs a destination outside this retained workshop yard.';
    if (d.scene === 'trial') {
      if (!long(s) && !yardTrialClear(s))
        return 'The fixed yard trial place is blocked by a retained building.';
      const sam = person(s, 'v2'),
        sw = s.settlement?.actors.v2;
      if (
        !sam.person.body.alive ||
        sam.availableAt > s.tick ||
        (!s.settlement && (!!sam.order || !!sam.person.activity)) ||
        sw?.job ||
        sw?.carried ||
        sw?.path.length ||
        activeStory(s, 'v2')
      )
        return 'Sam must be available for his own independent trial choice.';
    }
    if (d.object === 'card' && !r?.events.some((e) => e.choice.startsWith('nora-card-')))
      return 'Nora has not completed an annotation on this card.';
    if (d.scene && s.settlement?.completed.some((e) => e.actor === id && e.scene === d.scene))
      return 'This event already completed. Read its receipt.';
    if (d.scene === 'letter' && !sendableDraft(o))
      return 'This private draft contains no sendable acknowledgement.';
    if (d.scene === 'trial' && !o.restored) return 'The easier grip has not been restored to this drawing.';
    if (d.scene === 'telescope' && s.tick < 750) return 'The telescope can be used after 18:00.';
  }
  const prior = r?.attempts.find((a) => a.choice === choice && a.spent > 0);
  if (d.paper && !prior && ensureStory(s).paper < d.paper)
    return 'This needs one of the remaining sheets of paper.';
  return '';
}
function predecessors(s: State, id: string, choice: StoryChoice | 'read-card') {
  if (choice === 'read-card') return [object(s, 'card')!.source];
  const d = def(choice);
  if (d.group === 'second')
    return [s.story!.firstResults.find((e) => e.actor === id && e.branch === d.prior)!.id];
  if (d.group === 'card' || ['advance', 'pack'].includes(d.group)) return [object(s, d.object)!.source];
  return [s.story!.sources.find((e) => e.actor === id && e.choice === 'disclosure')!.id];
}
export function requestStory(s: State, id: string, choice: StoryChoice | 'read-card', h: StoryHost) {
  const reason = storyReason(s, id, choice);
  if (reason) throw new Error(reason);
  const r = ensureStory(s),
    d = choice === 'read-card' ? null : def(choice),
    v = person(s, id);
  const o =
    choice === 'read-card'
      ? object(s, 'card')
      : d?.group === 'second'
        ? firstSheet(s, id, choice as StoryChoice)
        : d && ['card', 'advance', 'pack'].includes(d.group)
          ? object(s, d.object)
          : undefined;
  const map = o?.map ?? (long(s) ? (d?.object === 'telescope' ? 'courtyard' : 'yard') : 'yard');
  const point =
    o?.point ??
    (long(s)
      ? d?.object === 'telescope'
        ? { x: 775, y: 175 }
        : d?.group === 'second'
          ? { x: v.x, y: v.y }
          : HOME
      : { x: v.x, y: v.y });
  const a: StoryAttempt = {
    id: `story:${r.attempts.length + 1}`,
    actor: id,
    choice,
    predecessors: predecessors(s, id, choice),
    requestedAt: s.tick,
    map,
    point: { ...point },
    ...(o ? { objectId: o.id, version: o.version } : {}),
    status: 'requested',
    spent: 0,
    ...(!long(s) && d?.group === 'dai' ? { breakUntil: v.recoveryUntil } : {}),
  };
  r.attempts.push(a);
  if ((s.settlement?.actors[id]?.map ?? 'yard') !== map || Math.hypot(v.x - point.x, v.y - point.y) > 5) {
    if (!h.move(s, v, map, point)) {
      a.status = 'unavailable';
      a.reason = 'The actual object route is unavailable.';
    } else a.status = 'travelling';
  }
  s.message = 'The exchange was requested. Travel, attention and a completed answer are separate.';
}
function matched(v: Villager, a: StoryAttempt) {
  const x = v.person.activity;
  return (
    !!x &&
    x.id === a.activity?.id &&
    x.affordanceId === a.activity.affordanceId &&
    x.startedAt === a.activity.startedAt &&
    x.endsAt === a.activity.endsAt
  );
}
function validPlace(s: State, v: Villager, a: StoryAttempt) {
  const o = a.objectId ? s.story!.objects.find((o) => o.id === a.objectId) : undefined;
  return (
    (s.settlement?.actors[v.id]?.map ?? 'yard') === a.map &&
    Math.hypot(v.x - a.point.x, v.y - a.point.y) <= 5 &&
    (!a.objectId ||
      (!!o &&
        o.version === a.version &&
        o.map === a.map &&
        Math.hypot(o.point.x - a.point.x, o.point.y - a.point.y) < 1))
  );
}
export function interruptStory(
  s: State,
  id: string,
  reason = 'The exchange stopped before it finished. No completed answer was recorded.',
) {
  const a = activeStory(s, id);
  if (!a) return;
  const v = person(s, a.actor);
  if (a.yardTrial)
    for (const actor of ['v1', 'v2']) {
      const p = person(s, actor).person;
      if (p.activity && p.activity.id === a.nativeActivities?.[actor])
        finish(p, {
          action: p.activity.action,
          affordanceId: p.activity.affordanceId,
          at: p.now,
          status: 'interrupted',
          summary: reason,
        });
    }
  if ((a.packing || a.status === 'scene') && a.objectId) {
    const o = s.story!.objects.find((o) => o.id === a.objectId)!;
    o.map = s.settlement?.actors[id]?.map ?? 'yard';
    o.point = { x: v.x, y: v.y };
    o.holder = null;
  }
  if (matched(v, a))
    finish(v.person, {
      action: 'talk',
      affordanceId: a.activity!.affordanceId,
      targetId: a.id,
      at: v.person.now,
      status: 'interrupted',
      summary: reason,
    });
  a.status = 'interrupted';
  a.reason = reason;
  a.endedAt = s.tick;
  s.message = reason;
}
export function stageStories(s: State) {
  for (const a of s.story?.attempts ?? []) {
    if (a.yardTrial?.phase === 'running' && s.tick >= (a.yardTrial.until ?? Infinity)) {
      for (const id of ['v1', 'v2']) {
        const p = person(s, id).person;
        if (p.activity && p.activity.id === a.nativeActivities?.[id])
          stageOutcome(p, {
            action: p.activity.action,
            affordanceId: p.activity.affordanceId,
            at: 480 + s.tick * unit(s),
            status: 'completed',
            summary: def('advance-drawing').says,
          });
      }
      continue;
    }
    if (a.status !== 'running') continue;
    const v = person(s, a.actor);
    if (matched(v, a) && validPlace(s, v, a) && s.tick >= (a.until ?? Infinity))
      stageOutcome(v.person, {
        action: 'talk',
        affordanceId: a.activity!.affordanceId,
        targetId: a.id,
        at: 480 + s.tick * unit(s),
        status: 'completed',
        summary: a.choice === 'read-card' ? 'I read the actual inspection card.' : def(a.choice).says,
      });
  }
}
function complete(s: State, v: Villager, a: StoryAttempt) {
  const r = ensureStory(s);
  a.status = 'completed';
  a.endedAt = s.tick;
  if (a.choice === 'read-card') return;
  if (a.objectId) {
    const held = r.objects.find((o) => o.id === a.objectId);
    if (held?.holder === v.id) held.holder = null;
  }
  const d = def(a.choice),
    e: StoryEvent = {
      id: `${a.id}:result`,
      actor: v.id,
      at: s.tick,
      choice: a.choice,
      predecessors: [...a.predecessors],
      says:
        a.choice === 'advance-telescope' && s.seed % 2 !== 0
          ? 'I used the telescope tonight. Clouds hid the stars.'
          : a.choice === 'pack-telescope' &&
              s.settlement?.completed.some((e) => e.actor === v.id && e.scene === 'telescope')
            ? 'The telescope is packed after tonight’s observation.'
            : d.says,
    };
  let o = a.objectId
    ? r.objects.find((o) => o.id === a.objectId)
    : ((a.reservedId ? r.objects.find((o) => o.id === a.reservedId) : undefined) ?? object(s, d.object));
  if (['prepare', 'dai', 'first'].includes(d.group)) {
    if (o?.unfinished) {
      o.unfinished = false;
      o.version = 1;
      o.text = d.text;
      o.source = e.id;
      o.sendable = d.object === 'draft' && d.text === ACKNOWLEDGEMENT_TEXT;
      o.restored = d.object === 'drawing';
    }
    if (!o) {
      o = {
        id: `object:${e.id}`,
        version: 1,
        kind: d.object,
        actor: v.id,
        map: a.map,
        point: { ...a.point },
        holder: null,
        source: e.id,
        text: d.text,
        packed: false,
        sendable: d.object === 'draft' && d.text === ACKNOWLEDGEMENT_TEXT,
        restored: d.object === 'drawing',
      };
      r.objects.push(o);
    }
  } else if (
    o &&
    ![
      'advance-card',
      'advance-recording',
      'advance-telescope',
      'advance-game-note',
      'advance-caption',
    ].includes(a.choice)
  ) {
    o.version++;
    o.text = `${o.text}\n${v.name}: ${d.text}`;
    o.source = e.id;
    if (
      d.group === 'pack' ||
      a.choice === 'advance-ferry' ||
      a.choice.endsWith('set-aside') ||
      a.choice.endsWith('close') ||
      a.choice === 'nora-question-keep'
    )
      o.packed = true;
  }
  if (o) {
    e.objectId = o.id;
    e.version = o.version;
  }
  if (d.group === 'first') {
    const branch = a.choice as keyof typeof REPLIES;
    r.firstResults.push({
      id: e.id,
      actor: v.id,
      branch,
      attemptId: a.id,
      at: s.tick,
      object: REPLIES[branch].object,
      text: d.text,
      says: d.says,
    });
  }
  if (d.group === 'collaboration') {
    v.discovery = 2;
    // CS-R10: capture the actual matching completion, before changing visible last words.
    recordDisclosure(s, v, true, e);
  }
  r.events.push(e);
  v.says = e.says;
  v.task = 'waiting';
  v.status = 'waiting';
  s.message = `${v.name}: ${e.says}`;
}
export function stepStory(s: State, v: Villager, h: StoryHost): boolean {
  const a = activeStory(s, v.id);
  if (!a) return false;
  if (!long(s) && a.choice !== 'read-card' && def(a.choice).scene === 'trial' && !yardTrialClear(s)) {
    interruptStory(s, v.id, 'The fixed yard trial place is blocked by a retained building.');
    return true;
  }
  if (a.actor !== v.id) return a.yardTrial?.phase === 'running';
  if (s.tick >= end(s) || s.pauseRequested || s.ended || !v.person.body.alive) {
    interruptStory(s, v.id);
    return false;
  }
  const aw = s.settlement?.actors[v.id];
  if (a.status === 'scene' && a.objectId) {
    const held = s.story!.objects.find((o) => o.id === a.objectId)!;
    if (held.holder === v.id) {
      held.map = aw?.map ?? 'yard';
      held.point = { x: v.x, y: v.y };
    }
  }
  if (a.status === 'travelling') {
    if (a.packing) {
      const held = s.story!.objects.find((o) => o.id === a.objectId)!;
      held.map = aw?.map ?? 'yard';
      held.point = { x: v.x, y: v.y };
    }
    if (aw?.job || aw?.running || v.order) return false;
    if (a.packing) {
      const held = s.story!.objects.find((o) => o.id === a.objectId)!;
      if ((aw?.map ?? 'yard') !== a.map || Math.hypot(v.x - a.point.x, v.y - a.point.y) > 5) {
        interruptStory(s, v.id, 'The carrying trip did not reach the roof.');
        return false;
      }
      held.holder = null;
    }
    if (!validPlace(s, v, a)) {
      interruptStory(s, v.id, 'The journey did not reach the recorded object.');
      return false;
    }
    a.status = 'requested';
  }
  if (a.yardTrial) return stepYardTrial(s, v, a, h);
  if (a.status === 'scene') {
    const participants = a.choice === 'advance-drawing' ? ['v1', 'v2'] : [v.id];
    for (const id of participants) {
      const p = person(s, id),
        run = s.settlement!.actors[id]?.running;
      if (run?.purpose === 'job' && run.job?.kind === 'scene' && p.person.activity) {
        a.nativeActivities ??= {};
        a.nativeActivities[id] = p.person.activity.id;
      }
    }
    const d = def(a.choice as StoryChoice),
      c = s.settlement!.completed.find(
        (e) => e.actor === v.id && e.scene === d.scene && e.at >= a.requestedAt,
      );
    if (c) {
      if (
        d.scene === 'trial' &&
        !s.settlement?.completed.some((e) => e.actor === 'v2' && e.scene === 'trial' && e.at === c.at)
      )
        return false;
      a.sceneReceipts = Object.fromEntries(
        participants.map((id) => [
          id,
          a.nativeActivities?.[id] ? actionResolutions(person(s, id).person, a.nativeActivities[id]!) : [],
        ]),
      );
      if (
        participants.every((id) =>
          a.sceneReceipts![id]!.some(
            (input) => input.payload.stage === 'finish' && input.payload.disposition === 'completed',
          ),
        )
      )
        complete(s, v, a);
      else interruptStory(s, v.id, 'The evening act lacks matching completed activity receipts.');
      return true;
    }
    if (!aw?.job && !aw?.running) {
      interruptStory(s, v.id, 'The requested evening act did not complete.');
    }
    return false;
  }
  if (!validPlace(s, v, a)) {
    interruptStory(s, v.id);
    return false;
  }
  if (a.status === 'running') {
    if (!matched(v, a)) {
      interruptStory(s, v.id);
      return true;
    }
    const x = v.person.activity!;
    if (s.tick >= a.until! && v.person.now >= x.endsAt) {
      const receipt = finish(v.person, {
        action: 'talk',
        affordanceId: x.affordanceId,
        targetId: a.id,
        at: v.person.now,
        status: 'completed',
        summary: a.choice === 'read-card' ? 'I read the actual inspection card.' : def(a.choice).says,
      });
      a.resolutionInputs = actionResolutions(v.person, a.activity!.id);
      if (
        receipt?.status === 'completed' &&
        a.resolutionInputs.some(
          (input) => input.payload.stage === 'finish' && input.payload.disposition === 'completed',
        )
      )
        complete(s, v, a);
      else interruptStory(s, v.id);
      return true;
    }
    if (v.person.now >= x.reviewAt) {
      const offer = storyOffer(s, a);
      const opts = [offer, ...h.body(s, v)],
        d = decide(v.person, opts);
      if (d.chosenAffordanceId === offer.id) reviewed(v.person);
      else {
        interruptStory(s, v.id, 'The resident chose another activity before finishing.');
        const alt = opts.find((o) => o.id === d.chosenAffordanceId);
        if (alt) h.alternative(s, v, alt, d);
      }
    }
    return true;
  }
  if (v.person.activity || aw?.running) return false;
  if (a.choice !== 'read-card' && def(a.choice).group === 'pack' && !a.packing) {
    const held = s.story!.objects.find((o) => o.id === a.objectId)!;
    if (aw?.carried || held.holder) {
      interruptStory(s, v.id, 'The resident or object is already carrying another load.');
      return false;
    }
    a.origin = { map: held.map, point: { ...held.point } };
    a.packing = true;
    held.holder = v.id;
    a.map = 'yard';
    a.point = { ...HOME };
    if (Math.hypot(v.x - HOME.x, v.y - HOME.y) > 5 || (aw?.map ?? 'yard') !== 'yard') {
      if (!h.move(s, v, 'yard', HOME)) {
        held.holder = null;
        interruptStory(s, v.id, 'The carrying route to the roof is unavailable.');
        return false;
      }
      a.status = 'travelling';
      return false;
    }
    held.holder = null;
  }

  if (s.tick + ticks(s, a.choice) + 1 >= end(s)) {
    interruptStory(s, v.id, 'There is no longer enough time for this exchange.');
    return false;
  }
  if (a.choice !== 'read-card') {
    const d = def(a.choice);
    if (d.scene) {
      a.status = 'scene';
      if (!s.settlement && d.scene === 'trial') {
        a.yardTrial = { phase: 'travel' };
        if (a.objectId) s.story!.objects.find((o) => o.id === a.objectId)!.holder = v.id;
        return stepYardTrial(s, v, a, h);
      }
      h.scene(s, v.id, d.scene);
      if (s.settlement?.actors[v.id]?.job?.kind === 'scene' && a.objectId)
        s.story!.objects.find((o) => o.id === a.objectId)!.holder = v.id;
      return false;
    }
    if (
      d.paper &&
      !s.story!.attempts.some((x) => x.choice === a.choice && x.spent > 0) &&
      ensureStory(s).paper < d.paper
    ) {
      interruptStory(s, v.id, 'The required paper is no longer available.');
      return false;
    }
  }
  // Card scope: bind the public attended receipt to the physical card ID and version.
  const reading = a.choice === 'read-card' || a.choice === 'advance-card';
  const summary = reading
    ? `Inspection card ${a.objectId}, version ${a.version}: ${s.story!.objects.find((o) => o.id === a.objectId)!.text}`
    : def(a.choice as StoryChoice).line;
  a.observation = observe(v.person, [
    {
      at: v.person.now,
      channel: reading ? 'saw' : 'heard',
      kind: 'workshop-record',
      actorId: reading ? undefined : 'commander',
      targetId: a.objectId ?? v.person.id,
      placeId: a.map,
      salience: 0.7,
      near: true,
      summary,
    },
  ]).receipts;
  a.deliveredAt = s.tick;
  if (!a.observation.some((e) => e.attention > 0)) {
    a.status = 'withheld';
    a.reason = reading
      ? 'The resident did not attend to this card version.'
      : 'The resident did not attend to the offered words.';
    a.endedAt = s.tick;
    return true;
  }
  const offer = storyOffer(s, a),
    opts = [
      offer,
      ...h.body(s, v),
      { id: `${a.id}:quiet`, action: 'wait', label: 'Remain quiet', duration: unit(s), advertises: {} },
    ],
    d = decide(v.person, opts, { suggestion: { voiceId: 'commander', action: 'talk', strength: 0.35 } });
  a.decision = { chosenAffordanceId: d.chosenAffordanceId, publicSays: d.suggestion?.says || d.narration };
  if (d.chosenAffordanceId !== offer.id || d.suggestion?.verdict === 'refused') {
    a.status = 'withheld';
    a.reason = a.decision.publicSays;
    a.endedAt = s.tick;
    const alt = opts.find((o) => o.id === d.chosenAffordanceId);
    if (alt) h.alternative(s, v, alt, d);
    return true;
  }
  const activity = begin(v.person, offer, d);
  if (!activity) {
    a.status = 'unavailable';
    a.reason = 'The matching activity could not start.';
    return true;
  }
  a.resolutionInputs = actionResolutions(v.person, activity.id);
  a.activity = {
    id: activity.id,
    affordanceId: activity.affordanceId,
    startedAt: activity.startedAt,
    endsAt: activity.endsAt,
  };
  a.until =
    s.tick + Math.max(ticks(s, a.choice), Math.ceil((activity.endsAt - activity.startedAt) / unit(s)));
  a.status = 'running';
  if (reading)
    s.story!.reads.push({
      actor: v.id,
      objectId: a.objectId!,
      version: a.version!,
      at: s.tick,
      receipts: a.observation,
    });
  if (a.choice !== 'read-card') {
    const d = def(a.choice);
    const earlier = s.story!.attempts.find((x) => x !== a && x.choice === a.choice && x.reservedId);
    if (earlier) a.reservedId = earlier.reservedId;
    if (d.paper && !s.story!.attempts.some((x) => x !== a && x.choice === a.choice && x.spent > 0)) {
      ensureStory(s).paper -= d.paper;
      a.spent = d.paper;
      const sheet: StoryObject = {
        id: d.group === 'first' ? `sheet:${a.id}:result` : `sheet:${a.id}`,
        version: 0,
        kind: d.object,
        actor: v.id,
        map: a.map,
        point: { ...a.point },
        holder: null,
        source: a.id,
        text: 'Unfinished record.',
        packed: false,
        unfinished: true,
      };
      s.story!.objects.push(sheet);
      a.reservedId = sheet.id;
    }
  }
  v.task = 'talking and working on the record';
  v.status = 'is working on the record.';
  return true;
}
/** One actual yard trial. Each participant travels and chooses; no remote long-day map is installed. */
const YARD_TRIAL_POINT = { x: 700, y: 475 };
// CS-R8: admission and spend use the retained world's ordinary building spacing.
function yardTrialClear(s: State) {
  return openPlacementGround(YARD_TRIAL_POINT.x, YARD_TRIAL_POINT.y, s.buildings);
}
function stepYardTrial(s: State, v: Villager, a: StoryAttempt, h: StoryHost): boolean {
  const pair = [v, person(s, 'v2')],
    point = YARD_TRIAL_POINT;
  if (!yardTrialClear(s)) {
    interruptStory(s, v.id, 'The fixed yard trial place is blocked by a retained building.');
    return true;
  }
  if (pair.some((p) => !p.person.body.alive)) {
    interruptStory(s, v.id, 'A trial participant is unavailable.');
    return true;
  }
  if (a.yardTrial!.phase === 'travel') {
    let arrived = true;
    for (const p of pair)
      if (Math.hypot(p.x - point.x, p.y - point.y) > 8) {
        arrived = false;
        if (!p.order) h.move(s, p, 'yard', point);
      }
    if (!arrived) return false;
    if (pair.some((p) => p.order || p.person.activity)) return false;
    if (s.resources.wood < 4) {
      interruptStory(s, v.id, 'The trial needs four actual boards.');
      return true;
    }
    const offers = pair.map(
      (p, i): Affordance => ({
        id: `${a.id}:trial:${p.id}`,
        action: 'try-grip',
        label: 'Try the easier grip together',
        duration: 25 * unit(s),
        effort: 0,
        advertises: { belonging: 0.45 },
        with: [pair[1 - i]!.person.id],
        targetId: a.id,
        tags: ['social'],
      }),
    );
    const options = pair.map((p, i) => [offers[i]!, ...h.body(s, p)]);
    const choices = decideTogether(pair.map((p, i) => ({ person: p.person, affordances: options[i]! })));
    if (
      choices.some((d, i) => d.chosenAffordanceId !== offers[i]!.id || d.suggestion?.verdict === 'refused')
    ) {
      a.status = 'withheld';
      a.endedAt = s.tick;
      a.reason = choices.map((d) => d.suggestion?.says || d.narration).join(' ');
      for (let i = 0; i < pair.length; i++) {
        const alt = options[i]!.find((o) => o.id === choices[i]!.chosenAffordanceId);
        if (alt && alt.id !== offers[i]!.id) h.alternative(s, pair[i]!, alt, choices[i]!);
      }
      return true;
    }
    beginTogether(pair.map((p) => p.person));
    if (pair.some((p, i) => p.person.activity?.affordanceId !== offers[i]!.id)) {
      interruptStory(s, v.id, 'Both trial activities did not start.');
      return true;
    }
    s.resources.wood -= 4;
    a.spentStock = { wood: 4, food: 0, paper: 0 };
    a.nativeActivities = Object.fromEntries(pair.map((p) => [p.id, p.person.activity!.id]));
    a.yardTrial = { phase: 'running', until: s.tick + 25 };
    return true;
  }
  if (s.tick < a.yardTrial!.until!) {
    if (pair.some((p) => p.person.activity?.id !== a.nativeActivities?.[p.id])) {
      interruptStory(s, v.id, 'A participant stopped the trial.');
      return true;
    }
    for (let i = 0; i < pair.length; i++) {
      const p = pair[i]!;
      if (p.person.now >= p.person.activity!.reviewAt) {
        const offer = {
          ...storyOffer(s, a),
          id: p.person.activity!.affordanceId,
          action: 'try-grip',
          duration: 25 * unit(s),
          with: [pair[1 - i]!.person.id],
        };
        const opts = [offer, ...h.body(s, p)],
          decision = decide(p.person, opts);
        if (decision.chosenAffordanceId === offer.id) reviewed(p.person);
        else {
          interruptStory(s, v.id, 'A participant chose another activity.');
          const alt = opts.find((o) => o.id === decision.chosenAffordanceId);
          if (alt) h.alternative(s, p, alt, decision);
          return true;
        }
      }
    }
    return true;
  }
  const completed = pair.map((p) =>
    finish(p.person, {
      action: 'try-grip',
      affordanceId: `${a.id}:trial:${p.id}`,
      at: p.person.now,
      status: 'completed',
      summary: def('advance-drawing').says,
    }),
  );
  a.sceneReceipts = Object.fromEntries(
    pair.map((p) => [p.id, actionResolutions(p.person, a.nativeActivities![p.id]!)]),
  );
  if (
    completed.every((r) => r?.status === 'completed') &&
    pair.every((p) =>
      a.sceneReceipts![p.id]!.some(
        (r) => r.payload.stage === 'finish' && r.payload.disposition === 'completed',
      ),
    )
  )
    complete(s, v, a);
  else interruptStory(s, v.id, 'Both completed trial receipts were not recorded.');
  return true;
}
function storyOffer(s: State, a: StoryAttempt): Affordance {
  return {
    id: `${a.id}:act`,
    action: 'talk',
    label: a.choice === 'read-card' ? 'Read the inspection card' : def(a.choice).line,
    targetId: a.id,
    placeId: a.map,
    duration: ticks(s, a.choice) * unit(s),
    effort: 0,
    advertises: { belonging: 0.45 },
    tags: ['social'],
  };
}
export function storyClosing(s: State, id: string): string[] {
  const r = s.story;
  if (!r) return [];
  const has = (choice: string) => r.events.some((e) => e.actor === id && e.choice === choice);
  const scene = (name: string) => !!s.settlement?.completed.some((e) => e.actor === id && e.scene === name);
  const own = (kind: string) => r.objects.find((o) => o.actor === id && o.kind === kind && !o.unfinished);
  const facts: string[] = [];
  if (id === 'v1') {
    const drawing = own('drawing');
    if (drawing)
      facts.push(
        drawing.packed
          ? 'Nora put the unfinished handle work away.'
          : drawing.restored
            ? 'Nora’s drawing includes the easier grip and remains unfinished.'
            : 'Nora attached the unanswered user question to her drawing.',
      );
    if (scene('trial'))
      facts.push('Nora and Sam completed their local grip trial; no external user answer is recorded.');
    if (has('nora-card-question') || has('nora-card-boundary'))
      facts.push('Nora annotated Dai’s inspection card; the check remains undone.');
    else if (r.reads.some((e) => e.actor === id)) facts.push('Nora read the card; no response completed.');
  }
  if (id === 'v2') {
    if (scene('correction')) facts.push('Sam attached his correction to the old report.');
    else if (own('game-note'))
      facts.push('Sam’s current note records what he tried; the old report is still uncorrected.');
    if (scene('trial')) facts.push('Sam completed the local grip trial with Nora.');
    if (has('pack-game-note')) facts.push('Sam put today’s note away.');
  }
  if (id === 'v3') {
    if (own('card'))
      facts.push('Dai made the workshop inspection card; its temporary solution remains unchecked.');
    else if (has('dai-defer-card'))
      facts.push('Dai recorded that the check is undone; he did not make an inspection card.');
    if (has('advance-card')) facts.push('Dai read Nora’s actual annotation.');
    else if (r.events.some((e) => e.choice.startsWith('nora-card-'))) {
      if (r.reads.some((e) => e.actor === 'v3' && e.version >= 2))
        facts.push('Dai attended to Nora’s annotation; the reading act did not complete.');
      else facts.push('No encounter by Dai with Nora’s annotation is recorded.');
    }
  }
  if (id === 'v4') {
    if (scene('telescope'))
      facts.push(
        s.seed % 2 === 0
          ? 'Nerys used the telescope; a clear patch was seen.'
          : 'Nerys used the telescope; clouds hid the stars.',
      );
    else if (own('telescope'))
      facts.push('Nerys marked a corner for the telescope; no observation completed tonight.');
    if (has('pack-telescope'))
      facts.push(
        scene('telescope')
          ? 'Nerys packed the telescope after the recorded observation.'
          : 'Nerys packed the telescope before use.',
      );
  }
  if (id === 'v5') {
    if (own('recording')) facts.push('Dilek made her private lid recording without voices.');
    if (has('advance-recording')) facts.push('Dilek replayed that recording privately.');
    if (has('pack-recording')) facts.push('Dilek put the phone away.');
  }
  if (id === 'v6') {
    if (own('ferry')) facts.push('Burak’s unfinished ferry occupied the shared table.');
    if (has('advance-ferry')) facts.push('Burak made one further fold; the ferry is still unfinished.');
    if (has('pack-ferry') || has('advance-ferry'))
      facts.push('Burak put the ferry away and cleared its table spot.');
  }
  if (id === 'v7') {
    if (scene('letter'))
      facts.push('Sevim deposited her letter in the post slot; no receipt or answer is recorded.');
    else if (own('draft'))
      facts.push(
        own('draft')?.sendable
          ? 'Sevim’s acknowledgement remains a private draft.'
          : 'Sevim’s draft remains private; the pupil’s answer remains unwritten.',
      );
    if (has('sevim-space-preserve'))
      facts.push('The pupil’s answer remains unwritten and marked not received.');
    if (has('pack-draft') || has('sevim-draft-close') || has('sevim-space-close'))
      facts.push('Sevim put her private draft away.');
  }
  if (id === 'v8') {
    if (scene('correction'))
      facts.push('Oskar attached a correction saying the volunteer went home before the storm.');
    else if (own('caption'))
      facts.push(
        'Oskar wrote an accurate workshop caption; the earlier published caption remains inaccurate.',
      );
    if (has('pack-caption')) facts.push('Oskar put the workshop caption away.');
  }
  if (!facts.length) facts.push(`No completed story act is recorded for ${person(s, id).name} in this run.`);
  for (const e of r.events.filter((e) => e.actor === id))
    facts.push(`Earlier, at ${storyClock(s, e.at)}: ${e.says}`);
  for (const a of r.attempts.filter((a) => a.actor === id && a.status !== 'completed'))
    facts.push(
      `${person(s, id).name}: ${a.status === 'withheld' ? 'Did not start' : a.status}. ${a.reason ?? 'No completed answer is recorded.'}${a.spent ? ' The spent sheet remains unfinished.' : ''}`,
    );
  const storm = r.storm?.people.find((p) => p.actor === id);
  if (storm)
    facts.push(
      `At the storm, ${storyClock(s, r.storm!.at)}: ${storm.map}, ${Math.round(storm.point.x)}, ${Math.round(storm.point.y)}. ${storm.underRoof === null ? 'No roof fact is recorded for that place.' : storm.underRoof ? 'Under a roof.' : 'Outside the recorded roofs.'}`,
    );
  const asked = s.inputs.filter((i) => {
    const c = i.command;
    return (
      'ids' in c &&
      c.ids.includes(id) &&
      ((c.kind === 'order' && c.target === 'rest') ||
        c.kind === 'roof-break-return' ||
        c.kind === 'long-roof-break-return')
    );
  }).length;
  const starts = r.work.filter((w) => w.actor === id && w.kind === 'rest-start').length,
    rests = r.work.filter((w) => w.actor === id && w.kind === 'rest-completed').length;
  if (asked || starts || rests)
    facts.push(
      `${asked} rest invitations, ${starts} actual rest starts and ${rests} completed rest activities are recorded. Completion does not promise recovery.`,
    );
  for (const target of ['food', 'wood', 'stone'])
    if (
      s.inputs.some(
        (i) => i.command.kind === 'order' && i.command.ids.includes(id) && i.command.target === target,
      ) &&
      !r.work.some((w) => w.actor === id && w.kind === 'delivery' && w.target === target)
    )
      facts.push(
        `${person(s, id).name} was asked to collect ${target === 'food' ? 'meals' : target === 'wood' ? 'prepared boards' : 'ballast bags'}; no completed contribution is recorded.`,
      );
  for (const resource of ['food', 'wood', 'stone']) {
    const rows = r.work.filter((w) => w.actor === id && w.kind === 'delivery' && w.target === resource);
    if (rows.length)
      facts.push(
        `Delivered ${rows.reduce((n, w) => n + w.amount, 0)} ${resource} to counted stock in this run.`,
      );
  }
  const builds = r.work.filter((w) => w.actor === id && w.kind === 'build');
  for (const target of [...new Set(builds.map((w) => w.target))]) {
    const rows = builds.filter((w) => w.target === target);
    facts.push(
      `Completed construction contribution to ${target}: ${rows.reduce((n, w) => n + w.amount, 0)} of the building, from recorded work.`,
    );
  }
  return facts;
}

export function storyClock(s: State, t: number) {
  const m =
    s.continuedWorkshop && t >= s.continuedWorkshop.atTick
      ? s.continuedWorkshop.runAtMs / 60000 + (t - s.continuedWorkshop.atTick) * 0.5
      : 480 + t * (long(s) ? 0.8 : 0.2);
  return `${Math.floor(m / 60) % 24}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
}
export function requireSupportedProducer(s: State) {
  if (
    s.morningWorkshop ||
    s.continuedWorkshop ||
    s.story?.attempts.length ||
    s.story?.objects.length ||
    s.inputs.some((i) =>
      [
        'public-exchange',
        'story-act',
        'yield-return',
        'evening',
        'reply',
        'continue-workshop',
        'start-morning-workshop',
      ].includes(i.command.kind),
    )
  )
    throw new Error(
      'People cannot leave this chapter for another game yet. Download the complete run to keep it. This request did not save anyone for another game.',
    );
}

export function recordFirstReply(
  s: State,
  v: Villager,
  result: { id: string; attemptId: string; branch: string; text: string },
) {
  const r = ensureStory(s);
  const reserved = r.objects.find((o) => o.id === `sheet:${result.id}`);
  if (reserved) {
    const scene = s.settlement?.replyScenes?.[v.id];
    const attempt = scene?.attempts.find((a) => a.id === result.attemptId);
    const paid = scene?.attempts.find((a) => a.id === scene.reservation?.paidAttemptId);
    if (
      !scene?.reservation ||
      scene.reservation.resultId !== result.id ||
      scene.reservation.sheetId !== reserved.id ||
      reserved.actor !== v.id ||
      reserved.version !== 0 ||
      reserved.unfinished !== true ||
      reserved.source !== paid?.id ||
      paid?.paperSpent !== 1 ||
      attempt?.status !== 'completed' ||
      attempt.resultId !== result.id ||
      attempt.branch !== result.branch
    )
      throw new Error('The completed first answer does not match its actual paid unfinished sheet.');
  }
  if (!r.firstResults.some((e) => e.id === result.id)) {
    const branch = result.branch as keyof typeof REPLIES;
    r.firstResults.push({
      id: result.id,
      actor: v.id,
      branch,
      attemptId: result.attemptId,
      at: s.tick,
      object: REPLIES[branch].object,
      text: result.text,
      says: REPLIES[branch].says,
    });
  }
  const kind = v.id === 'v1' ? 'drawing' : 'draft';
  if (reserved) {
    reserved.unfinished = false;
    reserved.version = 1;
    reserved.source = result.id;
    reserved.text = result.text;
    reserved.sendable = result.branch === 'sevim-name-wrong' && result.text === ACKNOWLEDGEMENT_TEXT;
    reserved.restored = result.branch === 'nora-restore-drawing';
    return;
  }
  r.objects.push({
    id: `sheet:${result.id}`,
    version: 1,
    kind,
    actor: v.id,
    map: s.settlement!.actors[v.id]!.map,
    point: { x: v.x, y: v.y },
    holder: null,
    source: result.id,
    text: result.text,
    packed: false,
    sendable: result.branch === 'sevim-name-wrong' && result.text === ACKNOWLEDGEMENT_TEXT,
    restored: result.branch === 'nora-restore-drawing',
  });
}

export function recordWork(s: State, w: StoryState['work'][number]) {
  ensureStory(s).work.push(w);
}

/** New authored writing retries retain their actually spent sheet; ordinary scenes keep their cost. */
export function storyScenePaper(s: State, id: string, paper: number) {
  const a = activeStory(s, id);
  return a?.status === 'scene' &&
    s.story!.attempts.some((old) => old !== a && old.choice === a.choice && old.spent > 0)
    ? 0
    : paper;
}
export function recordStorySceneSpend(s: State, id: string, wood: number, food: number, paper: number) {
  const a = activeStory(s, id);
  if (a?.status !== 'scene') return;
  a.spent += paper;
  a.spentStock = { wood, food, paper };
}

export function recordRestStart(s: State, v: Villager) {
  const activity = v.person.activity;
  if (
    activity?.action === 'rest' &&
    !ensureStory(s).work.some((w) => w.kind === 'rest-start' && w.activityId === activity.id)
  )
    ensureStory(s).work.push({
      actor: v.id,
      at: s.tick,
      kind: 'rest-start',
      target: 'rest',
      amount: 1,
      activityId: activity.id,
    });
}
export function recordRestCompleted(s: State, v: Villager, activityId: string) {
  if (ensureStory(s).work.some((w) => w.kind === 'rest-completed' && w.activityId === activityId)) return;
  ensureStory(s).work.push({
    actor: v.id,
    at: s.tick,
    kind: 'rest-completed',
    target: 'rest',
    amount: 1,
    activityId,
  });
}
/** Snapshot the actual storm boundary. Later positions cannot become earlier roof evidence. */
export function recordStorm(s: State) {
  const r = ensureStory(s);
  if (r.storm) return;
  r.storm = {
    at: s.tick,
    buildings: structuredClone(s.buildings),
    resources: structuredClone(s.resources),
    people: s.villagers.map((v) => {
      const map = s.settlement?.actors[v.id]?.map ?? 'yard';
      return {
        actor: v.id,
        map,
        point: { x: v.x, y: v.y },
        underRoof: map === 'yard' ? indoors(s, v) : null,
      };
    }),
  };
}
