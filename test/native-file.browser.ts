// One actual-App synthetic Chromium control. No real browser profile, owner data or submissions.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Browser } from '@playwright/test';
import { PRESSURE } from '../src/pressure.ts';
import { EDITION } from '../src/settlement.ts';
import { PEER_EDITION } from '../src/settlement-dialogue.ts';
import { REPLY_EDITION } from '../src/settlement-scenes.ts';
import { apply, createGame, exportRun, importRun, step } from '../src/sim.ts';

export async function control(browser: Browser, url: string) {
  const keys = ['commonstead-cast-local-v3', 'commonstead-preserved-before-fresh-local'];
  const context = await browser.newContext({ acceptDownloads: true });
  await context.route('**/*', (r) => (r.request().url().startsWith(url) ? r.continue() : r.abort()));
  await context.addInitScript(
    ({ keys }) => {
      const get = Storage.prototype.getItem,
        set = Storage.prototype.setItem,
        remove = Storage.prototype.removeItem;
      const hit = (key: string) => {
        if (keys.includes(key)) {
          (window as unknown as { nativeHits: string[] }).nativeHits.push(key);
          throw new Error('Native game key accessed');
        }
      };
      localStorage.setItem('hf-lab-player', 'a'.repeat(32));
      localStorage.setItem('hf-lab-recording-off', '1');
      (window as unknown as { nativeHits: string[] }).nativeHits = [];
      Storage.prototype.getItem = function (key) {
        hit(key);
        return get.call(this, key);
      };
      Storage.prototype.setItem = function (key, value) {
        hit(key);
        return set.call(this, key, value);
      };
      Storage.prototype.removeItem = function (key) {
        hit(key);
        return remove.call(this, key);
      };
      const raf = window.requestAnimationFrame;
      (window as unknown as { retired: FrameRequestCallback[] }).retired = [];
      window.requestAnimationFrame = (callback) => {
        (window as unknown as { retired: FrameRequestCallback[] }).retired.push(callback);
        return raf(callback);
      };
    },
    { keys },
  );
  const page = await context.newPage(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}/file/`);
  await page.locator('#file-load').waitFor();
  const s = createGame(418, undefined, undefined, PRESSURE);
  step(s);
  apply(s, { kind: 'pause-chapter' });
  const archive = [
    {
      revision: 'synthetic-control',
      source: { game: 'commonstead', build: 'synthetic', engine: '2.23.0', rules: 'commonstead-3' },
      snapshot: structuredClone(s.villagers[0]!.person),
    },
  ];
  const raw = { ...(exportRun(s) as object), castSources: archive };
  const bytes = Buffer.from(JSON.stringify(raw));
  await page
    .locator('#file-load')
    .setInputFiles({ name: 'full.json', mimeType: 'application/json', buffer: bytes });
  await page.locator('#resume').waitFor();
  assert.equal(await page.locator('#toggle input').isChecked(), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('hf-lab-recording-off')), '1');
  async function download(id: string) {
    const pending = page.waitForEvent('download');
    await page.locator(id).click();
    const d = await pending;
    const path = await d.path();
    assert(path);
    return readFile(path);
  }
  assert.deepEqual(await download('#file-original'), bytes);
  const metadata = JSON.parse((await download('#file-metadata')).toString());
  assert.equal(metadata.size, bytes.length);
  assert.match(metadata.sha256, /^[0-9a-f]{64}$/);
  let current = JSON.parse((await download('#file-current')).toString());
  const { castSources: kept, ...native } = current;
  assert.deepEqual(kept, archive);
  assert.deepEqual(importRun(native), s);
  await page.locator('#resume').click();
  await page.waitForTimeout(1150);
  await page.locator('#menu').click();
  current = JSON.parse((await download('#file-current')).toString());
  assert(current.state.tick > s.tick);
  assert(current.inputs.some((i: { command: { kind: string } }) => i.command.kind === 'resume-chapter'));
  const before = JSON.stringify(current);
  await page.evaluate(() => {
    for (const cb of (window as unknown as { retired: FrameRequestCallback[] }).retired.splice(0))
      cb(performance.now() + 50_000);
  });
  assert.deepEqual(JSON.parse((await download('#file-current')).toString()), JSON.parse(before));
  await page.locator('#menu-title').click();
  await page.locator('#file-load').setInputFiles({
    name: 'compact.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exportRun(s, true))),
  });
  await page.locator('#resume').waitFor();
  assert.match(await page.locator('#file-status').innerText(), /Compact input/);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.evaluate(() => {
    for (const cb of (window as unknown as { retired: FrameRequestCallback[] }).retired.splice(0))
      cb(performance.now() + 50_000);
  });
  assert.equal(JSON.parse((await download('#file-current')).toString()).state.tick, s.tick);
  await page.reload();
  await page.locator('#file-load').waitFor();
  assert.equal(await page.locator('#map').count(), 0);
  assert.deepEqual(await page.evaluate(() => (window as unknown as { nativeHits: string[] }).nativeHits), []);
  // A user close cancels a real delayed replacement read, unlike internal install/Resume.
  await page
    .locator('#file-load')
    .setInputFiles({ name: 'before-close.json', mimeType: 'application/json', buffer: bytes });
  await page.locator('#resume').waitFor();
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      const result = await read.call(this);
      if (this.name === 'late-close.json') {
        (window as unknown as { closeReadStarted: boolean }).closeReadStarted = true;
        await new Promise<void>((resolve) => {
          (window as unknown as { releaseCloseRead: () => void }).releaseCloseRead = resolve;
        });
      }
      return result;
    };
  });
  await page.locator('#file-load').setInputFiles({
    name: 'late-close.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exportRun(createGame(419)))),
  });
  await page.waitForFunction(() => (window as unknown as { closeReadStarted: boolean }).closeReadStarted);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#resume').count(), 0);
  await page.evaluate(() => (window as unknown as { releaseCloseRead: () => void }).releaseCloseRead());
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#resume').count(), 0, 'Late selection must not resurrect the closed menu');
  await page.locator('#menu').click();
  const afterClose = JSON.parse((await download('#file-current')).toString());
  assert.equal(afterClose.seed, 418);
  await page.locator('#menu-title').click();
  // End installation is also inert: use a naturally completed production replay.
  const ended = createGame(418, undefined, undefined, PRESSURE);
  while (!ended.ended) step(ended);
  await page.locator('#file-load').setInputFiles({
    name: 'ended.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exportRun(ended))),
  });
  await page.locator('#end-title').waitFor();
  assert.deepEqual(importRun(JSON.parse((await download('#file-current')).toString())), ended);
  await page.locator('#end-title').click();
  assert.equal(await page.locator('#map').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();

  for (const status of ['missing-identity', 'incompatible-session', 'identity-mismatch']) {
    const blocked = await browser.newContext();
    await blocked.route('**/*', (r) => (r.request().url().startsWith(url) ? r.continue() : r.abort()));
    await blocked.addInitScript((status) => {
      if (status !== 'missing-identity') localStorage.setItem('hf-lab-player', 'b'.repeat(32));
      if (status === 'incompatible-session')
        sessionStorage.setItem('hf-lab-session:commonstead', 'invalid-synthetic');
      if (status === 'identity-mismatch') localStorage.setItem('hf-lab-top-level-player', 'c'.repeat(32));
    }, status);
    const chooser = await blocked.newPage();
    await chooser.goto(`${url}/file/`);
    await chooser.locator('#file-load').waitFor();
    assert.match(await chooser.locator('#file-status').innerText(), new RegExp(status));
    assert.equal(await chooser.locator('iframe').count(), 0);
    await blocked.close();
  }

  // Positive native legacy/default/settlement/replies save and Resume through the real host.
  for (const edition of ['legacy', 'default', EDITION, REPLY_EDITION, PEER_EDITION] as const) {
    const config = edition === 'legacy' || edition === 'default' ? undefined : { edition };
    const state = createGame(418, undefined, config, edition === 'default' ? PRESSURE : undefined);
    const saved = JSON.stringify({
      run: exportRun(state),
      runId: 'synthetic-native',
      fileOrigin: false,
      heads: [],
      sources: [],
    });
    const nativeContext = await browser.newContext();
    await nativeContext.route('**/*', (r) => (r.request().url().startsWith(url) ? r.continue() : r.abort()));
    await nativeContext.addInitScript(({ key, saved }) => localStorage.setItem(key, saved), {
      key: keys[0]!,
      saved,
    });
    const nativePage = await nativeContext.newPage();
    await nativePage.goto(url);
    await nativePage.locator('#continue').click();
    await nativePage.locator('#map').waitFor();
    await nativePage.locator('#menu').click();
    await nativePage.locator('#menu-title').click();
    const actual = JSON.parse((await nativePage.evaluate((key) => localStorage.getItem(key), keys[0]!))!);
    assert.deepEqual(importRun(actual.run), state);
    assert.equal(actual.fileOrigin, false);
    await nativeContext.close();
  }
  return {
    actualApp: 'PASS',
    fullCompactOriginalPausedResumeRetiredRAFPagehideReload: true,
    nativeKeys: 'zero accesses with both sinks throwing',
    nativePositive: ['legacy', 'default', EDITION, REPLY_EDITION, PEER_EDITION],
    screenshots: 0,
  };
}
