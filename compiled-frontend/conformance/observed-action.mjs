import { assertExactTraceValue } from "./compare.mjs";

/** Keep the script intent as the trace action while preserving the exact renderer observation separately. */
export function associateObservedAction(observed, intent) {
  if (intent === null || typeof intent !== "object" || Array.isArray(intent)) {
    throw new TypeError("requested Action intent must be an object");
  }
  if (typeof intent.path !== "string" || typeof intent.event !== "string" || typeof intent.value !== "string") {
    throw new TypeError("requested Action intent must contain string path, event, and value fields");
  }
  if (observed === null || typeof observed !== "object" || Array.isArray(observed)) {
    throw new TypeError("renderer Action observation must be an object");
  }
  const keys = Reflect.ownKeys(observed).sort();
  if (keys.length !== 3 || keys[0] !== "event" || keys[1] !== "path" || keys[2] !== "value") {
    throw new TypeError("renderer Action observation must contain exactly path, event, and value");
  }
  if (typeof observed.value !== "string") {
    throw new TypeError("renderer Action observation value must be a string");
  }
  assertExactTraceValue({ path: intent.path, event: intent.event, value: observed.value }, observed, "$.rendererAction");
  return { path: intent.path, event: intent.event, value: intent.value };
}
