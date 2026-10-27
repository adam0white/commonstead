// One actual-App synthetic sequence. Isolated storage, local network only, no owner browser state.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Browser } from '@playwright/test';
import { PRESSURE } from '../src/pressure.ts';
import { createGame, exportRun, importRun, step } from '../src/sim.ts';

export async function control(browser: Browser, url: string) {
  const initial = createGame(418, undefined, undefined, PRESSURE);
  const context = await browser.newContext({ viewport: { width: 360, height: 690 }, acceptDownloads: true });
  await context.route('**/*', (r) => (r.request().url().startsWith(url) ? r.continue() : r.abort()));
  await context.addInitScript((run) => {
    localStorage.setItem('hf-lab-recording-off', '1');
    localStorage.setItem(
      'commonstead-cast-local-v3',
      JSON.stringify({ run, runId: 'synthetic-orders', fileOrigin: false, heads: [], sources: [] }),
    );
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
  }, exportRun(initial));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const advance = async (ms: number) =>
    page.evaluate((ms) => (window as unknown as { advance: (ms: number) => void }).advance(ms), ms);
  const box = async () => {
    const b = await page.locator('#map').boundingBox();
    assert(b);
    return b;
  };
  const saved = async () => {
    const raw = await page.evaluate(
      () => JSON.parse(localStorage.getItem('commonstead-cast-local-v3') ?? '{}').run,
    );
    return importRun(raw);
  };
  const choosePoint = async (x: number, y: number) => {
    const r = await box(),
      scale = Math.min(r.width / 1000, r.height / 700);
    await page.locator('#map').click({
      position: {
        x: (r.width - 1000 * scale) / 2 + x * scale,
        y: (r.height - 700 * scale) / 2 + y * scale,
      },
    });
  };
  try {
    await page.goto(url);
    await page.locator('#continue').click();
    await page.locator('#map').waitFor();
    await page.locator('#all').click();
    const phoneMap = await box();
    await page.locator('[data-resource="wood"]').click();
    await page.getByRole('button', { name: 'Fast', exact: true }).click();
    await advance(18000);
    assert.match(await page.locator('#order-consequences').innerText(), /8 of 8/);
    await page.locator('#rest-all').click();
    await advance(9000);
    let run = await saved();
    assert(
      run.villagers.every((v) => v.order?.target === 'wood'),
      'Rest keeps all eight requests',
    );
    await page.locator('[data-resource="stone"]').click();
    for (let i = 0; i < 80 && (await page.locator('#store').isDisabled()); i++) await advance(1000);
    assert(await page.locator('#store').isEnabled());
    assert.deepEqual(await box(), phoneMap, 'Stock and warning changes keep phone map stable');
    await page.locator('#store').click();
    await choosePoint(245, 190);
    assert.match(await page.locator('#notice').innerText(), /too close to the prepared boards/);
    run = await saved();
    assert.equal(run.buildings.length, 1);
    await choosePoint(653, 503);
    run = await saved();
    assert.equal(run.buildings.length, 2);
    await advance(5000);
    assert.match(
      await page.locator('#order-consequences').innerText(),
      /Assembly and gathering stop immediately/,
    );
    await page.locator('#shelter-all').click();
    await advance(3000);
    await page.locator('#rest-all').click();
    assert.match(await page.locator('#notice').innerText(), /No earlier work request is retained/);
    await advance(9000);
    run = await saved();
    assert(run.villagers.every((v) => !v.order));
    await page.setViewportSize({ width: 1280, height: 800 });
    const wideMap = await box();
    await page.locator('#rest-all').scrollIntoViewIfNeeded();
    assert.deepEqual(await box(), wideMap);
    await page.locator('#menu').click();
    await page.locator('.debug summary').click();
    const download = page.waitForEvent('download');
    await page.locator('#download').click();
    const path = await (await download).path();
    assert(path);
    const text = await readFile(path, 'utf8');
    const full = await page.evaluate(async (text) => {
      const modulePath = '/src/file-session.ts';
      const { createFileSession } = await import(modulePath);
      const session = createFileSession();
      if (!(await session.select(new File([text], 'synthetic-orders.json', { type: 'application/json' }))))
        throw new Error('Synthetic download refused');
      return session.state();
    }, text);
    assert(full);
    const compact = importRun(exportRun(full, true));
    assert.equal(JSON.stringify(full), JSON.stringify(compact));
    for (let n = 0; n < 17; n++) {
      step(full);
      step(compact);
    }
    assert.equal(JSON.stringify(full), JSON.stringify(compact));
    // Same actual App, fresh synthetic long day; public title choice replaces only this synthetic save.
    await page.locator('#menu-title').click();
    const start = page.getByRole('button', { name: 'Start a settlement day', exact: true });
    await page.locator('summary').filter({ hasText: 'longer settlement' }).click();
    await start.click();
    const replace = page.locator('#replace-day');
    if (await replace.count()) await replace.click();
    await page.locator('#map').waitFor();
    await page.locator('#clear').click();
    for (const name of ['Nora', 'Sam', 'Dai', 'Nerys'])
      await page.getByRole('button', { name, exact: true }).click();
    await page.locator('[data-resource="wood"]').click();
    await page.locator('#clear').click();
    for (const name of ['Dilek', 'Burak', 'Sevim', 'Oskar'])
      await page.getByRole('button', { name, exact: true }).click();
    await page.locator('[data-resource="stone"]').click();
    await page.getByRole('button', { name: 'Fast', exact: true }).click();
    await advance(4500);
    assert.match(await page.locator('#work-route-cause').innerText(), /without an agreement for their pair/);
    assert.match(await page.locator('#work-material-flow').innerText(), /Completion time is unknown/);
    assert.match(await page.locator('#order-consequences').innerText(), /not queued/);
    await page.locator('#clear').click();
    await page.getByRole('button', { name: 'Nora', exact: true }).click();
    const occupiedBefore = (await saved()).settlement?.actors.v1;
    assert.equal(occupiedBefore?.running?.purpose, 'job');
    await page.locator('[data-resource="stone"]').click();
    const occupiedAfter = (await saved()).settlement?.actors.v1;
    assert.deepEqual(occupiedAfter, occupiedBefore, 'Rejected occupied-worker request is not queued');
    await page.locator('#clear').click();
    await page.getByRole('button', { name: 'Sam', exact: true }).click();
    await page.getByText('Travel, conversations and the day', { exact: true }).click();
    await page.locator('[data-day="yield"]').click();
    await advance(10000);
    run = await saved();
    assert.deepEqual(run.settlement?.routeAgreements, ['v1/v2']);
    await advance(1500);
    assert.match(await page.locator('#work-route-cause').innerText(), /Dai and Nora/);
    assert.match(await page.locator('#work-route-cause').innerText(), /Nora and Sam/);
    assert.equal(run.settlement?.actors.v2?.job, null);
    await page.setViewportSize({ width: 360, height: 690 });
    const endMap = await box();
    await page.locator('#work-material-flow').scrollIntoViewIfNeeded();
    assert.deepEqual(await box(), endMap);
    assert.deepEqual(errors, []);
    return {
      phoneMap,
      wideMap,
      shortTick: full.tick - 17,
      longTick: (await saved()).tick,
      agreements: run.settlement?.routeAgreements,
      pageErrors: errors,
      externalRequests: 'blocked',
      screenshots: 0,
    };
  } finally {
    await context.close();
  }
}
