import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  assertCleanHTTPProcessClose,
  retainPrimaryFailure,
  startHTTPProcess,
} from "./http-lab-process.mjs";

function fakeChild(killImpl = () => true) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.killSignals = [];
  child.kill = (signal) => {
    child.killSignals.push(signal);
    return killImpl(signal, child);
  };
  return child;
}

test("exit before readiness rejects promptly and close observes the already-recorded exit", async () => {
  const child = fakeChild();
  const lab = startHTTPProcess({
    command: "http-lab",
    spawnImpl: () => child,
    readinessTimeoutMs: 500,
    cleanupTimeoutMs: 20,
  });
  child.exitCode = 17;
  child.emit("exit", 17, null);

  await assert.rejects(lab.ready, /exited before readiness \(code=17, signal=null\)/);
  assert.deepEqual(await lab.close(), { kind: "exit", code: 17, signal: null });
  assert.deepEqual(child.killSignals, [], "an already-exited child is not killed or awaited again");
});

test("spawn error rejects readiness and cleanup returns without waiting for a nonexistent process", async () => {
  const child = fakeChild();
  const lab = startHTTPProcess({
    command: "missing-http-lab",
    spawnImpl: () => child,
    readinessTimeoutMs: 500,
    cleanupTimeoutMs: 20,
  });
  const failure = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
  child.emit("error", failure);

  await assert.rejects(lab.ready, /failed to start: spawn ENOENT/);
  const outcome = await lab.close();
  assert.equal(outcome.kind, "spawn-error");
  assert.equal(outcome.error.message, failure.message);
  assert.deepEqual(child.killSignals, []);
});

test("synchronous spawn failure is surfaced immediately", () => {
  assert.throws(() => startHTTPProcess({
    command: "bad-lab",
    spawnImpl() { throw new Error("spawn syscall failed"); },
  }), /could not spawn HTTP lab: spawn syscall failed/);
});

test("cleanup escalates to SIGKILL and stays bounded if no exit event follows", async () => {
  const child = fakeChild();
  const lab = startHTTPProcess({
    command: "http-lab",
    spawnImpl: () => child,
    readinessTimeoutMs: 500,
    cleanupTimeoutMs: 10,
  });
  child.stdout.write('{"url":"http://127.0.0.1:1234"}\n');
  assert.equal(await lab.ready, "http://127.0.0.1:1234");

  const started = Date.now();
  const outcome = await lab.close();
  assert.deepEqual(outcome, { kind: "timed-out", timeoutMs: 10, residual: true });
  assert.deepEqual(child.killSignals, ["SIGTERM", "SIGKILL"]);
  assert.ok(Date.now() - started < 250, "cleanup should not wait without a bound");
});

test("cleanup waits on the exit listener registered at spawn time after termination", async () => {
  const child = fakeChild((signal, process) => {
    if (signal === "SIGKILL") {
      process.exitCode = 0;
      process.signalCode = signal;
      queueMicrotask(() => process.emit("exit", 0, signal));
    }
    return true;
  });
  const lab = startHTTPProcess({
    command: "http-lab",
    spawnImpl: () => child,
    readinessTimeoutMs: 500,
    cleanupTimeoutMs: 30,
  });
  child.stdout.write('{"url":"http://127.0.0.1:1234"}\n');
  await lab.ready;
  const outcome = await lab.close();
  assert.deepEqual(outcome, { kind: "exit", code: 0, signal: "SIGKILL" });
  assert.equal(assertCleanHTTPProcessClose(outcome), outcome);
  assert.deepEqual(child.killSignals, ["SIGTERM", "SIGKILL"]);
});

test("a post-spawn kill error does not resolve terminal observation or skip SIGKILL", async () => {
  const killError = Object.assign(new Error("kill EPERM"), { code: "EPERM" });
  const child = fakeChild((signal, process) => {
    if (signal === "SIGTERM") {
      queueMicrotask(() => process.emit("error", killError));
      return false;
    }
    if (signal === "SIGKILL") {
      process.exitCode = 0;
      process.signalCode = signal;
      queueMicrotask(() => process.emit("exit", 0, signal));
    }
    return true;
  });
  const lab = startHTTPProcess({
    command: "http-lab",
    spawnImpl: () => child,
    readinessTimeoutMs: 500,
    cleanupTimeoutMs: 10,
  });
  child.emit("spawn");
  child.stdout.write('{"url":"http://127.0.0.1:1234"}\n');
  await lab.ready;

  const outcome = await lab.close();
  assert.deepEqual(child.killSignals, ["SIGTERM", "SIGKILL"]);
  assert.equal(outcome.kind, "exit");
  assert.equal(outcome.processErrors[0].message, "kill EPERM");
  assert.equal(outcome.killFailures[0].signal, "SIGTERM");
  assert.throws(() => assertCleanHTTPProcessClose(outcome), /post-spawn process error/);
});

test("cleanup reports a residual process and failed signal attempts after bounded escalation", async () => {
  const child = fakeChild((signal) => {
    if (signal === "SIGTERM") throw new Error("SIGTERM denied");
    return false;
  });
  const lab = startHTTPProcess({
    command: "http-lab",
    spawnImpl: () => child,
    readinessTimeoutMs: 500,
    cleanupTimeoutMs: 10,
  });
  child.emit("spawn");
  child.stdout.write('{"url":"http://127.0.0.1:1234"}\n');
  await lab.ready;

  const started = Date.now();
  const outcome = await lab.close();
  assert.equal(outcome.kind, "timed-out");
  assert.equal(outcome.residual, true);
  assert.deepEqual(outcome.killFailures.map((failure) => failure.signal), ["SIGTERM", "SIGKILL"]);
  assert.ok(Date.now() - started < 250, "cleanup should remain bounded after both kill failures");
});

test("smoke cleanup assertion rejects a timeout, residual process, or kill failure", () => {
  assert.throws(() => assertCleanHTTPProcessClose({
    kind: "timed-out",
    residual: true,
    killFailures: [{ signal: "SIGKILL", message: "kill() returned false" }],
  }), /HTTP lab cleanup failed.*SIGKILL: kill\(\) returned false/);
  assert.throws(() => assertCleanHTTPProcessClose({
    kind: "exit",
    code: 0,
    signal: "SIGTERM",
    killFailures: [{ signal: "SIGTERM", message: "denied" }],
  }), /signal attempt\(s\) failed/);
});

test("cleanup diagnostics stay attached to the primary operation failure", () => {
  const operationError = new Error("browser operation failed");
  const cleanupError = new Error("lab remained alive");
  assert.equal(retainPrimaryFailure(operationError, [cleanupError]), operationError);
  assert.deepEqual(operationError.cleanupErrors, [cleanupError]);
  const frozenOperationError = Object.freeze(new Error("frozen browser failure"));
  assert.equal(retainPrimaryFailure(frozenOperationError, [cleanupError]), frozenOperationError);
  assert.ok(retainPrimaryFailure(null, [cleanupError]) instanceof AggregateError);
});
