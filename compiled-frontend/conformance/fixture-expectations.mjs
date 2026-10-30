import { assertExactTraceValue } from "./compare.mjs";

function fail(path, message) {
  throw new TypeError(`${path}: ${message}`);
}

function exactKeys(value, keys, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "expected object");
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) {
    fail(path, `fields must be exactly ${expected.join(",")}`);
  }
}

function bits(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "expected finite fixture float64");
  const data = new DataView(new ArrayBuffer(8));
  data.setFloat64(0, value, false);
  return data.getBigUint64(0, false).toString(16).padStart(16, "0");
}

function integer(value, info, path) {
  let text;
  if (typeof value === "bigint") text = value.toString(10);
  else if (typeof value === "number" && Number.isSafeInteger(value)) text = String(value);
  else if (typeof value === "string" && /^(0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(value)) text = value;
  else fail(path, "fixture integer must be exact decimal or safe number");
  const parsed = BigInt(text);
  const minimum = info.kind === "uint" ? 0n : -(1n << BigInt(info.bits - 1));
  const maximum = info.kind === "uint" ? (1n << BigInt(info.bits)) - 1n : (1n << BigInt(info.bits - 1)) - 1n;
  if (parsed < minimum || parsed > maximum) fail(path, `outside ${info.kind}${info.bits} range`);
  return text;
}

function encode(value, typeId, table, path) {
  const info = table.get(typeId);
  if (!info) fail(path, `unknown AppIR type ${typeId}`);
  const result = { typeId, kind: info.kind };
  switch (info.kind) {
    case "bool":
      if (typeof value !== "boolean") fail(path, "expected boolean");
      result.bool = value;
      return result;
    case "string":
      if (typeof value !== "string") fail(path, "expected string");
      result.string = value;
      return result;
    case "int":
    case "uint":
      result.integer = integer(value, info, path);
      return result;
    case "float64":
      result.float64Bits = typeof value === "string" && /^[0-9a-f]{16}$/.test(value) ? value : bits(value, path);
      return result;
    case "struct": {
      const expected = info.fields.map((field) => field.name);
      for (const field of info.fields) {
        if (field.type && table.get(field.type)?.kind === "float64" && Object.hasOwn(value ?? {}, `${field.name}Bits`)) {
          expected[expected.indexOf(field.name)] = `${field.name}Bits`;
        }
      }
      exactKeys(value, expected, path);
      result.fields = info.fields.map((field) => {
        const bitsKey = `${field.name}Bits`;
        const key = Object.hasOwn(value, bitsKey) ? bitsKey : field.name;
        return { name: field.name, value: encode(value[key], field.type, table, `${path}.${key}`) };
      });
      return result;
    }
    case "slice": {
      const isNil = value === null;
      const items = isNil ? [] : value;
      if (!Array.isArray(items)) fail(path, "slice expectation must be null or array");
      result.isNil = isNil;
      result.items = items.map((item, index) => encode(item, info.elemType, table, `${path}[${index}]`));
      return result;
    }
    case "array":
      if (!Array.isArray(value) || value.length !== info.length) fail(path, `expected array length ${info.length}`);
      result.items = value.map((item, index) => encode(item, info.elemType, table, `${path}[${index}]`));
      return result;
    default:
      fail(path, `unsupported fixture TypeInfo kind ${JSON.stringify(info.kind)}`);
  }
}

export function encodeFixtureState(state, stateType, types) {
  if (!Array.isArray(types)) throw new TypeError("AppIR.types must be an array");
  const table = new Map(types.map((info) => [info.id, info]));
  if (table.size !== types.length) throw new TypeError("AppIR.types contains duplicate type IDs");
  return encode(state, stateType, table, "$.fixtureState");
}

function traceActionExpectation(entry, fixture, app, index) {
  const component = app.components.find((item) => item.packagePath === fixture.packagePath);
  if (!component) throw new TypeError(`fixture package ${fixture.packagePath} has no AppIR component`);
  const action = fixture.actions[entry.actionIndex];
  const message = entry.message;
  return {
    action,
    message,
    dispatchId: entry.dispatchId ?? null,
    state: encodeFixtureState(entry.state, component.stateType, app.types),
    requestedEffects: entry.requestedEffects ?? [],
    completedEffects: entry.completedEffects ?? [],
  };
}

/** Compare every init/action/reply state and event channel to the hand-authored fixture oracle. */
export function validateFixtureExpectations(trace, fixture, app) {
  if (!Array.isArray(fixture.expectations) || !Array.isArray(fixture.actions)) throw new TypeError("fixture expectations/actions must be arrays");
  const component = app.components.find((item) => item.packagePath === fixture.packagePath);
  if (!component) throw new TypeError(`fixture package ${fixture.packagePath} has no AppIR component`);
  const expectedTicks = [{
    action: null,
    message: null,
    dispatchId: null,
    state: encodeFixtureState(fixture.initialState, component.stateType, app.types),
    requestedEffects: [],
    completedEffects: [],
  }];
  for (const entry of fixture.expectations) {
    if (Number.isSafeInteger(entry.actionIndex)) expectedTicks.push(traceActionExpectation(entry, fixture, app));
    else if (Number.isSafeInteger(entry.completionIndex)) {
      expectedTicks.push({
        action: null,
        message: entry.message,
        dispatchId: entry.dispatchId,
        state: encodeFixtureState(entry.state, component.stateType, app.types),
        requestedEffects: entry.requestedEffects ?? [],
        completedEffects: entry.completedEffects ?? [],
      });
    } else {
      throw new TypeError("fixture expectation needs actionIndex or completionIndex");
    }
  }
  if (trace.ticks.length !== expectedTicks.length) {
    throw new Error(`fixture tick count differs: expected ${expectedTicks.length}, got ${trace.ticks.length}`);
  }
  for (let index = 0; index < expectedTicks.length; index += 1) {
    const tick = trace.ticks[index];
    assertExactTraceValue(expectedTicks[index], {
      action: tick.action,
      message: tick.message,
      dispatchId: tick.dispatchId,
      state: tick.state,
      requestedEffects: tick.requestedEffects,
      completedEffects: tick.completedEffects,
    }, `$.ticks[${index}].fixtureExpectation`);
  }
  return true;
}
