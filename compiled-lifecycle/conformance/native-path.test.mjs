import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { accessSync, chmodSync, constants, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseArgs, runNative } from "./run.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_ARGS = [
  "--react-app-ir", "/tmp/lifecycle-native-path/react/app-ir.json",
  "--react-compiled", "/tmp/lifecycle-native-path/react/gobi-compiled.mjs",
  "--react-helpers", "/tmp/lifecycle-native-path/react/encoder.mjs",
  "--dom-app-ir", "/tmp/lifecycle-native-path/dom/app-ir.json",
  "--dom-compiled", "/tmp/lifecycle-native-path/dom/gobi-compiled.mjs",
  "--dom-helpers", "/tmp/lifecycle-native-path/dom/encoder.mjs",
  "--react-manifest", "/tmp/lifecycle-native-path/react/buildmanifest.json",
  "--dom-manifest", "/tmp/lifecycle-native-path/dom/buildmanifest.json",
  "--output", "/tmp/lifecycle-native-path/output/lifecycle",
];

function goOnPath() {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const candidate = resolve(directory, "go");
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  throw new Error("the Go CLI must be available on PATH for this integration test");
}

function parseInChild({ nativeGo, cwd = ROOT }) {
  const moduleURL = pathToFileURL(resolve(ROOT, "compiled-lifecycle/conformance/run.mjs")).href;
  const args = [...REQUIRED_ARGS];
  const childSource = [
    `import { parseArgs } from ${JSON.stringify(moduleURL)};`,
    `process.stdout.write(JSON.stringify(parseArgs(${JSON.stringify(args)}).nativeGo));`,
  ].join("\n");
  const env = { ...process.env };
  if (nativeGo === undefined) delete env.GOBI_GO_BIN;
  else env.GOBI_GO_BIN = nativeGo;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", childSource], {
    cwd,
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("bare --native-go go reaches the PATH CLI and replays the real lifecycle fixture", () => {
  const args = parseArgs([...REQUIRED_ARGS, "--native-go", "go"]);
  assert.equal(args.nativeGo, "go");

  // runNative executes `go run ./cmd/compiled-lifecycle-native`; this asserts
  // the real child-process boundary and the produced Go-owned replay.
  const result = runNative(args.nativeGo, args.fixture);
  assert.deepEqual(result.command, [
    "go", "run", "./cmd/compiled-lifecycle-native", "--script", args.fixture,
  ]);
  assert.equal(result.value.schema, "gobi.compiled-lifecycle-native/v1");
  assert.equal(result.value.componentID, "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle");
  assert.equal(result.value.steps.length, 26);
  const cancellation = result.value.steps[9].effects.map((effect) => effect.arg);
  assert.deepEqual(cancellation, ["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"]);
});

test("explicit relative and absolute native executables resolve to executable paths", () => {
  const absolute = goOnPath();
  const relativePath = relative(ROOT, absolute);
  assert.notEqual(relativePath, absolute);

  const fromAbsolute = parseArgs([...REQUIRED_ARGS, "--native-go", absolute]);
  const fromRelative = parseArgs([...REQUIRED_ARGS, "--native-go", relativePath]);
  assert.equal(fromAbsolute.nativeGo, absolute);
  assert.equal(fromRelative.nativeGo, absolute);
});

test("relative executable paths resolve from the invoking cwd before the child runs from ROOT", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "gobi-native-path-cwd-"));
  try {
    const executable = join(temporaryRoot, "toolchain", "go");
    const capturePath = join(temporaryRoot, "native-argv.json");
    mkdirSync(dirname(executable), { recursive: true });
    writeFileSync(executable, [
      "#!/usr/bin/env node",
      'import { writeFileSync } from "node:fs";',
      "writeFileSync(process.env.GOBI_NATIVE_ARGV_CAPTURE, JSON.stringify(process.argv.slice(2)));",
      'process.stdout.write(JSON.stringify({ schema: "gobi.compiled-lifecycle-native/v1", steps: [] }));',
      "",
    ].join("\n"), { mode: 0o755 });
    chmodSync(executable, 0o755);

    const moduleURL = pathToFileURL(resolve(ROOT, "compiled-lifecycle/conformance/run.mjs")).href;
    const fixturePath = resolve(ROOT, "fixtures/compiled/lifecycle/scenario.json");
    const calls = [
      { label: "CLI option", args: [...REQUIRED_ARGS, "--native-go", "./toolchain/go"], env: {} },
      { label: "GOBI_GO_BIN default", args: REQUIRED_ARGS, env: { GOBI_GO_BIN: "./toolchain/go" } },
    ];

    for (const call of calls) {
      const childSource = [
        `import { parseArgs, runNative } from ${JSON.stringify(moduleURL)};`,
        `const args = parseArgs(${JSON.stringify([...call.args, "--fixture", fixturePath])});`,
        "const replay = runNative(args.nativeGo, args.fixture);",
        "process.stdout.write(JSON.stringify({ nativeGo: args.nativeGo, command: replay.command, value: replay.value }));",
      ].join("\n");
      const child = spawnSync(process.execPath, ["--input-type=module", "-e", childSource], {
        cwd: temporaryRoot,
        env: {
          ...process.env,
          ...call.env,
          GOBI_NATIVE_ARGV_CAPTURE: capturePath,
        },
        encoding: "utf8",
      });
      assert.equal(child.status, 0, `${call.label}: ${child.stderr}`);
      const result = JSON.parse(child.stdout);
      assert.equal(result.nativeGo, executable, `${call.label} resolved relative to the caller cwd`);
      assert.equal(result.command[0], executable, `${call.label} passed the resolved path to spawnSync`);
      assert.equal(result.value.schema, "gobi.compiled-lifecycle-native/v1");
      assert.deepEqual(JSON.parse(readFileSync(capturePath, "utf8")), [
        "run", "./cmd/compiled-lifecycle-native", "--script", fixturePath,
      ]);
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("GOBI_GO_BIN remains the unflagged default while bare names stay on PATH", () => {
  const absolute = goOnPath();
  assert.equal(parseInChild({ nativeGo: undefined }), "go");
  assert.equal(parseInChild({ nativeGo: "go" }), "go");
  assert.equal(parseInChild({ nativeGo: absolute }), absolute);
});
