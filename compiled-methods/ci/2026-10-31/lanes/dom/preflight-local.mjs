import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const evidenceRoot = process.cwd();
const priorWorktree = "/workspace/scratch/39a56936f173/gondola-methods";
const publicationPath = "compiled-methods/ci/2026-10-31/publication-current.json";
const archivePath = "compiled-methods/evidence/builds/final-local-methods-only.tar.gz";
const archive = resolve(evidenceRoot, archivePath);
const attempt = "compiled-methods/artifacts/attempts/attempt-20261031T042646625Z";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const publication = JSON.parse(await readFile(publicationPath, "utf8"));
assert.equal(publication.sourceCommit, "6b49cc0bd4c9512a041f723c86b632ec506afd9d");
assert.equal(publication.sourceTree, "b28b10ccefd78f7a90d6d66f2b6769b426ed6a81");

const archiveBytes = await readFile(archive);
const entries = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim().split("\n");
assert.equal(entries.length, 189);
const archiveMatrix = {};
for (const kind of ["browser", "native", "direct"]) {
  const member = `${attempt}/matrix/methods.${kind}.json`;
  assert.ok(entries.includes(member), `local archive omits ${member}`);
  const archivedBytes = execFileSync("tar", ["-xOzf", archive, member], { maxBuffer: 16 * 1024 * 1024 });
  const archivedHash = hash(archivedBytes);
  const currentPath = `${priorWorktree}/${attempt}/matrix/methods.${kind}.json`;
  const currentBytes = await readFile(currentPath);
  assert.equal(archivedHash, hash(currentBytes), `${kind} record differs from the verified local evidence copy`);
  archiveMatrix[kind] = { member, bytes: archivedBytes.length, sha256: archivedHash, matchesLocalCopy: true };
}
const executionMember = `${attempt}/execution.json`;
assert.ok(entries.includes(executionMember));
const execution = JSON.parse(execFileSync("tar", ["-xOzf", archive, executionMember], { encoding: "utf8" }));
assert.equal(execution.status, "passed");
assert.equal(execution.mode, "methods-only");
assert.equal(execution.sourcePinsMatch, true);
assert.equal(execution.sourceBefore.length, 137);
assert.equal(execution.sourceAfter.length, 137);
assert.deepEqual(execution.sourceBefore, execution.sourceAfter);

const result = {
  schema: "gobi.ci-dom-local-preflight/v1",
  classification: "local-preflight-only-not-ci-acceptance",
  publication: {
    sourceCommit: publication.sourceCommit,
    sourceTree: publication.sourceTree,
    parent: publication.parent,
  },
  archive: {
    path: archivePath,
    sha256: hash(archiveBytes),
    memberCount: entries.length,
    methodsOnlyStatus: execution.status,
    mode: execution.mode,
    sourcePinCount: execution.sourceBefore.length,
    evidenceMatrix: archiveMatrix,
  },
  priorHead: {
    sourceCommit: "8ed5b66a223de1992756516f8d3895c6e096f842",
    extractedArtifactMemberCount: 957,
    classification: "failed-head-history-excluded-from-current-acceptance",
  },
  ciGate: "pending-fresh-primary-artifact-required",
};
const output = "compiled-methods/ci/2026-10-31/lanes/dom/preflight/local-archive-audit.json";
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
