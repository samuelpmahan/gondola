import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reviewRoot = dirname(fileURLToPath(import.meta.url));
const root = resolve(reviewRoot, "../../../..");
const packagePath = "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle";
const sourcePath = resolve(root, "compiled-lifecycle/runtime/runtime.test.mjs");
const beforePath = resolve(root, "compiled-lifecycle/coordination/reviews/r-portable-test/before/runtime.test.mjs");
const runtimePath = resolve(root, "compiled-lifecycle/runtime/runtime.mjs");
const appDir = resolve(root,
  "compiled-lifecycle/builds/portability/attempt-00/react/output/apps/lifecycle-7e6575d90707");
const mirrorRoot = resolve(reviewRoot, "isolated");

async function bytesHash(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

const source = await readFile(sourcePath, "utf8");
const beforeHash = await bytesHash(beforePath);
const currentHash = await bytesHash(sourcePath);
assert.equal(beforeHash, "71954753de22fdac4a14d28db44917f0d02860f3cedddbc17732b2218d4fff29");
assert.equal(currentHash, "a07ec74fe85995e7ac18fd0d03a789e3d722f3507b6a24b5d03f410bef58e59d");
assert.equal(await bytesHash(runtimePath), "9c2a06521ec19be0f70415dcdcf6aa71b022b08daaf6f913e503cc197e2261ed");
assert.match(source, /process\.env\.GOBI_LIFECYCLE_APP_DIR/);
assert.match(source, /resolve\(configuredAppDir\)/);
assert.match(source, /appIR\.packagePath !== "github\.com\/samuelpmahan\/gondola\/fixtures\/compiled\/lifecycle"/);
assert.match(source, /pathToFileURL\(join\(appDir, "gobi-compiled\.mjs"\)\)/);
assert.match(source, /pathToFileURL\(join\(appDir, "encoder\.mjs"\)\)/);
assert.doesNotMatch(source, /readdir|feasibility\/final|builds\/feasibility/);

const appIRPath = join(appDir, "app-ir.json");
const modulePath = join(appDir, "gobi-compiled.mjs");
const encoderPath = join(appDir, "encoder.mjs");
const appIR = JSON.parse(await readFile(appIRPath, "utf8"));
assert.equal(appIR.packagePath, packagePath);
assert.equal(appIR.components.length, 1);
assert.equal(appIR.components[0].id, packagePath);
assert.equal(appIR.components[0].packagePath, packagePath);
for (const path of [modulePath, encoderPath]) assert.ok((await stat(path)).isFile());

const manifestPath = resolve(root, "compiled-lifecycle/builds/portability/attempt-00/react/output/buildmanifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert.equal(manifest.apps.length, 1);
assert.equal(manifest.apps[0].componentId, packagePath);
assert.equal(manifest.apps[0].packagePath, packagePath);
assert.equal(resolve(dirname(manifestPath), manifest.apps[0].appIR), appIRPath);
assert.equal(resolve(dirname(manifestPath), manifest.apps[0].module), modulePath);
assert.equal(resolve(dirname(manifestPath), manifest.apps[0].encoder), encoderPath);

const mirrorTest = resolve(mirrorRoot, "compiled-lifecycle/runtime/runtime.test.mjs");
const mirrorRuntime = resolve(mirrorRoot, "compiled-lifecycle/runtime/runtime.mjs");
assert.equal(await bytesHash(mirrorTest), currentHash);
assert.equal(await bytesHash(mirrorRuntime), await bytesHash(runtimePath));
const hiddenFallback = resolve(mirrorRoot, "compiled-lifecycle/builds/feasibility/final/react/output/apps");
await assert.rejects(stat(hiddenFallback), { code: "ENOENT" });

console.log(JSON.stringify({
  beforeSha256: beforeHash,
  currentTestSha256: currentHash,
  runtimeSha256: await bytesHash(runtimePath),
  explicitEnvironment: "GOBI_LIFECYCLE_APP_DIR",
  appDir,
  packagePath: appIR.packagePath,
  componentID: appIR.components[0].id,
  appIRSha256: await bytesHash(appIRPath),
  moduleSha256: await bytesHash(modulePath),
  encoderSha256: await bytesHash(encoderPath),
  manifestSha256: await bytesHash(manifestPath),
  fallbackReferencesInCurrentLoader: false,
  isolatedFallbackPathExists: false,
}, null, 2));
