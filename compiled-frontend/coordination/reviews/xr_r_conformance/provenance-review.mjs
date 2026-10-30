import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(process.cwd(), '..');
const raw = path.join(root, 'compiled-frontend/conformance/raw/r-conformance-final');
const out = path.join(root, 'compiled-frontend/coordination/reviews/xr_r_conformance/provenance-review.json');
const profiles = ['counter', 'form', 'list', 'effect', 'list-growth'];
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const equalInputs = (left, right) => left.length === right.length && left.every((input, i) =>
  input.path === right[i].path && input.sha256 === right[i].sha256 && input.bytes === right[i].bytes);
const results = [];
for (const profile of profiles) {
  const direct = JSON.parse(fs.readFileSync(path.join(raw, `${profile}.direct.manifest.json`), 'utf8')).provenance.inputs;
  const browser = JSON.parse(fs.readFileSync(path.join(raw, `${profile}.browser.json`), 'utf8'));
  const browserBase = browser.provenanceBase.inputs;
  const browserInputs = browser.provenance.inputs;
  const bundles = browserInputs.filter((input) => input.path.startsWith('/tmp/gobi-compiled-browser-'));
  const withoutBundle = browserInputs.filter((input) => !input.path.startsWith('/tmp/gobi-compiled-browser-'));
  const missing = [];
  const changed = [];
  for (const input of browserBase) {
    const file = path.resolve(root, input.path);
    if (!fs.existsSync(file)) { missing.push(input.path); continue; }
    const bytes = fs.readFileSync(file);
    if (bytes.length !== input.bytes || sha256(bytes) !== input.sha256) changed.push(input.path);
  }
  const passed = direct.length === 98 && browserBase.length === 98 && browserInputs.length === 99
    && bundles.length === 1 && equalInputs(direct, browserBase) && equalInputs(browserBase, withoutBundle)
    && missing.length === 0 && changed.length === 0;
  results.push({ profile, directInputs: direct.length, browserBaseInputs: browserBase.length,
    browserInputsIncludingBundle: browserInputs.length, generatedBundles: bundles.length,
    directMatchesBrowserBase: equalInputs(direct, browserBase), browserMatchesAfterBundleRemoval: equalInputs(browserBase, withoutBundle),
    localPinsVerified: browserBase.length - missing.length - changed.length, missing, changed, passed });
}
const result = { schema: 'xr-r-conformance-provenance-review/v1', profiles: results,
  allSourcePinsVerified: results.every((row) => row.passed), localPinsVerified: results.reduce((n, row) => n + row.localPinsVerified, 0) };
fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output: out, allSourcePinsVerified: result.allSourcePinsVerified,
  localPinsVerified: result.localPinsVerified, profiles: results.map(({ profile, passed }) => ({ profile, passed })) }, null, 2));
if (!result.allSourcePinsVerified) process.exitCode = 1;
