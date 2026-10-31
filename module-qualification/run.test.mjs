import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { resolveExecutable } from "./run.mjs";

async function writeTool(directory, name, output) {
  const path = join(directory, name);
  await writeFile(path, `#!/bin/sh\nprintf '%s\\n' '${output}'\n`, { mode: 0o755 });
  await chmod(path, 0o755);
  return path;
}

test("default Go and Python tools resolve from PATH and run the selected binaries", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "gobi-portable-tools-"));
  try {
    const goPath = await writeTool(temporary, "go", "go version go1.24.9 linux/amd64");
    const pythonPath = await writeTool(temporary, "python3", "Python 3.12.9");
    const env = { PATH: temporary };

    const go = resolveExecutable("GOBI_GO_BIN", "go", env);
    const python = resolveExecutable("GOBI_PYTHON_BIN", "python3", env);
    assert.equal(go, goPath);
    assert.equal(python, pythonPath);
    assert.equal(spawnSync(go, ["version"], { env, encoding: "utf8" }).stdout.trim(), "go version go1.24.9 linux/amd64");
    assert.equal(spawnSync(python, ["--version"], { env, encoding: "utf8" }).stdout.trim(), "Python 3.12.9");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("explicit Go and Python overrides select the requested executable", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "gobi-portable-overrides-"));
  try {
    const pathDir = join(temporary, "path");
    const overrideDir = join(temporary, "override");
    await mkdir(pathDir);
    await mkdir(overrideDir);
    await writeTool(pathDir, "go", "PATH Go");
    await writeTool(pathDir, "python3", "PATH Python");
    const goOverride = await writeTool(overrideDir, "custom-go", "Override Go");
    const pythonOverride = await writeTool(overrideDir, "custom-python", "Override Python");
    const env = {
      PATH: pathDir,
      GOBI_GO_BIN: goOverride,
      GOBI_PYTHON_BIN: pythonOverride,
    };

    assert.equal(resolveExecutable("GOBI_GO_BIN", "go", env), goOverride);
    assert.equal(resolveExecutable("GOBI_PYTHON_BIN", "python3", env), pythonOverride);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("an invalid explicit override fails closed instead of falling back to PATH", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "gobi-portable-invalid-"));
  try {
    await writeTool(temporary, "go", "PATH Go");
    await writeTool(temporary, "python3", "PATH Python");
    assert.throws(
      () => resolveExecutable("GOBI_GO_BIN", "go", { PATH: temporary, GOBI_GO_BIN: join(temporary, "missing-go") }),
      /GOBI_GO_BIN.*not an executable file/,
    );
    assert.throws(
      () => resolveExecutable("GOBI_PYTHON_BIN", "python3", { PATH: temporary, GOBI_PYTHON_BIN: join(temporary, "missing-python") }),
      /GOBI_PYTHON_BIN.*not an executable file/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("the shell wrapper resolves and executes Go and Node from a restricted PATH", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "gobi-portable-wrapper-"));
  try {
    await writeTool(temporary, "go", "go version go1.24.9 linux/amd64");
    await writeFile(join(temporary, "node"), "#!/bin/sh\ncase \"$1\" in -p) printf '%s\\n' 22 ;; --version) printf '%s\\n' v22.23.4 ;; *) printf 'selected-node:'; printf ' <%s>' \"$@\"; printf '\\n' ;; esac\n", { mode: 0o755 });
    await chmod(join(temporary, "node"), 0o755);
    const moduleDirectory = dirname(fileURLToPath(import.meta.url));
    const repository = dirname(moduleDirectory);
    const wrapper = join(repository, "run-module-qualification.sh");
    const result = spawnSync("/bin/bash", [wrapper, "--help"], {
      cwd: repository,
      env: { PATH: `${temporary}:/usr/bin:/bin` },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /selected-node:.*module-qualification\/run\.mjs.*<--help>/);

    const invalidOverride = spawnSync("/bin/bash", [wrapper, "--help"], {
      cwd: repository,
      env: { PATH: `${temporary}:/usr/bin:/bin`, GOBI_GO_BIN: join(temporary, "missing-go") },
      encoding: "utf8",
    });
    assert.equal(invalidOverride.status, 127);
    assert.match(invalidOverride.stderr, /GOBI_GO_BIN must name an executable/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
