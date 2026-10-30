import {
  clone,
  normalizePath,
  validateSnapshot as validateKeyedSnapshot,
} from "../keyed-editor/protocol.mjs";

const MANIFEST_KEYS = [
  "protocol", "version", "capabilities", "methods", "tags", "attributes",
  "events", "nodeKinds", "keyPattern", "maxDepth", "maxNodes", "messageBlankRunes",
];
const KEYED_RENDERER_PROTOCOL = "gobi.keyed-renderer";
const KEYED_RENDERER_VERSION = 1;

function fail(message, cause) {
  throw new Error(`renderer conformance protocol: ${message}`, cause === undefined ? undefined : { cause });
}

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected, description) {
  if (!isRecord(value)) fail(`${description} must be a plain object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${description} must contain exactly ${wanted.join(", ")}`);
  }
}

function stringList(value, description) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    fail(`manifest.${description} must be an array of non-empty strings`);
  }
  if (new Set(value).size !== value.length) fail(`manifest.${description} must not contain duplicates`);
}

function canonicalRuneSet(value) {
  if (typeof value !== "string" || value.length === 0) {
    fail("manifest.messageBlankRunes must be a non-empty canonical code-point string");
  }
  const runes = Array.from(value);
  let previous = -1;
  for (const rune of runes) {
    const point = rune.codePointAt(0);
    if (point >= 0xd800 && point <= 0xdfff) {
      fail("manifest.messageBlankRunes must contain Unicode scalar values");
    }
    if (point <= previous) {
      fail(point === previous
        ? "manifest.messageBlankRunes must not contain duplicate code points"
        : "manifest.messageBlankRunes must be in canonical code-point order");
    }
    previous = point;
  }
  return new Set(runes);
}

function isBlankMessageName(value, blankRunes) {
  for (const rune of value) {
    if (!blankRunes.has(rune)) return false;
  }
  return true;
}

function validateBlankMessageNames(snapshot, blankRunes) {
  function visit(node, path) {
    for (const handler of node.On ?? []) {
      if (isBlankMessageName(handler.Message, blankRunes)) {
        fail(`Node.On message at ${path || "<root>"} contains only manifest.messageBlankRunes`);
      }
    }
    (node.Kids ?? []).forEach((kid, index) => {
      visit(kid, path === "" ? String(index) : `${path}/${index}`);
    });
  }

  visit(snapshot.tree, "");
  for (const binding of snapshot.bindings) {
    if (isBlankMessageName(binding.Message, blankRunes)) {
      fail(`binding message at ${binding.Path} contains only manifest.messageBlankRunes`);
    }
  }
}

/** Validate the generated manifest's exact wire shape and supported protocol version. */
export function validateManifest(manifest) {
  exactKeys(manifest, MANIFEST_KEYS, "manifest");
  if (manifest.protocol !== KEYED_RENDERER_PROTOCOL) {
    fail(`unsupported protocol ${JSON.stringify(manifest.protocol)}`);
  }
  if (manifest.version !== KEYED_RENDERER_VERSION) {
    fail(`unsupported protocol version ${JSON.stringify(manifest.version)}`);
  }
  for (const field of ["capabilities", "methods", "tags", "attributes", "events"]) {
    stringList(manifest[field], field);
  }
  canonicalRuneSet(manifest.messageBlankRunes);
  if (!Array.isArray(manifest.nodeKinds) || manifest.nodeKinds.length === 0 ||
      manifest.nodeKinds.some((kind) => !Number.isSafeInteger(kind))) {
    fail("manifest.nodeKinds must be a non-empty array of integer kinds");
  }
  if (new Set(manifest.nodeKinds).size !== manifest.nodeKinds.length) {
    fail("manifest.nodeKinds must not contain duplicates");
  }
  if (typeof manifest.keyPattern !== "string" || manifest.keyPattern.length === 0) {
    fail("manifest.keyPattern must be a non-empty regular expression");
  }
  try {
    // The Go-generated pattern is data. The JS layer compiles it rather than
    // maintaining an independent copy of its allowed key syntax.
    new RegExp(manifest.keyPattern);
  } catch (error) {
    fail("manifest.keyPattern is not a valid regular expression", error);
  }
  if (!Number.isSafeInteger(manifest.maxDepth) || manifest.maxDepth < 0) {
    fail("manifest.maxDepth must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(manifest.maxNodes) || manifest.maxNodes < 1) {
    fail("manifest.maxNodes must be a positive safe integer");
  }
  return manifest;
}

/** Apply the existing keyed snapshot protocol and Go-generated finite bounds. */
export function validateSnapshotAgainstManifest(snapshot, untrustedManifest) {
  const manifest = validateManifest(untrustedManifest);
  try {
    validateKeyedSnapshot(snapshot);
    validateBlankMessageNames(snapshot, canonicalRuneSet(manifest.messageBlankRunes));
    const keyPattern = new RegExp(manifest.keyPattern);
    const kinds = new Set(manifest.nodeKinds);
    const tags = new Set(manifest.tags);
    const attributes = new Set(manifest.attributes);
    const events = new Set(manifest.events);
    let count = 0;

    function walk(node, depth, path) {
      count += 1;
      if (count > manifest.maxNodes) fail(`node count exceeds manifest.maxNodes at ${path || "<root>"}`);
      if (depth > manifest.maxDepth) fail(`tree depth exceeds manifest.maxDepth at ${path || "<root>"}`);
      if (!kinds.has(node.Kind)) fail(`Node.Kind ${JSON.stringify(node.Kind)} is not in manifest.nodeKinds at ${path || "<root>"}`);

      if (node.Kind === 1) {
        if (!tags.has(node.Tag)) fail(`tag ${JSON.stringify(node.Tag)} is not in manifest.tags at ${path || "<root>"}`);
        if (!keyPattern.test(node.Key)) fail(`element key ${JSON.stringify(node.Key)} does not match manifest.keyPattern at ${path || "<root>"}`);
        keyPattern.lastIndex = 0;
      }
      for (const attr of node.Attrs ?? []) {
        if (!attributes.has(attr.Name)) {
          fail(`attribute ${JSON.stringify(attr.Name)} is not in manifest.attributes at ${path || "<root>"}`);
        }
      }
      for (const handler of node.On ?? []) {
        if (!events.has(handler.Event)) fail(`event ${JSON.stringify(handler.Event)} is not in manifest.events at ${path || "<root>"}`);
      }
      (node.Kids ?? []).forEach((kid, index) => {
        walk(kid, depth + 1, path === "" ? String(index) : `${path}/${index}`);
      });
    }

    walk(snapshot.tree, 0, "");
    for (const binding of snapshot.bindings) {
      if (!events.has(binding.Event)) fail(`event ${JSON.stringify(binding.Event)} is not in manifest.events at ${binding.Path}`);
    }
    return snapshot;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("renderer conformance protocol:")) throw error;
    const message = error instanceof Error ? error.message : String(error);
    fail(message, error);
  }
}

export { clone, normalizePath };
