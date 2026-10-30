// Independent HTTP wire oracle layered over the pre-existing async-save model.
// No production Go code or candidate decoder is consulted here.

import {
  createAsyncReference,
  initialAsyncState,
  mountReference as mountAsyncReference,
  projectAsyncSnapshot,
  referenceReactDOMVersion,
  referenceReactVersion,
} from "../async-effects/build/reference.bundle.mjs";

export { initialAsyncState, projectAsyncSnapshot, referenceReactDOMVersion, referenceReactVersion };

export const MAX_HTTP_BODY_BYTES = 65_536;
export const MAX_HTTP_ID = Number.MAX_SAFE_INTEGER;

function validateID(id) {
  if (!Number.isSafeInteger(id) || id < 1 || id > MAX_HTTP_ID) {
    throw new RangeError("HTTP request ID must be a positive JavaScript-safe integer");
  }
}

function validateStatus(status) {
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new RangeError("HTTP status must be an integer from 100 through 599");
  }
}

function utf8Length(text) {
  return new TextEncoder().encode(text).byteLength;
}

function wellFormed(text) {
  let result = "";
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        result += text[index] + text[index + 1];
        index++;
      } else {
        result += "\ufffd";
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      result += "\ufffd";
    } else {
      result += text[index];
    }
  }
  return result;
}

/** Encode the exact request object consumed by the Go HTTP codec. */
export function encodeHTTP(id, value) {
  if (arguments.length !== 2) throw new TypeError("encodeHTTP requires exactly two arguments");
  validateID(id);
  if (typeof value !== "string") throw new TypeError("HTTP request Value must be a primitive string");
  return JSON.stringify({ ID: id, Value: value });
}

function skipWhitespace(source, offset) {
  while (offset < source.length && /[\u0009\u000a\u000d\u0020]/.test(source[offset])) offset++;
  return offset;
}

function scanStringEnd(source, offset) {
  if (source[offset] !== '"') return -1;
  for (let index = offset + 1; index < source.length; index++) {
    const character = source[index];
    if (character === '"') return index + 1;
    if (character === "\\") {
      index++;
      if (index >= source.length) return -1;
    }
  }
  return -1;
}

// JSON.parse intentionally keeps only the last copy of a duplicate property.
// Scan top-level member names and raw values as well so duplicate or escaped
// duplicate keys, and non-integer JSON number tokens, stay observable.
function topLevelMembers(source) {
  let offset = skipWhitespace(source, 0);
  if (source[offset] !== "{") return null;
  offset = skipWhitespace(source, offset + 1);
  if (source[offset] === "}") return new Map();

  const members = new Map();
  while (offset < source.length) {
    const end = scanStringEnd(source, offset);
    if (end < 0) return null; // JSON.parse below supplies the syntax error.
    let key;
    try {
      key = JSON.parse(source.slice(offset, end));
    } catch {
      return null;
    }
    if (members.has(key)) return null;

    offset = skipWhitespace(source, end);
    if (source[offset] !== ":") return null;
    offset = skipWhitespace(source, offset + 1);

    // Find the member value boundary without interpreting it. JSON.parse below
    // validates its grammar; this scan only needs to skip nested structures.
    const start = offset;
    const stack = [];
    let inString = false;
    let escaped = false;
    for (; offset < source.length; offset++) {
      const character = source[offset];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{" || character === "[") stack.push(character);
      else if (character === "}" || character === "]") {
        if (stack.length > 0) {
          stack.pop();
          if (stack.length === 0) {
            offset++;
            break;
          }
        } else if (character === "}" && offset > start) {
          break;
        } else {
          break;
        }
      } else if (character === "," && stack.length === 0) {
        break;
      }
    }
    if (offset === start) return null;
    const rawValue = source.slice(start, offset).trim();
    members.set(key, rawValue);
    offset = skipWhitespace(source, offset);
    if (source[offset] === "}") return members;
    if (source[offset] !== ",") return null;
    offset = skipWhitespace(source, offset + 1);
  }
  return null;
}

function hasValidUnicodeEscapes(source) {
  let inString = false;
  for (let offset = 0; offset < source.length;) {
    if (!inString) {
      if (source[offset] === '"') inString = true;
      offset++;
      continue;
    }
    if (source[offset] === '"') {
      inString = false;
      offset++;
      continue;
    }
    if (source[offset] !== "\\") {
      offset++;
      continue;
    }
    if (source[offset + 1] !== "u") {
      offset += 2;
      continue;
    }
    const code = Number.parseInt(source.slice(offset + 2, offset + 6), 16);
    if (!Number.isInteger(code) || source.slice(offset + 2, offset + 6).length !== 4) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      if (source.slice(offset + 6, offset + 8) !== "\\u") return false;
      const lowText = source.slice(offset + 8, offset + 12);
      const low = Number.parseInt(lowText, 16);
      if (lowText.length !== 4 || !Number.isInteger(low) || low < 0xdc00 || low > 0xdfff) return false;
      offset += 12;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    } else {
      offset += 6;
    }
  }
  return !inString;
}

function validResponse(source, expectedID) {
  if (utf8Length(source) > MAX_HTTP_BODY_BYTES || !hasValidUnicodeEscapes(source)) return null;

  let value;
  try {
    value = JSON.parse(source);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const members = topLevelMembers(source);
  if (!members) return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== 3 || keys[0] !== "Error" || keys[1] !== "ID" || keys[2] !== "Value") return null;

  // Require the JSON number token itself to be an unsigned decimal integer.
  // JSON.parse would accept 7.0 and 7e0 as the number 7, while the Go uint64
  // contract rejects those lexical forms.
  const idToken = members.get("ID");
  if (!idToken || !/^[1-9]\d*$/.test(idToken) || Number(idToken) !== expectedID ||
      String(Number(idToken)) !== idToken) return null;

  if (value.ID !== expectedID || typeof value.Value !== "string" || typeof value.Error !== "string") return null;
  return { ID: expectedID, Value: wellFormed(value.Value), Error: wellFormed(value.Error) };
}

/** Decode a bounded HTTP response, always correlating failures to expectedID. */
export function decodeHTTP(expectedID, status, body) {
  if (arguments.length !== 3) throw new TypeError("decodeHTTP requires exactly three arguments");
  validateID(expectedID);
  validateStatus(status);
  if (typeof body !== "string") throw new TypeError("HTTP response body must be a primitive string");
  if (status !== 200) return { ID: expectedID, Value: "", Error: `http status ${status}` };
  return validResponse(body, expectedID) ?? {
    ID: expectedID,
    Value: "",
    Error: "invalid response",
  };
}

/** Pure independent runtime API compatible with createEffectHost. */
export function createHTTPReferenceRuntime() {
  return {
    ...createAsyncReference(),
    encodeHTTP,
    decodeHTTP,
  };
}

/** Mount the pinned React oracle and attach the same independent HTTP codec. */
export function mountHTTPReference(container) {
  return {
    ...mountAsyncReference(container),
    encodeHTTP,
    decodeHTTP,
  };
}
