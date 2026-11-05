/** Commonstead's host adapter. Minute DTOs below are read-only public inspections.
 * The community Run alone evolves people. The host records actual action receipts.
 */
import {
  type ActionResolution,
  exportRun as archive,
  createPerson as author,
  createRun,
  DEFAULT_NORMS,
  type DeepReadonly,
  type Input,
  inspect,
  type Offer,
  type PersonAuthoring,
  type PersonView,
  type PortablePerson,
  preview,
  type Result,
  type Run,
  type RunArchive,
  type RunSpec,
  readRunHistory,
  replay,
  restoreRun,
  type StepResult,
  step,
} from '@adam0white/human-framework';
import type * as Old from './actor-view';
import { FRAMEWORK_VERSION } from './engine';

type HostParts = { [P in Extract<PersonView, { kind: 'host' }>['parts'][number] as P['select']]: P['value'] };

import { authoredPerson } from './hf4-authoring';

export type { Affordance, Percept, Person } from './actor-view';
export const MINUTE = 60_000;
const START = 480 * MINUTE;
const HOST = { type: 'host' as const, id: 'commonstead' };
const actions = [
  'wait',
  'rest',
  'work',
  'move',
  'eat',
  'drink',
  'sleep',
  'pray',
  'talk',
  'spar',
  'try-grip',
  'share-story',
  'inspect',
  'yield',
  'correction',
  'visit',
  'letter',
  'telescope',
  'deliver',
];
const links = new WeakMap<Old.Person, Community>();
let opening: Community;
const need = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.error.code} ${r.error.path}: ${r.error.message}`);
  return r.value;
};
type Active = {
  id: string;
  person: string;
  offer: Offer;
  start: number;
  decision: Old.DecisionRecord | null;
};
class Community {
  run: Run;
  spec: RunSpec;
  authors: PersonAuthoring[] = [];
  at = START;
  sequence = 0;
  revision = 0;
  offers = new Map<string, Offer[]>();
  people: Old.Person[] = [];
  active: Active[] = [];
  decisions = new Map<string, Old.DecisionRecord>();
  pending: DeepReadonly<StepResult> | undefined;
  outcomes = new Map<string, Old.Outcome>();
  delivered = new Map<string, { activity: Active; outcome: Old.Outcome }>();
  starting = new Set<string>();
  deciding = new Set<string>();
  offset = 0;
  ingressThrough = START;
  constructor(seed: number, longer: boolean) {
    const demands = { effort: 0, focus: 0, mode: 'awake' as const, requires: {} };
    const spec: RunSpec = {
      id: `commonstead:${seed}`,
      seed,
      start: START,
      host: { id: HOST.id, edition: 'commonstead-4', schema: 'commonstead-run/1' },
      definitions: {
        actions: actions.map((id) => ({
          id,
          label: id,
          demands,
          tags: id === 'rest' ? ['rest'] : id === 'pray' ? ['worship'] : [],
          norms: [],
        })),
        norms: DEFAULT_NORMS,
        marriageCustoms: [],
        skills: [],
        skillTransfers: [],
        methods: [],
        routines: [],
        sources: [HOST, { type: 'voice', id: 'commander' }],
        lexicon: { names: {}, roles: {}, prefer: 'name', actions: {} },
        calendar: {
          id: 'mill-bridge',
          epoch: { id: 'mill-bridge-epoch', simulationAt: 0, dayIndex: 0, msOfDay: 0 },
          dayMs: 86400000,
          days: [0, 1].map((dayIndex) => ({
            dayIndex,
            start: dayIndex * 86400000,
            windows: [],
            ...(longer
              ? {
                  prayers: {
                    fajrMs: 300 * MINUTE,
                    sunriseMs: 390 * MINUTE,
                    dhuhrMs: 750 * MINUTE,
                    asrMs: 960 * MINUTE,
                    maghribMs: 1125 * MINUTE,
                    ishaMs: 1215 * MINUTE,
                  },
                  nextFajrMs: 300 * MINUTE,
                }
              : {}),
          })),
        },
      },
      lifecycle: { kinPremises: [], kinScopes: [] },
      world: { revision: 0, facts: [], hostState: { active: [] } },
    };
    this.spec = spec;
    this.run = need(createRun(spec));
  }
  input<K extends Input['kind']>(
    kind: K,
    payload: Extract<Input, { kind: K }>['payload'],
    at = this.at + 1,
  ): Input {
    const through = Math.max(this.at, this.ingressThrough);
    if (at > through) this.offset += at - through;
    this.ingressThrough = Math.max(this.ingressThrough, at);
    return {
      id: `host:${String(++this.sequence).padStart(12, '0')}`,
      at,
      source: HOST,
      kind,
      payload: JSON.parse(JSON.stringify(payload)),
    } as Input;
  }
  read() {
    const reading = need(
      inspect(this.run, {
        perspective: { kind: 'host' },
        people: this.people.map((p) => p.id),
        select: ['summary', 'body', 'agenda', 'traits'],
      }),
    );
    for (const p of this.people) {
      const person = reading.people.find((v) => v.id === p.id);
      if (person?.kind !== 'host') throw new Error('Missing community resident inspection');
      const part = <K extends keyof HostParts>(key: K): HostParts[K] => {
        const item = person.parts.find((x) => x.select === key);
        if (!item) throw new Error(`Missing ${key}`);
        return item.value as HostParts[K];
      };
      const body = part('body');
      p.now = this.at / MINUTE;
      p.body = { ...body.state, alive: part('summary').alive } as unknown as Old.Person['body'];
      p.bodyReadout = structuredClone(body.readout);
      p.agenda = JSON.parse(JSON.stringify(part('agenda')));
      for (const c of p.agenda.commitments) {
        c.from /= MINUTE;
        c.until /= MINUTE;
      }
      const act =
        this.active.find((a) => a.person === p.id) ??
        (this.delivered.get(p.id)?.outcome.status === 'completed'
          ? this.delivered.get(p.id)?.activity
          : undefined);
      p.activity = act
        ? ({
            id: act.id,
            affordanceId: act.offer.id,
            action: act.offer.actionId,
            ...(act.offer.target ? { targetId: act.offer.target } : {}),
            startedAt: act.start / MINUTE,
            endsAt: (act.start + act.offer.durationMs) / MINUTE,
            reviewAt: (act.start + act.offer.durationMs) / MINUTE,
            effort: act.offer.demands.effort,
            protest: act.decision?.suggestion?.verdict === 'complied',
          } as unknown as Old.Person['activity'])
        : null;
      p.traits = part('traits');
      // The host uses no memory DTO. Retained memory stays in HF and its persona projection;
      // current event diagnostics are not an actor-memory substitute.
    }
  }
  serve(until: number, inputs: Input[] = [], initial?: DeepReadonly<StepResult>) {
    let pending = initial ?? this.pending,
      batch = inputs;
    if (pending && inputs.length) {
      pending = need(step(this.run, { until: Math.max(until, this.at), inputs }));
      batch = [];
    }
    this.pending = undefined;
    const events: DeepReadonly<StepResult>['events'][number][] = [];
    for (let n = 0; n < 10000; n++) {
      const result = pending ?? need(step(this.run, { until, inputs: batch }));
      pending = undefined;
      this.at = result.at;
      events.push(...result.events);
      for (const e of result.events)
        if (e.data.kind === 'decision') {
          const record = {
            ...e.data.decision,
            at: e.at / MINUTE,
            narration: e.narration.map((n) => n.text).join(' '),
            ...(e.data.decision.suggestion
              ? {
                  suggestion: {
                    ...e.data.decision.suggestion,
                    says: e.narration.map((n) => n.text).join(' '),
                  },
                }
              : {}),
          } as unknown as Old.DecisionRecord;
          if (e.person) this.decisions.set(e.person, record);
        }
      if (result.boundary.type === 'until') {
        this.read();
        return { ...result, events };
      }
      const unresolved = result.boundary.requests.filter(
        (request) =>
          request.kind === 'action' &&
          (request.stage === 'start'
            ? this.deciding.has(request.person) && !this.starting.has(request.person)
            : request.stage === 'finish' && !this.outcomes.has(request.activityId)),
      );
      if (unresolved.length) {
        this.pending = { ...result, events: [] };
        this.read();
        return { ...result, events };
      }
      const candidate = this.active.map((a) => ({ ...a }));
      let revision = this.revision;
      const delivered = new Map(this.delivered);
      batch = [...result.boundary.requests]
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((request) => {
          if (request.kind === 'communication')
            return this.input(
              'communication.resolved',
              {
                requestId: request.id,
                requestHash: request.requestHash,
                worldRevision: revision,
                speaker: request.speaker,
                emittedItemIds: request.items.map((i) => i.id),
                received: request.recipients.map((person) => ({
                  recipient: person,
                  itemIds: request.items.map((i) => i.id),
                  evidenceId: `heard:${request.id}:${person}`,
                  attention: 1,
                })),
              },
              request.boundaryAt,
            );
          const base = {
            requestId: request.id,
            requestHash: request.requestHash,
            person: request.person,
            activityId: request.activityId,
            stage: request.stage,
            worldRevision: revision,
          };
          let payload: ActionResolution;
          if (request.stage === 'start') {
            const offer = this.offers.get(request.person)?.find((o) => o.id === request.offerId);
            if (!offer || !this.starting.has(request.person))
              return this.input(
                'action.resolved',
                { ...base, disposition: 'rejected', observations: [] },
                request.boundaryAt,
              );
            delivered.delete(request.person);
            candidate.push({
              id: request.activityId,
              person: request.person,
              offer,
              start: request.boundaryAt,
              decision: this.decisions.get(request.person) ?? null,
            });
            payload = { ...base, disposition: 'accepted', observations: [] };
          } else {
            const index = candidate.findIndex((a) => a.id === request.activityId);
            const act = candidate[index];
            if (!act) throw new Error('Unknown host activity');
            candidate.splice(index, 1);
            const actual = this.outcomes.get(act.id);
            const status =
              request.stage === 'interrupt'
                ? 'interrupted'
                : actual!.status === 'interrupted'
                  ? 'failed'
                  : actual!.status;
            const outcome = actual ?? {
              action: act.offer.actionId,
              at: request.boundaryAt / MINUTE,
              status,
              summary: 'The resident stopped this task at the HF interruption boundary.',
            };
            delivered.set(act.person, { activity: act, outcome: { ...outcome, status } });
            payload = {
              ...base,
              disposition: status,
              observations: [],
              outcome: {
                activityId: act.id,
                offerId: act.offer.id,
                actionId: act.offer.actionId,
                start: act.start,
                end: request.boundaryAt,
                status,
                evidenceId: `outcome:${request.id}`,
                summary: outcome.summary ?? `The resident ${status} ${act.offer.label}.`,
                ...(act.offer.target ? { target: act.offer.target } : {}),
                actual: {
                  exposures: [],
                  observedProgress: [],
                  ...(status === 'completed' && outcome.needs
                    ? { consumed: { food: outcome.needs.food ?? 0, water: outcome.needs.water ?? 0 } }
                    : {}),
                },
                fulfills:
                  status === 'completed'
                    ? [
                        ...new Set([
                          ...act.offer.fulfills,
                          ...(this.people.find((p) => p.id === act.person)?.agenda.commitments ?? [])
                            .filter(
                              (d) =>
                                d.status === 'pending' &&
                                d.from <= request.boundaryAt / MINUTE &&
                                d.until >= request.boundaryAt / MINUTE &&
                                d.actions.includes(act.offer.actionId) &&
                                (!d.targetId || d.targetId === act.offer.target),
                            )
                            .map((d) => d.id),
                        ]),
                      ]
                    : [],
                advances: [],
              },
            };
          }
          payload.worldChange = {
            expectedRevision: revision,
            revision: ++revision,
            put: [],
            remove: [],
            hostState: {
              ingressOffsetMs: this.offset,
              // Complete offers and outcomes remain in the input history and game replay.
              // The opaque current world needs only references to host-held work.
              delivered: [...delivered.values()].map(({ activity, outcome }) => ({
                id: activity.id,
                person: activity.person,
                status: outcome.status,
              })),
              active: candidate.map((a) => ({
                id: a.id,
                person: a.person,
                offerId: a.offer.id,
                start: a.start,
              })),
            } as never,
          };
          return this.input('action.resolved', payload, request.boundaryAt);
        });
      const accepted = need(step(this.run, { until, inputs: batch }));
      this.active = candidate;
      this.delivered = delivered;
      this.revision = revision;
      pending = accepted;
    }
    throw new Error('Commonstead request budget exhausted');
  }
}
export function openCommunity(seed: number, longer = false) {
  opening = new Community(seed, longer);
}
export function createPerson(spec: Old.PersonSpec, resident?: Old.Person): Old.Person {
  const c = resident ? community(resident) : opening;
  if (!c) throw new Error('Missing community opening');
  const a = authoredPerson(spec.id, spec.name, spec.sex);
  a.identity.birthAt = (spec.bornAt ?? 480 - 30 * 365 * 1440) * MINUTE;
  a.identity.castId = spec.id;
  if (spec.traits) Object.assign(a.state.traits, spec.traits);
  if (spec.values) Object.assign(a.state.values, spec.values);
  Object.assign(a.state.body, spec.body);
  a.state.voices = [{ voiceId: 'commander', trust: 0.7 }];
  const salah = DEFAULT_NORMS.find((n) => n.id === 'salah');
  if (!salah) throw new Error('Missing sourced salah');
  a.state.heldNorms = [
    { normId: 'salah', standing: 'obligatory', conviction: 0.8, provenance: salah.provenance },
  ];
  if (c.at === START) {
    need(author(c.run, a));
    c.authors.push(a);
  } else
    c.serve(c.at + 1, [c.input('person.arrived', { authored: a, arrivalEvidenceId: `arrival:${spec.id}` })]);
  const p = {
    id: spec.id,
    name: spec.name,
    now: c.at / MINUTE,
    life: { bornAt: a.identity.birthAt / MINUTE },
    schema: 4,
    engine: FRAMEWORK_VERSION,
    lexicon: { plainEnglish: true },
    body: {},
    agenda: { commitments: [], owed: [] },
    trace: [],
    skills: {},
    traits: a.state.traits,
    values: a.state.values,
  } as unknown as Old.Person;
  c.people.push(p);
  links.set(p, c);
  c.read();
  return p;
}
function community(p: Old.Person) {
  const c = links.get(p);
  if (!c) throw new Error('Detached resident view');
  return c;
}
export function tick(p: Old.Person, minute: number) {
  const c = community(p),
    until = Math.max(c.at, Math.round(minute * MINUTE) + c.offset);
  if (until > c.at) c.serve(until);
}
export function readPerson(p: Old.Person): { body: Old.BodyReadout } {
  const live = links.get(p);
  if (!live) {
    if (!p.bodyReadout) throw new Error('Detached resident view');
    return { body: structuredClone(p.bodyReadout) };
  }
  const c = live,
    r = need(inspect(c.run, { perspective: { kind: 'host' }, people: [p.id], select: ['body'] }));
  const person = r.people[0];
  if (person?.kind !== 'host') throw new Error('Missing body');
  const b = person.parts.find((x) => x.select === 'body');
  if (b?.select !== 'body') throw new Error('Missing body');
  return { body: b.value.readout } as { body: Old.BodyReadout };
}
function decisionInputs(
  p: Old.Person,
  affordances: readonly Old.Affordance[],
  opts: Old.DecideOptions,
  at: number,
): Input[] {
  const c = community(p);
  const offers: Offer[] = affordances
    .filter((a, i) => affordances.findIndex((b) => b.id === a.id) === i)
    .map((a) => ({
      id: a.id,
      actionId: a.action,
      label: a.label,
      person: p.id,
      durationMs: Math.round(a.duration * MINUTE),
      ...(a.targetId ? { target: a.targetId } : {}),
      participants: a.with ?? [],
      alongside: [],
      demands: {
        effort: a.effort ?? 0,
        focus: a.focus ?? 0,
        mode: a.mode === 'sleep' ? 'sleep' : 'awake',
        requires: a.requires ?? {},
      },
      tags: a.tags ?? [],
      norms: a.norms ?? [],
      expected: {
        needs: a.advertises ?? {},
        material: a.material,
        followedBy: [],
        provenance: ['authored:commonstead'],
      },
      fulfills: p.agenda.commitments
        .filter(
          (d) =>
            d.status === 'pending' && d.from <= p.now && d.until >= p.now && d.actions.includes(a.action),
        )
        .map((d) => d.id),
      advances: [],
      diminishes: [],
    }));
  c.offers.set(p.id, offers);
  const revision = ++c.sequence;
  const inputs = [c.input('offers.received', { person: p.id, revision, offers }, at)];
  if (opts?.suggestion)
    inputs.push(
      c.input(
        'suggestion.received',
        {
          person: p.id,
          received: { kind: 'ordinary', suggestion: { ...opts.suggestion, adviceId: `advice:${revision}` } },
        },
        at,
      ),
    );
  inputs.push(
    c.input(
      'decision.requested',
      { person: p.id, reason: 'workshop choice', treatment: 'ordinary', offerRevision: revision },
      at,
    ),
  );
  return inputs;
}
export function decideTogether(
  choices: readonly {
    person: Old.Person;
    affordances: readonly Old.Affordance[];
    options?: Old.DecideOptions;
  }[],
): Old.DecisionRecord[] {
  const first = choices[0];
  if (!first) return [];
  const c = community(first.person),
    at = c.at + 1;
  if (choices.some((x) => community(x.person) !== c)) throw new Error('Decisions require one community');
  const inputs = choices.flatMap((x) => decisionInputs(x.person, x.affordances, x.options ?? {}, at));
  for (const x of choices) c.deciding.add(x.person.id);
  try {
    c.serve(at, inputs);
  } finally {
    for (const x of choices) c.deciding.delete(x.person.id);
  }
  return choices.map((x) => {
    const record = c.decisions.get(x.person.id);
    if (!record) throw new Error('HF supplied no decision');
    x.person.trace.push(record);
    return record;
  });
}
export function decide(
  p: Old.Person,
  affordances: readonly Old.Affordance[],
  options: Old.DecideOptions = {},
): Old.DecisionRecord {
  const record = decideTogether([{ person: p, affordances, options }])[0];
  if (!record) throw new Error('Missing decision');
  return record;
}
/** Accept a shared host start in one receipt batch after every participant chose it. */
export function beginTogether(people: readonly Old.Person[]) {
  const first = people[0];
  if (!first) return;
  const c = community(first);
  if (people.some((p) => community(p) !== c)) throw new Error('Shared starts require one community');
  for (const p of people) c.starting.add(p.id);
  try {
    c.serve(c.at);
  } finally {
    for (const p of people) c.starting.delete(p.id);
  }
}
export function begin(p: Old.Person, a: Old.Affordance, r: Old.DecisionRecord) {
  if (r.chosenAffordanceId !== a.id) return null;
  if (p.activity?.affordanceId === a.id) return p.activity;
  const c = community(p);
  c.starting.add(p.id);
  c.serve(c.at);
  c.starting.delete(p.id);
  return p.activity;
}
/** Resolve a chosen but now physically unavailable start through the ordinary public host rejection. */
export function refuseStart(p: Old.Person, a: Old.Affordance, r: Old.DecisionRecord) {
  if (r.chosenAffordanceId !== a.id || p.activity) return;
  const c = community(p);
  // No starting permission: serve emits the existing action.resolved/rejected response.
  c.serve(c.at);
}
/** Stage only outcomes that the host has actually established at this world tick. */
export function stageOutcome(p: Old.Person, outcome: Old.Outcome) {
  const c = community(p),
    a = c.active.find((a) => a.person === p.id);
  if (a) c.outcomes.set(a.id, outcome);
}

export function finish(p: Old.Person, outcome: Old.Outcome): Old.Outcome | undefined {
  const c = community(p);
  const delivered = c.delivered.get(p.id);
  if (delivered) {
    c.delivered.delete(p.id);
    c.outcomes.delete(delivered.activity.id);
    c.read();
    return { ...delivered.outcome };
  }
  const active = c.active.find((a) => a.person === p.id);
  if (!active) return;
  c.outcomes.set(active.id, outcome);
  if (outcome.status === 'interrupted')
    c.serve(c.at + 1, [
      c.input('activity.interrupted', {
        person: p.id,
        activityId: active.id,
        reason: outcome.summary ?? 'The host interrupted this task.',
      }),
    ]);
  else c.serve(c.at);
  const receipt = c.delivered.get(p.id);
  if (!receipt) return;
  c.delivered.delete(p.id);
  c.outcomes.delete(active.id);
  c.read();
  return { ...receipt.outcome };
}
export type ObservationReceipt = {
  eventId: string;
  evidenceId: string;
  perceptId: string;
  attention: number;
  deliveredAt: number;
  occurredAt: number;
  summary?: string;
};
export function observe(p: Old.Person, percepts: readonly Old.Percept[]) {
  const c = community(p);
  const at = c.at + 1;
  const evidenceId = `observed:${c.sequence + 1}`;
  const ids = percepts.map((_, i) => `percept:${c.sequence}:${i}`);
  const result = c.serve(at, [
    c.input(
      'observation.received',
      {
        person: p.id,
        evidenceId,
        percepts: percepts.map(({ at: occurred, ...q }, i) => ({
          ...q,
          id: ids[i]!,
          occurredAt: Math.min(at, Math.round(occurred * MINUTE)),
          claims: q.claims ?? [],
          norms: q.norms ?? [],
          advice: [],
          consequences: [],
          withdrawConsequences: [],
          witnesses: [],
          reports: [],
          provenance: ['commonstead:observed'],
        })),
      },
      at,
    ),
  ]);
  const receipts: ObservationReceipt[] = result.events.flatMap((e) =>
    e.data.kind === 'observation-attended' &&
    e.data.evidenceId === evidenceId &&
    ids.includes(e.data.perceptId)
      ? [{ eventId: e.id, ...e.data }]
      : [],
  );
  return { receipts, attended: percepts.filter((_, i) => receipts.some((e) => e.perceptId === ids[i])) };
}
export function perceive(p: Old.Person, percepts: readonly Old.Percept[]) {
  return observe(p, percepts).attended;
}

export function promise(
  p: Old.Person,
  commitment: Omit<Old.Person['agenda']['commitments'][number], 'id' | 'status' | 'exempt'>,
) {
  const c = community(p),
    id = `appointment:${++c.sequence}`;
  c.serve(c.at + 1, [
    c.input('agenda.requested', {
      person: p.id,
      request: {
        type: 'commit',
        commitment: {
          ...commitment,
          id,
          from: Math.round(commitment.from * MINUTE),
          until: Math.round(commitment.until * MINUTE),
        },
      },
    }),
  ]);
  return p.agenda.commitments.find((d) => d.id === id)!;
}
export function releaseCommitment(p: Old.Person, id: string) {
  const c = community(p);
  c.serve(c.at + 1, [
    c.input('agenda.requested', {
      person: p.id,
      request: { type: 'release', commitmentId: id, authority: 'commander' },
    }),
  ]);
}
export function reviewed(p: Old.Person) {
  const c = community(p);
  c.serve(c.at + 1, [
    c.input('review.requested', { person: p.id, reason: 'The resident reviews the current task.' }),
  ]);
}
export function socialEvent(
  p: Old.Person,
  event: {
    otherId: string;
    kind:
      | 'help'
      | 'harm'
      | 'gift'
      | 'insult'
      | 'thanks'
      | 'apology'
      | 'forgive'
      | 'promise-kept'
      | 'promise-broken'
      | 'chat'
      | 'conflict'
      | 'praise'
      | 'deceit-discovered'
      | 'shared-work';
    byMe?: boolean;
    magnitude: number;
    at: number;
  },
) {
  const c = community(p);
  c.serve(c.at + 1, [
    c.input('social.received', {
      person: p.id,
      evidenceId: `social:${c.sequence + 1}`,
      other: event.otherId,
      event: { kind: event.kind, byMe: event.byMe ?? false, magnitude: event.magnitude },
    }),
  ]);
}
export function communityOwner(p: Old.Person): object {
  return community(p).run;
}
/** Retained Run clock, or its read-only minute projection in a detached UI snapshot. */
export function communityTime(p: Old.Person): number {
  return links.get(p)?.at ?? Math.round(p.now * MINUTE);
}
/** Mutating host transitions require a registered Run, never a detached display projection. */
export function registeredCommunityTime(p: Old.Person): number {
  return community(p).at;
}
export function archiveCommunity(p: Old.Person) {
  return archive(community(p).run);
}
export function verifyCommunity(p: Old.Person) {
  return need(replay(archiveCommunity(p)));
}
export function snapshot(p: Old.Person) {
  return archiveCommunity(p);
}
export function isContinuingCommitment(
  agenda: Old.Person['agenda'],
  c: Old.Person['agenda']['commitments'][number],
) {
  return c.status === 'pending' || agenda.owed?.some((d) => d.ofId === c.id) === true;
}
export function inspectPortable(p: Old.Person, castRevision: string) {
  const c = community(p);
  if (
    c.active.some((a) => a.person === p.id) ||
    (c.pending?.boundary.type === 'world-required' &&
      c.pending.boundary.requests.some((r) =>
        r.kind === 'action' ? r.person === p.id : r.speaker === p.id || r.recipients.includes(p.id),
      ))
  )
    throw new Error('Finish the current activity before leaving.');
  return need(
    inspect(c.run, {
      perspective: { kind: 'host' },
      people: [p.id],
      select: ['persona', 'calendar'],
      portable: { person: p.id, castId: p.id, castRevision },
    }),
  );
}
export function previewCommunity(p: Old.Person) {
  const c = community(p);
  return need(
    preview(c.run, {
      perspective: { kind: 'person', observer: p.id },
      person: p.id,
      until: c.at + MINUTE,
      inputs: [],
    }),
  );
}

/** Declare remembered native world references without asserting that old work remains available. */
function retainedWorld(c: Community, portable: PortablePerson): RunSpec {
  if (portable.version !== 2) return c.spec;
  const retained = portable.retained,
    refs = new Set<string>();
  for (const episode of [...retained.memory.episodes, ...retained.memory.gists])
    for (const id of [episode.actorId, episode.targetId, episode.placeId]) if (id) refs.add(id);
  for (const duty of retained.agenda.commitments) {
    if (duty.toId) refs.add(duty.toId);
    if (duty.targetId) refs.add(duty.targetId);
    if (duty.status === 'pending' && duty.targetId?.startsWith('day:'))
      throw new Error('An unfinished task cannot continue at this new opening. Keep the source chapter.');
  }
  for (const expectation of retained.memory.expectations) {
    if (actions.includes(expectation.key)) continue;
    const action = actions.find((id) => expectation.key.startsWith(`${id}@`));
    if (action) refs.add(expectation.key.slice(action.length + 1));
  }
  const facts = [...c.spec.world.facts],
    known = new Set([...c.authors.map((p) => p.id), ...facts.map((f) => f.subject)]);
  const native = (id: string) =>
    ['commander', 'yard', 'quay', 'courtyard', 'town'].includes(id) ||
    /^peer:[1-9][0-9]{0,3}$/.test(id) ||
    /^day:v[1-8]:(?:gather:(?:wood|stone|food)|map:(?:yard|quay|courtyard)|move:ground|inspect:cache|story:share-story|scene:(?:correction|visit|telescope|letter|trial)|talk:(?:talk|peer:[1-9][0-9]{0,3})|spar:spar|build:b[1-9][0-9]{0,3}|yield:v[1-8]\/v[1-8]:[0-9]{1,4})$/.test(
      id,
    );
  for (const subject of [...refs].sort())
    if (!known.has(subject)) {
      if (portable.source.game !== 'commonstead' || !native(subject))
        throw new Error(
          'This saved history refers to an unsupported place, person or task. Keep the source chapter.',
        );
      facts.push({
        id: `entity:${subject}`,
        subject,
        predicate: 'host-reference-definition',
        value: { host: 'commonstead', historical: true },
        at: START,
        provenance: { source: HOST.id, evidenceId: `authored-reference:${subject}` },
      });
    }
  return { ...c.spec, world: { ...c.spec.world, facts: facts.sort((a, b) => a.id.localeCompare(b.id)) } };
}
export function admitRetained(p: Old.Person, portable: PortablePerson) {
  const c = community(p);
  if (c.at !== START) throw new Error('Retained residents can join only at a new opening.');
  const a = c.authors.find((a) => a.id === p.id);
  if (!a) throw new Error('Unknown opening resident');
  const incoming = structuredClone(a);
  incoming.biography = [];
  incoming.state.beliefs = [];
  incoming.state.expectations = [];
  incoming.state.sourceTrust = [];
  incoming.state.heldNorms = [];
  incoming.state.agenda.commitments = [];
  incoming.state.agenda.owed = [];
  incoming.state.agenda.goals = [];
  incoming.state.agenda.precommitments = [];
  if (portable.version === 2)
    incoming.identity.birthAt = portable.retained.bornAt + START - portable.retained.at;
  incoming.portable = {
    person: portable,
    mapping: { offsetMs: portable.version === 2 ? START - portable.retained.at : 0, references: [] },
  };
  const authors = c.authors.map((person) => (person.id === p.id ? incoming : person));
  const spec = retainedWorld(c, portable);
  const candidate = need(createRun(spec));
  for (const person of authors) need(author(candidate, person));
  c.authors = authors;
  c.spec = spec;
  c.run = candidate;
  p.life = { ...p.life, bornAt: incoming.identity.birthAt / MINUTE };
  p.values = { ...p.values, ...structuredClone(portable.state.values) };
  c.read();
  return p;
}
export function converse(
  speaker: Old.Person,
  listener: Old.Person,
  opts: {
    at: number;
    placeId: string;
    topics: string[];
    provenance?: boolean;
    phrase?: (claim: { prop: string; value: boolean }, summary: string) => string;
  },
) {
  const c = community(speaker);
  if (community(listener) !== c) throw new Error('Conversation requires one community');
  const r = c.serve(c.at + 1, [
    c.input('conversation.requested', {
      speaker: speaker.id,
      listener: listener.id,
      topicIds: opts.topics,
      maxClaims: 4,
      temptations: [],
      loyalWarning: false,
    }),
  ]);
  const told: Old.Percept[] = r.events.flatMap((e) =>
    e.data.kind === 'claim-told'
      ? [
          {
            at: e.at / MINUTE,
            channel: 'told' as const,
            kind: 'told',
            actorId: speaker.id,
            targetId: listener.id,
            salience: 0.6,
            summary: e.narration.map((n) => n.text).join(' '),
          },
        ]
      : [],
  );
  return { told, advice: [] as { percept: Old.Percept }[], socialEvents: { speaker: [], listener: [] } };
}
/** Restore the exact run only after the independent game log has matched it. */
export function restoreCommunity(p: Old.Person, saved: DeepReadonly<RunArchive>) {
  const c = community(p);
  // Public restore validates and replays the complete journal. The independently
  // reconstructed game must produce that same archive before the restored Run joins it.
  const restored = need(restoreRun(saved));
  if (saved.hashes.full !== archive(c.run).hashes.full)
    throw new Error('The game log and HF archive disagree.');
  c.run = restored;
  c.read();
}

/** Exact public host resolutions already accepted by the Run; no synthesized receipt. */
export function actionResolutions(
  p: Old.Person,
  activityId: string,
): Extract<Input, { kind: 'action.resolved' }>[] {
  return readRunHistory(archiveCommunity(p))
    .flatMap((transaction) => transaction.inputs)
    .filter(
      (input): input is Extract<Input, { kind: 'action.resolved' }> =>
        input.kind === 'action.resolved' &&
        input.payload.person === p.id &&
        input.payload.activityId === activityId,
    )
    .map((input) => structuredClone(input));
}
