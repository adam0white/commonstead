import { pathToFileURL } from 'node:url';

const tree = process.cwd();
const { chromium, webkit } = await import(pathToFileURL(`${tree}/node_modules/@playwright/test/index.mjs`));
const { createGame, exportRun } = await import(pathToFileURL(`${tree}/src/sim.ts`));
const game = createGame(418);
const saved = JSON.stringify({
  run: exportRun(game),
  runId: 'local-fixture',
  fileOrigin: false,
  heads: [],
  sources: [],
});
const qaUrl = process.env.SIMPLIFY_QA_URL ?? 'http://127.0.0.1:5197';
const out = [];
for (const [name, type] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await type.launch({ headless: true });
  try {
    for (const [width, height] of [
      [360, 690],
      [820, 1180],
      [1180, 820],
      [1280, 800],
    ]) {
      const context = await browser.newContext({ viewport: { width, height } });
      await context.route(/https:\/\/human\.adamwhite\.work\//, (r) => r.abort());
      await context.route('**/*', (r) =>
        r.request().method() === 'POST' || r.request().url().startsWith('https://human.adamwhite.work/')
          ? r.abort()
          : r.continue(),
      );
      await context.addInitScript(({ saved }) => localStorage.setItem('commonstead-cast-local-v3', saved), {
        saved,
      });
      await context.addInitScript(() => {
        const original = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
          const t = this.getTransform();
          window.__canvasText ??= [];
          window.__canvasText.push({ text, font: (parseFloat(this.font) * t.a) / devicePixelRatio });
          if (window.__canvasText.length > 200) window.__canvasText.shift();
          return original.call(this, text, ...args);
        };
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(`${qaUrl}/`);
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await page.locator('#map').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.locator('.lk-telemetry-notice').waitFor({ state: 'visible' });
      const measureFooter = () =>
        page.evaluate(() => {
          const notice = document.querySelector('.lk-telemetry-notice');
          const footer = document.querySelector('.lab-footer');
          const style = getComputedStyle(notice);
          const range = document.createRange();
          range.selectNodeContents(notice);
          return {
            text: notice.textContent,
            font: parseFloat(style.fontSize),
            node: notice.getBoundingClientRect().toJSON(),
            wrapper: footer.getBoundingClientRect().toJSON(),
            textBottom: range.getBoundingClientRect().bottom,
            lines: new Set(Array.from(range.getClientRects(), (r) => Math.round(r.top))).size,
            clipped: notice.scrollWidth > notice.clientWidth || notice.scrollHeight > notice.clientHeight,
            ellipsis: style.textOverflow === 'ellipsis',
            buttons: notice.querySelectorAll('button').length,
            inMenu: !!notice.closest('.panel'),
            overflow: footer.scrollWidth > footer.clientWidth,
          };
        });
      const footerMetrics = await measureFooter();
      if (
        footerMetrics.text !== 'We record and link play across games on this device.' ||
        footerMetrics.buttons ||
        footerMetrics.font < 14 ||
        footerMetrics.clipped ||
        footerMetrics.ellipsis ||
        footerMetrics.inMenu ||
        footerMetrics.overflow ||
        footerMetrics.textBottom > footerMetrics.node.bottom
      )
        throw Error(`Invalid compact footer ${JSON.stringify(footerMetrics)}`);
      if (
        width === 360 &&
        (footerMetrics.node.height > 40 ||
          footerMetrics.wrapper.height > 40 ||
          footerMetrics.lines !== 1 ||
          Math.abs(footerMetrics.font - 14) > 0.1)
      )
        throw Error(`Oversized phone footer ${JSON.stringify(footerMetrics)}`);
      let enlargedFooter = null;
      if (width === 360) {
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '32px';
        });
        enlargedFooter = await measureFooter();
        if (
          enlargedFooter.lines <= 1 ||
          enlargedFooter.node.height <= footerMetrics.node.height ||
          enlargedFooter.clipped ||
          enlargedFooter.overflow ||
          enlargedFooter.textBottom > enlargedFooter.node.bottom
        )
          throw Error('Enlarged disclosure clipped');
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '';
        });
      }
      const box = await page.locator('#map').boundingBox();
      await page.locator('#map').click({ position: { x: box.width / 2, y: box.height / 2 } });
      await page.locator('#train').waitFor();
      await page.getByRole('button', { name: 'Nora', exact: true }).click();
      await page.locator('#resident summary').click();
      const deadlineTop = await page.locator('#deadline').evaluate((el) => el.getBoundingClientRect().top);
      await page.locator('#listen').scrollIntoViewIfNeeded();
      const pinned = await page.locator('#deadline').evaluate((el) => el.getBoundingClientRect().top);
      if (Math.abs(deadlineTop - pinned) > 1) throw Error('Deadline scrolled away');
      const canvasFonts = await page.evaluate(() => [
        ...new Map((window.__canvasText ?? []).map((x) => [x.text, x])).values(),
      ]);
      if (canvasFonts.some((x) => x.text !== '+' && x.font < 15.9))
        throw Error('Tiny canvas labels ' + JSON.stringify(canvasFonts));
      await page.getByRole('button', { name: 'Pause menu', exact: true }).click();
      const controls = await page.locator('.panel button').allTextContents();
      if (controls.join('|') !== 'Resume|Feedback|Full screen|New game') throw Error(`Menu ${controls}`);
      if (await page.locator('#download,#continuity-menu,#load').count()) throw Error('ordinary diagnostics');
      await page.locator('#toggle input').uncheck();
      await page.getByRole('button', { name: 'New game', exact: true }).click();
      await page.getByRole('button', { name: 'Keep this game', exact: true }).click();
      await page.getByRole('button', { name: 'Feedback', exact: true }).click();
      if ((await page.locator('.panel input[type=checkbox]').count()) !== 1)
        throw Error('one optional sharing checkbox required with Recording off');
      await page.locator('#note').fill('Local layout check; no submission.');
      await page.locator('#name').focus();
      await page.locator('#send').scrollIntoViewIfNeeded();
      const metrics = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        submit: document.querySelector('#send').getBoundingClientRect().toJSON(),
        font: getComputedStyle(document.querySelector('.panel p')).fontSize,
        footer: document.querySelector('.lab-footer').innerText,
      }));
      if (metrics.overflow || metrics.submit.bottom > height || metrics.submit.top < 0 || errors.length)
        throw Error(JSON.stringify({ metrics, errors }));
      if (width >= 768 && parseFloat(metrics.font) < 15) throw Error('tablet text too small');
      let reducedViewportSubmit = null;
      if (width === 360) {
        await page.setViewportSize({ width, height: 400 });
        await page.locator('#name').focus();
        await page.locator('#send').scrollIntoViewIfNeeded();
        reducedViewportSubmit = await page.locator('#send').boundingBox();
        if (!reducedViewportSubmit || reducedViewportSubmit.y + reducedViewportSubmit.height > 400)
          throw Error('Submit unreachable with reduced keyboard space');
        await page.setViewportSize({ width, height });
      }
      out.push({
        footerMetrics,
        enlargedFooter,
        reducedViewportSubmit,
        engine: name,
        width,
        height,
        controls,
        metrics,
        errors,
        canvasFonts,
        deadlinePinned: Math.abs(deadlineTop - pinned) < 1,
      });
      await context.close();
    }
    const context = await browser.newContext();
    const page = await context.newPage();
    await context.route('**/*', (r) => (r.request().method() === 'POST' ? r.abort() : r.continue()));
    await context.route(/https:\/\/human\.adamwhite\.work\//, (r) => r.abort());
    await context.addInitScript(({ saved }) => localStorage.setItem('commonstead-cast-local-v3', saved), {
      saved,
    });
    for (const query of ['lab=0', 'lab=true', 'lab=01', 'lab=1']) {
      await page.goto(`${qaUrl}/?${query}`);
      if ((await page.locator('#load').count()) > 0 !== (query === 'lab=1')) throw Error('lab flag ' + query);
      if (query === 'lab=1') {
        await page.locator('#continue').click();
        await page.locator('#map').waitFor();
        await page.locator('#menu').click();
        if ((await page.locator('#download,#continuity-menu').count()) !== 2)
          throw Error('lab tools missing');
      }
    }
    await context.close();
  } finally {
    await browser.close();
  }
}
console.log(JSON.stringify({ cases: out, exactLabFlags: true, fixtureOnly: true }, null, 2));
