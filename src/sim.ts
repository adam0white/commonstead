import {
  type Affordance,
  begin,
  createPerson,
  decide,
  finish,
  type Person,
  perceive,
  readPerson,
  tick as tickPerson,
} from '@adam0white/human-framework';
import { canonicalPersona } from '@adam0white/lab-client';
import { CAST, DISCOVERIES, openingProfile } from './cast.ts';
import { admissionLine, assignmentText, nextTask, residentName } from './display.ts';
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
  applySettlement,
  initSettlement,
  LONG_ROOF_RETURN,
  type LongRoofAttempt,
  longRoofUnavailable,
  requestLongRoof,
  type Settlement,
  type SettlementConfig,
  stepSettlement,
  validateReply,
} from './settlement.ts';
import {
  activePeer,
  hasReplies,
  PEER_EDITION,
  type PeerCommand,
  validatePeer,
} from './settlement-dialogue.ts';
import { REPLIES, REPLY_EDITION, type ReplyBranch } from './settlement-scenes.ts';

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
function makeVillager(seed: number, n: number): Villager {
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
    person: createPerson({
      id: entry?.castId ?? `commonstead.episode.${seed}.${n}`,
      name,
      seed: (seed + n * 997) >>> 0,
      now: START_MINUTE,
      bornAt: START_MINUTE - (entry?.age ?? 30) * 365 * 1440,
      sex: entry?.sex ?? 'female',
      ...(entry ? openingProfile(entry) : {}),
      body: { satiety: 0.95, hydration: 0.98, fitness: 0.35, sleepPressure: 0.05 },
      voices: [{ voiceId: 'commander', trust: 0.7 }],
      enable: { suggestionReasons: true },
      lexicon: { plainEnglish: true },
    }),
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
  if (rules !== undefined && (rules !== PRESSURE || config)) throw new Error('Invalid rules');
  const villagers = Array.from({ length: 8 }, (_, i) => makeVillager(seed, i + 1));
  if (chapter) {
    checkChapter(chapter);
    for (const v of villagers) {
      const input = chapter.inputs.find((i) => i.parent.castId === v.person.id);
      const expected = input ? admitResident(input, v.person) : v.person;
      if (canonicalPersona(chapter.initial[v.person.id]) !== canonicalPersona(expected))
        throw new Error('Pinned initial actor differs from semantic admission.');
      v.person = structuredClone(expected);
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
  if (kind === 'meal') s.resources.food -= 2;
  const a =
    kind === 'rest'
      ? offer('rest', 35, 0, { rest: 0.65 }, ['rest'])
      : offer('eat', 8, 0, { food: 0.7, water: 0.8 }, ['rest']);
  const r = decide(v.person, [a]);
  begin(v.person, a, r);
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
  begin(v.person, a, r);
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
  if (s.shortYield) {
    if (!['pause-chapter', 'resume-chapter'].includes(c.kind))
      throw new Error('The residents have the remaining day. Further work requests are closed.');
    exactKeys(c, ['kind']);
    if (s.inputs.length >= 10000) throw new Error('The run input limit has been reached.');
  }
  if (c.kind === 'peer') validatePeer(s, c);
  if (s.settlement && hasReplies(s.settlement.config.edition)) {
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
  } else if (c.kind === 'reply') throw new Error('Replies require the fresh reply edition.');
  if (s.ended && c.kind !== 'pause-chapter') return;
  if (s.chapterPaused && c.kind !== 'resume-chapter') return;
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
  if (c.target === 'listen' || c.target === 'collaborate') {
    if (selected.length !== 1) {
      s.message = 'Invite one person to talk during a chosen break.';
      return;
    }
    const v = selected[0];
    if (!v) return;
    const scene = DISCOVERIES[Number(v.id.slice(1)) - 1];
    if (
      !scene ||
      !v.invitedBreak ||
      v.recoveryUntil <= s.tick ||
      s.tick < 60 ||
      s.tick - v.breakStarted < 5
    ) {
      s.message =
        'Spend a minute together. Then offer a break and wait five seconds. You can then invite a private conversation. Talking is optional.';
      return;
    }
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
    } else if (c.target === 'collaborate' && v.discovery === 1) {
      v.discovery = 2;
      v.says = scene[1];
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
    const arrival = makeVillager(s.seed, s.villagers.length + 1);
    tickPerson(arrival.person, START_MINUTE + s.tick * BODY_MINUTES);
    s.villagers.push(arrival);
    s.trainingUntil = null;
    s.message = `${residentName(arrival)} has joined the workshop today.`;
  }
  for (const v of s.villagers) {
    tickPerson(v.person, START_MINUTE + s.tick * BODY_MINUTES);
    if (v.availableAt === s.tick && v.status.startsWith('attending own routine'))
      v.status = 'available for agreed light tasks';
    if (v.recoveryUntil) {
      if (s.tick < v.recoveryUntil) continue;
      const action = v.person.activity?.action;
      const roofRest = activeRoofBreak(s, v.id);
      if (v.person.activity)
        finish(v.person, {
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
      v.recoveryUntil = 0;
      v.actionUntil = 0;
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
      if (shelter && roof?.stage === 'roof') beginRoofRest(s, v, roof);
      continue;
    }
    if (v.person.activity?.action === 'move') {
      interrupt(v);
      chooseWork(s, v);
      continue;
    }
    const capacity =
      readPerson(v.person).body.capacity *
      (v.person.activity?.protest ? (s.rules ? 0.6 : 0.75) : 1) *
      (s.rules ? workPace(v) : 1);
    const node = NODES.find((n) => n.id === v.order?.target);
    if (node) s.resources[node.kind] += (s.rules && node.kind === 'food' ? 0.25 : 0.52) * capacity;
    const b = s.buildings.find((b) => b.id === v.order?.target);
    if (b && !b.complete) {
      b.progress = Math.min(
        1,
        b.progress + capacity / (b.kind === 'house' ? 35 : s.rules ? STORE_EFFORT : 180),
      );
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
    cancelRoofBreak(s);
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
  if (!active || !s.shortYield) return 0;
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
export function replay(
  seed: number,
  inputs: Input[],
  tick: number,
  chapter?: Chapter,
  config?: SettlementConfig,
  allowYield = false,
  rules?: typeof PRESSURE,
  allowRoof = false,
  allowLongRoof = false,
): State {
  const limit = config ? 1800 : 600;
  if (!Number.isInteger(tick) || tick < 0 || tick > limit || !Array.isArray(inputs) || inputs.length > 10000)
    throw new Error('Invalid replay bounds');
  if (!allowLongRoof && inputs.some((i) => i?.command?.kind === 'long-roof-break-return'))
    throw new Error('Long roof command requires its native extension');
  if (!allowRoof && inputs.some((i) => i?.command?.kind === 'roof-break-return'))
    throw new Error('Roof command requires its native extension');
  if (!allowYield && inputs.some((i) => i?.command?.kind === 'yield-day'))
    throw new Error('Yield command in legacy schema');
  if (!hasReplies(config?.edition ?? '') && inputs.some((i) => i?.command?.kind === 'reply'))
    throw new Error('Reply command in legacy edition');
  if (config?.edition !== PEER_EDITION && inputs.some((i) => i?.command?.kind === 'peer'))
    throw new Error('Peer command in legacy edition');
  const s = createGame(seed, chapter, config, rules);
  let previous = -1;
  for (const input of inputs) {
    if (allowLongRoof) {
      exactKeys(input, ['tick', 'command']);
      if (input.command.kind === 'long-roof-break-return')
        validateRoofCommand({ ...input.command, kind: 'roof-break-return' });
      else validateLongBaseInput(input.command);
    }
    if (allowYield || rules) {
      exactKeys(input, ['tick', 'command']);
      validateShortInput(input.command, allowRoof);
    }
    if (hasReplies(config?.edition ?? '')) {
      exactKeys(input, ['tick', 'command']);
    }
    if (
      !Number.isInteger(input.tick) ||
      input.tick < previous ||
      input.tick > tick ||
      input.tick < 0 ||
      (input.tick >= limit && input.command.kind !== 'pause-chapter')
    )
      throw new Error('Invalid replay input tick');
    while (s.tick < input.tick) {
      const before = s.tick;
      step(s);
      if (before === s.tick) throw new Error('Replay advances a paused chapter');
    }
    apply(s, input.command);
    previous = input.tick;
  }
  while (s.tick < tick) {
    const before = s.tick;
    step(s);
    if (before === s.tick) throw new Error('Replay advances a paused chapter');
  }
  return s;
}
export function exportRun(s: State, compact = false): unknown {
  if (s.longRoofBreak)
    return {
      schema: 10,
      framework: '3.0.0',
      rules: LONG_ROOF_RETURN,
      ...(s.chapter ? { chapter: structuredClone(s.chapter) } : {}),
      config: structuredClone(s.settlement!.config),
      extension: { version: LONG_ROOF_RETURN },
      seed: s.seed,
      tick: s.tick,
      inputs: structuredClone(s.inputs),
      hash: stateHash(s),
      ...(compact ? { compact: true } : { state: JSON.parse(JSON.stringify(s)) }),
    };
  if (s.roofBreak)
    return {
      schema: 9,
      framework: '3.0.0',
      rules: ROOF_RETURN,
      baseRules: PRESSURE,
      extension: { version: ROOF_RETURN },
      chapter: structuredClone(s.chapter),
      seed: s.seed,
      tick: s.tick,
      inputs: structuredClone(s.inputs),
      hash: stateHash(s),
      ...(compact ? { compact: true } : { state: structuredClone(s) }),
    };
  if (s.rules)
    return {
      schema: 8,
      framework: '3.0.0',
      rules: s.rules,
      chapter: structuredClone(s.chapter),
      seed: s.seed,
      tick: s.tick,
      inputs: structuredClone(s.inputs),
      hash: stateHash(s),
      ...(compact ? { compact: true } : { state: structuredClone(s) }),
    };
  if (s.shortYield)
    return {
      schema: 7,
      framework: '3.0.0',
      chapter: structuredClone(s.chapter),
      seed: s.seed,
      tick: s.tick,
      inputs: structuredClone(s.inputs),
      hash: stateHash(s),
      extension: { version: s.shortYield.version, cutover: s.shortYield.cutover },
      ...(compact ? { compact: true } : { state: structuredClone(s) }),
    };
  if (s.settlement)
    return {
      schema:
        s.settlement.config.edition === PEER_EDITION
          ? 6
          : s.settlement.config.edition === REPLY_EDITION
            ? 5
            : 4,
      framework: '3.0.0',
      ...(s.chapter ? { chapter: structuredClone(s.chapter) } : {}),
      config: structuredClone(s.settlement.config),
      seed: s.seed,
      tick: s.tick,
      inputs: structuredClone(s.inputs),
      hash: stateHash(s),
      ...(compact
        ? { compact: true }
        : {
            state: hasReplies(s.settlement.config.edition)
              ? JSON.parse(JSON.stringify(s))
              : structuredClone(s),
          }),
    };
  return {
    schema: 3,
    framework: '3.0.0',
    chapter: structuredClone(s.chapter),
    seed: s.seed,
    tick: s.tick,
    inputs: structuredClone(s.inputs),
    state: structuredClone(s),
    hash: stateHash(s),
  };
}
export function importRun(raw: unknown): State {
  try {
    if (!raw || typeof raw !== 'object') throw new Error('format');
    if ((raw as { schema?: unknown }).schema === 10) return importLongRoof(raw);
    if ((raw as { schema?: unknown }).schema === 9) return importRoofBreak(raw);
    if ((raw as { schema?: unknown }).schema === 7) return importShortYield(raw);
    if ((raw as { schema?: unknown }).schema === 8) return importPressure(raw);
    const r = raw as {
      chapter: Chapter | null;
      schema: number;
      config?: SettlementConfig;
      compact?: boolean;
      framework: string;
      seed: number;
      tick: number;
      inputs: Input[];
      state: State;
      hash: string;
    };
    if (
      r.framework !== '3.0.0' ||
      ![3, 4, 5, 6].includes(r.schema) ||
      (r.schema === 4 &&
        (!r.config || Object.keys(r.config).length !== 1 || r.config.edition !== 'settlement-day/1')) ||
      (r.schema === 5 &&
        (!r.config || Object.keys(r.config).length !== 1 || r.config.edition !== REPLY_EDITION)) ||
      (r.schema === 6 &&
        (!r.config || Object.keys(r.config).length !== 1 || r.config.edition !== PEER_EDITION)) ||
      (r.schema === 3 && r.config)
    )
      throw new Error('version');
    if (r.schema === 5 || r.schema === 6) {
      requireJson(raw);
      exactKeys(
        raw,
        [
          'schema',
          'framework',
          'config',
          'seed',
          'tick',
          'inputs',
          'hash',
          r.compact === true ? 'compact' : 'state',
        ],
        ['chapter'],
      );
      if (r.compact !== undefined && r.compact !== true) throw new Error('compact');
    }
    const s = replay(r.seed, r.inputs, r.tick, r.chapter ?? undefined, r.schema >= 4 ? r.config : undefined);
    if (
      (r.compact !== true && stable(s) !== stable(r.state)) ||
      (r.compact === true && (![4, 5, 6].includes(r.schema) || r.state !== undefined)) ||
      stateHash(s) !== r.hash
    )
      throw new Error('state mismatch');
    return s;
  } catch {
    throw new Error(
      'This file does not replay the same way in this version of Commonstead. It may come from an older version. The file was not loaded. Start a new game instead.',
    );
  }
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

function requireJson(value: unknown): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    for (const v of value) requireJson(v);
    return;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const v of Object.values(value)) requireJson(v);
    return;
  }
  throw new Error('Only complete JSON data is accepted in reply notebooks');
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

/** Closed native schema; archive ownership metadata is validated by Continuity separately. */
function importShortYield(raw: unknown): State {
  requireShortJson(raw);
  if (JSON.stringify(raw).length > 20_000_000) throw new Error('Oversized short run');
  const r = raw as Record<string, unknown>;
  exactKeys(r, [
    'schema',
    'framework',
    'chapter',
    'seed',
    'tick',
    'inputs',
    'hash',
    'extension',
    r.compact === true ? 'compact' : 'state',
  ]);
  if (r.framework !== '3.0.0' || (r.compact !== undefined && r.compact !== true)) throw new Error('version');
  exactKeys(r.extension, ['version', 'cutover']);
  if (
    r.extension.version !== 'short-yield/1' ||
    !Number.isSafeInteger(r.extension.cutover) ||
    (r.extension.cutover as number) < 0 ||
    (r.extension.cutover as number) >= 600
  )
    throw new Error('cutover');
  if (r.chapter !== null) checkChapter(r.chapter as Chapter);
  const inputs = r.inputs as Input[];
  if (!Array.isArray(inputs) || inputs.length > 10000) throw new Error('inputs');
  const yields = inputs.filter((i) => i?.command?.kind === 'yield-day');
  if (yields.length !== 1 || yields[0]?.tick !== r.extension.cutover) throw new Error('cutover');
  const s = replay(
    r.seed as number,
    inputs,
    r.tick as number,
    (r.chapter as Chapter | null) ?? undefined,
    undefined,
    true,
  );
  if (
    !s.shortYield ||
    stable(s.inputs) !== stable(inputs) ||
    stable({ version: s.shortYield.version, cutover: s.shortYield.cutover }) !== stable(r.extension) ||
    stateHash(s) !== r.hash ||
    (r.compact !== true && stable(s) !== stable(r.state))
  )
    throw new Error('state mismatch');
  return s;
}

/** Closed native schema 8: the default short chapter under `pressure/1`. */
function importPressure(raw: unknown): State {
  requireShortJson(raw);
  if (JSON.stringify(raw).length > 20_000_000) throw new Error('Oversized run');
  const r = raw as Record<string, unknown>;
  exactKeys(r, [
    'schema',
    'framework',
    'rules',
    'chapter',
    'seed',
    'tick',
    'inputs',
    'hash',
    r.compact === true ? 'compact' : 'state',
  ]);
  if (r.framework !== '3.0.0' || r.rules !== PRESSURE || (r.compact !== undefined && r.compact !== true))
    throw new Error('version');
  if (r.chapter !== null) checkChapter(r.chapter as Chapter);
  const inputs = r.inputs as Input[];
  if (!Array.isArray(inputs) || inputs.length > 10000) throw new Error('inputs');
  const s = replay(
    r.seed as number,
    inputs,
    r.tick as number,
    (r.chapter as Chapter | null) ?? undefined,
    undefined,
    false,
    PRESSURE,
  );
  if (
    stable(s.inputs) !== stable(inputs) ||
    stateHash(s) !== r.hash ||
    (r.compact !== true && stable(s) !== stable(r.state))
  )
    throw new Error('state mismatch');
  return s;
}

function importRoofBreak(raw: unknown): State {
  requireShortJson(raw);
  if (JSON.stringify(raw).length > 20_000_000) throw new Error('Oversized run');
  const r = raw as Record<string, unknown>;
  exactKeys(r, [
    'schema',
    'framework',
    'rules',
    'baseRules',
    'extension',
    'chapter',
    'seed',
    'tick',
    'inputs',
    'hash',
    r.compact === true ? 'compact' : 'state',
  ]);
  exactKeys(r.extension, ['version']);
  if (
    r.framework !== '3.0.0' ||
    r.rules !== ROOF_RETURN ||
    r.baseRules !== PRESSURE ||
    r.extension.version !== ROOF_RETURN ||
    (r.compact !== undefined && r.compact !== true)
  )
    throw new Error('version');
  if (r.chapter !== null) checkChapter(r.chapter as Chapter);
  const s = replay(
    r.seed as number,
    r.inputs as Input[],
    r.tick as number,
    (r.chapter as Chapter | null) ?? undefined,
    undefined,
    false,
    PRESSURE,
    true,
  );
  if (
    !s.roofBreak ||
    stable(s.inputs) !== stable(r.inputs) ||
    stateHash(s) !== r.hash ||
    (r.compact !== true && stable(s) !== stable(r.state))
  )
    throw new Error('state mismatch');
  return s;
}
function validateShortInput(raw: unknown, allowRoof = false): void {
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
    c.ids.some((id) => typeof id !== 'string' || !/^v[1-9][0-9]?$/.test(id))
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

/** Closed schema10, independently named from pressure/1 and the old supported passports. */
function importLongRoof(raw: unknown): State {
  requireShortJson(raw);
  if (JSON.stringify(raw).length > 20_000_000) throw new Error('Oversized run');
  const r = raw as Record<string, unknown>;
  exactKeys(
    r,
    [
      'schema',
      'framework',
      'rules',
      'config',
      'extension',
      'seed',
      'tick',
      'inputs',
      'hash',
      r.compact === true ? 'compact' : 'state',
    ],
    ['chapter'],
  );
  if (r.chapter !== undefined && r.chapter !== null) checkChapter(r.chapter as Chapter);
  exactKeys(r.extension, ['version']);
  exactKeys(r.config, ['edition']);
  if (
    r.framework !== '3.0.0' ||
    r.rules !== LONG_ROOF_RETURN ||
    r.extension.version !== LONG_ROOF_RETURN ||
    (r.compact !== undefined && r.compact !== true)
  )
    throw new Error('version');
  const s = replay(
    r.seed as number,
    r.inputs as Input[],
    r.tick as number,
    (r.chapter as Chapter | null) ?? undefined,
    r.config as SettlementConfig,
    false,
    undefined,
    false,
    true,
  );
  if (
    !s.longRoofBreak ||
    stable(s.inputs) !== stable(r.inputs) ||
    stateHash(s) !== r.hash ||
    (r.compact !== true && stable(s) !== stable(r.state))
  )
    throw new Error('state mismatch');
  return s;
}

/** Shape validation only: base-day targets can already be complete or refused. Their ordinary
 * apply contract decides that at the recorded tick, after replay advances to that tick. */
function validateLongBaseInput(raw: unknown): void {
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
    c.ids.some((id) => !/^v[1-8]$/.test(id))
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
