/** Host data shapes, expressed in game minutes. No actor implementation lives here. */
import type {
  ObservedOutcome,
  Offer,
  PerceptData,
  PersonAuthoring,
  RunArchive,
} from '@adam0white/human-framework';

type Actor = RunArchive['current']['people'][string];
type KernelDecision = Extract<
  RunArchive['current']['events'][number]['data'],
  { kind: 'decision' }
>['decision'];
export type DecisionRecord = KernelDecision & {
  at: number;
  narration: string;
  suggestion?: NonNullable<KernelDecision['suggestion']> & { says: string };
};
export type Affordance = {
  id: string;
  action: string;
  label: string;
  duration: number;
  effort?: number;
  focus?: number;
  mode?: 'awake' | 'sleep';
  requires?: Offer['demands']['requires'];
  advertises?: Offer['expected']['needs'];
  tags?: readonly string[];
  norms?: Offer['norms'];
  with?: string[];
  material?: number;
  targetId?: string;
  placeId?: string;
};
export type Activity = {
  id: string;
  affordanceId: string;
  action: string;
  targetId?: string;
  startedAt: number;
  endsAt: number;
  reviewAt: number;
  protest?: boolean;
  effort?: number;
};
export type Person = Pick<
  Actor,
  | 'id'
  | 'name'
  | 'now'
  | 'life'
  | 'traits'
  | 'values'
  | 'agenda'
  | 'body'
  | 'skills'
  | 'will'
  | 'social'
  | 'rng'
> & {
  schema: number;
  engine: string;
  lexicon: { plainEnglish: boolean };
  activity: Activity | null;
  trace: DecisionRecord[];
  /** Copied public HF inspection for detached, read-only file views. */
  bodyReadout?: BodyReadout;
};
export type PersonSpec = {
  id: string;
  name: string;
  seed: number;
  now?: number;
  bornAt?: number;
  sex?: 'female' | 'male';
  traits?: Partial<PersonAuthoring['state']['traits']>;
  values?: Partial<PersonAuthoring['state']['values']>;
  body?: Partial<PersonAuthoring['state']['body']>;
  voices?: PersonAuthoring['state']['voices'];
  lexicon?: unknown;
};
export type Percept = Partial<Omit<PerceptData, 'occurredAt' | 'demonstrates'>> & {
  at: number;
  channel: PerceptData['channel'];
  kind: string;
  salience: number;
  summary: string;
};
export type DecideOptions = {
  suggestion?: { voiceId: string; action: string; strength: number; insist?: boolean; affordanceId?: string };
};
export type Outcome = {
  affordanceId?: string;
  action: string;
  targetId?: string;
  at: number;
  status: ObservedOutcome['status'];
  summary?: string;
  quality?: number;
  actual?: Record<string, number>;
  needs?: Offer['expected']['needs'];
  material?: number;
};
export type BodyReadout = Actor['body'] extends never
  ? never
  : Extract<
      Extract<import('@adam0white/human-framework').PersonView, { kind: 'host' }>['parts'][number],
      { select: 'body' }
    >['value']['readout'];
