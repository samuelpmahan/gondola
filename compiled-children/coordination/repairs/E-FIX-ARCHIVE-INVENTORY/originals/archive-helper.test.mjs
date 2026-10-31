import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
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
