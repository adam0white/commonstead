// One actual-App synthetic sequence. Isolated storage, local network only, no owner browser state.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
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
  try {
    await page.goto(url);
    await page.locator('#continue').click();
    await page.locator('#map').waitFor();
    await page.locator('#clear').click();
    await page.getByRole('button', { name: 'Nora', exact: true }).click();
    const phoneMap = await box();
    await page.locator('[data-resource="wood"]').click();
    await advance(1000); // actual public movement, not a staged position
    await page.getByRole('button', { name: 'Sam', exact: true }).click();
    // Selection is additive: keep Nora and Sam, give them a recorded roof break.
    await page.locator('#roof-break-return').click();
    assert(await page.locator('#roof-break-return').isDisabled());
    assert.match((await page.locator('#everyone-now').textContent()) ?? '', /Roof break|roof/);
    let run = await saved();
    assert.equal(run.roofBreak?.attempts.length, 2);
    assert.equal(run.roofBreak?.attempts[0]?.priorOrder?.target, 'wood');
    assert.equal(run.roofBreak?.attempts[1]?.priorOrder, null);
    await advance(10000);
    run = await saved();
    assert(
      run.roofBreak?.attempts.every((a) => a.stage === 'rest'),
      JSON.stringify({
        tick: run.tick,
        attempts: run.roofBreak?.attempts,
        people: run.villagers
          .slice(0, 2)
          .map((v) => ({ x: v.x, y: v.y, task: v.task, order: v.order, recoveryUntil: v.recoveryUntil })),
      }),
    );
    assert.match((await page.locator('#everyone-now').textContent()) ?? '', /planned game seconds remain/);
    assert.deepEqual(await box(), phoneMap, 'Map stays fixed while roof/rest progress changes');
    await page.setViewportSize({ width: 1280, height: 800 });
    const wideMap = await box();
    await page.locator('#roof-break-why').scrollIntoViewIfNeeded();
    assert.deepEqual(await box(), wideMap, 'One side scroll keeps the wide map fixed');
    // Mid-rest native download must load through the real production file-session boundary.
    await page.locator('#menu').click();
    await page.locator('.debug summary').click();
    const download = page.waitForEvent('download');
    await page.locator('#download').click();
    const path = await (await download).path();
    assert(path);
    const text = await readFile(path, 'utf8');
    const loaded = await page.evaluate(async (text) => {
      const modulePath = '/src/file-session.ts';
      const { createFileSession } = await import(modulePath);
      const session = createFileSession();
      if (!(await session.select(new File([text], 'roof.json', { type: 'application/json' }))))
        throw new Error('Roof file refused');
      const full = session.state();
      session.resume();
      session.advance(70);
      return { full, continued: session.state(), snapshot: session.snapshot() };
    }, text);
    assert(loaded.full);
    const compact = importRun(exportRun(loaded.full, true));
    assert.deepEqual(compact, loaded.full);
    for (let n = 0; n < 70; n++) step(compact);
    assert.deepEqual(compact, loaded.continued);
    const { castSources: archivedSources, ...nativeSnapshot } = loaded.snapshot;
    assert.deepEqual(archivedSources, []);
    assert.deepEqual(importRun(nativeSnapshot), compact);
    await page.locator('#resume').click();
    await advance(40000);
    run = await saved();
    assert.equal(run.roofBreak?.attempts[0]?.stage, 'reoffered');
    assert.equal(run.villagers[0]?.order?.target, 'wood');
    assert.equal(run.roofBreak?.attempts[1]?.stage, 'unavailable');
    assert.match(run.roofBreak?.attempts[1]?.result ?? '', /No earlier work/);
    await page.locator('#clear').click();
    await page.getByRole('button', { name: 'Nora', exact: true }).click();
    await page.locator('#rest').click();
    await page.locator('#roof-break-return').click(); // interrupts a real current rest
    await page.locator('[data-resource="stone"]').click(); // explicit interruption during roof travel
    await advance(60000);
    run = await saved();
    assert.equal(run.roofBreak?.attempts.at(-1)?.priorTask, 'resting');
    assert.equal(run.roofBreak?.attempts.at(-1)?.stage, 'cancelled');
    assert.equal(run.villagers[0]?.order?.target, 'stone');
    assert.match(
      (await page.locator('#everyone-now').textContent()) ?? '',
      /Cancelled by a later interruption/,
    );
    assert.deepEqual(await box(), wideMap);
    const metrics = await page.evaluate(() => ({
      pageScroll: document.documentElement.scrollHeight > innerHeight,
      sideScroll: getComputedStyle(document.querySelector('.side')!).overflowY,
      nestedScroll: [...document.querySelectorAll('.side *')]
        .filter(
          (e) =>
            ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight,
        )
        .map((e) => e.className),
    }));
    assert.equal(metrics.pageScroll, false);
    assert.equal(metrics.nestedScroll.length, 0);
    assert.deepEqual(errors, []);
    return {
      longDay: await longControl(browser, url),
      phoneMap,
      wideMap,
      tick: run.tick,
      stages: run.roofBreak?.attempts.map((a) => a.stage),
      metrics,
      pageErrors: errors,
      externalRequests: 'blocked',
      screenshots: 0,
    };
  } finally {
    await context.close();
  }
}

async function longControl(browser: Browser, url: string) {
  const context = await browser.newContext({ viewport: { width: 360, height: 690 }, acceptDownloads: true });
  await context.route('**/*', (r) => (r.request().url().startsWith(url) ? r.continue() : r.abort()));
  await context.addInitScript(
    (run) => {
      localStorage.setItem('hf-lab-recording-off', '1');
      localStorage.setItem(
        'commonstead-cast-local-v3',
        JSON.stringify({ run, runId: 'synthetic-long-roof', fileOrigin: false, heads: [], sources: [] }),
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
    },
    exportRun(createGame(418, undefined, { edition: 'settlement-day/1' })),
  );
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const advance = (ms: number) =>
    page.evaluate((ms) => (window as unknown as { advance: (ms: number) => void }).advance(ms), ms);
  const saved = async () =>
    importRun(
      await page.evaluate(() => JSON.parse(localStorage.getItem('commonstead-cast-local-v3') ?? '{}').run),
    );
  const box = async () => {
    const b = await page.locator('#map').boundingBox();
    assert(b);
    return b;
  };
  try {
    await page.goto(url);
    await page.locator('#continue').click();
    await page.locator('#map').waitFor();
    await page.locator('#clear').click();
    await page.getByRole('button', { name: 'Nora', exact: true }).click();
    const phoneMap = await box();
    await page.locator('[data-resource="wood"]').click();
    await advance(30000);
    let run = await saved();
    const carried = run.settlement!.actors.v1!.carried;
    assert(
      carried && carried.amount > 0,
      JSON.stringify({ tick: run.tick, actor: run.settlement!.actors.v1 }),
    );
    const stock = run.resources.wood;
    await page.locator('#roof-break-return').click();
    assert(await page.locator('#roof-break-return').isDisabled());
    run = await saved();
    assert.deepEqual(run.longRoofBreak!.attempts[0]!.priorActor.carried, carried);
    for (let n = 0; n < 80 && run.longRoofBreak!.attempts[0]!.stage !== 'rest'; n++) {
      await advance(1000);
      run = await saved();
    }
    assert.equal(run.longRoofBreak!.attempts[0]!.stage, 'rest');
    assert.equal(run.resources.wood, stock + carried.amount);
    assert.equal(run.settlement!.actors.v1!.carried, null);
    assert.deepEqual(await box(), phoneMap);
    const downloadRun = async (compact: boolean) => {
      const pending = page.waitForEvent('download');
      await page.locator(compact ? '#compact-download button' : '#download').click();
      const path = await (await pending).path();
      assert(path);
      return await readFile(path, 'utf8');
    };
    await page.locator('#menu').click();
    await page.locator('.debug summary').click();
    const full = await downloadRun(false),
      compact = await downloadRun(true);
    const fileProof = await page.evaluate(
      async ({ full, compact }) => {
        const modulePath = '/src/file-session.ts';
        const { createFileSession } = await import(modulePath);
        const result = [];
        for (const text of [full, compact]) {
          const session = createFileSession();
          if (!(await session.select(new File([text], 'long-roof.json'))))
            throw new Error('Long file refused');
          const paused = session.state();
          session.resume();
          session.advance(60);
          result.push({ paused, continued: session.state(), snapshot: session.snapshot() });
        }
        return result;
      },
      { full, compact },
    );
    if (process.env.COMMONSTEAD_LONG_ROOF_EVIDENCE) {
      const prefix = process.env.COMMONSTEAD_LONG_ROOF_EVIDENCE;
      await writeFile(`${prefix}/app-native-full.json`, full);
      await writeFile(`${prefix}/app-native-compact.json`, compact);
      await writeFile(`${prefix}/app-file-load-continue.json`, JSON.stringify(fileProof));
    }
    assert.deepEqual(fileProof[0], fileProof[1]);
    assert.equal(fileProof[0]!.continued.longRoofBreak.attempts[0].stage, 'reoffered');
    const { castSources: fullSources, ...nativeFull } = JSON.parse(full);
    assert.deepEqual(fullSources, []);
    assert.deepEqual(importRun(nativeFull), fileProof[0]!.paused);
    const pausedTick = (await saved()).tick;
    await advance(5000);
    assert.equal((await saved()).tick, pausedTick, 'Menu pauses the actual world');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator('#resume').click();
    const wideMap = await box();
    await advance(60000);
    run = await saved();
    assert.equal(run.longRoofBreak!.attempts[0]!.stage, 'reoffered');
    await page.locator('#roof-break-return').scrollIntoViewIfNeeded();
    assert.deepEqual(await box(), wideMap);
    const metrics = await page.evaluate(() => ({
      pageScroll: document.documentElement.scrollHeight > innerHeight,
      nestedScroll: [...document.querySelectorAll('.side *')].filter(
        (e) => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight,
      ).length,
    }));
    assert.equal(metrics.pageScroll, false);
    assert.equal(metrics.nestedScroll, 0);
    assert.deepEqual(errors, []);
    return {
      phoneMap,
      wideMap,
      metrics,
      capturedLoad: carried.amount,
      deliveredStock: stock + carried.amount,
      rest: run.longRoofBreak!.attempts[0],
      fileReplay: 'full and compact identical',
      pageErrors: errors,
      screenshots: 0,
      externalRequests: 'blocked',
    };
  } finally {
    await context.close();
  }
}
