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

export type Resource = 'food' | 'wood' | 'stone';
export type Command =
  | { kind: 'order'; ids: string[]; target: string; x?: number; y?: number }
  | { kind: 'build'; ids: string[]; building: 'house' | 'storehouse'; x: number; y: number }
  | { kind: 'train' };
export type Input = { tick: number; command: Command };
type Order = { target: string; x: number; y: number };
export type Villager = {
  id: string;
  name: string;
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
const names = ['Amina', 'Yusuf', 'Meryem', 'Idris', 'Leyla', 'Samir', 'Hana', 'Omar', 'Nura'];
function makeVillager(seed: number, n: number): Villager {
  const id = `v${n}`;
  const name = names[(n - 1) % names.length] ?? `Villager ${n}`;
  return {
    id,
    name,
    x: 450 + ((n - 1) % 3) * 42,
    y: 425 + Math.floor((n - 1) / 3) * 35,
    person: createPerson({
      id,
      name,
      seed: (seed + n * 997) >>> 0,
      now: START_MINUTE,
      bornAt: -25 * 365 * 1440,
      sex: n % 2 ? 'female' : 'male',
      traits: { conscientiousness: 0.5 + (n % 3) * 0.12, agreeableness: 0.45 + (n % 2) * 0.2 },
      body: { satiety: 0.95, hydration: 0.98, fitness: 0.25 + (n % 3) * 0.1, sleepPressure: 0.05 },
      voices: [{ voiceId: 'commander', trust: 0.7 }],
      enable: { suggestionReasons: true },
    }),
    task: 'idle',
    says: 'Ready to help.',
    order: null,
    recoveryUntil: 0,
    actionUntil: 0,
    status: 'waiting',
  };
}
export function createGame(seed: number): State {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid seed');
  return {
    seed,
    trainingUntil: null,
    tick: 0,
    resources: { food: 100, wood: 80, stone: 0 },
    villagers: Array.from({ length: 5 }, (_, i) => makeVillager(seed, i + 1)),
    buildings: [{ id: 'town', kind: 'town', x: 500, y: 350, progress: 1, complete: true }],
    inputs: [],
    message: 'Raise a storehouse before the storm at 10:00.',
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
      summary: 'Changed my task.',
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
  v.status = `${v.task}; then ${v.order?.target ?? 'idle'}`;
  v.says =
    kind === 'rest'
      ? automatic
        ? 'I am tired. I need relief; then I will return.'
        : 'A short rest, then back to my task.'
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
  interrupt(v);
  if (v.order && Math.hypot(v.order.x - v.x, v.order.y - v.y) > 15) {
    const a = offer('move', 10, 0.15, {});
    const r = decide(v.person, [a]);
    begin(v.person, a, r);
    v.actionUntil = s.tick + 10;
    v.task = `moving to ${v.order.target}`;
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
        targetId: v.id,
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
    v.status = `${r.suggestion?.verdict === 'refused' ? 'waiting / refused; ' : ''}${v.task}; then ${v.order?.target ?? 'idle'}`;
    v.says =
      r.suggestion?.reason === 'distrust'
        ? r.suggestion.says
        : a.action === 'rest'
          ? 'I am tired. I need relief; then I will return.'
          : a.action === 'eat'
            ? 'I need to eat and drink here.'
            : 'I need water. A drink, then back to work.';
  } else {
    v.task = v.order?.target ?? 'idle';
    v.status = v.person.activity?.protest ? 'working under protest' : 'working';
    const body = readPerson(v.person).body;
    v.says = push
      ? (r.suggestion?.says ?? 'I heard you insist.')
      : s.tick >= 60 && body.perceived.fatigue > 0.35
        ? 'I am tired. My work is slower; I need relief.'
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
  if (s.ended) return;
  s.inputs.push({ tick: s.tick, command: structuredClone(c) });
  if (c.kind === 'train') {
    if (s.trainingUntil !== null) {
      s.message = 'One villager is already training.';
      return;
    }
    const cap = 7 + s.buildings.filter((b) => b.kind === 'house' && b.complete).length * 2;
    if (s.villagers.length >= cap) {
      s.message = 'More housing is needed.';
      return;
    }
    if (s.resources.food < 35) {
      s.message = 'Training needs 35 food.';
      return;
    }
    s.resources.food -= 35;
    s.trainingUntil = s.tick + 15;
    s.message = 'Training a villager: ready in 15 seconds.';
    return;
  }
  const selected = s.villagers.filter((v) => c.ids.includes(v.id));
  if (!selected.length) {
    s.message = 'Select at least one person.';
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
      s.message = 'Choose open ground, away from buildings and resource beds.';
      return;
    }
    if (s.resources.wood < wood || s.resources.stone < stone) {
      s.message = `${c.building} needs ${wood} wood${stone ? ` and ${stone} stone` : ''}.`;
      return;
    }
    if (c.building === 'storehouse' && s.buildings.some((b) => b.kind === 'storehouse')) {
      s.message = 'The storehouse is already placed.';
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
    s.message = `Build ${c.building}: ${selected.map((v) => v.name).join(', ')}.`;
    return;
  }
  if (c.target === 'rest' || c.target === 'meal') {
    if (c.target === 'meal' && s.resources.food < selected.length * 2) {
      s.message = 'A meal needs 2 food per person.';
      return;
    }
    for (const v of selected) {
      recover(s, v, c.target);
    }
    s.message =
      c.target === 'rest' ? 'Rest here for 35 seconds, then resume.' : 'Food and water here, then resume.';
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
  s.message = `${selected.map((v) => v.name).join(', ')} → ${c.target === 'move' ? 'move' : c.target}.`;
}
export function step(s: State): void {
  if (s.ended) return;
  s.tick++;
  if (s.trainingUntil !== null && s.tick >= s.trainingUntil) {
    const arrival = makeVillager(s.seed, s.villagers.length + 1);
    tickPerson(arrival.person, START_MINUTE + s.tick * BODY_MINUTES);
    s.villagers.push(arrival);
    s.trainingUntil = null;
    s.message = `${s.villagers.at(-1)?.name} has joined the settlement.`;
  }
  for (const v of s.villagers) {
    tickPerson(v.person, START_MINUTE + s.tick * BODY_MINUTES);
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
          summary: `Finished ${action}; returning to my task.`,
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
          summary: `Worked at ${v.order.target}.`,
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
        s.message = `${b.kind} completed${b.kind === 'storehouse' ? '; seed grain is ready for the storm' : '; two more housing spaces'}.`;
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
  if (s.tick === 480) s.message = 'Storm warning: two minutes remain. Finish the storehouse.';
  if (s.tick === 600) {
    s.ended = true;
    s.won = s.buildings.some((b) => b.kind === 'storehouse' && b.complete);
    s.message = s.won
      ? 'The storehouse keeps the seed grain dry. The settlement can begin again.'
      : 'The storm soaks the seed grain. The unfinished storehouse could not protect it.';
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
export function replay(seed: number, inputs: Input[], tick: number): State {
  if (!Number.isInteger(tick) || tick < 0 || tick > 600 || !Array.isArray(inputs) || inputs.length > 10000)
    throw new Error('Invalid replay bounds');
  const s = createGame(seed);
  let previous = -1;
  for (const input of inputs) {
    if (
      !Number.isInteger(input.tick) ||
      input.tick < previous ||
      input.tick > tick ||
      input.tick < 0 ||
      input.tick >= 600
    )
      throw new Error('Invalid replay input tick');
    while (s.tick < input.tick) step(s);
    apply(s, input.command);
    previous = input.tick;
  }
  while (s.tick < tick) step(s);
  return s;
}
export function exportRun(s: State): unknown {
  return {
    schema: 1,
    framework: '2.14.1',
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
      schema: number;
      framework: string;
      seed: number;
      tick: number;
      inputs: Input[];
      state: State;
      hash: string;
    };
    if (r.schema !== 1 || r.framework !== '2.14.1') throw new Error('version');
    const s = replay(r.seed, r.inputs, r.tick);
    if (stable(s) !== stable(r.state) || stateHash(s) !== r.hash) throw new Error('state mismatch');
    return s;
  } catch {
    throw new Error('Invalid run: replay state verification failed.');
  }
}
