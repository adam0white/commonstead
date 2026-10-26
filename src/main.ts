import { personaChannel, watchPersonaCheckpoint } from '@adam0white/lab-client';
import { CAST as ALLOCATION, CAST, DISCOVERIES } from './cast.ts';
import { Continuity, LOCAL_KEY, resumeForPlay, watchShelfPreference } from './continuity.ts';
import { MAPS, type Place } from './paths.ts';
import { dayClock, EDITION } from './settlement.ts';
import { REPLY_EDITION } from './settlement-scenes.ts';
import { mountSettlementControls, updateSettlementControls } from './settlement-ui.ts';
import './style.css';
import { createLab, FEEDBACK_LABELS, PRIVACY_URL } from '@adam0white/lab-client';
import {
  downloadJson,
  feedbackPersonaControl,
  feedbackSharePlay,
  telemetryNotice,
  telemetryToggle,
} from '@adam0white/lab-kit';
import { eventText, residentName } from './display.ts';
import { draw } from './draw.ts';
import { prefillFeedbackChoice } from './feedback.ts';
import { apply, type Command, exportRun, NODES, type State, step } from './sim.ts';
import { currentNotice, invitationReadiness, milestone, WorkObservation } from './work-observation.ts';

const isLab = new URLSearchParams(location.search).get('lab') === '1';
const root = document.getElementById('app') as HTMLElement;
const lab = createLab({ game: 'commonstead' });
const continuity = new Continuity(lab, personaChannel(), () => {
  const el = document.getElementById('continuity-status');
  if (el) el.textContent = continuity.status;
  if (state) save();
});
const SAVE = LOCAL_KEY,
  NAME = 'commonstead-name';
let state: State | null = null,
  selected: string[] = [],
  speed = 1,
  paused = false,
  placing: 'house' | 'storehouse' | '' = '',
  moveMode = false;
let placementFeedback = '';
let placementPoint = { x: 650, y: 500 };
let residentKey = '';
let workObservation = new WorkObservation();
let viewedMap: Place = 'yard';
let unitKey = '',
  actionKey = '';
let canvas: HTMLCanvasElement | null = null,
  last = 0,
  carry = 0,
  screen = 'title',
  modal: HTMLElement | null = null;
let pointer: {
  id: number;
  x: number;
  y: number;
  x2: number;
  y2: number;
  at: number;
  ordered: boolean;
} | null = null;
let holdTimer: ReturnType<typeof setTimeout> | null = null;
const esc = (v: unknown) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Download remains available. */
  }
}
function save() {
  if (!state) return;
  const run = exportRun(state);
  remember(SAVE, continuity.localSave(state));
  lab.captureSave(run);
}
function download() {
  if (state) downloadJson('commonstead-run.json', continuity.export(state));
}
function issue(cmd: Command) {
  if (!state || state.ended || paused) return;
  workObservation.observeState(state);
  try {
    apply(state, cmd);
  } catch (error) {
    const notice = document.getElementById('notice');
    if (notice) notice.textContent = error instanceof Error ? error.message : 'The request could not start.';
    return;
  }
  workObservation.observeState(state);
  save();
  update();
}
function top(title: string) {
  return `<header class="top"><span>${title}</span><div class="row"><button id="info" aria-label="Controls and help">i</button><button id="menu">Pause menu</button></div></header>`;
}
function bind(id: string, fn: () => void) {
  document.getElementById(id)?.addEventListener('click', fn);
}
function shellBindings() {
  bind('menu', menu);
  bind('info', info);
}
function title() {
  screen = 'title';
  continuity.clear();
  state = null;
  selected = [];
  canvas = null;
  paused = false;
  lab.screen('title');
  root.innerHTML = `<main class="title"><header><a href="https://human.adamwhite.work/games/">All games</a>${isLab ? '<span class="small">A Human Framework experiment</span>' : ''}</header><section class="title-body"><p class="eyebrow">The residents share a workshop near Alder Quay.</p><h1>Commonstead</h1><p>Finish a storehouse before the storm.<br>Work with eight residents. Each person has limits.</p><svg class="title-art" viewBox="0 0 600 140" role="img" aria-label="A storehouse and the people building it"><path d="M0 120 Q160 85 300 115 T600 113" fill="none" stroke="#aaa38c"/><path d="M239 65 L300 17 L361 65 Z" fill="#a97659" stroke="#574b38" stroke-width="2"/><path d="M250 66 H350 V116 H250Z" fill="#e9dfcb" stroke="#574b38" stroke-width="2"/><path d="M290 116 V87 H310 V116" fill="#6e665a"/><g fill="#4f6b3a" stroke="#23201b" stroke-width="2"><path d="M174 84 h16 v29 h-16Z"/><circle cx="182" cy="74" r="8" fill="#d5b48d"/><path d="M399 80 h16 v29 h-16Z"/><circle cx="407" cy="70" r="8" fill="#d5b48d"/></g></svg><p class="small">Use prepared boards, small ballast bags, and hand tools. The ballast bags serve as weights. Use trolleys to carry loads. Residents choose what they can manage. Open the menu to pause.</p>${stored(SAVE) ? '<button class="primary" id="continue">Resume</button>' : ''}<button class="${stored(SAVE) ? '' : 'primary'}" id="new">New game</button><details><summary>Choose a longer settlement day</summary><p>Optional: thirty minutes at Steady, with a full day and night for eight fresh local residents. The storm arrives at 20:00. Supplies, travel, conversations and sleep take time. Your saved chapter is replaced only after this day is ready.</p><button id="new-day">Start a settlement day</button></details><details><summary>Choose a fresh day with personal replies</summary><p>Start a new local day with eight fresh residents. After Nora or Sevim shares a private story, you may offer one of two specific replies and a timed paper activity. This does not continue a disclosure from your short chapter. The commander waits at the workshop hub. Walk there to talk. Your saved game is replaced only after this day is ready.</p><button id="new-replies">Start a fresh day with replies</button></details><button id="title-feedback">Feedback</button>${isLab ? `<details style="margin-top:14px"><summary>More ways to start</summary><p class="small">Load a saved playtest. The game replays its orders and checks the result before loading it.</p><button id="fresh-local">Start without saved character histories</button><button id="browser-people">Saved character histories</button><input id="load" type="file" accept="application/json,.json" aria-label="Load a playtest run"></details>` : ''}<p id="load-status" class="status" role="status"></p></section></main>`;
  const begin = async (localOnly = false, day: false | true | typeof REPLY_EDITION = false) => {
    const status = document.getElementById('load-status');
    try {
      const prepared = await continuity.fresh(
        418,
        localOnly,
        day ? { edition: day === REPLY_EDITION ? REPLY_EDITION : EDITION } : undefined,
      );
      closeModal();
      start(prepared);
      await continuity.recording();
      save();
    } catch (error) {
      console.error(error);
      if (status)
        status.textContent = isLab
          ? String(error)
          : 'The new game could not start. Your saved game is unchanged. Try again or choose Feedback to report the problem.';
      const message = document.getElementById('setup-status');
      if (message)
        message.textContent = 'The new game could not start. Your saved game is unchanged. Try again.';
    }
  };
  bind('new-replies', () => {
    if (!stored(SAVE)) {
      void begin(true, REPLY_EDITION);
      return;
    }
    const button = document.getElementById('new-replies');
    if (!button || document.getElementById('replace-replies')) return;
    button.insertAdjacentHTML(
      'afterend',
      '<p>Replace your saved game with this fresh local day? Earlier disclosures will stay in the old game only.</p><button id="replace-replies">Replace with fresh reply day</button>',
    );
    bind('replace-replies', () => {
      void begin(true, REPLY_EDITION);
    });
  });
  bind('new-day', () => {
    if (!stored(SAVE)) {
      void begin(true, true);
      return;
    }
    const button = document.getElementById('new-day');
    if (!button || document.getElementById('replace-day')) return;
    button.insertAdjacentHTML(
      'afterend',
      '<p>Replace your saved chapter with this longer day?</p><button id="replace-day">Replace with settlement day</button>',
    );
    bind('replace-day', () => {
      void begin(true, true);
    });
  });
  bind('new', () => {
    if (!stored(SAVE)) {
      void begin();
      return;
    }
    const button = document.getElementById('new');
    if (!button || document.getElementById('replace-run')) return;
    button.insertAdjacentHTML(
      'afterend',
      '<div id="new-confirm"><p>Do you want to replace the saved game? It stays saved until the new game is ready.</p><button id="replace-run">Replace saved game</button><button id="cancel-new">Keep saved game</button></div>',
    );
    bind('replace-run', () => {
      void begin();
    });
    bind('cancel-new', () => document.getElementById('new-confirm')?.remove());
  });
  bind('fresh-local', () => {
    if (stored(SAVE)) remember('commonstead-preserved-before-fresh-local', stored(SAVE) ?? '');
    void begin(true);
  });
  bind('browser-people', continuityMenu);
  bind('title-feedback', feedback);
  bind('continue', () => {
    void (async () => {
      try {
        const loaded = await continuity.loadLocal(stored(SAVE) ?? '');
        start(loaded);
        await continuity.recording();
        save();
      } catch (error) {
        const el = document.getElementById('load-status');
        console.error(error);
        if (el)
          el.textContent = isLab
            ? String(error)
            : 'The saved game could not open. It is unchanged. Try again or choose Feedback to report the problem.';
      }
    })();
  });
  document.getElementById('load')?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const status = document.getElementById('load-status');
    if (file.size > 5_000_000) {
      if (status) status.textContent = 'This playtest file is too large. Choose a file smaller than 5 MB.';
      return;
    }
    try {
      const loaded = await continuity.importFile(await file.text());
      start(loaded);
      await continuity.recording();
      save();
    } catch {
      if (status)
        status.textContent =
          'This playtest did not match its replay, so it could not load. Your saved game is unchanged. Choose another file.';
    }
  });
}
function start(s: State) {
  resumeForPlay(s);
  workObservation = new WorkObservation();
  workObservation.observeState(s);
  unitKey = '';
  residentKey = '';
  actionKey = '';
  state = s;
  viewedMap = 'yard';
  screen = 'play';
  selected = [];
  paused = false;
  carry = 0;
  last = performance.now();
  lab.screen('play');
  root.innerHTML = `<main class="game ${s.settlement ? 'settlement-day' : ''}">${top('Commonstead')}<div class="stock" id="stock"></div><div class="layout"><div class="map-wrap"><div class="speed" aria-label="Game speed"><button data-speed="0.5">Slow</button><button data-speed="1">Steady</button><button data-speed="4">Fast</button></div><canvas id="map" aria-label="The map shows the workshop yard. You can use the person and resource buttons below to give orders."></canvas><div class="map-caption">Select people, then choose work.</div></div><aside class="side"><section class="objective"><strong id="goal">Keep the shared supplies dry.</strong><p id="deadline" class="deadline"></p><p class="details">A cabin prepared with 40 boards makes room for two more people. Invite helpers at the workshop hub.</p></section><section class="sheet"><h2 id="selection">Select a person or the workshop hub.</h2><p class="small selection-help">Names add or remove people. Map taps replace the selection. Drag a box to select a group.</p><div id="units" class="unit-list" aria-label="Add or remove selected people"></div><details class="work-overview"><summary>Everyone now</summary><p class="small">Current activity and retained requests are separate. Last words may describe an earlier event. A finished break does not guarantee enough rest. A reason for an earlier choice may not have been recorded.</p><ol id="everyone-now"></ol></details><p id="task" class="task"></p><p id="said" class="speech"></p><details class="work-help"><summary>Dividing work and adding builders</summary><p class="small">Different groups can collect boards and ballast at the same time. Travel takes time. A person collecting supplies cannot assemble the storehouse at the same time. Residents may choose their own breaks.</p><p class="small">Select people, choose Move / add builders, then tap the unfinished storehouse to add them to assembly.</p></details><div id="resident"></div><div id="settlement-controls"></div></section><div class="notice" id="notice" role="status"></div><section class="actions" id="actions"></section></aside></div></main>`;
  canvas = document.getElementById('map') as HTMLCanvasElement;
  shellBindings();
  const dayHost = document.getElementById('settlement-controls');
  if (s.settlement && dayHost) {
    mountSettlementControls(
      dayHost,
      () => selected,
      issue,
      (place) => {
        viewedMap = place;
        canvas?.setAttribute(
          'aria-label',
          `Map of ${MAPS[place].name}. Named controls below provide destinations and travel requests.`,
        );
        selected = [];
        update();
      },
    );
    const objective = document.querySelector('.objective .details');
    if (objective)
      objective.textContent =
        'Remote supplies must be carried back. The day continues until tomorrow at 08:00.';
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]'))
    b.onclick = () => {
      speed = Number(b.dataset.speed);
      update();
    };
  bindMap(canvas);
  update();
  if (s.ended) end();
  else save();
}
function update() {
  if (!state || screen !== 'play') return;
  const s = state;
  const t = `${Math.floor(s.tick / 60)}:${String(s.tick % 60).padStart(2, '0')}`;
  const put = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  const capacity = 10 + s.buildings.filter((b) => b.kind === 'house' && b.complete).length * 2;
  const stock = document.getElementById('stock');
  if (stock)
    stock.innerHTML = `<span><b>Meals</b> ${Math.floor(s.resources.food)}</span><span><b>Boards</b> ${Math.floor(s.resources.wood)}</span><span><b>Ballast bags</b> ${Math.floor(s.resources.stone)}</span><span><b>People</b> ${s.villagers.length} / ${capacity} housing spaces</span>${s.settlement ? `<span><b>Paper</b> ${s.settlement.paper}</span>` : ''}`;
  const store = s.buildings.find((b) => b.kind === 'storehouse');
  put(
    'deadline',
    s.settlement
      ? `${dayClock(s)}. ${milestone(s)} View: ${MAPS[viewedMap].name}.`
      : `The time is ${t}. ${milestone(s)}`,
  );
  const dayHost = document.getElementById('settlement-controls');
  if (s.settlement && dayHost) updateSettlementControls(dayHost, s, selected, issue);
  const people = s.villagers.filter((v) => selected.includes(v.id));
  {
    const caption = document.querySelector('.map-caption');
    if (caption)
      caption.textContent = people.length
        ? `Selected: ${people.map((v) => residentName(v)).join(', ')}.`
        : 'Select names, then choose a request.';
  }
  const town = s.buildings.find((b) => b.kind === 'town' && selected.includes(b.id));
  put(
    'selection',
    town
      ? 'Workshop hub'
      : people.length
        ? `Selected: ${people.map((v) => residentName(v)).join(', ')}`
        : 'Select people, then choose work.',
  );
  put('task', people.map((v) => workObservation.summary(s, v, people.length === 1)).join(' '));
  const overview = document.getElementById('everyone-now');
  if (overview) {
    for (const v of s.villagers) {
      let row = document.getElementById(`worker-now-${v.id}`);
      if (!row) {
        row = document.createElement('li');
        row.id = `worker-now-${v.id}`;
        overview.append(row);
      }
      const line = workObservation.summary(s, v, false);
      if (row.textContent !== line) row.textContent = line;
    }
  }
  const speaker = people.find((v) => v.says);
  put(
    'said',
    speaker
      ? `Last words from ${residentName(speaker)}: “${speaker.says}”`
      : 'Select a person, then tap Meals, Boards or Ballast bags.',
  );
  put(
    'notice',
    placing
      ? `Selected: ${people.map((v) => residentName(v)).join(', ') || 'no people'}. ${placementFeedback ? `${placementFeedback} ` : ''}Choose open ground for the ${placing === 'house' ? 'guest cabin (40 boards)' : 'storehouse (180 boards and 120 ballast bags)'}. ${s.settlement ? 'The game checks the site and available residents when you tap.' : 'Dots mark open centres. The outline shows the candidate site and spacing. The game also checks selected people, busy residents, materials and an existing storehouse.'} No materials are spent on a refused order.`
      : moveMode
        ? 'Tap the unfinished storehouse to add builders, or tap ground to move.'
        : `Last order or event: ${eventText(currentNotice(s).startsWith('Spend a minute together.') ? invitationReadiness(s, selected, 'listen') : currentNotice(s))}`,
  );
  document.querySelector('.game')?.classList.toggle('placing', !!placing);
  const resident = document.getElementById('resident');
  const person = people.length === 1 ? people[0] : undefined;
  const entry = person ? CAST[Number(person.id.slice(1)) - 1] : undefined;
  const scene = person ? DISCOVERIES[Number(person.id.slice(1)) - 1] : undefined;
  const nextResidentKey = JSON.stringify([person?.id, person?.discovery]);
  if (resident && nextResidentKey !== residentKey) {
    const open = resident.dataset.person === person?.id && resident.querySelector('details')?.open;
    resident.dataset.person = person?.id ?? '';
    residentKey = nextResidentKey;
    resident.innerHTML = person
      ? `<p class="small">${esc(residentName(person))}${entry ? ` is ${Math.floor((person.person.now - person.person.life.bornAt) / 525600)} years old.` : ' is helping at the workshop today.'} ${esc(person.role)} ${esc(person.assignment)}</p>${person.lifeLine ? `<p class="small">${esc(person.lifeLine)}</p>` : ''}<details ${open ? 'open' : ''}><summary>About this resident</summary><p class="small">${esc(person.family)}</p><p class="small">Use a trolley and choose a comfortable load of prepared materials. Do not do electrical work, change the building structure or use powered tools.</p>${person.discovery && scene ? `<p>${esc(scene[person.discovery === 2 ? 1 : 0])}</p>` : ''}<p class="small">${s.settlement ? 'After one minute of play at Steady, you may invite a private story. Pauses do not count. No shared location or earlier conversation is required. The resident may choose to keep it private. Use Fictional collaborations below for later events.' : 'Conversation is optional. The current requirements are below.'}</p><p class="small" id="conversation-readiness"></p><p class="small" id="collaboration-readiness"></p><button id="listen">${s.settlement ? 'Invite a private story' : 'Invite conversation'}</button>${s.settlement ? '' : `<button id="collaborate" ${person.discovery !== 1 ? 'disabled' : ''}>Offer a small collaboration</button>`}</details>`
      : '';
    bind('listen', () =>
      issue(
        s.settlement
          ? { kind: 'settlement', ids: selected, action: 'story' }
          : { kind: 'order', ids: selected, target: 'listen' },
      ),
    );
    bind('collaborate', () => issue({ kind: 'order', ids: selected, target: 'collaborate' }));
  }
  put('conversation-readiness', invitationReadiness(s, selected, 'listen'));
  put('collaboration-readiness', s.settlement ? '' : invitationReadiness(s, selected, 'collaborate'));
  const units = document.getElementById('units');
  const nextUnitKey = JSON.stringify([s.villagers.map((v) => v.id), selected]);
  if (units && nextUnitKey !== unitKey) {
    unitKey = nextUnitKey;
    units.innerHTML = `${s.villagers
      .map(
        (v) =>
          `<button aria-label="${esc(residentName(v))}" aria-pressed="${selected.includes(v.id)}" data-person="${esc(v.id)}">${selected.includes(v.id) ? '✓ ' : ''}${esc(residentName(v))}</button>`,
      )
      .join('')}<button id="all">All</button><button id="clear">Clear</button>`;
    for (const b of units.querySelectorAll<HTMLButtonElement>('[data-person]'))
      b.onclick = () => {
        const id = b.dataset.person ?? '';
        selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
        update();
        units.querySelector<HTMLButtonElement>(`[data-person="${id}"]`)?.focus({ preventScroll: true });
      };
    bind('all', () => {
      selected = s.villagers.map((v) => v.id);
      update();
    });
    bind('clear', () => {
      selected = [];
      placing = '';
      moveMode = false;
      update();
    });
  }
  const actions = document.getElementById('actions');
  const nextActionKey = JSON.stringify([
    selected,
    people.map((v) => v.discovery),
    placing,
    moveMode,
    s.resources.food >= 35,
    s.resources.wood >= 40,
    s.resources.wood >= 180,
    s.resources.stone >= 120,
    !!store,
    capacity,
    s.villagers.length,
    s.trainingUntil,
  ]);
  if (actions && nextActionKey !== actionKey) {
    actionKey = nextActionKey;
    actions.innerHTML =
      placing || moveMode
        ? '<button class="wide" id="cancel">Cancel placement or movement</button>'
        : town
          ? `<button class="wide primary" id="train" ${s.resources.food < 35 || s.villagers.length >= capacity || s.trainingUntil !== null ? 'disabled' : ''}>Invite helper · 35 meals</button><button class="wide" id="select-workers">Select all people</button><p class="small wide">${s.villagers.length >= capacity ? 'Choose a cabin site and prepare it with 40 boards to make room for a helper.' : s.resources.food < 35 ? 'Collect more meals before inviting a helper.' : s.trainingUntil !== null ? 'A helper is learning the light tasks and will arrive shortly.' : 'A helper arrives after 15 seconds of learning these light tasks.'}</p>`
          : `<button data-resource="food" ${!people.length ? 'disabled' : ''}>Meals</button><button data-resource="wood" ${!people.length ? 'disabled' : ''}>Boards</button><button data-resource="stone" ${!people.length ? 'disabled' : ''}>Ballast bags</button><button id="rest" ${!people.length ? 'disabled' : ''}>Rest, then resume</button><button id="meal" ${!people.length ? 'disabled' : ''}>Eat and drink</button><button id="move" ${!people.length ? 'disabled' : ''}>Move / add builders</button><button id="house" ${!people.length || s.resources.wood < 40 ? 'disabled' : ''}>Prepare cabin · 40 boards</button><p class="small cabin-help">Invite helpers at the workshop hub.</p><button id="store" ${!people.length || s.resources.wood < 180 || s.resources.stone < 120 || store ? 'disabled' : ''}>Storehouse</button><button id="push" ${!people.length ? 'disabled' : ''}>Insist on work</button>`;
    for (const b of actions.querySelectorAll<HTMLButtonElement>('[data-resource]'))
      b.onclick = () => {
        const node = NODES.find((n) => n.kind === b.dataset.resource);
        if (node) order(node.id);
      };
    bind('rest', () => order('rest'));
    bind('meal', () => order('meal'));
    bind('push', () => {
      if (
        confirm(
          'Do you want to insist that these people keep working? They may object and remember the pressure.',
        )
      )
        order('push');
    });
    bind('move', () => {
      moveMode = true;
      update();
    });
    bind('house', () => {
      placementFeedback = '';
      placementPoint = { x: 650, y: 500 };
      placing = 'house';
      update();
    });
    bind('store', () => {
      placementFeedback = '';
      placementPoint = { x: 650, y: 500 };
      placing = 'storehouse';
      update();
    });
    bind('cancel', () => {
      placing = '';
      moveMode = false;
      update();
    });
    bind('train', () => issue({ kind: 'train' }));
    bind('select-workers', () => {
      selected = s.villagers.map((v) => v.id);
      update();
    });
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]'))
    b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed));
}
function order(target: string, x?: number, y?: number) {
  issue({
    kind: 'order',
    ids: selected.filter((id) => state?.villagers.some((v) => v.id === id)),
    target,
    ...(x === undefined ? {} : { x, y }),
  });
}
function point(e: PointerEvent) {
  const r = canvas?.getBoundingClientRect();
  if (!r) return { x: 0, y: 0 };
  const scale = Math.min(r.width / 1000, r.height / 700);
  return {
    x: (e.clientX - r.left - (r.width - 1000 * scale) / 2) / scale,
    y: (e.clientY - r.top - (r.height - 700 * scale) / 2) / scale,
  };
}
function targetAt(x: number, y: number) {
  if (!state) return null;
  return (
    [
      ...state.villagers.filter(
        (v) => !state?.settlement || state.settlement.actors[v.id]?.map === viewedMap,
      ),
      ...(!state.settlement || viewedMap === 'yard' ? state.buildings : []),
      ...(!state.settlement ? NODES : []),
    ]
      .map((v) => ({ v, d: Math.hypot(v.x - x, (v.y - y) * 0.8) }))
      .filter((v) => v.d < 70)
      .sort((a, b) => a.d - b.d)[0]?.v ?? null
  );
}
function destination(x: number, y: number) {
  if (state?.settlement && selected.some((id) => state?.settlement?.actors[id]?.map !== viewedMap)) {
    state.message = 'Select residents on the map you are viewing. Use Travel to ask them to change maps.';
    update();
    return;
  }
  if (placing) {
    const kind = placing;
    const before = state?.buildings.length;
    issue({ kind: 'build', ids: selected, building: kind, x, y });
    if (state && state.buildings.length !== before) {
      placing = '';
      placementFeedback = '';
    } else placementFeedback = state?.message ?? '';
    update();
    return;
  }
  const targets = [
    ...(state?.settlement ? [] : NODES),
    ...(state?.buildings.filter((b) => !b.complete && (!state?.settlement || viewedMap === 'yard')) ?? []),
  ];
  const hit = targets
    .map((v) => ({ v, d: Math.hypot(v.x - x, v.y - y) }))
    .filter((v) => v.d < 80)
    .sort((a, b) => a.d - b.d)[0]?.v;
  order(hit?.id ?? 'move', x, y);
  moveMode = false;
  update();
}
function bindMap(map: HTMLCanvasElement) {
  map.oncontextmenu = (e) => e.preventDefault();
  map.onpointerdown = (e) => {
    if (paused || !state || state.ended) return;
    e.preventDefault();
    map.setPointerCapture(e.pointerId);
    const p = point(e);
    if (e.button === 2) {
      destination(p.x, p.y);
      return;
    }
    pointer = {
      id: e.pointerId,
      ...p,
      x2: p.x,
      y2: p.y,
      at: performance.now(),
      ordered: false,
    };
    holdTimer = setTimeout(() => {
      if (pointer && Math.hypot(pointer.x2 - pointer.x, pointer.y2 - pointer.y) < 20) {
        destination(pointer.x, pointer.y);
        pointer.ordered = true;
      }
    }, 500);
  };
  map.onpointermove = (e) => {
    if (placing) placementPoint = point(e);
    if (!pointer || pointer.id !== e.pointerId) return;
    const p = point(e);
    pointer.x2 = p.x;
    pointer.y2 = p.y;
    if (Math.hypot(pointer.x2 - pointer.x, pointer.y2 - pointer.y) > 20 && holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  };
  map.onpointerup = (e) => {
    if (holdTimer) clearTimeout(holdTimer);
    if (!pointer || pointer.id !== e.pointerId) return;
    const p = pointer;
    pointer = null;
    if (p.ordered) return;
    if (Math.hypot(p.x2 - p.x, p.y2 - p.y) > 20) {
      selected =
        state?.villagers
          .filter(
            (v) =>
              (!state?.settlement || state.settlement.actors[v.id]?.map === viewedMap) &&
              v.x >= Math.min(p.x, p.x2) &&
              v.x <= Math.max(p.x, p.x2) &&
              v.y >= Math.min(p.y, p.y2) &&
              v.y <= Math.max(p.y, p.y2),
          )
          .map((v) => v.id) ?? [];
      update();
      return;
    }
    if (placing || moveMode) {
      destination(p.x, p.y);
      return;
    }
    const hit = targetAt(p.x, p.y);
    selected =
      (hit && state?.villagers.some((v) => v.id === hit.id)) ||
      (hit && state?.buildings.some((b) => b.id === hit.id))
        ? [hit.id]
        : [];
    update();
  };
  map.onpointercancel = () => {
    if (holdTimer) clearTimeout(holdTimer);
    pointer = null;
  };
}
function closeModal() {
  modal?.remove();
  modal = null;
  paused = false;
  last = performance.now();
}
function sheet(html: string, infoOnly = false) {
  modal?.remove();
  paused = true;
  modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<section role="dialog" aria-modal="true" aria-label="${infoOnly ? 'Controls' : 'Game menu'}" class="panel ${infoOnly ? 'info-panel' : ''}">${html}</section>`;
  root.append(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  modal.querySelector<HTMLButtonElement>('button')?.focus();
}
function info() {
  if (state?.settlement) {
    sheet(
      '<h2>Controls · game paused</h2><p>Select names, then choose requests. Open Travel, conversations and the day for named destinations and building sites. All actions have buttons that work with Tab and Enter. View changes the map you see; Travel asks residents to make a real journey. Requests wait for current acts and can be refused. Cancel stops a task without completing it.</p><p>Finish the storehouse before 20:00. The game lasts thirty minutes at Steady while bodies and duties advance through a full day and night. Central resource counts are exact. Dated reports can be incomplete or out of date. The menu pauses.</p><button id="close-info">Back to the workshop</button>',
      true,
    );
    bind('close-info', closeModal);
    return;
  }
  sheet(
    '<h2>Controls · game paused</h2><p>Finish the storehouse before 10:00 to keep the shared supplies dry. If it is unfinished, the supplies get soaked. Preparing a guest cabin adds room for two people.</p><p>Tap names to add or remove people from your selection. A map tap replaces the selection. Select names, then choose Meals, Boards or Ballast bags. Select the workshop hub on the map to invite a local helper.</p><p>On a computer, drag a box to select people. Right-click a destination to give an order. On a phone, tap a person to select that person. Drag a box to select a group. Hold a destination to give an order.</p><p>After the game clock reaches 1:00, offer one person a break. Wait five game seconds during that break. No shared location or earlier conversation is required. Open About this resident and choose Invite conversation. The person may share something private. A small collaboration is optional.</p><p>A planned rest takes 35 game seconds. It does not guarantee that someone feels rested. Read Now for the current activity and the observed end of a break. Last words and Last order or event can describe earlier events. People may still report tiredness or choose another break. Eat and drink uses meals where each person is standing. Insist on work asks people to continue even if they object. They may remember the pressure.</p><p>The storehouse costs 180 boards and 120 ballast bags. Select builders. Choose Storehouse, then tap open ground. To add builders later, select people, choose Move / add builders, then tap the unfinished storehouse. Different groups can collect boards and ballast at the same time. Travel takes time; collecting and building occupy the same people. Opening the menu pauses the game. Slow, Steady and Fast change how quickly time passes.</p><button class="primary" id="close-info">Back to the workshop</button>',
    true,
  );
  bind('close-info', closeModal);
}
function menu() {
  sheet(
    `<h2>Paused</h2><p>Your game is saved on this device.</p><button class="primary" id="resume">Resume</button><button id="feedback">Feedback</button><button id="fullscreen">Full screen</button><a href="https://human.adamwhite.work/games/">All games</a><div id="toggle"></div><button id="new-menu">New game</button><div id="menu-confirm"></div>${isLab ? '<button id="continuity-menu">Character histories between games</button><button id="download">Download this run</button>' : ''}`,
  );
  document.getElementById('toggle')?.append(telemetryToggle(lab));
  bind('continuity-menu', continuityMenu);
  bind('resume', closeModal);
  bind('download', download);
  if (isLab && state?.settlement) {
    const b = document.createElement('button');
    b.textContent = 'Download compact run';
    b.onclick = () => {
      if (state) downloadJson('commonstead-day-compact.json', exportRun(state, true));
    };
    modal?.querySelector('.panel')?.append(b);
  }
  bind('feedback', feedback);
  bind('fullscreen', () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  });
  bind('new-menu', () => {
    const holder = document.getElementById('menu-confirm');
    if (!holder) return;
    holder.innerHTML =
      '<p>Do you want to replace this saved game? It stays saved until the new game is ready.</p><button id="replace-menu">Replace saved game</button><button id="keep-menu">Keep this game</button><p id="setup-status" role="status"></p>';
    bind('keep-menu', () => {
      holder.innerHTML = '';
    });
    bind('replace-menu', () => {
      void (async () => {
        try {
          const prepared = await continuity.fresh(418);
          closeModal();
          start(prepared);
          await continuity.recording();
          save();
        } catch (error) {
          console.error(error);
          const status = document.getElementById('setup-status');
          if (status)
            status.textContent = isLab
              ? String(error)
              : 'The new game could not start. Your saved game is unchanged. Try again or choose Feedback to report the problem.';
        }
      })();
    });
  });
}
function feedback() {
  sheet(
    `<h2>Feedback</h2><div class="feedback-body"><p>Tell us what happened.</p><div class="verdicts" aria-label="What is happening?">${Object.entries(
      FEEDBACK_LABELS,
    )
      .map(([label, text]) => `<button data-feedback-choice="${label}" aria-pressed="false">${text}</button>`)
      .join(
        '',
      )}</div><div class="verdicts"><button data-verdict="keep">I'd keep playing</button><button data-verdict="mixed">Not sure</button><button data-verdict="quit">I'd stop here</button></div><label for="note">What happened? What did you want to do?</label><textarea id="note" rows="3" maxlength="3900"></textarea><div id="feedback-persona"></div><label for="name">Your name (optional)</label><input type="text" id="name" maxlength="100" value="${esc(stored(NAME) ?? '')}"><details><summary>What is sent</summary><p>Your note is sent even when recording is off. Your name appears with this feedback and any play history you share. Play history is shared when Recording is on or you select the optional sharing checkbox.</p><a href="${PRIVACY_URL}">Lab privacy</a></details><p id="send-status" class="status" role="status"></p></div><div class="feedback-actions">${isLab ? '<button id="copy">Keep a copy of this run</button>' : ''}<button class="primary" id="send">Submit</button><button id="cancel-feedback">Back to the menu</button></div>`,
  );
  let verdict = '';
  let choiceText = '';
  const noteInput = document.getElementById('note') as HTMLTextAreaElement;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-feedback-choice]'))
    button.onclick = () => {
      const previous = choiceText;
      choiceText = button.getAttribute('aria-pressed') === 'true' ? '' : (button.textContent ?? '');
      noteInput.value = prefillFeedbackChoice(noteInput.value, previous, choiceText);
      for (const other of document.querySelectorAll('[data-feedback-choice]'))
        other.setAttribute('aria-pressed', String(other === button && Boolean(choiceText)));
    };
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-verdict]'))
    b.onclick = () => {
      verdict = b.dataset.verdict ?? '';
      for (const v of document.querySelectorAll('[data-verdict]'))
        v.setAttribute('aria-pressed', String(v === b));
    };
  const share = feedbackPersonaControl(lab);
  if (share) document.getElementById('feedback-persona')?.append(share);
  const send = document.getElementById('send') as HTMLButtonElement;
  const status = document.getElementById('send-status') as HTMLElement;
  const copy = document.getElementById('copy');
  if (copy) copy.hidden = !state;
  bind('copy', download);
  bind('cancel-feedback', state ? menu : closeModal);
  send.onclick = async () => {
    send.disabled = true;
    const name = (document.getElementById('name') as HTMLInputElement).value.trim();
    remember(NAME, name);
    const note = `${verdict ? `Verdict: ${verdict}\n` : ''}${(document.getElementById('note') as HTMLTextAreaElement).value}`;
    try {
      let run: unknown;
      try {
        run = state ? exportRun(state) : undefined;
      } catch {
        // An unavailable optional run does not block the note.
      }
      const sharePlay = feedbackSharePlay(share);
      const id = await lab.sendFeedback(note, { name, run, sharePlay });
      status.textContent = `Your feedback was sent. Your note is stored. Reference: ${id}.`;
      status.scrollIntoView({ block: 'nearest' });
      send.textContent = state ? 'Back to the game' : 'Back to the title page';
      send.disabled = false;
      send.onclick = closeModal;
    } catch (error) {
      console.error(error);
      status.textContent = isLab
        ? String(error)
        : 'Your feedback could not be sent. Your note is still here. Choose Submit to try again.';
      status.scrollIntoView({ block: 'nearest' });
      send.disabled = false;
    }
  };
}
function end() {
  if (!state) return;
  screen = 'end';
  canvas = null;
  lab.screen('storm outcome');
  if (!state.chapterPaused) {
    apply(state, { kind: 'pause-chapter' });
    void continuity.checkpointAll();
  }
  save();
  root.innerHTML = `<main class="title">${top('Commonstead')}<section class="end-card"><p class="eyebrow">${state.settlement ? 'It is tomorrow at 08:00. The storm arrived at 20:00.' : 'The storm arrived at 10:00.'}</p><h1>${state.won ? 'The supplies stayed dry.' : 'The supplies got soaked.'}</h1><p>${state.won ? 'The storehouse was finished before the rain.' : 'The storehouse was unfinished when the rain came.'}</p><div>${state.villagers
    .slice(0, 2)
    .map(
      (v) =>
        `<p class="speech">${esc(residentName(v))}: ${esc(v.says || 'We made it through the work together.')}</p>`,
    )
    .join(
      '',
    )}</div><details><summary>See the tally</summary><p>${state.villagers.length} people · ${state.buildings.filter((b) => b.complete).length} completed buildings</p></details><div class="row"><button id="end-feedback">Feedback</button>${isLab ? '<button id="end-download">Download this run</button>' : ''}<button class="primary" id="end-title">To the title page</button></div></section></main>`;
  shellBindings();
  bind('end-feedback', feedback);
  bind('end-download', download);
  bind('end-title', title);
}
function continuityMenu() {
  if (!isLab) return;
  sheet(
    `<h2>Character histories between games</h2><p id="continuity-status" role="status">${esc(continuity.status)}</p><p>Character histories stay in this browser. A new game checks the saved histories of all eight residents together. A loaded game keeps its saved versions of the residents. Recording and character analysis are separate choices.</p><label><input type="checkbox" id="continuity-enabled" ${continuity.shelf.enabled ? 'checked' : ''}> Keep character histories between games</label>${state ? `<p>${state.chapterPaused ? 'The game is paused. Residents must finish shared building work before you save their histories.' : state.pauseRequested ? 'The residents are finishing their current actions.' : 'Start playing before you pause to save character histories. Residents must finish their current actions first. They keep their unfinished construction work and existing responsibilities.'}</p><button id="departure">${state.chapterPaused ? 'Resume this game' : 'Pause to save character histories'}</button><details><summary>Save a character history in this browser</summary><p>An older character history cannot replace a newer one. Download an archive first. Saving a separate version preserves the older history without continuing the newer one.</p>${ALLOCATION.map((c) => `<div class="resident-checkpoint"><strong>${esc(c.name)}</strong><button data-checkpoint="${c.castId}">Save ${esc(c.name)}</button><button data-fork="${c.castId}">Save ${esc(c.name)} as a separate version</button></div>`).join('')}</details><p>Recorded play is linked across games on this device. You can switch Recording off in the game menu.</p><button id="continuity-export">Download game and character archive</button>` : ''}<a href="https://human.adamwhite.work/lab/people/" target="_blank" rel="noreferrer">View or download saved character histories</a><button id="back-continuity">Back</button>`,
  );
  const attempt = async (action: () => Promise<unknown>) => {
    try {
      await action();
      if (state) save();
    } catch (error) {
      continuity.status = String(error);
    }
    const el = document.getElementById('continuity-status');
    if (el) el.textContent = continuity.status;
  };
  document.getElementById('continuity-enabled')?.addEventListener('change', (e) => {
    void attempt(() => continuity.setEnabled((e.target as HTMLInputElement).checked));
  });
  bind('departure', () => {
    if (!state) return;
    apply(state, {
      kind: state.chapterPaused ? 'resume-chapter' : 'pause-chapter',
    });
    save();
    closeModal();
    update();
    if (state.chapterPaused) continuityMenu();
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-checkpoint]'))
    button.onclick = () => {
      void attempt(() => continuity.checkpoint(button.dataset.checkpoint ?? ''));
    };
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-fork]'))
    button.onclick = () => {
      void attempt(() => continuity.checkpoint(button.dataset.fork ?? '', true));
    };
  bind('continuity-export', download);
  bind('back-continuity', () => {
    closeModal();
    if (state) menu();
  });
}
const attemptedDeaths = new Set<string>();
watchShelfPreference(() => continuity.invalidate());
watchPersonaCheckpoint(async () => {
  const current = state;
  if (!current || current.villagers.some((v) => v.person.activity)) return;
  const wasPaused = current.chapterPaused;
  if (!wasPaused) apply(current, { kind: 'pause-chapter' });
  await continuity.checkpointAll();
  if (!wasPaused && state === current && !current.ended) apply(current, { kind: 'resume-chapter' });
  save();
});
lab.trackRun(() => (state ? exportRun(state) : null), {
  runKey: () => (state?.settlement ? `${EDITION}:${state.seed}` : (state?.seed ?? 'title')),
  getLogs: () => state?.villagers.map((v) => `${v.name}: ${v.says}`) ?? [],
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (modal) closeModal();
    else {
      placing = '';
      moveMode = false;
      update();
    }
  }
});
document.addEventListener('visibilitychange', () => {
  save();
  last = performance.now();
});
function frame(now: number) {
  const elapsed = Math.min(1, (now - last) / 1000);
  let advanced = false;
  last = now;
  if (state && screen === 'play' && !paused && !state.chapterPaused && !document.hidden) {
    carry += elapsed * speed;
    while (carry >= 1 && !state.ended && !state.chapterPaused) {
      step(state);
      workObservation.observeState(state);
      advanced = true;
      carry--;
      if (state.tick % 10 === 0 || state.chapterPaused) save();
    }
    if (advanced) {
      update();
      for (const head of continuity.heads) {
        if (
          !attemptedDeaths.has(head.revision) &&
          !head.terminal &&
          state.villagers.some((v) => v.person.id === head.castId && !v.person.body.alive)
        ) {
          attemptedDeaths.add(head.revision);
          void continuity.checkpoint(head.castId).catch((error) => {
            continuity.status = String(error);
          });
        }
      }
    }
    if (state.ended) end();
  }
  if (canvas && state)
    draw(
      canvas,
      state,
      selected,
      pointer
        ? {
            x: pointer.x,
            y: pointer.y,
            x2: pointer.x2,
            y2: pointer.y2,
            held: Math.min(1, (now - pointer.at) / 500),
          }
        : null,
      placing,
      viewedMap,
      placementPoint,
    );
  requestAnimationFrame(frame);
}
title();
const noticeFooter = document.createElement('footer');
noticeFooter.className = 'lab-footer';
const notice = telemetryNotice();
if (notice) noticeFooter.append(notice);
document.body.append(noticeFooter);
requestAnimationFrame(frame);
