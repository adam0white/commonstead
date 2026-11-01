// Prepared only. UNRUN. Parent must separately admit a bounded headless production-UI control.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Browser, Page } from '@playwright/test';
import { createGame, exportRun, type Villager } from '../src/sim';

type FrameProbe = {
  read: () => { pending: number; draws: number };
  remember: () => void;
  invokeStale: () => void;
  pump: () => void;
};
type DriverWindow = Window & { morningFrames: FrameProbe; nativeHits: string[] };

/** Inputs are complete, unedited exports from the existing winning-day causal control.
 * This drives actual file inputs, end buttons, start(), frame(), fileFrame() and canvas draw.
 * It never calls a session/simulation helper to stand in for the production UI lifecycle.
 */
export async function control(
  browser: Browser,
  url: string,
  fixtures: { stormEnding: Buffer; beforeMorning: Buffer; morningEnding: Buffer },
) {
  return lifecycleControl(browser, url, fixtures, 'positive-work');
}

/** Exhausted fixture only: this does not prove positive work or pass the original control. */
export async function controlExhaustedFixture(
  browser: Browser,
  url: string,
  fixtures: { stormEnding: Buffer; beforeMorning: Buffer; morningEnding: Buffer },
) {
  return lifecycleControl(browser, url, fixtures, 'exhausted-fixture');
}

async function lifecycleControl(
  browser: Browser,
  url: string,
  fixtures: { stormEnding: Buffer; beforeMorning: Buffer; morningEnding: Buffer },
  scope: 'positive-work' | 'exhausted-fixture',
) {
  const context = await browser.newContext({ acceptDownloads: true });
  await context.route('**/*', (route) =>
    route.request().url().startsWith(url) ? route.continue() : route.abort(),
  );
  await context.addInitScript(() => {
    localStorage.setItem('hf-lab-player', 'a'.repeat(32));
    localStorage.setItem('hf-lab-recording-off', '1');
    // Test-local assignment target: these fields do not exist yet. This init script
    // installs both before the later page.evaluate consumers run.
    const driver = window as unknown as DriverWindow;
    driver.nativeHits = [];
    const get = Storage.prototype.getItem,
      set = Storage.prototype.setItem,
      remove = Storage.prototype.removeItem;
    const check = (key: string) => {
      if (['commonstead-cast-local-v3', 'commonstead-preserved-before-fresh-local'].includes(key)) {
        driver.nativeHits.push(key);
        throw new Error('File continuation touched native game storage.');
      }
    };
    Storage.prototype.getItem = function (key) {
      check(key);
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      check(key);
      return set.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key) {
      check(key);
      return remove.call(this, key);
    };
    const callbacks = new Map<number, FrameRequestCallback>(),
      history: FrameRequestCallback[] = [];
    let next = 0,
      now = 0,
      draws = 0,
      stale: FrameRequestCallback[] = [];
    window.requestAnimationFrame = (callback) => {
      callbacks.set(++next, callback);
      history.push(callback);
      return next;
    };
    window.cancelAnimationFrame = (id) => {
      callbacks.delete(id);
    };
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, width, height) {
      if (this.canvas.id === 'map') draws++;
      return fill.call(this, x, y, width, height);
    };
    driver.morningFrames = {
      read: () => ({ pending: callbacks.size, draws }),
      remember: () => {
        stale = [...history];
      },
      invokeStale: () => {
        for (const callback of stale) callback(performance.now() + 40_000);
      },
      pump: () => {
        now = Math.max(now, performance.now()) + 1000;
        const pending = [...callbacks.values()];
        callbacks.clear();
        for (const callback of pending) callback(now);
      },
    };
  });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const readFrames = () => page.evaluate(() => (window as unknown as DriverWindow).morningFrames.read());
  const pump = () => page.evaluate(() => (window as unknown as DriverWindow).morningFrames.pump());
  async function load(bytes: Buffer, name: string) {
    await page.goto(`${url}/file/`);
    const noticeSeenAt = await page.locator('.lk-telemetry-notice').evaluate(() => performance.now());
    await page.locator('#file-load').setInputFiles({ name, mimeType: 'application/json', buffer: bytes });
    // Validation and notice cleanup share the existing sixty-second setup budget.
    const setupDeadline = Date.now() + 60_000;
    const setupRemaining = () => {
      const left = setupDeadline - Date.now();
      assert(left > 0, 'File and notice setup exceeded sixty seconds');
      return left;
    };
    // Wait for full file validation before exercising the ordinary UI action waits.
    await page
      .locator('#file-status')
      .filter({ hasText: /^File opened and paused\./ })
      .waitFor({
        state: 'visible',
        timeout: 60_000,
      });
    // Dismiss the informational notice while the validated file is still paused.
    // Its four-second minimum is real time; file validation usually consumes it.
    const noticeElapsed = await page.evaluate((seenAt) => performance.now() - seenAt, noticeSeenAt);
    const noticeRemaining = Math.max(0, 4000 - noticeElapsed);
    assert(noticeRemaining <= setupRemaining(), 'Notice must fit within file setup');
    await page.waitForTimeout(noticeRemaining);
    setupRemaining();
    const paused = await readFrames();
    assert.equal(paused.pending, 0, 'A paused file has no game frame');
    await page.locator('#file-status').click({ timeout: Math.min(30_000, setupRemaining()) });
    const noticeQueued = await readFrames();
    assert.equal(noticeQueued.pending, 1, 'Only the notice dismissal is queued');
    assert.equal(noticeQueued.draws, paused.draws);
    await pump();
    assert.deepEqual(await readFrames(), paused, 'The notice does not draw the game');
    setupRemaining();
  }
  async function download(id: string) {
    const pending = page.waitForEvent('download');
    await page.locator(id).click();
    const path = await (await pending).path();
    assert(path);
    return readFile(path);
  }
  async function continueAndObserve(button: string, original: Buffer, startTick: number) {
    await page.locator(button).waitFor();
    assert.equal(await page.locator('#resume').count(), 0, 'ending must not require manual Resume');
    await page.evaluate(() => (window as unknown as DriverWindow).morningFrames.remember());
    await page.locator(button).click();
    await page.locator('#map').waitFor();
    const started = await readFrames();
    assert.equal(started.pending, 1, 'UI installation must schedule exactly one frame');
    await page.evaluate(() => (window as unknown as DriverWindow).morningFrames.invokeStale());
    assert.deepEqual(await readFrames(), started, 'retired callbacks must not draw or replace the new frame');
    await pump();
    const once = await readFrames();
    assert.equal(once.pending, 1);
    assert(once.draws > started.draws, 'production canvas draw must run');
    await pump();
    assert.equal((await readFrames()).pending, 1, 'one loop must remain after consecutive callbacks');
    await page.locator('#menu').click();
    assert.equal((await readFrames()).pending, 0, 'pause must cancel the owned loop');
    const current = JSON.parse((await download('#file-current')).toString());
    assert.equal(
      current.tick,
      startTick + 2,
      'two current callbacks must produce exactly two ordinary ticks',
    );
    assert.deepEqual(await download('#file-original'), original);
    assert.deepEqual(await page.evaluate(() => (window as unknown as DriverWindow).nativeHits), []);
    return current;
  }
  try {
    const storm = JSON.parse(fixtures.stormEnding.toString()),
      before = JSON.parse(fixtures.beforeMorning.toString()),
      morning = JSON.parse(fixtures.morningEnding.toString());
    assert.equal(storm.state.ended, true);
    assert.equal(morning.state.ended, true);
    assert.equal(morning.state.won, true);
    assert.equal(before.tick + 1, morning.tick);
    // A loaded stopped ending has no frame. Its action itself must start the UI loop.
    await load(fixtures.morningEnding, 'morning-ended.json');
    await page.locator('#start-morning-workshop').waitFor();
    assert.equal((await readFrames()).pending, 0);
    const loaded = await continueAndObserve('#start-morning-workshop', fixtures.morningEnding, morning.tick);
    assert.equal(loaded.inputs.at(-1).command.kind, 'start-morning-workshop');

    // Natural end consumes the last callback. No loop remains when the ending is installed.
    await load(fixtures.beforeMorning, 'before-morning.json');
    await page.locator('#resume').click();
    assert.equal((await readFrames()).pending, 1);
    await pump();
    await page.locator('#start-morning-workshop').waitFor();
    assert.equal((await readFrames()).pending, 0);
    await continueAndObserve('#start-morning-workshop', fixtures.beforeMorning, morning.tick);

    // The same start path owns ordinary storm continuation and closing-invitation continuation.
    await load(fixtures.stormEnding, 'storm-ended.json');
    await continueAndObserve('#continue-workshop', fixtures.stormEnding, storm.tick);
    await load(fixtures.stormEnding, 'storm-closing.json');
    await continueAndObserve('[data-closing="v1"]', fixtures.stormEnding, storm.tick);

    // Read actual rendered current instructions, including meal cost and the help dialog.
    await load(fixtures.morningEnding, 'morning-help.json');
    await page.locator('#start-morning-workshop').click();
    await page.locator('#all').click();
    const details = await page.locator('.objective .details').innerText(),
      meals = await page.locator('#meal-why').innerText();
    assert.match(details, /40 meal units.*10:00/);
    assert.match(details, /40 boards/);
    assert.match(meals, /target at 10:00 stays 40/);
    assert.match(meals, /Eating now uses 16 meals|Eating uses 2 meals per person/);
    // The fixed paragraph must stay true after a paid request and observed work or recovery.
    // Status belongs to the existing live supply-readiness element, not the entry paragraph.
    await page.locator('#house').click();
    const map = await page.locator('#map').boundingBox();
    assert(map);
    const scale = Math.min(map.width / 1000, map.height / 700);
    await page.locator('#map').click({
      position: {
        x: (map.width - 1000 * scale) / 2 + 700 * scale,
        y: (map.height - 700 * scale) / 2 + 375 * scale,
      },
    });
    assert.equal(await page.locator('.objective .details').innerText(), details);
    assert.doesNotMatch(details, /No new guest-cabin site|% prepared|guest cabin is ready/);
    assert.equal(
      await page.locator('#supply-readiness').innerText(),
      'The morning guest cabin is 0% prepared.',
    );
    await page.locator('#menu').click();
    const admitted = JSON.parse((await download('#file-current')).toString());
    const targetId = admitted.state.morningWorkshop.targetCabinId;
    assert(targetId, 'the ordinary UI request must actually admit a new target');
    assert.equal(admitted.state.resources.wood, morning.state.resources.wood - 40);
    assert.equal(admitted.inputs.at(-1).command.kind, 'build');
    assert(!morning.state.buildings.some((site: { id: string }) => site.id === targetId));
    await page.locator('#resume').click();
    let status = await page.locator('#supply-readiness').innerText();
    for (let ticks = 0; ticks < 120 && status === 'The morning guest cabin is 0% prepared.'; ticks++) {
      await pump();
      status = await page.locator('#supply-readiness').innerText();
    }
    await page.locator('#menu').click();
    const worked = JSON.parse((await download('#file-current')).toString());
    const target = worked.state.buildings.find((site: { id: string }) => site.id === targetId);
    if (scope === 'positive-work') {
      assert(target?.progress > 0, 'observe actual progress within the bound; do not fabricate or force it');
    } else {
      assert(target, 'the paid target must remain present');
      assert.equal(target.progress, 0, 'the exhausted fixture must not be presented as positive work');
      assert.equal(target.complete, false);
      assert.equal(worked.tick, admitted.tick + 120, 'observe all 120 actual simulation ticks');
      assert.equal(worked.state.tick, worked.tick);
      const requestedIds = admitted.inputs.at(-1).command.ids;
      assert.deepEqual(
        requestedIds,
        admitted.state.villagers.map((villager: Villager) => villager.id),
      );
      assert(requestedIds.length > 0, 'the paid request must include actual residents');
      for (const id of requestedIds) {
        const entered = admitted.state.villagers.find((villager: Villager) => villager.id === id);
        const resident: Villager | undefined = worked.state.villagers.find(
          (villager: Villager) => villager.id === id,
        );
        assert(entered && resident, 'each requested resident must remain present');
        assert.equal(resident.order?.target, targetId, 'recovery must retain the cabin request');
        assert.equal(resident.task, 'resting');
        assert(resident.recoveryUntil > worked.tick, 'the resident must actually be recovering');
        assert(
          resident.person.trace
            .slice(entered.person.trace.length)
            .some(
              (decision) =>
                decision.suggestion?.verdict === 'refused' && decision.suggestion.reason === 'capacity',
            ),
          'observe a new capacity refusal after the paid request',
        );
      }
    }
    assert.equal(worked.state.morningWorkshop.targetCabinId, targetId);
    assert.equal(
      status,
      `The morning guest cabin is ${target.complete ? 'ready' : `${Math.floor(target.progress * 100)}% prepared`}.`,
    );
    assert.equal(await page.locator('.objective .details').innerText(), details);
    assert.deepEqual(await download('#file-original'), fixtures.morningEnding);
    await page.locator('#resume').click();
    await page.locator('#info').click();
    const help = await page.locator('.info-panel').innerText();
    assert.match(help, /40 meal units.*10:00/);
    assert.match(help, /40 boards/);
    assert.match(help, /2 meal units per person/);
    assert.match(help, /One rest may not be enough/);
    assert.match(help, /before 10:00.*not assessed/);
    for (const text of [details, meals, help])
      assert.doesNotMatch(
        text,
        /5 meals per person|storm keeps everyone indoors|everyone should be under a roof|supplies will stay dry/i,
      );

    // Unchanged short first-storm and canonical long help retain their original instructions.
    await checkEarlierHelp(
      page,
      url,
      Buffer.from(JSON.stringify(exportRun(createGame(418)))),
      /5 meals per person/,
    );
    await checkEarlierHelp(
      page,
      url,
      Buffer.from(JSON.stringify(exportRun(createGame(418, undefined, { edition: 'settlement-replies/2' })))),
      /before 20:00/,
    );
    assert.deepEqual(errors, []);
    return {
      productionFileEndFrameAndDraw: true,
      loadedAndNaturalEnd: true,
      ordinaryAndClosingContinuation: true,
      stageHelp: true,
      errors,
      screenshots: 0,
      coverageScope: scope === 'positive-work' ? 'positive-work' : 'exhausted-fixture lifecycle/refusal',
      positiveWorkProved: scope === 'positive-work',
      fullOriginalUiPass: scope === 'positive-work',
    };
  } finally {
    await context.close();
  }
}

async function checkEarlierHelp(page: Page, url: string, bytes: Buffer, expected: RegExp) {
  await page.goto(`${url}/file/`);
  await page.locator('#file-load').setInputFiles({
    name: 'current-help.json',
    mimeType: 'application/json',
    buffer: bytes,
  });
  await page.locator('#resume').click();
  await page.locator('#info').click();
  assert.match(await page.locator('.info-panel').innerText(), expected);
}
