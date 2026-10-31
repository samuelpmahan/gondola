/** A fail-closed structural comparison for JSON trace values. */
export class TraceMismatchError extends Error {
  constructor(path, message, expected, actual) {
    super(`${path}: ${message}; expected ${format(expected)}, got ${format(actual)}`);
    this.name = "TraceMismatchError";
    this.path = path;
    this.expected = expected;
    this.actual = actual;
  }
}

function format(value) {
  if (Object.is(value, -0)) return "-0";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "undefined") return "undefined";
  try { return JSON.stringify(value); }
  catch { return Object.prototype.toString.call(value); }
}

function validateJSONValue(value, path, ancestors = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path}: non-finite number is not a JSON trace value`);
    return;
  }
  if (typeof value !== "object") throw new TypeError(`${path}: unsupported value of type ${typeof value}`);
  if (ancestors.has(value)) throw new TypeError(`${path}: cyclic value is not a JSON trace value`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Reflect.ownKeys(value);
      for (const key of keys) {
        if (key === "length") continue;
        if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
          throw new TypeError(`${path}: array has a non-index property`);
        }
      }
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new TypeError(`${path}[${index}]: sparse array is not a JSON trace value`);
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor)) throw new TypeError(`${path}[${index}]: accessor property is not a JSON trace value`);
        validateJSONValue(descriptor.value, `${path}[${index}]`, ancestors);
      }
      return;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path}: non-plain object is not a JSON trace value`);
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") throw new TypeError(`${path}: symbol key is not a JSON trace field`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw new TypeError(`${path}.${key}: accessor or non-enumerable property is not a JSON trace field`);
      }
      validateJSONValue(descriptor.value, `${path}.${key}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function childPath(path, key) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function firstMismatch(expected, actual, path) {
  if (Object.is(expected, actual)) return null;
  if (expected === null || actual === null || typeof expected !== typeof actual) {
    return new TraceMismatchError(path, "value type differs", expected, actual);
  }
  if (typeof expected !== "object") return new TraceMismatchError(path, "value differs", expected, actual);

  const expectedArray = Array.isArray(expected);
  const actualArray = Array.isArray(actual);
  if (expectedArray !== actualArray) return new TraceMismatchError(path, "array/object shape differs", expected, actual);
  if (expectedArray) {
    if (expected.length !== actual.length) {
      return new TraceMismatchError(`${path}.length`, "array length differs", expected.length, actual.length);
    }
    for (let index = 0; index < expected.length; index += 1) {
      const mismatch = firstMismatch(expected[index], actual[index], `${path}[${index}]`);
      if (mismatch) return mismatch;
    }
    return null;
  }

  const expectedKeys = Object.keys(expected).sort();
  const actualKeys = Object.keys(actual).sort();
  const max = Math.max(expectedKeys.length, actualKeys.length);
  for (let index = 0; index < max; index += 1) {
    const expectedKey = expectedKeys[index];
    const actualKey = actualKeys[index];
    if (expectedKey !== actualKey) {
      const key = expectedKey === undefined ? actualKey : actualKey === undefined ? expectedKey : [expectedKey, actualKey].sort()[0];
      const hasExpected = Object.hasOwn(expected, key);
      const hasActual = Object.hasOwn(actual, key);
      return new TraceMismatchError(childPath(path, key), "object field set differs",
        hasExpected ? expected[key] : "<missing>", hasActual ? actual[key] : "<missing>");
    }
    const mismatch = firstMismatch(expected[expectedKey], actual[actualKey], childPath(path, expectedKey));
    if (mismatch) return mismatch;
  }
  return null;
}

/**
 * Require exact JSON structure: object fields are closed, arrays are ordered,
 * null and empty arrays differ, and numeric equality uses Object.is (including
 * the sign bit of zero). Callers encode Go-specific values before comparison.
 */
export function assertExactTraceValue(expected, actual, path = "$") {
  validateJSONValue(expected, `${path}.expected`);
  validateJSONValue(actual, `${path}.actual`);
  const mismatch = firstMismatch(expected, actual, path);
  if (mismatch) throw mismatch;
}
