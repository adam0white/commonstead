import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const { control } = await server.ssrLoadModule('/test/tutorial.browser.ts');
const browser = await chromium.launch({ headless: true });
try {
  await control(browser, server.resolvedUrls.local[0]);
  console.log('tutorial control passed');
} finally {
  await browser.close();
  await server.close();
}
