import { link, mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

export async function createExclusiveAttemptDirectory(attemptPath) {
  await mkdir(dirname(attemptPath), { recursive: true });
  await mkdir(attemptPath);
  return attemptPath;
}

export async function writeImmutableSnapshot(path, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  await writeFile(path, bytes, { flag: "wx", mode: 0o444 });
  return { bytes, byteLength: bytes.length };
}

export async function archiveAndVerify({
  attemptRoot,
  archivePath,
  verifyRoot,
  includePaths,
  members,
  execute,
  hashPath,
  readJSON,
}) {
  const roots = includePaths.map((path) => path.replaceAll("\\", "/").replace(/\/$/, ""));
  const expected = members.map(({ path }) => path);
  if (expected.some((path) => typeof path !== "string" || path.length === 0 || path.includes("\0") ||
      path.includes("\\") || path.startsWith("/") || path.split("/").some((part) => part === "" || part === "." || part === ".."))) {
    throw new TypeError("capability archive inventory must contain normalized relative file paths");
  }
  if (new Set(expected).size !== expected.length) {
    throw new Error("capability archive inventory contains duplicate paths");
  }
  if (expected.some((path) => !roots.some((root) => path === root || path.startsWith(`${root}/`)))) {
    throw new Error("capability archive inventory contains a path outside its include roots");
  }
  expected.sort();
  const listRoot = await mkdtemp(join(tmpdir(), "gobi-capability-archive-list-"));
  const listPath = join(listRoot, "members.nul");
  const stagingPath = join(dirname(archivePath), `.${basename(archivePath)}.stage-${randomUUID()}`);
  let stagingCreated = false;
  try {
    await writeFile(listPath, Buffer.from(`${expected.join("\0")}\0`));
    const stagingFile = await open(stagingPath, "wx", 0o600);
    stagingCreated = true;
    await stagingFile.close();
    await execute("archive-capability-artifacts", "tar", [
      "-czf", stagingPath,
      "-C", attemptRoot,
      "--no-recursion",
      "--null",
      "--files-from", listPath,
    ]);
    const archive = await hashPath(stagingPath);
    const listed = (await execute("list-capability-archive", "tar", ["-tzf", stagingPath]))
      .trim().split("\n").filter((line) => line && !line.endsWith("/"));
    if (JSON.stringify(listed.sort()) !== JSON.stringify(expected)) {
      throw new Error("capability archive members differ from its pinned inventory");
    }
    await mkdir(verifyRoot, { recursive: true });
    await execute("extract-capability-archive", "tar", ["-xzf", stagingPath, "-C", verifyRoot]);
    for (const member of members) {
      const extracted = join(verifyRoot, member.path);
      const actual = await hashPath(extracted);
      if (actual.bytes !== member.bytes || actual.sha256 !== member.sha256) {
        throw new Error(`archive round-trip mismatch: ${member.path}`);
      }
    }
    const archivedSnapshot = await readJSON(join(verifyRoot, "execution-before-archive.json"));
    await rm(verifyRoot, { recursive: true, force: true });

    // Hard-link publication is atomic and fails if archivePath already exists.
    // Staging in the final directory keeps both paths on the same filesystem.
    await link(stagingPath, archivePath);
    return { archive, archivedSnapshot };
  } finally {
    const cleanup = [rm(listRoot, { recursive: true, force: true })];
    if (stagingCreated) cleanup.push(rm(stagingPath, { force: true }));
    await Promise.all(cleanup);
  }
}
