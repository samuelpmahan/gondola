import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../interaction/node_modules/playwright/index.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = join(root, 'compiled-frontend/artifacts');
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    let path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!path.startsWith(root + sep)) throw new Error('outside root');
    if (url.pathname.endsWith('/')) path = join(path, 'index.html');
    const bytes = await readFile(path);
    const type = { '.mjs': 'text/javascript', '.html': 'text/html' }[extname(path)] ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type }); response.end(bytes);
  } catch { response.writeHead(404); response.end('not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const result = { schema: 'gobi.compiled-demo-smoke/v1', startedAt: new Date().toISOString(), checks: [], errors: [], wasmRequests: [] };
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  result.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('request', request => { if (/\.wasm(?:[?#]|$)/.test(request.url())) result.wasmRequests.push(request.url()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/compiled-frontend/artifacts/demo/`);
  await page.waitForFunction(() => window.gobiDemo && Object.keys(window.gobiDemo.sessions).length === 4);
  const app = name => page.locator(`[data-app="${name}"]`);
  assert.match(await page.locator('#status').innerText(), /Four compiled Go components mounted/);
  result.checks.push('all four compiled Go components mounted');
  await app('counter').getByRole('button', { name: '+', exact: true }).click();
  await app('counter').getByRole('button', { name: '+', exact: true }).click();
  await app('counter').getByRole('button', { name: 'Reset', exact: true }).click();
  assert.equal(await app('counter').getByRole('button', { name: 'Reset', exact: true }).isDisabled(), true);
  result.checks.push('counter Add/Add/Reset and disabled Reset');
  await app('form').getByLabel('Draft', { exact: true }).fill('demo value');
  await app('form').getByLabel('Checked', { exact: true }).check();
  await app('form').getByRole('button', { name: 'Save', exact: true }).click();
  assert.match(await app('form').innerText(), /Saved: demo value/);
  assert.equal(await app('form').getByLabel('Checked', { exact: true }).isChecked(), true);
  await app('form').getByRole('button', { name: 'Literal argument', exact: true }).click();
  assert.match(await app('form').innerText(), /Literal: target.value/);
  result.checks.push('controlled text/checkbox save and literal argument');
  await app('list').getByRole('button', { name: 'Add', exact: true }).click();
  await app('list').getByRole('button', { name: 'Add', exact: true }).click();
  await app('list').getByLabel('Row 2', { exact: true }).fill('second row');
  await app('list').getByRole('button', { name: 'Up', exact: true }).nth(1).click();
  assert.equal(await app('list').locator('input[type=text]').first().getAttribute('aria-label'), 'Row 2');
  assert.equal(await app('list').getByLabel('Row 2', { exact: true }).inputValue(), 'second row');
  result.checks.push('keyed list edit and reorder');
  await app('effect').getByLabel('Request value', { exact: true }).fill('captured request');
  await app('effect').getByRole('button', { name: 'Request', exact: true }).click();
  assert.match(await app('effect').innerText(), /Status: pending/);
  assert.equal(await app('effect').getByRole('button', { name: 'Request', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Complete next request', exact: true }).click();
  assert.match(await app('effect').innerText(), /Value: captured request/);
  assert.match(await app('effect').innerText(), /Completions: 1/);
  result.checks.push('effect pending DOM then one manual captured reply');
  result.failures = await page.evaluate(() => window.gobiDemo.failures);
  assert.deepEqual(result.failures, []); assert.deepEqual(result.errors, []); assert.deepEqual(result.wasmRequests, []);
  await page.screenshot({ path: join(output, 'demo.png'), fullPage: true });
  result.status = 'passed';
} catch (error) { result.status = 'failed'; result.error = error.message; process.exitCode = 1; }
finally {
  result.finishedAt = new Date().toISOString(); await mkdir(output, { recursive: true });
  await writeFile(join(output, 'demo-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
console.log(JSON.stringify(result));
