import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_DIRS = [
  "compilercontract",
  "counter",
  "gobi",
  "reactmap",
  "cmd/compiled-native",
  "compiled-frontend/analyze",
  "compiled-frontend/build",
  "compiled-frontend/cmd",
  "compiled-frontend/emit",
  "compiled-frontend/frontend/react",
  "compiled-frontend/frontend/runtime",
  "compiled-frontend/semantic",
  "compiled-frontend/conformance",
  "fixtures/compiled",
];
const SOURCE_FILES = [
  "compiled-frontend/DESIGN.md",
  "compiled-frontend/CONTRACT.md",
  "compiled-frontend/go.mod",
  "compiled-frontend/go.sum",
  "compiled-frontend/package.json",
  "compiled-frontend/package-lock.json",
  "go.mod",
  "package.json",
  "package-lock.json",
  "interaction/package.json",
  "interaction/package-lock.json",
  "README.md",
];
const PINNED_DEPENDENCY_METADATA = [
  "interaction/node_modules/react/package.json",
  "interaction/node_modules/react-dom/package.json",
  "interaction/node_modules/esbuild/package.json",
];
const SOURCE_EXTENSIONS = new Set([".go", ".mjs", ".md", ".ts"]);
const EXCLUDED_SOURCE_DIRECTORIES = new Set(["compiled-frontend/conformance/raw"]);

async function sourceFiles(directory, relativeDirectory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const relativePath = join(relativeDirectory, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory() && !EXCLUDED_SOURCE_DIRECTORIES.has(relativePath)) {
      files.push(...await sourceFiles(path, relativePath));
    }
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.slice(path.lastIndexOf(".")))) files.push(path);
  }
  return files;
}

async function hash(path) {
  const contents = await readFile(path);
  return { path: path.startsWith(REPOSITORY) ? path.slice(REPOSITORY.length + 1) : path, sha256: createHash("sha256").update(contents).digest("hex"), bytes: contents.length };
}

export async function captureConformanceProvenance({ compiledPath, helpersPath, fixturePath, browserBundlePath = null, command = process.argv.slice(1) }) {
  const files = [];
  for (const relative of SOURCE_FILES) {
    try { await stat(join(REPOSITORY, relative)); files.push(join(REPOSITORY, relative)); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  for (const directory of SOURCE_DIRS) files.push(...await sourceFiles(join(REPOSITORY, directory), directory));
  for (const relative of PINNED_DEPENDENCY_METADATA) {
    try { await stat(join(REPOSITORY, relative)); files.push(join(REPOSITORY, relative)); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  files.push(resolve(compiledPath), resolve(helpersPath), resolve(fixturePath));
  if (browserBundlePath) files.push(resolve(browserBundlePath));
  const unique = [...new Set(files)].sort();
  const hashes = [];
  for (const path of unique) hashes.push(await hash(path));
  return {
    schema: "gobi.conformance-provenance/v1",
    node: process.version,
    command: [...command],
    inputs: hashes,
  };
}

export function assertStableProvenance(before, after) {
  if (JSON.stringify(before.inputs) !== JSON.stringify(after.inputs)) {
    const beforeMap = new Map(before.inputs.map((entry) => [entry.path, entry.sha256]));
    const afterMap = new Map(after.inputs.map((entry) => [entry.path, entry.sha256]));
    const changed = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort()
      .filter((path) => beforeMap.get(path) !== afterMap.get(path));
    throw new Error(`conformance sources or inputs changed during execution: ${changed.join(", ")}`);
  }
  return true;
}
