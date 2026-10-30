// Protocol helpers for the bounded, data-only portion of Gobi used by the
// controlled-input renderers. The Go runtime remains the owner of state and
// message transitions; this module only validates and reads its snapshots.

const ELEMENT = 1;
const TEXT = 2;
const FRAGMENT = 3;
const SUPPORTED_TAGS = new Set(["div", "p", "input", "button"]);
const SUPPORTED_ATTRIBUTES = new Set(["class", "type", "value", "aria-label", "disabled"]);

function fail(message) {
  throw new Error(`controlled input protocol: ${message}`);
}

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected, description) {
  if (!isRecord(value)) fail(`${description} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${description} must contain exactly ${wanted.join(", ")}`);
  }
}

function listOrEmpty(value, description) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`${description} must be an array or null`);
  return value;
}

function validateJSONValue(value, description, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(`${description} cannot contain a non-finite number`);
    return;
  }
  if (typeof value !== "object") fail(`${description} must contain only JSON values`);
  if (seen.has(value)) fail(`${description} cannot contain cycles`);
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) validateJSONValue(item, description, seen);
  } else {
    if (!isRecord(value)) fail(`${description} must contain only plain objects`);
    for (const item of Object.values(value)) validateJSONValue(item, description, seen);
  }
  seen.delete(value);
}

function validateStyle(style, path) {
  if (!Array.isArray(style)) fail(`Attr.Style at ${path} must be an array or null`);
  if (style.length > 0) fail(`structured styles are unsupported at ${path}`);
}

function validateAttributes(node, path) {
  const attrs = listOrEmpty(node.Attrs, `Node.Attrs at ${path || "<root>"}`);
  const names = new Set();
  for (const attr of attrs) {
    exactKeys(attr, ["Name", "Value", "Flag", "Style"], `Attr at ${path || "<root>"}`);
    if (typeof attr.Name !== "string" || !/^[A-Za-z_:][A-Za-z0-9_.:-]*$/.test(attr.Name)) {
      fail(`unsupported attribute name ${JSON.stringify(attr.Name)} at ${path || "<root>"}`);
    }
    const canonicalName = attr.Name.toLowerCase();
    if (!SUPPORTED_ATTRIBUTES.has(attr.Name)) fail(`unsupported attribute ${JSON.stringify(attr.Name)} at ${path || "<root>"}`);
    if (names.has(canonicalName)) fail(`duplicate attribute ${JSON.stringify(attr.Name)} at ${path || "<root>"}`);
    names.add(canonicalName);
    if (typeof attr.Flag !== "boolean" || typeof attr.Value !== "string") {
      fail(`Attr at ${path || "<root>"} must contain string Value and boolean Flag fields`);
    }
    const styles = listOrEmpty(attr.Style, `Attr.Style at ${path || "<root>"}`);
    if (styles.length > 0) {
      validateStyle(styles, path || "<root>");
    }
    if (attr.Name === "disabled") {
      if (!attr.Flag || attr.Value !== "" || styles.length > 0) {
        fail(`disabled at ${path || "<root>"} must be a true flag`);
      }
    } else if (attr.Flag || styles.length > 0) {
      fail(`attribute ${JSON.stringify(attr.Name)} at ${path || "<root>"} must have a string Value only`);
    }
    if (attr.Name === "value" && node.Tag !== "input") fail(`value is only supported on input at ${path || "<root>"}`);
    if (attr.Name === "type" && node.Tag !== "input") fail(`type is only supported on input at ${path || "<root>"}`);
    if (attr.Name === "disabled" && node.Kind === ELEMENT && node.Tag !== "button" && node.Tag !== "input") {
      fail(`disabled is only supported on button or input at ${path || "<root>"}`);
    }
  }
  return attrs;
}

function validateHandlers(node, path) {
  const handlers = listOrEmpty(node.On, `Node.On at ${path || "<root>"}`);
  const events = new Set();
  for (const handler of handlers) {
    exactKeys(handler, ["Event", "Message", "Arg"], `Node.On at ${path || "<root>"}`);
    if (typeof handler.Event !== "string" || handler.Event !== "click" ||
        typeof handler.Message !== "string" || handler.Message.trim() === "" ||
        typeof handler.Arg !== "string") {
      fail(`Node.On at ${path || "<root>"} must contain non-empty Event and Message and string Arg fields`);
    }
    if (events.has(handler.Event)) fail(`duplicate Node.On event ${JSON.stringify(handler.Event)} at ${path || "<root>"}`);
    events.add(handler.Event);
  }
  return handlers;
}

function validateNode(node, path, allNodes, active = new Set()) {
  exactKeys(node, ["Kind", "Tag", "Key", "Attrs", "On", "Kids", "Text"], `Node at ${path || "<root>"}`);
  if (active.has(node)) fail(`Node tree cannot contain cycles at ${path || "<root>"}`);
  active.add(node);
  if (!Number.isInteger(node.Kind)) fail(`Node.Kind at ${path || "<root>"} must be an integer`);
  if (typeof node.Tag !== "string" || typeof node.Key !== "string" || typeof node.Text !== "string") {
    fail(`Node at ${path || "<root>"} must contain string Tag, Key and Text fields`);
  }
  if (node.Key !== "") fail(`keyed reconciliation is unsupported at ${path || "<root>"}`);
  const attrs = validateAttributes(node, path);
  const handlers = validateHandlers(node, path);
  const kids = listOrEmpty(node.Kids, `Node.Kids at ${path || "<root>"}`);
  allNodes.set(path, node);

  if (node.Kind === TEXT) {
    if (node.Tag !== "" || attrs.length > 0 || handlers.length > 0 || kids.length > 0) {
      fail(`text Node at ${path || "<root>"} cannot also have a tag, attributes, handlers or children`);
    }
  } else if (node.Kind === FRAGMENT) {
    if (node.Tag !== "" || node.Text !== "" || attrs.length > 0 || handlers.length > 0) {
      fail(`fragment Node at ${path || "<root>"} can only contain children`);
    }
  } else if (node.Kind === ELEMENT) {
    if (!SUPPORTED_TAGS.has(node.Tag) || node.Text !== "") {
      fail(`unsupported HTML element or element Text at ${path || "<root>"}`);
    }
    if (node.Tag === "input" && kids.length > 0) {
      fail(`void HTML element <${node.Tag.toLowerCase()}> at ${path || "<root>"} cannot have children`);
    }
    if (node.Tag === "input") {
      const types = attrsNamed(node, "type");
      if (types.length !== 1 || types[0].Flag || types[0].Value !== "text") {
        fail(`input at ${path || "<root>"} must declare exactly one type="text" attribute`);
      }
    }
  } else {
    fail(`unsupported Node.Kind ${JSON.stringify(node.Kind)} at ${path || "<root>"}`);
  }

  kids.forEach((child, index) => validateNode(child, childPath(path, index), allNodes, active));
  active.delete(node);
}

function attrsNamed(node, name) {
  const wanted = name.toLowerCase();
  return listOrEmpty(node.Attrs, "Node.Attrs").filter((attr) => attr.Name.toLowerCase() === wanted);
}

function isTextInput(node) {
  if (!node || node.Kind !== ELEMENT || node.Tag !== "input") return false;
  const types = attrsNamed(node, "type");
  const values = attrsNamed(node, "value");
  return types.length === 1 && !types[0].Flag && types[0].Value === "text" &&
    values.length === 1 && !values[0].Flag && listOrEmpty(values[0].Style, "Attr.Style").length === 0;
}

function validateBindings(snapshot, allNodes) {
  if (!Array.isArray(snapshot.bindings)) fail("snapshot.bindings must be an array");
  const keys = new Set();
  for (const binding of snapshot.bindings) {
    exactKeys(binding, ["Path", "Event", "Message", "Source"], "Binding");
    if (typeof binding.Path !== "string" || typeof binding.Event !== "string" ||
        typeof binding.Message !== "string" || typeof binding.Source !== "string") {
      fail("Binding Path, Event, Message and Source must be strings");
    }
    const path = normalizePath(binding.Path);
    if (path !== binding.Path) fail(`binding path ${JSON.stringify(binding.Path)} is not canonical`);
    if (binding.Event === "" || binding.Message.trim() === "") fail("Binding Event and Message must be non-empty");
    const key = `${path}\u0000${binding.Event}`;
    if (keys.has(key)) fail(`duplicate binding for ${JSON.stringify(path)} ${JSON.stringify(binding.Event)}`);
    keys.add(key);
    const node = allNodes.get(path);
    if (!node) fail(`binding path ${JSON.stringify(path)} does not name a Node`);
    if (binding.Event !== "input" || binding.Source !== "target.value") {
      fail(`unsupported binding ${JSON.stringify(binding.Event)} from ${JSON.stringify(binding.Source)}`);
    }
    if (!isTextInput(node)) {
      fail(`target.value binding at ${JSON.stringify(path)} requires input[type=text] with exactly one value attribute`);
    }
    if (listOrEmpty(node.On, `Node.On at ${path}`).some((handler) => handler.Event === binding.Event)) {
      fail(`binding collides with Node.On ${JSON.stringify(binding.Event)} at ${JSON.stringify(path)}`);
    }
  }
}

function validateMessages(messages) {
  if (!Array.isArray(messages)) fail("snapshot.messages must be an array");
  for (const message of messages) {
    exactKeys(message, ["Name", "Arg"], "Message");
    if (typeof message.Name !== "string" || typeof message.Arg !== "string") {
      fail("Message Name and Arg must be strings");
    }
  }
}

/** Validate the complete browser protocol snapshot and return it unchanged. */
export function validateSnapshot(snapshot) {
  if (!isRecord(snapshot)) fail("snapshot must be an object");
  if (Object.hasOwn(snapshot, "error") && snapshot.error) {
    fail(`runtime returned an error: ${String(snapshot.error)}`);
  }
  exactKeys(snapshot, ["state", "tree", "bindings", "messages"], "snapshot");
  if (!isRecord(snapshot.state)) fail("snapshot.state must be an object");
  validateJSONValue(snapshot.state, "snapshot.state");
  if (!Array.isArray(snapshot.messages)) fail("snapshot.messages must be an array");
  validateMessages(snapshot.messages);
  const allNodes = new Map();
  validateNode(snapshot.tree, "", allNodes);
  validateBindings(snapshot, allNodes);
  return snapshot;
}

/** Deep-copy JSON-shaped runtime data so callers cannot mutate host state. */
export function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isRecord(value)) {
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = clone(item);
    return result;
  }
  return value;
}

/** Normalize a child-index path to its canonical slash-separated form. */
export function normalizePath(path) {
  if (Array.isArray(path)) {
    if (path.some((part) => !Number.isInteger(part) || part < 0)) {
      fail("path arrays must contain non-negative child indexes");
    }
    return path.join("/");
  }
  if (typeof path !== "string" ||
      (path !== "" && !/^(?:0|[1-9]\d*)(?:\/(?:0|[1-9]\d*))*$/.test(path))) {
    fail("path must be the empty root path or slash-separated canonical child indexes");
  }
  return path;
}

function childPath(parent, index) {
  return parent === "" ? String(index) : `${parent}/${index}`;
}

/** Return a Node at path, or throw if the child-index path does not exist. */
export function nodeAtPath(tree, path) {
  let node = tree;
  const normalized = normalizePath(path);
  if (!node || typeof node !== "object") fail("tree must start with a Node object");
  if (normalized === "") return node;
  for (const part of normalized.split("/")) {
    const children = listOrEmpty(node.Kids, "Node.Kids");
    const index = Number(part);
    if (index >= children.length) fail(`no Node exists at path ${JSON.stringify(normalized)}`);
    node = children[index];
  }
  return node;
}

/** Look up a validated sidecar binding by path and event. */
export function bindingAt(snapshot, path, event) {
  const normalized = normalizePath(path);
  const matches = snapshot.bindings.filter((binding) => binding.Path === normalized && binding.Event === event);
  if (matches.length > 1) fail(`ambiguous binding at ${JSON.stringify(normalized)} for ${JSON.stringify(event)}`);
  return matches[0] ?? null;
}

/** Look up the literal GobI handler by path and event. */
export function literalHandlerAt(tree, path, event) {
  const node = nodeAtPath(tree, path);
  const matches = listOrEmpty(node.On, "Node.On").filter((handler) => handler.Event === event);
  if (matches.length > 1) fail(`ambiguous Node.On at ${JSON.stringify(normalizePath(path))}`);
  return matches[0] ?? null;
}

/** Return whether a Node declares a disabled flag attribute. */
export function isDisabled(node) {
  return listOrEmpty(node?.Attrs, "Node.Attrs").some((attr) => attr?.Name === "disabled" && attr.Flag === true);
}

export { ELEMENT, TEXT, FRAGMENT };
