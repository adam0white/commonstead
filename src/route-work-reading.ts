import { residentName } from './display.ts';
import { MAPS } from './paths.ts';
import { dayClock, type Job } from './settlement.ts';
import type { State, Villager } from './sim.ts';

/** Scope: read-only current host work/route facts and dated public yield events. No Person
 * internals, cache census, forecast, saved observations or simulated future choices. Current
 * holders are never attributed to an earlier collision; a request is not a completed yield.
 */
export function routeWorkReading(s: State, v: Villager): string {
  const w = s.settlement,
    a = w?.actors[v.id];
  if (!w || !a) return '';
  const name = (id: string) => {
    const person = s.villagers.find((p) => p.id === id);
    return person ? residentName(person) : 'an unnamed resident';
  };
  const pair = (ids: readonly string[]) => ids.map(name).join(' and ');
  const date = (tick: number) => dayClock({ ...s, tick });
  const route = w.dispute
    ? `${pair(w.dispute)} dispute the route${w.disputeAt === null ? '; its start time is unknown' : `, recorded at ${date(w.disputeAt)}`}.`
    : 'No route dispute is open.';
  const holder = w.trolley
    ? `${name(w.trolley)} holds the shared trolley now.`
    : 'Nobody holds the shared trolley now.';
  const agreements = w.routeAgreements.length
    ? `Recorded pair agreements: ${w.routeAgreements.map((p) => pair(p.split('/'))).join('; ')}. These do not expire.${w.dispute && !w.routeAgreements.includes([...w.dispute].sort().join('/')) ? ' The current dispute concerns a different pair from those agreements.' : ''}`
    : 'No completed pair agreement is recorded.';
  const yieldEvent = w.events.findLast((e) =>
    e.text.endsWith(' yields the shared trolley route after choosing to make room.'),
  );
  const earlier = yieldEvent ? `At ${date(yieldEvent.at)}: ${yieldEvent.text}` : '';
  const j = a.job,
    run = a.running;
  let work: string;
  if (!j)
    work = a.carried
      ? `Delivery is unfinished: the held ${material(a.carried.resource)} are not counted stock. No return trip is requested; choose Bring carried materials to the hub.`
      : '';
  else {
    const target = workTarget(s, j);
    if (a.carried)
      work = `Delivery is unfinished: bring the held ${material(a.carried.resource)} to the workshop hub. The load is not counted stock yet.${j.kind === 'gather' ? ` Earlier collection point: ${MAPS[j.sourceMap ?? j.map].name}.` : ''}`;
    else if (j.kind === 'yield')
      work =
        run?.purpose === 'job' && run.job?.kind === 'yield'
          ? 'Yield is underway; it has not completed or resolved the dispute yet.'
          : 'Yield has not begun. This request has not resolved the dispute.';
    else if (j.kind === 'gather' || j.kind === 'build') {
      const stage =
        run?.purpose === 'job'
          ? 'Work is underway.'
          : run?.purpose === 'travel' || a.path.length || a.map !== j.map
            ? 'Travel is unfinished.'
            : 'Work has not begun.';
      work = `${target} ${stage}`;
      if (j.kind === 'gather') {
        if (w.dispute)
          work += ' New gathering waits for this dispute to be resolved; current acts can finish.';
        else if (w.trolley && w.trolley !== v.id)
          work += ` New gathering waits while ${name(w.trolley)} holds the trolley.`;
        work += ' Supplies remaining at the collection point are unknown in this reading.';
      }
    } else work = target;
    if (a.pendingRequest)
      work += ' The request is waiting for the next action choice; no willing response is promised.';
    if (run?.purpose === 'body')
      work += ` The current personal activity (${v.task}) comes before another work choice; its reason is unknown here.`;
    else if (!run && v.status === 'waiting / refused')
      work += ' The last choice left this resident waiting or refusing. Its reason is unknown here.';
  }
  const pause = s.chapterPaused
    ? 'The chapter is paused; no work advances.'
    : s.pauseRequested
      ? 'A chapter pause is requested; current acts may finish before it pauses.'
      : s.ended
        ? 'This day has ended; no work advances.'
        : '';
  return [work, pause, route, holder, agreements, earlier].filter(Boolean).join(' ');
}

function material(resource: string): string {
  return resource === 'wood' ? 'prepared boards' : resource === 'stone' ? 'ballast bags' : 'meals';
}
function workTarget(s: State, j: Job): string {
  if (j.kind === 'gather')
    return `Collection target: ${material(j.target)} at ${MAPS[j.sourceMap ?? j.map].name}.`;
  if (j.kind === 'build') {
    const b = s.buildings.find((b) => b.id === j.target);
    return b
      ? `Building target: ${b.kind === 'house' ? 'guest cabin' : b.kind === 'town' ? 'workshop hub' : 'storehouse'} at ${j.point.x}, ${j.point.y}${b.complete ? ', already complete' : `, ${Math.floor(b.progress * 100)}% assembled`}.`
      : 'The requested building is no longer present.';
  }
  return `Request location: ${MAPS[j.map].name}, ${j.point.x}, ${j.point.y}.`;
}
