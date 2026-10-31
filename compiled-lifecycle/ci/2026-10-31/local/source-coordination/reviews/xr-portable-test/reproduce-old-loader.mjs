import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reviewRoot = dirname(fileURLToPath(import.meta.url));
const root = resolve(reviewRoot, "../../../..");
const beforePath = resolve(root, "compiled-lifecycle/coordination/reviews/r-portable-test/before/runtime.test.mjs");
const beforeBytes = await readFile(beforePath);
assert.equal(createHash("sha256").update(beforeBytes).digest("hex"),
  "71954753de22fdac4a14d28db44917f0d02860f3cedddbc17732b2218d4fff29");

const probeRoot = resolve(reviewRoot, "legacy-probe");
const runtimeDir = resolve(probeRoot, "compiled-lifecycle/runtime");
const appsDir = resolve(probeRoot, "compiled-lifecycle/builds/feasibility/final/react/output/apps");
const generatedAppDir = resolve(root,
  "compiled-lifecycle/builds/portability/attempt-00/react/output/apps/lifecycle-7e6575d90707");
await mkdir(runtimeDir, { recursive: true });
await mkdir(appsDir, { recursive: true });
await copyFile(beforePath, resolve(runtimeDir, "runtime.test.mjs"));
await copyFile(resolve(root, "compiled-lifecycle/runtime/runtime.mjs"), resolve(runtimeDir, "runtime.mjs"));
await symlink(resolve(root, "compiled-frontend"), resolve(probeRoot, "compiled-frontend"), "dir");
await symlink(generatedAppDir, resolve(appsDir, "lifecycle-7e6575d90707"), "dir");

const regression = `
\ntest("compiled lifecycle fixture loader requires an explicit app directory", async () => {
  const previous = process.env.GOBI_LIFECYCLE_APP_DIR;
  delete process.env.GOBI_LIFECYCLE_APP_DIR;
  try {
    await assert.rejects(loadCompiledLifecycleFixture(), /GOBI_LIFECYCLE_APP_DIR is required/);
  } finally {
    if (previous === undefined) delete process.env.GOBI_LIFECYCLE_APP_DIR;
    else process.env.GOBI_LIFECYCLE_APP_DIR = previous;
  }
});
`;
const testPath = resolve(runtimeDir, "runtime.test.mjs");
await writeFile(testPath, `${await readFile(testPath, "utf8")}${regression}`, "utf8");
console.log(JSON.stringify({
  beforeSha256: createHash("sha256").update(beforeBytes).digest("hex"),
  probeTest: testPath,
  legacyFallback: appsDir,
  generatedAppDir,
}, null, 2));
