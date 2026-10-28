import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import type { Browser } from '@playwright/test';
import { exportRun } from '../src/sim.ts';
import { advanceForecastDay, forecastDay, storehouse } from './goal-forecast-scenario.ts';

// Actual App/file entry, public replay-validated long-day states, isolated memory-only browser.
// No owner browser, storage/preference writes, external requests, screenshots or fabricated assent.
export async function control(browser: Browser, url: string, evidence: string) {
  const run = forecastDay();
  const packets: Record<string, string> = { shortage: JSON.stringify(exportRun(run.s)) };
  while (run.s.tick < 900) {
    advanceForecastDay(run);
    if (run.s.tick === 700) packets.underway = JSON.stringify(exportRun(run.s));
  }
  packets.storm = JSON.stringify(exportRun(run.s));
  while (!storehouse(run.s)?.complete && run.s.tick < 1400) advanceForecastDay(run);
  assert(storehouse(run.s)?.complete && !run.s.won);
  packets.late = JSON.stringify(exportRun(run.s));
  for (const [name, text] of Object.entries(packets)) await writeFile(`${evidence}/app-${name}.json`, text);
  const results = [];
  for (const [width, height] of [
    [360, 690],
    [1280, 800],
  ] as const) {
    const context = await browser.newContext({ viewport: { width, height } });
    const external: string[] = [];
    await context.route('**/*', (r) => {
      if (r.request().url().startsWith(url)) return r.continue();
      external.push(r.request().url());
      return r.abort();
    });
    await context.addInitScript(() => {
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
    });
    const page = await context.newPage(),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const readingText = async () => (await page.locator('#goal-reading-text').textContent()) ?? '';
    const advance = (ms: number) =>
      page.evaluate((ms) => (window as unknown as { advance: (ms: number) => void }).advance(ms), ms);
    const load = async (name: string) => {
      await page.locator('#file-load').setInputFiles({
        name: `${name}.json`,
        mimeType: 'application/json',
        buffer: Buffer.from(packets[name] ?? ''),
      });
      await page.locator('#resume').waitFor();
      await page.locator('#resume').click();
      await page.locator('#goal-reading-open').click();
      await page.locator('#goal-reading').waitFor({ state: 'visible' });
    };
    try {
      await page.goto(`${url}/file/`);
      assert.equal(await page.evaluate(() => localStorage.length), 0);
      await load('shortage');
      const map = await page.locator('#map').boundingBox();
      const shortage = await readingText();
      assert.match(shortage, /100 more boards and 120 more ballast bags/);
      assert.match(shortage, /collection, delivery, travel and assembly/);
      await page.locator('#menu').click();
      await load('underway');
      assert.match(await readingText(), /Completion time is unknown/);
      await page.getByRole('button', { name: 'Fast', exact: true }).click();
      await advance(16000); // 64 actual simulation ticks, sampled by the actual App
      const progress = await readingText();
      assert.match(progress, /At the pace observed over the last/);
      assert.match(progress, /if people keep choosing assembly/);
      assert.deepEqual(await page.locator('#map').boundingBox(), map);
      await page.locator('#menu').click();
      await advance(10000);
      await page.locator('#resume').click();
      await advance(300);
      assert.doesNotMatch(await readingText(), /At the pace observed/);
      await page.locator('#menu').click();
      await load('storm');
      const storm = await readingText();
      assert.match(storm, /unfinished at 20:00/);
      assert.doesNotMatch(storm, /At the pace observed/);
      await page.locator('#menu').click();
      await load('late');
      const late = await readingText();
      assert.match(late, /finished now, after the storm check/);
      assert.match(late, /supplies got soaked/);
      assert.doesNotMatch(late, /At the pace observed/);
      await page.locator('#goal-reading-close').click();
      assert(await page.locator('#goal-reading').isHidden());
      await page.locator('#goal-reading-open').click();
      const layout = await page.evaluate(() => {
        const side = document.querySelector('.side');
        if (!side) throw new Error('Missing side panel.');
        return {
          pageOverflow:
            document.documentElement.scrollWidth > innerWidth ||
            document.documentElement.scrollHeight > innerHeight,
          sideOverflow: getComputedStyle(side).overflowY,
          nestedScrolls: [...document.querySelectorAll('.side *')]
            .filter((el) => {
              const css = getComputedStyle(el);
              return ['auto', 'scroll'].includes(css.overflowY) && el.scrollHeight > el.clientHeight;
            })
            .map((el) => el.id || el.className),
          storage: localStorage.length,
        };
      });
      assert.equal(layout.pageOverflow, false);
      assert.equal(layout.sideOverflow, 'auto');
      assert.deepEqual(layout.nestedScrolls, []);
      assert.equal(layout.storage, 0);
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      results.push({ width, height, shortage, progress, storm, late, map, layout, errors, external });
    } finally {
      await context.close();
    }
  }
  return results;
}
