#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { createHash as createNodeHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sha256 = (bytes) => createNodeHash('sha256').update(bytes).digest('hex');
const MAX_METADATA_BYTES = 8 * 1024 * 1024;
const utf8Fatal = new TextDecoder('utf-8', { fatal: true });

function parseArgs(argv) {
  if (argv.includes('--help')) return { help: true };
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new TypeError(`unexpected argument ${arg}`);
    const key = arg.slice(2);
    if (Object.hasOwn(result, key)) throw new TypeError(`duplicate --${key}`);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new TypeError(`--${key} requires a value`);
    result[key] = value;
    i += 1;
  }
  if (!result.plan) throw new TypeError('missing --plan');
  return result;
}

function rejectDuplicateJSONKeys(text, label) {
  const stack = [];
  for (let index = 0; index < text.length;) {
    const character = text[index];
    if (character === '"') {
      let end = index + 1;
      for (; end < text.length; end += 1) {
        if (text[end] === '\\') { end += 1; continue; }
        if (text[end] === '"') break;
      }
      if (end >= text.length) return;
      const token = text.slice(index, end + 1);
      let key;
      try { key = JSON.parse(token); } catch { return; }
      let lookahead = end + 1;
      while (/\s/.test(text[lookahead] ?? '')) lookahead += 1;
      const container = stack.at(-1);
      if (container?.kind === 'object' && text[lookahead] === ':') {
        if (container.keys.has(key)) throw new Error(`${label} contains duplicate JSON object key ${JSON.stringify(key)}`);
        container.keys.add(key);
      }
      index = end + 1;
      continue;
    }
    if (character === '{') stack.push({ kind: 'object', keys: new Set() });
    else if (character === '[') stack.push({ kind: 'array' });
    else if (character === '}' || character === ']') stack.pop();
    index += 1;
  }
}

async function readJSON(path) {
  const bytes = await readFile(path);
  if (bytes.length > MAX_METADATA_BYTES) throw new Error(`JSON metadata exceeds ${MAX_METADATA_BYTES} bytes: ${path}`);
  let text;
  try { text = utf8Fatal.decode(bytes); }
  catch (error) { throw new Error(`JSON metadata is not valid UTF-8: ${path}: ${error.message}`); }
  rejectDuplicateJSONKeys(text, path);
  return JSON.parse(text);
}

async function validateJSONTree(root) {
  for (const path of await allFiles(root)) {
    if (extname(path).toLowerCase() === '.json') await readJSON(path);
  }
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function writeJSON(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await writeFile(path, bytes, { flag: 'wx' });
  return { path, bytes: bytes.length, sha256: await sha256(bytes) };
}

async function allFiles(root) {
  const canonicalRoot = await realpath(root);
  const files = [];
  async function visit(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(dir, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error(`unexpected symlink under relocated archive: ${path}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error(`unexpected non-regular archive entry: ${path}`);
    }
  }
  await visit(canonicalRoot);
  return files;
}

async function resolveRecorded(root, ref, label) {
  if (!ref || typeof ref.path !== 'string') throw new TypeError(`${label} path is absent`);
  const name = ref.path.split(/[\\/]/).at(-1);
  if (!name || name === '.' || name === '..') throw new TypeError(`${label} basename is unsafe`);
  const matches = (await allFiles(root)).filter((path) => path.endsWith(`${sep}${name}`));
  if (matches.length !== 1) throw new Error(`${label} must resolve to one archived file, found ${matches.length}: ${name}`);
  return matches[0];
}

async function runDirect(plan, attemptRoot, sourceRoot) {
  const summaryPath = resolve(attemptRoot, plan.conformanceSummary);
  const summary = await readJSON(summaryPath);
  if (summary.schema !== 'gobi.module-effects-conformance-summary/v1' || summary.status !== 'matched') {
    throw new Error('archived conformance summary is not a matched capture');
  }
  const labels = Object.keys(summary.captures ?? {}).sort();
  const expectedLabels = ['literal', 'seed-20261104', 'seed-20261105', 'seed-20261106'].sort();
  if (stable(labels) !== stable(expectedLabels)) throw new Error(`unexpected archived scenarios: ${JSON.stringify(labels)}`);
  const loaderRelativePath = 'compiled-module-effects/build/module-loader.mjs';
  const archivedLoaderPath = join(sourceRoot, loaderRelativePath);
  const buildIndexPath = resolve(attemptRoot, plan.buildIndex);
  const buildIndex = await readJSON(buildIndexPath);
  const loaderPin = buildIndex.sourcePins?.[loaderRelativePath];
  const loaderPath = archivedLoaderPath;
  const archivedLoaderBytes = await readFile(archivedLoaderPath);
  if (!loaderPin || loaderPin.path !== loaderRelativePath || !Number.isSafeInteger(loaderPin.bytes) ||
      typeof loaderPin.sha256 !== 'string' || archivedLoaderBytes.byteLength !== loaderPin.bytes ||
      sha256(archivedLoaderBytes) !== loaderPin.sha256) {
    throw new Error('archived module loader source bytes do not match the build index source pin');
  }
  const directPath = join(sourceRoot, 'compiled-module-effects/conformance/direct.mjs');
  const oraclePath = join(sourceRoot, 'compiled-module-effects/oracle/oracle.mjs');
  const scenariosPath = join(sourceRoot, 'compiled-module-effects/conformance/scenarios.mjs');
  const [{ loadModuleEffectsBuilds }, { runModuleEffectsDirect }, oracle, generators] = await Promise.all([
    import(pathToFileURL(loaderPath).href), import(pathToFileURL(directPath).href),
    import(pathToFileURL(oraclePath).href), import(pathToFileURL(scenariosPath).href),
  ]);
  await validateJSONTree(dirname(buildIndexPath));
  const builds = await loadModuleEffectsBuilds(buildIndexPath);
  if (builds.schema !== 'gobi.module-effects-build-index/v1') throw new Error('relocated loader returned an unexpected build index');
  const rows = [];
  for (const label of expectedLabels) {
    const captureRefs = summary.captures[label];
    const scenarioPath = await resolveRecorded(attemptRoot, captureRefs.scenario, `${label} scenario`);
    const nativePath = await resolveRecorded(attemptRoot, captureRefs.native, `${label} native capture`);
    const scenario = await readJSON(scenarioPath);
    const native = await readJSON(nativePath);
    const seed = label === 'literal' ? null : Number(label.slice('seed-'.length));
    const nativeCheck = oracle.assertNativeModuleEffectsCapture(native, scenario);
    if (nativeCheck === false || nativeCheck?.status === 'mismatch' || nativeCheck?.status === 'rejected' ||
        nativeCheck?.events !== scenario.events.length) {
      throw new Error(`${label} archived native oracle rejected: ${JSON.stringify(nativeCheck)}`);
    }
    for (const backend of ['react', 'dom']) {
      const profile = `direct.${backend}`;
      const expectedProfilePath = await resolveRecorded(attemptRoot, captureRefs.profiles?.[profile], `${label} ${profile}`);
      const expectedProfile = await readJSON(expectedProfilePath);
      const actual = await runModuleEffectsDirect({ build: builds.builds[backend], scenario, native, seed, backend });
      const actualBytes = Buffer.from(`${JSON.stringify(actual, null, 2)}\n`, 'utf8');
      const expectedBytes = await readFile(expectedProfilePath);
      const canonicalEqual = stable(JSON.parse(JSON.stringify(actual))) === stable(expectedProfile);
      const byteEqual = actualBytes.equals(expectedBytes);
      if (!canonicalEqual) throw new Error(`${label} relocated ${profile} full capture differs from archived capture`);
      const path = join(plan.output, 'direct-replays', `${label}.${profile}.json`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, actualBytes, { flag: 'wx' });
      rows.push({ label, profile, events: actual.events.length, snapshots: actual.snapshots.length,
        bytesEqual: byteEqual, canonicalJSONEqual: canonicalEqual,
        expectedBytes: expectedBytes.length, actualBytes: actualBytes.length,
        expectedSHA256: await sha256(expectedBytes), actualSHA256: await sha256(actualBytes), outputPath: path });
    }
  }
  return { status: 'matched', buildIndex: plan.buildIndex,
    loaderSource: { path: loaderPath, sha256: loaderPin.sha256, archivedBytesMatched: true },
    scenarios: labels.length,
    directProfilesMatched: rows.length, profileResults: rows };
}

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'],
]);

async function startStaticServer(root, requestRows) {
  const canonicalRoot = await realpath(root);
  const server = createServer(async (request, response) => {
    const rawUrl = request.url ?? '/';
    let pathname;
    try { pathname = decodeURIComponent(new URL(rawUrl, 'http://127.0.0.1').pathname); }
    catch { response.writeHead(400).end('invalid URL'); requestRows.push({ method: request.method, path: rawUrl, status: 400 }); return; }
    const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (relativePath.includes('\\') || relativePath.split('/').some((part) => part === '..' || part === '.')) {
      response.writeHead(400).end('unsafe path'); requestRows.push({ method: request.method, path: rawUrl, status: 400 }); return;
    }
    const path = resolve(canonicalRoot, relativePath);
    if (!path.startsWith(`${canonicalRoot}${sep}`)) {
      response.writeHead(400).end('unsafe path'); requestRows.push({ method: request.method, path: rawUrl, status: 400 }); return;
    }
    try {
      const actual = await realpath(path);
      if (!actual.startsWith(`${canonicalRoot}${sep}`)) throw new Error('path escaped root');
      const info = await lstat(actual);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('not regular file');
      requestRows.push({ method: request.method, path: rawUrl, status: 200, bytes: info.size });
      response.writeHead(200, { 'content-type': MIME.get(extname(actual)) ?? 'application/octet-stream', 'cache-control': 'no-store' });
      if (request.method === 'HEAD') { response.end(); return; }
      createReadStream(actual).pipe(response);
    } catch {
      requestRows.push({ method: request.method, path: rawUrl, status: 404 });
      response.writeHead(404).end('not found');
    }
  });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

async function clickHTMLElement(page, selector, clicks) {
  await page.evaluate((query) => {
    const element = document.querySelector(query);
    if (!(element instanceof HTMLElement)) throw new Error(`missing HTMLElement: ${query}`);
    element.click();
  }, selector);
  clicks.push({ selector, mechanism: 'HTMLElement.click()' });
}

export function assertUnmountLifecycleOrder(lifecycle, { key, generation }) {
  if (!Array.isArray(lifecycle)) throw new Error('demo lifecycle trace must be an array');
  const sameChild = (row) => row?.key === key && row?.generation === generation;
  const updates = lifecycle.filter((row) => row?.kind === 'go-update-unmount' && sameChild(row));
  if (updates.length !== 1) throw new Error(`expected one unmount update for ${key}:g${generation}, found ${updates.length}`);
  const update = updates[0];
  const eventIndex = update.stateEventIndex;
  const token = update.before?.Token;
  if (!Number.isSafeInteger(eventIndex) || eventIndex < 0 || typeof token !== 'string' || !token ||
      update.after?.Mounted !== false || update.after?.Pending !== false || update.after?.Token !== token) {
    throw new Error('Go unmount update does not retain its token in an unmounted, nonpending state');
  }
  const eventRows = lifecycle.filter((row) => sameChild(row) && row.stateEventIndex === eventIndex);
  const unique = (kind, predicate = () => true) => {
    const rows = eventRows.filter((row) => row.kind === kind && predicate(row));
    if (rows.length !== 1) throw new Error(`expected one ${kind} row at unmount state event ${eventIndex}, found ${rows.length}`);
    return rows[0];
  };
  const unmountedCommit = unique('go-unmounted-commit', (row) => row.token === token && row.mounted === false && row.pending === false);
  const childStateCommit = unique('go-state-commit', (row) => row.eventKind === 'child-unmount' && row.token === token &&
    row.mounted === false && row.pending === false);
  const cancelEffect = unique('go-cancel-effect', (row) => row.token === token && row.pendingAfter === false &&
    row.descriptor?.kind === 'lifecycle.cancel' && row.descriptor?.arg === token);
  const cancelCall = unique('transport-cancel-call', (row) => row.token === token && row.retiredBeforeCall === true);
  const cancelResult = unique('transport-cancel', (row) => row.token === token && row.outcome === 'cancelled');
  const teardownRows = lifecycle.filter((row) => row?.kind === 'renderer-unmount' &&
    row.stateEventIndex === eventIndex && row.rendererEpoch === update.rendererEpoch);
  if (teardownRows.length !== 1) throw new Error(`expected one renderer teardown at unmount state event ${eventIndex}`);
  const teardown = teardownRows[0];
  const ordered = [update, unmountedCommit, childStateCommit, cancelEffect, cancelCall, cancelResult, teardown];
  for (let index = 1; index < ordered.length; index += 1) {
    if (!Number.isSafeInteger(ordered[index - 1].sequence) || !Number.isSafeInteger(ordered[index].sequence) ||
        ordered[index - 1].sequence >= ordered[index].sequence) {
      throw new Error('unmount update, Go commit, cancellation, transport result, and renderer teardown must be strictly ordered');
    }
  }
  return { key, generation, token, stateEventIndex: eventIndex,
    sequence: Object.fromEntries(ordered.map((row) => [row.kind, row.sequence])) };
}

export async function runBrowser(plan, attemptRoot, sourceRoot) {
  const siteRoot = resolve(attemptRoot, plan.demoRoot);
  const siteFiles = await allFiles(siteRoot);
  if (!siteFiles.some((path) => path.endsWith(`${sep}index.html`))) throw new Error('archived demo/site/index.html missing');
  const playwrightPath = resolve(plan.playwrightModule);
  const packageJSON = await readJSON(join(dirname(playwrightPath), 'package.json'));
  if (packageJSON.version !== plan.playwrightVersion) throw new Error(`Playwright version mismatch: expected ${plan.playwrightVersion}, got ${packageJSON.version}`);
  const { chromium } = await import(pathToFileURL(playwrightPath).href);
  const requests = [];
  const pageErrors = [];
  const consoleErrors = [];
  const requestFailures = [];
  const httpErrors = [];
  const externalRequests = [];
  const clicks = [];
  const server = await startStaticServer(siteRoot, requests);
  let browser;
  let context;
  let page;
  const origin = new URL(server.url).origin;
  const chromiumPath = resolve(plan.chromium);
  try {
    const launchArgs = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking',
      '--disable-component-update', '--disable-default-apps', '--disable-sync', '--no-first-run',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'];
    browser = await chromium.launch({ headless: true, executablePath: chromiumPath, args: launchArgs });
    context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (new URL(url).origin !== origin) {
        externalRequests.push({ url, method: route.request().method(), blocked: true });
        await route.abort('blockedbyclient');
      } else {
        await route.continue();
      }
    });
    context.on('request', (request) => requests.push({ method: request.method(), url: request.url(), source: 'browser' }));
    context.on('requestfailed', (request) => requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? 'unknown' }));
    context.on('response', (response) => { if (response.status() >= 400) httpErrors.push({ url: response.url(), status: response.status() }); });
    page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    const response = await page.goto(server.url, { waitUntil: 'load', timeout: 20000 });
    if (!response || response.status() !== 200) throw new Error('local archived demo did not return HTTP 200');
    await page.locator('#effects-status[data-state="ready"]').waitFor({ timeout: 20000 });
    await page.waitForFunction(() => typeof window.moduleEffectsDemo?.snapshot === 'function', null, { timeout: 20000 });
    const child = (key) => `#effects-modules [data-gobi-module-root='child-${key}']`;
    const waitForStatus = (key, pattern) => page.waitForFunction(({ selector, pattern: source }) => {
      const text = document.querySelector(`${selector} .effect-request-status`)?.textContent ?? '';
      return new RegExp(source).test(text);
    }, { selector: child(key), pattern: pattern.source }, { timeout: 10000 });
    const waitForCounter = (key, expected) => page.waitForFunction(({ selector, key: childKey, expectedCount }) => {
      const snapshot = window.moduleEffectsDemo.snapshot();
      const childState = snapshot.children.find((item) => item.key === childKey);
      const text = document.querySelector(`${selector} .counter`)?.textContent ?? '';
      return Number(childState?.goState?.Core?.Counter?.Count) === expectedCount && text.includes(`Count: ${expectedCount}`);
    }, { selector: child(key), key, expectedCount: expected }, { timeout: 10000 });
    const waitForBackend = (expected) => page.waitForFunction((backendName) => window.moduleEffectsDemo.snapshot().backend === backendName, expected);
    const clickParent = async (label) => {
      await page.evaluate(({ selector, text }) => {
        const button = [...document.querySelectorAll(selector)].find((item) => item.textContent?.trim() === text);
        if (!(button instanceof HTMLElement)) throw new Error(`missing parent button ${text}`);
        button.click();
      }, { selector: '#effects-modules [data-gobi-module-root="parent"] button', text: label });
      clicks.push({ selector: `parent:${label}`, mechanism: 'HTMLElement.click()' });
    };
    const state = () => page.evaluate(() => window.moduleEffectsDemo.snapshot());
    const transportLog = () => page.evaluate(() => window.moduleEffectsDemo.transportLog());
    await page.waitForFunction(() => document.querySelectorAll('#effects-modules [data-gobi-module-root^="child-"]').length === 2);
    const initial = await state();
    const steps = [{ name: 'initial-two-key-mount', passed: true }];

    await clickHTMLElement(page, `${child('a')} .effect-request-controls button:first-child`, clicks);
    await waitForStatus('a', /^Saving$/);
    const saveA = page.locator(`${child('a')} .effect-request-controls button:first-child`);
    const cancelA = page.locator(`${child('a')} .effect-request-controls button:last-child`);
    if (!(await saveA.isDisabled()) || (await cancelA.isDisabled())) throw new Error('pending Go state did not render disabled Save and enabled Cancel');
    steps.push({ name: 'request-pending-disabled-controls', passed: true });

    await clickHTMLElement(page, `${child('a')} .effect-request-controls button:last-child`, clicks);
    await waitForStatus('a', /^Ready$/);
    steps.push({ name: 'Go-declared-cancel', passed: true });

    await clickHTMLElement(page, '#effects-backend-react', clicks);
    await waitForBackend('react');
    if (await page.locator(`${child('a')} .effect-request-controls button:first-child`).isDisabled()) throw new Error('idle Save remained disabled after renderer swap');
    await clickHTMLElement(page, `${child('a')} .counter button:nth-of-type(1)`, clicks);
    await waitForCounter('a', 1);
    await clickHTMLElement(page, `${child('a')} .effect-request-controls button:first-child`, clicks);
    await waitForStatus('a', /^Saving$/);
    if (!(await page.locator(`${child('a')} .effect-request-controls button:first-child`).isDisabled()) ||
        (await page.locator(`${child('a')} .effect-request-controls button:last-child`).isDisabled())) {
      throw new Error('React renderer did not expose pending Save/Cancel controls');
    }
    steps.push({ name: 'React-swap-counter-and-request', passed: true });

    await clickHTMLElement(page, '#effects-backend-dom', clicks);
    await waitForBackend('dom');
    await waitForStatus('a', /^Saving$/);
    await waitForStatus('a', /^Saved: a:g1:r2$/);
    steps.push({ name: 'timer-completed-across-renderer-swap', passed: true });

    await clickHTMLElement(page, '#effects-backend-react', clicks);
    await waitForBackend('react');
    await clickHTMLElement(page, `${child('b')} .effect-request-controls button:first-child`, clicks);
    await waitForStatus('b', /^Saving$/);
    await clickParent('Remove b');
    await page.waitForFunction(() => !document.querySelector('#effects-modules [data-gobi-module-root="child-b"]'));
    await clickParent('Mount b');
    await page.waitForFunction(() => document.querySelector('#effects-modules [data-gobi-module-root="child-b"]'));
    await clickHTMLElement(page, `${child('b')} .counter button:nth-of-type(1)`, clicks);
    await waitForCounter('b', 1);
    await clickHTMLElement(page, `${child('b')} .effect-request-controls button:first-child`, clicks);
    await waitForStatus('b', /^Saving$/);
    await waitForStatus('b', /^Saved: b:g2:r1$/);
    const final = await state();
    const b = final.children.find((item) => item.key === 'b');
    if (!b || b.generation !== 2 || b.goState?.Mounted !== true || b.goState?.RequestID !== 1 || b.goState?.Pending !== false ||
        b.goState?.Reply !== 'b:g2:r1' || Number(b.goState?.Core?.Counter?.Count) !== 1) {
      throw new Error(`remounted b state is incorrect: ${JSON.stringify(b)}`);
    }
    const transport = await transportLog();
    if (!transport.some((row) => row.token === 'b:g1:r1' && row.kind === 'cancel' && row.status === 'cancelled')) {
      throw new Error('removed pending b did not execute its declared cancellation');
    }
    if (!['a:g1:r2', 'b:g2:r1'].every((token) => transport.some((row) => row.kind === 'timer-reply' && row.token === token && row.status === 'accepted'))) {
      throw new Error('real timer did not complete both surviving request correlations');
    }
    const trace = await page.evaluate(() => window.moduleEffectsDemo.trace());
    const removal = trace.lifecycle.filter((row) => row.key === 'b' && row.generation === 1);
    const removalOrder = assertUnmountLifecycleOrder(trace.lifecycle, { key: 'b', generation: 1 });
    const screenshotPath = join(plan.output, 'illustrative-demo.png');
    const screenshotBytes = await page.screenshot({ path: screenshotPath, fullPage: true, type: 'png' });
    if (!screenshotBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      throw new Error('final interactive demo screenshot is not a PNG');
    }
    const starts = await page.evaluate(() => window.moduleEffectsDemo.transportStartObservations());
    const expectedTokens = ['a:g1:r1', 'a:g1:r2', 'b:g1:r1', 'b:g2:r1'];
    if (stable(starts.map((row) => row.token)) !== stable(expectedTokens) ||
        starts.some((row) => row.goPending !== true || row.goToken !== row.token || row.statusLabel !== 'Saving' ||
          row.saveDisabled !== true || row.cancelDisabled !== false) ||
        starts.slice(1).some((row) => row.backend !== 'react')) {
      throw new Error(`transport.start did not observe committed rendered state: ${JSON.stringify(starts)}`);
    }
    steps.push({ name: 'remove-remount-new-generation-and-timer', passed: true });
    if (pageErrors.length || consoleErrors.length || requestFailures.length || httpErrors.length || externalRequests.length) {
      throw new Error(`browser/network errors: ${JSON.stringify({ pageErrors, consoleErrors, requestFailures, httpErrors, externalRequests })}`);
    }
    const browserVersion = browser.version();
    return { status: 'passed', browserVersion, playwrightVersion: packageJSON.version,
      httpStatus: response.status(), initial, final, steps, transport, removalRows: removal, removalOrder,
      trace, startObservations: starts, pageErrors, consoleErrors, requestFailures,
      httpErrors, externalRequests, requests, serverRequests: requests.filter((row) => row.status !== undefined),
      illustrativeScreenshot: { path: screenshotPath, bytes: screenshotBytes.length, sha256: sha256(screenshotBytes),
        capturedAfter: 'verified timer completion, renderer swap, and child remount', pixelEquivalenceAsserted: false },
      actualHTMLElementClickCount: clicks.length, actualHTMLElementClicks: clicks,
      rendererSwaps: trace.events.filter((row) => row.kind === 'renderer-swap').length,
      timerReplies: transport.filter((row) => row.kind === 'timer-reply').length,
      removedAndRemounted: { key: 'b', oldGeneration: 1, newGeneration: 2 },
      externalNetworkBlocked: true, demoRoot: plan.demoRoot };
  } catch (error) {
    await writeJSON(join(plan.output, "browser.failed.json"), { status: "failed", error: { name: error?.name ?? "Error", message: String(error?.message ?? error) },
      pageErrors, consoleErrors, requestFailures, httpErrors, externalRequests, requests, clicks,
      externalNetworkBlocked: true, demoRoot: plan.demoRoot }).catch(() => {});
    throw error;
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await new Promise((done) => server.server.close(done));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('Usage: node consume-browser.mjs --plan <consumer-plan.json>\n');
    return;
  }
  const planPath = resolve(args.plan);
  const plan = await readJSON(planPath);
  if (plan.schema !== 'gobi.module-effects-consumer-plan/v1') throw new TypeError('consumer plan schema mismatch');
  const attemptRoot = resolve(plan.attemptRoot);
  const sourceRoot = resolve(plan.sourceRoot);
  const outputRoot = resolve(plan.output);
  await mkdir(outputRoot, { recursive: false });
  const modulePath = resolve(sourceRoot, plan.buildIndex.startsWith('builds/') ? 'compiled-module-effects/build/module-loader.mjs' : 'compiled-module-effects/build/module-loader.mjs');
  if (!(await lstat(modulePath)).isFile()) throw new Error('archived source module loader is missing');
  const direct = await runDirect(plan, attemptRoot, sourceRoot);
  const browser = await runBrowser(plan, attemptRoot, sourceRoot);
  const result = { schema: 'gobi.module-effects-relocated-consumer/v1', status: 'passed',
    directProfilesMatched: direct.directProfilesMatched, direct, browser };
  await writeJSON(join(outputRoot, 'relocated-consumer.json'), result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
