import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { isAbsolute, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--") || values.has(name) || !argv[index + 1] || argv[index + 1].startsWith("--")) {
      throw new Error(`invalid or duplicate argument near ${name}`);
    }
    values.set(name, argv[++index]);
  }
  const required = ["--archive", "--manifest", "--output", "--expected-archive-sha256", "--expected-manifest-sha256"];
  for (const name of required) if (!values.has(name)) throw new Error(`missing ${name} <value>`);
  return {
    archive: resolve(values.get("--archive")),
    manifest: resolve(values.get("--manifest")),
    output: resolve(values.get("--output")),
    archiveHash: values.get("--expected-archive-sha256"),
    manifestHash: values.get("--expected-manifest-sha256"),
  };
}

function command(commandName, args) {
  const result = spawnSync(commandName, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error((result.stderr || `${commandName} exited ${result.status}`).trim());
  }
  return result.stdout ?? "";
}

async function walk(directory) {
  const files = [];
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`archive extraction contains a non-file member at ${path}`);
  }
  return files;
}

const options = parseArguments(process.argv.slice(2));
const [archiveBytes, manifestBytes] = await Promise.all([
  readFile(options.archive),
  readFile(options.manifest),
]);
const archiveHash = sha256(archiveBytes);
const manifestHash = sha256(manifestBytes);
if (archiveHash !== options.archiveHash || manifestHash !== options.manifestHash) {
  throw new Error("archive or manifest bytes differ from the command-bound hashes");
}
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (manifest.schema !== "gobi.compiled-publications-archive/v1" || !Array.isArray(manifest.members) || manifest.members.length === 0) {
  throw new Error("publications archive manifest schema or member list is invalid");
}
const expectedPaths = manifest.members.map((member) => member.path).sort();
if (new Set(expectedPaths).size !== expectedPaths.length) throw new Error("manifest contains duplicate member paths");
for (const path of expectedPaths) {
  if (typeof path !== "string" || !path || isAbsolute(path) || path.includes("\\") ||
      path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`manifest contains an unsafe path: ${JSON.stringify(path)}`);
  }
}

const listed = command("tar", ["-tzf", options.archive]).trim().split(/\r?\n/).filter(Boolean).sort();
if (JSON.stringify(listed) !== JSON.stringify(expectedPaths)) throw new Error("tar members differ from the external manifest");
const verbose = command("tar", ["-tvzf", options.archive]).trim().split(/\r?\n/).filter(Boolean);
if (verbose.length !== expectedPaths.length || verbose.some((line) => line[0] !== "-")) {
  throw new Error("archive contains a directory, link, or special file");
}

const verificationRoot = await mkdtemp(join(tmpdir(), "gobi-publications-consumer-"));
try {
  command("tar", ["-xzf", options.archive, "-C", verificationRoot]);
  const actualPaths = (await walk(verificationRoot))
    .map((path) => path.slice(verificationRoot.length + 1).split(sep).join("/"))
    .sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error("independent extraction file set differs from manifest");
  }
  for (const member of manifest.members) {
    const path = resolve(verificationRoot, member.path);
    if (!path.startsWith(verificationRoot + sep)) throw new Error(`member escapes extraction root: ${member.path}`);
    const bytes = await readFile(path);
    if (bytes.length !== member.bytes || sha256(bytes) !== member.sha256) {
      throw new Error(`independent member hash mismatch: ${member.path}`);
    }
  }
} finally {
  await rm(verificationRoot, { recursive: true, force: true });
}

const archiveStat = await stat(options.archive);
const result = {
  schema: "gobi.compiled-publications-independent-archive-verification/v1",
  status: "passed",
  consumer: "standalone process; independently lists, extracts, and hashes all tar members",
  archive: { path: options.archive, bytes: archiveBytes.length, statBytes: archiveStat.size, sha256: archiveHash },
  manifest: { path: options.manifest, bytes: manifestBytes.length, sha256: manifestHash },
  members: manifest.members.length,
  verifiedAt: new Date().toISOString(),
};
await writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify(result)}\n`);
