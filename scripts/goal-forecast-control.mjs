import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { control } from '../test/goal-forecast.browser.ts';

const evidence = process.env.COMMONSTEAD_FORECAST_EVIDENCE;
if (!evidence) throw new Error('Set COMMONSTEAD_FORECAST_EVIDENCE to the local evidence directory.');
const server = await createServer({ server: { host: '127.0.0.1', port: 5296, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  console.log(JSON.stringify(await control(browser, 'http://127.0.0.1:5296', evidence), null, 2));
} finally {
  await browser?.close();
  await server.close();
}
