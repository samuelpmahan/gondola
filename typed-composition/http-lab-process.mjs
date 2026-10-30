import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function errorRecord(error) {
  return {
    message: errorText(error),
    ...(error && typeof error === "object" && "code" in error ? { code: error.code } : {}),
  };
}

function bounded(value, fallback, label) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > 60_000) {
    throw new RangeError(`${label} must be an integer from 1 through 60000 milliseconds`);
  }
  return value;
}

/** Fail when close() could not confirm a clean, error-free process exit. */
export function assertCleanHTTPProcessClose(result) {
  const failures = [];
  if (!result || (result.kind !== "exit" && result.kind !== "close")) {
    failures.push(`terminal observation was ${result?.kind ?? "missing"}`);
  }
  if (result?.residual) failures.push("the HTTP lab process may still be running");
  if (result?.killFailures?.length) failures.push(`${result.killFailures.length} signal attempt(s) failed`);
  if (result?.processErrors?.length) failures.push(`${result.processErrors.length} post-spawn process error(s) occurred`);
  if (failures.length) {
    const details = [
      ...(result?.killFailures ?? []).map(({ signal, message }) => `${signal}: ${message}`),
      ...(result?.processErrors ?? []).map(({ message }) => message),
    ];
    throw new Error(`HTTP lab cleanup failed (${failures.join(", ")})${details.length ? `: ${details.join("; ")}` : ""}`);
  }
  return result;
}

/** Keep the operation error primary when teardown also fails. */
export function retainPrimaryFailure(primaryError, cleanupErrors, hasPrimary = primaryError !== null && primaryError !== undefined) {
  if (cleanupErrors.length === 0) return hasPrimary ? primaryError : null;
  if (!hasPrimary) return new AggregateError(cleanupErrors, "HTTP lab/browser cleanup failed");
  if (typeof primaryError === "object" && primaryError !== null && Object.isExtensible(primaryError)) {
    try {
      Object.defineProperty(primaryError, "cleanupErrors", {
        configurable: true,
        enumerable: false,
        value: cleanupErrors,
      });
      return primaryError;
    } catch {
      // Browser smoke also logs cleanup failures, so preserving this error is enough.
    }
  }
  return primaryError;
}

/**
 * Start the loopback lab and capture its terminal observation before readiness
 * can settle. Only exit/close or a pre-spawn error resolves that observation;
 * post-spawn errors are retained while bounded SIGTERM/SIGKILL cleanup continues.
 */
export function startHTTPProcess({
  command,
  args = [],
  cwd,
  spawnImpl = spawn,
  readinessTimeoutMs,
  cleanupTimeoutMs,
} = {}) {
  if (typeof command !== "string" || command.length === 0) throw new TypeError("command must be a nonempty string");
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) throw new TypeError("args must be strings");
  if (typeof spawnImpl !== "function") throw new TypeError("spawnImpl must be a function");
  const readyTimeout = bounded(readinessTimeoutMs, 10_000, "readinessTimeoutMs");
  const cleanupTimeout = bounded(cleanupTimeoutMs, 2_000, "cleanupTimeoutMs");

  let child;
  try {
    child = spawnImpl(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    throw new Error(`could not spawn HTTP lab: ${errorText(error)}`, { cause: error });
  }
  if (!child || typeof child.once !== "function" || typeof child.kill !== "function" ||
      !child.stdout || typeof child.stdout.on !== "function" ||
      !child.stderr || typeof child.stderr.on !== "function") {
    throw new TypeError("spawnImpl must return a child process with stdout, stderr, once(), and kill()");
  }

  const lines = createInterface({ input: child.stdout });
  let stderr = "";
  child.stderr.setEncoding?.("utf8");
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });

  let spawned = Number.isInteger(child.pid) && child.pid > 0;
  let terminalResult = null;
  let terminalResolve;
  const exit = new Promise((resolve) => { terminalResolve = resolve; });
  const processErrors = [];
  const killFailures = [];
  function finishTerminal(result) {
    if (terminalResult) return;
    terminalResult = result;
    terminalResolve(result);
  }
  function withDiagnostics(result, residual = false) {
    return {
      ...result,
      ...(processErrors.length ? { processErrors: [...processErrors] } : {}),
      ...(killFailures.length ? { killFailures: [...killFailures] } : {}),
      ...(residual ? { residual: true } : {}),
    };
  }

  let readySettled = false;
  let readyResolve;
  let readyReject;
  let readinessTimer;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  function settleReady(error, value) {
    if (readySettled) return;
    readySettled = true;
    clearTimeout(readinessTimer);
    if (error) readyReject(error);
    else readyResolve(value);
  }
  function readinessError(message, cause) {
    return new Error(`HTTP lab ${message}${stderr ? `: ${stderr.trim()}` : ""}`, cause === undefined ? undefined : { cause });
  }
  function reportEarlyTerminal(result) {
    if (!readySettled) {
      settleReady(readinessError(`exited before readiness (code=${result.code}, signal=${result.signal})`));
    }
  }

  child.once("spawn", () => { spawned = true; });
  child.once("exit", (code, signal) => {
    const result = { kind: "exit", code, signal };
    finishTerminal(result);
    reportEarlyTerminal(result);
  });
  child.once("close", (code, signal) => {
    const result = { kind: "close", code, signal };
    finishTerminal(result);
    reportEarlyTerminal(result);
  });
  child.on("error", (error) => {
    const record = errorRecord(error);
    if (!spawned) {
      finishTerminal({ kind: "spawn-error", error: record });
      if (!readySettled) settleReady(readinessError(`failed to start: ${record.message}`, error));
      return;
    }
    processErrors.push(record);
    if (!readySettled) settleReady(readinessError(`reported a process error before readiness: ${record.message}`, error));
  });

  // Preserve state if an adapter reports completion before listener setup.
  if (child.exitCode !== null && child.exitCode !== undefined) {
    const result = { kind: "exit", code: child.exitCode, signal: child.signalCode ?? null };
    finishTerminal(result);
    reportEarlyTerminal(result);
  } else if (child.signalCode !== null && child.signalCode !== undefined) {
    const result = { kind: "exit", code: null, signal: child.signalCode };
    finishTerminal(result);
    reportEarlyTerminal(result);
  }

  lines.once("line", (line) => {
    try {
      const result = JSON.parse(line);
      if (typeof result.url !== "string" || result.url.length === 0) throw new Error("readiness record has no url");
      // A readiness record can only come from the running lab, even for an
      // adapter that does not expose ChildProcess's asynchronous spawn event.
      spawned = true;
      settleReady(null, result.url);
    } catch (error) {
      settleReady(readinessError(`returned invalid readiness data: ${errorText(error)}`, error));
    }
  });
  if (!readySettled) {
    readinessTimer = setTimeout(() => {
      settleReady(readinessError(`readiness timed out after ${readyTimeout} ms`));
    }, readyTimeout);
  }

  let closePromise = null;
  async function close() {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      lines.close();
      if (terminalResult) return withDiagnostics(terminalResult);

      function sendSignal(signal) {
        try {
          if (child.kill(signal) === false) {
            killFailures.push({ signal, message: "kill() returned false" });
          }
        } catch (error) {
          killFailures.push({ signal, ...errorRecord(error) });
        }
      }
      const wait = (milliseconds) => {
        let timer;
        return Promise.race([
          exit,
          new Promise((resolve) => { timer = setTimeout(() => resolve(null), milliseconds); }),
        ]).finally(() => clearTimeout(timer));
      };

      sendSignal("SIGTERM");
      let result = await wait(cleanupTimeout);
      if (result) return withDiagnostics(result);
      sendSignal("SIGKILL");
      result = await wait(cleanupTimeout);
      if (result) return withDiagnostics(result);
      return withDiagnostics({ kind: "timed-out", timeoutMs: cleanupTimeout }, true);
    })();
    return closePromise;
  }

  return { child, lines, ready, exit, close };
}
