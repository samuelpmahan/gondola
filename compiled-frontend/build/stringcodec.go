package build

// goScriptStringBoundarySource emits the explicit GoScript/JavaScript string
// boundary used by the generated compiled module. GoScript stores Go strings
// as one JavaScript code unit per UTF-8 byte; renderer-facing values are cloned
// into Unicode strings, and JavaScript messages are encoded before Update.
const goScriptStringBoundarySource = `import {
  GoSlice as __gobiGoSlice,
  goString as __gobiGoString,
  stringToBytes as __gobiStringToBytes,
} from "@goscript/builtin/index.js";
import { Message as __gobiMessage } from "@goscript/github.com/samuelpmahan/gondola/gobi/index.js";

const __gobiMaxBoundaryDepth = 256;
const __gobiUtf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const __gobiOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function __gobiWellFormedUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function __gobiEncodeGoString(value, label) {
  if (typeof value !== "string" || !__gobiWellFormedUnicode(value)) {
    throw new TypeError(label + " must be well-formed Unicode text");
  }
  return __gobiGoString(value);
}

function __gobiDecodeGoString(value, label) {
  if (typeof value !== "string") throw new TypeError(label + " must be a GoScript string");
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0xff) {
      throw new TypeError(label + " is not in GoScript byte-string form");
    }
  }
  try {
    return __gobiUtf8Decoder.decode(__gobiStringToBytes(value));
  } catch (error) {
    throw new TypeError(label + " contains invalid UTF-8", { cause: error });
  }
}

function __gobiCloneBoundaryValue(value, depth, active, memo) {
  if (depth > __gobiMaxBoundaryDepth) throw new TypeError("GoScript view exceeds the string-boundary depth limit");
  if (typeof value === "string") return __gobiDecodeGoString(value, "GoScript view string");
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
  if (typeof value === "function") return value;
  if (active.has(value)) throw new TypeError("GoScript view contains a cycle");
  if (memo.has(value)) return memo.get(value);

  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) throw new TypeError("GoScript view contains an unsupported DataView");
    const clone = new value.constructor(value);
    memo.set(value, clone);
    return clone;
  }

  active.add(value);
  let clone;
  if (Array.isArray(value)) {
    const metadata = Object.getOwnPropertyDescriptor(value, "__meta__")?.value;
    if (metadata !== undefined) {
      if (metadata === null || typeof metadata !== "object" || !Array.isArray(metadata.backing) ||
          !Number.isSafeInteger(metadata.offset) || !Number.isSafeInteger(metadata.length) ||
          !Number.isSafeInteger(metadata.capacity) || metadata.offset < 0 || metadata.length < 0 ||
          metadata.capacity < metadata.length) {
        throw new TypeError("GoScript array view has invalid slice metadata");
      }
      clone = new __gobiGoSlice([], metadata.offset, metadata.length, metadata.capacity);
      memo.set(value, clone);
      clone.backing = __gobiCloneBoundaryValue(metadata.backing, depth + 1, active, memo);
      active.delete(value);
      return clone;
    }
    clone = new Array(value.length);
    memo.set(value, clone);
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !__gobiOwn(descriptor, "value")) {
        throw new TypeError("GoScript view array must contain only data properties");
      }
      Object.defineProperty(clone, key, {
        ...descriptor,
        value: __gobiCloneBoundaryValue(descriptor.value, depth + 1, active, memo),
      });
    }
    active.delete(value);
    return clone;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype &&
      !(value instanceof __gobiGoSlice) &&
      Object.getPrototypeOf(prototype) !== null &&
      Object.getPrototypeOf(prototype) !== Object.prototype) {
    throw new TypeError("GoScript view contains an unsupported object prototype");
  }
  clone = Object.create(prototype);
  memo.set(value, clone);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !__gobiOwn(descriptor, "value")) {
      throw new TypeError("GoScript view objects must contain only data properties");
    }
    Object.defineProperty(clone, key, {
      ...descriptor,
      value: __gobiCloneBoundaryValue(descriptor.value, depth + 1, active, memo),
    });
  }
  active.delete(value);
  return clone;
}

function __gobiDecodeGoView(view) {
  return __gobiCloneBoundaryValue(view, 0, new WeakSet(), new WeakMap());
}

function __gobiEncodeGoMessage(message) {
  if (message === null || typeof message !== "object") throw new TypeError("Update message must be an object");
  const keys = Reflect.ownKeys(message);
  const allowed = new Set(["Name", "Arg", "__goStructValue"]);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
      !keys.includes("Name") || !keys.includes("Arg")) {
    throw new TypeError("Update message must contain only Name and Arg");
  }
  const name = Object.getOwnPropertyDescriptor(message, "Name");
  const arg = Object.getOwnPropertyDescriptor(message, "Arg");
  const marker = Object.getOwnPropertyDescriptor(message, "__goStructValue");
  if (!name || !arg || !__gobiOwn(name, "value") || !__gobiOwn(arg, "value") ||
      (marker && (!__gobiOwn(marker, "value") || marker.value !== true))) {
    throw new TypeError("Update message fields must be own data properties");
  }
  return new __gobiMessage(
    true,
    __gobiEncodeGoString(name.value, "Message.Name"),
    __gobiEncodeGoString(arg.value, "Message.Arg"),
  );
}
`
