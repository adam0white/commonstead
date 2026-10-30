import { MAPS, type Place } from './paths.ts';
import { dayClock, validateReply } from './settlement.ts';
import { validatePeer } from './settlement-dialogue.ts';
import { REPLIES, SCENES } from './settlement-scenes.ts';
import type { Command, State } from './sim.ts';
import { observedEvents } from './work-observation.ts';
import { routeCause } from './work-orders.ts';

/** Named keyboard/touch routes to every new host action; stable DOM survives simulation ticks.
 * Text includes outward speech, locations and dated reports only, never hidden Person scores.
 */
export function mountSettlementControls(
  host: HTMLElement,
  selected: () => string[],
  issue: (c: Command) => void,
  view: (p: Place) => void,
): void {
  host.innerHTML = `<details><summary>Travel, conversations and the day</summary><p>A new request during a work or travel act is rejected, not queued. Wait for that act to finish, then ask again, or cancel it first. An accepted request can wait through a personal activity such as rest. A resident may choose a need or responsibility instead. Cancel task stops unfinished work. The storm comes at 20:00; the day ends tomorrow at 08:00.</p><p>This chapter keeps its pinned residents and supported saved histories. Download the complete run to keep its world and source data. Unsupported histories and unfinished duties cannot be published for another game.</p><p>Choose names for the people who will take part. View changes only the map you see. Travel asks people to walk there.</p><div class="day-controls">${Object.entries(
    MAPS,
  )
    .map(
      ([id, m]) =>
        `<button data-view="${id}">View ${m.name}</button><button data-travel="${id}">Travel to ${m.name}</button>`,
    )
    .join(
      '',
    )}<button data-day="inspect">Ask selected people to inspect supplies</button><button data-day="story">Invite selected people to share private stories</button><button data-day="talk">Invite two people to talk</button><button data-day="yield">Offer to yield the trolley route</button><button data-day="spar">Offer a voluntary practice bout</button><button data-day="cancel">Cancel selected tasks</button><button data-travel-load="yard">Bring carried materials to the hub</button></div><details><summary>Fictional collaborations</summary><p>First invite a private story. A completed preparation is not a finished event. Nora and Sam must both agree to the grip trial. These are fictional scenes, not real messages or real user tests.</p><div class="day-controls">${Object.entries(
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
  for (const b of host.querySelectorAll<HTMLButtonElement>('[data-travel-load]'))
    b.onclick = () => issue({ kind: 'settlement', ids: selected(), action: 'map', target: 'yard' });
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
export function updateSettlementControls(
  host: HTMLElement,
  s: State,
  selected: string[] = [],
  issue: (c: Command) => void = () => {},
  choose: (id: string) => void = () => {},
): void {
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
  text('day-dispute', routeCause(s));
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
  if (w.peer) {
    let panel = host.querySelector<HTMLElement>('#peer-route');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'peer-route';
      host.prepend(panel);
    }
    const key = JSON.stringify([
      selected,
      w.peer,
      selected.map((id) => w.actors[id]),
      s.pauseRequested,
      s.ended,
      s.tick >= 1785,
    ]);
    if (panel.dataset.peerKey !== key) {
      panel.dataset.peerKey = key;
      panel.replaceChildren();
      const text = (tag: string, value: string) => {
        const e = document.createElement(tag);
        e.textContent = value;
        panel.append(e);
      };
      text('h3', 'Talk about the trolley route');
      text(
        'p',
        'Select the two residents from a recorded route dispute. Finish their tasks and return carried supplies, or cancel their tasks explicitly. Both must choose to talk. Each may then speak or remain quiet. Only a separately completed Yield opens the route.',
      );
      for (const e of w.peer?.witnesses ?? []) {
        if (selected.length !== 2 || !e.pair.every((id) => selected.includes(id))) continue;
        const command = {
          kind: 'peer',
          ids: [...e.pair],
          map: e.map,
          disputeAt: e.disputeAt,
          branch: 'route-wait',
        } as const;
        let reason = '';
        try {
          validatePeer(s, { ...command, ids: [...e.pair] });
        } catch (error) {
          reason = error instanceof Error ? error.message : 'This conversation is unavailable.';
        }
        text('p', `Their earlier route dispute was recorded ${e.disputeAt} seconds into this day.`);
        const b = document.createElement('button');
        b.textContent = 'Invite both residents to discuss that route wait';
        b.disabled = !!reason;
        b.onclick = () => issue({ ...command, ids: [...e.pair] });
        panel.append(b);
        if (reason) text('p', reason);
      }
      if (!w.peer?.witnesses.length) text('p', 'No route dispute has been witnessed in this day.');
      for (const a of w.peer?.attempts ?? []) {
        text(
          'p',
          `${a.status === 'requested' ? 'The invitation waits for actual travel and body actions.' : a.status === 'talking' ? 'Both residents are taking time to talk.' : a.status === 'speaking' ? 'Each resident may choose a timed speaking act.' : a.status === 'completed' ? 'Both residents finished their outward speaking acts.' : 'The exchange did not finish with both residents speaking.'} ${a.reason ?? ''}`,
        );
        for (const p of a.speech) {
          const name = s.villagers.find((v) => v.id === p.actor)?.name ?? p.actor;
          if (p.status === 'completed')
            text(
              'p',
              `${name}, ${p.at} seconds into this day: “${p.text}” ${p.attended ? 'The listener attended to the line. This does not establish agreement.' : 'Attention to the line was not recorded.'}`,
            );
          if (p.status === 'withheld')
            text('p', `${name} did not complete an outward reply. ${p.decision?.publicSays ?? ''}`);
        }
      }
    }
  }
  {
    let panel = host.querySelector<HTMLElement>('#personal-replies');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'personal-replies';
      host.prepend(panel);
    }
    const v = selected.length === 1 ? s.villagers.find((v) => v.id === selected[0]) : undefined;
    // Residents whose shared story still waits for an answer stay reachable from any selection.
    const open = s.villagers.filter((r) => {
      const sc = w.replyScenes?.[r.id];
      const status = sc?.attempts.at(-1)?.status ?? '';
      return sc && !sc.completedBranch && !['requested', 'running'].includes(status) && r.id !== v?.id;
    });
    const scene = v ? w.replyScenes?.[v.id] : undefined;
    const key = JSON.stringify([
      selected,
      scene,
      s.story!.paper,
      s.pauseRequested,
      s.tick >= 1786,
      v ? w.actors[v.id] : null,
      v?.person.activity?.action,
      open.map((x) => x.id),
    ]);
    if (panel.dataset.replyKey === key) return;
    panel.dataset.replyKey = key;
    const focusedBranch = (document.activeElement as HTMLElement | null)?.dataset.reply;
    panel.replaceChildren();
    const text = (tag: string, value: string) => {
      const el = document.createElement(tag);
      el.textContent = value;
      panel.append(el);
    };
    text('h3', 'Personal replies');
    for (const r of open) {
      const b = document.createElement('button');
      b.textContent = `${r.name} is waiting for your answer. Select ${r.name}`;
      b.onclick = () => choose(r.id);
      panel.append(b);
    }
    if (!v || !['v1', 'v7'].includes(v.id)) {
      if (!open.length) text('p', 'Select Nora or Sevim to read a personal reply.');
      return;
    }
    if (!scene) {
      text(
        'p',
        `First invite ${v.name} to share a private story. Wait for the conversation to finish. No earlier break is required.`,
      );
      return;
    }
    text(
      'p',
      `${v.name} shared this story at ${scene.disclosure.at} seconds into this day.${scene.completedBranch ? '' : ` You can answer where ${v.name} is now. ${v.name} must be free of other tasks first.`}`,
    );
    const last = scene.attempts.at(-1);
    if (last) {
      text(
        'p',
        last.deliveredAt === undefined
          ? 'Your reply has not been spoken.'
          : `At ${last.deliveredAt} seconds, you said: ${REPLIES[last.branch].line}`,
      );
      if (last.deliveredAt !== undefined)
        text(
          'p',
          last.attended
            ? 'The resident attended the line. This does not establish agreement or understanding.'
            : 'The line was delivered. Attention was not recorded.',
        );
      if (last.status === 'completed') {
        text('p', REPLIES[last.branch].says);
        text('p', REPLIES[last.branch].later);
      } else
        text(
          'p',
          last.status === 'requested'
            ? `The request waits for the current body action to finish. Paper has not been spent.`
            : last.status === 'running'
              ? `The resident is talking and writing. One sheet has been spent. The paper record is unfinished.`
              : `The conversation did not finish. ${last.reason ?? last.decision?.publicSays ?? 'No paper record was completed.'}`,
        );
    }
    for (const [branch, details] of Object.entries(REPLIES)) {
      if (details.actor !== v.id || scene.completedBranch) continue;
      const command = { kind: 'reply', ids: [v.id], branch } as Extract<Command, { kind: 'reply' }>;
      let reason = '';
      try {
        validateReply(s, command);
      } catch (error) {
        reason = error instanceof Error ? error.message : 'This reply is unavailable.';
      }
      text('p', `${details.line} (at least ${details.ticks} game seconds; one sheet of paper.)`);
      const b = document.createElement('button');
      b.textContent = `Say to ${v.name}: “${details.line}”`;
      b.dataset.reply = branch;
      b.disabled = !!reason;
      b.onclick = () => issue(command);
      panel.append(b);
      if (focusedBranch === branch) b.focus({ preventScroll: true });
      if (reason) text('p', reason);
    }
    const aw = w.actors[v.id];
    const busy =
      !scene.completedBranch &&
      !(last && ['requested', 'running'].includes(last.status)) &&
      (aw?.job || aw?.path.length || (aw?.running && aw.running.purpose !== 'body'));
    if (aw?.carried) {
      const b = document.createElement('button');
      b.textContent = `Bring ${v.name}’s carried materials to the hub`;
      b.onclick = () => issue({ kind: 'settlement', ids: [v.id], action: 'map', target: 'yard' });
      panel.append(b);
    } else if (busy) {
      const b = document.createElement('button');
      b.textContent = `Stop ${v.name}’s current task so you can answer`;
      b.onclick = () => issue({ kind: 'settlement', ids: [v.id], action: 'cancel' });
      panel.append(b);
    }
    if (last && ['requested', 'running'].includes(last.status)) {
      const b = document.createElement('button');
      b.textContent = 'Cancel this paper conversation';
      b.onclick = () => issue({ kind: 'settlement', ids: [v.id], action: 'cancel' });
      panel.append(b);
    }
  }
}
