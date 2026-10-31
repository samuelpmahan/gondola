import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { archiveAndVerify, createExclusiveAttemptDirectory, writeImmutableSnapshot } from "./archive-helper.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("creates a missing attempts parent before exclusively creating an attempt directory", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "gobi-cap-startup-parent-"));
  try {
    const attempts = join(workspace, "builds", "attempts");
    const attempt = join(attempts, "attempt-fresh");
    await assert.rejects(stat(attempts), { code: "ENOENT" });
    assert.equal(await createExclusiveAttemptDirectory(attempt), attempt);
    assert((await stat(attempt)).isDirectory());
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("rejects an existing attempt name without replacing its contents", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "gobi-cap-startup-collision-"));
  try {
    const attempt = join(workspace, "builds", "attempts", "attempt-collision");
    await mkdir(attempt, { recursive: true });
    const marker = join(attempt, "preserve.txt");
    await writeFile(marker, "existing attempt\n");
    await assert.rejects(createExclusiveAttemptDirectory(attempt), { code: "EEXIST" });
    assert.equal(await readFile(marker, "utf8"), "existing attempt\n");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

async function hashPath(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

async function filePaths(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await filePaths(path));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}

function runChild(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

test("pre-archive provenance stays immutable and round-trips in a tar with an externally bound manifest", async () => {
  const attemptRoot = await mkdtemp(join(tmpdir(), "gobi-cap-archive-test-"));
  try {
    await mkdir(join(attemptRoot, "react"), { recursive: true });
    await writeFile(join(attemptRoot, "react", "build-result.json"), "{\"ok\":true}\n");
    const sourceBefore = [{ path: "fixture.go", bytes: 8, sha256: "a".repeat(64) }];
    const snapshot = {
      schema: "gobi.compiled-capabilities-execution-before-archive/v1",
      status: "archive_pending",
      archiveStatus: "PENDING",
      archivePending: true,
      acceptanceStatus: "NOT_FINAL",
      finalAcceptance: false,
      sourceBefore,
      preArchiveSourcePins: sourceBefore,
      sourcePinsAtEndOfCommandsAndPreArchive: sourceBefore,
      toolchainAndDependencies: { versions: { node: "v22.23.4" }, dependencyInstall: { commands: ["npm ci"] } },
      commandLedger: [{ name: "prearchive", command: "node", args: ["check"], exitCode: 0 }],
      stages: [{ name: "build", status: "passed" }],
      stageOutcomes: [{ name: "build", status: "passed" }],
    };
    const snapshotPath = join(attemptRoot, "execution-before-archive.json");
    const written = await writeImmutableSnapshot(snapshotPath, snapshot);
    assert.equal((await stat(snapshotPath)).mode & 0o777, 0o444);
    await assert.rejects(writeImmutableSnapshot(snapshotPath, snapshot), { code: "EEXIST" });

    const members = [];
    for (const path of await filePaths(join(attemptRoot, "react"))) {
      members.push({ path: relative(attemptRoot, path).split(sep).join("/"), ...await hashPath(path) });
    }
    members.push({ path: "execution-before-archive.json", bytes: written.byteLength, sha256: sha256(written.bytes) });
    members.sort((a, b) => a.path.localeCompare(b.path));
    const manifestPath = join(attemptRoot, "archive-manifest.json");
    await writeFile(manifestPath, `${JSON.stringify({
      schema: "gobi.compiled-capabilities-archive/v1",
      manifestPolicy: "outside tar; final outer receipt binds exact hash",
      members,
    }, null, 2)}\n`);
    const archivePath = join(attemptRoot, "capabilities-artifacts.tar.gz");
    const verifyRoot = join(attemptRoot, "archive-verification");
    const commandLedger = [];
    const execute = (name, command, args) => {
      const result = spawnSync(command, args, { cwd: attemptRoot, encoding: "utf8" });
      commandLedger.push({ name, command, args, exitCode: result.status });
      if (result.status !== 0 || result.error) throw result.error ?? new Error(result.stderr || `${name} failed`);
      return result.stdout ?? "";
    };
    const result = await archiveAndVerify({
      attemptRoot,
      archivePath,
      verifyRoot,
      includePaths: ["react", "execution-before-archive.json"],
      members,
      execute,
      hashPath,
      readJSON: async (path) => JSON.parse(await readFile(path, "utf8")),
    });
    assert.equal(result.archivedSnapshot.archivePending, true);
    assert.equal(result.archivedSnapshot.finalAcceptance, false);
    assert.deepEqual(result.archivedSnapshot.commandLedger, snapshot.commandLedger);
    assert.equal(result.archive.sha256, (await hashPath(archivePath)).sha256);
    assert.equal(JSON.parse(await readFile(manifestPath, "utf8")).members.length, members.length);
    const outerReceipt = {
      archive: { ...result.archive },
      manifest: { path: "archive-manifest.json", ...await hashPath(manifestPath) },
      sourceBefore,
      sourceAfter: sourceBefore,
      snapshotPins: result.archivedSnapshot.preArchiveSourcePins,
    };
    assert.equal(outerReceipt.manifest.sha256, (await hashPath(manifestPath)).sha256);
    assert.deepEqual(outerReceipt.sourceAfter, outerReceipt.sourceBefore);
    assert.deepEqual(outerReceipt.sourceAfter, outerReceipt.snapshotPins);
    assert.deepEqual(commandLedger.map(({ name }) => name), [
      "archive-capability-artifacts",
      "list-capability-archive",
      "extract-capability-archive",
    ]);
  } finally {
    await rm(attemptRoot, { recursive: true, force: true });
  }
});

test("real tar archives only the frozen inventory while an unlisted hidden file churns", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "gobi-cap-archive-churn-"));
  const attemptRoot = join(workspace, "attempt");
  const harnessRoot = join(attemptRoot, "harness");
  try {
    await mkdir(harnessRoot, { recursive: true });
    const listedPath = join(harnessRoot, "listed.bin");
    await writeFile(listedPath, randomBytes(12 * 1024 * 1024));
    const snapshot = { schema: "gobi.compiled-capabilities-execution-before-archive/v1", archivePending: true };
    const snapshotPath = join(attemptRoot, "execution-before-archive.json");
    const written = await writeImmutableSnapshot(snapshotPath, snapshot);
    const members = [
      { path: "harness/listed.bin", ...await hashPath(listedPath) },
      { path: "execution-before-archive.json", bytes: written.byteLength, sha256: sha256(written.bytes) },
    ].sort((left, right) => left.path.localeCompare(right.path));
    const archivePath = join(workspace, "artifacts.tar.gz");
    const verifyRoot = join(workspace, "verify");
    const unlistedPath = join(harnessRoot, ".run.browser.json.temporary");
    let churnCount = 0;
    let finalVisibleDuringArchive = false;
    let stagingArchivePath = null;
    const execute = async (name, command, args) => {
      if (name === "archive-capability-artifacts") {
        assert.equal(existsSync(archivePath), false, "final archive exists before tar starts");
        stagingArchivePath = args[1];
        assert.notEqual(stagingArchivePath, archivePath, "tar must write to a unique staging path");
        assert.equal(dirname(stagingArchivePath), dirname(archivePath), "tar staging must share the final directory");
        assert(basename(stagingArchivePath).startsWith(`.${basename(archivePath)}.stage-`));
        writeFileSync(unlistedPath, "temp entry before tar\n");
        const childPromise = runChild(command, args, attemptRoot);
        const timer = setInterval(() => {
          try {
            if (existsSync(archivePath)) finalVisibleDuringArchive = true;
            if (existsSync(unlistedPath)) unlinkSync(unlistedPath);
            else writeFileSync(unlistedPath, "temp entry during tar\n");
            churnCount += 1;
          } catch { /* The tar child may finish between interval ticks. */ }
        }, 1);
        const result = await childPromise;
        clearInterval(timer);
        if (existsSync(unlistedPath)) unlinkSync(unlistedPath);
        assert(churnCount > 0, "unlisted temporary entry did not change while tar was running");
        assert.equal(existsSync(archivePath), false, "final archive must remain absent after tar writes the stage");
        assert.equal(result.status, 0, result.stderr);
        return result.stdout;
      }
      assert.equal(existsSync(archivePath), false, `final archive must remain absent during ${name}`);
      const result = spawnSync(command, args, { cwd: attemptRoot, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout ?? "";
    };

    const archived = await archiveAndVerify({
      attemptRoot,
      archivePath,
      verifyRoot,
      includePaths: ["harness", "execution-before-archive.json"],
      members,
      execute,
      hashPath,
      readJSON: async (path) => JSON.parse(await readFile(path, "utf8")),
    });

    assert.equal(archived.archivedSnapshot.archivePending, true);
    assert.equal(finalVisibleDuringArchive, false, "final archive was visible while tar was writing");
    assert(stagingArchivePath);
    assert.equal(existsSync(stagingArchivePath), false, "archive staging file remained after publication");
    assert((await stat(archivePath)).isFile(), "completed archive was not published after round-trip verification");
    const archiveMembers = (await runChild("tar", ["-tzf", archivePath], workspace)).stdout
      .trim().split("\n").filter(Boolean).sort();
    assert.deepEqual(archiveMembers, members.map((item) => item.path).sort());
    assert.equal(archiveMembers.includes("harness/.run.browser.json.temporary"), false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("tar failure leaves no final archive and cleans only its same-directory staging file", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "gobi-cap-archive-tar-failure-"));
  const attemptRoot = join(workspace, "attempt");
  try {
    await mkdir(attemptRoot, { recursive: true });
    const snapshot = { schema: "gobi.compiled-capabilities-execution-before-archive/v1", archivePending: true };
    const written = await writeImmutableSnapshot(join(attemptRoot, "execution-before-archive.json"), snapshot);
    const members = [
      { path: "execution-before-archive.json", bytes: written.byteLength, sha256: sha256(written.bytes) },
    ];
    const archivePath = join(workspace, "artifacts.tar.gz");
    const unrelatedStage = join(workspace, ".artifacts.tar.gz.stage-preserve-me");
    writeFileSync(unrelatedStage, "not owned by this call");
    let stagingArchivePath = null;

    await assert.rejects(archiveAndVerify({
      attemptRoot,
      archivePath,
      verifyRoot: join(workspace, "verify"),
      includePaths: ["execution-before-archive.json"],
      members,
      execute: async (name, _command, args) => {
        assert.equal(name, "archive-capability-artifacts");
        assert.equal(existsSync(archivePath), false, "final archive became visible before tar completion");
        stagingArchivePath = args[1];
        assert.equal(dirname(stagingArchivePath), dirname(archivePath));
        assert.notEqual(stagingArchivePath, archivePath);
        assert(basename(stagingArchivePath).startsWith(`.${basename(archivePath)}.stage-`));
        writeFileSync(stagingArchivePath, "partial tar output");
        assert.equal(existsSync(archivePath), false, "partial tar output leaked to the final path");
        throw new Error("simulated tar failure");
      },
      hashPath,
      readJSON: async (path) => JSON.parse(await readFile(path, "utf8")),
    }), /simulated tar failure/);

    assert.equal(existsSync(archivePath), false, "failed tar left a final archive");
    assert(stagingArchivePath);
    assert.equal(existsSync(stagingArchivePath), false, "failed tar left its own staging file");
    assert.equal(await readFile(unrelatedStage, "utf8"), "not owned by this call");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("publishing refuses to replace an existing final archive and removes its stage", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "gobi-cap-archive-no-clobber-"));
  const attemptRoot = join(workspace, "attempt");
  try {
    await mkdir(attemptRoot, { recursive: true });
    const snapshot = { schema: "gobi.compiled-capabilities-execution-before-archive/v1", archivePending: true };
    const written = await writeImmutableSnapshot(join(attemptRoot, "execution-before-archive.json"), snapshot);
    const members = [
      { path: "execution-before-archive.json", bytes: written.byteLength, sha256: sha256(written.bytes) },
    ];
    const archivePath = join(workspace, "artifacts.tar.gz");
    const original = Buffer.from("preexisting final archive bytes");
    await writeFile(archivePath, original, { flag: "wx" });
    let stagingArchivePath = null;
    const execute = async (name, command, args) => {
      assert.deepEqual(await readFile(archivePath), original, "existing final archive changed before no-clobber publication");
      if (name === "archive-capability-artifacts") {
        stagingArchivePath = args[1];
        assert.notEqual(stagingArchivePath, archivePath);
        assert.equal(dirname(stagingArchivePath), dirname(archivePath));
        assert(basename(stagingArchivePath).startsWith(`.${basename(archivePath)}.stage-`));
      }
      const result = await runChild(command, args, attemptRoot);
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    };

    await assert.rejects(archiveAndVerify({
      attemptRoot,
      archivePath,
      verifyRoot: join(workspace, "verify"),
      includePaths: ["execution-before-archive.json"],
      members,
      execute,
      hashPath,
      readJSON: async (path) => JSON.parse(await readFile(path, "utf8")),
    }), { code: "EEXIST" });

    assert.deepEqual(await readFile(archivePath), original, "no-clobber publication replaced existing archive bytes");
    assert(stagingArchivePath);
    assert.equal(existsSync(stagingArchivePath), false, "no-clobber failure left its staging file");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("real tar round trip rejects a listed byte that changes after inventory capture", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "gobi-cap-archive-listed-mutation-"));
  const attemptRoot = join(workspace, "attempt");
  const harnessRoot = join(attemptRoot, "harness");
  try {
    await mkdir(harnessRoot, { recursive: true });
    const listedPath = join(harnessRoot, "listed.txt");
    await writeFile(listedPath, "inventory bytes\n");
    const snapshot = { schema: "gobi.compiled-capabilities-execution-before-archive/v1", archivePending: true };
    const snapshotPath = join(attemptRoot, "execution-before-archive.json");
    const written = await writeImmutableSnapshot(snapshotPath, snapshot);
    const members = [
      { path: "harness/listed.txt", ...await hashPath(listedPath) },
      { path: "execution-before-archive.json", bytes: written.byteLength, sha256: sha256(written.bytes) },
    ];
    const execute = async (name, command, args) => {
      if (name === "archive-capability-artifacts") await writeFile(listedPath, "changed after inventory\n");
      const result = spawnSync(command, args, { cwd: attemptRoot, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout ?? "";
    };

    await assert.rejects(archiveAndVerify({
      attemptRoot,
      archivePath: join(workspace, "artifacts.tar.gz"),
      verifyRoot: join(workspace, "verify"),
      includePaths: ["harness", "execution-before-archive.json"],
      members,
      execute,
      hashPath,
      readJSON: async (path) => JSON.parse(await readFile(path, "utf8")),
    }), /archive round-trip mismatch: harness\/listed\.txt/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
