#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSnapshotAgainstManifest } from "./protocol.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

function nativeCommand() {
  const explicitCLI = process.env.RENDER_CONTRACT_BIN;
  const builtCLI = resolve(HERE, "build/render-contract");
  if (explicitCLI) {
    if (!existsSync(explicitCLI)) throw new Error(`RENDER_CONTRACT_BIN does not exist: ${explicitCLI}`);
    return { file: explicitCLI, args: ["validate"] };
  }
  if (existsSync(builtCLI)) return { file: builtCLI, args: ["validate"] };

  const go = process.env.GO_BIN || "go";
  return { file: go, args: ["run", "./cmd/render-contract", "validate"] };
}

function nativeValidate(raw, fixture, command = nativeCommand()) {
  const result = spawnSync(command.file, command.args, {
    cwd: REPO_ROOT,
    input: raw,
    encoding: "utf8",
    env: { ...process.env, GOTOOLCHAIN: process.env.GOTOOLCHAIN ?? "local" },
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`native CLI could not validate fixture ${JSON.stringify(fixture.name)}: ${result.error.message}`);
  }
  let payload;
  try { payload = JSON.parse(result.stdout.trim()); }
  catch (error) {
    throw new Error(`native CLI returned invalid JSON for fixture ${JSON.stringify(fixture.name)}: ${result.stdout}`, { cause: error });
  }
  if (typeof payload?.valid !== "boolean") {
    throw new Error(`native CLI omitted its valid result for fixture ${JSON.stringify(fixture.name)}`);
  }
  if (result.status === 0 && payload.valid !== true) {
    throw new Error(`native CLI exited successfully while rejecting fixture ${JSON.stringify(fixture.name)}`);
  }
  if (result.status !== 0 && payload.valid === true) {
    throw new Error(`native CLI exited ${result.status} while accepting fixture ${JSON.stringify(fixture.name)}`);
  }
  return payload.valid;
}

function browserObjectValidate(snapshot, manifest) {
  validateSnapshotAgainstManifest(snapshot, manifest);
  return true;
}

/** Compare every fixture with native Go parsing and, when representable, JS object admission. */
export async function compareFixtureAdmissions(bundle, {
  nativeValidate: validateNative = nativeValidate,
  javascriptValidate = browserObjectValidate,
} = {}) {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle) ||
      !bundle.manifest || typeof bundle.manifest !== "object" || !Array.isArray(bundle.fixtures)) {
    throw new TypeError("fixture bundle must contain a Go-generated manifest and fixtures array");
  }

  let nativeChecked = 0;
  let javascriptCompared = 0;
  let rawJsonOnly = 0;
  let accepted = 0;
  let rejected = 0;
  const categories = {};

  for (const fixture of bundle.fixtures) {
    if (!fixture || typeof fixture !== "object" || Array.isArray(fixture) ||
        typeof fixture.name !== "string" || typeof fixture.raw !== "string" ||
        typeof fixture.expectedValid !== "boolean") {
      throw new TypeError("each fixture must include name, raw JSON text, and expectedValid");
    }
    if (fixture.admission !== "snapshot" && fixture.admission !== "raw-json-only") {
      throw new TypeError(`fixture ${JSON.stringify(fixture.name)} has unknown admission mode ${JSON.stringify(fixture.admission)}`);
    }
    if (fixture.admission === "raw-json-only" && fixture.expectedValid) {
      throw new Error(`raw JSON-only fixture ${JSON.stringify(fixture.name)} cannot be marked valid`);
    }

    const nativeValid = await validateNative(fixture.raw, fixture);
    nativeChecked += 1;
    if (typeof nativeValid !== "boolean") {
      throw new TypeError(`native admission for fixture ${JSON.stringify(fixture.name)} must return a boolean`);
    }
    if (nativeValid !== fixture.expectedValid) {
      throw new Error(`native admission disagrees with fixture ${JSON.stringify(fixture.name)}: expected ${fixture.expectedValid}, got ${nativeValid}`);
    }

    if (fixture.admission === "raw-json-only") {
      rawJsonOnly += 1;
    } else {
      let snapshot;
      try { snapshot = JSON.parse(fixture.raw); }
      catch (error) {
        throw new Error(`snapshot fixture ${JSON.stringify(fixture.name)} is not a browser object; classify it raw-json-only`, { cause: error });
      }
      let javascriptValid = true;
      try { javascriptValidate(snapshot, bundle.manifest); }
      catch { javascriptValid = false; }
      javascriptCompared += 1;
      if (javascriptValid !== fixture.expectedValid) {
        throw new Error(`JavaScript admission disagrees with fixture ${JSON.stringify(fixture.name)}: expected ${fixture.expectedValid}, got ${javascriptValid}`);
      }
      if (nativeValid !== javascriptValid) {
        throw new Error(`native and JavaScript admission disagree for fixture ${JSON.stringify(fixture.name)}`);
      }
    }

    if (fixture.expectedValid) accepted += 1;
    else rejected += 1;
    categories[fixture.category ?? "uncategorized"] ??= { accepted: 0, rejected: 0, rawJsonOnly: 0 };
    categories[fixture.category ?? "uncategorized"][fixture.expectedValid ? "accepted" : "rejected"] += 1;
    if (fixture.admission === "raw-json-only") categories[fixture.category ?? "uncategorized"].rawJsonOnly += 1;
  }

  return { nativeChecked, javascriptCompared, rawJsonOnly, accepted, rejected, categories };
}

export function loadFixtureBundle(path = resolve(HERE, "build/fixtures.json")) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export async function runFixtureCheck(path = resolve(HERE, "build/fixtures.json")) {
  const bundle = loadFixtureBundle(path);
  return compareFixtureAdmissions(bundle);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3) throw new Error("usage: fixture-check.mjs [fixtures.json]");
    const file = process.argv[2] ? resolve(process.argv[2]) : undefined;
    const summary = await runFixtureCheck(file);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
