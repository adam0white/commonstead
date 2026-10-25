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
import { admissionLine, assignmentText, nextTask } from './display.ts';
import { admitResident, type Chapter, checkChapter, lifeAdmission } from './passport.ts';

export function taskLabel(target: string): string {
  return (
    {
      food: 'meals',
      wood: 'prepared boards',
      stone: 'ballast bags',
      house: 'guest cabin',
      storehouse: 'storehouse',
    }[target] ?? target
  );
}

export type Resource = 'food' | 'wood' | 'stone';
export type Command =
  | { kind: 'order'; ids: string[]; target: string; x?: number; y?: number }
  | { kind: 'build'; ids: string[]; building: 'house' | 'storehouse'; x: number; y: number }
  | { kind: 'train' }
  | { kind: 'pause-chapter' }
  | { kind: 'resume-chapter' };
export type Input = { tick: number; command: Command };
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
export type State = {
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
    assignment: entry?.work ?? 'They help with light tasks using prepared materials.',
    lifeLine: '',
    availableAt: 0,
    role:
      entry?.role ??
      'They are a helper for this game. They have learned only light tasks using prepared materials.',
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
    }),
    task: 'idle',
    says: 'We use prepared boards, small ballast bags and hand tools. We do not use powered tools or change the building structure.',
    order: null,
    recoveryUntil: 0,
    actionUntil: 0,
    status: 'waiting',
  };
}
export function createGame(seed: number, chapter?: Chapter): State {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid seed');
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
        v.assignment = assignmentText(facts.assignment);
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
  return {
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
function recover(s: State, v: Villager, kind: 'rest' | 'meal', automatic = false) {
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
  if (v.order?.target === order.target && v.order.x === order.x && v.order.y === order.y) return;
  v.order = order;
  if (order.target === 'move') v.recoveryUntil = 0;
  if (v.recoveryUntil > s.tick) {
    v.status = `${v.task}; then ${order.target}`;
    return;
  }
  chooseWork(s, v);
}
export function apply(s: State, c: Command): void {
  if (s.ended && c.kind !== 'pause-chapter') return;
  if (s.chapterPaused && c.kind !== 'resume-chapter') return;
  s.inputs.push({ tick: s.tick, command: structuredClone(c) });
  if (c.kind === 'pause-chapter') {
    s.pauseRequested = true;
    s.chapterPaused = s.villagers.every((v) => !v.person.activity);
    s.message = s.chapterPaused
      ? 'This chapter is paused so people can leave. They still have their earlier obligations.'
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
    s.message =
      'Wait until everyone has finished their current action. Then resume the chapter before giving new work orders.';
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
      s.message = 'You need 35 meal units to feed a helper while they learn the light tasks.';
      return;
    }
    s.resources.food -= 35;
    s.trainingUntil = s.tick + 15;
    s.message =
      'A local helper will finish learning the light tasks in 15 seconds. This does not give them a trade qualification.';
    return;
  }
  const selected = s.villagers.filter((v) => c.ids.includes(v.id));
  if (!selected.length) {
    s.message = 'Select at least one person.';
    return;
  }
  if (selected.some((v) => s.tick < v.availableAt)) {
    s.message =
      'A selected resident is following their usual routine until 0:30. They still have their usual job and obligations.';
    return;
  }
  if (c.kind === 'build') {
    const wood = c.building === 'house' ? 40 : 180;
    const stone = c.building === 'house' ? 0 : 120;
    if (
      !Number.isFinite(c.x) ||
      !Number.isFinite(c.y) ||
      c.x < 55 ||
      c.x > 945 ||
      c.y < 55 ||
      c.y > 645 ||
      [...s.buildings, ...NODES].some((b) => Math.hypot(b.x - c.x, b.y - c.y) < 90)
    ) {
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
      assign(s, v, {
        target: b.id,
        x: b.x + 18 * Math.cos(Number(v.id.slice(1)) * 2.4),
        y: b.y + 18 * Math.sin(Number(v.id.slice(1)) * 2.4),
      });
    s.message = `${selected.map((v) => v.name).join(', ')} will prepare the ${taskLabel(c.building)}.`;
    return;
  }
  if (c.target === 'rest' || c.target === 'meal') {
    if (c.target === 'meal' && s.resources.food < selected.length * 2) {
      s.message = 'A meal needs 2 meal units per person.';
      return;
    }
    for (const v of selected) {
      recover(s, v, c.target);
      v.invitedBreak = true;
      v.breakStarted = s.tick;
    }
    s.message =
      c.target === 'rest'
        ? 'They will rest here for 35 seconds. Then they will return to their tasks.'
        : 'They will eat and drink here. Then they will return to their tasks.';
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
  if (c.target === 'push') {
    for (const v of selected)
      if (v.order) {
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
  for (const v of selected)
    assign(s, v, {
      target: c.target,
      x: Math.max(20, Math.min(980, x + (target ? 18 * Math.cos(Number(v.id.slice(1)) * 2.4) : 0))),
      y: Math.max(20, Math.min(680, y + (target ? 18 * Math.sin(Number(v.id.slice(1)) * 2.4) : 0))),
    });
  s.message = `${selected.map((v) => v.name).join(', ')} will ${c.target === 'move' ? 'move to the selected place' : `start ${nextTask(c.target, s.buildings)}`}.`;
}
export function step(s: State): void {
  if (s.ended || s.chapterPaused) return;
  s.tick++;
  if (s.trainingUntil !== null && s.tick >= s.trainingUntil) {
    const arrival = makeVillager(s.seed, s.villagers.length + 1);
    tickPerson(arrival.person, START_MINUTE + s.tick * BODY_MINUTES);
    s.villagers.push(arrival);
    s.trainingUntil = null;
    s.message = `${s.villagers.at(-1)?.name} has joined the workshop for this episode.`;
  }
  for (const v of s.villagers) {
    tickPerson(v.person, START_MINUTE + s.tick * BODY_MINUTES);
    if (v.availableAt === s.tick && v.status.startsWith('attending own routine'))
      v.status = 'available for agreed light tasks';
    if (v.recoveryUntil) {
      if (s.tick < v.recoveryUntil) continue;
      const action = v.person.activity?.action;
      if (v.person.activity)
        finish(v.person, {
          affordanceId: v.person.activity.affordanceId,
          action: v.person.activity.action,
          at: v.person.now,
          status: 'completed',
          needs: action === 'eat' ? { food: 0.7, water: 0.8 } : action === 'drink' ? { water: 0.8 } : {},
          summary: `I finished ${action === 'rest' ? 'resting' : action === 'eat' ? 'eating' : 'drinking'}. I am returning to my task.`,
        });
      v.recoveryUntil = 0;
      v.actionUntil = 0;
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
    if (v.order.target === 'move') {
      interrupt(v);
      v.order = null;
      v.task = 'idle';
      v.status = 'waiting';
      v.says = 'I am here.';
      continue;
    }
    if (v.person.activity?.action === 'move') {
      interrupt(v);
      chooseWork(s, v);
      continue;
    }
    const capacity = readPerson(v.person).body.capacity * (v.person.activity?.protest ? 0.75 : 1);
    const node = NODES.find((n) => n.id === v.order?.target);
    if (node) s.resources[node.kind] += 0.52 * capacity;
    const b = s.buildings.find((b) => b.id === v.order?.target);
    if (b && !b.complete) {
      b.progress = Math.min(1, b.progress + capacity / (b.kind === 'house' ? 35 : 180));
      if (b.progress === 1) {
        b.complete = true;
        s.message = `The ${taskLabel(b.kind)} is finished. ${b.kind === 'storehouse' ? 'The shared supplies are ready for the storm.' : 'There is room for two more people.'}`;
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
    s.message = 'Everyone has finished their current action. This chapter is paused so people can leave.';
  }
  if (s.tick === 480) s.message = 'The storm will arrive in two minutes. Finish the storehouse.';
  if (s.tick === 600) {
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
  }
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
export function replay(seed: number, inputs: Input[], tick: number, chapter?: Chapter): State {
  if (!Number.isInteger(tick) || tick < 0 || tick > 600 || !Array.isArray(inputs) || inputs.length > 10000)
    throw new Error('Invalid replay bounds');
  const s = createGame(seed, chapter);
  let previous = -1;
  for (const input of inputs) {
    if (
      !Number.isInteger(input.tick) ||
      input.tick < previous ||
      input.tick > tick ||
      input.tick < 0 ||
      (input.tick >= 600 && input.command.kind !== 'pause-chapter')
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
export function exportRun(s: State): unknown {
  return {
    schema: 3,
    framework: '2.18.0',
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
    const r = raw as {
      chapter: Chapter | null;
      schema: number;
      framework: string;
      seed: number;
      tick: number;
      inputs: Input[];
      state: State;
      hash: string;
    };
    if (r.schema !== 3 || r.framework !== '2.18.0') throw new Error('version');
    const s = replay(r.seed, r.inputs, r.tick, r.chapter ?? undefined);
    if (stable(s) !== stable(r.state) || stateHash(s) !== r.hash) throw new Error('state mismatch');
    return s;
  } catch {
    throw new Error(
      'This file does not replay the same way in this version of Commonstead. It may come from an older version. The file was not loaded. Start a new game instead.',
    );
  }
}
