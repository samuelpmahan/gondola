import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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
  await execute("archive-capability-artifacts", "tar", ["-czf", archivePath, "-C", attemptRoot, ...includePaths]);
  const archive = await hashPath(archivePath);
  const listed = (await execute("list-capability-archive", "tar", ["-tzf", archivePath]))
    .trim().split("\n").filter((line) => line && !line.endsWith("/"));
  const expected = members.map(({ path }) => path).sort();
  if (JSON.stringify(listed.sort()) !== JSON.stringify(expected)) {
    throw new Error("capability archive members differ from its pinned inventory");
  }
  await mkdir(verifyRoot, { recursive: true });
  await execute("extract-capability-archive", "tar", ["-xzf", archivePath, "-C", verifyRoot]);
  for (const member of members) {
    const extracted = join(verifyRoot, member.path);
    const actual = await hashPath(extracted);
    if (actual.bytes !== member.bytes || actual.sha256 !== member.sha256) {
      throw new Error(`archive round-trip mismatch: ${member.path}`);
    }
  }
  const archivedSnapshot = await readJSON(join(verifyRoot, "execution-before-archive.json"));
  await rm(verifyRoot, { recursive: true, force: true });
  return { archive, archivedSnapshot };
}
