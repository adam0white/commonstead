import { personaChannel, watchPersonaCheckpoint } from '@adam0white/lab-client';
import { CAST, DISCOVERIES } from './cast.ts';
import { Continuity, LOCAL_KEY, resumeForPlay, watchShelfPreference } from './continuity.ts';
import { createFileSession } from './file-session.ts';
import { morningWorkshopEligibility, morningWorkshopView } from './morning-workshop.ts';
import { MAPS, type Place } from './paths.ts';
import { openPlacementGround } from './placement.ts';
import { closingSpeech, continueAndAskClosing, publicEnding } from './public-ending';
import { publicTranscript } from './public-history.ts';
import { NativeSaveStore } from './save-store.ts';
import { dayClock, EDITION, longRoofUnavailable } from './settlement.ts';
import { mountSettlementControls, updateSettlementControls } from './settlement-ui.ts';
import { buildingPanel, stormPanel } from './storm-view.ts';
import { storyClock, storyClosing } from './story-records.ts';
import { updateStoryControls } from './story-ui.ts';
import { ModalFocus } from './ui-focus.ts';
import { canContinueWorkshop, continuedClock } from './workshop-continuation.ts';
import './style.css';
import { createLab, FEEDBACK_LABELS, PRIVACY_URL } from '@adam0white/lab-client';
import {
  downloadJson,
  feedbackPersonaControl,
  feedbackSharePlay,
  PEOPLE_ACROSS_GAMES,
  telemetryNotice,
  telemetryToggle,
} from '@adam0white/lab-kit';
import { eventText, residentName } from './display.ts';
import { draw } from './draw.ts';
import { prefillFeedbackChoice } from './feedback.ts';
import { AssemblyObservation, deliveryReading, goalForecast } from './goal-forecast.ts';
import { STORM_MEALS, stormSummary } from './pressure.ts';
import {
  apply,
  type GameCommand as Command,
  canYieldDay,
  exportRun,
  NODES,
  publicPlaceText,
  roofBreakUnavailable,
  type State,
  step,
  stepYieldBatch,
} from './sim.ts';
import {
  currentNotice,
  invitationReadiness,
  milestone,
  supplyReadiness,
  WorkObservation,
} from './work-observation.ts';
import { materialFlow, orderConsequences, placementReason, routeCause } from './work-orders.ts';

const root = document.getElementById('app') as HTMLElement;
const modalFocus = new ModalFocus(root);
let namedSite: { x: number; y: number } | null = null;
// The built public entry decides before ordinary Lab, Shelf, storage or watchers.
const fileMode = document.documentElement.dataset.session === 'file';
function loadingProgress(tick: number) {
  const el = document.getElementById(fileMode ? 'file-status' : 'load-status');
  if (el) el.textContent = `Checking the complete run · tick ${tick}. You can cancel or leave this page.`;
}
const fileSession = fileMode ? createFileSession({ progress: loadingProgress }) : null;
const nativeStore = fileMode ? null : new NativeSaveStore();
let nativeText: string | null = null;
let nativeStorageReady = false;
let nativeSaveMessage = '';
function nativeSaveStatus(message: string) {
  nativeSaveMessage = message;
  let el = document.getElementById('native-save-status');
  if (!el) {
    el = document.createElement('p');
    el.id = 'native-save-status';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
}
const candidateLab = createLab({
  game: 'commonstead',
  ...(fileMode ? { preservation: 'preserve' as const } : {}),
});
const recordingStatus = candidateLab.preservationStatus;
const lab = fileMode && recordingStatus !== 'existing-local' ? null : candidateLab;
if (!lab) candidateLab.dispose();
const continuity = fileMode
  ? null
  : new Continuity(
      lab!,
      personaChannel(),
      () => {
        const el = document.getElementById('continuity-status');
        if (el) el.textContent = continuity!.status;
        if (state) save();
      },
      nativeStore!,
    );
if (continuity) continuity.loadProgress = loadingProgress;
const SAVE = LOCAL_KEY,
  NAME = 'commonstead-name';
let state: State | null = null,
  selected: string[] = [],
  speed = 1,
  paused = false,
  placing: 'house' | 'storehouse' | '' = '',
  moveMode = false;
type TutorialStep =
  | 'select'
  | 'wood'
  | 'wood-progress'
  | 'stone'
  | 'stone-progress'
  | 'store'
  | 'site'
  | 'confirm-site'
  | 'done'
  | 'unavailable';
let tutorialStep: TutorialStep | null = null;
let tutorialBaseline = 0;
let tutorialOutcome = '';
let tutorialTarget: HTMLElement | null = null;
let tutorialRenderedStep: TutorialStep | null = null;
const TUTORIAL_KEY = 'commonstead-tutorial-seen';
function finishTutorial() {
  tutorialStep = null;
  try {
    localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    /* This tab still keeps the choice. */
  }
  renderTutorial();
}
function renderTutorial() {
  const existing = document.querySelector<HTMLElement>('.tutorial-prompt');
  if (!tutorialStep || !state || screen !== 'play' || modal) {
    existing?.remove();
    document.querySelectorAll('.tutorial-target').forEach((el) => {
      el.classList.remove('tutorial-target');
    });
    tutorialRenderedStep = null;
    return;
  }
  const selectors: Record<TutorialStep, string> = {
    select: '[data-person]',
    wood: '[data-resource="wood"]:not(:disabled)',
    'wood-progress': '#stock',
    stone: '[data-resource="stone"]:not(:disabled)',
    'stone-progress': '#stock',
    store: !selected.some((id) => state?.villagers.some((v) => v.id === id))
      ? '[data-person]'
      : state.resources.wood < 180
        ? '[data-resource="wood"]:not(:disabled)'
        : state.resources.stone < 120
          ? '[data-resource="stone"]:not(:disabled)'
          : '#store:not(:disabled)',
    site: '#named-site',
    'confirm-site': '#confirm-site',
    done: '#deadline',
    unavailable: '#deadline',
  };
  const target = document.querySelector<HTMLElement>(selectors[tutorialStep]);
  const panel = document.createElement('aside');
  panel.className = 'tutorial-prompt';
  panel.setAttribute('aria-label', 'Tutorial');
  panel.dataset.step = tutorialStep;
  const goal = document.createElement('strong');
  goal.textContent = state.settlement
    ? 'Storehouse before the storm · unfinished → wet supplies'
    : 'Storehouse by 10:00 · unfinished → wet supplies';
  const line = document.createElement('span');
  const messages: Record<TutorialStep, string> = {
    select: 'Select a person.',
    wood: 'Choose Boards.',
    'wood-progress': `Boards: ${Math.floor(state.resources.wood)} / 180 · wait for a delivery or try another order.`,
    stone: `${tutorialOutcome} Choose Ballast bags.`,
    'stone-progress': `Ballast bags: ${Math.floor(state.resources.stone)} / 120 · wait for a delivery or try another order.`,
    store: `${tutorialOutcome} Boards ${Math.floor(state.resources.wood)}/180 · bags ${Math.floor(state.resources.stone)}/120`,
    site: 'Choose an open site, or tap open ground on the map.',
    'confirm-site': 'Confirm this site, or tap open ground on the map.',
    done: 'The storehouse is on the map. Watch its progress before the storm.',
    unavailable: 'This guide is for the opening of a short storm day. Skip to continue.',
  };
  if (existing && tutorialRenderedStep === tutorialStep && tutorialTarget === target) {
    const currentLine = existing.querySelector('span');
    if (currentLine) currentLine.textContent = messages[tutorialStep];
    return;
  }
  existing?.remove();
  document.querySelectorAll('.tutorial-target').forEach((el) => {
    el.classList.remove('tutorial-target');
  });
  line.textContent = messages[tutorialStep];
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.textContent = tutorialStep === 'done' ? 'Done' : 'Skip tutorial';
  skip.addEventListener('click', finishTutorial);
  if (tutorialStep === 'select') panel.append(goal);
  panel.append(line, skip);
  if (tutorialStep === 'select')
    document.querySelectorAll('[data-person], #all').forEach((el) => {
      el.classList.add('tutorial-target');
    });
  else target?.classList.add('tutorial-target');
  const anchor =
    tutorialStep === 'select'
      ? document.querySelector('.unit-list')
      : tutorialStep === 'done' || tutorialStep === 'unavailable'
        ? document.querySelector('.objective')
        : document.querySelector('.actions');
  if (anchor && !['select', 'done', 'unavailable'].includes(tutorialStep)) anchor.prepend(panel);
  else if (anchor) anchor.insertAdjacentElement('beforebegin', panel);
  else document.querySelector('.side')?.prepend(panel);
  if (
    target &&
    (tutorialRenderedStep !== tutorialStep || tutorialTarget !== target) &&
    ['select', 'wood', 'stone', 'store', 'site', 'confirm-site'].includes(tutorialStep)
  ) {
    panel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  tutorialTarget = target;
  tutorialRenderedStep = tutorialStep;
}
let placementFeedback = '';
let placementPoint = { x: 650, y: 500 };
let residentKey = '';
let workObservation = new WorkObservation();
const assemblyObservation = new AssemblyObservation();
let forecastWorld = {};
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
let fileRAF: number | null = null;
let fileCallbackEpoch = 0;
let fileTools: HTMLElement | null = null;
let holdTimer: ReturnType<typeof setTimeout> | null = null;
const esc = (v: unknown) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
function stored(key: string) {
  if (fileMode) return null;
  if (key === SAVE) return nativeText;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function remember(key: string, value: string) {
  if (fileMode) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Download remains available. */
  }
}
function save(): Promise<boolean> {
  if (fileSession) {
    if (state) lab?.captureSave(fileSession.snapshot());
    return Promise.resolve(true);
  }
  if (!state) return Promise.resolve(false);
  const run = exportRun(state);
  let persisted = Promise.resolve(false);
  if (nativeStorageReady) {
    const owner = state,
      generation = continuity!.generation;
    const metadata = () =>
      JSON.stringify({
        runId: continuity!.runId,
        heads: continuity!.heads,
        sources: continuity!.sources,
        fileOrigin: continuity!.fileOrigin,
      });
    const source = metadata(),
      current = () => state === owner && continuity!.currentEntry(generation) && metadata() === source,
      text = continuity!.localSave(state, paused);
    persisted = nativeStore!
      .write(text, current)
      .then((written) => {
        if (written && current()) {
          nativeText = text;
          nativeSaveStatus('Game saved on this device.');
        }
        return written;
      })
      .catch(() => {
        if (current())
          nativeSaveStatus(
            'This run could not be saved. Your previous save is unchanged. Download this run before leaving.',
          );
        return false;
      });
  }
  lab?.captureSave(run);
  return persisted;
}
function downloadStoredRun(name: string, text: string) {
  const saved = JSON.parse(text);
  downloadJson(name, {
    ...saved.run,
    castSources: saved.sources,
    ...(saved.deniedIDs === undefined ? {} : { castDeniedIDs: saved.deniedIDs }),
  });
}
function download() {
  if (fileSession) {
    downloadJson('commonstead-file-current.json', fileSession.snapshot());
    return;
  }
  if (state) downloadJson('commonstead-run.json', continuity!.export(state));
}
/** A display-only note that stays until the recorded game message changes. */
let hostNote = { message: '', text: '' };
/**
 * Longer days: a resident left holding a load (for example after Cancel task) refuses every
 * new request until it is delivered. Instead of a dead end, the request becomes the existing
 * walk back to the workshop yard, which delivers the load to the shared store at the hub.
 */
function returnLoadsFirst(
  cmd: Command,
): { kind: 'settlement'; ids: string[]; action: string; target: string } | null {
  const w = state?.settlement;
  if (!state || !w || !('ids' in cmd)) return null;
  if (['public-exchange', 'long-roof-break-return', 'yield-return', 'story-act'].includes(cmd.kind))
    return null;
  if (cmd.kind === 'reply' || cmd.kind === 'peer' || cmd.kind === 'build') return null;
  if (cmd.kind === 'settlement' && ['map', 'cancel'].includes(cmd.action)) return null;
  if (cmd.kind === 'order' && ['rest', 'meal', 'push'].includes(cmd.target)) return null;
  const stuck = cmd.ids.filter((id) => w.actors[id]?.carried && !w.actors[id]?.job);
  if (!stuck.length) return null;
  return { kind: 'settlement', ids: stuck, action: 'map', target: 'yard' };
}
function issue(cmd: Command) {
  if (!state || state.ended || paused) return;
  const detour = returnLoadsFirst(cmd);
  if (detour && 'ids' in cmd) {
    issue(detour);
    const others = cmd.ids.filter((id) => !detour.ids.includes(id));
    // Pair invitations need both people, so they wait for the delivery; other requests go ahead.
    if (others.length && !(cmd.kind === 'settlement' && ['talk', 'spar'].includes(cmd.action)))
      issue({ ...cmd, ids: others });
    const names = detour.ids.map((id) => state?.villagers.find((v) => v.id === id)?.name ?? id).join(' and ');
    const accepted = detour.ids.every((id) => state?.settlement?.actors[id]?.job?.kind === 'map');
    if (state && accepted)
      hostNote = {
        message: currentNotice(state),
        text: `${names} ${detour.ids.length > 1 ? 'are' : 'is'} carrying materials and will take them to the hub first. Ask again after the delivery.`,
      };
    update();
    return;
  }
  const tutorialBuildingsBefore = state.buildings.length;
  workObservation.observeState(state);
  try {
    if (fileSession) {
      fileSession.apply(cmd);
      state = fileSession.state();
    } else apply(state, cmd);
  } catch (error) {
    if (fileSession && !fileSession.running) fileError(error);
    const notice = document.getElementById('notice');
    if (notice) notice.textContent = error instanceof Error ? error.message : 'The request could not start.';
    return;
  }
  if (state) workObservation.observeState(state);
  if (
    (tutorialStep === 'site' || tutorialStep === 'confirm-site') &&
    state &&
    state.buildings.length > tutorialBuildingsBefore &&
    cmd.kind === 'build' &&
    cmd.building === 'storehouse' &&
    state?.buildings.some((b) => b.kind === 'storehouse' && b.x === cmd.x && b.y === cmd.y)
  )
    tutorialStep = 'done';
  save();
  update();
}
function top(title: string) {
  return `<header class="top"><span>${title}</span><div class="row"><button id="info" aria-label="Controls and help">i</button><button id="menu">Pause menu</button></div></header>`;
}
function bind(id: string, fn: () => void) {
  document.getElementById(id)?.addEventListener('click', () => {
    if (continuity?.publishing) return;
    fn();
  });
}
function shellBindings() {
  bind('menu', menu);
  bind('info', info);
}
function title() {
  assemblyObservation.reset();
  if (fileSession) {
    fileTitle();
    return;
  }
  screen = 'title';
  continuity!.clear();
  state = null;
  selected = [];
  canvas = null;
  paused = false;
  lab?.screen('title');
  root.innerHTML = `<main class="title"><header><a href="https://human.adamwhite.work/games/">All games</a></header><section class="title-body"><p class="eyebrow">The residents share a workshop near Mill Bridge.</p><h1>Commonstead</h1><p>Finish a storehouse before the storm.<br>Work with eight residents. Each person has limits.</p><svg class="title-art" viewBox="0 0 600 140" role="img" aria-label="A storehouse and the people building it"><path d="M0 120 Q160 85 300 115 T600 113" fill="none" stroke="#aaa38c"/><path d="M239 65 L300 17 L361 65 Z" fill="#a97659" stroke="#574b38" stroke-width="2"/><path d="M250 66 H350 V116 H250Z" fill="#e9dfcb" stroke="#574b38" stroke-width="2"/><path d="M290 116 V87 H310 V116" fill="#6e665a"/><g fill="#4f6b3a" stroke="#23201b" stroke-width="2"><path d="M174 84 h16 v29 h-16Z"/><circle cx="182" cy="74" r="8" fill="#d5b48d"/><path d="M399 80 h16 v29 h-16Z"/><circle cx="407" cy="70" r="8" fill="#d5b48d"/></g></svg><p class="small">Use prepared boards, small ballast bags, and hand tools. The ballast bags serve as weights. Use trolleys to carry loads. Residents choose what they can manage. Open the menu to pause.</p>${stored(SAVE) ? '<button class="primary" id="continue">Resume</button>' : ''}<button class="${stored(SAVE) ? '' : 'primary'}" id="new">Start a short storm day</button><h2>Choose a scenario</h2><details><summary>A full day and night</summary><p>Thirty minutes at Steady, with a full day and night for eight residents. Supported saved histories carry over automatically. The storm arrives at 20:00. Supplies, travel, private replies, trolley conversations and sleep take time. Conversations depend on what actually happens in this day. Your saved chapter is replaced only after this day is ready.</p><button id="new-day">Start a settlement day</button></details><button id="title-feedback">Feedback</button><a href="/file/">Open a saved file</a><div class="menu-footer"><a href="${PRIVACY_URL}">Lab privacy</a></div><a href="https://human.adamwhite.work/lab/people/">${PEOPLE_ACROSS_GAMES}</a><div id="prepared-recovery"></div><p id="load-status" class="status" role="status"></p></section></main>`;
  void continuity!.admissions
    .read()
    .then((intent) => {
      const panel = document.getElementById('prepared-recovery');
      if (!intent || screen !== 'title' || !panel) return;
      panel.innerHTML =
        '<p>A prepared chapter is retained. The previous complete game remains available. Recovery checks current resident custody.</p><button id="recover-prepared">Check and recover prepared chapter</button><button id="discard-unused">Clear unused preparation</button><button id="download-prepared">Download prepared chapter</button><button id="download-previous">Download previous complete game</button>';
      bind('download-prepared', () => {
        void continuity!.admissions.preparedText().then((text) => {
          if (text) downloadStoredRun('commonstead-prepared-chapter.json', text);
        });
      });
      bind('download-previous', () => {
        if (nativeText) downloadStoredRun('commonstead-previous-complete.json', nativeText);
      });
      bind('discard-unused', () => {
        void continuity!
          .discardUnused()
          .then(() => {
            title();
            const status = document.getElementById('load-status');
            if (status) status.textContent = 'The unused preparation was cleared. Your saved game was kept.';
          })
          .catch(() => {
            const status = document.getElementById('load-status');
            if (status)
              status.textContent =
                'The preparation could not be cleared safely. Your saved game and both downloads are still available.';
          });
      });
      bind('recover-prepared', () => {
        void continuity!
          .recoverPrepared()
          .then((candidate) => {
            if (candidate) {
              start(candidate);
              save();
            }
          })
          .catch((error) => {
            const status = document.getElementById('load-status');
            if (status) status.textContent = String(error);
          });
      });
    })
    .catch(() => {});
  const begin = async (day = false) => {
    const generation = continuity!.beginEntry();
    const status = document.getElementById('load-status');
    try {
      const prepared = await continuity!.fresh(
        418,
        day ? { edition: EDITION } : undefined,
        undefined,
        generation,
      );
      if (!continuity!.currentEntry(generation)) return;
      closeModal();
      start(prepared);
      await continuity!.recording(false, generation);
      if (continuity!.currentEntry(generation)) save();
    } catch (error) {
      if (!continuity!.currentEntry(generation)) return;
      console.error(error);
      if (status)
        status.textContent =
          'The new game could not start. Your saved game is unchanged. Try again or choose Feedback to report the problem.';
      const message = document.getElementById('setup-status');
      if (message)
        message.textContent = 'The new game could not start. Your saved game is unchanged. Try again.';
    }
  };
  bind('new-day', () => {
    continuity!.beginEntry();
    if (!stored(SAVE)) {
      void begin(true);
      return;
    }
    const button = document.getElementById('new-day');
    if (!button || document.getElementById('replace-day')) return;
    button.insertAdjacentHTML(
      'afterend',
      '<p>Replace your saved chapter with this longer day?</p><button id="replace-day">Replace with settlement day</button>',
    );
    bind('replace-day', () => {
      void begin(true);
    });
  });
  bind('new', () => {
    continuity!.beginEntry();
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
  bind('title-feedback', () => {
    continuity!.beginEntry();
    feedback();
  });
  bind('continue', () => {
    const generation = continuity!.beginEntry();
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel loading';
    cancel.onclick = () => {
      continuity!.beginEntry();
      cancel.remove();
    };
    document.getElementById('load-status')?.after(cancel);
    loadingProgress(0);
    void (async () => {
      try {
        const loaded = await continuity!.loadLocal(stored(SAVE) ?? '', generation);
        if (!continuity!.currentEntry(generation)) return;
        start(loaded);
        await continuity!.recording(false, generation);
        if (continuity!.currentEntry(generation)) save();
      } catch (error) {
        if (!continuity!.currentEntry(generation)) return;
        const el = document.getElementById('load-status');
        console.error(error);
        if (el)
          el.textContent =
            error instanceof Error
              ? error.message
              : 'The saved game could not open. Keep the original save and start a fresh game.';
      } finally {
        cancel.remove();
      }
    })();
  });
}
function start(s: State) {
  if (fileSession) cancelFileCallbacks();
  assemblyObservation.reset();
  forecastWorld = {};
  if (!fileSession) resumeForPlay(s);
  workObservation = new WorkObservation();
  workObservation.observeState(s);
  unitKey = '';
  residentKey = '';
  actionKey = '';
  state = s;
  viewedMap = 'yard';
  screen = 'play';
  tutorialStep = null;
  tutorialTarget = null;
  tutorialRenderedStep = null;
  tutorialOutcome = '';
  if (s.tick === 0 && !stored(TUTORIAL_KEY))
    tutorialStep = s.settlement || s.continuedWorkshop ? 'unavailable' : 'select';
  selected = [];
  paused = false;
  carry = 0;
  last = performance.now();
  lab?.screen('play');
  root.innerHTML = `<main class="game ${s.settlement ? 'settlement-day' : ''}">${top('Commonstead')}<div class="stock" id="stock"></div><div class="layout"><div class="map-wrap"><div class="speed" aria-label="Game speed"><button data-speed="0.5">Slow</button><button data-speed="1">Steady</button><button data-speed="4">Fast</button></div><canvas id="map" aria-label="The map shows the workshop yard. You can use the person and resource buttons below to give orders."></canvas><div class="map-caption">Select people, then choose work.</div></div><aside class="side"><section class="objective"><strong id="goal">Keep the shared supplies dry.</strong>${s.settlement ? '<button id="goal-reading-open" aria-expanded="false" aria-controls="goal-reading">Can we finish?</button>' : ''}<p id="deadline" class="deadline"></p><div class="stock-plan"><span id="supply-readiness"></span><span id="storm-meals"></span></div><p class="details">A cabin prepared with 40 boards makes room for two more people. Invite helpers at the workshop hub.</p></section><section class="sheet">${s.settlement ? '<section id="goal-reading" hidden aria-label="Can we finish?"><h2>Can we finish?</h2><div id="goal-reading-text"></div><p class="small">This reading watches work while this day is open. Use Slow to read more slowly, or open the pause menu to stop the clock.</p><button id="goal-reading-close">Close this reading</button></section>' : ''}<h2 id="selection">Select a person or the workshop hub.</h2><p class="small selection-help">Names add or remove people. Your selection stays after an order. Clear it before choosing a different crew. Map taps replace the selection.</p><div id="units" class="unit-list" aria-label="Add or remove selected people"></div><details class="work-overview"><summary>Everyone now</summary><p class="small">Current activity and retained requests are separate. Last words may describe an earlier event. After a break, the Now line says how tired the person felt before and after it. A reason for an earlier choice may not have been recorded.</p><ol id="everyone-now"></ol></details><p id="task" class="task"></p><p id="said" class="speech"></p><details class="work-help"><summary>Dividing work and adding builders</summary><p class="small">Different groups can collect boards and ballast at the same time. Travel takes time. A person collecting supplies cannot assemble the storehouse at the same time. Residents may choose their own breaks.</p><p class="small">Select people, choose Move / add builders, then tap the unfinished storehouse to add them to assembly.</p></details><div id="resident"></div><div id="settlement-controls"></div><div id="residual-controls"></div></section><div class="notice" id="notice" role="status"></div><section id="finish-day"></section><section class="actions" id="actions"></section></aside></div></main>`;
  bind('goal-reading-open', () => {
    const reading = document.getElementById('goal-reading');
    if (reading) {
      reading.hidden = false;
      document.getElementById('goal-reading-open')?.setAttribute('aria-expanded', 'true');
      reading.scrollIntoView({ block: 'nearest' });
    }
  });
  bind('goal-reading-close', () => {
    const reading = document.getElementById('goal-reading');
    if (reading) reading.hidden = true;
    document.getElementById('goal-reading-open')?.setAttribute('aria-expanded', 'false');
    document.getElementById('goal-reading-open')?.focus();
  });
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
  } else if (s.continuedWorkshop) {
    const objective = document.querySelector('.objective .details');
    const morning = morningWorkshopView(s);
    if (objective)
      objective.textContent = morning
        ? `${morning.objective} Choosing a new cabin site costs 40 boards. Travel, work, meals and rest take time. A request can be refused.`
        : 'The earlier storm result remains recorded. Continue this workshop until 08:00, or end here. Earlier work and supplies remain.';
    const workHelp = document.querySelector('.work-help');
    if (workHelp)
      workHelp.innerHTML =
        '<summary>Dividing work and adding builders</summary><p class="small">Different groups can collect meals and boards or prepare a cabin. Travel takes time. Each person can do one task at a time and may choose a break.</p><p class="small">To add builders, select people, choose Move / add builders, then select the unfinished site.</p>';
  } else if (s.rules) {
    const objective = document.querySelector('.objective .details');
    if (objective)
      objective.textContent = `Tired people work slowly; a break helps. The storm keeps everyone indoors tomorrow, so the dry store needs ${STORM_MEALS} meals per person. At 10:00, everyone should be under a roof: the workshop hub or a finished building. A cabin prepared with 40 boards makes room for two more people. Invite helpers at the workshop hub.`;
  }
  if (continuity?.admissionBlocked.length) {
    const notice = document.createElement('p');
    notice.id = 'continuity-status';
    notice.className = 'small';
    notice.setAttribute('role', 'status');
    notice.textContent = continuity.admissionBlocked
      .map(
        (entry) =>
          `${CAST.find((c) => c.castId === entry.castId)?.name}: the saved history could not carry over. They start fresh here. The earlier saved history stays as it was.`,
      )
      .join(' ');
    document.querySelector('.objective')?.append(notice);
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]'))
    b.onclick = () => {
      speed = Number(b.dataset.speed);
      update();
    };
  bindMap(canvas);
  update();
  if (fileSession) {
    paused = !fileSession.running;
    if (s.ended) end();
    else if (paused) menu();
    else scheduleFileFrame();
  } else if (s.ended) end();
  else if (s.shortYield && continuity!.playPaused) {
    menu();
    save();
  } else save();
}
function update() {
  if (!state || screen !== 'play') return;
  const s = state;
  if (
    (tutorialStep === 'wood' || tutorialStep === 'stone') &&
    !selected.some((id) => s.villagers.some((v) => v.id === id))
  )
    tutorialStep = 'select';
  if (tutorialStep === 'select' && selected.some((id) => s.villagers.some((v) => v.id === id)))
    tutorialStep = s.resources.wood < 180 ? 'wood' : s.resources.stone < 120 ? 'stone' : 'store';
  if (tutorialStep === 'wood-progress' && Math.floor(s.resources.wood) > Math.floor(tutorialBaseline)) {
    tutorialOutcome = `Boards ${Math.floor(tutorialBaseline)} → ${Math.floor(s.resources.wood)}.`;
    tutorialStep = 'stone';
  }
  if (tutorialStep === 'stone-progress' && Math.floor(s.resources.stone) > Math.floor(tutorialBaseline)) {
    tutorialOutcome = `Ballast bags ${Math.floor(tutorialBaseline)} → ${Math.floor(s.resources.stone)}.`;
    tutorialStep = 'store';
  }

  const morning = morningWorkshopView(s);
  assemblyObservation.observe(forecastWorld, s);
  const reading = document.getElementById('goal-reading-text');
  if (reading) {
    const words = [...goalForecast(s, assemblyObservation.pace(forecastWorld, s)), ...deliveryReading(s)];
    const text = words.map((line) => `<p>${esc(line)}</p>`).join('');
    if (reading.innerHTML !== text) reading.innerHTML = text;
  }
  const t = `${Math.floor(s.tick / 60)}:${String(s.tick % 60).padStart(2, '0')}`;
  const put = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  const capacity = 10 + s.buildings.filter((b) => b.kind === 'house' && b.complete).length * 2;
  const stock = document.getElementById('stock');
  if (stock)
    stock.innerHTML = `<span><b>Meals</b> ${Math.floor(s.resources.food)}</span><span><b>Boards</b> ${Math.floor(s.resources.wood)}</span><span><b>Ballast bags</b> ${Math.floor(s.resources.stone)}</span><span><b>People</b> ${s.villagers.length} / ${capacity} housing spaces</span><span><b>Paper</b> ${s.story!.paper} of 4 opening sheets remain</span>`;
  put('supply-readiness', morning ? morning.cabinLine : supplyReadiness(s));
  put(
    'storm-meals',
    morning
      ? morning.mealLine
      : s.rules && !s.ended && !s.continuedWorkshop
        ? s.resources.food < STORM_MEALS * s.villagers.length
          ? `Storm meals short: ${Math.ceil(STORM_MEALS * s.villagers.length - s.resources.food)} more needed for ${s.villagers.length} people.`
          : 'Storm meals are enough for the current residents.'
        : '',
  );
  const store = s.buildings.find((b) => b.kind === 'storehouse');
  put(
    'goal',
    morning
      ? morning.objective
      : store?.complete
        ? 'The storehouse is ready.'
        : 'Keep the shared supplies dry.',
  );
  put(
    'deadline',
    morning
      ? `Resident time ${continuedClock(s)}. The morning task ends at 10:00. ${morning.resultLine}`
      : s.settlement
        ? `${dayClock(s)}. ${milestone(s)} View: ${MAPS[viewedMap].name}.`
        : `The time is ${t}. ${s.continuedWorkshop ? `Same workshop after its storm. Resident time ${continuedClock(s)}; its short scenario deadline was10:00.` : milestone(s)}`,
  );
  const finishDay = document.getElementById('finish-day');
  const finishMode =
    s.shortYield || s.remainder?.running
      ? 'yielded'
      : !s.settlement &&
          !s.continuedWorkshop &&
          !s.ended &&
          s.buildings.some((b) => b.kind === 'storehouse' && b.complete)
        ? 'eligible'
        : '';
  if (finishDay && finishDay.dataset.mode !== finishMode) {
    finishDay.dataset.mode = finishMode;
    finishDay.innerHTML =
      finishMode === 'eligible'
        ? '<button id="yield-day">Leave the remaining day to the residents</button><p class="small">Your current requests remain. Residents continue until the storm. You can pause. You give no further orders in this run.</p>'
        : finishMode === 'yielded'
          ? `<p>Residents continue through the actual remaining ${Math.max(0, 600 - s.tick)} game seconds. Meals and roofs still matter. You can pause.</p><button id="stop-remainder">Stop automatic advancement here</button>`
          : '';
    bind('stop-remainder', () => issue({ kind: 'remainder', action: 'stop' }));
    bind('yield-day', () => {
      issue({ kind: 'remainder', action: 'start' });
      if (state?.shortYield) {
        placing = '';
        moveMode = false;
        carry = 0;
        update();
      }
    });
  }
  const dayHost = document.getElementById('settlement-controls');
  if (s.settlement && dayHost)
    updateSettlementControls(dayHost, s, selected, issue, (id) => {
      selected = [id];
      update();
    });
  const residualHost = document.getElementById('residual-controls');
  if (residualHost) updateStoryControls(residualHost, s, selected, issue);
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
  put(
    'task',
    people.length > 1
      ? `Now: ${people.length} people selected. Open Everyone now for each person's current activity and retained request.`
      : people.map((v) => workObservation.summary(s, v)).join(' '),
  );
  const overview = document.getElementById('everyone-now');
  if (s.settlement && overview && !document.getElementById('work-route-cause')) {
    const facts = document.createElement('div');
    facts.innerHTML =
      '<p class="small" id="work-route-cause"></p><p class="small" id="work-material-flow"></p>';
    overview.closest('details')?.after(facts);
  }
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
      ? people
          .filter((p) => p.says)
          .map((p) => `Last words from ${residentName(p)}: “${p.says}”`)
          .join(' ')
      : 'Select a person, then tap Meals, Boards or Ballast bags.',
  );
  put(
    'notice',
    placing
      ? `Selected: ${people.map((v) => residentName(v)).join(', ') || 'no people'}. ${placementFeedback ? `${placementFeedback} ` : ''}Choose open ground for the ${placing === 'house' ? 'guest cabin (40 boards)' : 'storehouse (180 boards and 120 ballast bags)'}. ${s.settlement ? 'The game checks the site and available residents when you tap.' : 'Dots show some legal points. Other open points can also work. The outline shows its size. Choose people who are free to build. You still need its materials.'} No materials are spent on a refused order. Choose Cancel to leave placement.`
      : moveMode
        ? 'Choose a destination on the map. Tap the unfinished storehouse to add builders, or tap ground to move. Choose Cancel to leave this mode.'
        : hostNote.text && hostNote.message === currentNotice(s)
          ? hostNote.text
          : `Last order or event: ${publicPlaceText(eventText(currentNotice(s).startsWith('Spend a minute together.') ? invitationReadiness(s, selected, 'listen') : currentNotice(s)))}`,
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
      ? `<p class="small">${esc(residentName(person))}${entry ? ` is ${Math.floor((person.person.now - person.person.life.bornAt) / 525600)} years old.` : ' is helping at the workshop today.'} ${esc(person.role)} ${esc(person.assignment)}</p>${person.lifeLine ? `<p class="small">${esc(person.lifeLine)}</p>` : ''}<details><summary>Personal transcript</summary><ol id="personal-transcript"></ol></details><div class="resident-conversation"><p class="small" id="conversation-clock"></p><p class="small" id="conversation-readiness"></p><button id="listen">${s.settlement ? 'Invite a private story' : 'Invite conversation'}</button>${s.settlement ? '' : `<p class="small" id="collaboration-readiness"></p><button id="collaborate" ${person.discovery !== 1 ? 'disabled' : ''}>Offer a small collaboration</button>`}${person.discovery && scene ? `<p class="disclosed-story">${esc(scene[person.discovery === 2 ? 1 : 0])}</p>` : ''}</div><details ${open ? 'open' : ''}><summary>About this resident</summary><p class="small">${esc(person.family)}</p><p class="small">Use a trolley and choose a comfortable load of prepared materials. Do not do electrical work, change the building structure or use powered tools.</p></details>`
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
  const transcript = document.getElementById('personal-transcript');
  if (transcript && person && transcript.closest('details')?.open) {
    const lines = publicTranscript(s, person.id).map((l) => `${l.clock} · ${l.kind}: ${l.text}`);
    const key = lines.join('\n');
    if (transcript.dataset.lines !== key) {
      transcript.dataset.lines = key;
      transcript.replaceChildren(
        ...lines.map((line) => {
          const li = document.createElement('li');
          li.textContent = line;
          return li;
        }),
      );
    }
  }
  put('conversation-clock', `Chapter time: ${t}.${s.settlement ? ` The time here is ${dayClock(s)}.` : ''}`);
  put('conversation-readiness', invitationReadiness(s, selected, 'listen'));
  put('collaboration-readiness', s.settlement ? '' : invitationReadiness(s, selected, 'collaborate'));
  const units = document.getElementById('units');
  const nextUnitKey = JSON.stringify([s.villagers.map((v) => v.id), selected]);
  if (units && nextUnitKey !== unitKey) {
    unitKey = nextUnitKey;
    units.innerHTML = `<button id="select-hub">Select workshop hub</button>${s.villagers
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
    bind('select-hub', () => {
      selected = ['town'];
      placing = '';
      moveMode = false;
      update();
    });
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
        ? `<button class="wide" id="cancel">Cancel placement or movement</button>${placing ? '<button id="named-site">Choose an open site</button><p id="named-site-fact"></p><button id="confirm-site">Confirm this site</button>' : ''}`
        : town
          ? `<button class="wide primary" id="train" ${s.resources.food < 35 || s.villagers.length >= capacity || s.trainingUntil !== null ? 'disabled' : ''}>Invite helper · 35 meals</button><button class="wide" id="select-workers">Select all people</button><p class="small wide">${s.villagers.length >= capacity ? 'Choose a cabin site and prepare it with 40 boards to make room for a helper.' : s.resources.food < 35 ? 'Collect more meals before inviting a helper.' : s.trainingUntil !== null ? 'A helper is learning the light tasks and will arrive shortly.' : 'A helper arrives after 15 seconds of learning these light tasks.'}</p>`
          : `<button data-resource="food" ${!people.length ? 'disabled' : ''}>Meals</button><button data-resource="wood" ${!people.length ? 'disabled' : ''}>Boards</button><button data-resource="stone" ${!people.length ? 'disabled' : ''}>Ballast bags</button><p class="small wide" id="order-consequences"></p><button id="rest" ${!people.length ? 'disabled' : ''}>Rest · keep current request</button><button id="meal" ${!people.length ? 'disabled' : ''}>Eat and drink · 2 meals each</button>${s.rules ? '<button id="rest-all">Everyone rests</button><button id="shelter-all">Everyone under a roof · stop work</button>' : ''}<button class="wide" id="roof-break-return">Roof break, then offer earlier work</button><p class="small wide" id="roof-break-why"></p><p class="small wide" id="meal-why"></p><button id="move" ${!people.length ? 'disabled' : ''}>Move / add builders · choose on map</button><button id="house" ${!people.length || s.resources.wood < 40 ? 'disabled' : ''}>Prepare cabin · 40 boards</button><p class="small cabin-help">Invite helpers at the workshop hub.</p><button id="store" ${!people.length || (!store && (s.resources.wood < 180 || s.resources.stone < 120)) || store?.complete ? 'disabled' : ''}>${store ? (store.complete ? 'Storehouse is complete' : 'Storehouse · add selected builders') : 'Storehouse · 180 boards, 120 ballast bags'}</button><p class="small wide" id="store-why"></p><button id="push" ${!people.length ? 'disabled' : ''}>Insist on work</button>${s.rules ? `<button id="shelter" ${!people.length ? 'disabled' : ''}>Go under a roof · stop work</button>` : ''}`;
    for (const b of actions.querySelectorAll<HTMLButtonElement>('[data-resource]'))
      b.onclick = () => {
        const node = NODES.find((n) => n.kind === b.dataset.resource);
        if (node) order(node.id);
      };
    bind('rest', () => order('rest'));
    bind('shelter', () => order('shelter'));
    // One public control for the recorded itinerary; ordinary roof/rest controls keep their rules.
    bind('roof-break-return', () =>
      issue({ kind: state?.settlement ? 'long-roof-break-return' : 'roof-break-return', ids: [...selected] }),
    );
    bind('meal', () => order('meal'));
    const everyone = (target: string) => () => {
      const now = state;
      if (!now) return;
      issue({
        kind: 'order',
        ids: now.villagers.filter((v) => target !== 'rest' || v.recoveryUntil <= now.tick).map((v) => v.id),
        target,
      });
    };
    bind('rest-all', everyone('rest'));
    bind('shelter-all', everyone('shelter'));
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
      if (store && !store.complete) {
        issue({ kind: 'order', ids: [...selected], target: store.id });
        return;
      }
      placementFeedback = '';
      placementPoint = { x: 650, y: 500 };
      placing = 'storehouse';
      if (tutorialStep === 'store') tutorialStep = 'site';
      update();
    });
    bind('named-site', () => {
      namedSite = null;
      for (let y = 55; y <= 645 && !namedSite; y += 20)
        for (let x = 55; x <= 945; x += 20)
          if (openPlacementGround(x, y, [...s.buildings, ...NODES])) {
            namedSite = { x, y };
            break;
          }
      if (namedSite) {
        if (tutorialStep === 'site') tutorialStep = 'confirm-site';
        placementPoint = namedSite;
        const e = document.getElementById('named-site-fact');
        if (e)
          e.textContent = `Candidate centre ${namedSite.x}, ${namedSite.y}. The same footprint and costs apply. Confirm to request it.`;
        renderTutorial();
      }
    });
    bind('confirm-site', () => {
      if (!namedSite || !placing) return;
      const point = { ...namedSite },
        kind = placing === 'house' ? 'house' : 'storehouse';
      issue({ kind: 'build', ids: [...selected], building: kind, ...point });
      if (s.buildings.some((b) => b.kind === kind && b.x === point.x && b.y === point.y)) {
        placing = '';
        namedSite = null;
        update();
      }
    });
    bind('cancel', () => {
      if (tutorialStep === 'site' || tutorialStep === 'confirm-site') tutorialStep = 'store';
      namedSite = null;
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
  const roofWhy = s.settlement ? longRoofUnavailable(s, selected) : roofBreakUnavailable(s, selected);
  const roofButton = document.getElementById('roof-break-return') as HTMLButtonElement | null;
  if (roofButton) roofButton.disabled = !!roofWhy;
  put(
    'roof-break-why',
    roofWhy ||
      (s.settlement
        ? 'Finish current acts and deliver carried supplies first. Then consider walking to the hub roof, the existing 15-game-second rest and earlier work. Each request can be refused. A new accepted task or departure pause interrupts unfinished stages.'
        : 'Stops selected work now. Walk to the hub roof, rest for 35 planned game seconds, then offer each person their own earlier work. A new task cancels unfinished stages. One break may not be enough; another personal activity or refusal remains possible.'),
  );
  put('order-consequences', orderConsequences(s, selected));
  put('work-route-cause', routeCause(s));
  put('work-material-flow', materialFlow(s));
  put('store-why', storehouseWhy(s, people.length, store));
  put('meal-why', mealWhy(s, people.length));
  if (s.shortYield)
    for (const b of document.querySelectorAll<HTMLButtonElement>('#actions button, #resident button'))
      b.disabled = true;
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]'))
    b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed));
  renderTutorial();
}
/** Why the Storehouse button is unavailable, in counts the player can act on. */
function storehouseWhy(
  s: State,
  selectedCount: number,
  store: State['buildings'][number] | undefined,
): string {
  if (store?.complete) return 'The storehouse is finished.';
  if (store)
    return 'The site is chosen. To add builders, select people, choose Move / add builders, then tap the site.';
  const wood = Math.floor(s.resources.wood),
    stone = Math.floor(s.resources.stone);
  const short = [
    wood < 180 ? `boards ${wood} of 180` : '',
    stone < 120 ? `ballast bags ${stone} of 120` : '',
  ].filter(Boolean);
  if (short.length) return `Storehouse not ready yet: ${short.join(', ')}. Send people to collect them.`;
  return selectedCount
    ? 'You have the materials. Choose Storehouse, then tap open ground.'
    : 'You have the materials. Select the builders, then choose Storehouse.';
}
/** Eating costs against the current public target; rest does not promise recovery. */
function mealWhy(s: State, selectedCount: number): string {
  const meals = Math.floor(s.resources.food);
  if (!s.rules) return `Eating uses 2 meals per person. The store has ${meals}.`;
  const morning = morningWorkshopView(s);
  if (s.continuedWorkshop) {
    const cost = 2 * selectedCount;
    return `${selectedCount && cost <= meals ? `Eating now uses ${cost} meals and leaves ${meals - cost}.` : 'Eating uses 2 meals per person.'} ${morning ? morning.mealLine : `The store has ${meals} counted meal units.`} ${morning ? `The target at 10:00 stays ${morning.mealTarget} meal units, regardless of how many people are here.` : 'The earlier storm result remains recorded.'} Meals do not lower tiredness. One rest may not be enough. Residents may choose another break.`;
  }
  const need = STORM_MEALS * s.villagers.length;
  const cost = 2 * selectedCount;
  return `${
    selectedCount && cost <= meals
      ? `Eating now uses ${cost} meals and leaves ${meals - cost}.`
      : 'Eating uses 2 meals per person.'
  } The store has ${meals}; the storm day needs ${need} (${STORM_MEALS} per person). Meals do not lower tiredness. A rest does, though one rest may not be enough. Very tired people work much more slowly.`;
}
function order(target: string, x?: number, y?: number) {
  const before = state?.resources[target === 'wood' ? 'wood' : 'stone'] ?? 0;
  const previousOrders = new Map(state?.villagers.map((v) => [v.id, JSON.stringify(v.order)]) ?? []);
  const priorStep = tutorialStep;
  issue({
    kind: 'order',
    ids: selected.filter((id) => state?.villagers.some((v) => v.id === id)),
    target,
    ...(x === undefined ? {} : { x, y }),
  });
  const accepted =
    state &&
    selected.some(
      (id) =>
        state?.villagers.find((v) => v.id === id)?.order?.target === target &&
        JSON.stringify(state?.villagers.find((v) => v.id === id)?.order) !== previousOrders.get(id),
    );
  if (
    accepted &&
    ['wood', 'stone'].includes(target) &&
    priorStep &&
    ['wood', 'wood-progress', 'stone', 'stone-progress', 'store'].includes(priorStep)
  ) {
    tutorialBaseline = before;
    tutorialStep = target === 'wood' ? 'wood-progress' : 'stone-progress';
    update();
  }
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
    if (fileSession)
      hostNote = {
        message: currentNotice(state),
        text: 'Select residents on the map you are viewing. Use Travel to ask them to change maps.',
      };
    else
      state.message = 'Select residents on the map you are viewing. Use Travel to ask them to change maps.';
    update();
    return;
  }
  if (placing) {
    const kind = placing;
    const before = state?.buildings.length;
    const reason = state ? placementReason(state, selected, x, y) : '';
    issue({ kind: 'build', ids: selected, building: kind, x, y });
    if (state && state.buildings.length !== before) {
      placing = '';
      placementFeedback = '';
    } else placementFeedback = reason || (state?.message ?? '');
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
    const holdEpoch = fileSession?.epoch,
      callbackEpoch = fileCallbackEpoch;
    holdTimer = setTimeout(() => {
      if (
        fileSession &&
        (holdEpoch !== fileSession.epoch ||
          callbackEpoch !== fileCallbackEpoch ||
          paused ||
          !fileSession.running)
      )
        return;
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
/** User closes retire every pending file selection and owned callback. */
function closeModal() {
  if (fileSession) {
    fileSession.invalidate();
    cancelFileCallbacks();
  }
  removeModal();
}
/** Successful file installation and explicit Resume keep their validated session. */
function removeModal() {
  fileTools?.remove();
  modal?.remove();
  modalFocus.close();
  modal = null;
  paused = fileSession ? !fileSession.running : false;
  last = performance.now();
  if (state?.shortYield) save();
  if (fileSession) scheduleFileFrame();
}
function sheet(html: string, infoOnly = false) {
  const replacing = !!modal,
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  assemblyObservation.reset();
  fileTools?.remove();
  if (fileSession) cancelFileCallbacks();
  modal?.remove();
  paused = true;
  modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<section role="dialog" aria-modal="true" aria-label="${infoOnly ? 'Controls' : 'Game menu'}" class="panel ${infoOnly ? 'info-panel' : ''}">${html}</section>`;
  root.append(modal);
  if (replacing) modalFocus.replace(modal);
  else modalFocus.open(modal, opener);
  if (fileTools) modal.querySelector('.panel')?.append(fileTools);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  // Focus the first control without scrolling a long help panel past its heading.
  modal.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  const panel = modal.querySelector('.panel');
  if (panel) panel.scrollTop = 0;
  if (state?.shortYield) save();
}
function info() {
  if (state?.settlement) {
    sheet(
      '<h2>Controls · game paused</h2><p>Select names, then choose requests. Open Travel, conversations and the day for named destinations and building sites. All actions have buttons that work with Tab and Enter. View changes the map you see; Travel asks residents to make a real journey. Requests made during work or travel are rejected; wait and ask again, or cancel the current task explicitly. An accepted request may wait through a body activity and can still be refused. Cancel stops a task without completing it.</p><p>Finish the storehouse before 20:00. The game lasts thirty minutes at Steady while bodies and duties advance through a full day and night. Central resource counts are exact. Dated reports can be incomplete or out of date. The menu pauses.</p><button id="close-info">Back to the workshop</button>',
      true,
    );
    bind('close-info', closeModal);
    return;
  }
  if (state?.continuedWorkshop) {
    const morning = morningWorkshopView(state);
    sheet(
      `<h2>Controls · game paused</h2><p>${morning ? esc(morning.objective) : 'The earlier storm result remains recorded. This workshop continues until 08:00. You can end here instead.'}</p>${morning ? `<p>${esc(morning.cabinLine)} ${esc(morning.mealLine)} Only the first new guest-cabin site chosen this morning is the target. Earlier cabins keep their actual progress. Choosing a new cabin site uses 40 boards.</p>` : '<p>Earlier work and supplies remain. At 08:00 you can choose the morning task, download this run, or end.</p>'}<p>Select people, then choose Meals, Boards or Ballast bags. To prepare a guest cabin, select builders, choose Prepare cabin, then choose open ground. To add builders to an unfinished site, select people, choose Move / add builders, then select that site. Travel and work take time. Residents may refuse a request.</p><p>Eat and drink uses 2 meal units per person from the shared store. A planned rest takes 35 game seconds and retains the current work request. One rest may not be enough. Residents may choose another break. Going under a roof replaces the work request; give a new work request afterward. Read Now for the actual activity. Earlier words and events remain historical.</p><p>Open the menu to pause. Slow, Steady and Fast change how quickly time passes. You can end at the next action boundary. ${morning ? 'If you end before 10:00, the 10:00 targets are not assessed.' : ''}</p><button class="primary" id="close-info">Back to the workshop</button>`,
      true,
    );
    bind('close-info', closeModal);
    return;
  }
  sheet(
    `<h2>Controls · game paused</h2><p>Finish the storehouse before 10:00 to keep the shared supplies dry. If it is unfinished, the supplies get soaked. Preparing a guest cabin adds room for two people.</p><p>Tap names to add or remove people from your selection. A map tap replaces the selection. Select names, then choose Meals, Boards or Ballast bags. Select the workshop hub on the map to invite a local helper.</p><p>On a computer, drag a box to select people. Right-click a destination to give an order. On a phone, tap a person to select that person. Drag a box to select a group. Hold a destination to give an order.</p><p>After the game clock reaches 1:00, offer one person a break. Wait five game seconds during that break so the conversation invitation becomes available. This wait does not mean the person has recovered. No shared location or earlier conversation is required. Choose Invite conversation beside the resident. The person may share something private. A small collaboration is optional.</p><p>A planned rest takes 35 game seconds. When it ends, the Now line says how tired the person felt before and after it. One break may not be enough. Read Now for the current activity. Last words and Last order or event can describe earlier events. People may still report tiredness or choose another break. Eat and drink uses meals where each person is standing. Insist on work asks people to continue even if they object. They may remember the pressure.</p><p>The storehouse costs 180 boards and 120 ballast bags. Select builders. Choose Storehouse, then tap open ground. To add builders later, select people, choose Move / add builders, then tap the unfinished storehouse. Different groups can collect boards and ballast at the same time. Travel takes time; collecting and building occupy the same people. Opening the menu pauses the game. Slow, Steady and Fast change how quickly time passes.</p>${state?.rules ? `<p>Tired people work slowly. A very tired person works at about a quarter of their usual pace. A rest lowers tiredness; meals do not. Everyone rests gives a break to all who are not already resting. Insisting on work makes people slower and they remember it. Once the storehouse is ready, the day is not over. The storm keeps everyone indoors tomorrow, so the dry store needs ${STORM_MEALS} meals per person. Eating uses 2 meals per person from that same store. Before 10:00, choose Go under a roof or Everyone under a roof, or keep people beside a finished building. Residents caught outside get soaked. Meals are slower to gather than boards. At the end, each resident says what this day was like for them. You can also continue the workshop and ask for a timed closing conversation.</p>` : ''}<button class="primary" id="close-info">Back to the workshop</button>`,
    true,
  );
  bind('close-info', closeModal);
}
async function saveAndTitle(id: string) {
  const owner = state,
    view = screen,
    dialog = modal,
    generation = continuity?.generation,
    button = document.getElementById(id) as HTMLButtonElement | null;
  if (!button || button.disabled) return;
  button.disabled = true;
  const written = await save();
  if (
    state !== owner ||
    screen !== view ||
    modal !== dialog ||
    !button.isConnected ||
    (continuity && !continuity.currentEntry(generation!))
  )
    return;
  if (!written) {
    button.disabled = false;
    nativeSaveStatus('The game could not be saved. Download this run before leaving.');
    return;
  }
  closeModal();
  title();
}
function menu() {
  sheet(
    `<h2>Paused</h2><p>${fileSession ? 'This file session stays in memory. Download it before leaving.' : esc(nativeSaveMessage || 'Saving this game on this device…')}</p><button class="primary" id="resume">Resume</button><button id="feedback">Feedback</button><button id="replay-tutorial">Replay tutorial</button><button id="fullscreen">Full screen</button><a href="https://human.adamwhite.work/games/">All games</a><div id="toggle"></div><button id="new-menu">New game</button><div id="menu-confirm"></div><button id="menu-title">Back to the title page</button><a href="https://human.adamwhite.work/lab/people/">${PEOPLE_ACROSS_GAMES}</a><button id="download">Download this run</button><a href="/file/">Open a saved file</a><div class="menu-footer"><a href="${PRIVACY_URL}">Lab privacy</a><details class="debug"><summary>Debug</summary><div id="compact-download"></div></details></div>`,
  );
  if (state?.shortYield) save();
  if (lab) document.getElementById('toggle')?.append(telemetryToggle(lab));
  bind('menu-title', () => void saveAndTitle('menu-title'));
  bind('resume', () => {
    if (fileSession) {
      try {
        fileSession.resume();
        state = fileSession.state();
      } catch (error) {
        fileError(error);
        return;
      }
    }
    if (fileSession) removeModal();
    else closeModal();
    if (fileSession) scheduleFileFrame();
  });
  bind('replay-tutorial', () => {
    if (!state || screen !== 'play') return;
    if (fileSession) {
      try {
        fileSession.resume();
        state = fileSession.state();
      } catch (error) {
        fileError(error);
        return;
      }
      removeModal();
      scheduleFileFrame();
    } else closeModal();
    if (!state) return;
    tutorialTarget = null;
    tutorialOutcome = '';
    tutorialStep =
      state.settlement || state.continuedWorkshop || state.ended
        ? 'unavailable'
        : state.buildings.some((b) => b.kind === 'storehouse')
          ? 'done'
          : selected.some((id) => state?.villagers.some((v) => v.id === id))
            ? state.resources.wood < 180
              ? 'wood'
              : state.resources.stone < 120
                ? 'stone'
                : 'store'
            : 'select';
    update();
  });
  bind('download', download);
  if (!fileSession && state) {
    const button = document.createElement('button');
    button.textContent = 'Download local departure source for selected resident';
    button.onclick = () => {
      if (!state) return;
      const id = selected.length === 1 ? selected[0] : undefined;
      if (!id) {
        nativeSaveStatus('Select one resident before preparing a local departure source.');
        return;
      }
      void continuity!
        .departure(state, id)
        .then((candidate) => downloadJson('commonstead-local-departure.json', candidate))
        .catch((error) => nativeSaveStatus(String(error)));
    };
    document.getElementById('download')?.after(button);
  }

  if (!fileSession && (state?.settlement || state?.shortYield || state?.roofBreak)) {
    const b = document.createElement('button');
    b.textContent = 'Download compact run';
    b.onclick = () => {
      if (state) downloadJson('commonstead-day-compact.json', continuity!.export(state, true));
    };
    document.getElementById('compact-download')?.append(b);
  }
  bind('feedback', feedback);
  bind('fullscreen', () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  });
  if (fileSession) {
    document.getElementById('new-menu')?.remove();
    document.querySelector('#menu-title + a')?.remove();
    return;
  }
  bind('new-menu', () => {
    continuity!.beginEntry();
    const holder = document.getElementById('menu-confirm');
    if (!holder) return;
    holder.innerHTML =
      '<p>Do you want to replace this saved game? It stays saved until the new game is ready.</p><button id="replace-menu">Replace saved game</button><button id="keep-menu">Keep this game</button><p id="setup-status" role="status"></p>';
    bind('keep-menu', () => {
      holder.innerHTML = '';
    });
    bind('replace-menu', () => {
      const generation = continuity!.beginEntry();
      void (async () => {
        try {
          const prepared = await continuity!.fresh(418, undefined, undefined, generation);
          if (!continuity!.currentEntry(generation)) return;
          closeModal();
          start(prepared);
          await continuity!.recording(false, generation);
          if (continuity!.currentEntry(generation)) save();
        } catch (error) {
          if (!continuity!.currentEntry(generation)) return;
          console.error(error);
          const status = document.getElementById('setup-status');
          if (status)
            status.textContent =
              'The new game could not start. Your saved game is unchanged. Try again or choose Feedback to report the problem.';
        }
      })();
    });
  });
}
function feedback() {
  if (!lab) {
    fileError(
      new Error(
        `Recording and feedback unavailable: ${recordingStatus}. File play and downloads remain local.`,
      ),
    );
    return;
  }
  sheet(
    `<h2>Feedback</h2><div class="feedback-body"><p>Tell us what happened.</p><div class="verdicts" aria-label="What is happening?">${Object.entries(
      FEEDBACK_LABELS,
    )
      .map(([label, text]) => `<button data-feedback-choice="${label}" aria-pressed="false">${text}</button>`)
      .join(
        '',
      )}</div><div class="verdicts"><button data-verdict="keep">I'd keep playing</button><button data-verdict="mixed">Not sure</button><button data-verdict="quit">I'd stop here</button></div><label for="note">What happened? What did you want to do?</label><textarea id="note" rows="3" maxlength="3900"></textarea><div id="feedback-persona"></div><label for="name">Your name (optional)</label><input type="text" id="name" maxlength="100" value="${esc(stored(NAME) ?? '')}"><details><summary>What is sent</summary><p>Your note is sent even when recording is off. Your name appears with this feedback and any play history you share. Play history is shared when Recording is on or you select the optional sharing checkbox.</p></details><div class="menu-footer"><a href="${PRIVACY_URL}">Lab privacy</a><details class="debug"><summary>Debug</summary><button id="copy">Keep a copy of this run</button></details></div><p id="send-status" class="status" role="status"></p></div><div class="feedback-actions"><button class="primary" id="send">Submit</button><button id="cancel-feedback">Back to the menu</button></div>`,
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
  const share = feedbackPersonaControl(lab!);
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
      const id = await lab?.sendFeedback(note, { name, run, sharePlay });
      status.textContent = `Your feedback was sent. Your note is stored. Reference: ${id}.`;
      status.scrollIntoView({ block: 'nearest' });
      send.textContent = state ? 'Back to the game' : 'Back to the title page';
      send.disabled = false;
      send.onclick = closeModal;
    } catch (error) {
      console.error(error);
      status.textContent =
        'Your feedback could not be sent. Your note is still here. Choose Submit to try again.';
      status.scrollIntoView({ block: 'nearest' });
      send.disabled = false;
    }
  };
}
function end() {
  assemblyObservation.reset();
  if (!state) return;
  fileTools?.remove();
  screen = 'end';
  canvas = null;
  lab?.screen('storm outcome');
  if (fileSession) {
    fileSession.pauseAtEnd();
    state = fileSession.state()!;
  } else {
    if (!state.chapterPaused) apply(state, { kind: 'pause-chapter' });
    void continuity!.checkpointAll();
  }
  save();
  const morning = morningWorkshopView(state);
  const morningOffer = morningWorkshopEligibility(state).eligible
    ? '<section><h2>The morning workshop</h2><p>Prepare a further guest cabin and keep at least 40 meal units in the shared store by 10:00. Choosing a new cabin site costs 40 boards. Earlier work and supplies remain. Residents choose what they can manage.</p><button id="start-morning-workshop">Start the morning task</button></section>'
    : '';
  const morningResult = morning
    ? `<section><h2>The morning workshop</h2><p>This task ended at ${esc(continuedClock(state))}.</p><p>${esc(morning.objective)}</p><p>${esc(morning.cabinLine)}</p><p>${esc(morning.mealLine)}</p><p>${esc(morning.resultLine)}</p></section>`
    : '';
  root.innerHTML = `<main class="title">${top('Commonstead')}<section class="end-card"><p class="eyebrow">${state.settlement ? `This run ended at ${storyClock(state, state.tick)}. The storm arrived at 20:00.` : state.continuedWorkshop ? `This workshop stopped at ${esc(continuedClock(state))}. The earlier storm arrived at 10:00.` : 'The storm arrived at 10:00.'}</p><h1>${morning ? 'The morning task ended.' : state.won ? 'The supplies stayed dry.' : 'The supplies got soaked.'}</h1><p>${state.won ? 'The storehouse was finished before the rain.' : 'The storehouse was unfinished when the rain came.'}</p>${morningResult}${morningOffer}${state.shortYield ? `<h2>Public chronicle</h2><ol>${state.shortYield.chronicle.map((entry) => `<li>${Math.floor(entry.tick / 60)}:${String(entry.tick % 60).padStart(2, '0')} · ${esc(publicPlaceText(entry.text))}</li>`).join('')}</ol>` : ''}${
    state.rules && !morning
      ? stormSummary(state)
          .map((line) => `<p>${esc(line)}</p>`)
          .join('')
      : ''
  }${stormPanel(state)}${buildingPanel(state)}<h2>Residents at the end of this run</h2><p class="small">${state.rules && !morning ? 'Each resident says what this day was like for them. These closing reflections are separate from timed conversations.' : 'Narrator facts and earlier words are separate from completed speech. Asking for a closing word takes ordinary game time.'}</p><div>${state.villagers
    .map((v) => {
      if (state?.story) {
        const ending = publicEnding(state, v.id);
        return `<section><h2>${esc(residentName(v))}</h2>${morning ? '' : closingSpeech(state, v, esc)}<h3>This run</h3>${ending.narration.map((line) => `<p>${esc(line)}</p>`).join('')}<h3>Spoken in this run</h3>${ending.spoken.length ? ending.spoken.map((u) => `<p>Completed speech at ${storyClock(state!, u.at)}</p><p class="speech">“${esc(u.text)}”</p>`).join('') : '<p>No new public speaking act completed.</p>'}<h3>Earlier words</h3>${ending.earlier.length ? ending.earlier.map((u) => `<p>At ${storyClock(state!, u.at)}: ${esc(u.text)}</p>`).join('') : '<p>No earlier authored words were recorded.</p>'}${!state.settlement && !state.continuedWorkshop ? `<button data-closing="${esc(v.id)}">Continue this workshop to ask ${esc(residentName(v))} for a closing word</button>` : ''}</section>`;
      }
      if (state?.rules)
        return `<section><h2>${esc(residentName(v))}</h2>${closingSpeech(state, v, esc)}</section>`;
      const scene = DISCOVERIES[Number(v.id.slice(1)) - 1];
      const shared = v.discovery && scene ? scene[v.discovery === 2 ? 1 : 0] : '';
      return `<section><h2>${esc(residentName(v))}</h2>${shared ? `<p><strong>Previously shared with you:</strong> ${esc(shared)}</p>` : ''}<p class="speech">${v.says ? `Last words: ${esc(v.says)}` : 'No last words recorded.'}</p></section>`;
    })
    .join(
      '',
    )}</div><details><summary>See the tally</summary><p>${state.villagers.length} people · ${state.buildings.filter((b) => b.complete && b.kind !== 'town').length} completed ${state.buildings.filter((b) => b.complete && b.kind !== 'town').length === 1 ? 'building' : 'buildings'}</p></details><div class="row"><button id="end-feedback">Feedback</button><a href="https://human.adamwhite.work/lab/people/">${PEOPLE_ACROSS_GAMES}</a><button id="end-download">Download this run</button><div class="menu-footer"><a href="${PRIVACY_URL}">Lab privacy</a></div>${canContinueWorkshop(state) ? '<button id="continue-workshop">Continue this workshop day with these people</button>' : ''}<button class="primary" id="end-title">To the title page</button></div></section></main>`;
  shellBindings();
  bind('end-feedback', feedback);
  bind('end-download', download);
  bind('end-title', () => void saveAndTitle('end-title'));
  const continueFromEnd = (
    command: Extract<Command, { kind: 'continue-workshop' | 'start-morning-workshop' }>,
  ) => {
    if (!state) return;
    try {
      if (fileSession) {
        fileSession.continueAtEnd(command);
        state = fileSession.state();
      } else apply(state, command);
      if (state && !state.ended) {
        save();
        start(state);
      }
    } catch (error) {
      const p = document.createElement('p');
      p.textContent = error instanceof Error ? error.message : 'This workshop could not continue.';
      document.querySelector('.end-card')?.append(p);
    }
  };
  bind('continue-workshop', () => continueFromEnd({ kind: 'continue-workshop' }));
  bind('start-morning-workshop', () => continueFromEnd({ kind: 'start-morning-workshop' }));
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-closing]'))
    button.onclick = () => {
      if (!state) return;
      let reason = '';
      try {
        continueAndAskClosing(
          () => state!,
          button.dataset.closing!,
          (c) => {
            if (fileSession) {
              if (c.kind === 'continue-workshop') fileSession.continueAtEnd(c);
              else fileSession.apply(c);
              state = fileSession.state();
            } else apply(state!, c);
          },
        );
      } catch (error) {
        reason = error instanceof Error ? error.message : 'The closing invitation could not start.';
      }
      if (state && !state.ended) {
        save();
        start(state);
        if (reason) hostNote = { message: state.message, text: reason };
      } else if (reason) {
        const p = document.createElement('p');
        p.textContent = reason;
        document.querySelector('.end-card')?.append(p);
      }
    };
  if (fileTools) document.querySelector('.end-card')?.append(fileTools);
  if (fileSession) document.querySelector('.end-card a[href$="/lab/people/"]')?.remove();
}
const attemptedDeaths = new Set<string>();
if (!fileSession) watchShelfPreference(() => continuity!.invalidate());
if (!fileSession)
  watchPersonaCheckpoint(async () => {
    const current = state;
    if (!current || current.villagers.some((v) => v.person.activity)) return;
    const wasPaused = current.chapterPaused;
    if (!wasPaused) apply(current, { kind: 'pause-chapter' });
    await continuity!.checkpointAll();
    if (!wasPaused && state === current && !current.ended) apply(current, { kind: 'resume-chapter' });
    save();
  });
lab?.trackRun(() => (state ? (fileSession ? fileSession.snapshot() : exportRun(state)) : null), {
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
window.addEventListener('pagehide', () => {
  if (fileSession) {
    fileSession.invalidate();
    cancelFileCallbacks();
    paused = true;
  } else continuity!.invalidate();
  // The active SDK owns asynchronous final capture; do not dispose it here.
});
if (fileSession)
  window.addEventListener('popstate', () => {
    fileSession.invalidate();
    cancelFileCallbacks();
    paused = true;
  });
document.addEventListener('visibilitychange', () => {
  assemblyObservation.reset();
  if (fileSession && document.hidden) {
    fileSession.invalidate();
    cancelFileCallbacks();
    paused = true;
  }
  if (state?.shortYield) carry = 0;
  save();
  last = performance.now();
});
function frame(now: number) {
  if (fileSession) {
    fileFrame(now);
    return;
  }
  const elapsed = Math.min(1, (now - last) / 1000);
  let advanced = false;
  last = now;
  if (state && screen === 'play' && !paused && !state.chapterPaused && !document.hidden) {
    if (state.shortYield || state.remainder?.running) {
      advanced = stepYieldBatch(state, true) > 0;
      workObservation.observeState(state);
      if (advanced) save();
    }
    carry += state.shortYield || state.remainder?.running ? 0 : elapsed * speed;
    while (
      !state.shortYield &&
      !state.remainder?.running &&
      carry >= 1 &&
      !state.ended &&
      !state.chapterPaused
    ) {
      step(state);
      workObservation.observeState(state);
      advanced = true;
      carry--;
      if (state.tick % 10 === 0 || state.chapterPaused) save();
    }
    if (advanced) {
      update();
      for (const head of continuity!.heads) {
        if (
          !attemptedDeaths.has(head.revision) &&
          !head.terminal &&
          state.villagers.some((v) => v.person.id === head.castId && !v.person.body.alive)
        ) {
          attemptedDeaths.add(head.revision);
          void continuity!.checkpoint(head.castId).catch((error) => {
            continuity!.status = String(error);
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
if (fileMode) title();
else {
  root.textContent = 'Opening saved game storage…';
  void nativeStore!
    .read()
    .then((text) => {
      // Migrate the exact old wrapper only after successful durable-store access.
      nativeText = text ?? localStorage.getItem(SAVE);
      nativeStorageReady = true;
      title();
    })
    .catch(() => {
      nativeSaveStatus(
        'Saved game storage could not open. Keep this page and download any run before leaving.',
      );
      title();
    });
}
const noticeFooter = document.createElement('footer');
noticeFooter.className = 'lab-footer';
const notice = telemetryNotice(undefined, fileMode ? { preservation: 'preserve' } : {});
if (notice) noticeFooter.append(notice);
document.body.append(noticeFooter);
if (fileSession) mountFileTools();
else requestAnimationFrame(frame);

// This adapter feeds the complete existing UI from staged production simulation state.
function cancelFileCallbacks() {
  fileCallbackEpoch++;
  if (fileRAF !== null) cancelAnimationFrame(fileRAF);
  fileRAF = null;
  if (holdTimer !== null) clearTimeout(holdTimer);
  holdTimer = null;
  pointer = null;
  carry = 0;
}
function fileError(error: unknown) {
  cancelFileCallbacks();
  fileSession?.invalidate();
  paused = true;
  if (state && !modal) menu();
  const status = document.getElementById('file-status');
  if (status) status.textContent = error instanceof Error ? error.message : String(error);
}
function fileTitle() {
  assemblyObservation.reset();
  fileSession!.invalidate();
  cancelFileCallbacks();
  fileTools?.remove();
  modal?.remove();
  modalFocus.close();
  modal = null;
  screen = 'title';
  state = null;
  canvas = null;
  selected = [];
  paused = true;
  root.innerHTML =
    '<main class="title"><section class="title-body"><h1>Commonstead · file session</h1><p>Choose a Commonstead run below. It stays in memory. Your saved game is unchanged. Download the current run before leaving or reloading.</p><a href="/">Back to Commonstead</a></section></main>';
  if (fileTools) root.querySelector('.title-body')?.append(fileTools);
}
function fileBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function mountFileTools() {
  const tools = document.createElement('section');
  fileTools = tools;
  tools.className = 'sheet';
  tools.setAttribute('aria-label', 'File session');
  tools.innerHTML = `<label>Choose a run <input id="file-load" type="file" accept="application/json,.json,.gz"></label><button id="file-cancel">Cancel loading</button><button id="file-original">Download original file</button><button id="file-metadata">Download original file details</button><button id="file-current">Download current run</button><p id="file-status" role="status">${lab ? 'Recording follows your Recording setting.' : 'Recording is unavailable. You can still play and download this file.'}</p><p>Files that are too large to open or save will be refused.</p>`;
  root.querySelector('.title-body')?.append(tools);
  const input = document.getElementById('file-load') as HTMLInputElement;
  input.addEventListener('cancel', () => {
    fileSession!.invalidate();
    cancelFileCallbacks();
    paused = true;
  });
  input.addEventListener('change', async () => {
    cancelFileCallbacks();
    paused = true;
    const status = document.getElementById('file-status');
    if (status) status.textContent = 'Checking complete HF history…';
    const pending = fileSession!.select(input.files?.[0]);
    const epoch = fileSession!.epoch;
    try {
      if (!(await pending) || epoch !== fileSession!.epoch) return;
      removeModal();
      start(fileSession!.state()!);
      const status = document.getElementById('file-status');
      if (status)
        status.textContent = `File opened and paused. Select Resume to play. ${lab ? 'Recording follows your Recording setting.' : 'Recording is unavailable.'}`;
      save();
    } catch (error) {
      if (epoch === fileSession!.epoch) fileError(error);
    }
  });
  bind('file-cancel', () => {
    fileSession!.invalidate();
    cancelFileCallbacks();
    paused = true;
  });
  bind('file-current', download);
  bind('file-original', () => {
    const original = fileSession!.original();
    if (original) fileBlob(original.name, new Blob([original.bytes], { type: original.type }));
  });
  bind('file-metadata', () => {
    const original = fileSession!.original();
    if (original) {
      const { bytes: _bytes, ...metadata } = original;
      downloadJson('commonstead-original-metadata.json', metadata);
    }
  });
}
function scheduleFileFrame() {
  if (!fileSession?.running || fileRAF !== null || paused) return;
  const epoch = fileSession.epoch,
    callbackEpoch = fileCallbackEpoch;
  const handle = requestAnimationFrame((now) => {
    if (
      epoch !== fileSession.epoch ||
      callbackEpoch !== fileCallbackEpoch ||
      !fileSession.running ||
      paused ||
      fileRAF !== handle
    )
      return;
    fileRAF = null;
    frame(now);
  });
  fileRAF = handle;
}
function fileFrame(now: number) {
  if (!fileSession || !state || screen !== 'play' || paused || document.hidden || !fileSession.running)
    return;
  carry += Math.min(1, (now - last) / 1000) * speed;
  last = now;
  try {
    const ticks = Math.floor(carry);
    if (state.shortYield || ticks > 0) {
      fileSession.advance(ticks);
      state = fileSession.state()!;
      carry -= ticks;
      workObservation.observeState(state);
      save();
      update();
      if (state.ended) {
        end();
        return;
      }
    }
  } catch (error) {
    fileError(error);
    return;
  }
  if (canvas)
    draw(
      canvas,
      state,
      selected,
      pointer ? { ...pointer, held: Math.min(1, (now - pointer.at) / 500) } : null,
      placing,
      viewedMap,
      placementPoint,
    );
  scheduleFileFrame();
}

if (fileSession)
  document.addEventListener(
    'click',
    (event) => {
      if ((event.target as Element)?.closest('a[href]')) {
        fileSession.invalidate();
        cancelFileCallbacks();
        paused = true;
      }
    },
    true,
  );
