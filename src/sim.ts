import { canonicalPersona } from '@adam0white/lab-client';
import { CAST, DISCOVERIES, openingProfile } from './cast.ts';
import { CURRENT_POLICY, CURRENT_SCHEMA, requireCurrentRun, requireCurrentScenario } from './current-policy';
import { admissionLine, assignmentText, nextTask, residentName } from './display.ts';
import { FRAMEWORK_VERSION } from './engine';
import {
  type Affordance,
  archiveCommunity,
  begin,
  createPerson,
  decide,
  finish,
  openCommunity,
  type Person,
  perceive,
  readPerson,
  restoreCommunity,
  stageOutcome,
  tick as tickPerson,
} from './hf4';
import { admitResident, type Chapter, checkChapter, lifeAdmission } from './passport.ts';
import { openPlacementGround } from './placement.ts';
import {
  note,
  PRESSURE,
  PRESSURE_FOOD,
  PRESSURE_OPENING,
  STORE_EFFORT,
  type Treatment,
  workPace,
} from './pressure.ts';
import {
  activePublic,
  interruptPublic,
  type PublicHost,
  requestPublicExchange,
  stagePublicExchanges,
  stepPublicExchange,
} from './public-exchanges';
import type { PublicCommand } from './public-voice-content';
import {
  applySettlement,
  initSettlement,
  type LONG_ROOF_RETURN,
  type LongRoofAttempt,
  longRoofUnavailable,
  requestLongRoof,
  requestReply,
  requestYieldReturn,
  type Settlement,
  type SettlementConfig,
  settlementBuildReason,
  settlementStoryHost,
  stepSettlement,
  validateReply,
  type YieldReturn,
} from './settlement.ts';
import { activePeer, type PeerCommand, validatePeer } from './settlement-dialogue.ts';
import { REPLIES, type ReplyBranch } from './settlement-scenes.ts';
import { STORY_CHOICES, type StoryChoice } from './story-content.ts';
import {
  activeStory,
  ensureStory,
  interruptStory,
  recordDisclosure,
  recordRestCompleted,
  recordRestStart,
  recordStorm,
  recordWork,
  requestStory,
  requireSupportedProducer,
  type StoryHost,
  type StoryState,
  shortConversationReason,
  stageStories,
  stepStory,
} from './story-records.ts';
import { continueWorkshop } from './workshop-continuation.ts';

export function taskLabel(target: string): string {
  return (
    {
      food: 'meals',
      wood: 'prepared boards',
      stone: 'ballast bags',
      house: 'guest cabin',
      storehouse: 'storehouse',
      shelter: 'shelter at the workshop hub',
    }[target] ?? target
  );
}

export type Resource = 'food' | 'wood' | 'stone';
export type Command =
  | PublicCommand
  | { kind: 'continue-workshop' }
  | { kind: 'remainder'; action: 'start' | 'stop' }
  | { kind: 'story-act'; ids: string[]; choice: StoryChoice | 'read-card' }
  | { kind: 'evening'; action: 'continue' | 'close' | 'keep-playing' }
  | { kind: 'yield-return'; ids: string[] }
  | { kind: 'roof-break-return'; ids: string[] }
  | { kind: 'long-roof-break-return'; ids: string[] }
  | { kind: 'reply'; ids: string[]; branch: ReplyBranch }
  | PeerCommand
  | { kind: 'order'; ids: string[]; target: string; x?: number; y?: number }
  | { kind: 'build'; ids: string[]; building: 'house' | 'storehouse'; x: number; y: number }
  | { kind: 'settlement'; ids: string[]; action: string; target?: string }
  | { kind: 'train' }
  | { kind: 'pause-chapter' }
  | { kind: 'resume-chapter' };
export type GameCommand = Command | { kind: 'yield-day' };
export type Input = { tick: number; command: GameCommand };
type Order = { target: string; x: number; y: number };
export type Villager = {
  id: string;
  name: string;
  role: string;
  assignment: string;
  lifeLine: string;
  availableAt: number;
  family: string;
  discovery: number;
  invitedBreak: boolean;
  breakStarted: number;
  x: number;
  y: number;
  person: Person;
  task: string;
  says: string;
  order: Order | null;
  recoveryUntil: number;
  actionUntil: number;
  status: string;
};
export type Building = {
  id: string;
  kind: 'town' | 'house' | 'storehouse';
  x: number;
  y: number;
  progress: number;
  complete: boolean;
};
export type ChronicleEntry = { tick: number; text: string };
export type ShortYield = { version: 'short-yield/1'; cutover: number; chronicle: ChronicleEntry[] };
export type RoofBreak = {
  id: string;
  capturedAt: number;
  /** Index of this public input; the preceding transcript and chapter pin its source world. */
  inputIndex: number;
  priorOrder: Order | null;
  priorTarget: Building | (typeof NODES)[number] | null;
  priorTask: string;
  priorStatus: string;
  stage: 'roof' | 'rest' | 'reoffered' | 'unavailable' | 'cancelled';
  restStarted?: number;
  restUntil?: number;
  endedAt?: number;
  result?: string;
};
export const ROOF_RETURN = 'roof-break-return/1';
export type State = {
  policy: typeof CURRENT_POLICY;
  remainder?: { startedAt: number; running: boolean };
  story?: StoryState;
  continuedWorkshop?: {
    atTick: number;
    runAtMs: number;
    endAtMs: number;
    endTick: number;
    stormSourceId: string;
  };
  yieldReturn?: YieldReturn[];
  longRoofBreak?: { version: typeof LONG_ROOF_RETURN; attempts: LongRoofAttempt[] };
  /** Created only by the separately named public action, never an implicit saved default. */
  roofBreak?: { version: typeof ROOF_RETURN; attempts: RoofBreak[] };
  /** Present only for `pressure/1` (schema 8); absent keeps legacy schema bytes. */
  rules?: typeof PRESSURE;
  /** `pressure/1` only: accepted effects of commands on each resident, for the ending. */
  record?: Record<string, Treatment>;
  shortYield?: ShortYield;
  settlement?: Settlement;
  chapter: Chapter | null;
  pauseRequested: boolean;
  chapterPaused: boolean;
  trainingUntil: number | null;
  seed: number;
  tick: number;
  resources: Record<Resource, number>;
  villagers: Villager[];
  buildings: Building[];
  inputs: Input[];
  message: string;
  ended: boolean;
  won: boolean;
};
// Host persistence lock only. It never enters State, exports, replay or actor rules.
const publishing = new WeakSet<State>();
export function holdPublication(state: State): () => void {
  if (publishing.has(state)) throw new Error('A resident save is already being published.');
  publishing.add(state);
  return () => publishing.delete(state);
}
export const NODES: { id: string; kind: Resource; x: number; y: number }[] = [
  { id: 'food', kind: 'food', x: 200, y: 440 },
  { id: 'wood', kind: 'wood', x: 245, y: 190 },
  { id: 'stone', kind: 'stone', x: 790, y: 220 },
];
// Scenario assumption: 0.5 HF body minutes per real simulation second (30×).
// Game deadlines and movement remain real seconds. HF alone evolves body and mind.
const BODY_MINUTES = 0.5;
const START_MINUTE = 8 * 60;
function makeVillager(seed: number, n: number, resident?: Person): Villager {
  const id = `v${n}`;
  const entry = CAST[n - 1];
  const name = entry?.name ?? `Helper ${n}`;
  return {
    id,
    name,
    assignment: entry?.work ?? 'The helper uses prepared materials for light tasks.',
    lifeLine: '',
    availableAt: 0,
    role: entry?.role ?? '',
    family: entry?.family ?? 'No personal history is recorded for this helper.',
    discovery: 0,
    invitedBreak: false,
    breakStarted: -1,
    x: 450 + ((n - 1) % 3) * 42,
    y: 425 + Math.floor((n - 1) / 3) * 35,
    person: createPerson(
      {
        id: entry?.castId ?? `commonstead.episode.${seed}.${n}`,
        name,
        seed: (seed + n * 997) >>> 0,
        now: START_MINUTE,
        bornAt: START_MINUTE - (entry?.age ?? 30) * 365 * 1440,
        sex: entry?.sex ?? 'female',
        ...(entry ? openingProfile(entry) : {}),
        body: { satiety: 0.95, hydration: 0.98, fitness: 0.35, sleepPressure: 0.05 },
        voices: [{ voiceId: 'commander', trust: 0.7 }],
        lexicon: { plainEnglish: true },
      },
      resident,
    ),
    task: 'idle',
    says: 'We use prepared boards, small ballast bags and hand tools. We do not use powered tools or change the building structure.',
    order: null,
    recoveryUntil: 0,
    actionUntil: 0,
    status: 'waiting',
  };
}
export function createGame(
  seed: number,
  chapter?: Chapter,
  config?: SettlementConfig,
  rules?: typeof PRESSURE,
): State {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid seed');
  requireCurrentScenario(config, rules);
  if (!config) rules = PRESSURE;
  openCommunity(seed, !!config);
  const villagers = Array.from({ length: 8 }, (_, i) => makeVillager(seed, i + 1));
  if (chapter) {
    checkChapter(chapter);
    for (const v of villagers) {
      const input = chapter.inputs.find((i) => i.parent.castId === v.person.id);
      const expected = input ? admitResident(input, v.person) : v.person;
      if (canonicalPersona(chapter.initial[v.person.id]) !== canonicalPersona(expected))
        throw new Error('Pinned initial actor differs from semantic admission.');
      v.person = expected;
      if (input) {
        const facts = lifeAdmission(input, 'commonstead');
        v.assignment = assignmentText(facts.assignment, residentName(v));
        v.lifeLine = admissionLine(facts);
        v.says = v.lifeLine;
        v.availableAt = facts.availableForExtraWork ? 0 : 30;
        v.x = facts.life.place === 'public-garden' ? 220 : facts.startsAtHome ? 450 : 750;
        v.y = facts.life.place === 'public-garden' ? 570 : facts.startsAtHome ? 425 : 410;
        v.status = v.availableAt
          ? 'attending own routine; light shared tasks after 0:30'
          : 'available for agreed light tasks';
      }
    }
  }
  const state: State = {
    policy: CURRENT_POLICY,
    seed,
    chapter: chapter ? structuredClone(chapter) : null,
    pauseRequested: false,
    chapterPaused: false,
    trainingUntil: null,
    tick: 0,
    resources: { food: 100, wood: 80, stone: 0 },
    villagers,
    buildings: [{ id: 'town', kind: 'town', x: 500, y: 350, progress: 1, complete: true }],
    inputs: [],
    message:
      'You are at the Alder Quay workshop. Assemble the storehouse before the storm at 10:00. Other people are covering Dai’s and Nerys’s usual work.',
    ended: false,
    won: false,
  };
  if (rules) {
    state.rules = rules;
    state.resources.food = PRESSURE_FOOD;
    state.message = PRESSURE_OPENING;
  }
  ensureStory(state);
  if (config) initSettlement(state, config);
  return state;
}
function interrupt(v: Villager) {
  if (v.person.activity)
    finish(v.person, {
      affordanceId: v.person.activity.affordanceId,
      action: v.person.activity.action,
      at: v.person.now,
      status: 'interrupted',
      summary: 'I changed my task.',
    });
  v.actionUntil = 0;
}
function offer(
  action: string,
  duration: number,
  effort: number,
  advertises: Affordance['advertises'],
  tags: string[] = [],
): Affordance {
  return { id: action, action, label: action, duration: duration * BODY_MINUTES, effort, advertises, tags };
}
function recover(s: State, v: Villager, kind: 'rest' | 'meal', automatic = false, roof = false) {
  if (!roof) cancelRoofBreak(s, v.id);
  interrupt(v);
  const a =
    kind === 'rest'
      ? offer('rest', 35, 0, { rest: 0.65 }, ['rest'])
      : offer('eat', 8, 0, { food: 0.7, water: 0.8 }, ['rest']);
  const r = decide(v.person, [a]);
  if (!begin(v.person, a, r)) return;
  recordRestStart(s, v);
  if (kind === 'meal') s.resources.food -= 2;
  v.recoveryUntil = s.tick + (kind === 'rest' ? 35 : 8);
  v.actionUntil = v.recoveryUntil;
  v.task = kind === 'rest' ? 'resting' : 'eating / drinking';
  v.status = `${v.task}; then ${taskLabel(v.order?.target ?? 'idle')}`;
  v.says =
    kind === 'rest'
      ? automatic
        ? 'I am tired. I need a break. Then I will return to my task.'
        : 'I will rest for a short time. Then I will return to my task.'
      : 'I need food and water. I can have them here.';
}
function choices(s: State): Affordance[] {
  const work = { ...offer('work', 10, 0.9, { safety: 0.12, esteem: 0.045 }, ['work']), material: 8 };
  if (s.tick < 60) return [work];
  const out = [work, offer('rest', 35, 0, { rest: 0.65 }, ['rest'])];
  out.push(offer('drink', 5, 0, { water: 0.8 }, ['rest']));
  if (s.resources.food >= 2) out.push(offer('eat', 8, 0, { food: 0.7, water: 0.8 }, ['rest']));
  return out;
}
function chooseWork(s: State, v: Villager, push = false) {
  if (s.pauseRequested) {
    v.task = 'idle';
    v.status = 'chapter paused at action boundary';
    return;
  }
  interrupt(v);
  if (v.order && Math.hypot(v.order.x - v.x, v.order.y - v.y) > 15) {
    const a = offer('move', 10, 0.15, {});
    const r = decide(v.person, [a]);
    begin(v.person, a, r);
    v.actionUntil = s.tick + 10;
    v.task = `moving to ${taskLabel(v.order.target)}`;
    v.status = 'moving';
    v.says = 'I am on my way.';
    return;
  }
  const offered = choices(s);
  const r = decide(
    v.person,
    offered,
    push
      ? { suggestion: { voiceId: 'commander', action: 'work', strength: 1, insist: true } }
      : s.tick >= 60
        ? { suggestion: { voiceId: 'commander', action: 'work', strength: 0 } }
        : {},
  );
  const accepted = offered.find((a) => a.id === r.chosenAffordanceId);
  if (accepted && begin(v.person, accepted, r)) recordRestStart(s, v);
  if (push)
    perceive(v.person, [
      {
        at: v.person.now,
        channel: 'heard',
        kind: 'request',
        actorId: 'commander',
        targetId: v.person.id,
        salience: 1,
        summary: 'The commander insisted: push on with the work.',
        valence: -0.15,
      },
    ]);
  const a = offered.find((a) => a.id === r.chosenAffordanceId);
  if (!a) {
    v.status = 'waiting / refused';
    v.task = 'waiting';
    v.says = r.suggestion?.says || r.narration;
    v.actionUntil = s.tick + 10;
    return;
  }
  if (a.action === 'eat') s.resources.food -= 2;
  const duration = a.action === 'rest' ? 35 : a.action === 'eat' ? 8 : a.action === 'drink' ? 5 : 10;
  v.actionUntil = s.tick + duration;
  if (a.action !== 'work') {
    v.recoveryUntil = v.actionUntil;
    v.task = a.action === 'rest' ? 'resting' : a.action === 'eat' ? 'eating / drinking' : 'drinking';
    v.status = `${r.suggestion?.verdict === 'refused' ? 'waiting / refused; ' : ''}${v.task}; then ${taskLabel(v.order?.target ?? 'idle')}`;
    v.says =
      r.suggestion?.reason === 'distrust'
        ? r.suggestion.says
        : a.action === 'rest'
          ? 'I am tired. I need a break. Then I will return to my task.'
          : a.action === 'eat'
            ? 'I need to eat and drink here.'
            : 'I need water. I will have a drink. Then I will return to work.';
  } else {
    v.task = taskLabel(v.order?.target ?? 'idle');
    v.status = v.person.activity?.protest ? 'working under protest' : 'working';
    const body = readPerson(v.person).body;
    v.says = push
      ? (r.suggestion?.says ?? 'I heard you insist.')
      : s.tick >= 60 && body.perceived.fatigue > 0.35
        ? 'I am tired. I am working more slowly. I need a break.'
        : 'I will work on that.';
  }
}
function assign(s: State, v: Villager, order: Order) {
  cancelRoofBreak(s, v.id);
  if (v.order?.target === order.target && v.order.x === order.x && v.order.y === order.y) return;
  v.order = order;
  if (order.target === 'move' || order.target === 'shelter') v.recoveryUntil = 0;
  if (v.recoveryUntil > s.tick) {
    v.status = `${v.task}; then ${order.target}`;
    return;
  }
  chooseWork(s, v);
}
/** Scope: one public host-world itinerary. HF still chooses every ordinary work act.
 * Rest uses the existing explicit rest affordance; no body, memory or earned material is reset.
 */
export function activeRoofBreak(s: State, id: string): RoofBreak | undefined {
  return s.roofBreak?.attempts.findLast((a) => a.id === id && ['roof', 'rest'].includes(a.stage));
}
function cancelRoofBreak(s: State, id?: string) {
  for (const a of s.roofBreak?.attempts ?? [])
    if ((!id || a.id === id) && ['roof', 'rest'].includes(a.stage)) {
      a.stage = 'cancelled';
      a.endedAt = s.tick;
      a.result = 'Cancelled by a later interruption. Earlier work will not be re-offered.';
    }
}
export function roofBreakUnavailable(s: State, ids: readonly string[]): string {
  if (!s.rules || s.settlement)
    return 'Roof break and return is available only in the ten-minute storm day. Longer-day jobs and carried loads are not supported by this action.';
  if (s.ended || s.pauseRequested || s.chapterPaused)
    return 'Resume an unfinished day before requesting a roof break.';
  if (!ids.length || ids.some((id) => !s.villagers.some((v) => v.id === id)))
    return 'Select residents for the roof break.';
  if (ids.some((id) => activeStory(s, id)))
    return 'Finish or stop the current exchange before requesting a roof break.';
  if (ids.some((id) => activeRoofBreak(s, id)))
    return 'A selected resident already has a roof break in progress. A new order interrupts it; repeating this action does not restart it.';
  if (s.villagers.some((v) => ids.includes(v.id) && s.tick < v.availableAt))
    return 'A selected resident is still attending a usual responsibility.';
  if (!s.buildings.some((b) => b.kind === 'town' && b.complete))
    return 'The workshop hub roof is unavailable.';
  if (s.inputs.length >= 10000 || (s.roofBreak?.attempts.length ?? 0) + ids.length > 10000)
    return 'The recorded roof-break limit has been reached.';
  return '';
}
function startRoofBreak(s: State, c: Extract<GameCommand, { kind: 'roof-break-return' }>) {
  validateRoofCommand(c);
  // Refused/duplicate requests do not add inputs or change an active itinerary.
  if (roofBreakUnavailable(s, c.ids)) return;
  const hub = s.buildings.find((b) => b.kind === 'town')!;
  const inputIndex = s.inputs.length;
  s.inputs.push({ tick: s.tick, command: structuredClone(c) });
  s.roofBreak ??= { version: ROOF_RETURN, attempts: [] };
  for (const v of s.villagers.filter((v) => c.ids.includes(v.id))) {
    const a: RoofBreak = {
      id: v.id,
      capturedAt: s.tick,
      inputIndex,
      priorOrder: structuredClone(v.order),
      priorTarget: structuredClone([...NODES, ...s.buildings].find((t) => t.id === v.order?.target) ?? null),
      priorTask: v.task,
      priorStatus: v.status,
      stage: 'roof',
    };
    interrupt(v);
    v.recoveryUntil = 0;
    v.order = {
      target: 'shelter',
      x: hub.x + 30 * Math.cos(Number(v.id.slice(1)) * 2.4),
      y: hub.y + 30 * Math.sin(Number(v.id.slice(1)) * 2.4),
    };
    s.roofBreak.attempts.push(a);
    if (Math.hypot(v.order.x - v.x, v.order.y - v.y) <= 15) beginRoofRest(s, v, a);
    else chooseWork(s, v);
  }
  s.message =
    'Selected residents stop work and walk under the hub roof. There they will take a planned 35-second rest, then consider their own earlier work. They may choose another personal activity. A new task interrupts this sequence.';
}
function beginRoofRest(s: State, v: Villager, a: RoofBreak) {
  v.order = null;
  note(s, v.id, { rest: true });
  recover(s, v, 'rest', false, true);
  v.invitedBreak = true;
  v.breakStarted = s.tick;
  a.stage = 'rest';
  a.restStarted = s.tick;
  a.restUntil = v.recoveryUntil;
  v.says = 'I am taking the planned break under the hub roof. Afterward I can consider the earlier request.';
}
function reofferRoofWork(s: State, v: Villager, a: RoofBreak) {
  const order = a.priorOrder;
  const node = NODES.find((n) => n.id === order?.target);
  const site = s.buildings.find((b) => b.id === order?.target && b.kind !== 'town');
  a.endedAt = s.tick;
  const target = node ?? site;
  const sameTarget =
    target &&
    a.priorTarget &&
    target.id === a.priorTarget.id &&
    target.kind === a.priorTarget.kind &&
    target.x === a.priorTarget.x &&
    target.y === a.priorTarget.y;
  if (!order || !sameTarget || (!node && (!site || site.complete))) {
    a.stage = 'unavailable';
    a.result = !order
      ? 'No earlier work request was recorded.'
      : site?.complete
        ? 'The earlier building is complete. No work was re-offered.'
        : 'The earlier target is unavailable or was not work. No work was re-offered.';
    v.says = a.result;
    return;
  }
  a.stage = 'reoffered';
  a.result =
    'The earlier work was re-offered through ordinary choices. Further rest or refusal remains possible.';
  v.order = structuredClone(order);
  note(s, v.id, { asked: true });
}
function validateRoofCommand(raw: unknown) {
  exactKeys(raw, ['kind', 'ids']);
  if (
    raw.kind !== 'roof-break-return' ||
    !Array.isArray(raw.ids) ||
    !raw.ids.length ||
    raw.ids.length > 20 ||
    new Set(raw.ids).size !== raw.ids.length ||
    raw.ids.some((id) => typeof id !== 'string' || !/^v[1-9][0-9]?$/.test(id))
  )
    throw new Error('Invalid roof-break residents');
}
/** Eligibility is limited to the original short chapter. UI also checks its menu pause. */
export function canYieldDay(s: State): boolean {
  return (
    !s.rules &&
    !s.settlement &&
    !s.shortYield &&
    !s.ended &&
    !s.pauseRequested &&
    !s.chapterPaused &&
    s.tick < 600 &&
    s.buildings.some((b) => b.kind === 'storehouse' && b.complete)
  );
}

/** Display rename only: immutable legacy opening messages and native hashes stay exact. */
export function publicPlaceText(text: string): string {
  return text.replaceAll('Alder Quay', 'Mill Bridge');
}

export function apply(s: State, c: GameCommand): void {
  if (publishing.has(s)) return;
  if (c.kind === 'continue-workshop') {
    exactKeys(c, ['kind']);
    if (s.inputs.length >= 10000) throw new Error('The run input limit has been reached.');
    continueWorkshop(s);
    s.inputs.push({ tick: s.tick, command: { kind: 'continue-workshop' } });
    return;
  }
  if (c.kind === 'remainder') {
    exactKeys(c, ['kind', 'action']);
    if (
      !['start', 'stop'].includes(c.action) ||
      s.settlement ||
      s.ended ||
      s.chapterPaused ||
      s.pauseRequested ||
      s.inputs.length >= 10000 ||
      !s.buildings.some((b) => b.kind === 'storehouse' && b.complete)
    )
      throw new Error('Finish the storehouse in an active short chapter before handing over.');
    if (c.action === 'stop' && !s.remainder?.running) throw new Error('No automatic remainder is running.');
    // Handoff drains ordinary steps; stopping preserves the actually reached state.
    s.remainder = { startedAt: s.remainder?.startedAt ?? s.tick, running: c.action === 'start' };
    s.inputs.push({ tick: s.tick, command: structuredClone(c) });
    return;
  }
  if (s.remainder?.running && !['pause-chapter', 'resume-chapter'].includes(c.kind))
    throw new Error('Stop the automatic remainder before giving further orders.');
  if (c.kind === 'public-exchange') {
    requestPublicExchange(s, c);
    s.inputs.push({ tick: s.tick, command: structuredClone(c) });
    return;
  }
  if (
    'ids' in c &&
    c.ids.some((id) => activePublic(s, id)) &&
    !['order', 'build', 'settlement'].includes(c.kind)
  )
    throw new Error('Finish or explicitly stop the public invitation first.');
  if (c.kind === 'story-act') {
    exactKeys(c, ['kind', 'ids', 'choice']);
    if (
      !Array.isArray(c.ids) ||
      c.ids.length !== 1 ||
      !(c.choice === 'read-card' || Object.hasOwn(STORY_CHOICES, c.choice))
    )
      throw new Error('Choose one resident and an available reply.');
    if (s.inputs.length >= 10000) throw new Error('The run input limit has been reached.');
    // CS-R7: reply editions use the same actual owner for both public first-reply commands.
    if (s.settlement && Object.hasOwn(REPLIES, c.choice)) {
      const reply = { kind: 'reply' as const, ids: c.ids, branch: c.choice as ReplyBranch };
      validateReply(s, reply);
      requestReply(s, reply);
    } else requestStory(s, c.ids[0]!, c.choice, s.settlement ? settlementStoryHost : shortStoryHost);
    s.inputs.push({ tick: s.tick, command: structuredClone(c) });
    return;
  }
  if (c.kind === 'evening') {
    if (s.inputs.length >= 10000) throw new Error('The run input limit has been reached.');
    exactKeys(c, ['kind', 'action']);
    if (
      !['continue', 'close', 'keep-playing'].includes(c.action) ||
      !(s.settlement?.storm || s.continuedWorkshop) ||
      s.ended
    )
      throw new Error('The evening can end after the actual storm result.');
    s.story ??= {
      version: 'commonstead-residual/1',
      paper: 4,
      firstResults: [],
      sources: [],
      events: [],
      objects: [],
      attempts: [],
      reads: [],
      work: [],
    };
    if (c.action === 'close') {
      s.story.close = { requestedAt: s.tick };
      s.message = 'Ending the evening when current actions reach their next boundary.';
    } else {
      delete s.story.close;
      s.message = 'Continue tonight.';
    }
    s.inputs.push({ tick: s.tick, command: structuredClone(c) });
    return;
  }
  if (s.story?.close && !['pause-chapter', 'resume-chapter'].includes(c.kind))
    throw new Error('Keep playing before requesting more work.');
  if (c.kind === 'yield-return') {
    exactKeys(c, ['kind', 'ids']);
    if (s.inputs.length >= 10000) throw new Error('The run input limit has been reached.');
    requestYieldReturn(s, c.ids, s.inputs.length);
    s.inputs.push({ tick: s.tick, command: structuredClone(c) });
    return;
  }
  if (c.kind === 'long-roof-break-return') {
    validateRoofCommand({ ...c, kind: 'roof-break-return' });
    if (longRoofUnavailable(s, c.ids)) return;
    const inputIndex = s.inputs.length;
    s.inputs.push({ tick: s.tick, command: structuredClone(c) });
    requestLongRoof(s, c.ids, inputIndex);
    return;
  }
  if (s.longRoofBreak && s.inputs.length >= 10000) throw new Error('The run input limit has been reached.');
  if (c.kind === 'roof-break-return') {
    startRoofBreak(s, c);
    return;
  }
  if (s.roofBreak && s.inputs.length >= 10000) throw new Error('The run input limit has been reached.');
  if (c.kind === 'yield-day') {
    exactKeys(c, ['kind']);
    if (!canYieldDay(s) || s.inputs.length >= 10000)
      throw new Error('Finish the storehouse in an unpaused short chapter before leaving the remaining day.');
    for (const input of s.inputs) {
      exactKeys(input, ['tick', 'command']);
      validateShortInput(input.command);
    }
    s.shortYield = {
      version: 'short-yield/1',
      cutover: s.tick,
      chronicle: [
        ...s.buildings
          .filter((b) => b.complete)
          .map((b) => ({
            tick: s.tick,
            text: `Earlier in this run: the ${taskLabel(b.kind)} (${b.id}) was complete by this point.`,
          })),
        ...s.villagers.flatMap((v) => {
          const scene = DISCOVERIES[Number(v.id.slice(1)) - 1];
          return v.discovery && scene
            ? [
                {
                  tick: s.tick,
                  text: `Earlier in this run, ${residentName(v)} (${v.person.id}) shared: ${scene[v.discovery === 2 ? 1 : 0]}`,
                },
              ]
            : [];
        }),
      ],
    };
    s.inputs.push({ tick: s.tick, command: { kind: 'yield-day' } });
    return;
  }
  if ('ids' in c && c.ids.some((id) => activeStory(s, id))) {
    if (c.kind === 'settlement' && c.action === 'cancel') {
      for (const id of c.ids) interruptStory(s, id);
    } else throw new Error('Finish or explicitly stop the current exchange before another request.');
  }
  if (s.shortYield) {
    if (!['pause-chapter', 'resume-chapter'].includes(c.kind))
      throw new Error('The residents have the remaining day. Further work requests are closed.');
    exactKeys(c, ['kind']);
    if (s.inputs.length >= 10000) throw new Error('The run input limit has been reached.');
  }
  if (c.kind === 'peer') validatePeer(s, c);
  if (s.settlement) {
    if (c.kind !== 'peer') validateReplyCommand(s, c);
    if (
      'ids' in c &&
      c.kind !== 'peer' &&
      !(c.kind === 'settlement' && c.action === 'cancel') &&
      c.ids.some((id) => activePeer(s, id))
    )
      throw new Error('Cancel the route conversation explicitly before giving another task.');
    if (c.kind === 'reply') validateReply(s, c);
    if (
      'ids' in c &&
      c.kind !== 'reply' &&
      !(c.kind === 'settlement' && c.action === 'cancel') &&
      c.ids.some((id) =>
        ['requested', 'running'].includes(s.settlement?.replyScenes?.[id]?.attempts.at(-1)?.status ?? ''),
      )
    )
      throw new Error('Cancel the pending paper conversation explicitly before giving another task.');
  } else if (c.kind === 'reply') {
    if (c.ids.length !== 1 || !Object.hasOwn(REPLIES, c.branch) || REPLIES[c.branch].actor !== c.ids[0])
      throw new Error('Choose the matching resident and reply.');
    requestStory(s, c.ids[0]!, c.branch, s.settlement ? settlementStoryHost : shortStoryHost);
    s.inputs.push({ tick: s.tick, command: structuredClone(c) });
    return;
  }
  if (s.ended && c.kind !== 'pause-chapter') return;
  if (s.chapterPaused && c.kind !== 'resume-chapter') return;
  if (!s.settlement && c.kind === 'order' && c.target === 'collaborate') {
    if (c.ids.length !== 1 || !s.villagers.some((v) => v.id === c.ids[0]))
      throw new Error('Select one current resident.');
    const names = ['nora', 'sam', 'dai', 'nerys', 'dilek', 'burak', 'sevim', 'oskar'];
    const name = names[Number(c.ids[0]!.slice(1)) - 1];
    if (!name) throw new Error('This resident has no authored collaboration.');
    requestStory(s, c.ids[0]!, `collaboration-${name}` as StoryChoice, shortStoryHost);
    s.inputs.push({ tick: s.tick, command: structuredClone(c) });
    return;
  }
  // A refused replacement is recorded for truthful replay/UI; it does not acquire the public owner.
  if (s.settlement && c.kind === 'build' && c.ids.some((id) => activePublic(s, id))) {
    const reason = settlementBuildReason(s, c);
    if (reason) {
      const r = ensureStory(s);
      r.rejectedPublicBuilds ??= [];
      r.rejectedPublicBuilds.push({ inputIndex: s.inputs.length, at: s.tick, reason });
      s.inputs.push({ tick: s.tick, command: structuredClone(c) });
      s.message = reason;
      return;
    }
  }
  if ('ids' in c)
    for (const id of c.ids)
      interruptPublic(
        s,
        id,
        'A later request stopped the public invitation. Earlier work was not automatically offered.',
      );
  s.inputs.push({ tick: s.tick, command: structuredClone(c) });
  if (s.settlement) {
    applySettlement(s, c);
    return;
  }
  if (c.kind === 'settlement' || c.kind === 'reply' || c.kind === 'peer') return;
  if (c.kind === 'pause-chapter') {
    cancelRoofBreak(s);
    s.pauseRequested = true;
    s.chapterPaused = s.villagers.every((v) => !v.person.activity);
    s.message = s.chapterPaused
      ? 'The game is paused so people can leave. Their other responsibilities remain.'
      : 'People will finish their current actions before leaving. They will not start new actions.';
    return;
  }
  if (c.kind === 'resume-chapter') {
    s.pauseRequested = false;
    s.chapterPaused = false;
    for (const v of s.villagers) if (v.order) chooseWork(s, v);
    s.message = 'This chapter has resumed.';
    return;
  }
  if (s.pauseRequested) {
    s.message = 'Wait until everyone has finished. Then resume the game before giving new work orders.';
    return;
  }
  if (c.kind === 'train') {
    if (s.trainingUntil !== null) {
      s.message = 'One helper is already learning the light tasks.';
      return;
    }
    const cap = 10 + s.buildings.filter((b) => b.kind === 'house' && b.complete).length * 2;
    if (s.villagers.length >= cap) {
      s.message = 'You need room for more people.';
      return;
    }
    if (s.resources.food < 35) {
      s.message = 'You need 35 meal units to feed a helper during training.';
      return;
    }
    s.resources.food -= 35;
    s.trainingUntil = s.tick + 15;
    s.message = 'A local helper will finish learning these light tasks in 15 seconds.';
    return;
  }
  const selected = s.villagers.filter((v) => c.ids.includes(v.id));
  if (!selected.length) {
    s.message = 'Select at least one person.';
    return;
  }
  if (selected.some((v) => s.tick < v.availableAt)) {
    s.message = 'A selected resident is busy with a usual responsibility until 0:30.';
    return;
  }
  if (c.kind === 'build') {
    const wood = c.building === 'house' ? 40 : 180;
    const stone = c.building === 'house' ? 0 : 120;
    if (!openPlacementGround(c.x, c.y, [...s.buildings, ...NODES])) {
      s.message = 'Choose open ground, away from cabins and delivered materials.';
      return;
    }
    if (s.resources.wood < wood || s.resources.stone < stone) {
      s.message = `The ${taskLabel(c.building)} needs ${wood} boards${stone ? ` and ${stone} ballast bags` : ''}.`;
      return;
    }
    if (c.building === 'storehouse' && s.buildings.some((b) => b.kind === 'storehouse')) {
      s.message = 'You have already chosen a place for the storehouse.';
      return;
    }
    s.resources.wood -= wood;
    s.resources.stone -= stone;
    const b: Building = {
      id: `b${s.buildings.length}`,
      kind: c.building,
      x: c.x,
      y: c.y,
      progress: 0,
      complete: false,
    };
    s.buildings.push(b);
    for (const v of selected)
      note(s, v.id, { asked: true, [c.building === 'house' ? 'cabin' : 'store']: true });
    for (const v of selected)
      assign(s, v, {
        target: b.id,
        x: b.x + 18 * Math.cos(Number(v.id.slice(1)) * 2.4),
        y: b.y + 18 * Math.sin(Number(v.id.slice(1)) * 2.4),
      });
    s.message = `${selected.map((v) => residentName(v)).join(', ')} will prepare the ${taskLabel(c.building)}.`;
    return;
  }
  if (c.target === 'rest' || c.target === 'meal') {
    if (c.target === 'meal' && s.resources.food < selected.length * 2) {
      s.message = 'A meal needs 2 meal units per person.';
      return;
    }
    for (const v of selected) {
      note(s, v.id, { rest: true });
      recover(s, v, c.target);
      v.invitedBreak = true;
      v.breakStarted = s.tick;
    }
    s.message =
      c.target === 'rest'
        ? `${selected.length === 1 && selected[0] ? residentName(selected[0]) : 'The selected people'} will rest here for 35 seconds. Work will resume after the break.`
        : `${selected.length === 1 && selected[0] ? residentName(selected[0]) : 'The selected people'} will eat and drink here. Work will resume after the meal.`;
    return;
  }
  if (c.target === 'listen') {
    if (selected.length !== 1) {
      s.message = 'Invite one person to talk during a chosen break.';
      return;
    }
    const v = selected[0];
    if (!v) return;
    const scene = DISCOVERIES[Number(v.id.slice(1)) - 1];
    const why = shortConversationReason(s, v.id, 'disclosure');
    if (why) {
      s.message = why;
      return;
    }
    if (!scene) return;
    const invitation = offer('talk', 5, 0, { belonging: 0.5 }, ['social']);
    const response = decide(v.person, [invitation], {
      suggestion: { voiceId: 'commander', action: 'talk', strength: 0 },
    });
    if (response.suggestion?.verdict === 'refused' || !response.chosenAffordanceId) {
      v.says = response.suggestion?.says || 'I would rather rest than talk just now.';
      s.message = v.says;
      return;
    }
    if (c.target === 'listen' && v.discovery === 0) {
      v.discovery = 1;
      v.says = scene[0];
      recordDisclosure(s, v);
    }
    s.message = v.says;
    return;
  }
  if (s.rules && c.target === 'shelter') {
    const hub = s.buildings.find((b) => b.kind === 'town');
    if (!hub) return;
    for (const v of selected)
      assign(s, v, {
        target: 'shelter',
        x: hub.x + 30 * Math.cos(Number(v.id.slice(1)) * 2.4),
        y: hub.y + 30 * Math.sin(Number(v.id.slice(1)) * 2.4),
      });
    s.message = `${selected.map((v) => residentName(v)).join(', ')} will go under the roof at the workshop hub.`;
    return;
  }
  if (c.target === 'push') {
    for (const v of selected)
      if (v.order) {
        cancelRoofBreak(s, v.id);
        note(s, v.id, { push: true });
        v.recoveryUntil = 0;
        chooseWork(s, v, true);
      }
    s.message = 'You insisted on work. People may protest and remember this.';
    return;
  }
  const target = [...NODES, ...s.buildings].find((n) => n.id === c.target);
  if (c.target !== 'move' && !target) {
    s.message = 'That destination does not exist.';
    return;
  }
  const x = target?.x ?? c.x;
  const y = target?.y ?? c.y;
  if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
    s.message = 'Choose a destination.';
    return;
  }
  const site = s.buildings.find((b) => b.id === c.target && b.kind !== 'town');
  if (c.target !== 'move')
    for (const v of selected)
      note(s, v.id, { asked: true, ...(site ? { [site.kind === 'house' ? 'cabin' : 'store']: true } : {}) });
  for (const v of selected)
    assign(s, v, {
      target: c.target,
      x: Math.max(20, Math.min(980, x + (target ? 18 * Math.cos(Number(v.id.slice(1)) * 2.4) : 0))),
      y: Math.max(20, Math.min(680, y + (target ? 18 * Math.sin(Number(v.id.slice(1)) * 2.4) : 0))),
    });
  s.message = `${selected.map((v) => residentName(v)).join(', ')} will ${c.target === 'move' ? 'move to the selected place' : `start ${nextTask(c.target, s.buildings)}`}.`;
}
export function step(s: State): void {
  if (publishing.has(s)) return;
  if (s.settlement) {
    stepSettlement(s);
    return;
  }
  if (s.ended || s.chapterPaused) return;
  s.tick++;
  if (s.trainingUntil !== null && s.tick >= s.trainingUntil) {
    const arrival = makeVillager(s.seed, s.villagers.length + 1, s.villagers[0]!.person);
    tickPerson(arrival.person, START_MINUTE + s.tick * BODY_MINUTES);
    s.villagers.push(arrival);
    s.trainingUntil = null;
    s.message = `${residentName(arrival)} has joined the workshop today.`;
  }
  stageStories(s);
  stagePublicExchanges(s);
  for (const v of s.villagers) {
    const activity = v.person.activity;
    if (
      !activeStory(s, v.id) &&
      !activePublic(s, v.id)?.participants.some((p) => p.actor === v.id && p.status === 'running') &&
      activity &&
      (v.recoveryUntil ? s.tick >= v.recoveryUntil : v.order && s.tick >= v.actionUntil)
    )
      stageOutcome(v.person, {
        affordanceId: activity.affordanceId,
        action: activity.action,
        at: START_MINUTE + s.tick * BODY_MINUTES,
        status: 'completed',
        needs:
          activity.action === 'eat'
            ? { food: 0.7, water: 0.8 }
            : activity.action === 'drink'
              ? { water: 0.8 }
              : {},
        summary: `I finished ${activity.action}.`,
      });
  }
  const publicShared = s.story?.publicExchanges?.some((a) => ['requested', 'active'].includes(a.status));
  if (publicShared) for (const v of s.villagers) tickPerson(v.person, START_MINUTE + s.tick * BODY_MINUTES);
  for (const v of s.villagers) {
    if (!publicShared) tickPerson(v.person, START_MINUTE + s.tick * BODY_MINUTES);
    if (stepPublicExchange(s, v, shortPublicHost)) continue;
    if (stepStory(s, v, shortStoryHost)) continue;
    if (s.story?.close && !v.person.activity) continue;
    if (v.availableAt === s.tick && v.status.startsWith('attending own routine'))
      v.status = 'available for agreed light tasks';
    if (v.recoveryUntil) {
      if (s.tick < v.recoveryUntil) continue;
      const action = v.person.activity?.action;
      const resting = v.person.activity;
      let completion: ReturnType<typeof finish>;
      const roofRest = activeRoofBreak(s, v.id);
      if (v.person.activity)
        completion = finish(v.person, {
          affordanceId: v.person.activity.affordanceId,
          action: v.person.activity.action,
          at: v.person.now,
          status: 'completed',
          needs: action === 'eat' ? { food: 0.7, water: 0.8 } : action === 'drink' ? { water: 0.8 } : {},
          summary:
            roofRest?.stage === 'rest'
              ? 'I finished the planned rest under the hub roof.'
              : `I finished ${action === 'rest' ? 'resting' : action === 'eat' ? 'eating' : 'drinking'}. I am returning to my task.`,
        });
      if (resting?.action === 'rest' && completion?.status === 'completed' && v.person.now >= resting.endsAt)
        recordRestCompleted(s, v, resting.id);
      v.recoveryUntil = 0;
      v.actionUntil = 0;
      // CS-R6: consume the delivered completion, then retain requests without starting more work.
      if (s.story?.close) continue;
      if (stepPublicExchange(s, v, shortPublicHost)) continue;
      if (roofRest?.stage === 'rest' && roofRest.restUntil === s.tick) reofferRoofWork(s, v, roofRest);
      if (v.order) chooseWork(s, v);
      else {
        v.task = 'idle';
        v.status = 'waiting';
      }
    }
    if (!v.order) continue;
    if (v.actionUntil <= s.tick) {
      if (v.person.activity)
        finish(v.person, {
          affordanceId: v.person.activity.affordanceId,
          action: v.person.activity.action,
          at: v.person.now,
          status: 'completed',
          summary: `I worked on ${taskLabel(v.order.target)}.`,
          material: 1,
        });
      if (s.story?.close) continue;
      if (stepPublicExchange(s, v, shortPublicHost)) continue;
      if (!v.order) continue;
      chooseWork(s, v);
    }
    if (v.recoveryUntil || !['work', 'move'].includes(v.person.activity?.action ?? '')) continue;
    const d = Math.hypot(v.order.x - v.x, v.order.y - v.y);
    if (d > 15) {
      const scale = Math.min(1, 65 / d);
      v.x += (v.order.x - v.x) * scale;
      v.y += (v.order.y - v.y) * scale;
      continue;
    }
    if (v.order.target === 'move' || v.order.target === 'shelter') {
      const shelter = v.order.target === 'shelter';
      interrupt(v);
      v.order = null;
      v.task = 'idle';
      v.status = 'waiting';
      v.says = shelter ? 'I am under the roof at the hub.' : 'I am here.';
      const roof = activeRoofBreak(s, v.id);
      if (!s.story?.close && shelter && roof?.stage === 'roof') beginRoofRest(s, v, roof);
      continue;
    }
    if (v.person.activity?.action === 'move') {
      interrupt(v);
      if (!s.story?.close) chooseWork(s, v);
      continue;
    }
    const capacity =
      readPerson(v.person).body.capacity *
      (v.person.activity?.protest ? (s.rules ? 0.6 : 0.75) : 1) *
      (s.rules ? workPace(v) : 1);
    const node = NODES.find((n) => n.id === v.order?.target);
    if (node) {
      const amount = (s.rules && node.kind === 'food' ? 0.25 : 0.52) * capacity;
      s.resources[node.kind] += amount;
      recordWork(s, { actor: v.id, at: s.tick, kind: 'delivery', target: node.kind, amount });
    }
    const b = s.buildings.find((b) => b.id === v.order?.target);
    if (b && !b.complete) {
      const before = b.progress;
      b.progress = Math.min(
        1,
        b.progress + capacity / (b.kind === 'house' ? 35 : s.rules ? STORE_EFFORT : 180),
      );
      recordWork(s, {
        actor: v.id,
        at: s.tick,
        kind: 'build',
        target: b.id,
        amount: b.progress - before,
        before,
        after: b.progress,
      });
      if (b.progress === 1) {
        b.complete = true;
        s.shortYield?.chronicle.push({
          tick: s.tick,
          text: `The ${taskLabel(b.kind)} (${b.id}) was completed.`,
        });
        s.message = `The ${taskLabel(b.kind)} is finished. ${b.kind === 'storehouse' ? (s.rules ? 'The shared supplies will stay dry. Before the storm, save meals for the storm day, let tired people rest, and bring everyone under a roof.' : 'The shared supplies are ready for the storm.') : 'There is room for two more people.'}`;
      }
    }
    if (b?.complete) {
      interrupt(v);
      v.order = null;
      v.task = 'idle';
      v.status = 'waiting';
      v.says = 'The building is finished.';
    }
  }
  if (
    s.continuedWorkshop &&
    ((s.story?.close && s.villagers.every((v) => !v.person.activity && !activeStory(s, v.id))) ||
      s.villagers[0]!.person.now * 60000 >= s.continuedWorkshop.endAtMs)
  ) {
    for (const v of s.villagers) {
      interruptStory(s, v.id, 'The continued workshop ended at its actual boundary.');
      interrupt(v);
    }
    s.ended = true;
    s.chapterPaused = true;
    if (s.story?.close) s.story.close.committedAt = s.tick;
    s.message = 'This continued workshop ended. Unfinished work remains unfinished.';
  }
  if (s.pauseRequested && s.villagers.every((v) => !v.person.activity)) {
    s.chapterPaused = true;
    s.message = 'Everyone has finished. The game is paused so people can leave.';
  }
  if (s.tick === 480)
    s.message = !s.rules
      ? 'The storm will arrive in two minutes. Finish the storehouse.'
      : s.buildings.some((b) => b.kind === 'storehouse' && b.complete)
        ? 'The storm will arrive in two minutes. Bring everyone under a roof: the workshop hub or a finished building.'
        : 'The storm will arrive in two minutes. Finish the storehouse, then bring everyone under a roof.';
  if (s.tick === 600) {
    recordStorm(s);
    cancelRoofBreak(s);
    for (const v of s.villagers) interruptStory(s, v.id, 'The storm ended this unfinished exchange.');
    s.ended = true;
    // The actual storm ends work. It interrupts remaining acts; it does not complete obligations.
    for (const v of s.villagers) {
      interrupt(v);
      v.recoveryUntil = 0;
    }
    s.won = s.buildings.some((b) => b.kind === 'storehouse' && b.complete);
    s.message = s.won
      ? 'The storehouse keeps the shared supplies dry. The workshop can open tomorrow.'
      : 'The storm soaks the shared supplies. The unfinished storehouse could not protect them.';
    s.shortYield?.chronicle.push({ tick: s.tick, text: s.message });
  }
}
/** One visible batch. Callers must pass false while the menu or tab is inactive. */
export function stepYieldBatch(s: State, active: boolean): number {
  if (!active || !(s.shortYield || s.remainder?.running)) return 0;
  const before = s.tick;
  for (let i = 0; i < 12 && !s.ended && !s.chapterPaused; i++) step(s);
  return s.tick - before;
}

function stable(x: unknown): string {
  if (x === null || typeof x !== 'object') return JSON.stringify(x);
  if (Array.isArray(x)) return `[${x.map(stable).join(',')}]`;
  const obj = x as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`)
    .join(',')}}`;
}
export function stateHash(s: State): string {
  const str = stable(s);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
function exactKeys(
  raw: unknown,
  required: string[],
  optional: string[] = [],
): asserts raw is Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid command shape');
  const keys = Object.keys(raw);
  if (
    required.some((k) => !Object.hasOwn(raw, k)) ||
    keys.some((k) => !required.includes(k) && !optional.includes(k))
  )
    throw new Error('Invalid command fields');
}
function validateReplyCommand(s: State, raw: unknown): void {
  exactKeys(raw, ['kind'], ['ids', 'target', 'x', 'y', 'action', 'building', 'branch']);
  const c = raw as unknown as Command;
  if (['train', 'pause-chapter', 'resume-chapter'].includes(c.kind)) {
    exactKeys(c, ['kind']);
    return;
  }
  if (
    !('ids' in c) ||
    !Array.isArray(c.ids) ||
    !c.ids.length ||
    new Set(c.ids).size !== c.ids.length ||
    c.ids.some((id) => !/^v[1-8]$/.test(id))
  )
    throw new Error('Choose existing residents');
  if (c.kind === 'reply') {
    exactKeys(c, ['kind', 'ids', 'branch']);
    if (!Object.hasOwn(REPLIES, c.branch) || c.ids.length !== 1 || REPLIES[c.branch].actor !== c.ids[0])
      throw new Error('Invalid reply branch or resident');
  } else if (c.kind === 'order') {
    const moving = c.target === 'move';
    const building = s.buildings.some((b) => b.id === c.target && !b.complete);
    const coordinates = moving || (building && (Object.hasOwn(c, 'x') || Object.hasOwn(c, 'y')));
    exactKeys(c, ['kind', 'ids', 'target', ...(coordinates ? ['x', 'y'] : [])]);
    if (
      (!building && !['food', 'wood', 'stone', 'move', 'rest', 'meal', 'push'].includes(c.target)) ||
      (coordinates && (!Number.isFinite(c.x) || !Number.isFinite(c.y)))
    )
      throw new Error('Invalid order');
  } else if (c.kind === 'build') {
    exactKeys(c, ['kind', 'ids', 'building', 'x', 'y']);
    if (!['house', 'storehouse'].includes(c.building) || !Number.isFinite(c.x) || !Number.isFinite(c.y))
      throw new Error('Invalid building');
  } else if (c.kind === 'settlement') {
    const targeted = ['map', 'scene'].includes(c.action);
    exactKeys(c, ['kind', 'ids', 'action', ...(targeted ? ['target'] : [])]);
    if (
      !['cancel', 'talk', 'spar', 'story', 'yield', 'map', 'inspect', 'scene'].includes(c.action) ||
      (c.action === 'map' && !['yard', 'quay', 'courtyard'].includes(c.target ?? '')) ||
      (c.action === 'scene' &&
        !['correction', 'visit', 'telescope', 'letter', 'trial'].includes(c.target ?? ''))
    )
      throw new Error('Invalid day action');
  } else throw new Error('Unknown reply-day command');
}

function requireShortJson(value: unknown, depth = 0): void {
  if (depth > 100) throw new Error('JSON nesting limit');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (!Number.isInteger(value) || Number.isSafeInteger(value))
  )
    return;
  if (Array.isArray(value)) {
    for (const v of value) requireShortJson(v, depth + 1);
    return;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, v] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsafe JSON key');
      requireShortJson(v, depth + 1);
    }
    return;
  }
  throw new Error('Only complete JSON data is accepted in reply notebooks');
}

function validateShortInput(raw: unknown, allowRoof = false, actualIds?: string[]): void {
  if (allowRoof && (raw as { kind?: string })?.kind === 'roof-break-return') {
    validateRoofCommand(raw);
    return;
  }
  exactKeys(raw, ['kind'], ['ids', 'target', 'x', 'y', 'building']);
  const c = raw as unknown as Command;
  if (['yield-day', 'train', 'pause-chapter', 'resume-chapter'].includes(c.kind)) {
    exactKeys(c, ['kind']);
    return;
  }
  if (
    !('ids' in c) ||
    !Array.isArray(c.ids) ||
    c.ids.length > 20 ||
    new Set(c.ids).size !== c.ids.length ||
    c.ids.some(
      (id) =>
        typeof id !== 'string' ||
        !/^v[1-9][0-9]?$/.test(id) ||
        (actualIds !== undefined && !actualIds.includes(id)),
    )
  )
    throw new Error('ids');
  if (c.kind === 'order') {
    exactKeys(c, ['kind', 'ids', 'target'], ['x', 'y']);
    if (
      typeof c.target !== 'string' ||
      c.target.length > 100 ||
      ('x' in c && !Number.isFinite(c.x)) ||
      ('y' in c && !Number.isFinite(c.y))
    )
      throw new Error('order');
  } else if (c.kind === 'build') {
    exactKeys(c, ['kind', 'ids', 'building', 'x', 'y']);
    if (!['house', 'storehouse'].includes(c.building) || !Number.isFinite(c.x) || !Number.isFinite(c.y))
      throw new Error('build');
  } else throw new Error('Unknown short command');
}

/** Shape validation only: base-day targets can already be complete or refused. Their ordinary
 * apply contract decides that at the recorded tick, after replay advances to that tick. */
function validateLongBaseInput(raw: unknown, actualIds?: string[]): void {
  const c = raw as Command;
  if (['train', 'pause-chapter', 'resume-chapter'].includes(c?.kind)) {
    exactKeys(raw, ['kind']);
    return;
  }
  exactKeys(raw, ['kind', 'ids'], ['target', 'x', 'y', 'action', 'building', 'branch', 'map', 'disputeAt']);
  if (
    !('ids' in c) ||
    !Array.isArray(c.ids) ||
    c.ids.length > 20 ||
    new Set(c.ids).size !== c.ids.length ||
    c.ids.some((id) => (actualIds ? !actualIds.includes(id) : !/^v[1-8]$/.test(id)))
  )
    throw new Error('ids');
  if (c.kind === 'order') {
    exactKeys(c, ['kind', 'ids', 'target'], ['x', 'y']);
    if (
      typeof c.target !== 'string' ||
      c.target.length > 100 ||
      ('x' in c && !Number.isFinite(c.x)) ||
      ('y' in c && !Number.isFinite(c.y))
    )
      throw new Error('order');
  } else if (c.kind === 'build') {
    exactKeys(c, ['kind', 'ids', 'building', 'x', 'y']);
    if (!['house', 'storehouse'].includes(c.building) || !Number.isFinite(c.x) || !Number.isFinite(c.y))
      throw new Error('build');
  } else if (c.kind === 'settlement') {
    exactKeys(c, ['kind', 'ids', 'action'], ['target']);
    if (
      !['cancel', 'talk', 'spar', 'story', 'yield', 'map', 'inspect', 'scene'].includes(c.action) ||
      ('target' in c && (typeof c.target !== 'string' || c.target.length > 100))
    )
      throw new Error('action');
  } else if (c.kind === 'reply') {
    exactKeys(c, ['kind', 'ids', 'branch']);
    if (!Object.hasOwn(REPLIES, c.branch)) throw new Error('reply');
  } else if (c.kind !== 'peer') throw new Error('Unknown long-day command');
}

/** Full and compact files retain HF's exact archive as well as the host input log. */
export function exportRun(s: State, compact = false): unknown {
  if (s.policy !== CURRENT_POLICY) throw new Error('Only the current host policy can be exported.');
  const config = s.settlement?.config;
  requireCurrentScenario(config, s.rules);
  if (!config && s.rules !== PRESSURE) throw new Error('The short scenario requires pressure rules.');
  return {
    schema: CURRENT_SCHEMA,
    policy: CURRENT_POLICY,
    framework: FRAMEWORK_VERSION,
    seed: s.seed,
    tick: s.tick,
    chapter: s.chapter,
    config: config ?? null,
    rules: s.rules ?? null,
    inputs: structuredClone(s.inputs),
    hash: stateHash(s),
    ...(compact ? { compact: true } : { state: JSON.parse(JSON.stringify(s)) }),
    hf: archiveCommunity(s.villagers[0]!.person),
  };
}
function* importRunSteps(raw: unknown, checked = false): Generator<number, State, void> {
  requireCurrentRun(raw);
  const { hf, ...host } = raw as Record<string, unknown>;
  try {
    let s: State;
    {
      requireShortJson(host);
      exactKeys(
        host,
        host.compact === true
          ? [
              'schema',
              'policy',
              'framework',
              'seed',
              'tick',
              'chapter',
              'config',
              'rules',
              'inputs',
              'hash',
              'compact',
            ]
          : [
              'schema',
              'policy',
              'framework',
              'seed',
              'tick',
              'chapter',
              'config',
              'rules',
              'inputs',
              'hash',
              'state',
            ],
      );
      if (
        host.framework !== FRAMEWORK_VERSION ||
        !Array.isArray(host.inputs) ||
        host.inputs.length > 10000 ||
        !Number.isInteger(host.tick) ||
        (host.tick as number) < 0 ||
        (host.tick as number) > 10000
      )
        throw new Error('Invalid current run.');
      s = createGame(
        host.seed as number,
        (host.chapter as Chapter) ?? undefined,
        (host.config as SettlementConfig) ?? undefined,
        (host.rules as typeof PRESSURE) ?? undefined,
      );
      let previous = -1;
      for (const input of host.inputs as Input[]) {
        exactKeys(input, ['tick', 'command']);
        if (!Number.isInteger(input.tick) || input.tick < previous || input.tick > (host.tick as number))
          throw new Error('Invalid current input.');
        while (s.tick < input.tick) {
          const before = s.tick;
          step(s);
          yield s.tick;
          if (s.tick === before) throw new Error('Replay cannot advance this stopped run.');
        }
        if (
          ![
            'public-exchange',
            'story-act',
            'yield-return',
            'evening',
            'remainder',
            'continue-workshop',
          ].includes(input.command.kind)
        ) {
          if (input.command.kind === 'long-roof-break-return' || input.command.kind === 'roof-break-return')
            validateRoofCommand({ ...input.command, kind: 'roof-break-return' });
          else if (host.config)
            validateLongBaseInput(
              input.command,
              s.villagers.map((v) => v.id),
            );
          else if (input.command.kind !== 'reply')
            validateShortInput(
              input.command,
              true,
              s.villagers.map((v) => v.id),
            );
        }
        if (
          'ids' in input.command &&
          (!Array.isArray(input.command.ids) ||
            input.command.ids.some((id) => !s.villagers.some((v) => v.id === id)))
        )
          throw new Error('The command names a resident absent from this run.');
        apply(s, input.command);
        previous = input.tick;
      }
      while (s.tick < (host.tick as number)) {
        const before = s.tick;
        step(s);
        yield s.tick;
        if (s.tick === before) throw new Error('Replay cannot advance this stopped run.');
      }
      if (
        (!s.yieldReturn && !s.story) ||
        stable(s.inputs) !== stable(host.inputs) ||
        stateHash(s) !== host.hash ||
        (host.state !== undefined && stable(host.state) !== stable(s))
      )
        throw new Error('Current run differs from its actual input history.');
    }
    // Both entry modes compare the entire independently reconstructed archive.
    if (stable(archiveCommunity(s.villagers[0]!.person)) !== stable(hf))
      throw new Error('The game log and complete HF archive disagree.');
    if (!checked) restoreCommunity(s.villagers[0]!.person, hf as Parameters<typeof restoreCommunity>[1]);
    return s;
  } catch {
    throw new Error(
      'This file does not replay the same way in this version of Commonstead. It may come from an older version. The file was not loaded. Keep the original file. Start a new game instead.',
    );
  }
}

const shortStoryHost: StoryHost = {
  body: (s, _v) => choices(s).filter((a) => a.action !== 'work'),
  alternative: (s, v, a, d) => {
    if (a.action === 'eat' && s.resources.food < 2) return;
    if (begin(v.person, a, d)) {
      recordRestStart(s, v);
      if (a.action === 'eat') s.resources.food -= 2;
      v.recoveryUntil = s.tick + Math.ceil(a.duration / BODY_MINUTES);
      v.actionUntil = v.recoveryUntil;
      v.says = d.suggestion?.says || d.narration;
      v.task = a.action;
      v.status = `is ${a.action}.`;
    }
  },
  move: (s, v, _map, point) => {
    assign(s, v, { target: 'move', ...point });
    return v.order?.target === 'move';
  },
  scene: () => {
    throw new Error('Evening scenes belong to the longer day.');
  },
};

export const shortPublicHost: PublicHost = {
  ...shortStoryHost,
  work: (s, v, prior) => {
    const order = prior as Villager['order'];
    if (
      !order ||
      s.pauseRequested ||
      s.story?.close ||
      (!NODES.some((n) => n.id === order.target) &&
        !s.buildings.some((b) => b.id === order.target && !b.complete))
    )
      return;
    return Math.hypot(order.x - v.x, order.y - v.y) > 15
      ? offer('move', 10, 0.15, {})
      : choices(s).find((a) => a.action === 'work');
  },
  startWork: (s, v, prior, a, d) => {
    const current = shortPublicHost.work(s, v, prior);
    if (!current || JSON.stringify(current) !== JSON.stringify(a) || !begin(v.person, a, d)) return false;
    v.order = structuredClone(prior) as NonNullable<Villager['order']>;
    v.actionUntil = s.tick + Math.ceil(a.duration / BODY_MINUTES);
    v.recoveryUntil = 0;
    v.task = a.action === 'move' ? `moving to ${taskLabel(v.order.target)}` : taskLabel(v.order.target);
    v.status =
      a.action === 'move' ? 'moving' : v.person.activity?.protest ? 'working under protest' : 'working';
    v.says = d.suggestion?.says || d.narration;
    return true;
  },
  detach: (_s, v) => {
    const prior = v.order ? structuredClone(v.order) : null;
    v.order = null;
    return prior;
  },
  resume: (s, v, prior, quiet) => {
    if (prior && !v.order) {
      if (quiet) v.order = structuredClone(prior) as NonNullable<Villager['order']>;
      else assign(s, v, prior as NonNullable<Villager['order']>);
    }
  },
};

export { requireSupportedProducer };

function finishReplay(steps: Generator<number, State, void>): State {
  for (;;) {
    const result = steps.next();
    if (result.done) return result.value;
  }
}
export function replay(
  seed: number,
  inputs: Input[],
  tick: number,
  chapter?: Chapter,
  config?: SettlementConfig,
): State {
  const s = createGame(seed, chapter, config);
  let previous = -1;
  if (!Array.isArray(inputs) || inputs.length > 10000 || !Number.isInteger(tick) || tick < 0 || tick > 10000)
    throw new Error('Invalid replay bounds');
  for (const input of inputs) {
    if (!Number.isInteger(input.tick) || input.tick < previous || input.tick > tick)
      throw new Error('Invalid replay input');
    while (s.tick < input.tick) {
      const before = s.tick;
      step(s);
      if (s.tick === before) throw new Error('Replay cannot advance this stopped run.');
    }
    apply(s, input.command);
    previous = input.tick;
  }
  while (s.tick < tick) {
    const before = s.tick;
    step(s);
    if (s.tick === before) throw new Error('Replay cannot advance this stopped run.');
  }
  return s;
}
export function importRun(raw: unknown): State {
  return finishReplay(importRunSteps(raw));
}
/** Same validators and native steps, with an event-loop boundary between ticks. */
export async function importRunAsync(
  raw: unknown,
  options: {
    signal?: AbortSignal;
    progress?: (tick: number) => void;
  } = {},
): Promise<State> {
  options.signal?.throwIfAborted();
  requireCurrentRun(raw);
  const candidate = structuredClone(raw);
  const { validateArchiveOffThread } = await import('./validation-client.ts');
  await validateArchiveOffThread(candidate, options);
  const steps = importRunSteps(candidate, true);
  let until = performance.now() + 12;
  for (;;) {
    options.signal?.throwIfAborted();
    const result = steps.next();
    if (result.done) return result.value;
    if (performance.now() >= until) {
      options.progress?.(result.value);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      until = performance.now() + 12;
    }
  }
}
