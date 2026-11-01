import { DISCOVERIES } from './cast.ts';
import { nextTask, personStatus, residentName } from './display.ts';
import type { Person } from './hf4';
import { MAPS } from './paths.ts';
import { beforeStorm, indoors, paceWords, tiredOf } from './pressure.ts';
import { routeWorkReading } from './route-work-reading.ts';
import type { Job } from './settlement.ts';
import type { State, Villager } from './sim.ts';
import type { StoryChoice } from './story-content.ts';
import { shortConversationReason, storyReason } from './story-records.ts';
import { orderNotice, returnTiming } from './work-orders.ts';

/** Presentation only. Observe host break clocks, visible task transitions and how tired
 * a person says they feel before and after a break (read-only). No simulation writes or saved state.
 * History covers this open play view; loading a run does not invent earlier observations.
 */
type Worker = {
  id: string;
  name: string;
  status: string;
  task: string;
  recoveryUntil: number;
  order: { target: string } | null;
  person?: Person;
};
type Site = { id: string; kind: string };
export class WorkObservation {
  private dayBreaks = new Map<string, { id: string; until: number; task: string }>();
  private breaks = new Map<string, { until: number; task: string; before: string }>();
  private outcomes = new Map<string, string>();

  observe(tick: number, people: readonly Worker[], buildings: readonly Site[]) {
    for (const v of people) {
      const prior = this.breaks.get(v.id);
      if (prior && (v.recoveryUntil !== prior.until || tick >= prior.until)) {
        const clock = `${Math.floor(tick / 60)}:${String(tick % 60).padStart(2, '0')}`;
        const name = residentName(v);
        const after = v.person ? tiredOf(v.person) : '';
        const change = !after
          ? ''
          : prior.before === after
            ? ` The break did not change how tired ${name} feels: still ${after}.`
            : ` ${name} felt ${prior.before} before the break and feels ${after} now.`;
        this.outcomes.set(
          v.id,
          tick >= prior.until
            ? `At ${clock}, ${name} finished ${prior.task === 'resting' ? 'resting' : prior.task === 'drinking' ? 'drinking' : 'eating and drinking'}.${change} Afterward, ${name} ${this.current(v, buildings)}`
            : `${name}'s ${prior.task === 'resting' ? 'rest' : 'meal or drink'} ended before the planned end.${change}`,
        );
        this.breaks.delete(v.id);
      }
      if (v.recoveryUntil > tick) {
        const before =
          prior && prior.until === v.recoveryUntil ? prior.before : v.person ? tiredOf(v.person) : '';
        this.breaks.set(v.id, { until: v.recoveryUntil, task: v.task, before });
      }
    }
  }

  observeState(s: State): void {
    if (!s.settlement) {
      this.observe(s.tick, s.villagers, s.buildings);
      return;
    }
    for (const v of s.villagers) {
      const run = s.settlement.actors[v.id]?.running;
      const prior = this.dayBreaks.get(v.id);
      if (prior && (!run || run.id !== prior.id || run.until !== prior.until || s.tick >= prior.until)) {
        this.outcomes.set(
          v.id,
          `${residentName(v)}'s observed ${prior.task} ${s.tick >= prior.until ? 'ended at its planned time' : 'ended before its planned time'}. Current activity is shown above.`,
        );
        this.dayBreaks.delete(v.id);
      }
      if (run?.purpose === 'body' && ['rest', 'eat', 'drink', 'sleep'].includes(run.action)) {
        this.dayBreaks.set(v.id, { id: run.id, until: run.until, task: v.task });
      }
    }
  }

  private current(v: Worker, buildings: readonly Site[]): string {
    if (v.order && ['working', 'working under protest', 'moving'].includes(v.status)) {
      const task = nextTask(v.order.target, buildings);
      return v.status === 'moving'
        ? `is on the way to ${task}.`
        : `is working, ${task}${v.status === 'working under protest' ? ' under protest' : ''}.`;
    }
    return personStatus(v.status, buildings, residentName(v));
  }

  summary(s: State, v: Villager, details = true): string {
    const aw = s.settlement?.actors[v.id];
    const recovery = this.outcomes.get(v.id) ?? 'No break has ended since this view was opened.';
    const pace = s.rules
      ? ` ${residentName(v)} feels ${tiredOf(v.person)}, works ${paceWords(v)} and is ${indoors(s, v) ? 'under a roof' : 'outside'}.`
      : '';
    if (!aw) {
      const request = v.order
        ? `Retained request: ${nextTask(v.order.target, s.buildings)}.`
        : 'No work request is retained.';
      const now =
        v.recoveryUntil > s.tick
          ? `Now: ${residentName(v)} is ${v.task.replace(' / ', ' and ')}. This break has ${v.recoveryUntil - s.tick} game seconds left.`
          : `Now: ${residentName(v)} ${this.current(v, s.buildings)}`;
      return `${now}${pace} ${request} ${returnTiming(s, v)}${details ? ` ${recovery} Last words: “${v.says || 'No words recorded.'}”` : ''}`;
    }
    const running = aw.running;
    const now = running
      ? `Now: ${residentName(v)} is ${v.task}. This act is planned for ${Math.max(0, running.until - s.tick)} more game seconds.`
      : `Now: ${residentName(v)} ${personStatus(v.status, s.buildings, residentName(v))}`;
    const request = aw.job
      ? `${aw.pendingRequest ? 'Request waiting for the next action choice' : 'Retained request'}: ${jobText(aw.job)}. ${running?.purpose === 'body' ? 'The current personal activity is separate from this request.' : ''}`
      : 'No work request is retained.';
    const carrying = aw.carried
      ? `Carrying: about ${Math.floor(aw.carried.amount * 10) / 10} ${material(aw.carried.resource)}, not yet in the shared store.`
      : 'No supplies are being carried.';
    return `${now} Location: ${MAPS[aw.map].name}. ${request} ${carrying} ${routeWorkReading(s, v)} ${returnTiming(s, v)}${details ? ` Last words: “${v.says || 'No words recorded.'}” ${recovery}` : ''}`;
  }

  line(v: Worker, tick: number, buildings: readonly Site[]): string {
    const remaining =
      v.recoveryUntil > tick ? ` ${v.recoveryUntil - tick} seconds remain in this break.` : '';
    return `Now: ${residentName(v)} ${this.current(v, buildings)}${remaining}${this.outcomes.has(v.id) ? ` ${this.outcomes.get(v.id)}` : ''}`;
  }
}

function material(resource: string): string {
  return resource === 'wood' ? 'prepared boards' : resource === 'stone' ? 'ballast bags' : 'meals';
}
function jobText(j: Job): string {
  if (j.kind === 'gather') return `collect and return ${material(j.target)}`;
  if (j.kind === 'build') return 'work at the building site';
  if (j.kind === 'map' || j.kind === 'move') return `walk to ${MAPS[j.map].name}`;
  return {
    inspect: 'inspect the supplies',
    story: 'consider sharing a private story',
    talk: 'consider a conversation with another resident',
    yield: 'consider yielding the trolley route',
    spar: 'consider a voluntary practice bout',
    scene: 'consider the offered collaboration',
  }[j.kind];
}

/** Authored host prerequisites only. Eligibility never promises a willing response. */
export function invitationReadiness(
  s: State,
  ids: readonly string[],
  action: 'listen' | 'collaborate',
): string {
  const people = s.villagers.filter((v) => ids.includes(v.id));
  if (people.length !== 1) return 'Select one person to see the conversation requirements.';
  const v = people[0];
  if (!v) return '';
  if (!s.settlement && !DISCOVERIES[Number(v.id.slice(1)) - 1])
    return 'This helper has no authored private conversation in this chapter.';
  if (s.ended) return 'This day has ended.';
  if (s.pauseRequested || s.chapterPaused) return 'Resume this game before making a request.';
  if (!s.settlement && s.tick < v.availableAt)
    return `This resident has a usual responsibility for ${v.availableAt - s.tick} more game seconds.`;
  if (s.tick < 60)
    return `Wait ${60 - s.tick} game seconds ${s.settlement ? 'before inviting a private story' : 'until the clock reaches 1:00'}. The clock counts at every speed. Pauses do not count. No shared location is required.`;
  if (s.settlement)
    return 'A private story can be requested now. During a work or travel act, wait for it to finish and ask again, or explicitly cancel it first. An accepted request can wait through a personal activity such as rest; the resident may still decline. Later collaborations have their own time, place and material requirements.';
  if (action === 'collaborate') {
    const names = ['nora', 'sam', 'dai', 'nerys', 'dilek', 'burak', 'sevim', 'oskar'];
    return (
      storyReason(s, v.id, `collaboration-${names[Number(v.id.slice(1)) - 1]}` as StoryChoice) ||
      'The disclosure is recorded. You can offer its collaboration; the resident may choose a need instead.'
    );
  }
  const reason = shortConversationReason(s, v.id, 'disclosure');
  if (reason) return reason;

  if (v.discovery === 2)
    return 'The small collaboration has already been shown. This chapter has no further conversation step.';
  if (!v.invitedBreak && v.recoveryUntil > s.tick)
    return 'This break was not offered by you. Offer this person a break before inviting the conversation or collaboration.';
  if (!v.invitedBreak || v.recoveryUntil <= s.tick)
    return 'Offer this person a break, then invite the conversation or collaboration during that break.';
  if (s.tick - v.breakStarted < 5)
    return `Wait ${5 - (s.tick - v.breakStarted)} game seconds during this break before asking.`;
  return `The time and break requirements are met; ${v.recoveryUntil - s.tick} game seconds remain in this break. The resident may still decline.${action === 'listen' && v.discovery === 1 ? ' The private conversation has already been heard; you can offer the small collaboration.' : ''}`;
}

/** Current world goal; stored warning/event bytes remain untouched. */
export function milestone(s: State): string {
  const store = s.buildings.find((b) => b.kind === 'storehouse');
  const storm = s.settlement ? '20:00' : '10:00';
  if (s.ended || s.settlement?.storm)
    return s.won
      ? 'The storm arrived. The supplies stayed dry.'
      : 'The storm arrived. The supplies got soaked.';
  if (store?.complete && s.rules)
    return `The storehouse is ready. The storm still arrives at 10:00. ${beforeStorm(s)}`;
  if (store?.complete)
    return `The storehouse is ready. The storm still arrives at ${storm}. Preparation is complete; the storm outcome is still ahead. Continue to watch it, or open the pause menu to save this place and stop here.`;
  return `Finish the storehouse before the storm at ${storm}.${store ? ` It is ${Math.floor(store.progress * 100)}% complete.` : ' It needs 180 boards and 120 ballast bags.'}`;
}

export function currentNotice(s: State): string {
  const notice = orderNotice(s);
  if (notice) return notice;
  if (
    s.buildings.some((b) => b.kind === 'storehouse' && b.complete) &&
    /Finish the storehouse/.test(s.message)
  )
    return milestone(s);
  return s.message;
}

/** Adjacent repetition is grouped only in the view; the source log is never edited. */
export function observedEvents(events: readonly { at: number; text: string }[]): string[] {
  const groups: { first: number; last: number; text: string; count: number }[] = [];
  for (const event of events) {
    const cache = /inspects the .* cache/.test(event.text);
    const prior = cache ? groups.find((g) => g.text === event.text) : groups.at(-1);
    if (prior?.text === event.text) {
      prior.last = event.at;
      prior.count++;
    } else groups.push({ first: event.at, last: event.at, text: event.text, count: 1 });
  }
  const clock = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  return groups
    .slice(-6)
    .map(
      (g) =>
        `${clock(g.first)}${g.count > 1 ? `–${clock(g.last)} (${g.count} times)` : ''} into this game: ${g.text}`,
    );
}

/** Counted central stores are the game's declared RTS exception, never a read of a person. */
export function supplyReadiness(s: State): string {
  if (s.buildings.some((b) => b.kind === 'storehouse'))
    return 'The storehouse materials have been spent on its site.';
  const boards = Math.max(0, Math.ceil(180 - s.resources.wood));
  const bags = Math.max(0, Math.ceil(120 - s.resources.stone));
  return `${boards ? `Collect ${boards} more boards.` : 'Boards are enough for the storehouse.'} ${bags ? `Collect ${bags} more ballast bags.` : 'Ballast bags are enough for the storehouse.'}`;
}
