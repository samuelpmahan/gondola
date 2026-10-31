import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { caseFor, channelsSatisfyCase, loadQualificationPlan } from "./oracle.mjs";

const loaded = await loadQualificationPlan();
const { plan, fixture, baselineOracle } = loaded;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("oracle plan pins the original fixed scenario and literal checkpoint oracle", () => {
  assert.equal(plan.schema, "gobi.backend-qualification-oracle-plan/v1");
  assert.equal(plan.caseCount, 13);
  assert.equal(fixture.events.length, 50);
  assert.equal(plan.baseline.goUpdates, 45);
  assert.equal(baselineOracle.stateProjections.length, 46);
  assert.equal(plan.scenario.firstAction.path, "1/0/1");
  assert.deepEqual(plan.scenario.firstAction.message, { name: "counter.add", arg: "oak" });
});

test("the registry is exactly three healthy profiles plus two backends across five fault families", () => {
  assert.deepEqual(plan.caseIds.slice(0, 3), ["healthy-react", "healthy-dom", "healthy-swap"]);
  assert.equal(plan.cases.filter((row) => row.fault === "none").length, 3);
  assert.equal(plan.cases.filter((row) => row.fault !== "none").length, 10);
  for (const backend of ["react", "dom"]) {
    for (const family of ["text-corruption", "key-order", "enabled-control", "drop-click", "duplicate-click"]) {
      assert.ok(plan.cases.some((row) => row.id === `fault-${backend}-${family}`));
    }
  }
});

test("fault activation is pinned to the actual first render or first physical click", () => {
  for (const family of ["text-corruption", "key-order", "enabled-control"]) {
    for (const backend of ["react", "dom"]) {
      const row = caseFor(plan, `fault-${backend}-${family}`);
      assert.equal(row.activation.point, "after-initial-render");
      assert.equal(row.activation.eventIndex, null);
      assert.equal(row.activation.expectedCount, 1);
      assert.equal(row.checkpoint.kind, "initial");
      assert.equal(row.checkpoint.expectedEventsObserved, 0);
      assert.equal(row.checkpoint.expectedTraceTicks, 1);
      assert.equal(row.action, null);
    }
  }
  for (const family of ["drop-click", "duplicate-click"]) {
    for (const backend of ["react", "dom"]) {
      const row = caseFor(plan, `fault-${backend}-${family}`);
      assert.equal(row.activation.point, "physical-click");
      assert.equal(row.activation.eventIndex, 0);
      assert.equal(row.activation.targetPath, "1/0/1");
      assert.equal(row.activation.expectedCount, 1);
      assert.equal(row.checkpoint.kind, "after-event");
      assert.equal(row.checkpoint.expectedEventsObserved, 1);
      assert.equal(row.checkpoint.expectedTraceTicks, 2);
      assert.deepEqual(row.action, {
        path: "1/0/1", event: "click", value: "", message: { name: "counter.add", arg: "oak" },
      });
    }
  }
});

test("initial literal values match the independently pinned fixed Go projection", () => {
  const initial = baselineOracle.stateProjections[0];
  assert.match(initial.dom.html, /Parent generation 1; input step=1 locked=false revision=1; idle/);
  assert.deepEqual(initial.state.Children.map((child) => child.Key), ["oak", "elm"]);
  assert.equal(initial.dom.controls.find((control) => control.path === "0/1").disabled, true);
  assert.equal(plan.baseline.initialLiteral.controls[0].path, "0/1");
  assert.equal(plan.baseline.initialLiteral.controls[0].disabled, true);
});

test("first physical click has the literal oak count and trace checkpoint", () => {
  const first = baselineOracle.stateProjections[1];
  assert.equal(first.state.Children.find((child) => child.Key === "oak").Counter.Count, 1);
  assert.deepEqual(first.state.Input, { Step: 1, Locked: false, Revision: 1 });
  assert.equal(plan.baseline.firstAction.dispatchCount, 1);
  assert.equal(plan.baseline.firstAction.traceTicksAfterDispatch, 2);
  assert.equal(plan.baseline.firstAction.oakCountAfterDispatch, 1);
});

test("channel rules require the family witness and reject unknown or duplicate channels", () => {
  const dom = caseFor(plan, "fault-react-text-corruption");
  const disabled = caseFor(plan, "fault-dom-enabled-control");
  const drop = caseFor(plan, "fault-react-drop-click");
  const duplicate = caseFor(plan, "fault-dom-duplicate-click");
  assert.equal(channelsSatisfyCase(dom, ["dom"]), true);
  assert.equal(channelsSatisfyCase(dom, ["state"]), false);
  assert.equal(channelsSatisfyCase(disabled, ["disabled"]), true);
  assert.equal(channelsSatisfyCase(disabled, ["disabled", "dom"]), true);
  assert.equal(channelsSatisfyCase(disabled, ["dom"]), false);
  assert.equal(channelsSatisfyCase(drop, ["trace-count"]), true);
  assert.equal(channelsSatisfyCase(drop, ["dom"]), false);
  assert.equal(channelsSatisfyCase(duplicate, ["dispatch-count", "state"]), true);
  assert.equal(channelsSatisfyCase(duplicate, ["state"]), false);
  assert.equal(channelsSatisfyCase(duplicate, ["dispatch-count", "not-a-channel"]), false);
  assert.equal(channelsSatisfyCase(duplicate, ["dispatch-count", "dispatch-count"]), false);
});

test("every fault family has its literal witness policy on both backends", () => {
  const policies = {
    "text-corruption": { required: ["dom"], allowed: ["dom"], mode: "all" },
    "key-order": { required: ["dom"], allowed: ["dom"], mode: "all" },
    "enabled-control": { required: ["disabled"], allowed: ["disabled", "dom"], mode: "all" },
    "drop-click": { required: ["dispatch-count", "trace-count", "state"], allowed: ["dispatch-count", "trace-count", "state", "dom"], mode: "any" },
    "duplicate-click": { required: ["dispatch-count"], allowed: ["dispatch-count", "trace-count", "state", "dom"], mode: "all" },
  };
  for (const backend of ["react", "dom"]) {
    for (const [fault, policy] of Object.entries(policies)) {
      const row = caseFor(plan, `fault-${backend}-${fault}`);
      assert.deepEqual(row.expectedChannels, policy.required, `${row.id} required channels`);
      assert.deepEqual(row.allowedChannels, policy.allowed, `${row.id} allowed channels`);
      assert.equal(row.channelRule, policy.mode, `${row.id} channel rule`);
    }
  }
});

test("fault checkpoints use the pristine literal state, DOM, and fixed disabled-control path", () => {
  const initial = baselineOracle.stateProjections[0];
  const afterClick = baselineOracle.stateProjections[1];
  assert.equal(plan.baseline.initialLiteral.controls[0].path, "0/1");
  assert.equal(plan.baseline.initialLiteral.controls[0].disabled, true);
  assert.deepEqual(afterClick.state.Children.find((child) => child.Key === "oak").Counter.Count, 1);
  for (const backend of ["react", "dom"]) {
    for (const fault of ["text-corruption", "key-order", "enabled-control"]) {
      const row = caseFor(plan, `fault-${backend}-${fault}`);
      assert.deepEqual(row.checkpoint.baselineOracle, plan.baselineOracle);
      assert.equal(row.checkpoint.stateIndex, 0);
      assert.equal(row.checkpoint.expectedEventsObserved, 0);
      assert.equal(row.checkpoint.expectedTraceTicks, 1);
    }
    for (const fault of ["drop-click", "duplicate-click"]) {
      const row = caseFor(plan, `fault-${backend}-${fault}`);
      assert.deepEqual(row.checkpoint.baselineOracle, plan.baselineOracle);
      assert.equal(row.checkpoint.stateIndex, 1);
      assert.equal(row.checkpoint.expectedEventsObserved, 1);
      assert.equal(row.checkpoint.expectedTraceTicks, 2);
      assert.equal(row.checkpoint.literal.expectedOakCount, 1);
      assert.deepEqual(row.checkpoint.literal.expectedInput, { Step: 1, Locked: false, Revision: 1 });
    }
  }
  assert.ok(initial.dom.html.includes(plan.baseline.initialLiteral.parentStatusText));
  assert.deepEqual(afterClick.state.Input, plan.baseline.firstAction.input);
});

test("error-only and unactivated observations cannot count as semantic detection", async () => {
  for (const row of plan.cases.filter((item) => item.fault !== "none")) {
    assert.equal(row.activation.expectedCount, 1);
    assert.ok(row.expectedChannels.length > 0);
  }
  const probeText = await readFile(new URL("./plan.json", import.meta.url), "utf8");
  const parsed = JSON.parse(probeText);
  assert.equal(parsed.faultPolicy.genericExceptionsAreNotDetection, true);
  assert.equal(parsed.faultPolicy.faultsMustActivate, true);
  assert.equal(parsed.faultPolicy.infrastructureErrorsDisqualify, true);
  assert.equal(parsed.faultPolicy.pageErrorsDisqualify, true);
});

const rawReportPath = process.env.GOBI_QUALIFICATION_RAW_REPORT;
test("Go CLI certifies an actual mounted run and rejects malformed classification controls", {
  skip: rawReportPath ? false : "Set GOBI_QUALIFICATION_RAW_REPORT to a real N4 mounted run.",
}, async (t) => {
  const sourceReportBytes = await readFile(rawReportPath);
  const sourceReport = JSON.parse(sourceReportBytes.toString("utf8"));
  assert.equal(sourceReport.schema, "gobi.backend-qualification-run/v1");
  assert.equal(sourceReport.results.length, 13);

  const goBin = process.env.GOBI_GO_BIN || "go";
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gobi-qualification-oracle-cli-"));
  const binaryPath = path.join(tempRoot, "backend-qualification");
  const env = { ...process.env, GOTOOLCHAIN: "local", GOFLAGS: "-buildvcs=false" };
  try {
    const build = spawnSync(goBin, ["build", "-o", binaryPath, "./cmd/backend-qualification"], {
      cwd: repositoryRoot,
      env,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    assert.equal(build.status, 0, `Go CLI build failed: ${build.stderr || build.error || "no diagnostic"}`);

    async function stage(name, mutate) {
      const directory = path.join(tempRoot, name);
      await mkdir(directory, { recursive: true });
      await cp(path.resolve(path.dirname(rawReportPath), "cases"), path.join(directory, "cases"), { recursive: true });
      const raw = structuredClone(sourceReport);
      await mutate?.(directory, raw);
      await writeFile(path.join(directory, "qualification.raw.json"), `${JSON.stringify(raw, null, 2)}\n`);
      return { directory, raw };
    }

    async function runCLI(directory, expectSuccess) {
      const outputPath = path.join(directory, "certificate.json");
      const result = spawnSync(binaryPath, ["--input", path.join(directory, "qualification.raw.json"), "--output", outputPath], {
        cwd: directory,
        env,
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      });
      if (expectSuccess) {
        assert.equal(result.status, 0, `Go CLI rejected the real mounted run: ${result.stderr || result.stdout || "no diagnostic"}`);
        const certificate = JSON.parse(await readFile(outputPath, "utf8"));
        assert.equal(certificate.schema, "gobi.backend-qualification-certificate/v1");
        assert.equal(certificate.qualified, true);
        assert.equal(certificate.results.length, 13);
      } else {
        assert.notEqual(result.status, 0, `Go CLI accepted a negative control (${result.stdout || "no diagnostic"})`);
      }
    }

    const valid = await stage("actual-run", async (_directory, raw) => {
      // Evidence files are copied byte-for-byte from the real mounted N4 capture.
      assert.equal(raw.results.length, 13);
    });
    await runCLI(valid.directory, true);

    await t.test("rejects a missing case", async () => {
      const input = await stage("missing-case", (_directory, raw) => { raw.results.pop(); });
      await runCLI(input.directory, false);
    });
    await t.test("rejects a duplicate case", async () => {
      const input = await stage("duplicate-case", (_directory, raw) => { raw.results.push(structuredClone(raw.results[0])); });
      await runCLI(input.directory, false);
    });
    await t.test("rejects a negative case whose activation record was removed", async () => {
      const input = await stage("unactivated", async (directory, raw) => {
        const row = raw.results.find((item) => item.id === "fault-react-text-corruption");
        const evidencePath = path.join(directory, row.evidencePath);
        const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
        evidence.activation.activated = false;
        evidence.activation.activationCount = 0;
        evidence.activation.records = [];
        row.activated = false;
        row.activationCount = 0;
        const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
        await writeFile(evidencePath, bytes);
        row.evidenceSHA256 = createHash("sha256").update(bytes).digest("hex");
      });
      await runCLI(input.directory, false);
    });
    await t.test("rejects generic-error-only evidence", async () => {
      const input = await stage("generic-error-only", async (directory, raw) => {
        const row = raw.results.find((item) => item.id === "fault-react-text-corruption");
        const evidencePath = path.join(directory, row.evidencePath);
        const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
        for (const pair of Object.values(evidence.channelComparisons)) pair.observed = structuredClone(pair.expected);
        evidence.observedChannels = [];
        evidence.observed.state = structuredClone(evidence.baseline.state);
        evidence.observed.view = structuredClone(evidence.baseline.view);
        evidence.observed.dom = structuredClone(evidence.baseline.dom);
        evidence.observed.rendererDOM = structuredClone(evidence.baseline.dom);
        evidence.probeException = { name: "Error", message: "controlled exception with no semantic difference" };
        row.observedChannels = [];
        row.probeException = structuredClone(evidence.probeException);
        const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
        await writeFile(evidencePath, bytes);
        row.evidenceSHA256 = createHash("sha256").update(bytes).digest("hex");
      });
      await runCLI(input.directory, false);
    });
    await t.test("rejects empty semantic-channel evidence", async () => {
      const input = await stage("empty-channels", async (directory, raw) => {
        const row = raw.results.find((item) => item.id === "fault-react-text-corruption");
        const evidencePath = path.join(directory, row.evidencePath);
        const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
        for (const pair of Object.values(evidence.channelComparisons)) pair.observed = structuredClone(pair.expected);
        evidence.observedChannels = [];
        evidence.observed.state = structuredClone(evidence.baseline.state);
        evidence.observed.view = structuredClone(evidence.baseline.view);
        evidence.observed.dom = structuredClone(evidence.baseline.dom);
        evidence.observed.rendererDOM = structuredClone(evidence.baseline.dom);
        evidence.probeException = null;
        row.observedChannels = [];
        row.probeException = null;
        const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
        await writeFile(evidencePath, bytes);
        row.evidenceSHA256 = createHash("sha256").update(bytes).digest("hex");
      });
      await runCLI(input.directory, false);
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
