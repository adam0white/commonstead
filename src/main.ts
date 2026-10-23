import './style.css';
import { createLab, PRIVACY_URL } from '@adam0white/lab-client';
import { downloadJson, telemetryNotice, telemetryToggle } from '@adam0white/lab-kit';
import { draw } from './draw.ts';
import { apply, type Command, createGame, exportRun, importRun, NODES, type State, step } from './sim.ts';

const root = document.getElementById('app') as HTMLElement;
const lab = createLab({ game: 'commonstead' });
const SAVE = 'commonstead-v1',
  NAME = 'commonstead-name';
let state: State | null = null,
  selected: string[] = [],
  speed = 1,
  paused = false,
  placing: 'house' | 'storehouse' | '' = '',
  moveMode = false;
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
  remember(SAVE, JSON.stringify(run));
  lab.captureSave(run);
}
function download() {
  if (state) downloadJson('commonstead-run.json', exportRun(state));
}
function issue(cmd: Command) {
  if (!state || state.ended || paused) return;
  apply(state, cmd);
  save();
  update();
}
function top(title: string) {
  return `<header class="top"><span>${title}</span><div class="row"><button id="info" aria-label="Controls and help">i</button><button id="menu">Menu · pause</button></div></header>`;
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
  state = null;
  selected = [];
  canvas = null;
  paused = false;
  lab.screen('title');
  root.innerHTML = `<main class="title"><header><a href="https://human.adamwhite.work/games/">◇ All games</a><span class="small">A Human Framework experiment</span></header><section class="title-body"><p class="eyebrow">A settlement in ten minutes</p><h1>Commonstead</h1><p>Raise a storehouse before the storm.<br>Five people. Three resources. Their own limits.</p><svg class="title-art" viewBox="0 0 600 140" role="img" aria-label="A storehouse and the people building it"><path d="M0 120 Q160 85 300 115 T600 113" fill="none" stroke="#aaa38c"/><path d="M239 65 L300 17 L361 65 Z" fill="#a97659" stroke="#574b38" stroke-width="2"/><path d="M250 66 H350 V116 H250Z" fill="#e9dfcb" stroke="#574b38" stroke-width="2"/><path d="M290 116 V87 H310 V116" fill="#6e665a"/><g fill="#4f6b3a" stroke="#23201b" stroke-width="2"><path d="M174 84 h16 v29 h-16Z"/><circle cx="182" cy="74" r="8" fill="#d5b48d"/><path d="M399 80 h16 v29 h-16Z"/><circle cx="407" cy="70" r="8" fill="#d5b48d"/></g></svg><p class="small">Select people, then order work. The menu pauses for reading.</p>${stored(SAVE) ? '<button class="primary" id="continue">Continue settlement</button>' : ''}<button class="${stored(SAVE) ? '' : 'primary'}" id="new">Begin a new settlement</button><details style="margin-top:14px"><summary>Other ways in</summary><p class="small">Load a playtest run. Its seed and orders are replayed and checked before loading.</p><input id="load" type="file" accept="application/json,.json" aria-label="Load a playtest run"></details><p id="load-status" class="status" role="status"></p></section><footer>The lab records your play to improve the games. Turn off in the menu. <a href="${PRIVACY_URL}" target="_blank" rel="noreferrer">Lab privacy</a></footer></main>`;
  bind('new', () => {
    if (
      stored(SAVE) &&
      !confirm('Replace the settlement saved on this device? Download it first to keep a copy.')
    )
      return;
    start(createGame(418));
  });
  bind('continue', () => {
    try {
      start(importRun(JSON.parse(stored(SAVE) ?? '')));
    } catch {
      const el = document.getElementById('load-status');
      if (el) el.textContent = 'This save could not be replayed. Begin a new settlement or load another run.';
    }
  });
  document.getElementById('load')?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const status = document.getElementById('load-status');
    if (file.size > 5_000_000) {
      if (status) status.textContent = 'Choose a run smaller than 5 MB.';
      return;
    }
    try {
      start(importRun(JSON.parse(await file.text())));
    } catch {
      if (status)
        status.textContent = 'That run did not match its replay. Your saved settlement is unchanged.';
    }
  });
}
function start(s: State) {
  unitKey = '';
  actionKey = '';
  state = s;
  screen = 'play';
  selected = [];
  paused = false;
  carry = 0;
  last = performance.now();
  lab.screen('play');
  root.innerHTML = `<main class="game">${top('Commonstead')}<div class="stock" id="stock"></div><div class="layout"><div class="map-wrap"><canvas id="map" aria-label="Settlement map. Use named person and resource controls below as an alternative to gestures."></canvas><div class="map-caption">Select people → order work</div></div><aside class="side"><section class="objective"><strong id="goal">Keep the seed grain dry</strong><p id="deadline" class="deadline"></p><p class="details">Finish a storehouse by 10:00. Without it, the grain spoils. Houses add space for two people.</p><div class="speed" aria-label="Game speed"><button data-speed="0.5">Slow</button><button data-speed="1">Steady</button><button data-speed="4">Fast</button></div></section><section class="sheet"><h2 id="selection">Select a person or the town centre</h2><div id="units" class="unit-list"></div><p id="task" class="task"></p><p id="said" class="speech"></p></section><div class="notice" id="notice" role="status"></div><section class="actions" id="actions"></section></aside></div></main>`;
  canvas = document.getElementById('map') as HTMLCanvasElement;
  shellBindings();
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
  const capacity = 7 + s.buildings.filter((b) => b.kind === 'house' && b.complete).length * 2;
  const stock = document.getElementById('stock');
  if (stock)
    stock.innerHTML = `<span><b>Food</b> ${Math.floor(s.resources.food)}</span><span><b>Wood</b> ${Math.floor(s.resources.wood)}</span><span><b>Stone</b> ${Math.floor(s.resources.stone)}</span><span><b>People</b> ${s.villagers.length}/${capacity}</span>`;
  const store = s.buildings.find((b) => b.kind === 'storehouse');
  put(
    'deadline',
    `${t} / Storm 10:00 · ${store?.complete ? 'Storehouse ready' : store ? `Storehouse ${Math.floor(store.progress * 100)}%` : 'Storehouse: 180 wood + 120 stone'}`,
  );
  const people = s.villagers.filter((v) => selected.includes(v.id));
  const town = s.buildings.find((b) => b.kind === 'town' && selected.includes(b.id));
  put(
    'selection',
    town
      ? 'Town centre'
      : people.length
        ? people.map((v) => v.name).join(', ')
        : 'Select people, then choose work',
  );
  put(
    'task',
    people.length > 1
      ? `${people.length} selected · ${people[0]?.status ?? 'waiting'}`
      : people.map((v) => `${v.name}: ${v.status}`).join(' · '),
  );
  put(
    'said',
    people.find((v) => v.says)?.says ??
      (s.tick < 60 ? 'Select a person, then tap Food, Wood or Stone.' : s.message),
  );
  put(
    'notice',
    placing
      ? `Tap open ground for ${placing}.`
      : moveMode
        ? 'Tap ground to move selected people.'
        : s.message,
  );
  const units = document.getElementById('units');
  const nextUnitKey = JSON.stringify([s.villagers.map((v) => v.id), selected]);
  if (units && nextUnitKey !== unitKey) {
    unitKey = nextUnitKey;
    units.innerHTML = `${s.villagers
      .map(
        (v) =>
          `<button aria-pressed="${selected.includes(v.id)}" data-person="${esc(v.id)}">${esc(v.name)}</button>`,
      )
      .join('')}<button id="all">All</button><button id="clear">Clear</button>`;
    for (const b of units.querySelectorAll<HTMLButtonElement>('[data-person]'))
      b.onclick = () => {
        const id = b.dataset.person ?? '';
        selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
        update();
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
        ? '<button class="wide" id="cancel">Cancel placement / move</button>'
        : town
          ? `<button class="wide primary" id="train" ${s.resources.food < 35 || s.villagers.length >= capacity || s.trainingUntil !== null ? 'disabled' : ''}>Train villager · 35 food</button><button class="wide" id="select-workers">Select all people</button><p class="small wide">${s.villagers.length >= capacity ? 'Build a house to make room.' : s.resources.food < 35 ? 'Gather food to train someone.' : s.trainingUntil !== null ? 'Training underway. A villager will arrive shortly.' : 'Training takes 15 seconds. New people arrive at the centre.'}</p>`
          : `<button data-resource="food" ${!people.length ? 'disabled' : ''}>Food</button><button data-resource="wood" ${!people.length ? 'disabled' : ''}>Wood</button><button data-resource="stone" ${!people.length ? 'disabled' : ''}>Stone</button><button id="rest" ${!people.length ? 'disabled' : ''}>Rest · resume</button><button id="meal" ${!people.length ? 'disabled' : ''}>Eat & drink</button><button id="move" ${!people.length ? 'disabled' : ''}>Move</button><button id="house" ${!people.length || s.resources.wood < 40 ? 'disabled' : ''}>House · 40 wood</button><button id="store" ${!people.length || s.resources.wood < 180 || s.resources.stone < 120 || store ? 'disabled' : ''}>Storehouse</button><button id="push" ${!people.length ? 'disabled' : ''}>Push on</button>`;
    for (const b of actions.querySelectorAll<HTMLButtonElement>('[data-resource]'))
      b.onclick = () => {
        const node = NODES.find((n) => n.kind === b.dataset.resource);
        if (node) order(node.id);
      };
    bind('rest', () => order('rest'));
    bind('meal', () => order('meal'));
    bind('push', () => {
      if (confirm('Insist on current work? People may work under protest and remember the pressure.'))
        order('push');
    });
    bind('move', () => {
      moveMode = true;
      update();
    });
    bind('house', () => {
      placing = 'house';
      update();
    });
    bind('store', () => {
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
  return r
    ? { x: ((e.clientX - r.left) / r.width) * 1000, y: ((e.clientY - r.top) / r.height) * 700 }
    : { x: 0, y: 0 };
}
function targetAt(x: number, y: number) {
  if (!state) return null;
  return (
    [...state.villagers, ...state.buildings, ...NODES]
      .map((v) => ({ v, d: Math.hypot(v.x - x, (v.y - y) * 0.8) }))
      .filter((v) => v.d < 70)
      .sort((a, b) => a.d - b.d)[0]?.v ?? null
  );
}
function destination(x: number, y: number) {
  if (placing) {
    const kind = placing;
    placing = '';
    issue({ kind: 'build', ids: selected, building: kind, x, y });
    return;
  }
  const targets = [...NODES, ...(state?.buildings.filter((b) => !b.complete) ?? [])];
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
    pointer = { id: e.pointerId, ...p, x2: p.x, y2: p.y, at: performance.now(), ordered: false };
    holdTimer = setTimeout(() => {
      if (pointer && Math.hypot(pointer.x2 - pointer.x, pointer.y2 - pointer.y) < 20) {
        destination(pointer.x, pointer.y);
        pointer.ordered = true;
      }
    }, 500);
  };
  map.onpointermove = (e) => {
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
  sheet(
    '<h2>Controls · paused</h2><p>Keep the seed grain dry: finish the storehouse before 10:00. If it is unfinished, the grain spoils. Houses only add room for two people.</p><p>Select names, then choose Food, Wood or Stone. Select the town centre on the map to train a villager.</p><p>Desktop: drag a box to select people; right-click to order. Phone: tap selects, drag selects a group, hold a destination to order.</p><p>Rest takes 35 seconds, then each person resumes their own job. Eat & drink uses food in place. Push on insists and may be remembered.</p><p>Storehouse costs 180 wood and 120 stone. Select builders, choose Storehouse, then tap open ground. The menu pauses. Slow / Steady / Fast change the clock.</p><button class="primary" id="close-info">Back to the settlement</button>',
    true,
  );
  bind('close-info', closeModal);
}
function menu() {
  sheet(
    `<h2>Game menu · Paused</h2><p>Your settlement waits while this menu is open. Play is saved on this device.</p><button id="feedback">Send feedback</button><button id="download">Download this run</button><button id="fullscreen">Full screen</button><button id="to-title">To the title page</button><a href="https://human.adamwhite.work/games/">All games</a><div class="spacer"></div><div id="toggle"></div><a href="${PRIVACY_URL}" target="_blank" rel="noreferrer">Lab privacy</a><button class="primary" id="resume">Resume</button>`,
  );
  document.getElementById('toggle')?.append(telemetryToggle(lab));
  bind('resume', closeModal);
  bind('download', download);
  bind('feedback', feedback);
  bind('fullscreen', () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  });
  bind('to-title', () => {
    save();
    closeModal();
    title();
  });
}
function feedback() {
  sheet(
    `<h2>Send feedback</h2><div class="feedback-body"><p>Your run, saves and log reach us on their own while recording is on. Tell us what they can't show.</p><div class="verdicts"><button data-verdict="keep">I'd keep playing</button><button data-verdict="mixed">Not sure</button><button data-verdict="quit">I'd stop here</button></div><label for="note">What happened, what you wanted, what got in the way.</label><textarea id="note" rows="4" maxlength="3900"></textarea><label for="name">Your name or tester id (optional)</label><input type="text" id="name" maxlength="100" value="${esc(stored(NAME) ?? '')}"><p class="small">A name labels your linked play history on this device. Leave empty to stay pseudonymous.</p><details><summary>What is sent</summary><p>Seed, orders, full simulation state, logs and your note. No character analysis consent is included.</p><a href="${PRIVACY_URL}">Lab privacy</a></details><div id="feedback-toggle"></div>${lab.privacySignalOn && !lab.privacyOverride ? '<label><input type="checkbox" id="consent"> Send this run with my note</label>' : ''}<p id="send-status" class="status" role="status"></p></div><div class="feedback-actions"><button id="copy">Keep a copy of this run</button><button class="primary" id="send">Send</button><button id="cancel-feedback">Back to the menu</button></div>`,
  );
  let verdict = '';
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-verdict]'))
    b.onclick = () => {
      verdict = b.dataset.verdict ?? '';
      for (const v of document.querySelectorAll('[data-verdict]'))
        v.setAttribute('aria-pressed', String(v === b));
    };
  document.getElementById('feedback-toggle')?.append(telemetryToggle(lab));
  const send = document.getElementById('send') as HTMLButtonElement;
  const status = document.getElementById('send-status') as HTMLElement;
  const refresh = () => {
    const recordingOff =
      stored('hf-lab-recording-off') === '1' || stored('hf-lab-events-off:commonstead') === '1';
    const explicit = !!(document.getElementById('consent') as HTMLInputElement | null)?.checked;
    send.disabled = recordingOff || (lab.privacySignalOn && !lab.privacyOverride && !explicit);
    status.textContent = recordingOff
      ? 'Recording is off, so nothing is sent.'
      : lab.privacySignalOn && !lab.privacyOverride && !explicit
        ? 'Check consent to send this run with your note.'
        : '';
  };
  modal?.addEventListener('change', refresh);
  refresh();
  bind('copy', download);
  bind('cancel-feedback', menu);
  send.onclick = async () => {
    if (!state) return;
    send.disabled = true;
    const name = (document.getElementById('name') as HTMLInputElement).value.trim();
    remember(NAME, name);
    const note = `${verdict ? `Verdict: ${verdict}\n` : ''}${(document.getElementById('note') as HTMLTextAreaElement).value}`;
    try {
      const id =
        lab.privacySignalOn && !lab.privacyOverride
          ? await lab.sendRun(exportRun(state), { note, name })
          : await lab.sendFeedback(note, { name });
      status.textContent = `Queued for the lab · ${id}. This is a queue reference, not a delivery receipt.`;
      send.textContent = 'Back to the game';
      send.disabled = false;
      send.onclick = closeModal;
    } catch (error) {
      if (lab.privacySignalOn && !lab.privacyOverride) {
        modal?.remove();
        modal = null;
        lab.openSendDialog({ getRun: () => (state ? exportRun(state) : null), note, name });
        const observer = new MutationObserver(() => {
          if (!document.querySelector('.hflab-veil')) {
            observer.disconnect();
            menu();
          }
        });
        observer.observe(document.body, { childList: true });
        return;
      }
      status.textContent = `Could not queue feedback: ${error instanceof Error ? error.message : 'try again'}. Keep a copy or retry.`;
      send.disabled = false;
    }
  };
}
function end() {
  if (!state) return;
  screen = 'end';
  canvas = null;
  lab.screen('storm outcome');
  save();
  root.innerHTML = `<main class="title">${top('Commonstead · after the storm')}<section class="end-card"><p class="eyebrow">10:00 · the storm arrived</p><h1>${state.won ? 'Grain kept dry.' : 'The grain spoiled.'}</h1><p>${state.won ? 'The storehouse was finished before the rain.' : 'The storehouse was unfinished when the rain came.'}</p><div>${state.villagers
    .slice(0, 5)
    .map(
      (v) =>
        `<p class="speech">${esc(v.name)}: ${esc(v.says || 'We made it through the work together.')}</p>`,
    )
    .join(
      '',
    )}</div><details><summary>See the tally</summary><p>${state.villagers.length} people · ${state.buildings.filter((b) => b.complete).length} completed buildings</p></details><div class="row"><button id="end-feedback">Send feedback</button><button id="end-download">Download this run</button><button class="primary" id="end-title">To the title page</button></div></section></main>`;
  shellBindings();
  bind('end-feedback', feedback);
  bind('end-download', download);
  bind('end-title', title);
}
lab.trackRun(() => (state ? exportRun(state) : null), {
  runKey: () => state?.seed ?? 'title',
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
  if (state && screen === 'play' && !paused && !document.hidden) {
    carry += elapsed * speed;
    while (carry >= 1 && !state.ended) {
      step(state);
      advanced = true;
      carry--;
      if (state.tick % 10 === 0) save();
    }
    if (advanced) update();
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
    );
  requestAnimationFrame(frame);
}
title();
const notice = telemetryNotice();
if (notice) document.body.append(notice);
requestAnimationFrame(frame);
