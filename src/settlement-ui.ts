import { MAPS, type Place } from './paths.ts';
import { dayClock } from './settlement.ts';
import { SCENES } from './settlement-scenes.ts';
import type { Command, State } from './sim.ts';
import { observedEvents } from './work-observation.ts';

/** Named keyboard/touch routes to every new host action; stable DOM survives simulation ticks.
 * Text includes outward speech, locations and dated reports only, never hidden Person scores.
 */
export function mountSettlementControls(
  host: HTMLElement,
  selected: () => string[],
  issue: (c: Command) => void,
  view: (p: Place) => void,
): void {
  host.innerHTML = `<details><summary>Travel, conversations and the day</summary><p>Requests wait for the current act. A resident may choose a need or responsibility instead. Cancel task stops unfinished work. The storm comes at 20:00; the day ends tomorrow at 08:00.</p><p>Eight fresh local residents live this day. This edition does not load saved browser lives. Download the full day to keep it. Saving character histories for another game is supported only by the ten-minute chapter.</p><p>Choose names for the people who will take part. View changes only the map you see. Travel asks people to walk there.</p><div class="day-controls">${Object.entries(
    MAPS,
  )
    .map(
      ([id, m]) =>
        `<button data-view="${id}">View ${m.name}</button><button data-travel="${id}">Travel to ${m.name}</button>`,
    )
    .join(
      '',
    )}<button data-day="inspect">Ask selected people to inspect supplies</button><button data-day="story">Invite a private story</button><button data-day="talk">Invite two people to talk</button><button data-day="yield">Offer to yield the trolley route</button><button data-day="spar">Offer a voluntary practice bout</button><button data-day="cancel">Cancel selected tasks</button></div><details><summary>Fictional collaborations</summary><p>First invite a private story. A completed preparation is not a finished event. Nora and Sam must both agree to the grip trial. These are fictional scenes, not real messages or real user tests.</p><div class="day-controls">${Object.entries(
    SCENES,
  )
    .map(([id, s]) => `<button data-scene="${id}">${s.label}</button>`)
    .join(
      '',
    )}</div></details><details><summary>Named destinations and building sites</summary><div class="day-controls"><button data-destination="hub">Walk to the workshop hub</button><button data-destination="passage">Walk to the passage</button><button data-destination="cache">Walk to this map’s cache</button><button data-site="storehouse">Place the storehouse at the east site</button><button data-site="house">Prepare the cabin at the south site</button></div></details><p>Prayer follows a fictional timetable. It is a quiet part of the day and is never scored here. People eat from the shared food and sleep through actual body time.</p><p id="day-location"></p><p id="day-dispute" role="status"></p><h3>Heard accounts</h3><p>These are dated accounts. An inspection asks a resident to check supplies; it does not instantly show the shared store. Supplies carried by a resident join the shared store only after delivery. An account does not update that store. A resident may withhold a report.</p><ol id="day-accounts"></ol><h3>Observed events</h3><ol id="day-events"></ol></details>`;
  for (const b of host.querySelectorAll<HTMLButtonElement>('[data-view]'))
    b.onclick = () => view(b.dataset.view as Place);
  for (const b of host.querySelectorAll<HTMLButtonElement>('[data-travel]'))
    b.onclick = () => issue({ kind: 'settlement', ids: selected(), action: 'map', target: b.dataset.travel });
  for (const b of host.querySelectorAll<HTMLButtonElement>('[data-day]'))
    b.onclick = () => issue({ kind: 'settlement', ids: selected(), action: b.dataset.day ?? '' });
  for (const b of host.querySelectorAll<HTMLButtonElement>('[data-scene]'))
    b.onclick = () =>
      issue({ kind: 'settlement', ids: selected(), action: 'scene', target: b.dataset.scene });
  for (const b of host.querySelectorAll<HTMLButtonElement>('[data-destination]'))
    b.onclick = () => {
      const p =
        b.dataset.destination === 'hub'
          ? { x: 525, y: 475 }
          : b.dataset.destination === 'cache'
            ? { x: 775, y: 475 }
            : { x: 75, y: 575 };
      issue({ kind: 'order', ids: selected(), target: 'move', ...p });
    };
  for (const b of host.querySelectorAll<HTMLButtonElement>('[data-site]'))
    b.onclick = () =>
      issue({
        kind: 'build',
        ids: selected(),
        building: b.dataset.site as 'house' | 'storehouse',
        x: b.dataset.site === 'house' ? 575 : 825,
        y: 575,
      });
}
export function updateSettlementControls(host: HTMLElement, s: State): void {
  const w = s.settlement;
  if (!w) return;
  const text = (id: string, value: string) => {
    const e = host.querySelector(`#${id}`);
    if (e) e.textContent = value;
  };
  text(
    'day-location',
    `${dayClock(s)}. Open Everyone now above to see locations, current work, carried supplies and retained requests.`,
  );
  text(
    'day-dispute',
    w.dispute
      ? `The shared trolley route is disputed. ${w.dispute.map((id) => s.villagers.find((v) => v.id === id)?.name).join(' and ')} can talk. Only a completed, accepted Yield opens the route. A practice bout is optional.`
      : 'The shared trolley route is available.',
  );
  const list = (id: string, lines: string[]) => {
    const e = host.querySelector(`#${id}`);
    if (!e) return;
    const key = lines.join('\n');
    if (e.getAttribute('data-lines') === key) return;
    e.setAttribute('data-lines', key);
    e.replaceChildren(
      ...lines.map((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        return li;
      }),
    );
  };
  list(
    'day-accounts',
    w.accounts
      .slice(-8)
      .map(
        (a) =>
          `${Math.floor(a.at / 60)}:${String(a.at % 60).padStart(2, '0')} into this game, ${a.speaker} to ${a.listener}: ${a.text}`,
      ),
  );
  list('day-events', observedEvents(w.events));
}
