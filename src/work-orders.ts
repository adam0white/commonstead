import { residentName } from './display.ts';
import { blocked, MAPS, route } from './paths.ts';
import { openPlacementGround } from './placement.ts';
import { NODES, type State, type Villager } from './sim.ts';

/** Scope: read-only public order consequences and host geometry. No new faculty, inputs,
 * saved defaults, body reads, predictions of assent, simulation writes or recovery promises.
 * Recorded pair/time and current requests are distinct; future work and travel times stay unknown.
 */
export function orderConsequences(s: State, ids: readonly string[]): string {
  if (s.settlement)
    return 'A new work or travel request during a work or travel act is rejected, not queued. Wait for that act to finish, then ask again, or explicitly cancel it first. An accepted request can wait through a personal activity, such as rest; the resident may choose another personal activity before work. Cancel selected tasks interrupts unfinished assembly and removes the work request. Yield replaces the yielding resident’s work request; ask for that work again afterward. Carried supplies must reach the hub before another work request.';
  const people = s.villagers.filter((v) => ids.includes(v.id));
  const retained = people.filter((v) => v.order && !['shelter', 'move'].includes(v.order.target)).length;
  return `Rest stops selected people’s assembly and gathering for 35 game seconds. ${retained} of ${people.length} selected people have a work request to consider again afterward. A person may choose another break.${s.rules ? ' Everyone rests gives this break to everyone not already recovering and keeps each current request. Go under a roof replaces selected work with a walk to the hub. Everyone under a roof does this for everyone. Assembly and gathering stop immediately. At the hub they wait; work does not return automatically. Rest there, then give a new work order when you want them to return. Travel time is unknown.' : ''}`;
}

export function returnTiming(s: State, v: Villager): string {
  if (s.settlement) {
    const aw = s.settlement.actors[v.id];
    if (aw?.carried)
      return `These supplies enter the store only on arrival at the hub. Arrival time is unknown.${aw.job ? '' : ' No return trip is requested; choose Bring carried materials to the hub.'}`;
    return aw?.job?.kind === 'yield'
      ? 'Yield replaces the earlier work request. It has not opened the route yet. After it finishes, request work again.'
      : '';
  }
  if (v.order?.target === 'shelter')
    return 'Walking to the hub replaces earlier work. Arrival time is unknown. At the hub this request ends; give a new work order to return.';
  if (v.recoveryUntil > s.tick)
    return v.order
      ? `This break ends at chapter time ${clock(v.recoveryUntil)}. The retained request is considered then; return travel and the next work choice can take longer.`
      : `This break ends at chapter time ${clock(v.recoveryUntil)}. No earlier work request is retained; give a new work order afterward.`;
  return '';
}

function clock(t: number): string {
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** Correct the old unconditional promise in the view, keeping its exact stored bytes. */
export function orderNotice(s: State): string | null {
  if (s.settlement || !/Work will resume after the (break|meal)\.$/.test(s.message)) return null;
  const last = s.inputs.at(-1)?.command;
  if (last?.kind !== 'order' || !['rest', 'meal'].includes(last.target)) return null;
  const people = s.villagers.filter((v) => last.ids.includes(v.id));
  const retained = people.filter((v) => v.order).length;
  return `${s.message.replace(/ Work will resume after the (break|meal)\.$/, '')} ${retained ? `${retained} of ${people.length} people retain a request. Read Now for each current activity and request; another personal activity may come first.` : 'No earlier work request is retained. Give a new work order when the break is over.'}`;
}

export function routeCause(s: State): string {
  const w = s.settlement;
  if (!w) return '';
  const names = (ids: readonly string[]) =>
    ids
      .map((id) => {
        const v = s.villagers.find((v) => v.id === id);
        return v ? residentName(v) : id;
      })
      .join(' and ');
  const current = w.dispute
    ? `At ${clock(w.disputeAt ?? 0)} into this game, ${names(w.dispute)} reached the narrow trolley route together without an agreement for their pair. One resident was using the trolley; the other tried to gather nearby on the same map. New gathering waits. Current acts and carried deliveries can still finish. Only a completed, accepted yield opens this dispute.`
    : 'There is no current route dispute.';
  return `${current} Each completed yield records an agreement for that pair only; it does not expire. Other pairs can still dispute the route. ${w.routeAgreements.length ? `Recorded agreements: ${w.routeAgreements.map((pair) => names(pair.split('/'))).join('; ')}.` : 'No pair agreement is recorded.'} Talking and practice do not open the route.`;
}

export function materialFlow(s: State): string {
  const w = s.settlement;
  if (!w) return '';
  const carrying = Object.values(w.actors).filter((a) => a.carried);
  const count = (resource: string) =>
    carrying.reduce((sum, a) => sum + (a.carried?.resource === resource ? a.carried.amount : 0), 0);
  const amount = (n: number) => Math.floor(n * 10) / 10;
  const store = s.buildings.find((b) => b.kind === 'storehouse');
  return `Shared store now: ${amount(s.resources.wood)} boards and ${amount(s.resources.stone)} ballast bags. In transit: about ${amount(count('wood'))} boards and ${amount(count('stone'))} ballast bags; these are not in the store. Gathering takes supplies from a cache into a carried load, then actual delivery adds that load to the store. ${store ? `The site’s materials have been spent; assembly is ${Math.floor(store.progress * 100)}% complete.` : `Before choosing a site, collect ${Math.max(0, Math.ceil(180 - s.resources.wood))} more boards and ${Math.max(0, Math.ceil(120 - s.resources.stone))} more ballast bags.`} ${s.tick < 900 ? `${900 - s.tick} game seconds remain until the storm at 20:00.` : 'The storm has arrived.'} Completion time is unknown; current stocks do not predict future travel, choices or assembly.`;
}

/** The same predicate order as apply/build. Only called to explain a refused build;
 * never decides admission or spends materials. Dots sample centres, not every legal point.
 */
export function placementReason(s: State, ids: readonly string[], x: number, y: number): string {
  const people = s.villagers.filter((v) => ids.includes(v.id));
  if (!people.length) return 'Select at least one person.';
  if (!s.settlement) {
    if (people.some((v) => s.tick < v.availableAt))
      return 'A selected resident is still busy with a usual responsibility.';
    if (openPlacementGround(x, y, [...s.buildings, ...NODES])) return '';
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 'Choose a point on the map.';
    if (x < 55 || x > 945 || y < 55 || y > 645) return 'This point is too close to the edge of the map.';
    const obstacle = [...s.buildings, ...NODES].find((b) => Math.hypot(b.x - x, b.y - y) < 90);
    const name =
      obstacle && 'kind' in obstacle
        ? {
            town: 'workshop hub',
            house: 'guest cabin',
            storehouse: 'storehouse',
            food: 'meal crates',
            wood: 'prepared boards',
            stone: 'ballast bags',
          }[obstacle.kind]
        : 'another site';
    return `This point is too close to the ${name}.`;
  }
  const w = s.settlement;
  if (
    people.some((v) => {
      const a = w.actors[v.id];
      return !a || a.map !== 'yard' || a.carried || (a.running && a.running.purpose !== 'body');
    })
  )
    return 'Selected builders must be in the workshop yard, without carried supplies or an unfinished work or travel act.';
  if (blocked('yard', { x, y })) {
    if (x < 25 || x > 975 || y < 25 || y > 675) return 'This point is too close to the edge of the map.';
    return `This point is blocked by the wall in ${MAPS.yard.name}.`;
  }
  const b = s.buildings.find((b) => Math.hypot(b.x - x, b.y - y) < 90);
  if (b)
    return `This point is too close to the ${b.kind === 'town' ? 'workshop hub' : b.kind === 'house' ? 'guest cabin' : 'storehouse'}.`;
  const trapped = people.find((v) => !route('yard', v, { x, y }));
  return trapped ? `${residentName(trapped)} has no open route to this point.` : '';
}
