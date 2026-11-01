import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "../../interaction/node_modules/esbuild/lib/main.js";

import {
  createGeneratedSourceCommentPolicy,
  normalizeGeneratedArtifactText,
  verifyGeneratedArtifactNormalization,
} from "./source-comments.mjs";

function line(base, target) {
  return `// ${relative(base, target).split("\\").join("/")}`;
}

function moduleFixture({ repository, outputRoot, suffix }) {
  const compilerWorkingDirectory = join(repository, "compiled-frontend");
  const goScriptTempRoot = "/tmp";
  const goScriptRoot = join(goScriptTempRoot, `gobi-goscript-${suffix}`, "@goscript");
  const stageRoot = join(outputRoot, `.gobi-stage-${suffix}`, "apps", "keyedmoduleparent-a75c21d49b52");
  const source = [
    line(compilerWorkingDirectory, join(goScriptRoot, "builtin", "panic.ts")),
    line(compilerWorkingDirectory, join(stageRoot, "components.gen.mjs")),
    "const sourceText = \"unchanged executable string\";",
    "export const result = sourceText.length;",
  ].join("\n");
  const policy = createGeneratedSourceCommentPolicy(source, {
    artifactKind: "module",
    backend: "react",
    commentBase: compilerWorkingDirectory,
    outputRoot,
    goScriptTempRoot,
  });
  return { source, policy, compilerWorkingDirectory, outputRoot, goScriptTempRoot };
}

function helperFixture({ repository, outputRoot, backend }) {
  const commentBase = join(repository, "compiled-module-effects");
  const goScriptTempRoot = "/tmp";
  const emittedRoot = join(outputRoot, `${backend}-parent`, "emitted-ts", "@goscript");
  const helperEntry = join(outputRoot, "adapters", `${backend}-parent`, ".gobi-keyed-helpers.entry.mjs");
  const source = [
    line(commentBase, join(emittedRoot, "builtin", "panic.ts")),
    line(commentBase, helperEntry),
    "const sourceText = \"unchanged executable string\";",
    "export const result = sourceText.length;",
  ].join("\n");
  const policy = createGeneratedSourceCommentPolicy(source, {
    artifactKind: "helper",
    backend,
    commentBase,
    outputRoot,
    goScriptTempRoot,
  });
  return { source, policy, commentBase, outputRoot, goScriptTempRoot };
}

test("source comment policy admits declared runner and external roots at different checkout depths", () => {
  const cases = [
    {
      repository: "/workspace/scratch/project/gondola",
      outputRoot: "/workspace/scratch/project/gondola/compiled-module-effects/output/attempts/attempt-runner/builds",
      suffix: "438512",
    },
    {
      repository: "/tmp/ci/work/a/b/c/gondola",
      outputRoot: "/tmp/gobi effects external output",
      suffix: "884213",
    },
  ];
  for (const options of cases) {
    const fixture = moduleFixture(options);
    const controls = verifyGeneratedArtifactNormalization(fixture.source, "module fixture", fixture.policy, {
      artifactKind: "module",
      backend: "react",
      commentBase: fixture.compilerWorkingDirectory,
      outputRoot: fixture.outputRoot,
      goScriptTempRoot: fixture.goScriptTempRoot,
    });
    assert.equal(controls.executableMutationRejected, true);
    assert.equal(controls.executableTokenMutationRejected, true);
    assert.equal(controls.unexpectedCommentRejected, true);
    assert.equal(normalizeGeneratedArtifactText(fixture.source, fixture.policy),
      "const sourceText = \"unchanged executable string\";\nexport const result = sourceText.length;");
  }
});

test("helper policy resolves arbitrary output roots and remains valid after output relocation", () => {
  const repository = "/checkout/deep/worktree/gondola";
  const originalOutputRoot = "/tmp/gobi-effects-helper-output/admission-17";
  const fixture = helperFixture({ repository, outputRoot: originalOutputRoot, backend: "dom" });
  assert.equal(existsSync(originalOutputRoot), false, "synthetic recorded output root is not required on disk");
  const controls = verifyGeneratedArtifactNormalization(fixture.source, "helper fixture", fixture.policy, {
    artifactKind: "helper",
    backend: "dom",
    commentBase: fixture.commentBase,
    outputRoot: originalOutputRoot,
    goScriptTempRoot: fixture.goScriptTempRoot,
  });
  assert.equal(controls.recognizedCommentCount, 2);
  const relocatedRoot = resolve(dirname(originalOutputRoot), "relocated-build-index");
  assert.notEqual(relocatedRoot, fixture.policy.outputRoot);
  assert.equal(normalizeGeneratedArtifactText(fixture.source, fixture.policy).includes("sourceText"), true);
});

test("only recorded full source comments are removable", () => {
  const fixture = moduleFixture({
    repository: "/checkout/project/gondola",
    outputRoot: "/checkout/project/gondola/compiled-module-effects/output/attempts/attempt-03/builds",
    suffix: "992104",
  });
  const comment = fixture.source.split("\n")[0];
  assert.throws(() => normalizeGeneratedArtifactText(`${fixture.source}\n// unexpected generated note`, fixture.policy), /unexpected generated artifact comment/);
  assert.throws(() => normalizeGeneratedArtifactText(fixture.source.replace(comment, `${comment} * changed`), fixture.policy), /unexpected generated artifact comment/);
  assert.throws(() => normalizeGeneratedArtifactText(fixture.source.replace(comment, `${comment}/unrecorded.ts`), fixture.policy), /source comments differ|unexpected generated artifact comment/);
  const changedLiteral = fixture.source.replace("unchanged executable string", "changed executable string");
  assert.notEqual(normalizeGeneratedArtifactText(changedLiteral, fixture.policy), normalizeGeneratedArtifactText(fixture.source, fixture.policy));
});

test("browser runtime bundle keeps the ABI admission checker free of Node built-ins", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gobi-effects-browser-smoke-"));
  const outfile = join(directory, "runtime-browser-bundle.mjs");
  const entryPoint = fileURLToPath(new URL("../../compiled-module-effects/conformance/browser-entry.mjs", import.meta.url));
  try {
    await esbuild({
      entryPoints: [entryPoint],
      bundle: true,
      platform: "browser",
      format: "esm",
      target: "es2022",
      outfile,
      logLevel: "silent",
    });
    const bundled = await readFile(outfile, "utf8");
    assert.equal(bundled.includes("node:path"), false);
    assert.equal(bundled.includes("node:fs"), false);
    assert.ok(bundled.length > 100_000);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
