import assert from 'node:assert/strict';
import type { Browser } from '@playwright/test';
import { PRESSURE } from '../src/pressure.ts';
import { createGame, exportRun } from '../src/sim.ts';

export async function control(browser: Browser, url: string) {
  const run = exportRun(createGame(418, undefined, undefined, PRESSURE));
  const context = await browser.newContext({ viewport: { width: 360, height: 690 } });
  await context.route('**/*', (r) => (r.request().url().startsWith(url) ? r.continue() : r.abort()));
  await context.addInitScript((saved) => {
    localStorage.setItem('hf-lab-recording-off', '1');
    localStorage.setItem(
      'commonstead-cast-local-v3',
      JSON.stringify({ run: saved, runId: 'tutorial-control', fileOrigin: false, heads: [], sources: [] }),
    );
    const callbacks = new Map<number, FrameRequestCallback>();
    let id = 0,
      now = 0;
    window.requestAnimationFrame = (cb) => {
      callbacks.set(++id, cb);
      return id;
    };
    window.cancelAnimationFrame = (n) => {
      callbacks.delete(n);
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
  }, run);
  const page = await context.newPage();
  try {
    await page.goto(url);
    await page.locator('#continue').click();
    await page.locator('.tutorial-target[data-person]').first().click();
    assert.equal(await page.locator('.tutorial-target').getAttribute('data-resource'), 'wood');
    await page.locator('#clear').click();
    assert((await page.locator('.tutorial-target[data-person]').count()) > 0);
    await page.locator('.tutorial-target[data-person]').first().click();
    await page.locator('.tutorial-target[data-resource="wood"]').click();
    assert.match(await page.locator('.tutorial-prompt').innerText(), /Boards: 80/);
    for (let i = 0; i < 90 && !(await page.locator('.tutorial-target[data-resource="stone"]').count()); i++)
      await page.evaluate(() => (window as unknown as { advance: (ms: number) => void }).advance(1000));
    assert.equal(await page.locator('.tutorial-target[data-resource="stone"]').count(), 1);
    await page.locator('.tutorial-target[data-resource="stone"]').click();
    assert.match(await page.locator('.tutorial-prompt').innerText(), /Ballast bags:/);
    await page.getByRole('button', { name: 'Skip tutorial' }).click();
    assert.equal(await page.locator('.tutorial-prompt').count(), 0);
    await page.locator('#menu').click();
    await page.getByRole('button', { name: 'Replay tutorial' }).click();
    assert.equal(await page.locator('.tutorial-prompt').count(), 1);
    assert.match(
      await page.locator('.tutorial-prompt').innerText(),
      /Ballast bags:/,
      'replay follows the active request',
    );
    await page.locator('[data-resource="wood"]').click();
    await page.locator('[data-resource="stone"]').click();
    assert.match(await page.locator('.tutorial-prompt').innerText(), /Ballast bags:/);
    for (let i = 0; i < 90 && !(await page.locator('.tutorial-target[data-resource="wood"]').count()); i++)
      await page.evaluate(() => (window as unknown as { advance: (ms: number) => void }).advance(1000));
    assert.match(await page.locator('.tutorial-prompt').innerText(), /Ballast bags \d+ → \d+/);
    const promptBox = await page.locator('.tutorial-prompt').boundingBox();
    assert(
      promptBox && promptBox.y >= 0 && promptBox.y + promptBox.height <= 690,
      'next prompt remains visible',
    );
    const visibleTogether = await page.evaluate(() => {
      const panel = document.querySelector('.tutorial-prompt')?.getBoundingClientRect();
      const target = document
        .querySelector('.tutorial-target[data-resource="wood"]')
        ?.getBoundingClientRect();
      const clip = document.querySelector('.side')?.getBoundingClientRect();
      return (
        !!panel &&
        !!target &&
        !!clip &&
        panel.top >= clip.top &&
        panel.bottom <= clip.bottom &&
        target.top >= clip.top &&
        target.bottom <= clip.bottom
      );
    });
    assert(visibleTogether, 'prompt and next control fit inside the scrolling panel');
    await page.getByRole('button', { name: 'Skip tutorial' }).click();
    await page.evaluate(() => localStorage.setItem('commonstead-tutorial-seen', 'native-sentinel'));
    await page.goto(new URL('/file/', url).href);
    await page.locator('#file-load').setInputFiles({
      name: 'run.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(run)),
    });
    await page.locator('#resume').click();
    await page.getByRole('button', { name: 'Skip tutorial' }).click();
    assert.equal(
      await page.evaluate(() => localStorage.getItem('commonstead-tutorial-seen')),
      'native-sentinel',
    );
  } finally {
    await context.close();
  }
}
