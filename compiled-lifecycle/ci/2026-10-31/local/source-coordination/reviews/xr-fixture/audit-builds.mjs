import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reviewRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(reviewRoot, "../../../..");
const packagePath = "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle";
const summaries = [];

for (const backend of ["react", "dom"]) {
  const lane = join(reviewRoot, `cli-${backend}`);
  const request = JSON.parse(await readFile(join(lane, "request.json"), "utf8"));
  const result = JSON.parse(await readFile(join(lane, "result.json"), "utf8"));
  assert.equal(request.schema, "gobi.build-request/v1");
  assert.equal(request.sourceRoot, repositoryRoot);
  assert.deepEqual(request.entryPackages, [packagePath]);
  assert.equal(request.backend, backend);
  assert.equal(resolve(request.outputDir), join(lane, "output"));
  assert.equal(result.schema, "gobi.build-result/v1");
  assert.equal(result.ok, true, `${backend} build result`);
  assert.deepEqual(result.diagnostics, [], `${backend} diagnostics`);
  assert.equal(result.apps.length, 1, `${backend} app count`);
  const app = result.apps[0];
  assert.equal(app.packagePath, packagePath);
  assert.equal(app.components.length, 1);
  assert.equal(app.components[0].id, packagePath);
  assert.equal(app.components[0].packagePath, packagePath);
  assert.ok(app.components[0].capabilities.includes("effect.request-reply"));
  const uint64Type = app.types.find((type) => type.id === "uint64");
  assert.deepEqual(uint64Type, { id: "uint64", kind: "uint", bits: 64, jsRepresentation: "bigint" });
  const nodeStateType = app.types.find((type) => type.id === `${packagePath}.NodeState`);
  const lifecycleStateType = app.types.find((type) => type.id === `${packagePath}.State`);
  assert.deepEqual(nodeStateType.fields.filter((field) => ["Generation", "RequestID"].includes(field.name)), [
    { name: "Generation", type: "uint64" }, { name: "RequestID", type: "uint64" },
  ]);
  assert.deepEqual(lifecycleStateType.fields.find((field) => field.name === "NextRequestID"),
    { name: "NextRequestID", type: "uint64" });
  assert.equal(result.outputs.length, 67, `${backend} output count`);

  const manifest = JSON.parse(await readFile(join(lane, "output", "buildmanifest.json"), "utf8"));
  assert.equal(manifest.schema, "gobi.build-manifest/v1");
  assert.equal(manifest.apps.length, 1);
  assert.equal(manifest.apps[0].backend, backend);
  assert.equal(manifest.apps[0].componentId, packagePath);
  const outputHashes = new Map();
  for (const output of result.outputs) {
    const filePath = join(lane, "output", output.path);
    const bytes = await readFile(filePath);
    assert.equal(bytes.length, output.bytes, `${backend} bytes ${output.path}`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), output.sha256, `${backend} SHA ${output.path}`);
    outputHashes.set(output.path, output.sha256);
  }
  const appIRPath = [...outputHashes.keys()].find((path) => /^apps\/[^/]+\/app-ir\.json$/.test(path));
  const modulePath = [...outputHashes.keys()].find((path) => /^apps\/[^/]+\/gobi-compiled\.mjs$/.test(path));
  assert.ok(appIRPath, `${backend} AppIR output path`);
  assert.ok(modulePath, `${backend} compiled module output path`);
  const emittedAppIR = JSON.parse(await readFile(join(lane, "output", appIRPath), "utf8"));
  assert.deepEqual(emittedAppIR, app, `${backend} AppIR output/result parity`);
  summaries.push({ backend, outputs: result.outputs.length, appIRPath,
    appIRSha256: outputHashes.get(appIRPath), modulePath, moduleSha256: outputHashes.get(modulePath) });
}

assert.equal(summaries[0].appIRSha256, summaries[1].appIRSha256, "React/DOM AppIR hashes");
console.log(JSON.stringify({ verifiedBuilds: summaries, reactDomAppIRIdentical: true }, null, 2));
