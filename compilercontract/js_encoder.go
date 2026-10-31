package compilercontract

import (
	"encoding/json"
	"fmt"
)

// GenerateValueEncoder returns a standalone ES module whose exported
// gobiEncodeState function converts one GoScript value to the canonical Value
// tagged union. The descriptors are embedded from AppIR type metadata; the
// runtime checks use only the shapes established by the pinned GoScript ABI.
func GenerateValueEncoder(types []TypeInfo) (string, error) {
	return generateValueEncoder(types, false)
}

// GenerateGoScriptValueEncoder returns a standalone ES module whose string
// values are decoded from GoScript's one-code-unit-per-UTF-8-byte form.
// GenerateValueEncoder retains its historical JavaScript-string behavior.
func GenerateGoScriptValueEncoder(types []TypeInfo) (string, error) {
	return generateValueEncoder(types, true)
}

func generateValueEncoder(types []TypeInfo, goScriptStrings bool) (string, error) {
	if _, err := indexTypes(types); err != nil {
		return "", err
	}
	for _, info := range types {
		if !validJSRepresentation(info) {
			return "", fmt.Errorf("type %q has missing or incompatible jsRepresentation %q", info.ID, info.JSRepresentation)
		}
	}
	if err := validateSliceRepresentations(types); err != nil {
		return "", err
	}
	descriptors, err := json.Marshal(types)
	if err != nil {
		return "", err
	}
	goScriptStringDecoder := ""
	stringCase := "base.string = value; return base;"
	if goScriptStrings {
		goScriptStringDecoder = `const GO_STRING_DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
function decodeGoScriptString(value, label) {
  if (typeof value !== "string") fail(label + " must be a string");
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code > 0xff) fail(label + " is not a GoScript byte string");
    bytes[i] = code;
  }
  try {
    return GO_STRING_DECODER.decode(bytes);
  } catch {
    fail(label + " contains invalid UTF-8");
  }
}
`
		stringCase = `base.string = decodeGoScriptString(value, "type " + id); return base;`
	}
	return `// Generated from compilercontract.TypeInfo. Do not edit.
const TYPES = ` + string(descriptors) + `;
const TYPE = new Map(TYPES.map((t) => [t.id, t]));
const MARKER = "__goStructValue";
const MAX_DEPTH = 256;
const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
const fail = (message) => { throw new TypeError(message); };
function dataObject(value, expectedKeys, label) {
  if (value === null || typeof value !== "object") fail(label + " must be an object");
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expectedKeys.length || expectedKeys.some((key, i) => keys[i] !== key)) {
    fail(label + " has unexpected own fields");
  }
  const result = Object.create(null);
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !own(descriptor, "value")) fail(label + "." + key + " must be an own data property");
    result[key] = descriptor.value;
  }
  return result;
}
function ownArray(value, label) {
  if (!Array.isArray(value)) fail(label + " must be an Array");
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !own(lengthDescriptor, "value") || !Number.isSafeInteger(lengthDescriptor.value)) fail(label + " has invalid length");
  const length = lengthDescriptor.value;
  if (Reflect.ownKeys(value).length !== length + 1) fail(label + " has unexpected own fields");
  const items = new Array(length);
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !own(descriptor, "value")) fail(label + "[" + i + "] must be an own data property");
    items[i] = descriptor.value;
  }
  return items;
}
function exactDataDescriptor(descriptor, enumerable, writable, configurable) {
  return !!descriptor && own(descriptor, "value") &&
    descriptor.enumerable === enumerable && descriptor.writable === writable && descriptor.configurable === configurable;
}
function spareZeroFactoryShape(value) {
  if (typeof value !== "function") return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 2 || keys[0] !== "length" || keys[1] !== "name") return false;
  const length = Object.getOwnPropertyDescriptor(value, "length");
  const name = Object.getOwnPropertyDescriptor(value, "name");
  return exactDataDescriptor(length, false, false, true) && length.value === 0 &&
    exactDataDescriptor(name, false, false, true) && name.value === "";
}
function ownGoScriptBacking(value, offset, length, capacity, label) {
  if (!Array.isArray(value)) fail(label + " must be an Array backing");
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!exactDataDescriptor(lengthDescriptor, false, true, false) || !Number.isSafeInteger(lengthDescriptor.value)) fail(label + " has invalid backing length");
  const backingLength = lengthDescriptor.value;
  const windowEnd = offset + length;
  const capacityEnd = offset + capacity;
  if (!Number.isSafeInteger(windowEnd) || !Number.isSafeInteger(capacityEnd) || windowEnd > capacityEnd || capacityEnd > backingLength) {
    fail(label + " exceeds its backing storage");
  }

  let hasSpareZero = false;
  const indices = [];
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key === "symbol") {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (hasSpareZero || key.description !== "goscript.spareZero" || Symbol.keyFor(key) !== undefined ||
          !exactDataDescriptor(descriptor, true, true, true) || !spareZeroFactoryShape(descriptor.value)) {
        fail(label + " has an unapproved backing symbol");
      }
      hasSpareZero = true;
      continue;
    }
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index < 0 || index >= backingLength || String(index) !== key) {
      fail(label + " has unexpected own fields");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!exactDataDescriptor(descriptor, true, true, true)) fail(label + "[" + key + "] must be an own data property");
    indices.push(index);
  }
  indices.sort((a, b) => a - b);
  let nextIndex = 0;
  for (const index of indices) {
    if (index > nextIndex && (!hasSpareZero || nextIndex < windowEnd || index > capacityEnd)) {
      fail(label + " has holes outside unused GoSlice capacity");
    }
    nextIndex = index + 1;
  }
  if (nextIndex < backingLength && (!hasSpareZero || nextIndex < windowEnd || backingLength > capacityEnd)) {
    fail(label + " has holes outside unused GoSlice capacity");
  }

  const items = new Array(length);
  for (let i = 0; i < length; i += 1) {
    const index = String(offset + i);
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!exactDataDescriptor(descriptor, true, true, true)) fail(label + "[" + index + "] must be an own data property");
    items[i] = descriptor.value;
  }
  return items;
}
function ownFloat64Array(value, label) {
  if (!(value instanceof Float64Array)) fail(label + " must be a Float64Array");
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length || keys.some((key, i) => key !== String(i))) fail(label + " has unexpected own fields");
  return Array.from(value);
}
function sliceItems(value, representation, elem, label) {
  if (value === null) return null;
  const wantsFloat = elem.kind === "float64";
  if (Array.isArray(value)) {
    if (representation === "goscript-slice" || representation === "float64-array" || representation === "float64-array-or-goscript-slice") {
      if (wantsFloat && (representation === "float64-array" || representation === "float64-array-or-goscript-slice")) fail(label + " must be a Float64Array or GoSlice wrapper");
      if (representation === "goscript-slice") fail(label + " must be a GoSlice wrapper");
    }
    return ownArray(value, label);
  }
  if (typeof value !== "object") fail(label + " must be a supported slice value");
  if (!(representation === "goscript-slice" || representation === "array-or-goscript-slice" || representation === "float64-array-or-goscript-slice")) {
    fail(label + " has an unapproved GoSlice representation");
  }
  const slice = dataObject(value, ["backing", "offset", "length", "capacity", "target"], label + " GoSlice");
  if (slice.target !== undefined || !Number.isSafeInteger(slice.offset) || !Number.isSafeInteger(slice.length) || !Number.isSafeInteger(slice.capacity) || slice.offset < 0 || slice.length < 0 || slice.capacity < slice.length) {
    fail(label + " has invalid GoSlice metadata");
  }
  const backing = slice.backing;
  if (!Number.isSafeInteger(slice.offset + slice.length) || !Number.isSafeInteger(slice.offset + slice.capacity)) {
    fail(label + " has unsafe GoSlice bounds");
  }
  let backingItems;
  if (wantsFloat) {
    backingItems = ownFloat64Array(backing, label + " GoSlice backing");
    if (slice.offset + slice.capacity > backingItems.length) fail(label + " GoSlice exceeds its backing storage");
    backingItems = backingItems.slice(slice.offset, slice.offset + slice.length);
  } else {
    backingItems = ownGoScriptBacking(backing, slice.offset, slice.length, slice.capacity, label + " GoSlice backing");
  }
  return backingItems;
}
function numberToInteger(value, type) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) fail("type " + type.id + " requires an exact safe integer Number");
  const n = BigInt(value);
  const bits = BigInt(type.bits);
  const min = type.kind === "int" ? -(1n << (bits - 1n)) : 0n;
  const max = type.kind === "int" ? (1n << (bits - 1n)) - 1n : (1n << bits) - 1n;
  if (n < min || n > max) fail("integer is outside the declared Go width for " + type.id);
  return n.toString(10);
}
function bigintToInteger(value, type) {
  if (typeof value !== "bigint") fail("type " + type.id + " requires BigInt");
  const bits = BigInt(type.bits);
  const min = type.kind === "int" ? -(1n << (bits - 1n)) : 0n;
  const max = type.kind === "int" ? (1n << (bits - 1n)) - 1n : (1n << bits) - 1n;
  if (value < min || value > max) fail("integer is outside the declared Go width for " + type.id);
  return value.toString(10);
}
function floatBits(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail("float64 must be finite");
  const bytes = new ArrayBuffer(8);
  const view = new DataView(bytes);
  view.setFloat64(0, value, false);
  return view.getBigUint64(0, false).toString(16).padStart(16, "0");
}
function wellFormedString(value) {
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (i + 1 >= value.length) return false;
      const next = value.charCodeAt(i + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      i += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}
` + goScriptStringDecoder + `function encode(value, id, depth) {
  if (depth > MAX_DEPTH) fail("value nesting exceeds " + MAX_DEPTH);
  const type = TYPE.get(id);
  if (!type) fail("unknown typeId " + id);
  const base = { typeId: id, kind: type.kind };
  switch (type.kind) {
    case "bool":
      if (typeof value !== "boolean") fail("type " + id + " requires boolean");
      base.bool = value; return base;
    case "string":
      if (typeof value !== "string" || !wellFormedString(value)) fail("type " + id + " requires a well-formed string");
      ` + stringCase + `
    case "int": case "uint":
      base.integer = type.jsRepresentation === "bigint" ? bigintToInteger(value, type) : numberToInteger(value, type);
      return base;
    case "float64":
      base.float64Bits = floatBits(value); return base;
    case "struct": {
      if (value === null || typeof value !== "object") fail("type " + id + " requires a generated struct class");
      const names = type.fields.map((f) => f.name);
      const keys = Reflect.ownKeys(value);
      const expected = [...names, MARKER];
      if (keys.length !== expected.length || expected.some((key, i) => keys[i] !== key)) fail("struct " + id + " has missing or extra own fields");
      const values = dataObject(value, expected, "struct " + id);
      if (values[MARKER] !== true) fail("struct " + id + " lacks the GoScript value marker");
      base.fields = type.fields.map((field) => ({ name: field.name, value: encode(values[field.name], field.type, depth + 1) }));
      return base;
    }
    case "array": {
      const items = ownArray(value, "array " + id);
      if (items.length !== type.length) fail("array " + id + " has wrong length");
      base.items = items.map((item) => encode(item, type.elemType, depth + 1));
      return base;
    }
    case "slice": {
      if (value === null) { base.isNil = true; base.items = []; return base; }
      const elem = TYPE.get(type.elemType);
      if (!elem) fail("unknown slice element type " + type.elemType);
      let items;
      if ((type.jsRepresentation === "float64-array" || type.jsRepresentation === "float64-array-or-goscript-slice") && value instanceof Float64Array) items = ownFloat64Array(value, "slice " + id);
      else items = sliceItems(value, type.jsRepresentation, elem, "slice " + id);
      if (items === null) { base.isNil = true; base.items = []; return base; }
      base.isNil = false;
      base.items = items.map((item) => encode(item, type.elemType, depth + 1));
      return base;
    }
    default: fail("unsupported type kind " + type.kind);
  }
}
export function gobiEncodeState(value, typeId) { return encode(value, typeId, 0); }
`, nil
}
