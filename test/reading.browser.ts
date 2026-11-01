// One actual-App synthetic journey, phone then wide. No owner profile, file admission or network writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Browser } from '@playwright/test';
import { EDITION } from '../src/settlement.ts';
import { createGame, exportRun, importRun, step } from '../src/sim.ts';

export async function control(browser: Browser, url: string) {
  const s = createGame(418, undefined, { edition: EDITION });
  const context = await browser.newContext({ viewport: { width: 360, height: 690 }, acceptDownloads: true });
  await context.route('**/*', (r) => (r.request().url().startsWith(url) ? r.continue() : r.abort()));
  await context.addInitScript((run) => {
    localStorage.setItem('hf-lab-recording-off', '1');
    localStorage.setItem(
      'commonstead-cast-local-v3',
      JSON.stringify({ run, runId: 'synthetic-reading', fileOrigin: false, heads: [], sources: [] }),
    );
    // Hold only the render clock; production frame() still advances all native simulation steps.
    const callbacks = new Map<number, FrameRequestCallback>();
    let id = 0,
      now = 0;
    window.requestAnimationFrame = (cb) => {
      callbacks.set(++id, cb);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      callbacks.delete(id);
    };
    (window as unknown as { advance: (ms: number) => void }).advance = (ms) => {
      if (!now) now = performance.now();
      for (let n = 0; n < ms; n += 250) {
        now += 250;
        const pending = [...callbacks.values()];
        callbacks.clear();
        for (const cb of pending) cb(now);
      }
    };
  }, exportRun(s));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const advance = async (ms: number) =>
    page.evaluate((ms) => (window as unknown as { advance: (ms: number) => void }).advance(ms), ms);
  const rect = async (selector: string) => {
    const b = await page.locator(selector).boundingBox();
    assert(b, selector);
    return b;
  };
  await page.goto(url);
  await page.locator('#continue').click();
  await page.locator('#map').waitFor();
  await page.getByRole('button', { name: 'Nora', exact: true }).click();
  const invite = page.locator('#listen');
  assert(await invite.isVisible(), 'Invitation must be outside the closed About fold');
  assert.equal(await invite.evaluate((e) => e.closest('details')), null);
  assert.match(await page.locator('#conversation-readiness').innerText(), /60 game seconds/);
  const map = await rect('#map');
  const speed = await rect('.speed'),
    caption = await rect('.map-caption');
  assert(speed.y + speed.height <= map.y + 1, 'Speed must not cover the map');
  assert(caption.y >= map.y + map.height - 1, 'Caption must not cover the map');
  const phoneNotice = await rect('.lk-telemetry-notice');
  const phoneGame = await rect('.game');
  assert(phoneGame.y + phoneGame.height <= phoneNotice.y + 1);
  await page.locator('#all').click();
  assert((await rect('#task')).height < 150, 'Group summary must not bury the work controls');
  await page.locator('#clear').click();
  await page.getByRole('button', { name: 'Nora', exact: true }).click();
  assert.deepEqual(await rect('#map'), map);
  const phoneRead = await page
    .locator('.side')
    .evaluate((e) => ({ client: e.clientHeight, full: e.scrollHeight }));
  assert(phoneRead.full > phoneRead.client);
  for (const name of ['Sevim', 'Oskar']) {
    const box = await rect(`[aria-label="${name}"]`);
    assert(box.x >= 0 && box.x + box.width <= 361, 'Names must wrap within phone width');
  }
  // Readiness changes only when the actual game clock advances. Fast uses the same gate.
  await page.getByRole('button', { name: 'Fast', exact: true }).click();
  await advance(5000);
  assert.match(await page.locator('#conversation-readiness').innerText(), /40 game seconds/);
  await page.getByRole('button', { name: 'Slow', exact: true }).click();
  await advance(20000);
  assert.match(await page.locator('#conversation-readiness').innerText(), /30 game seconds/);
  await page.getByRole('button', { name: 'Fast', exact: true }).click();
  await advance(7500);
  assert.match(await page.locator('#conversation-readiness').innerText(), /requested now/);
  await invite.focus();
  await page.keyboard.press('Enter');
  await advance(12000);
  const replies = page.locator('#personal-replies button[data-reply]');
  assert.equal(await replies.count(), 2);
  const labels = await replies.allTextContents();
  assert.notEqual(labels[0], labels[1]);
  await replies.first().scrollIntoViewIfNeeded();
  assert.deepEqual(await rect('#map'), map, 'Reading and choosing must keep the map stable');
  await page.setViewportSize({ width: 1280, height: 800 });
  const wideMap = await rect('#map');
  assert.equal(await page.locator('.sheet').evaluate((e) => getComputedStyle(e).overflowY), 'visible');
  await replies.first().focus();
  await page.keyboard.press('Tab');
  assert(await replies.last().evaluate((e) => document.activeElement === e));
  await advance(1000);
  assert(
    await replies.last().evaluate((e) => document.activeElement === e),
    'Clock updates must retain reply focus',
  );
  await page.keyboard.press('Enter');
  await advance(12000);
  assert.equal(await replies.count(), 0, 'Completed branch no longer offers another first reply');
  assert.match(await page.locator('#personal-replies').innerText(), /I have written/);
  assert.deepEqual(await rect('#map'), wideMap);
  await page.locator('#move').scrollIntoViewIfNeeded();
  await page.locator('#move').click();
  assert.match(await page.locator('#notice').innerText(), /Cancel/);
  await page.locator('#cancel').click();
  // Exercise the actual pinned kit with a nonzero notice; it already reserves footer space.
  const notice = page.locator('.lk-telemetry-notice');
  assert.equal(await notice.count(), 1);
  const nb = await rect('.lk-telemetry-notice');
  assert(nb.height > 0);
  const game = await rect('.game');
  assert(game.y + game.height <= nb.y + 1);
  await page.locator('#menu').click();
  await page.locator('.debug summary').click();
  const downloaded = page.waitForEvent('download');
  await page.locator('#download').click();
  const d = await downloaded,
    path = await d.path();
  assert(path);
  const raw = JSON.parse(await readFile(path, 'utf8'));
  const loaded = importRun(raw),
    compact = importRun(exportRun(loaded, true));
  assert.deepEqual(compact, loaded);
  for (let n = 0; n < 9; n++) {
    step(loaded);
    step(compact);
  }
  assert.deepEqual(compact, loaded);
  assert.equal(await page.evaluate(() => localStorage.getItem('hf-lab-recording-off')), '1');
  await page.locator('#menu-title').click();
  await page.locator('#new').click();
  await page.locator('#replace-run').click();
  await page.locator('#map').waitFor();
  await page.getByRole('button', { name: 'Nora', exact: true }).click();
  assert(await page.locator('#listen').isVisible());
  assert(await page.locator('#collaborate').isVisible());
  assert.match(await page.locator('#storm-meals').innerText(), /10 more/);
  await page.setViewportSize({ width: 360, height: 690 });
  await page.locator('#all').click();
  const gatheringMap = await rect('#map');
  await page.locator('[data-resource="wood"]').click();
  await page.getByRole('button', { name: 'Fast', exact: true }).click();
  for (let n = 0; n < 60; n++) {
    await advance(1000);
    if ((await page.locator('#supply-readiness').innerText()).includes('Boards are enough')) break;
  }
  assert.match(await page.locator('#supply-readiness').innerText(), /Boards are enough/);
  assert.deepEqual(
    await rect('#map'),
    gatheringMap,
    'Real gathering must not shift the map when shortages become enough',
  );
  await page.locator('#supply-readiness').scrollIntoViewIfNeeded();
  assert.deepEqual(
    await rect('#map'),
    gatheringMap,
    'Reading current counted facts keeps the working map stable',
  );
  await page.locator('#move').click();
  assert.match(await page.locator('#notice').innerText(), /Cancel/);
  await page.locator('#cancel').click();
  // No interaction changes the recording switch. Real kit dismissal removes only its status node.
  await page.waitForTimeout(4100);
  await page.locator('#menu').click();
  await advance(250);
  assert.equal(await notice.count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('hf-lab-recording-off')), '1');
  assert.deepEqual(errors, []);
  const result = {
    phone: { map, scroll: phoneRead },
    wide: { map: wideMap },
    noticeHeight: nb.height,
    phoneNoticeHeight: phoneNotice.height,
    tick: raw.state.tick,
    errors,
  };
  await context.close();
  return result;
}
