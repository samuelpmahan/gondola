// Review-only deterministic probe: a live child reports an asynchronous SIGTERM
// error, then would exit if SIGKILL were attempted. This is not production code.
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { startHTTPProcess } from "../../http-lab-process.mjs";

const child = new EventEmitter();
child.stdout = new PassThrough();
child.stderr = new PassThrough();
child.exitCode = null;
child.signalCode = null;
child.killSignals = [];
child.kill = (signal) => {
  child.killSignals.push(signal);
  if (signal === "SIGTERM") {
    queueMicrotask(() => child.emit("error", Object.assign(new Error("kill EPERM"), { code: "EPERM" })));
  }
  if (signal === "SIGKILL") queueMicrotask(() => child.emit("exit", 0, signal));
  return signal !== "SIGTERM";
};

const lab = startHTTPProcess({
  command: "http-lab",
  spawnImpl: () => child,
  readinessTimeoutMs: 100,
  cleanupTimeoutMs: 10,
});
child.stdout.write('{"url":"http://127.0.0.1:1234"}\n');
await lab.ready;
const outcome = await lab.close();
console.log(JSON.stringify({ outcomeKind: outcome?.kind, killSignals: child.killSignals }));
