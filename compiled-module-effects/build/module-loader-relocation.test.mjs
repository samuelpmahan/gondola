import assert from "node:assert/strict";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const sourceFixture = process.env.GOBI_RELOCATION_FIXTURE_SOURCE;
const buildsFixture = process.env.GOBI_RELOCATION_FIXTURE_BUILDS;
const originalCheckout = resolve(process.env.GOBI_RELOCATION_FORBID_ROOT ?? join(here, "../.."));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function prepareFixture(parent, label, currentLoaderBytes, mutate = null) {
  const fixtureRoot = join(parent, label);
  const sourceRoot = join(fixtureRoot, "source");
  const buildsRoot = join(fixtureRoot, "builds");
  await mkdir(fixtureRoot, { recursive: true });
  await cp(sourceFixture, sourceRoot, { recursive: true, force: false, errorOnExist: true });
  await cp(buildsFixture, buildsRoot, { recursive: true, force: false, errorOnExist: true });

  const loaderPath = join(sourceRoot, "compiled-module-effects/build/module-loader.mjs");
  await chmod(loaderPath, 0o644);
  await writeFile(loaderPath, currentLoaderBytes);
  const indexPath = join(buildsRoot, "build-index.json");
  const index = JSON.parse((await readFile(indexPath)).toString("utf8"));
  const loaderPin = index.sourcePins?.["compiled-module-effects/build/module-loader.mjs"];
  assert.ok(loaderPin, "archive build index pins its module loader source");
  index.sourcePins["compiled-module-effects/build/module-loader.mjs"] = {
    path: "compiled-module-effects/build/module-loader.mjs",
    bytes: currentLoaderBytes.byteLength,
    sha256: sha256(currentLoaderBytes),
  };
  await mutate?.({ fixtureRoot, sourceRoot, buildsRoot, index, indexPath });
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  return { fixtureRoot, sourceRoot, buildsRoot, indexPath, loaderPath };
}

async function loadFromCopiedSource(loaderPath, indexPath) {
  const originalReadFile = fsPromises.readFile;
  let blockedReadCount = 0;
  fsPromises.readFile = async function guardedReadFile(path, ...args) {
    let absolutePath;
    try {
      absolutePath = resolve(path instanceof URL ? fileURLToPath(path) : String(path));
    } catch {
      return originalReadFile.call(this, path, ...args);
    }
    if (absolutePath === originalCheckout || absolutePath.startsWith(`${originalCheckout}/`)) {
      blockedReadCount += 1;
      throw new Error(`original checkout read blocked: ${absolutePath}`);
    }
    return originalReadFile.call(this, path, ...args);
  };
  syncBuiltinESMExports();
  try {
    const copiedLoader = await import(`${pathToFileURL(loaderPath).href}?relocated=${encodeURIComponent(loaderPath)}`);
    const loaded = await copiedLoader.loadModuleEffectsBuilds(indexPath);
    assert.equal(blockedReadCount, 0, "relocated loader must not read the original checkout");
    return loaded;
  } finally {
    fsPromises.readFile = originalReadFile;
    syncBuiltinESMExports();
  }
}

if (sourceFixture && buildsFixture) test("relocated archived source loads all pinned builds and rejects local source, context, and artifact tampering", async () => {
  const currentLoaderBytes = await readFile(join(here, "module-loader.mjs"));
  const temporaryRoot = await mkdtemp(join(tmpdir(), "gobi-effects-relocated-source-"));
  try {
    const good = await prepareFixture(temporaryRoot, "good", currentLoaderBytes);
    const recordedIndex = JSON.parse((await readFile(good.indexPath)).toString("utf8"));
    assert.notEqual(recordedIndex.buildContext.repositoryRoot, good.sourceRoot,
      "recorded compiler root must differ from the extracted source root");
    const loaded = await loadFromCopiedSource(good.loaderPath, good.indexPath);
    assert.deepEqual(Object.keys(loaded.builds).sort(), ["dom", "react"]);
    assert.deepEqual(Object.keys(loaded.profiles).sort(), ["dom", "react"]);
    let sideCount = 0;
    let directRoleObjectCount = 0;
    for (const backend of ["react", "dom"]) {
      const build = loaded.builds[backend];
      assert.ok(build.parent.module && build.child.module && build.parent.encoder && build.child.encoder,
        `${backend} parent and child module/encoder profiles loaded`);
      assert.equal(build.effectProbe.observedCount, 4);
      assert.equal(build.mountBoundaryProbe.cases.length, 10);
      assert.equal(build.mountBoundaryProbe.nativeParity, true);
      assert.equal(loaded.profiles[backend].parent.module, build.parent.module);
      assert.equal(loaded.profiles[backend].parent.encoder, build.parent.encoder);
      assert.equal(loaded.profiles[backend].child.module, build.child.module);
      assert.equal(loaded.profiles[backend].child.encoder, build.child.encoder);
      sideCount += 2;
      directRoleObjectCount += 4;
    }
    assert.equal(sideCount, 4, "all four independent React/DOM parent/child artifacts load");
    assert.equal(directRoleObjectCount, 8, "all four module and encoder role pairs are directly exposed");

    const sourceTamper = await prepareFixture(temporaryRoot, "source-tamper", currentLoaderBytes, async ({ sourceRoot }) => {
      const sourcePath = join(sourceRoot, "fixtures/compiled/effectmodulechild/app.go");
      await chmod(sourcePath, 0o644);
      await writeFile(sourcePath, Buffer.concat([await readFile(sourcePath), Buffer.from("\n// tampered source pin\n")]));
    });
    await assert.rejects(
      loadFromCopiedSource(sourceTamper.loaderPath, sourceTamper.indexPath),
      /source pin mismatch: fixtures\/compiled\/effectmodulechild\/app\.go/,
    );

    const contextTamper = await prepareFixture(temporaryRoot, "context-tamper", currentLoaderBytes, ({ index }) => {
      index.buildContext.repositoryRoot = "/tmp/unrelated-checkout/gondola";
    });
    await assert.rejects(
      loadFromCopiedSource(contextTamper.loaderPath, contextTamper.indexPath),
      /generated-source context is malformed or internally inconsistent/,
    );

    const artifactTamper = await prepareFixture(temporaryRoot, "artifact-tamper", currentLoaderBytes, async ({ buildsRoot, index }) => {
      const moduleABI = index.builds.react.child.artifacts.moduleABI;
      const artifactPath = join(buildsRoot, moduleABI.path);
      await chmod(artifactPath, 0o644);
      const bytes = await readFile(artifactPath);
      await writeFile(artifactPath, Buffer.concat([bytes, Buffer.from(" ")]));
    });
    await assert.rejects(
      loadFromCopiedSource(artifactTamper.loaderPath, artifactTamper.indexPath),
      /react compiler output bytes differ from BuildResult: apps\/effectmodulechild-[^/]+\/module-abi\.json/,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
