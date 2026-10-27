import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { control } from '../test/reading.browser.ts';

const server = await createServer({ server: { host: '127.0.0.1', port: 5286, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  console.log(JSON.stringify(await control(browser, 'http://127.0.0.1:5286'), null, 2));
} finally {
  await browser.close();
  await server.close();
}
