import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { control } from '../test/work-orders.browser.ts';

const server = await createServer({ server: { host: '127.0.0.1', port: 5293, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  console.log(JSON.stringify(await control(browser, 'http://127.0.0.1:5293'), null, 2));
} finally {
  await browser.close();
  await server.close();
}
