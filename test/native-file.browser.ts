// One actual-App synthetic Chromium control. No real browser profile, owner data or submissions.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import type { Browser, Page } from '@playwright/test';
import { PRESSURE } from '../src/pressure.ts';
import { EDITION } from '../src/settlement.ts';
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
  for (const edition of ['default', EDITION] as const) {
    const config = edition === 'default' ? undefined : { edition };
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
    nativePositive: ['default', EDITION],
    screenshots: 0,
  };
}

async function delayNativeSave(page: Page) {
  await page.evaluate(async () => {
    const modulePath = '/src/save-store.ts';
    const { NativeSaveStore } = await import(modulePath);
    const original = NativeSaveStore.prototype.write;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const driver = globalThis as unknown as { releaseNativeWrite: () => void; nativeWriteCalls: number };
    driver.nativeWriteCalls = 0;
    driver.releaseNativeWrite = release;
    NativeSaveStore.prototype.write = function (...args: unknown[]) {
      driver.nativeWriteCalls++;
      return held.then(() => original.apply(this, args));
    };
  });
}

/** Actual App/IndexedDB controls. Only the save transport is delayed for the stale-dialog case. */
export async function navigationControl(browser: Browser, url: string, prefix: string) {
  const context = await browser.newContext();
  await context.route('**/*', (r) => (r.request().url().startsWith(url) ? r.continue() : r.abort()));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  async function current() {
    const pending = page.waitForEvent('download');
    await page.locator('#download').click();
    return readFile((await (await pending).path())!);
  }

  try {
    await page.goto(url);
    await page.locator('#new').click();
    await page.locator('#map').waitFor();
    await page.waitForTimeout(2100);
    await page.locator('#menu').click();
    const before = await current();
    assert(JSON.parse(before.toString()).tick > 0);
    await writeFile(`${prefix}-navigation-before.json`, before);
    await delayNativeSave(page);
    await page.locator('#menu-title').click();
    await page.waitForFunction(
      () => (globalThis as unknown as { nativeWriteCalls: number }).nativeWriteCalls > 0,
    );
    assert.equal(
      await page.locator('#resume').isVisible(),
      true,
      'menu must remain until the real save finishes',
    );
    await page.evaluate(() =>
      (globalThis as unknown as { releaseNativeWrite: () => void }).releaseNativeWrite(),
    );
    await page.locator('#continue').waitFor();
    await page.locator('#continue').click();
    await page.locator('#map').waitFor();
    await page.locator('#menu').click();
    const after = await current();
    await writeFile(`${prefix}-navigation-after.json`, after);
    assert.deepEqual(JSON.parse(after.toString()), JSON.parse(before.toString()));

    // Genuine supersession: closing the old menu while its save waits must not navigate later.
    await delayNativeSave(page);
    await page.locator('#menu-title').click();
    await page.waitForFunction(
      () => (globalThis as unknown as { nativeWriteCalls: number }).nativeWriteCalls > 0,
    );
    await page.locator('#resume').click();
    await page.evaluate(() =>
      (globalThis as unknown as { releaseNativeWrite: () => void }).releaseNativeWrite(),
    );
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#menu').isVisible(), true);
    assert.equal(await page.locator('#new').count(), 0);
    assert.deepEqual(errors, []);
    return {
      titleWaitsForDurableSave: true,
      completeHotResumeEquality: true,
      staleMenuCannotNavigate: true,
      errors,
      screenshots: 0,
    };
  } finally {
    await context.close();
  }
}

export async function endingNavigationControl(browser: Browser, url: string, prefix: string, raw: unknown) {
  const context = await browser.newContext();
  await context.route('**/*', (r) => (r.request().url().startsWith(url) ? r.continue() : r.abort()));
  const page = await context.newPage();
  try {
    await page.goto(`${url}/file/`);
    await page.locator('#file-load').waitFor();
    await page.evaluate(async (run) => {
      const modulePath = '/src/save-store.ts';
      const { NativeSaveStore } = await import(modulePath);
      const store = new NativeSaveStore();
      await store.read();
      await store.write(
        JSON.stringify({ run, runId: 'actual599-ending-control', fileOrigin: false, heads: [], sources: [] }),
      );
    }, raw);
    await page.goto(url);
    await page.locator('#continue').click();
    await page.locator('#map').waitFor();
    await delayNativeSave(page);
    await page.locator('#end-title').waitFor();
    const pending = page.waitForEvent('download');
    await page.locator('#end-download').click();
    const before = await readFile((await (await pending).path())!);
    await writeFile(`${prefix}-ending-before.json`, before);
    assert.equal(JSON.parse(before.toString()).tick, 600);
    await page.locator('#end-title').click();
    assert.equal(
      await page.locator('#end-title').isVisible(),
      true,
      'ending must remain until its final save commits',
    );
    await page.evaluate(() =>
      (globalThis as unknown as { releaseNativeWrite: () => void }).releaseNativeWrite(),
    );
    await page.locator('#continue').waitFor();
    await page.locator('#continue').click();
    await page.locator('#end-title').waitFor();
    const next = page.waitForEvent('download');
    await page.locator('#end-download').click();
    const after = await readFile((await (await next).path())!);
    await writeFile(`${prefix}-ending-after.json`, after);
    assert.deepEqual(JSON.parse(after.toString()), JSON.parse(before.toString()));
    return {
      actual599To600FinalSaveAwaited: true,
      wholeEndingResumeEqual: true,
      storageFixtureOnly: true,
      screenshots: 0,
    };
  } finally {
    await context.close();
  }
}

/** Synthetic stored wrappers contain real current runs; this stages no shelf write or custody claim. */
export async function recoveryDownloadControl(browser: Browser, url: string, prefix: string) {
  const context = await browser.newContext();
  await context.route('**/*', (r) => (r.request().url().startsWith(url) ? r.continue() : r.abort()));
  const page = await context.newPage();
  const s = createGame(418);
  step(s);
  const previous = exportRun(s);
  step(s);
  const candidate = exportRun(s);
  const sources = [
    {
      revision: 'synthetic-recovery-source',
      source: { game: 'commonstead', build: 'control', engine: '2.23.0', rules: 'commonstead-3' },
      snapshot: { entire: ['source', 7] },
    },
  ];
  const files: { name: string; bytes: Buffer; run: unknown }[] = [];
  try {
    await page.goto(`${url}/file/`);
    await page.locator('#file-load').waitFor();
    await page.evaluate(
      async ({ previous, candidate, sources }) => {
        const storePath = '/src/save-store.ts',
          admissionPath = '/src/admission-store.ts';
        const { NativeSaveStore } = await import(storePath);
        const { AdmissionStore } = await import(admissionPath);
        const store = new NativeSaveStore();
        await store.read();
        await store.write(
          JSON.stringify({
            run: previous,
            runId: 'previous-download-control',
            fileOrigin: false,
            heads: [],
            sources,
          }),
        );
        await new AdmissionStore().stage(
          {
            id: 'download-only-control',
            source: 'synthetic-storage-fixture',
            generation: 0,
            previousRevision: store.observedRevision,
            expectedHeads: {},
            claims: [],
            accepted: [],
            nonaccepted: [],
            rawPrepare: {},
            candidate: JSON.stringify({
              run: candidate,
              runId: 'prepared-download-control',
              fileOrigin: false,
              heads: [],
              sources,
            }),
          },
          () => true,
        );
      },
      { previous, candidate, sources },
    );
    await page.goto(url);
    await page.locator('#download-prepared').waitFor();
    for (const [id, run] of [
      ['download-prepared', candidate],
      ['download-previous', previous],
    ] as const) {
      const pending = page.waitForEvent('download');
      await page.locator(`#${id}`).click();
      const bytes = await readFile((await (await pending).path())!);
      await writeFile(`${prefix}-${id}.json`, bytes);
      files.push({ name: id, bytes, run });
    }
    await page.goto(`${url}/file/`);
    for (const file of files) {
      await page
        .locator('#file-load')
        .setInputFiles({ name: `${file.name}.json`, mimeType: 'application/json', buffer: file.bytes });
      await page.waitForFunction(
        () =>
          document.querySelector('#resume') ||
          document.querySelector('#file-status')?.textContent?.includes('The file was not loaded'),
      );
      await writeFile(
        `${prefix}-${file.name}-status.txt`,
        (await page.locator('#file-status').textContent()) ?? '',
      );
      assert.equal(await page.locator('#resume').isVisible(), true, 'the downloaded recovery file must open');
      const pending = page.waitForEvent('download');
      await page.locator('#file-current').click();
      const current = await readFile((await (await pending).path())!);
      await writeFile(`${prefix}-${file.name}-reopened.json`, current);
      assert.deepEqual(JSON.parse(current.toString()), { ...(file.run as object), castSources: sources });
      await page.locator('#menu-title').click();
    }
    return {
      bothRecoveryDownloadsOpenAsCompleteFiles: true,
      completeSourcesRetained: true,
      storageFixtureOnly: true,
      shelfWrites: 0,
      screenshots: 0,
    };
  } finally {
    await context.close();
  }
}
