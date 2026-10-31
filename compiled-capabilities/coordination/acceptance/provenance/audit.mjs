#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, readdir, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const BASE_COMMIT = "00da54ad0f5a4006b13a5cded18ce291845978bc";
export const GENERATED_M0_PATH = "react-map.gen.mjs";
const AUDIT_SCHEMA = "gobi.source-provenance-audit/v1";
const BINDING_SCHEMA = "gobi.source-publication-binding/v1";
const EXECUTION_SCHEMA = "gobi.compiled-capabilities-execution/v1";
const MAX_BUFFER = 512 * 1024 * 1024;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stableJSON = (value) => JSON.stringify(canonicalize(value));

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function safeRepoPath(path) {
  if (typeof path !== "string" || !path || path.includes("\\") || path.startsWith("/")) return false;
  const parts = path.split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..");
}

export function normalizePins(rows, label = "source pins") {
  if (!Array.isArray(rows)) throw new Error(`${label} must be an array`);
  const seen = new Set();
  const normalized = [];
  for (const row of rows) {
    if (!row || !safeRepoPath(row.path) || !Number.isSafeInteger(row.bytes) || row.bytes < 0 ||
        typeof row.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(row.sha256)) {
      throw new Error(`${label} contains an invalid path/bytes/SHA-256 row`);
    }
    if (seen.has(row.path)) throw new Error(`${label} repeats ${row.path}`);
    seen.add(row.path);
    normalized.push({ path: row.path, bytes: row.bytes, sha256: row.sha256.toLowerCase() });
  }
  return normalized.sort((left, right) => left.path.localeCompare(right.path));
}

export function pinsMatch(left, right) {
  return stableJSON(normalizePins(left, "left pins")) === stableJSON(normalizePins(right, "right pins"));
}

export function parseSha256Sums(text) {
  if (typeof text !== "string") throw new Error("SHA256SUMS must be text");
  const rows = [];
  const seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (!match) throw new Error(`SHA256SUMS has an invalid row: ${line}`);
    const path = match[2].trim();
    if (!safeRepoPath(path)) throw new Error(`SHA256SUMS has an unsafe path: ${path}`);
    if (seen.has(path)) throw new Error(`SHA256SUMS repeats ${path}`);
    seen.add(path);
    rows.push({ path, sha256: match[1].toLowerCase() });
  }
  return rows;
}

export function validateBindingEnvelope(binding, { sourceCommit, expectedTree, baseCommit = BASE_COMMIT }) {
  const errors = [];
  if (!binding || binding.schema !== BINDING_SCHEMA) errors.push(`binding.schema must be ${BINDING_SCHEMA}`);
  const oid = (value) => typeof value === "string" && /^[a-f0-9]{40,64}$/i.test(value);
  const side = (name) => {
    const value = binding?.[name];
    if (!value || !oid(value.commit) || !oid(value.tree) || !Array.isArray(value.parents) || value.parents.some((parent) => !oid(parent))) {
      errors.push(`binding.${name} must contain a commit, tree, and parents array`);
      return null;
    }
    return { commit: value.commit.toLowerCase(), tree: value.tree.toLowerCase(), parents: value.parents.map((parent) => parent.toLowerCase()) };
  };
  const base = binding?.base;
  if (!base || !oid(base.commit) || !oid(base.tree)) errors.push("binding.base must contain a commit and tree");
  const local = side("local");
  const remote = side("remote");
  if (base && oid(base.commit) && base.commit.toLowerCase() !== baseCommit.toLowerCase()) errors.push("binding.base.commit differs from the required base commit");
  if (local && remote) {
    if (local.tree !== remote.tree) errors.push("local and remote source trees differ");
    if (stableJSON(local.parents) !== stableJSON(remote.parents)) errors.push("local and remote direct-parent lists differ");
    if (local.parents.length === 0) errors.push("local source commit must have at least one direct parent");
    if (remote.parents.length === 0) errors.push("remote source commit must have at least one direct parent");
    if (sourceCommit && local.commit !== sourceCommit.toLowerCase()) errors.push("binding.local.commit differs from --source-commit");
    if (expectedTree && local.tree !== expectedTree.toLowerCase()) errors.push("binding.local.tree differs from --expected-tree");
  }
  return { errors, base, local, remote };
}

export function missingExecutionInputs(receipt) {
  const missing = [];
  if (!receipt || receipt.schema !== EXECUTION_SCHEMA) missing.push(`receipt schema ${EXECUTION_SCHEMA}`);
  if (receipt?.job_id !== "E-BUILD" || receipt?.worker !== "N6") missing.push("E-BUILD/N6 execution receipt identity");
  if (receipt?.mode !== "full") missing.push("mode=full");
  if (receipt?.status !== "passed") missing.push("completed full-run status=passed");
  if (!Array.isArray(receipt?.sourceBefore)) missing.push("sourceBefore pins");
  if (!Array.isArray(receipt?.sourceAfter)) missing.push("sourceAfter pins");
  if (receipt?.sourcePinsMatch === undefined) missing.push("sourcePinsMatch=true");
  if (!Array.isArray(receipt?.failures)) missing.push("full-run failure ledger");
  return missing;
}

function parseArgs(argv) {
  const values = new Map();
  const errors = [];
  const known = new Set(["--repo-root", "--receipt", "--source-commit", "--expected-tree", "--binding", "--base-commit"]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--help" || key === "-h") return { help: true, values, errors };
    if (!known.has(key)) {
      errors.push(`unknown argument ${key}`);
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      errors.push(`${key} requires a value`);
      continue;
    }
    if (values.has(key)) errors.push(`${key} was provided more than once`);
    values.set(key, value);
    index += 1;
  }
  return { help: false, values, errors };
}

function incompleteReport(missing, options = {}) {
  return {
    schema: AUDIT_SCHEMA,
    status: "incomplete",
    finalAcceptance: false,
    missingInputs: [...new Set(missing)].sort(),
    failures: options.failures ?? [],
    checks: options.checks ?? [],
    ...(options.context ? { context: options.context } : {}),
  };
}

function git(repoRoot, args, { allowFailure = false } = {}) {
  const child = spawnSync("git", args, { cwd: repoRoot, encoding: null, maxBuffer: MAX_BUFFER });
  if (child.error || (child.status !== 0 && !allowFailure)) {
    const detail = child.error?.message ?? child.stderr?.toString("utf8").trim() ?? `exit ${child.status}`;
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
  return { status: child.status, stdout: Buffer.from(child.stdout ?? []), stderr: Buffer.from(child.stderr ?? []) };
}

function gitText(repoRoot, args) {
  return git(repoRoot, args).stdout.toString("utf8").trim();
}

function gitBlob(repoRoot, commit, path) {
  if (!safeRepoPath(path)) throw new Error(`unsafe Git blob path ${path}`);
  return git(repoRoot, ["cat-file", "blob", `${commit}:${path}`]).stdout;
}

function gitTree(repoRoot, commit) {
  const raw = git(repoRoot, ["ls-tree", "-rz", "--full-tree", "-r", commit]).stdout;
  const entries = new Map();
  for (const record of raw.toString("utf8").split("\0")) {
    if (!record) continue;
    const match = record.match(/^([0-7]{6}) (blob|tree|commit) ([a-f0-9]{40,64})\t(.*)$/i);
    if (!match) throw new Error(`could not parse git ls-tree row ${JSON.stringify(record)}`);
    entries.set(match[4], { mode: match[1], type: match[2], oid: match[3] });
  }
  return entries;
}

function gitCommitInfo(repoRoot, commit) {
  const resolved = gitText(repoRoot, ["rev-parse", "--verify", `${commit}^{commit}`]).toLowerCase();
  const tree = gitText(repoRoot, ["rev-parse", "--verify", `${resolved}^{tree}`]).toLowerCase();
  const parentLine = gitText(repoRoot, ["rev-list", "--parents", "-n", "1", resolved]).split(/\s+/);
  return { commit: resolved, tree, parents: parentLine.slice(1).map((parent) => parent.toLowerCase()) };
}

function gitIsAncestor(repoRoot, ancestor, descendant) {
  const result = git(repoRoot, ["merge-base", "--is-ancestor", ancestor, descendant], { allowFailure: true });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git merge-base --is-ancestor ${ancestor} ${descendant} failed: ${result.stderr.toString("utf8").trim()}`);
  }
  return result.status === 0;
}

export function extractStringArray(source, name, setWrapper = false) {
  const wrapper = setWrapper ? "new\\s+Set\\s*\\(\\s*" : "";
  const declaration = new RegExp(`(?:^|\\n)const\\s+${name}\\s*=\\s*${wrapper}\\[`);
  const match = declaration.exec(source);
  if (!match) throw new Error(`compiled-capabilities/run.mjs does not declare ${name} as a ${setWrapper ? "Set-wrapped " : ""}string array`);

  const open = match.index + match[0].lastIndexOf("[");
  let quote = false;
  let escaped = false;
  let close = -1;
  for (let index = open + 1; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quote = false;
      continue;
    }
    if (character === '"') quote = true;
    else if (character === "[") throw new Error(`${name} declaration contains a nested array`);
    else if (character === "]") {
      close = index;
      break;
    }
  }
  if (close < 0 || quote) throw new Error(`${name} declaration is unterminated`);

  const body = source.slice(open + 1, close);
  const literals = [];
  let cursor = 0;
  let expectValue = true;
  while (cursor < body.length) {
    while (/\s/.test(body[cursor] ?? "")) cursor += 1;
    if (cursor >= body.length) break;
    if (body[cursor] === ",") {
      if (expectValue) throw new Error(`${name} declaration contains an empty array element`);
      cursor += 1;
      expectValue = true;
      while (/\s/.test(body[cursor] ?? "")) cursor += 1;
      if (cursor >= body.length) break;
      continue;
    }
    if (!expectValue) throw new Error(`${name} declaration is missing a comma between values`);
    if (body[cursor] !== '"') throw new Error(`${name} declaration contains non-string syntax`);
    const start = cursor++;
    let stringEscape = false;
    while (cursor < body.length) {
      const character = body[cursor++];
      if (stringEscape) stringEscape = false;
      else if (character === "\\") stringEscape = true;
      else if (character === '"') break;
    }
    let value;
    try {
      value = JSON.parse(body.slice(start, cursor));
    } catch {
      throw new Error(`${name} declaration contains an invalid string literal`);
    }
    if (typeof value !== "string") throw new Error(`${name} declaration contains a non-string value`);
    literals.push(value);
    expectValue = false;
  }

  let suffix = source.slice(close + 1).trimStart();
  if (setWrapper) {
    if (!suffix.startsWith(")")) throw new Error(`${name} Set wrapper is unterminated`);
    suffix = suffix.slice(1).trimStart();
  }
  if (!suffix.startsWith(";")) throw new Error(`${name} declaration must end with a semicolon`);
  return literals;
}

function isSourceFileEntry(entry) {
  return entry && entry.type === "blob" && (entry.mode === "100644" || entry.mode === "100755");
}

function sourceWalkPath(path, roots, ignoredDirectories) {
  const root = roots.find((candidate) => path.startsWith(`${candidate}/`));
  if (!root) return false;
  const rest = path.slice(root.length + 1);
  if (rest.split("/").some((part) => ignoredDirectories.has(part))) return false;
  return !/\.(?:log|png)$/i.test(path);
}

function expectedGitSourcePaths(tree, { sourceDirectories, sourceFiles, ignoredDirectories, sums }) {
  const paths = new Set();
  for (const path of sourceFiles) {
    if (!safeRepoPath(path)) throw new Error(`run.mjs lists unsafe source file ${path}`);
    const entry = tree.get(path);
    // The runner stats these candidates and skips ENOENT. The root go.sum is
    // intentionally absent in this repository; keep that one documented
    // optional input aligned with the actual pinning behavior.
    if (!entry && path === "go.sum") continue;
    if (!isSourceFileEntry(entry)) throw new Error(`required source file is absent or not a regular Git blob: ${path}`);
    paths.add(path);
  }
  for (const path of tree.keys()) {
    if (sourceWalkPath(path, sourceDirectories, new Set(ignoredDirectories))) {
      if (isSourceFileEntry(tree.get(path))) paths.add(path);
    }
  }
  for (const row of sums) paths.add(row.path);
  return [...paths].sort((left, right) => left.localeCompare(right));
}

async function expectedWorktreeSourcePaths(repoRoot, { sourceDirectories, sourceFiles, ignoredDirectories, sums }) {
  const paths = new Set();
  for (const path of sourceFiles) {
    const full = resolveRepoFile(repoRoot, path);
    try {
      if ((await stat(full)).isFile()) paths.add(path);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const ignored = new Set(ignoredDirectories);
  const visit = async (directory, prefix) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (ignored.has(entry.name)) continue;
      const relPath = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await visit(join(directory, entry.name), relPath);
      else if (entry.isFile() && !/\.(?:log|png)$/i.test(entry.name)) paths.add(relPath);
    }
  };
  for (const directory of sourceDirectories) await visit(resolveRepoFile(repoRoot, directory), directory);
  for (const row of sums) {
    try {
      if ((await lstat(resolveRepoFile(repoRoot, row.path))).isFile()) paths.add(row.path);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return [...paths].sort((left, right) => left.localeCompare(right));
}

function resolveRepoFile(repoRoot, path) {
  if (!safeRepoPath(path)) throw new Error(`unsafe repository path ${path}`);
  const full = resolve(repoRoot, ...path.split("/"));
  const rel = relative(repoRoot, full);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`repository path escapes root: ${path}`);
  return full;
}

async function verifyM0(repoRoot, baseCommit, sourceCommit, baseTree, sourceTree, sourcePinMap) {
  const failures = [];
  const checks = [];
  const baseSums = gitBlob(repoRoot, baseCommit, "SHA256SUMS");
  const sourceSums = gitBlob(repoRoot, sourceCommit, "SHA256SUMS");
  const workSums = await readFile(resolveRepoFile(repoRoot, "SHA256SUMS"));
  if (!baseSums.equals(sourceSums)) failures.push("SHA256SUMS bytes differ from the frozen base commit");
  if (!baseSums.equals(workSums)) failures.push("working SHA256SUMS bytes differ from the frozen base commit");
  const rows = parseSha256Sums(baseSums.toString("utf8"));
  if (rows.length !== 24) failures.push(`M0 manifest has ${rows.length} rows; expected 24`);
  const generated = rows.filter((row) => row.path === GENERATED_M0_PATH);
  const trackedRows = rows.filter((row) => row.path !== GENERATED_M0_PATH);
  if (generated.length !== 1) failures.push(`M0 manifest must list exactly one generated ${GENERATED_M0_PATH}`);
  if (trackedRows.length !== 23) failures.push(`M0 manifest has ${trackedRows.length} tracked inputs; expected 23`);
  if (!trackedRows.some((row) => row.path === "EXPECTED.json")) failures.push("EXPECTED.json is not part of the original M0 manifest");
  for (const row of rows) {
    const baseEntry = baseTree.get(row.path);
    const sourceEntry = sourceTree.get(row.path);
    if (row.path === GENERATED_M0_PATH) {
      if (baseEntry || sourceEntry) failures.push(`${GENERATED_M0_PATH} must remain generated and untracked in base/source commits`);
      try {
        const bytes = await readFile(resolveRepoFile(repoRoot, row.path));
        if (bytes.length !== (sourcePinMap.get(row.path)?.bytes ?? bytes.length) || hash(bytes) !== row.sha256) {
          failures.push(`${row.path} working bytes do not match the SHA256SUMS pin`);
        }
        const pin = sourcePinMap.get(row.path);
        if (pin && (pin.sha256 !== row.sha256 || pin.bytes !== bytes.length)) failures.push(`${row.path} source pin differs from signed generated bytes`);
      } catch (error) {
        failures.push(`${row.path} generated source is unavailable: ${error.message}`);
      }
      continue;
    }
    if (!isSourceFileEntry(baseEntry)) failures.push(`${row.path} is not a tracked regular blob at the frozen base`);
    if (!isSourceFileEntry(sourceEntry)) failures.push(`${row.path} is not a tracked regular blob at the source commit`);
    try {
      const baseBytes = gitBlob(repoRoot, baseCommit, row.path);
      const sourceBytes = gitBlob(repoRoot, sourceCommit, row.path);
      const workBytes = await readFile(resolveRepoFile(repoRoot, row.path));
      if (hash(baseBytes) !== row.sha256 || hash(sourceBytes) !== row.sha256 || !baseBytes.equals(sourceBytes)) {
        failures.push(`${row.path} Git blob bytes changed from the signed M0 bytes`);
      }
      if (hash(workBytes) !== row.sha256 || !workBytes.equals(baseBytes)) failures.push(`${row.path} working bytes changed from the signed M0 bytes`);
      const pin = sourcePinMap.get(row.path);
      if (sourcePinMap.size && (!pin || pin.sha256 !== row.sha256 || pin.bytes !== workBytes.length)) {
        failures.push(`${row.path} is missing or differs in the E-BUILD source pins`);
      }
    } catch (error) {
      failures.push(`${row.path} M0 verification failed: ${error.message}`);
    }
  }
  const expectedBytes = gitBlob(repoRoot, baseCommit, "EXPECTED.json");
  const currentExpected = await readFile(resolveRepoFile(repoRoot, "EXPECTED.json"));
  const sourceExpected = gitBlob(repoRoot, sourceCommit, "EXPECTED.json");
  if (!expectedBytes.equals(sourceExpected) || !expectedBytes.equals(currentExpected)) {
    failures.push("EXPECTED.json original bytes differ from base 00da54…");
  } else {
    checks.push("EXPECTED.json original base bytes are unchanged in source commit and working tree");
  }
  if (failures.length === 0) checks.push("23 tracked M0 inputs and the signed generated map match the original 24-row SHA256SUMS manifest");
  return { checks, failures, rows: rows.length, tracked: trackedRows.length, generated: generated[0] ?? null };
}

async function verifySourcePins(repoRoot, receipt, sourceCommit, remoteCommit, commitTree) {
  const failures = [];
  const checks = [];
  const before = normalizePins(receipt.sourceBefore, "sourceBefore");
  const after = normalizePins(receipt.sourceAfter, "sourceAfter");
  if (!pinsMatch(before, after)) failures.push("sourceAfter differs from sourceBefore");
  if (receipt.sourcePinsMatch !== true) failures.push("E-BUILD sourcePinsMatch is not true");

  const sourceRun = gitBlob(repoRoot, sourceCommit, "compiled-capabilities/run.mjs").toString("utf8");
  const sourceFiles = extractStringArray(sourceRun, "sourceFiles");
  const sourceDirectories = extractStringArray(sourceRun, "sourceDirectories");
  const ignoredDirectories = extractStringArray(sourceRun, "ignoredSourceDirectories", true);
  const sumRows = parseSha256Sums(gitBlob(repoRoot, sourceCommit, "SHA256SUMS").toString("utf8"));
  const remoteTree = remoteCommit ? gitTree(repoRoot, remoteCommit) : null;
  const expectedFromCommit = expectedGitSourcePaths(commitTree, { sourceDirectories, sourceFiles, ignoredDirectories, sums: sumRows });
  const actualPaths = before.map((row) => row.path).sort((left, right) => left.localeCompare(right));
  if (stableJSON(actualPaths) !== stableJSON(expectedFromCommit)) failures.push("sourceBefore path set does not exactly cover the source set declared by the pinned runner");
  const expectedFromWorktree = await expectedWorktreeSourcePaths(repoRoot, { sourceDirectories, sourceFiles, ignoredDirectories, sums: sumRows });
  if (stableJSON(actualPaths) !== stableJSON(expectedFromWorktree)) failures.push("sourceBefore path set differs from the current working source set");
  const tree = commitTree;
  const pinMap = new Map(before.map((row) => [row.path, row]));
  const signedM0 = new Map(sumRows.map((row) => [row.path, row.sha256]));
  for (const pin of before) {
    try {
      const bytes = await readFile(resolveRepoFile(repoRoot, pin.path));
      if (bytes.length !== pin.bytes || hash(bytes) !== pin.sha256) failures.push(`${pin.path} working bytes differ from sourceBefore`);
      if (pin.path === GENERATED_M0_PATH) {
        if (signedM0.get(pin.path) !== pin.sha256) failures.push(`${pin.path} does not match the signed SHA256SUMS generated-file exception`);
        if (tree.has(pin.path)) failures.push(`${pin.path} is generated but appears in the source Git tree`);
        if (remoteTree?.has(pin.path)) failures.push(`${pin.path} is generated but appears in the published Git tree`);
        continue;
      }
      const sourceEntry = tree.get(pin.path);
      if (!isSourceFileEntry(sourceEntry)) failures.push(`${pin.path} is absent or not a regular blob in the source Git tree`);
      const sourceBytes = gitBlob(repoRoot, sourceCommit, pin.path);
      if (sourceBytes.length !== pin.bytes || hash(sourceBytes) !== pin.sha256) failures.push(`${pin.path} differs from sourceCommit Git blob bytes`);
      if (remoteCommit) {
        const remoteBytes = gitBlob(repoRoot, remoteCommit, pin.path);
        if (remoteBytes.length !== pin.bytes || hash(remoteBytes) !== pin.sha256 || !remoteBytes.equals(sourceBytes)) {
          failures.push(`${pin.path} differs from published remote Git blob bytes`);
        }
      }
    } catch (error) {
      failures.push(`${pin.path} source verification failed: ${error.message}`);
    }
  }
  if (failures.length === 0) {
    const gitTargets = remoteCommit ? "local and published Git blobs" : "local Git blobs";
    checks.push(`sourceBefore/sourceAfter contain ${before.length} exact pins; every working input matches ${gitTargets} or the signed generated-map exception`);
  }
  return { checks, failures, pinCount: before.length, pins: before, pinMap, sumRows };
}

export async function auditProvenance(options) {
  const missing = [];
  const failures = [];
  const checks = [];
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const sourceCommit = options.sourceCommit?.toLowerCase();
  const expectedTree = options.expectedTree?.toLowerCase();
  const baseCommit = (options.baseCommit ?? BASE_COMMIT).toLowerCase();
  if (!options.receiptPath) missing.push("--receipt");
  if (!sourceCommit) missing.push("--source-commit");
  if (!expectedTree) missing.push("--expected-tree");
  if (!options.bindingPath) missing.push("--binding");
  if (baseCommit !== BASE_COMMIT) failures.push(`--base-commit must remain ${BASE_COMMIT}`);
  if (failures.length) return {
    ...incompleteReport(missing, { failures, checks, context: { repoRoot, sourceCommit: sourceCommit ?? null, expectedTree: expectedTree ?? null } }),
    status: "failed",
  };

  let receipt;
  if (options.receiptPath) {
    try {
      receipt = JSON.parse((await readFile(resolveRepoFile(repoRoot, options.receiptPath))).toString("utf8"));
    } catch (error) {
      if (error.code === "ENOENT") missing.push(`execution receipt ${options.receiptPath}`);
      else failures.push(`could not read execution receipt: ${error.message}`);
    }
  } else {
    missing.push("--receipt");
  }
  let binding;
  if (options.bindingPath) {
    try {
      binding = JSON.parse((await readFile(resolveRepoFile(repoRoot, options.bindingPath))).toString("utf8"));
    } catch (error) {
      if (error.code === "ENOENT") missing.push(`publication binding ${options.bindingPath}`);
      else failures.push(`could not read publication binding: ${error.message}`);
    }
  } else {
    missing.push("--binding");
  }
  if (receipt) {
    for (const item of missingExecutionInputs(receipt)) {
      missing.push(item);
    }
    if (receipt.status === "failed") failures.push("E-BUILD execution receipt status is failed");
    if (receipt.status && !["passed", "failed"].includes(receipt.status)) missing.push(`E-BUILD execution is unfinished (${receipt.status})`);
    if (Array.isArray(receipt.failures) && receipt.failures.length) failures.push(`E-BUILD recorded ${receipt.failures.length} failure(s)`);
    if (receipt.sourcePinsMatch === false) failures.push("E-BUILD sourcePinsMatch is explicitly false");
  }

  let bindingCheck = null;
  if (binding) {
    bindingCheck = validateBindingEnvelope(binding, { sourceCommit, expectedTree, baseCommit });
    failures.push(...bindingCheck.errors);
  }

  let sourceInfo;
  let remoteInfo;
  let baseInfo;
  let baseTree;
  let sourceTree;
  if (sourceCommit && expectedTree) {
    try {
      sourceInfo = gitCommitInfo(repoRoot, sourceCommit);
      remoteInfo = bindingCheck?.remote ? gitCommitInfo(repoRoot, bindingCheck.remote.commit) : null;
      baseInfo = gitCommitInfo(repoRoot, baseCommit);
      baseTree = gitTree(repoRoot, baseCommit);
      sourceTree = gitTree(repoRoot, sourceInfo.commit);
      const head = gitText(repoRoot, ["rev-parse", "--verify", "HEAD^{commit}"]).toLowerCase();
      if (head !== sourceInfo.commit) failures.push("--source-commit is not the currently tested HEAD");
      if (sourceInfo.tree !== expectedTree) failures.push("--expected-tree differs from source commit tree");
      if (bindingCheck?.local && sourceInfo.commit !== bindingCheck.local.commit) failures.push("actual local commit differs from publication binding");
      if (bindingCheck?.local && sourceInfo.tree !== bindingCheck.local.tree) failures.push("actual local commit tree differs from publication binding");
      if (remoteInfo && remoteInfo.commit !== bindingCheck?.remote?.commit) failures.push("actual remote commit differs from publication binding");
      if (remoteInfo && remoteInfo.tree !== bindingCheck?.remote?.tree) failures.push("actual remote commit tree differs from publication binding");
      if (baseInfo.commit !== baseCommit) failures.push("frozen base commit did not resolve exactly");
      if (bindingCheck?.base?.tree && baseInfo.tree !== bindingCheck.base.tree.toLowerCase()) failures.push("actual base tree differs from publication binding");
      if (bindingCheck?.local && stableJSON(sourceInfo.parents) !== stableJSON(bindingCheck.local.parents)) failures.push("actual local direct parents differ from publication binding");
      if (remoteInfo && stableJSON(remoteInfo.parents) !== stableJSON(bindingCheck.remote.parents)) failures.push("actual remote direct parents differ from publication binding");
      const localHasFrozenBase = gitIsAncestor(repoRoot, baseCommit, sourceInfo.commit);
      if (!localHasFrozenBase) failures.push("frozen base commit is not an ancestor of the local source commit");
      const remoteHasFrozenBase = remoteInfo ? gitIsAncestor(repoRoot, baseCommit, remoteInfo.commit) : true;
      if (!remoteHasFrozenBase) failures.push("frozen base commit is not an ancestor of the published remote source commit");
      if (remoteInfo && sourceInfo.tree !== remoteInfo.tree) failures.push("local and remote Git source trees differ");
      if (remoteInfo && bindingCheck?.local && bindingCheck?.remote) {
        checks.push(`source commit ${sourceInfo.commit} and published commit ${remoteInfo.commit} resolve to the bound tree; commit IDs may differ`);
        checks.push(`local and remote source commits have the same direct parent list (${sourceInfo.parents.join(",") || "none"})`);
      }
      if (localHasFrozenBase && remoteHasFrozenBase) {
        checks.push(`frozen base commit ${baseCommit} is an ancestor of the local${remoteInfo ? " and published remote" : ""} source commit`);
      }
    } catch (error) {
      missing.push(`Git source commit/tree objects: ${error.message}`);
    }
  } else {
    missing.push("local source commit and expected Git tree for provenance checks");
  }

  let sourcePinResult = null;
  let m0Result = null;
  if (sourceInfo && sourceTree) {
    try {
      if (receipt && Array.isArray(receipt.sourceBefore) && Array.isArray(receipt.sourceAfter)) {
        sourcePinResult = await verifySourcePins(repoRoot, receipt, sourceInfo.commit, remoteInfo.commit, sourceTree);
        checks.push(...sourcePinResult.checks);
        failures.push(...sourcePinResult.failures);
      }
      if (baseTree) {
        const pinMap = sourcePinResult?.pinMap ?? new Map();
        m0Result = await verifyM0(repoRoot, baseCommit, sourceInfo.commit, baseTree, sourceTree, pinMap);
        checks.push(...m0Result.checks);
        failures.push(...m0Result.failures);
      }
    } catch (error) {
      failures.push(`source pin/M0 verification failed: ${error.message}`);
    }
  }

  const uniqueMissing = [...new Set(missing)].sort();
  const uniqueFailures = [...new Set(failures)].sort();
  const status = uniqueFailures.length ? "failed" : uniqueMissing.length ? "incomplete" : "passed";
  return {
    schema: AUDIT_SCHEMA,
    status,
    finalAcceptance: status === "passed",
    missingInputs: uniqueMissing,
    failures: uniqueFailures,
    checks,
    context: {
      receiptPath: options.receiptPath,
      sourceCommit: sourceInfo?.commit ?? sourceCommit,
      expectedTree,
      publishedCommit: remoteInfo?.commit ?? bindingCheck?.remote?.commit ?? null,
      baseCommit,
      sourcePinCount: sourcePinResult?.pinCount ?? null,
      m0: m0Result ? { rows: m0Result.rows, tracked: m0Result.tracked, generated: m0Result.generated } : null,
    },
  };
}

function printHelp() {
  process.stdout.write([
    "Read-only E-BUILD source provenance auditor",
    "",
    "Usage:",
    "  node audit.mjs --receipt <E-BUILD.json> --source-commit <local-commit> --expected-tree <tree> --binding <publication-binding.json> [--repo-root <path>] [--base-commit <base> ]",
    "",
    "A missing receipt, source commit, expected tree, publication binding, or full-run source pins yields status=incomplete and finalAcceptance=false.",
    `The required M0 base is ${BASE_COMMIT}. No Git refs, commits, indexes, or working files are changed.`,
  ].join("\n") + "\n");
}

async function main(argv) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    printHelp();
    return 0;
  }
  if (parsed.errors.length) {
    const report = { ...incompleteReport([], { failures: parsed.errors }), status: "failed" };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 1;
  }
  const values = parsed.values;
  const repoRoot = resolve(values.get("--repo-root") ?? process.cwd());
  const report = await auditProvenance({
    repoRoot,
    receiptPath: values.get("--receipt"),
    sourceCommit: values.get("--source-commit"),
    expectedTree: values.get("--expected-tree"),
    bindingPath: values.get("--binding"),
    baseCommit: values.get("--base-commit") ?? BASE_COMMIT,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "passed" ? 0 : report.status === "failed" ? 1 : 2;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
