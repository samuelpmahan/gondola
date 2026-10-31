import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  BASE_COMMIT,
  auditProvenance,
  extractStringArray,
  normalizePins,
  pinsMatch,
  safeRepoPath,
  validateBindingEnvelope,
} from "./audit.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const node = process.execPath;
const auditPath = resolve(here, "audit.mjs");
const git = (args, options = {}) => spawnSync("git", args, {
  cwd: options.cwd ?? repoRoot,
  env: options.env ?? process.env,
  encoding: options.encoding === undefined ? "utf8" : options.encoding,
  maxBuffer: 512 * 1024 * 1024,
  ...(options.input !== undefined ? { input: options.input } : {}),
});
const headCommit = () => {
  const result = git(["rev-parse", "--verify", "HEAD^{commit}"]);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const treeOf = (commit) => {
  const result = git(["rev-parse", "--verify", `${commit}^{tree}`]);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};

test("source pin paths are safe, unique, and compared independent of row order", () => {
  assert.equal(safeRepoPath("compilercontract/capabilities.go"), true);
  assert.equal(safeRepoPath("../outside"), false);
  assert.equal(safeRepoPath("a//b"), false);
  const first = [
    { path: "b", bytes: 1, sha256: "b".repeat(64) },
    { path: "a", bytes: 0, sha256: "a".repeat(64) },
  ];
  assert.deepEqual(normalizePins(first).map((row) => row.path), ["a", "b"]);
  assert.equal(pinsMatch(first, [...first].reverse()), true);
  assert.throws(() => normalizePins([first[0], first[0]]), /repeats b/);
  assert.equal(pinsMatch(first, [{ ...first[0], bytes: 2 }, first[1]]), false);
});

test("source array parser handles Set wrappers and rejects elisions or non-string syntax", () => {
  assert.deepEqual(extractStringArray('const values = new Set([\n  "a]b",\n  "c\\\"d",\n]);', "values", true), ["a]b", 'c"d']);
  assert.deepEqual(extractStringArray('// const values = ["decoy"];\nconst values = ["actual"];', "values"), ["actual"]);
  assert.throws(() => extractStringArray('const values = ["a",, "b"];', "values"), /empty array element/);
  assert.throws(() => extractStringArray('const values = [dynamicValue];', "values"), /non-string syntax/);
});

test("publication binding keeps tree and ordered parents equal across distinct commits", () => {
  const binding = {
    schema: "gobi.source-publication-binding/v1",
    base: { commit: BASE_COMMIT, tree: "c".repeat(40) },
    local: { commit: "a".repeat(40), tree: "d".repeat(40), parents: [BASE_COMMIT] },
    remote: { commit: "b".repeat(40), tree: "d".repeat(40), parents: [BASE_COMMIT] },
  };
  assert.deepEqual(validateBindingEnvelope(binding, {
    sourceCommit: binding.local.commit,
    expectedTree: binding.local.tree,
  }).errors, []);
  const changed = structuredClone(binding);
  changed.remote.parents = ["e".repeat(40)];
  assert.match(validateBindingEnvelope(changed, {}).errors.join(" "), /direct-parent lists differ/);
});

test("publication binding also permits local and remote to name the same commit", () => {
  const binding = {
    schema: "gobi.source-publication-binding/v1",
    base: { commit: BASE_COMMIT, tree: "c".repeat(40) },
    local: { commit: "a".repeat(40), tree: "d".repeat(40), parents: ["b".repeat(40)] },
    remote: { commit: "a".repeat(40), tree: "d".repeat(40), parents: ["b".repeat(40)] },
  };
  assert.deepEqual(validateBindingEnvelope(binding, {
    sourceCommit: binding.local.commit,
    expectedTree: binding.local.tree,
  }).errors, []);
});

test("publication binding permits a follow-up commit directly parented by the prior published source", () => {
  const publishedSource = "a2e1164d68abaaa7d028bdaf6a20bea842a131ae";
  const binding = {
    schema: "gobi.source-publication-binding/v1",
    base: { commit: BASE_COMMIT, tree: "c".repeat(40) },
    local: { commit: "a".repeat(40), tree: "d".repeat(40), parents: [publishedSource] },
    remote: { commit: "b".repeat(40), tree: "d".repeat(40), parents: [publishedSource] },
  };
  assert.deepEqual(validateBindingEnvelope(binding, {
    sourceCommit: binding.local.commit,
    expectedTree: binding.local.tree,
  }).errors, []);
  const unordered = structuredClone(binding);
  unordered.local.parents = [publishedSource, "e".repeat(40)];
  unordered.remote.parents = ["e".repeat(40), publishedSource];
  assert.match(validateBindingEnvelope(unordered, {}).errors.join(" "), /direct-parent lists differ/);
});

test("auditor keeps missing publication and full-run evidence incomplete", async () => {
  const sourceCommit = headCommit();
  const sourceTree = treeOf(sourceCommit);
  const receiptPath = "compiled-capabilities/coordination/acceptance/provenance/fixtures/missing-full-run.json";
  const result = spawnSync(node, [
    auditPath,
    "--repo-root", repoRoot,
    "--receipt", receiptPath,
    "--source-commit", sourceCommit,
    "--expected-tree", sourceTree,
  ], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(result.status, 2, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "incomplete");
  assert.equal(report.finalAcceptance, false);
  assert(report.missingInputs.includes("--binding"));
  assert(report.missingInputs.includes("mode=full"));
  assert(report.missingInputs.includes("sourceBefore pins"));
  assert.deepEqual(report.context.m0, {
    rows: 24,
    tracked: 23,
    generated: { path: "react-map.gen.mjs", sha256: "9cb7fa3ff84042c36b9ac211dfe2b97a69169e4fb880283e8f000495a8216a54" },
  });
});

test("actual full-run source and 161 pins audit through Set arrays and a follow-up publication commit", async () => {
  const sourceCommit = "031c462bcd72c0ae0bee2dc05a0972b3902ca40c";
  const publishedCommit = "a2e1164d68abaaa7d028bdaf6a20bea842a131ae";
  const sourceTree = treeOf(sourceCommit);
  const receiptFixturePath = resolve(here, "fixtures/e-build-031c-161-pins.json");
  const receiptBytes = await readFile(receiptFixturePath);
  assert.equal(createHash("sha256").update(receiptBytes).digest("hex"), "ceb82b7e2bcbb5f42a4620c3a5076fbe2803aa637b20d622e01096b1de5c1df7");
  const receipt = JSON.parse(receiptBytes.toString("utf8"));
  assert.equal(receipt.sourceBefore.length, 161);
  assert.equal(receipt.sourceAfter.length, 161);

  const sourceRunResult = git(["show", `${sourceCommit}:compiled-capabilities/run.mjs`]);
  assert.equal(sourceRunResult.status, 0, sourceRunResult.stderr);
  const sourceRun = sourceRunResult.stdout;
  const ignoredDirectories = extractStringArray(sourceRun, "ignoredSourceDirectories", true);
  assert(ignoredDirectories.includes("node_modules"));
  assert.deepEqual(extractStringArray(sourceRun, "sourceFiles").slice(0, 2), ["SHA256SUMS", "EXPECTED.json"]);
  const generatedMapBytes = await readFile(resolve(here, "fixtures/react-map.gen.mjs"));
  assert.equal(createHash("sha256").update(generatedMapBytes).digest("hex"), "9cb7fa3ff84042c36b9ac211dfe2b97a69169e4fb880283e8f000495a8216a54");

  const archive = git(["archive", "--format=tar", sourceCommit], { encoding: null });
  assert.equal(archive.status, 0, archive.stderr?.toString("utf8"));
  const tempRoot = await mkdtemp(join(tmpdir(), "gobi-provenance-followup-"));
  const workTree = join(tempRoot, "worktree");
  const gitDir = join(tempRoot, "git");
  const bindingRelative = `compiled-capabilities/coordination/acceptance/provenance/followup-binding-${process.pid}-${Date.now()}.json`;
  const tempReceiptRelative = "compiled-capabilities/builds/attempts/attempt-20261031T095356051Z/execution.json";
  const oldGitDir = process.env.GIT_DIR;
  const oldGitWorkTree = process.env.GIT_WORK_TREE;
  try {
    await mkdir(workTree, { recursive: true });
    const extracted = spawnSync("tar", ["-xf", "-", "-C", workTree], { input: archive.stdout, encoding: "utf8" });
    assert.equal(extracted.status, 0, extracted.stderr);
    await writeFile(join(workTree, "react-map.gen.mjs"), generatedMapBytes);
    await mkdir(join(workTree, "compiled-capabilities/coordination/acceptance/provenance"), { recursive: true });
    await mkdir(join(workTree, "compiled-capabilities/builds/attempts/attempt-20261031T095356051Z"), { recursive: true });
    await writeFile(join(workTree, tempReceiptRelative), receiptBytes);

    const initialized = git(["init", "--quiet", "--bare", gitDir]);
    assert.equal(initialized.status, 0, initialized.stderr);
    const objectDirectory = git(["rev-parse", "--path-format=absolute", "--git-path", "objects"]);
    assert.equal(objectDirectory.status, 0, objectDirectory.stderr);
    await writeFile(join(gitDir, "objects/info/alternates"), `${objectDirectory.stdout.trim()}\n`);

    const gitEnv = {
      ...process.env,
      GIT_DIR: gitDir,
      GIT_WORK_TREE: workTree,
      GIT_AUTHOR_NAME: "Provenance Test",
      GIT_AUTHOR_EMAIL: "provenance@example.invalid",
      GIT_COMMITTER_NAME: "Provenance Test",
      GIT_COMMITTER_EMAIL: "provenance@example.invalid",
    };
    const createFollowup = (second) => {
      const result = git(["commit-tree", sourceTree, "-p", publishedCommit], {
        env: { ...gitEnv, GIT_AUTHOR_DATE: `2026-10-31T10:30:${second}+00:00`, GIT_COMMITTER_DATE: `2026-10-31T10:30:${second}+00:00` },
      });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };
    const localCommit = createFollowup("01");
    const remoteCommit = createFollowup("02");
    assert.notEqual(localCommit, remoteCommit);
    const refs = git(["update-ref", "refs/heads/followup", localCommit], { env: gitEnv });
    assert.equal(refs.status, 0, refs.stderr);
    const head = git(["symbolic-ref", "HEAD", "refs/heads/followup"], { env: gitEnv });
    assert.equal(head.status, 0, head.stderr);

    const baseTree = treeOf(BASE_COMMIT);
    const binding = {
      schema: "gobi.source-publication-binding/v1",
      base: { commit: BASE_COMMIT, tree: baseTree },
      local: { commit: localCommit, tree: sourceTree, parents: [publishedCommit] },
      remote: { commit: remoteCommit, tree: sourceTree, parents: [publishedCommit] },
    };
    await writeFile(join(workTree, bindingRelative), `${JSON.stringify(binding, null, 2)}\n`);

    process.env.GIT_DIR = gitDir;
    process.env.GIT_WORK_TREE = workTree;
    const report = await auditProvenance({
      repoRoot: workTree,
      receiptPath: tempReceiptRelative,
      sourceCommit: localCommit,
      expectedTree: sourceTree,
      bindingPath: bindingRelative,
    });
    assert.equal(report.context.sourcePinCount, 161, JSON.stringify(report, null, 2));
    assert.equal(report.context.publishedCommit, remoteCommit);
    assert.deepEqual(report.context.m0, {
      rows: 24,
      tracked: 23,
      generated: { path: "react-map.gen.mjs", sha256: "9cb7fa3ff84042c36b9ac211dfe2b97a69169e4fb880283e8f000495a8216a54" },
    });
    assert(report.checks.some((line) => line.includes("161 exact pins")));
    assert(report.checks.some((line) => line.includes("23 tracked M0 inputs")));
    assert(report.checks.some((line) => line.includes(`frozen base commit ${BASE_COMMIT} is an ancestor`)));
    assert.deepEqual(report.failures.filter((failure) => !failure.startsWith("E-BUILD ")), []);
    assert.equal(report.finalAcceptance, false, "the pinned source audit must preserve the failed full-run receipt status");

    const changedBinding = structuredClone(binding);
    changedBinding.local.parents = [BASE_COMMIT];
    changedBinding.remote.parents = [BASE_COMMIT];
    await writeFile(join(workTree, bindingRelative), `${JSON.stringify(changedBinding, null, 2)}\n`);
    const changedReport = await auditProvenance({
      repoRoot: workTree,
      receiptPath: tempReceiptRelative,
      sourceCommit: localCommit,
      expectedTree: sourceTree,
      bindingPath: bindingRelative,
    });
    assert(changedReport.failures.includes("actual local direct parents differ from publication binding"));
    assert(changedReport.failures.includes("actual remote direct parents differ from publication binding"));
  } finally {
    if (oldGitDir === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = oldGitDir;
    if (oldGitWorkTree === undefined) delete process.env.GIT_WORK_TREE;
    else process.env.GIT_WORK_TREE = oldGitWorkTree;
    await rm(tempRoot, { recursive: true, force: true });
  }
});
