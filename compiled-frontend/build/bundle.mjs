import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [entryArg, outputArg, goscriptArg, sourceRootArg] = process.argv.slice(2);
if (!entryArg || !outputArg || !goscriptArg || !sourceRootArg) {
  process.stderr.write("usage: bundle.mjs <entry> <output> <goscript-output-root> <source-root>\n");
  process.exit(2);
}

const entry = resolve(entryArg);
const outfile = resolve(outputArg);
const goscriptRoot = resolve(goscriptArg);
const sourceRoot = resolve(sourceRootArg);
const here = dirname(fileURLToPath(import.meta.url));
const localRequire = createRequire(import.meta.url);
let esbuild;
try {
  esbuild = localRequire("esbuild");
} catch (localError) {
  try {
    esbuild = createRequire(join(sourceRoot, "interaction", "package.json"))("esbuild");
  } catch {
    process.stderr.write(`cannot load pinned esbuild 0.28.2 from ${here} or ${sourceRoot}/interaction: ${localError.message}\n`);
    process.exit(1);
  }
}
if (esbuild.version !== "0.28.2") {
  process.stderr.write(`unsupported esbuild version ${esbuild.version}; expected 0.28.2\n`);
  process.exit(1);
}

try {
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2022",
    alias: { "@goscript": join(goscriptRoot, "@goscript") },
    outfile,
    write: true,
    legalComments: "none",
    logLevel: "silent",
  });
} catch (error) {
  process.stderr.write(`${error?.message ?? String(error)}\n`);
  process.exit(1);
}
