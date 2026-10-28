import { DISCOVERIES } from './cast.ts';
import {
  type Affordance,
  begin,
  beginTogether,
  converse,
  decide,
  decideTogether,
  finish,
  perceive,
  promise,
  readPerson,
  releaseCommitment,
  reviewed,
  socialEvent,
  stageOutcome,
  tick as tickPerson,
} from './hf4';
import { blocked, MAPS, type Place, type Point, route } from './paths.ts';
import {
  activePeer,
  hasReplies,
  interruptPeer,
  PEER_EDITION,
  type PeerState,
  requestPeer,
  startPeerPair,
  stepPeer,
  witnessRoute,
} from './settlement-dialogue.ts';
import {
  REPLIES,
  type REPLY_EDITION,
  type ReplyAttempt,
  type ReplyResult,
  type ReplyScene,
  SCENES,
  type SceneId,
  sceneAllowed,
  sceneOutcome,
} from './settlement-scenes.ts';
import type { Building, Command, Resource, State, Villager } from './sim.ts';

/** Authored settlement-day/1 world only: finite stores, trips, geometry and timed scenes.
 * HF3 owns bodies, duties, attention, testimony, assent and social responses. No generic planner,
 * private-knowledge renderer, physiology, real outreach or real accessibility acceptance lives here.
 */
export const EDITION = 'settlement-day/1';
export type SettlementConfig = { edition: typeof EDITION | typeof REPLY_EDITION | typeof PEER_EDITION };
export const DAY_MINUTES = 0.8;
export type Job = {
  kind: 'gather' | 'build' | 'move' | 'map' | 'inspect' | 'scene' | 'talk' | 'spar' | 'yield' | 'story';
  target: string;
  point: Point;
  map: Place;
  partner?: string;
  sourceMap?: Place;
  phase: 'out' | 'act' | 'return';
};
type Running = {
  id: string;
  action: string;
  until: number;
  purpose: 'body' | 'travel' | 'job';
  job: Job | null;
  from: number;
};
export type ActorWorld = {
  map: Place;
  path: Point[];
  job: Job | null;
  running: Running | null;
  carried: { resource: Resource; amount: number } | null;
  pendingRequest: 'ordinary' | 'insist' | null;
  commitment: string | null;
};
export type Account = { at: number; speaker: string; listener: string; text: string };
export type Settlement = {
  config: SettlementConfig;
  peer?: PeerState;
  replyScenes?: Record<string, ReplyScene>;
  replyResults?: ReplyResult[];
  actors: Record<string, ActorWorld>;
  caches: Record<Place, Record<Resource, number>>;
  accounts: Account[];
  events: { at: number; text: string }[];
  completed: { actor: string; scene: string; at: number }[];
  storm: boolean;
  paper: number;
  dispute: [string, string] | null;
  disputeAt: number | null;
  trolley: string | null;
  routeAgreements: string[];
  records: {
    samReport: string;
    oskarCaption: string;
    letter: 'draft' | 'posted';
    grip: 'drawing' | 'restored' | 'tried';
    telescope: 'packed' | 'set' | 'observed';
  };
};
export function initSettlement(s: State, config: SettlementConfig): void {
  if (Object.keys(config).length !== 1 || (config.edition !== EDITION && !hasReplies(config.edition)))
    throw new Error('Unknown settlement edition.');
  s.settlement = {
    config: { edition: config.edition },
    ...(hasReplies(config.edition) ? { replyScenes: {}, replyResults: [] } : {}),
    ...(config.edition === PEER_EDITION ? { peer: { witnesses: [], attempts: [] } } : {}),
    actors: Object.fromEntries(
      s.villagers.map((v) => [
        v.id,
        {
          map: 'yard',
          path: [],
          job: null,
          running: null,
          carried: null,
          pendingRequest: null,
          commitment: null,
        },
      ]),
    ),
    caches: {
      yard: { food: 140, wood: 280, stone: 180 },
      quay: { food: 80, wood: 180, stone: 140 },
      courtyard: { food: 60, wood: 100, stone: 80 },
    },
    accounts: [],
    events: [],
    completed: [],
    storm: false,
    paper: 4,
    dispute: null,
    disputeAt: null,
    trolley: null,
    routeAgreements: [],
    records: {
      samReport: 'I checked the reported problem.',
      oskarCaption: 'The volunteer stayed through the storm.',
      letter: 'draft',
      grip: 'drawing',
      telescope: 'packed',
    },
  };
  for (const v of s.villagers) {
    v.says = 'We have a full day here. We can choose work, meals, sleep and our own responsibilities.';
  }
  s.message =
    'Settlement day: finish the storehouse before the storm at 20:00. The day ends tomorrow at 08:00. Remote supplies must be carried back.';
}
export function dayClock(s: State): string {
  const minute = Math.floor(480 + s.tick * DAY_MINUTES);
  return `${minute >= 1440 ? 'Tomorrow ' : ''}${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}
export const CACHE_POINT: Point = { x: 775, y: 475 };
const HOME: Point = { x: 525, y: 475 };
const PASSAGE: Point = { x: 75, y: 575 };
function world(s: State): Settlement {
  if (!s.settlement) throw new Error('Settlement not selected');
  return s.settlement;
}
function actor(s: State, v: Villager): ActorWorld {
  const a = world(s).actors[v.id];
  if (!a) throw new Error('Unpinned settlement resident');
  return a;
}
function event(s: State, text: string) {
  const w = world(s);
  w.events.push({ at: s.tick, text });
  if (w.events.length > 100) w.events.shift();
  s.message = text;
}
function affordance(
  id: string,
  action: string,
  ticks: number,
  advertises: Affordance['advertises'],
  effort = 0,
): Affordance {
  return {
    id,
    action,
    label: id,
    duration: ticks * DAY_MINUTES,
    effort,
    advertises: action === 'move' ? { autonomy: 0.3, competence: 0.2 } : advertises,
    ...(action === 'work' ? { material: 8 } : {}),
  };
}
function taskText(a: Affordance, purpose: Running['purpose'], job: Job | null): string {
  if (purpose === 'travel') return 'walking';
  if (a.action === 'work')
    return job?.kind === 'gather'
      ? `collecting ${job.target === 'wood' ? 'prepared boards' : job.target === 'stone' ? 'ballast bags' : 'meals'}`
      : 'working at the building site';
  return (
    (
      {
        rest: 'resting',
        eat: 'eating and drinking',
        drink: 'drinking',
        sleep: 'sleeping',
        pray: 'taking a quiet prayer break',
        talk: 'talking',
        spar: 'taking part in a voluntary practice bout',
        'try-grip': 'trying the restored grip',
        'share-story': 'sharing a private story',
        inspect: 'inspecting the supplies',
        yield: 'making room on the shared route',
        correction: 'correcting the old fictional record',
        visit: 'attending the arranged family visit',
        letter: 'posting the private letter',
        telescope: 'using the telescope',
        move: 'walking',
        deliver: 'returning the carried supplies',
      } as Record<string, string>
    )[a.action] ?? 'considering the requested activity'
  );
}
function jobKey(v: Villager, j: Job): string {
  return `day:${v.id}:${j.kind}:${j.target}`;
}
// The released Affordance contract permits folding travel into an activity's purpose.
// Route fragments interrupt rather than complete that purpose; only the actual world outcome keeps it.
function primaryOffer(s: State, v: Villager, travelTicks?: number): Affordance {
  const aw = actor(s, v),
    j = aw.job;
  if (!j) throw new Error('No world task');
  let a: Affordance;
  if (j.kind === 'scene') {
    const scene = SCENES[j.target as SceneId];
    a = affordance(
      j.partner ? 'try-grip' : j.target,
      j.partner ? 'try-grip' : j.target,
      scene.ticks,
      { belonging: 0.5, meaning: 0.4 },
      j.partner ? 0 : 0.1,
    );
  } else if (j.kind === 'talk' || j.kind === 'spar')
    a = {
      ...affordance(
        j.kind,
        j.kind,
        j.kind === 'spar' ? 12 : 8,
        { belonging: 0.45, leisure: j.kind === 'spar' ? 0.25 : 0 },
        j.kind === 'spar' ? 0.25 : 0,
      ),
      with: j.partner ? [s.villagers.find((v) => v.id === j.partner)?.person.id ?? j.partner] : [],
      tags: ['social'],
    };
  else if (j.kind === 'move' || j.kind === 'map') a = affordance('walk', 'move', 8, {}, 0.15);
  else if (j.kind === 'gather' && aw.carried)
    a = { ...affordance('deliver', 'deliver', 8, { competence: 0.2 }, 0.15), material: aw.carried.amount };
  else
    a = affordance(
      j.kind,
      j.kind === 'build' || j.kind === 'gather'
        ? 'work'
        : j.kind === 'story'
          ? 'share-story'
          : j.kind === 'yield'
            ? 'yield'
            : 'inspect',
      8,
      j.kind === 'story' ? { belonging: 0.5, autonomy: 0.3 } : { safety: 0.2, esteem: 0.05 },
      ['inspect', 'story', 'yield'].includes(j.kind) ? 0 : 0.6,
    );
  return {
    ...a,
    targetId: jobKey(v, j),
    ...(travelTicks === undefined
      ? {}
      : { id: travelTicks === 24 ? 'crossing' : 'walk', duration: travelTicks * DAY_MINUTES, effort: 0.15 }),
  };
}
function requestOptions(s: State, v: Villager, a: Affordance): Parameters<typeof decide>[2] {
  const aw = actor(s, v),
    pending = aw.pendingRequest;
  aw.pendingRequest = null;
  return pending
    ? {
        suggestion: {
          voiceId: 'commander',
          action: a.action,
          strength: pending === 'insist' ? 1 : 0.35,
          ...(pending === 'insist' ? { insist: true } : {}),
        },
      }
    : {};
}
function bodyChoices(s: State, v: Villager): Affordance[] {
  const options = [
    affordance('rest', 'rest', 15, { rest: 0.55 }),
    { ...affordance('sleep', 'sleep', 75, { sleep: 0.85 }), mode: 'sleep' as const },
    affordance('drink', 'drink', 3, { water: 0.8 }),
  ];
  if (s.resources.food >= 2) options.push(affordance('eat', 'eat', 6, { food: 0.75, water: 0.4 }));
  const duty = v.person.agenda.commitments.find(
    (c) =>
      c.status === 'pending' &&
      c.from <= v.person.now &&
      c.until >= v.person.now &&
      c.actions.includes('pray'),
  );
  if (duty)
    options.push({
      ...affordance('pray', 'pray', 5, {}, 0),
      tags: ['worship'],
      norms: [{ normId: 'salah', relation: 'fulfills' }],
    });
  return options;
}
function startChoice(
  s: State,
  v: Villager,
  a: Affordance,
  decision: ReturnType<typeof decide>,
  purpose: Running['purpose'],
): boolean {
  const aw = actor(s, v);
  if (a.action === 'eat' && s.resources.food < 2) return false;
  if (!begin(v.person, a, decision)) return false;
  // Only an actual voluntary assent creates this bounded host appointment. HF owns its pressure/status.
  if (
    aw.job &&
    !aw.job.target.startsWith('peer:') &&
    decision.suggestion?.verdict === 'assented' &&
    !aw.commitment
  ) {
    aw.commitment = promise(v.person, {
      kind: 'appointment',
      toId: 'commander',
      actions: [a.action],
      targetId: a.targetId,
      from: v.person.now,
      until: 1920,
      importance: 0.6,
      label: 'the agreed workshop activity',
    }).id;
  }
  if (a.action === 'eat') s.resources.food -= 2;
  aw.running = {
    id: a.id,
    action: a.action,
    until:
      a.targetId?.startsWith('peer:') && v.person.activity
        ? s.tick + Math.ceil((v.person.activity.endsAt - v.person.activity.startedAt) / DAY_MINUTES)
        : s.tick + Math.max(1, Math.round(a.duration / DAY_MINUTES)),
    purpose,
    job: aw.job ? structuredClone(aw.job) : null,
    from: s.tick,
  };
  v.task = taskText(a, purpose, aw.job);
  v.status = `is ${v.task}.`;
  v.says = decision.suggestion?.says || decision.narration;
  return true;
}
function choose(s: State, v: Villager, requested?: Affordance, purpose: Running['purpose'] = 'body'): void {
  const options = [...(requested ? [requested] : []), ...bodyChoices(s, v)];
  const decision = decide(v.person, options, requested ? requestOptions(s, v, requested) : {});
  const selected = options.find((a) => a.id === decision.chosenAffordanceId);
  if (!selected) {
    v.status = 'waiting / refused';
    v.says = decision.suggestion?.says || decision.narration;
    return;
  }
  startChoice(s, v, selected, decision, selected === requested ? purpose : 'body');
}
function go(s: State, v: Villager, point: Point): boolean {
  const aw = actor(s, v);
  const path = route(aw.map, v, point);
  if (!path) {
    v.says = 'That route is blocked. Choose open ground.';
    s.message = v.says;
    return false;
  }
  aw.path = Math.hypot(v.x - point.x, v.y - point.y) < 1 ? [] : path;
  return true;
}
function cancel(s: State, v: Villager) {
  cancelLongRoof(s, v.id);
  interruptPeer(s, v.id, 'A participant explicitly stopped the unfinished route conversation.');
  interruptReply(s, v, 'The conversation stopped before it finished.');
  const aw = actor(s, v);
  if (v.person.activity)
    finish(v.person, {
      affordanceId: v.person.activity.affordanceId,
      action: v.person.activity.action,
      at: v.person.now,
      status: 'interrupted',
      summary: 'I stopped before completing this action.',
    });
  if (world(s).trolley === v.id) world(s).trolley = null;
  if (aw.commitment) releaseCommitment(v.person, aw.commitment);
  aw.commitment = null;
  aw.pendingRequest = null;
  aw.running = null;
  aw.path = [];
  aw.job = null;
  // Carried goods stay with their carrier until an actual return, never silently become central stock.
  v.task = 'waiting';
  v.status = 'waiting';
}
function setJob(s: State, v: Villager, job: Job, roof = false): void {
  const aw = actor(s, v);
  if (
    aw.job &&
    aw.job.kind === job.kind &&
    aw.job.target === job.target &&
    aw.job.map === job.map &&
    aw.job.point.x === job.point.x &&
    aw.job.point.y === job.point.y &&
    aw.job.partner === job.partner
  )
    return;
  if (aw.carried && job.kind !== 'map') {
    s.message = 'Return these carried materials to the workshop hub first.';
    return;
  }
  if (aw.running && aw.running.purpose !== 'body') {
    s.message =
      'The resident will finish the current act before considering another request. Choose Cancel task to interrupt it.';
    return;
  }
  if (!go(s, v, aw.map === job.map ? job.point : PASSAGE)) return;
  if (!roof) cancelLongRoof(s, v.id);
  if (aw.commitment) releaseCommitment(v.person, aw.commitment);
  aw.commitment = null;
  aw.pendingRequest = 'ordinary';
  aw.job = job;
  s.message = `You asked ${v.name} ${job.kind === 'map' ? `to travel to ${MAPS[job.map].name}` : job.kind === 'scene' ? `to consider: ${SCENES[job.target as SceneId].label}` : job.kind === 'story' ? 'to share a private story' : job.kind === 'gather' ? 'to collect and return supplies' : job.kind === 'build' ? 'to work at the building site' : 'to consider the selected activity'}. This is a request, not a completed outcome.`;
  v.says = 'I will consider that request alongside my own needs and responsibilities.';
}
function spend(s: State, boards: number, meals: number, paper = 0): boolean {
  if (s.resources.wood < boards || s.resources.food < meals || world(s).paper < paper) {
    s.message = `This needs ${boards} boards, ${meals} meals and ${paper} sheets of paper from the shared store.`;
    return false;
  }
  s.resources.wood -= boards;
  s.resources.food -= meals;
  world(s).paper -= paper;
  return true;
}
export function applySettlement(s: State, c: Command): void {
  const w = world(s);
  if (c.kind === 'peer') {
    requestPeer(s, c, peerHost);
    return;
  }
  if (c.kind === 'reply') {
    requestReply(s, c);
    return;
  }
  if (c.kind === 'train') {
    s.message = 'This day follows the eight residents. No additional helpers join.';
    return;
  }
  if (c.kind === 'pause-chapter') {
    cancelLongRoof(s);
    s.pauseRequested = true;
    s.chapterPaused = s.villagers.every((v) => !v.person.activity);
    return;
  }
  if (c.kind === 'resume-chapter') {
    s.pauseRequested = false;
    s.chapterPaused = false;
    return;
  }
  if (s.pauseRequested) {
    s.message = 'Resume the chapter before giving new requests.';
    return;
  }
  const selected = s.villagers.filter((v) => c.ids.includes(v.id));
  if (!selected.length) {
    s.message = 'Select a resident first.';
    return;
  }
  if (c.kind === 'build') {
    if (
      selected.some(
        (v) =>
          actor(s, v).map !== 'yard' ||
          actor(s, v).carried ||
          (actor(s, v).running && actor(s, v).running?.purpose !== 'body'),
      )
    ) {
      s.message = 'Choose available residents in the workshop yard.';
      return;
    }
    if (
      blocked('yard', c) ||
      s.buildings.some((b) => Math.hypot(b.x - c.x, b.y - c.y) < 90) ||
      !selected.every((v) => route('yard', v, c))
    ) {
      s.message = 'The site is blocked. No materials were spent.';
      return;
    }
    if (c.building === 'storehouse' && s.buildings.some((b) => b.kind === 'storehouse')) {
      s.message = 'The storehouse already has a site.';
      return;
    }
    const boards = c.building === 'house' ? 40 : 180,
      ballast = c.building === 'house' ? 0 : 120;
    if (s.resources.wood < boards || s.resources.stone < ballast) {
      s.message = `The site needs ${boards} boards and ${ballast} ballast bags.`;
      return;
    }
    s.resources.wood -= boards;
    s.resources.stone -= ballast;
    const b = {
      id: `b${s.buildings.length}`,
      kind: c.building,
      x: c.x,
      y: c.y,
      progress: 0,
      complete: false,
    };
    s.buildings.push(b);
    for (const v of selected)
      setJob(s, v, { kind: 'build', map: 'yard', point: b, target: b.id, phase: 'out' });
    return;
  }
  if (c.kind === 'order') {
    for (const v of selected) {
      const aw = actor(s, v);
      if (c.target === 'push') {
        if (!aw.job || !['build', 'gather'].includes(aw.job.kind)) {
          s.message = 'There is no selected work to insist on.';
          continue;
        }
        cancelLongRoof(s, v.id);
        aw.pendingRequest = 'insist';
        s.message = `You asked ${v.name} to keep working. The request will be heard once at the next action boundary. It can be refused.`;
        continue;
      }
      if (['rest', 'meal'].includes(c.target)) {
        if (aw.running) {
          s.message = 'The resident is finishing an action. Cancel it explicitly or wait.';
          continue;
        }
        const a =
          c.target === 'meal'
            ? affordance('eat', 'eat', 6, { food: 0.75, water: 0.4 })
            : affordance('rest', 'rest', 15, { rest: 0.55 });
        if (a.action === 'eat' && s.resources.food < 2) {
          s.message = 'There are no shared meals available.';
          continue;
        }
        cancelLongRoof(s, v.id);
        aw.pendingRequest = 'ordinary';
        choose(s, v, a);
        continue;
      }
      if (['food', 'wood', 'stone'].includes(c.target))
        setJob(s, v, { kind: 'gather', target: c.target, map: aw.map, point: CACHE_POINT, phase: 'out' });
      else if (c.target === 'move' && Number.isFinite(c.x) && Number.isFinite(c.y))
        setJob(s, v, {
          kind: 'move',
          target: 'ground',
          map: aw.map,
          point: { x: c.x as number, y: c.y as number },
          phase: 'out',
        });
      else {
        const b = s.buildings.find((b) => b.id === c.target);
        if (b && !b.complete)
          setJob(s, v, { kind: 'build', target: b.id, map: 'yard', point: b, phase: 'out' });
      }
    }
    return;
  }
  if (c.kind !== 'settlement') return;
  if (c.action === 'cancel') {
    for (const v of selected) cancel(s, v);
    event(s, 'The selected tasks stopped. Unfinished work has no completion reward.');
    return;
  }
  if (c.action === 'talk' || c.action === 'spar') {
    if (selected.length !== 2 || selected.some((v) => actor(s, v).running?.purpose === 'job')) {
      s.message = 'Choose two available residents. Each can refuse.';
      return;
    }
    const [a, b] = selected;
    if (!a || !b || actor(s, a).map !== actor(s, b).map) {
      s.message = 'The two residents must be on the same map.';
      return;
    }
    for (const [v, partner] of [
      [a, b],
      [b, a],
    ] as const)
      setJob(s, v, {
        kind: c.action,
        target: c.action,
        partner: partner.id,
        map: actor(s, v).map,
        point: HOME,
        phase: 'out',
      });
    event(
      s,
      c.action === 'spar'
        ? 'An optional practice bout was offered. Both people may choose talk, rest or withdrawal instead.'
        : 'Two residents were invited to talk about the supplies and the shared route.',
    );
    return;
  }
  for (const v of selected) {
    const aw = actor(s, v);
    if (c.action === 'story') {
      const retained = w.replyScenes?.[v.id];
      if (retained) {
        s.message = `${v.name} already shared this story at ${retained.disclosure.at} seconds. Read it in About this resident.`;
        continue;
      }
      if (s.tick < 60) {
        s.message = 'Spend a minute together before inviting a private story.';
        continue;
      }
      setJob(s, v, {
        kind: 'story',
        target: 'share-story',
        map: aw.map,
        point: { x: v.x, y: v.y },
        phase: 'out',
      });
    } else if (c.action === 'yield') {
      if (!w.dispute?.includes(v.id)) {
        s.message = 'Only a resident in the current route dispute can offer to yield.';
        continue;
      }
      setJob(s, v, {
        kind: 'yield',
        target: `${[...w.dispute].sort().join('/')}:${w.disputeAt}`,
        map: aw.map,
        point: HOME,
        phase: 'out',
      });
    } else if (c.action === 'map' && ['yard', 'quay', 'courtyard'].includes(c.target ?? ''))
      setJob(s, v, {
        kind: 'map',
        target: c.target as string,
        map: c.target as Place,
        point: HOME,
        phase: 'out',
      });
    else if (c.action === 'inspect')
      setJob(s, v, { kind: 'inspect', target: 'cache', map: aw.map, point: CACHE_POINT, phase: 'out' });
    else if (c.action === 'scene' && c.target && c.target in SCENES) {
      const id = c.target as SceneId,
        scene = SCENES[id];
      if (!sceneAllowed(id, v.id) || v.discovery < 1) {
        s.message =
          'Learn about this resident through a willing conversation before offering this collaboration.';
        continue;
      }
      if (w.completed.some((x) => x.actor === v.id && x.scene === id)) {
        s.message = 'This resident already completed this event.';
        continue;
      }
      if (
        id === 'trial' &&
        !(selected.length === 2 && selected.some((v) => v.id === 'v1') && selected.some((v) => v.id === 'v2'))
      ) {
        s.message = 'Invite Nora and Sam together for the fictional grip trial.';
        continue;
      }
      setJob(s, v, {
        kind: 'scene',
        target: id,
        map: scene.map,
        point: scene.point,
        phase: 'out',
        ...(id === 'trial' ? { partner: v.id === 'v1' ? 'v2' : 'v1' } : {}),
      });
    }
  }
}
function observeCache(s: State, v: Villager) {
  const aw = actor(s, v),
    stock = world(s).caches[aw.map];
  perceive(v.person, [
    {
      at: v.person.now,
      channel: 'saw',
      kind: 'supplies',
      placeId: aw.map,
      salience: 0.8,
      summary: `I inspected the ${aw.map} cache.`,
      claims: [
        {
          prop: `${aw.map}:boards-remain`,
          value: stock.wood > 0,
          confidence: 1,
          origin: v.person.id,
          lineage: `${aw.map}-${s.tick}`,
        },
      ],
    },
  ]);
  event(
    s,
    `${v.name} inspects the ${aw.map} cache. Ask another resident to hear what they choose to report.`,
  );
}
function deliverConversation(s: State, a: Villager, b: Villager) {
  const w = world(s);
  for (const [speaker, listener] of [
    [a, b],
    [b, a],
  ] as const) {
    const r = converse(speaker.person, listener.person, {
      at: speaker.person.now,
      placeId: actor(s, speaker).map,
      topics: ['yard:', 'quay:', 'courtyard:'],
      provenance: true,
      phrase: (claim, summary) =>
        'value' in claim && /^(yard|quay|courtyard):boards-remain$/.test(claim.prop)
          ? `At my earlier inspection, the ${claim.prop.split(':')[0]} cache ${claim.value ? 'still had' : 'had no'} boards. This account may be out of date.`
          : summary,
    });
    perceive(listener.person, [...r.told, ...r.advice.map((a) => a.percept)]);
    for (const ev of r.socialEvents.speaker) socialEvent(speaker.person, ev);
    for (const ev of r.socialEvents.listener) socialEvent(listener.person, ev);
    for (const told of r.told) {
      // Only outward speech is public. Never render r.claims' private credence, deceit or score.
      w.accounts.push({ at: s.tick, speaker: speaker.name, listener: listener.name, text: told.summary });
    }
    if (!r.told.length)
      w.accounts.push({
        at: s.tick,
        speaker: speaker.name,
        listener: listener.name,
        text: 'They do not pass on an account of the supplies.',
      });
  }
  if (w.accounts.length > 40) w.accounts.splice(0, w.accounts.length - 40);
  event(
    s,
    `${a.name} and ${b.name} finish talking. Their accounts are dated reports, not a new count of the shared store.`,
  );
}
function pairStart(s: State, v: Villager): boolean {
  const aw = actor(s, v),
    j = aw.job;
  if (!j?.partner) return false;
  const other = s.villagers.find((v) => v.id === j.partner);
  if (!other) {
    cancel(s, v);
    return true;
  }
  const ow = actor(s, other),
    oj = ow.job;
  if (!oj || oj.partner !== v.id || oj.target !== j.target) {
    cancel(s, v);
    v.says = 'The other person is no longer taking part.';
    return true;
  }
  if (
    aw.running ||
    ow.running ||
    aw.path.length ||
    ow.path.length ||
    aw.map !== ow.map ||
    Math.hypot(v.x - other.x, v.y - other.y) > 45
  )
    return true;
  if (v.id > other.id) return true;
  if (startPeerPair(s, v, other, peerHost)) return true;
  const duration = j.kind === 'scene' ? SCENES.trial.ticks : j.kind === 'spar' ? 12 : 8;
  const action = j.kind === 'scene' ? 'try-grip' : j.kind === 'spar' ? 'spar' : 'talk';
  const request = {
    ...affordance(
      action,
      action,
      duration,
      { belonging: 0.45, leisure: j.kind === 'spar' ? 0.25 : 0 },
      j.kind === 'spar' ? 0.25 : 0,
    ),
    with: [other.person.id],
    tags: ['social'],
  };
  const optsA = [request, ...bodyChoices(s, v)],
    optsB = [{ ...request, with: [v.person.id] }, ...bodyChoices(s, other)];
  request.targetId = jobKey(v, j);
  optsB[0] = { ...request, targetId: jobKey(other, oj), with: [v.person.id] };
  const pairDecisions = decideTogether([
    { person: v.person, affordances: optsA, options: requestOptions(s, v, request) },
    { person: other.person, affordances: optsB, options: requestOptions(s, other, optsB[0] as Affordance) },
  ]);
  const da = pairDecisions[0],
    db = pairDecisions[1];
  if (!da || !db) throw new Error('Missing shared decision');
  beginTogether([v.person, other.person]);
  if (
    da.chosenAffordanceId !== action ||
    db.chosenAffordanceId !== action ||
    da.suggestion?.verdict === 'refused' ||
    db.suggestion?.verdict === 'refused'
  ) {
    for (const [p, options, d] of [
      [v, optsA, da],
      [other, optsB, db],
    ] as const) {
      cancel(s, p);
      p.says = d.suggestion?.says || d.narration;
      const selected = options.find((a) => a.id === d.chosenAffordanceId && a.id !== action);
      if (selected) startChoice(s, p, selected, decide(p.person, [selected]), 'body');
    }
    event(s, 'The shared invitation did not gain both people’s assent. No shared outcome is recorded.');
    return true;
  }
  if (j.kind === 'scene' && !spend(s, SCENES.trial.boards, 0)) {
    cancel(s, v);
    cancel(s, other);
    return true;
  }
  if (j.kind === 'scene') world(s).records.grip = 'restored';
  startChoice(s, v, request, da, 'job');
  startChoice(s, other, optsB[0] as Affordance, db, 'job');
  return true;
}
function finishJob(s: State, v: Villager, run: Running) {
  const aw = actor(s, v),
    j = run.job;
  if (!j || !aw.job) return;
  if (j.kind === 'story') {
    v.discovery = Math.max(1, v.discovery);
    v.says = DISCOVERIES[Number(v.id.slice(1)) - 1]?.[0] ?? 'I have nothing private to share.';
    event(s, `${v.name} chooses to tell you: ${v.says}`);
    if (world(s).replyScenes && ['v1', 'v7'].includes(v.id))
      world(s).replyScenes![v.id] ??= {
        disclosure: { id: `disclosure:${v.id}:${s.tick}`, at: s.tick, textId: `${v.id}:private-story` },
        attempts: [],
      };
  }
  if (j.kind === 'yield') {
    const dispute = world(s).dispute;
    if (dispute?.includes(v.id) && j.target === `${[...dispute].sort().join('/')}:${world(s).disputeAt}`) {
      world(s).routeAgreements.push([...dispute].sort().join('/'));
      world(s).dispute = null;
      world(s).disputeAt = null;
      event(s, `${v.name} yields the shared trolley route after choosing to make room.`);
    }
  }
  if (j.kind === 'gather') {
    world(s).trolley = null;
    const res = j.target as Resource,
      cache = world(s).caches[aw.map],
      amount = Math.min(cache[res], 8 * readPerson(v.person).body.capacity);
    cache[res] -= amount;
    aw.carried = { resource: res, amount };
    observeCache(s, v);
    aw.job = { ...j, phase: 'return', sourceMap: aw.map, map: 'yard', point: HOME };
    go(s, v, aw.map === 'yard' ? HOME : PASSAGE);
    return;
  }
  if (j.kind === 'build') {
    const b = s.buildings.find((b) => b.id === j.target);
    if (b && !b.complete) {
      b.progress = Math.min(
        1,
        b.progress + (readPerson(v.person).body.capacity * 8) / (b.kind === 'house' ? 35 : 180),
      );
      if (b.progress >= 1) {
        b.complete = true;
        event(s, `The ${b.kind === 'house' ? 'guest cabin' : 'storehouse'} is finished.`);
      }
    }
    if (b && !b.complete) return;
  }
  if (j.kind === 'inspect') observeCache(s, v);
  if (j.kind === 'talk' || j.kind === 'spar' || j.partner) {
    const other = s.villagers.find((v) => v.id === j.partner),
      ow = other ? actor(s, other) : null;
    if (
      !other ||
      !ow?.running ||
      ow.running.from !== run.from ||
      ow.running.until !== run.until ||
      ow.running.job?.target !== j.target
    ) {
      event(s, 'The shared activity ended without both participants completing it.');
      cancel(s, v);
      return;
    }
    if (j.kind === 'talk') {
      deliverConversation(s, v, other);
    } else if (j.kind === 'spar') {
      for (const [p, q] of [
        [v, other],
        [other, v],
      ] as const)
        socialEvent(p.person, {
          at: p.person.now,
          kind: 'shared-work',
          otherId: q.person.id,
          byMe: true,
          magnitude: 0.2,
        });
      event(
        s,
        `${v.name} and ${other.name} finish the voluntary practice bout and put the equipment down. Nobody is forced to continue. ${world(s).dispute ? 'The route dispute remains.' : 'The shared route is open.'}`,
      );
    } else {
      world(s).records.grip = 'tried';
      world(s).completed.push({ actor: other.id, scene: j.target, at: s.tick });
      event(s, sceneOutcome('trial', v.id, false));
    }
    if (other.person.activity)
      finish(other.person, {
        affordanceId: other.person.activity.affordanceId,
        action: other.person.activity.action,
        targetId: other.person.activity.targetId,
        at: other.person.now,
        status: 'completed',
        summary:
          j.kind === 'talk'
            ? 'We finished our conversation.'
            : j.kind === 'spar'
              ? 'We finished the voluntary practice bout.'
              : 'We both tried the restored grip.',
      });
    ow.running = null;
    ow.job = null;
  }
  if (j.kind === 'scene' && j.target === 'visit') {
    aw.job = { ...j, phase: 'return', map: 'yard', point: HOME };
    go(s, v, aw.map === 'yard' ? HOME : PASSAGE);
    return;
  }
  if (j.kind === 'scene') {
    const records = world(s).records;
    if (j.target === 'correction') {
      if (v.id === 'v2')
        records.samReport =
          'I did not reproduce the reported problem. My earlier claim that I checked it was inaccurate.';
      else
        records.oskarCaption = 'The volunteer went home before the storm. My earlier caption was inaccurate.';
    }
    if (j.target === 'letter') records.letter = 'posted';
    if (j.target === 'telescope') records.telescope = 'observed';
    world(s).completed.push({ actor: v.id, scene: j.target, at: s.tick });
    if (j.target !== 'trial') event(s, sceneOutcome(j.target as SceneId, v.id, s.seed % 2 === 0));
  }
  aw.job = null;
}
function runningOutcome(s: State, v: Villager, run: Running): Parameters<typeof finish>[1] {
  const aw = actor(s, v),
    activity = v.person.activity!;
  return {
    affordanceId: activity.affordanceId,
    action: activity.action,
    targetId: activity.targetId,
    at: v.person.now,
    status:
      run.purpose === 'travel' &&
      !(
        aw.job &&
        ['move', 'map'].includes(aw.job.kind) &&
        !aw.path.length &&
        aw.map === aw.job.map &&
        Math.hypot(v.x - aw.job.point.x, v.y - aw.job.point.y) < 10
      )
        ? 'interrupted'
        : 'completed',
    needs:
      run.purpose === 'travel'
        ? {}
        : run.action === 'eat'
          ? { food: 0.75, water: 0.4 }
          : run.action === 'drink'
            ? { water: 0.8 }
            : run.action === 'move'
              ? { autonomy: 0.3, competence: 0.2 }
              : run.action === 'work'
                ? { competence: 0.15 }
                : run.action === 'talk'
                  ? { belonging: 0.45 }
                  : {},
    summary:
      run.purpose === 'travel' ? 'I paused on the way to the requested activity.' : `I finished ${v.task}.`,
  };
}
export function stepSettlement(s: State): void {
  const w = world(s);
  if (s.ended || s.chapterPaused) return;
  s.tick++;
  for (const v of s.villagers) {
    const aw = actor(s, v),
      run = aw.running;
    if (v.person.activity && run && s.tick >= run.until) {
      const outcome = runningOutcome(s, v, run);
      if (run.purpose === 'job' && run.job?.partner) {
        const partner = w.actors[run.job.partner]?.running;
        if (
          !partner ||
          partner.from !== run.from ||
          partner.until !== run.until ||
          partner.job?.partner !== v.id ||
          partner.job.target !== run.job.target
        )
          outcome.status = 'failed';
      }
      stageOutcome(v.person, outcome);
    }
    const reply = latestReply(s, v);
    if (
      v.person.activity &&
      reply?.status === 'running' &&
      reply.until !== undefined &&
      s.tick >= reply.until &&
      aw.map === reply.map &&
      Math.hypot(v.x - reply.point.x, v.y - reply.point.y) <= 1 &&
      !aw.job
    )
      stageOutcome(v.person, {
        affordanceId: v.person.activity.affordanceId,
        action: 'talk',
        targetId: reply.id,
        at: 480 + s.tick * DAY_MINUTES,
        status: 'completed',
        needs: {},
        summary: REPLIES[reply.branch].says,
      });
  }
  // New edition only: catch up all actors before any shared act or hearing.
  if (w.peer) for (const v of s.villagers) tickPerson(v.person, 480 + s.tick * DAY_MINUTES);
  for (const v of s.villagers) {
    const aw = actor(s, v);
    if (!w.peer) tickPerson(v.person, 480 + s.tick * DAY_MINUTES);
    if (!v.person.body.alive) {
      cancel(s, v);
      v.status = 'has died.';
      continue;
    }
    if (stepPeer(s, v, peerHost)) continue;
    if (stepReply(s, v)) continue;
    const run = aw.running;
    if (run && s.tick >= run.until) {
      if (run.purpose === 'job' && run.job?.partner) {
        const partner = w.actors[run.job.partner]?.running;
        if (
          !partner ||
          partner.from !== run.from ||
          partner.until !== run.until ||
          partner.job?.partner !== v.id ||
          partner.job.target !== run.job.target
        ) {
          cancel(s, v);
          event(s, 'The shared activity ended without both participants completing it.');
          continue;
        }
      }
      const activity = v.person.activity;
      const report = activity ? finish(v.person, runningOutcome(s, v, run)) : undefined;
      const roof = activeLongRoof(s, v.id);
      if (roof?.stage === 'rest' && run.from === roof.restStarted) {
        if (
          activity?.action === 'rest' &&
          activity.affordanceId === roof.restActivity?.affordanceId &&
          activity.startedAt === roof.restActivity?.startedAt &&
          v.person.now >= activity.endsAt &&
          report?.status === 'completed'
        )
          roof.restCompleted = s.tick;
        else
          endLongRoof(s, roof, 'cancelled', 'The planned rest did not finish. Earlier work was not offered.');
      }
      aw.running = null;
      if (run.purpose === 'job' && report?.status === 'completed') finishJob(s, v, run);
      if (run.id === 'crossing' && run.purpose === 'travel' && aw.job) {
        aw.map = aw.job.map;
        v.x = PASSAGE.x;
        v.y = PASSAGE.y;
        go(s, v, aw.job.point);
      }
    }
    if (s.pauseRequested) continue;
    if (stepLongRoof(s, v)) continue;
    if (aw.running) {
      if (aw.running.purpose === 'travel') {
        let budget = 30 * readPerson(v.person).body.capacity;
        while (budget > 0 && aw.path.length) {
          const p = aw.path[0];
          if (!p) break;
          const d = Math.hypot(p.x - v.x, p.y - v.y);
          if (d <= budget) {
            v.x = p.x;
            v.y = p.y;
            aw.path.shift();
            budget -= d;
          } else {
            v.x += ((p.x - v.x) * budget) / d;
            v.y += ((p.y - v.y) * budget) / d;
            budget = 0;
          }
        }
      }
      continue;
    }
    if (startReply(s, v)) continue;
    const j = aw.job;
    if (aw.path.length) {
      choose(s, v, primaryOffer(s, v, 8), 'travel');
      continue;
    }
    if (j && aw.map !== j.map) {
      // Each crossing is an actual bounded journey after the resident reached the passage.
      if (Math.hypot(v.x - PASSAGE.x, v.y - PASSAGE.y) > 5) {
        go(s, v, PASSAGE);
        continue;
      }
      choose(s, v, primaryOffer(s, v, 24), 'travel');
      continue;
    }
    if (aw.carried && aw.map === 'yard' && Math.hypot(v.x - HOME.x, v.y - HOME.y) < 10) {
      s.resources[aw.carried.resource] += aw.carried.amount;
      aw.carried = null;
      const roof = activeLongRoof(s, v.id);
      if (roof) {
        roof.deliveredAt = s.tick;
        roof.stage = 'roof';
        v.says = 'I delivered the carried materials to the counted shared store.';
        continue;
      }
      const origin = aw.job?.sourceMap;
      if (aw.job?.kind === 'gather' && origin && w.caches[origin][aw.job.target as Resource] > 0) {
        aw.job = { ...aw.job, map: origin, point: CACHE_POINT, phase: 'out' };
        go(s, v, origin === 'yard' ? CACHE_POINT : PASSAGE);
      } else aw.job = null;
      v.says = 'I delivered the carried materials to the counted shared store.';
      continue;
    }
    if (j) {
      if (
        j.kind === 'scene' &&
        j.target === 'visit' &&
        j.phase === 'return' &&
        aw.map === 'yard' &&
        Math.hypot(v.x - HOME.x, v.y - HOME.y) < 10
      ) {
        w.completed.push({ actor: v.id, scene: 'visit', at: s.tick });
        event(s, sceneOutcome('visit', v.id, false));
        aw.job = null;
        continue;
      }
      if (pairStart(s, v)) continue;
      if (j.kind === 'move' || j.kind === 'map') {
        aw.job = null;
        v.says = 'I reached the selected place.';
        continue;
      }
      if (j.kind === 'scene') {
        const scene = SCENES[j.target as SceneId];
        // An authored visiting window is world availability, not a simulated relative's assent or private response.
        if (j.target === 'visit' && v.person.now < 720) {
          v.says =
            'The arranged family visiting window opens at noon. I can attend to my own needs while I wait.';
          choose(s, v);
          continue;
        }
        if (j.target === 'visit' && v.person.now + scene.ticks * DAY_MINUTES > 1080) {
          aw.job = null;
          v.says =
            'There is no longer enough time in the arranged visiting window. The visit did not happen.';
          continue;
        }
        if (j.target === 'telescope' && (v.person.now % 1440 < 1080 || v.person.now % 1440 > 1380)) {
          aw.job = null;
          v.says = 'The telescope evening needs willing people here between 18:00 and 23:00.';
          continue;
        }
        const req = primaryOffer(s, v);
        const opts = [req, ...bodyChoices(s, v)],
          d = decide(v.person, opts, requestOptions(s, v, req));
        const chosen = opts.find((a) => a.id === d.chosenAffordanceId);
        if (chosen === req && d.suggestion?.verdict !== 'refused') {
          if (spend(s, scene.boards, scene.meals, scene.paper)) {
            if (j.target === 'telescope') w.records.telescope = 'set';
            startChoice(s, v, req, d, 'job');
          } else aw.job = null;
        } else {
          aw.job = null;
          v.says = d.suggestion?.says || d.narration;
          if (chosen) startChoice(s, v, chosen, d, 'body');
        }
        continue;
      }
      if (j.kind === 'gather') {
        if (w.dispute) {
          v.status = 'waiting for the shared route';
          v.says =
            'We disagree about the trolley route. We can talk, yield or offer a voluntary practice bout.';
          choose(s, v);
          continue;
        }
        if (w.trolley && w.trolley !== v.id) {
          const other = s.villagers.find((p) => p.id === w.trolley);
          if (
            other &&
            !w.routeAgreements.includes([v.id, other.id].sort().join('/')) &&
            actor(s, other).map === aw.map &&
            Math.hypot(v.x - other.x, v.y - other.y) < 50
          ) {
            w.dispute = [v.id, other.id];
            w.disputeAt = s.tick;
            witnessRoute(s, v, other);
            for (const [p, q] of [
              [v, other],
              [other, v],
            ] as const) {
              socialEvent(p.person, {
                at: p.person.now,
                kind: 'conflict',
                otherId: q.person.id,
                byMe: false,
                magnitude: 0.25,
              });
              perceive(p.person, [
                {
                  at: p.person.now,
                  channel: 'saw',
                  kind: 'conflict',
                  actorId: q.person.id,
                  salience: 0.8,
                  summary:
                    'We reached the narrow trolley route together and disagreed about who would use it.',
                },
              ]);
            }
            event(
              s,
              `${v.name} and ${other.name} disagree over the narrow trolley route. Ask one resident to yield to open the route. Talking and practice are optional.`,
            );
          }
          choose(s, v);
          continue;
        }
      }
      choose(s, v, primaryOffer(s, v), 'job');
      if (j.kind === 'gather' && actor(s, v).running?.purpose === 'job') w.trolley = v.id;
      continue;
    }
    choose(s, v);
  }
  if (s.tick >= 1800)
    for (const v of s.villagers) interruptReply(s, v, 'The day ended before the conversation finished.');
  if (s.pauseRequested && s.villagers.every((v) => !v.person.activity)) {
    s.chapterPaused = true;
    event(s, 'Everyone has finished. The chapter is paused at actual action boundaries.');
  }
  if (s.tick === 750) event(s, 'The storm arrives at 20:00. Finish the storehouse before then.');
  if (s.tick === 900) {
    w.storm = true;
    s.won = s.buildings.some((b) => b.kind === 'storehouse' && b.complete);
    if (!s.won) {
      s.resources.food *= 0.4;
      s.resources.wood *= 0.5;
    }
    event(
      s,
      s.won
        ? 'The completed storehouse keeps the shared supplies dry. The day continues.'
        : 'The storm soaks the unprotected supplies. Some food and boards are lost. The day continues.',
    );
  }
  if (s.tick === 1800) {
    s.ended = true;
    for (const v of s.villagers) cancel(s, v);
    event(
      s,
      s.won
        ? 'It is tomorrow morning. The supplies stayed dry. People have lived through the day and night.'
        : 'It is tomorrow morning. The storm damaged the supplies. People have lived through the day and night.',
    );
  }
}

// The player answers a resident where that resident stands (owner retest 2026-10-27). The reply
// stays an in-person act at the recorded point. Replay: every reply input in an existing export
// passed the older hub-only check before it was recorded, and the start and step checks below
// still pin the recorded map and point, so dropping the hub check never changes an old run.
function latestReply(s: State, v: Villager): ReplyAttempt | undefined {
  return world(s).replyScenes?.[v.id]?.attempts.at(-1);
}
export function validateReply(s: State, c: Extract<Command, { kind: 'reply' }>): void {
  const w = world(s),
    branch = REPLIES[c.branch];
  const v = s.villagers.find((v) => v.id === c.ids[0]);
  if (!hasReplies(w.config.edition) || !branch || c.ids.length !== 1 || branch.actor !== c.ids[0] || !v)
    throw new Error('Choose one matching resident and reply line in the fresh reply day.');
  const scene = w.replyScenes?.[v.id];
  if (!scene) throw new Error('Wait for the actual completed private disclosure.');
  if (s.ended || s.pauseRequested || s.chapterPaused || !v.person.body.alive || v.availableAt > s.tick)
    throw new Error('This resident is unavailable. Resume an active day before asking.');
  const aw = actor(s, v),
    last = latestReply(s, v);
  if (
    activePeer(s, v.id) ||
    aw.job ||
    aw.carried ||
    aw.path.length ||
    (aw.running && aw.running.purpose !== 'body')
  )
    throw new Error('Finish the current task or explicitly cancel it before offering this reply.');
  if (
    scene.completedBranch ||
    (scene.selectedBranch && scene.selectedBranch !== c.branch) ||
    last?.status === 'requested' ||
    last?.status === 'running'
  )
    throw new Error(
      'This reply already has a request or result. An unfinished attempt may retry the same line.',
    );
  if (w.paper < 1) throw new Error('This needs one sheet of paper.');
  if (s.tick + branch.ticks + 1 >= 1800) throw new Error('There is not enough time left in this day.');
}
function requestReply(s: State, c: Extract<Command, { kind: 'reply' }>) {
  const v = s.villagers.find((v) => v.id === c.ids[0]);
  if (!v) return;
  const scene = world(s).replyScenes?.[v.id];
  if (!scene) return;
  scene.selectedBranch = c.branch;
  scene.attempts.push({
    id: `reply:${v.id}:${scene.attempts.length + 1}`,
    branch: c.branch,
    disclosureId: scene.disclosure.id,
    requestedAt: s.tick,
    map: actor(s, v).map,
    point: { x: v.x, y: v.y },
    paperSpent: 0,
    status: 'requested',
  });
  // A validated, recorded reply has priority over unfinished earlier-work re-offers.
  cancelLongRoof(s, v.id);
  event(
    s,
    `You offered a reply to ${v.name}. The current body action will finish first. No words have been delivered yet.`,
  );
}
function replyOffer(a: ReplyAttempt): Affordance {
  return {
    ...affordance(`reply:${a.branch}`, 'talk', REPLIES[a.branch].ticks, { belonging: 0.45 }),
    targetId: a.id,
    placeId: a.map,
    with: [],
    tags: ['social'],
  };
}
function replyOptions(s: State, v: Villager, a: ReplyAttempt): Affordance[] {
  return [replyOffer(a), ...bodyChoices(s, v), affordance('reply-wait', 'wait', 1, {})];
}
function interruptReply(s: State, v: Villager, reason: string) {
  const a = latestReply(s, v);
  if (!a || !['requested', 'running'].includes(a.status)) return;
  const activity = v.person.activity;
  if (
    a.status === 'running' &&
    activity &&
    activity.affordanceId === a.activityId &&
    activity.targetId === a.id &&
    activity.startedAt === a.activityStartedAt
  )
    finish(v.person, {
      affordanceId: activity.affordanceId,
      action: activity.action,
      targetId: activity.targetId,
      at: v.person.now,
      status: 'interrupted',
      needs: {},
      summary: reason,
    });
  a.status = 'interrupted';
  a.endedAt = s.tick;
  a.reason = reason;
  v.task = 'waiting';
  v.status = 'waiting';
  event(s, `${v.name}: ${reason} No finished paper record was made.`);
}
function startReply(s: State, v: Villager): boolean {
  const w = world(s),
    a = latestReply(s, v),
    aw = actor(s, v);
  if (!a || a.status !== 'requested' || aw.running || v.person.activity || s.pauseRequested) return false;
  const scene = w.replyScenes?.[v.id];
  if (
    aw.map !== a.map ||
    Math.hypot(v.x - a.point.x, v.y - a.point.y) > 1 ||
    aw.job ||
    aw.carried ||
    w.paper < 1 ||
    s.tick + REPLIES[a.branch].ticks >= 1800 ||
    scene?.disclosure.id !== a.disclosureId
  ) {
    a.status = 'unavailable';
    a.endedAt = s.tick;
    a.reason = 'The place, task, paper or remaining time changed before the offer.';
    event(s, a.reason);
    return false;
  }
  a.deliveredAt = s.tick;
  const heardAt = v.person.now;
  const heard = perceive(v.person, [
    {
      at: v.person.now,
      channel: 'heard',
      kind: 'workshop-reply',
      actorId: 'commander',
      targetId: v.person.id,
      placeId: a.map,
      salience: 0.7,
      near: true,
      summary: REPLIES[a.branch].line,
    },
  ]);
  a.attended = heard.some(
    (p) =>
      p.kind === 'workshop-reply' &&
      p.at === heardAt &&
      p.actorId === 'commander' &&
      p.summary === REPLIES[a.branch].line,
  );
  event(s, `You said to ${v.name}: ${REPLIES[a.branch].line}`);
  const options = replyOptions(s, v, a),
    offer = options[0];
  if (!offer) return false;
  const d = decide(v.person, options, {
    suggestion: { voiceId: 'commander', action: 'talk', strength: 0.35 },
  });
  a.decision = {
    chosenAffordanceId: d.chosenAffordanceId,
    ...(d.suggestion ? { verdict: d.suggestion.verdict } : {}),
    publicSays: d.suggestion?.says || d.narration,
  };
  const selected = options.find((o) => o.id === d.chosenAffordanceId);
  if (!selected || selected.id !== offer.id || d.suggestion?.verdict === 'refused') {
    a.status = 'withheld';
    a.endedAt = s.tick;
    v.says = a.decision.publicSays;
    event(s, `${v.name} did not start the offered paper conversation. ${v.says}`);
    if (selected && selected.id !== offer.id) startChoice(s, v, selected, d, 'body');
    return true;
  }
  const activity = begin(v.person, selected, d);
  if (!activity) {
    a.status = 'start-failed';
    a.endedAt = s.tick;
    event(s, `${v.name} could not start the conversation. No paper was spent.`);
    return true;
  }
  w.paper--;
  a.paperSpent = 1;
  a.status = 'running';
  a.startedAt = s.tick;
  a.until =
    s.tick +
    Math.max(REPLIES[a.branch].ticks, Math.ceil((activity.endsAt - activity.startedAt) / DAY_MINUTES));
  a.activityId = activity.affordanceId;
  a.activityStartedAt = activity.startedAt;
  v.task = 'talking and writing on paper';
  v.status = 'is talking and writing on paper.';
  v.says = a.decision.publicSays;
  return true;
}
function stepReply(s: State, v: Villager): boolean {
  const a = latestReply(s, v);
  if (!a || a.status !== 'running') return false;
  const activity = v.person.activity,
    aw = actor(s, v);
  if (
    !activity ||
    activity.affordanceId !== a.activityId ||
    activity.targetId !== a.id ||
    activity.startedAt !== a.activityStartedAt ||
    activity.action !== 'talk' ||
    aw.map !== a.map ||
    Math.hypot(v.x - a.point.x, v.y - a.point.y) > 1 ||
    aw.job
  ) {
    interruptReply(s, v, 'The conversation lost its matching activity or shared place.');
    return true;
  }
  if (a.until !== undefined && s.tick >= a.until && v.person.now >= activity.endsAt) {
    const report = finish(v.person, {
      affordanceId: activity.affordanceId,
      action: 'talk',
      targetId: a.id,
      at: v.person.now,
      status: 'completed',
      needs: {},
      summary: REPLIES[a.branch].says,
    });
    if (report?.status !== 'completed') {
      interruptReply(s, v, 'The conversation did not record a completed finish.');
      return true;
    }
    const branch = REPLIES[a.branch],
      scene = world(s).replyScenes?.[v.id];
    if (!scene) throw new Error('Missing replayed disclosure');
    a.status = 'completed';
    a.endedAt = s.tick;
    a.resultId = `${a.id}:paper`;
    scene.completedBranch = a.branch;
    world(s).replyResults?.push({
      id: a.resultId,
      actor: v.id,
      branch: a.branch,
      attemptId: a.id,
      at: s.tick,
      object: branch.object,
      text: branch.text,
      says: branch.says,
    });
    v.says = branch.says;
    v.task = 'waiting';
    v.status = 'waiting';
    event(s, `${v.name}: ${branch.says}`);
    return true;
  }
  if (v.person.now >= activity.reviewAt) {
    const options = replyOptions(s, v, a),
      d = decide(v.person, options),
      selected = options.find((o) => o.id === d.chosenAffordanceId);
    if (selected?.id === activity.affordanceId) reviewed(v.person);
    else {
      interruptReply(s, v, 'The resident chose another action before the paper conversation finished.');
      if (selected) startChoice(s, v, selected, d, 'body');
    }
  }
  return true;
}

const peerHost = { bodyChoices, startChoice, setJob, cancel, event };

export const LONG_ROOF_RETURN = 'settlement-roof-break-return/1';
export type LongRoofAttempt = {
  id: string;
  capturedAt: number;
  inputIndex: number;
  priorActor: ActorWorld;
  priorTask: string;
  priorStatus: string;
  priorTarget: Building | null;
  source: {
    config: SettlementConfig;
    hub: Building;
    map: Place;
    resource: Resource | null;
    cache: number | null;
    trolley: string | null;
    dispute: [string, string] | null;
    routeAgreements: string[];
    commitments: Villager['person']['agenda']['commitments'];
  };
  stage: 'finish' | 'delivery' | 'roof' | 'rest' | 'reoffered' | 'unavailable' | 'cancelled' | 'refused';
  roofRequested?: number;
  deliveredAt?: number;
  restStarted?: number;
  restUntil?: number;
  restCompleted?: number;
  restMap?: Place;
  restPoint?: Point;
  restActivity?: { affordanceId: string; startedAt: number };
  restDecision?: { chosenAffordanceId?: string; verdict?: string };
  endedAt?: number;
  result?: string;
};
const LONG_ACTIVE = ['finish', 'delivery', 'roof', 'rest'];
export function activeLongRoof(s: State, id: string): LongRoofAttempt | undefined {
  return s.longRoofBreak?.attempts.findLast((a) => a.id === id && LONG_ACTIVE.includes(a.stage));
}
function endLongRoof(s: State, a: LongRoofAttempt, stage: LongRoofAttempt['stage'], result: string) {
  a.stage = stage;
  a.endedAt = s.tick;
  a.result = result;
}
function cancelLongRoof(s: State, id?: string) {
  for (const a of s.longRoofBreak?.attempts ?? [])
    if ((!id || a.id === id) && LONG_ACTIVE.includes(a.stage))
      endLongRoof(
        s,
        a,
        'cancelled',
        'A later task or pause interrupted this sequence. Earlier work will not be offered.',
      );
}
export function longRoofUnavailable(s: State, ids: readonly string[]): string {
  if (!s.settlement) return 'Choose a longer settlement day for this action.';
  if (s.ended || s.pauseRequested || s.chapterPaused) return 'Resume an unfinished day first.';
  if (!ids.length || ids.some((id) => !s.settlement?.actors[id]))
    return 'Select residents for the roof break.';
  if (ids.some((id) => activeLongRoof(s, id)))
    return 'A selected resident already has a roof break in progress.';
  if (s.inputs.length >= 10000 || (s.longRoofBreak?.attempts.length ?? 0) + ids.length > 10000)
    return 'The recorded roof-break limit has been reached.';
  if (!s.buildings.some((b) => b.kind === 'town' && b.complete))
    return 'The workshop hub roof is unavailable.';
  if (
    ids.some((id) => {
      const v = s.villagers.find((v) => v.id === id);
      return (
        !v ||
        !v.person.body.alive ||
        v.availableAt > s.tick ||
        activePeer(s, id) ||
        ['requested', 'running'].includes(s.settlement?.replyScenes?.[id]?.attempts.at(-1)?.status ?? '')
      );
    })
  )
    return 'A selected resident is unavailable or has an unfinished conversation. Finish it or cancel it explicitly first.';
  return '';
}
/** Scope: one opt-in long-day Job/delivery/roof/rest/re-offer sequence. Existing native world
 * travel, stock delivery and released HF choices/commitments remain authoritative. No planner,
 * physiology, private mind, assent guarantee, new calendar or portable passport is introduced.
 */
export function requestLongRoof(s: State, ids: readonly string[], inputIndex: number) {
  const w = world(s);
  s.longRoofBreak ??= { version: LONG_ROOF_RETURN, attempts: [] };
  for (const v of s.villagers.filter((v) => ids.includes(v.id))) {
    const aw = actor(s, v),
      j = aw.job;
    const map = j?.sourceMap ?? j?.map ?? aw.map;
    const resource = j?.kind === 'gather' ? (j.target as Resource) : null;
    s.longRoofBreak.attempts.push({
      id: v.id,
      capturedAt: s.tick,
      inputIndex,
      priorActor: structuredClone(aw),
      priorTask: v.task,
      priorStatus: v.status,
      priorTarget: structuredClone(s.buildings.find((b) => b.id === j?.target) ?? null),
      source: structuredClone({
        config: w.config,
        hub: s.buildings.find((b) => b.kind === 'town' && b.complete)!,
        map,
        resource,
        cache: resource ? w.caches[map][resource] : null,
        trolley: w.trolley,
        dispute: w.dispute,
        routeAgreements: w.routeAgreements,
        commitments: v.person.agenda.commitments,
      }),
      stage: 'finish',
    });
  }
  event(
    s,
    'Roof breaks recorded. Current acts and carried deliveries finish first. Each resident can then consider walking to the hub, a 15-second rest and their earlier work. Another task interrupts the sequence.',
  );
}
function sameLongWork(s: State, a: LongRoofAttempt): Job | null {
  const j = a.priorActor.job;
  if (!j || !['gather', 'build'].includes(j.kind) || j.partner) return null;
  if (j.kind === 'gather') {
    if (!a.source.resource || world(s).caches[a.source.map][a.source.resource] <= 0) return null;
    return { ...structuredClone(j), map: a.source.map, point: CACHE_POINT, phase: 'out' };
  }
  const b = s.buildings.find((b) => b.id === j.target);
  if (
    !b ||
    b.complete ||
    !a.priorTarget ||
    b.kind !== a.priorTarget.kind ||
    b.x !== a.priorTarget.x ||
    b.y !== a.priorTarget.y
  )
    return null;
  return { ...structuredClone(j), point: b, phase: 'out' };
}
function stepLongRoof(s: State, v: Villager): boolean {
  const a = activeLongRoof(s, v.id);
  if (!a) return false;
  const w = world(s),
    aw = actor(s, v);
  const hub = s.buildings.find((b) => b.kind === 'town' && b.complete);
  if (
    !hub ||
    hub.id !== a.source.hub.id ||
    hub.x !== a.source.hub.x ||
    hub.y !== a.source.hub.y ||
    v.availableAt > s.tick ||
    s.ended ||
    s.pauseRequested ||
    w.config.edition !== a.source.config.edition
  ) {
    endLongRoof(
      s,
      a,
      'unavailable',
      'The roof, resident or source day is unavailable. Earlier work was not offered.',
    );
    return false;
  }
  // Do not drop a running act, a held load, a trolley reservation or an unfulfilled appointment.
  if (aw.running) return false;
  if (a.stage === 'rest') {
    if (
      !a.restCompleted ||
      aw.map !== 'yard' ||
      Math.hypot(v.x - hub.x, v.y - hub.y) >= 10 ||
      aw.carried ||
      aw.job ||
      aw.path.length
    ) {
      endLongRoof(s, a, 'cancelled', 'The rest or shared place changed. Earlier work was not offered.');
      return false;
    }
    const j = sameLongWork(s, a);
    if (!j) {
      endLongRoof(
        s,
        a,
        'unavailable',
        'The earlier work target is complete, empty, missing or was not work. No work was offered.',
      );
      return false;
    }
    setJob(s, v, j, true);
    if (aw.job === j)
      endLongRoof(
        s,
        a,
        'reoffered',
        'The earlier work was offered through ordinary choices. Further rest or refusal remains possible.',
      );
    else endLongRoof(s, a, 'unavailable', 'The earlier work request could not be installed.');
    return true;
  }
  if (aw.carried) {
    a.stage = 'delivery';
    // An existing gathering return keeps its exact path and commitment until real delivery.
    if (aw.job && (aw.job.phase === 'return' || (aw.job.kind === 'map' && aw.job.map === 'yard')))
      return false;
    if (
      aw.commitment &&
      v.person.agenda.commitments.some((c) => c.id === aw.commitment && c.status === 'pending')
    ) {
      endLongRoof(
        s,
        a,
        'unavailable',
        'An unfinished commitment prevents changing the current delivery request.',
      );
      return false;
    }
    setJob(s, v, { kind: 'map', target: 'yard', map: 'yard', point: HOME, phase: 'out' }, true);
    return false;
  }
  if (
    w.trolley === v.id ||
    (aw.commitment &&
      v.person.agenda.commitments.some((c) => c.id === aw.commitment && c.status === 'pending'))
  ) {
    endLongRoof(
      s,
      a,
      'unavailable',
      'An unfinished work commitment or trolley reservation remains. Earlier work was not replaced.',
    );
    return false;
  }
  if (['gather', 'build'].includes(a.priorActor.job?.kind ?? '') && !sameLongWork(s, a)) {
    endLongRoof(
      s,
      a,
      'unavailable',
      'The earlier work target changed or has no work left. No later stage was offered.',
    );
    return false;
  }
  if (!a.roofRequested) {
    setJob(
      s,
      v,
      { kind: 'map', target: 'yard', map: 'yard', point: { x: hub.x, y: hub.y }, phase: 'out' },
      true,
    );
    if (aw.job?.kind !== 'map' || aw.job.map !== 'yard') {
      endLongRoof(s, a, 'unavailable', 'The route to the hub is unavailable.');
      return false;
    }
    a.roofRequested = s.tick;
    a.stage = 'roof';
    return false;
  }
  if (aw.job || aw.path.length || aw.map !== 'yard' || Math.hypot(v.x - hub.x, v.y - hub.y) >= 10)
    return false;
  const rest = affordance('rest', 'rest', 15, { rest: 0.55 });
  aw.pendingRequest = 'ordinary';
  // The live HF choice includes current needs and duties, rather than the captured historical agenda.
  const options = [rest, ...bodyChoices(s, v)];
  const decision = decide(v.person, options, requestOptions(s, v, rest));
  const selected = options.find((o) => o.id === decision.chosenAffordanceId);
  a.restDecision = {
    ...(decision.chosenAffordanceId ? { chosenAffordanceId: decision.chosenAffordanceId } : {}),
    ...(decision.suggestion ? { verdict: decision.suggestion.verdict } : {}),
  };
  if (selected) startChoice(s, v, selected, decision, 'body');
  if (!selected || selected.id !== rest.id || decision.suggestion?.verdict === 'refused') {
    endLongRoof(
      s,
      a,
      'refused',
      'The resident did not accept the offered roof rest. Earlier work was not offered.',
    );
    return true;
  }
  const run = actor(s, v).running,
    activity = v.person.activity;
  if (!run || run.action !== 'rest' || !activity || activity.action !== 'rest') {
    endLongRoof(
      s,
      a,
      'refused',
      'The resident did not begin the offered roof rest. Earlier work was not offered.',
    );
    return true;
  }
  a.stage = 'rest';
  a.restStarted = run.from;
  a.restUntil = run.until;
  a.restMap = aw.map;
  a.restPoint = { x: v.x, y: v.y };
  a.restActivity = { affordanceId: activity.affordanceId, startedAt: activity.startedAt };
  return true;
}
