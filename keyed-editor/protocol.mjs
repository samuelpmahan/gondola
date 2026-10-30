// Keyed collection protocol. Keep the controlled-input protocol as the source
// of truth for the bounded Gobi snapshot shape, then add element-key rules.
import {
  ELEMENT,
  FRAGMENT,
  TEXT,
  bindingAt,
  clone as cloneControlled,
  isDisabled,
  literalHandlerAt,
  nodeAtPath as controlledNodeAtPath,
  normalizePath as controlledNormalizePath,
  validateSnapshot as validateControlledSnapshot,
} from "../controlled-input/protocol.mjs";

function fail(message, cause) {
  throw new Error(`keyed editor protocol: ${message}`, cause === undefined ? undefined : { cause });
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNodeKind(value) {
  return value === ELEMENT || value === TEXT || value === FRAGMENT;
}

// Make a validation-only copy with the Node.Key field removed. Preserve object
// prototypes so the inherited protocol still rejects non-JSON/class objects.
// WeakMap also preserves cycles so the inherited validator can reject them.
function withoutNodeKeys(value, stripNodeKeys = false, seen = new WeakMap()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    const result = [];
    seen.set(value, result);
    for (const item of value) result.push(withoutNodeKeys(item, stripNodeKeys, seen));
    return result;
  }

  const node = stripNodeKeys && isNodeKind(value.Kind);
  const prototype = Object.getPrototypeOf(value);
  const result = Object.create(prototype);
  seen.set(value, result);
  for (const key of Object.keys(value)) {
    if (node && key === "Key") {
      result[key] = "";
      continue;
    }
    const childIsNodeList = node && key === "Kids";
    result[key] = withoutNodeKeys(value[key], childIsNodeList, seen);
  }
  return result;
}

function validateElementKeys(tree) {
  const keys = new Set();
  const active = new Set();

  function visit(node, path) {
    if (!isRecord(node)) fail(`Node at ${path || "<root>"} must be an object`);
    if (active.has(node)) fail(`Node tree cannot contain cycles at ${path || "<root>"}`);
    active.add(node);

    if (node.Kind === ELEMENT) {
      if (typeof node.Key !== "string" || node.Key === "") {
        fail(`element key at ${path || "<root>"} must be a non-empty ASCII token`);
      }
      if (!/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(node.Key)) {
        fail(`element key ${JSON.stringify(node.Key)} at ${path || "<root>"} must be an ASCII token`);
      }
      if (keys.has(node.Key)) fail(`duplicate element key ${JSON.stringify(node.Key)}`);
      keys.add(node.Key);
    } else if ((node.Kind === TEXT || node.Kind === FRAGMENT) && node.Key !== "") {
      fail(`${node.Kind === TEXT ? "text Node" : "fragment Node"} at ${path || "<root>"} must have an empty key`);
    }

    const kids = node.Kids == null ? [] : node.Kids;
    if (Array.isArray(kids)) {
      kids.forEach((child, index) => visit(child, path === "" ? String(index) : `${path}/${index}`));
    }
    active.delete(node);
  }

  visit(tree, "");
}

/** Validate a keyed browser snapshot and return the original object unchanged. */
export function validateSnapshot(snapshot) {
  try {
    const validationCopy = withoutNodeKeys(snapshot);
    // Only the tree subtree loses its Node.Key values in the validation copy.
    if (isRecord(validationCopy) && isRecord(snapshot)) {
      validationCopy.tree = withoutNodeKeys(snapshot.tree, true);
      validationCopy.state = withoutNodeKeys(snapshot.state);
      validationCopy.bindings = withoutNodeKeys(snapshot.bindings);
      validationCopy.messages = withoutNodeKeys(snapshot.messages);
    }
    validateControlledSnapshot(validationCopy);
    validateElementKeys(snapshot.tree);
    return snapshot;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("keyed editor protocol:")) throw error;
    const message = error instanceof Error ? error.message : String(error);
    fail(message, error);
  }
}

/** Deep-copy JSON-shaped runtime data, retaining the validated element keys. */
export function clone(value) {
  return cloneControlled(value);
}

/** Normalize a child-index path to its canonical slash-separated form. */
export function normalizePath(path) {
  return controlledNormalizePath(path);
}

/** Return a Node at a canonical child-index path. */
export function nodeAtPath(tree, path) {
  return controlledNodeAtPath(tree, path);
}

/** Return the key at a path, including the empty key for non-element Nodes. */
export function keyAtPath(tree, path) {
  return nodeAtPath(tree, path).Key;
}

/** Return the current child-index path for an element key, or null if absent. */
export function pathForKey(tree, key) {
  if (typeof key !== "string") fail("key lookup must use a string");
  let found = null;
  function visit(node, path) {
    if (node?.Kind === ELEMENT && node.Key === key) {
      found = path;
      return;
    }
    const kids = node?.Kids == null ? [] : node.Kids;
    if (!Array.isArray(kids)) return;
    for (let index = 0; index < kids.length; index += 1) {
      if (found !== null) return;
      visit(kids[index], path === "" ? String(index) : `${path}/${index}`);
    }
  }
  visit(tree, "");
  return found;
}

export { ELEMENT, FRAGMENT, TEXT, bindingAt, isDisabled, literalHandlerAt };
