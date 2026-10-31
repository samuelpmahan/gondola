import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function argumentsMap(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--") || values.has(name) || !argv[index + 1] || argv[index + 1].startsWith("--")) {
      throw new Error(`invalid or duplicate argument near ${name}`);
    }
    values.set(name, argv[++index]);
  }
  for (const name of ["--archive", "--manifest", "--output", "--expected-archive-sha256", "--expected-manifest-sha256"]) {
    if (!values.has(name)) throw new Error(`missing ${name} <value>`);
  }
  return {
    archive: resolve(values.get("--archive")),
    manifest: resolve(values.get("--manifest")),
    output: resolve(values.get("--output")),
    expectedArchive: values.get("--expected-archive-sha256"),
    expectedManifest: values.get("--expected-manifest-sha256"),
  };
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  if (result.status !== 0 || result.error) {
    throw result.error ?? new Error((result.stderr || `${command} exited ${result.status}`).trim());
  }
  return result.stdout ?? "";
}

async function walk(directory) {
  const output = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(path));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}

const options = argumentsMap(process.argv.slice(2));
const manifestBytes = await readFile(options.manifest);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const archiveBytes = await readFile(options.archive);
if (manifest.schema !== "gobi.compiled-children-archive/v1" || !Array.isArray(manifest.members) || manifest.members.length === 0) {
  throw new Error("external archive manifest schema or member inventory is invalid");
}
const actualArchiveHash = sha256(archiveBytes);
const actualManifestHash = sha256(manifestBytes);
if (actualArchiveHash !== options.expectedArchive || actualManifestHash !== options.expectedManifest) {
  throw new Error("archive or external manifest bytes differ from the hashes recorded by the producer");
}

const expectedPaths = manifest.members.map((member) => member.path).sort();
if (new Set(expectedPaths).size !== expectedPaths.length) throw new Error("manifest contains duplicate member paths");
for (const path of expectedPaths) {
  if (typeof path !== "string" || !path || isAbsolute(path) || path.split(/[\\/]/).some((part) => part === ".." || part === "")) {
    throw new Error(`manifest contains an unsafe member path: ${JSON.stringify(path)}`);
  }
}

const listed = run("tar", ["-tzf", options.archive]).trim().split(/\r?\n/).filter((line) => line && !line.endsWith("/")).sort();
if (JSON.stringify(listed) !== JSON.stringify(expectedPaths)) throw new Error("independent consumer found an archive/manifest member-set mismatch");
const verbose = run("tar", ["-tvzf", options.archive]).trim().split(/\r?\n/).filter(Boolean);
for (const line of verbose) {
  if (!["-", "d"].includes(line[0])) throw new Error(`archive contains a link or special member: ${line}`);
}

const verificationRoot = await mkdtemp(join(tmpdir(), "gobi-children-delivery-"));
try {
  run("tar", ["-xzf", options.archive, "-C", verificationRoot]);
  const extracted = (await walk(verificationRoot)).map((path) => path.slice(verificationRoot.length + 1).split(sep).join("/")).sort();
  if (JSON.stringify(extracted) !== JSON.stringify(expectedPaths)) throw new Error("independent extracted file set differs from the external manifest");
  for (const member of manifest.members) {
    const path = resolve(verificationRoot, member.path);
    if (!path.startsWith(verificationRoot + sep)) throw new Error(`extracted member escapes verifier directory: ${member.path}`);
    const bytes = await readFile(path);
    if (bytes.length !== member.bytes || sha256(bytes) !== member.sha256) throw new Error(`independent member hash mismatch: ${member.path}`);
  }
} finally {
  await rm(verificationRoot, { recursive: true, force: true });
}

const finalArchiveInfo = await stat(options.archive);
const record = {
  schema: "gobi.compiled-children-independent-archive-verification/v1",
  status: "passed",
  consumer: "standalone Node process using tar listing/extraction and SHA-256 member verification; does not call the producer archive helper",
  archive: { path: options.archive, bytes: archiveBytes.length, statBytes: finalArchiveInfo.size, sha256: actualArchiveHash },
  manifest: { path: options.manifest, bytes: manifestBytes.length, sha256: actualManifestHash },
  members: manifest.members.length,
  verifiedAt: new Date().toISOString(),
};
await writeFile(options.output, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify(record)}\n`);
