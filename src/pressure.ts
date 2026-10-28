/**
 * Scope: the default short chapter under `pressure/1` (native schema 8) only.
 * Tiredness slows gathering and assembly, the storm checks who is under a roof and
 * how many meals the dry store keeps for the storm day, and the ending composes each
 * resident's reaction from what actually happened to them (`State.record`, written only by
 * accepted commands). Legacy schemas 3–7 never read this module. Reads HF state through readPerson.
 */

import { residentName } from './display.ts';
import { type Person, readPerson } from './hf4';
import type { State, Villager } from './sim.ts';

export const PRESSURE = 'pressure/1';
/** Assembly effort of the storehouse in person-seconds at full pace (legacy: 180). */
export const STORE_EFFORT = 280;
/** Meals the dry store must keep per person for the storm day indoors. */
export const STORM_MEALS = 5;
export const PRESSURE_FOOD = 30;
export const PRESSURE_OPENING =
  'You are at the Mill Bridge workshop. Assemble the storehouse before the storm at 10:00. Tired people work slowly. Other people are covering Dai’s and Nerys’s usual work.';

/** Work pace from how tired the person feels: full below 0.3, never under a quarter. */
export function workPace(v: Villager): number {
  const tired = readPerson(v.person).body.perceived.fatigue;
  return Math.max(0.25, 1 - Math.max(0, tired - 0.3) * 2);
}

export function tiredWords(v: Villager): string {
  return tiredOf(v.person);
}

/** How tired the person says they feel, in words. */
export function tiredOf(person: Person): string {
  const f = readPerson(person).body.perceived.fatigue;
  return f < 0.25 ? 'rested' : f < 0.4 ? 'a little tired' : f < 0.6 ? 'tired' : 'very tired';
}

export function paceWords(v: Villager): string {
  const p = workPace(v);
  return p > 0.9 ? 'at full pace' : p > 0.65 ? 'a little slower' : p > 0.45 ? 'slowly' : 'very slowly';
}

/** What the player actually did to one resident under these rules. */
export type Treatment = { pushed: number; breaks: number; asked: boolean; store: boolean; cabin: boolean };

/** Record an accepted command's effect on a resident. No-op outside `pressure/1`. */
export function note(s: State, id: string, change: Partial<Treatment> & { push?: true; rest?: true }): void {
  if (!s.rules) return;
  s.record ??= {};
  s.record[id] ??= { pushed: 0, breaks: 0, asked: false, store: false, cabin: false };
  const t = s.record[id];
  if (change.push) t.pushed++;
  if (change.rest) t.breaks++;
  if (change.asked) t.asked = true;
  if (change.store) t.store = true;
  if (change.cabin) t.cabin = true;
}

/** Under a roof: in the workshop hub yard (where residents start) or beside a finished building. */
export function indoors(s: State, v: Villager): boolean {
  return s.buildings.some(
    (b) =>
      (b.kind === 'town' || b.complete) && Math.hypot(b.x - v.x, b.y - v.y) < (b.kind === 'town' ? 160 : 45),
  );
}

export function mealsNeeded(s: State): number {
  return STORM_MEALS * s.villagers.length;
}

/** What is still to decide once the storehouse is done. Plain words, no promises. */
export function beforeStorm(s: State): string {
  const outside = s.villagers.filter((v) => !indoors(s, v)).length;
  const short = Math.ceil(mealsNeeded(s) - s.resources.food);
  const tired = s.villagers.filter((v) => readPerson(v.person).body.perceived.fatigue >= 0.6).length;
  const parts = [
    short > 0
      ? `The storm keeps everyone indoors tomorrow. The store needs ${short} more meals for that day.`
      : 'The store has enough meals for the storm day.',
    outside
      ? `${outside === s.villagers.length ? 'Everyone is' : outside === 1 ? 'One person is' : `${outside} people are`} outside. Bring people under a roof before 10:00: the workshop hub or a finished building.`
      : 'Everyone is under a roof.',
  ];
  if (tired) parts.push(`${tired === 1 ? 'One person is' : `${tired} people are`} very tired.`);
  return parts.join(' ');
}

function facts(s: State, v: Villager) {
  const t = s.record?.[v.id] ?? { pushed: 0, breaks: 0, asked: false, store: false, cabin: false };
  return { ...t, offered: t.breaks, built: t.store, inside: indoors(s, v) };
}

/** Of the fetching jobs, the one this resident was sent to most often, read from the input log. */
function mainFetch(s: State, v: Villager): 'food' | 'wood' | 'stone' | '' {
  const count: Record<string, number> = {};
  for (const { command: c } of s.inputs)
    if (c.kind === 'order' && c.ids.includes(v.id) && ['food', 'wood', 'stone'].includes(c.target))
      count[c.target] = (count[c.target] ?? 0) + 1;
  return (['wood', 'stone', 'food'] as const).reduce<'food' | 'wood' | 'stone' | ''>(
    (a, k) => ((count[k] ?? 0) > (a ? (count[a] ?? 0) : 0) ? k : a),
    '',
  );
}

/**
 * Each resident's own voice, by cast order (Nora, Sam, Dai, Nerys, Dilek, Burak, Sevim, Oskar):
 * [no story heard, after the storm was won], [no story, lost], [story heard], [collaboration done].
 * Story lines refer only to what that resident already said on screen.
 */
const OWN: readonly (readonly [string, string, string, string])[] = [
  [
    'The storehouse door handle is plain. I want someone to try it before I call it finished.',
    'Next time I would design the frame so fewer people can put it up faster.',
    'I still have not asked the person who will use that handle. I mean to.',
    'The easier grip is back on the drawing. Someone can test it tomorrow.',
  ],
  [
    'I watched how the storehouse joints fit together. I learned a lot.',
    'I will write down what went wrong, exactly as it happened.',
    'I still need to correct that old report where I shared it.',
    'My game note says only what I tried. That feels better.',
  ],
  [
    'Thirty-one years at the dam, and a storm still makes me check everything twice.',
    'At the dam we would have started a day earlier. I should have said so.',
    'I said out loud that I liked being needed. That was hard.',
    'The inspection card is on the wall. Nora can question it.',
  ],
  [
    'The river will rise tonight. I will check its level in the morning.',
    'The river will rise tonight, and our supplies are out in it.',
    'Now you know about the telescope. Please keep it off the inn’s sign.',
    'If the clouds clear after the storm, the dark corner is ready.',
  ],
  [
    'Tomorrow I will plan the storm-day meals from what is in the store.',
    'Tomorrow I will cook from whatever stayed dry.',
    'The rain on the roof will make a good recording. No voices, of course.',
    'I have the rattle of that lid. That recording is just for me.',
  ],
  [
    'I counted what went into the store. The numbers will help tomorrow.',
    'I will have to write down what the storm cost us.',
    'The paper ferry is still in my pocket.',
    'The paper ferry waits on the shared table. The shared money stays separate.',
  ],
  [
    'I will write a plain record of today so everyone can read it.',
    'I will write down honestly what happened today.',
    'I keep thinking about that pupil. I have not admitted what I did wrong.',
    'My note to that pupil is drafted. I have not sent it.',
  ],
  [
    'I did not take a single photo today. It did not feel right.',
    'I could photograph the soaked supplies. I will not.',
    'I still need to correct that old caption.',
    'The new caption is accurate. It is less exciting, and that is fine.',
  ],
];

function shelterOf(s: State, v: Villager): string {
  const hub = s.buildings.find((b) => b.kind === 'town');
  if (hub && Math.hypot(hub.x - v.x, hub.y - v.y) < 160) return 'at the workshop hub';
  const near = s.buildings.find(
    (b) => b.complete && b.kind !== 'town' && Math.hypot(b.x - v.x, b.y - v.y) < 45,
  );
  return near?.kind === 'house' ? 'in the guest cabin' : 'in the storehouse';
}

/** One resident's reaction at the storm, composed from what happened to them in this run. */
export function closingLine(s: State, v: Villager): string {
  const f = facts(s, v);
  const tired = tiredWords(v);
  const said: string[] = [];
  if (f.pushed >= 2) said.push('You kept insisting that I keep working. I will remember that.');
  else if (f.pushed === 1) said.push('You insisted once that I keep working. I did not like it.');
  else if (f.offered) said.push('You gave me a break when I needed one.');
  else if (tired === 'very tired') said.push('Nobody offered me a break, and I am worn out.');
  const own = OWN[Number(v.id.slice(1)) - 1];
  if (own) said.push(own[v.discovery >= 2 ? 3 : v.discovery === 1 ? 2 : s.won ? 0 : 1]);
  // Building comes from accepted orders only (`note`); fetching is ranked from the input log.
  const fetch = f.asked && !f.built && !f.cabin ? mainFetch(s, v) : '';
  said.push(
    !f.asked
      ? 'Nobody asked me to help today. I watched from the side.'
      : f.built
        ? s.won
          ? 'I helped put the storehouse up before the rain.'
          : 'I worked on the storehouse, but we ran out of time.'
        : f.cabin
          ? 'I worked on the guest cabin.'
          : fetch === 'stone'
            ? `I hauled ballast bags${s.won ? ' for the storehouse' : ', and they got soaked'}.`
            : fetch === 'food'
              ? `I gathered meals${s.won ? ' for the dry store' : ', and they got soaked'}.`
              : fetch === 'wood'
                ? `I carried boards${s.won ? ' for the storehouse' : ', and they got soaked'}.`
                : 'I helped where I was asked.',
  );
  said.push(
    f.inside ? `I am ${tired}, and dry ${shelterOf(s, v)}.` : 'The rain caught me outside. I am soaked.',
  );
  return said.join(' ');
}

/** Workshop-wide outcome lines, in words rather than tallies where possible. */
export function stormSummary(s: State): string[] {
  const inside = s.villagers.filter((v) => indoors(s, v)).length;
  const all = s.villagers.length;
  const meals = s.resources.food;
  const need = mealsNeeded(s);
  return [
    !s.won
      ? 'The meals and boards in the open got soaked. The storm day will be hungry.'
      : meals >= need
        ? 'The dry store keeps enough meals for everyone through the storm day.'
        : meals >= need / 2
          ? 'The dry store keeps meals for about half of the storm day. People will eat less.'
          : 'The dry store holds very few meals. People will be hungry through the storm day.',
    inside === all
      ? 'Everyone was under a roof when the rain came.'
      : inside === 0
        ? 'Nobody was under a roof when the rain came.'
        : inside >= all / 2
          ? `${inside * 2 === all ? 'Half the people were indoors.' : 'Most people were indoors.'} ${s.villagers
              .filter((v) => !indoors(s, v))
              .map((v) => residentName(v))
              .join(', ')} got caught in the rain.`
          : 'Most people were caught outside in the rain.',
  ];
}
