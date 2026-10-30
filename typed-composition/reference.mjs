// Independent typed parent/child collection model. Collection transitions are
// delegated to the existing independent collection reference, while inputs,
// publication, message ordering, and the immutable tree are modeled here.

import { createSessionTreeReference, mountTreeReferenceCollection,
  referenceReactVersion, referenceReactDOMVersion } from "../session-tree/reference.mjs";
import { encodeHTTP, decodeHTTP } from "../http-effects/reference.mjs";

export const MAX_COMPOSITION_INTEGER = Number.MAX_SAFE_INTEGER;
export const MAX_TITLE_BYTES = 256;
export const MAX_COMPOSITION_DEPTH = 32;
export { referenceReactVersion, referenceReactDOMVersion };
export const compositionReactVersion = referenceReactVersion;
export const compositionReactDOMVersion = referenceReactDOMVersion;
// The generic projection only consumes the snapshot contract. It uses the
// pinned React 19.3.1 renderer and the tree produced by this independent model.
export const mountCompositionReferenceCollection = mountTreeReferenceCollection;

const hText = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
const hElement = (Tag, Key, Attrs, On, Kids) => ({
  Kind: 1, Tag, Key, Attrs, On, Kids, Text: "",
});
const hAttr = (Name, Value = "", Flag = false) => ({ Name, Value, Flag, Style: null });
const hLiteral = (Event, Message, Arg = "") => ({ Event, Message, Arg });

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const copy = {};
    for (const [key, item] of Object.entries(value)) copy[key] = clone(item);
    return copy;
  }
  return value;
}

function fail(message, Type = Error) {
  return new Type(message);
}

function exactArity(actual, expected, method) {
  if (actual !== expected) {
    throw fail(method + " requires exactly " + String(expected) + " argument" +
      (expected === 1 ? "" : "s"), TypeError);
  }
}

function assertID(value, description) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_COMPOSITION_INTEGER) {
    const idName = String(description).toLowerCase().includes("row") ? "row ID" : "session ID";
    throw fail(idName + " " + String(value) + " is outside the supported range 1.." +
      String(MAX_COMPOSITION_INTEGER), RangeError);
  }
  return value;
}

function assertRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_COMPOSITION_INTEGER) {
    throw fail("input revision " + String(value) + " is outside the supported range 0.." +
      String(MAX_COMPOSITION_INTEGER), RangeError);
  }
  return value;
}

function exactFields(value, fields, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw fail(description + " must be an object", TypeError);
  }
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw fail(description + " must contain exactly " + expected.join(", "), TypeError);
  }
}

function validUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

function normalizeInputs(raw) {
  exactFields(raw, ["Title", "ReadOnly"], "inputs");
  if (typeof raw.Title !== "string" || !validUnicode(raw.Title)) {
    throw fail("input title must be valid UTF-8", TypeError);
  }
  if (new TextEncoder().encode(raw.Title).length > MAX_TITLE_BYTES) {
    throw fail("input title exceeds 256 UTF-8 bytes", RangeError);
  }
  if (typeof raw.ReadOnly !== "boolean") {
    throw fail("inputs ReadOnly must be a boolean", TypeError);
  }
  return { Title: raw.Title, ReadOnly: raw.ReadOnly };
}

function normalizeStep(raw) {
  exactFields(raw, ["Path", "Event", "Value", "Key"], "dispatch step");
  if (typeof raw.Path !== "string" || typeof raw.Event !== "string" ||
      typeof raw.Value !== "string" || typeof raw.Key !== "string") {
    throw fail("dispatch step fields must be primitive strings", TypeError);
  }
  return { Path: raw.Path, Event: raw.Event, Value: raw.Value, Key: raw.Key };
}

function pathIndexes(path) {
  if (path === "") return [];
  if (typeof path !== "string" || !/^(?:0|[1-9][0-9]*)(?:\/(?:0|[1-9][0-9]*))*$/.test(path)) {
    throw fail("invalid canonical collection path " + JSON.stringify(path));
  }
  const indexes = path.split("/").map(Number);
  if (indexes.some((index) => !Number.isSafeInteger(index))) {
    throw fail("collection path index exceeds the JavaScript-safe integer limit", RangeError);
  }
  return indexes;
}

function nodeAtPath(tree, path) {
  let node = tree;
  for (const index of pathIndexes(path)) {
    if (!Array.isArray(node?.Kids) || index >= node.Kids.length) {
      throw fail("collection path is out of range: " + JSON.stringify(path));
    }
    node = node.Kids[index];
  }
  return node;
}

function disabled(node) {
  return (node?.Attrs ?? []).some((attribute) => attribute.Name === "disabled" && attribute.Flag === true);
}

function addDisabled(node) {
  const attrs = Array.isArray(node.Attrs) ? node.Attrs : [];
  const existing = attrs.find((attribute) => attribute.Name === "disabled");
  if (existing) existing.Flag = true;
  else attrs.push(hAttr("disabled", "", true));
  node.Attrs = attrs;
}

function applyReadOnly(tree, readOnly) {
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (readOnly && node.Kind === 1 && (node.Tag === "button" || node.Tag === "input")) {
      addDisabled(node);
    }
    for (const child of node.Kids ?? []) visit(child);
  }
  visit(tree);
}

function compositionTree(base, inputs, revision, inbox, isRoot) {
  const tree = clone(base.tree);
  if (!Array.isArray(tree.Kids)) tree.Kids = [];
  tree.Kids.push(hElement("p", "composition-title", null, null, [hText("Title: " + inputs.Title)]));
  tree.Kids.push(hElement("p", "composition-inbox", null, null, [
    hText("Published: " + String(inbox.length)),
  ]));

  const rowsNode = tree.Kids[2];
  const rows = base.state.Rows;
  if (rowsNode && Array.isArray(rowsNode.Kids)) {
    rowsNode.Kids.forEach((rowNode, index) => {
      const row = rows[index];
      if (!row || !Array.isArray(rowNode.Kids)) {
        throw fail("collection row tree does not match collection state");
      }
      const canPublish = !isRoot && !inputs.ReadOnly && row.Saved !== "";
      const arg = String(row.ID) + "/" + String(revision);
      rowNode.Kids.push(hElement("button", "row-" + String(row.ID) + "-publish", [
        hAttr("class", "publish"),
        ...(canPublish ? [] : [hAttr("disabled", "", true)]),
      ], [hLiteral("click", "publish", arg)], [hText("Publish")]));
    });
  }
  applyReadOnly(tree, inputs.ReadOnly);
  return tree;
}

function parsePublicationArg(arg) {
  const match = /^(?:[1-9][0-9]*)\/(?:0|[1-9][0-9]*)$/.exec(arg);
  if (!match) throw fail("publish control must carry an exact ROW/REVISION argument");
  const [rowText, revisionText] = arg.split("/");
  const rowID = Number(rowText);
  const revision = Number(revisionText);
  assertID(rowID, "publish row ID");
  assertRevision(revision);
  if (String(rowID) !== rowText || String(revision) !== revisionText) {
    throw fail("publish control must carry canonical decimal IDs and revision");
  }
  return { rowID, revision };
}

function appendNewBaseMessages(meta, before, after) {
  const previous = before.messages.length;
  for (const message of after.messages.slice(previous)) meta.messages.push(clone(message));
}

/** Create an independent composition manager over collection-reference sessions. */
export function createCompositionReference() {
  const sessions = createSessionTreeReference();
  const metadata = new Map();
  const dirty = new Set();
  let nextSequence = 0;

  function requireMeta(id, description = "session ID") {
    assertID(id, description);
    const meta = metadata.get(id);
    if (!meta) throw fail("unknown or disposed session ID " + String(id));
    return meta;
  }

  function newMeta(parentID) {
    return {
      parentID,
      inputs: { Title: "", ReadOnly: false },
      inputRevision: 0,
      inbox: [],
      messages: [],
    };
  }

  function markDirty(...ids) {
    for (const id of ids) dirty.add(id);
  }

  function project(id) {
    const meta = requireMeta(id);
    const base = sessions.snapshot(id);
    const isRoot = meta.parentID === 0;
    return {
      state: {
        ...clone(base.state),
        Inputs: clone(meta.inputs),
        InputRevision: meta.inputRevision,
        Inbox: clone(meta.inbox),
      },
      tree: compositionTree(base, meta.inputs, meta.inputRevision, meta.inbox, isRoot),
      bindings: clone(base.bindings),
      messages: clone(meta.messages),
    };
  }

  function clearDisposed(ids) {
    for (const id of ids) {
      metadata.delete(id);
      dirty.delete(id);
    }
  }

  function setChildInputs(parentID, childID, rawInputs) {
    exactArity(arguments.length, 3, "setChildInputs");
    const inputs = normalizeInputs(rawInputs);
    assertID(parentID, "parent session ID");
    assertID(childID, "child session ID");
    const parent = requireMeta(parentID, "parent session ID");
    const child = requireMeta(childID, "child session ID");
    if (child.parentID !== parentID) {
      throw fail("session ID " + String(childID) + " is not an immediate child of session ID " + String(parentID));
    }
    if (child.inputRevision >= MAX_COMPOSITION_INTEGER) {
      throw fail("input revision space exhausted at " + String(child.inputRevision), RangeError);
    }
    child.inputs = inputs;
    child.inputRevision += 1;
    markDirty(childID);
    void parent;
    return project(childID);
  }

  function publish(childID, rowID, revision) {
    exactArity(arguments.length, 3, "publish");
    assertID(childID, "child session ID");
    assertID(rowID, "row ID");
    assertRevision(revision);
    const child = requireMeta(childID, "child session ID");
    if (child.parentID === 0) throw fail("root session ID " + String(childID) + " cannot publish");
    const parent = requireMeta(child.parentID, "parent session ID");
    if (child.inputs.ReadOnly) throw fail("session ID " + String(childID) + " is read-only");
    if (revision !== child.inputRevision) {
      throw fail("input revision " + String(revision) + " is stale; current revision is " + String(child.inputRevision));
    }
    if (nextSequence >= MAX_COMPOSITION_INTEGER) {
      throw fail("publication sequence space exhausted at " + String(nextSequence), RangeError);
    }
    const snapshot = sessions.snapshot(childID);
    const row = snapshot.state.Rows.find((candidate) => candidate.ID === rowID);
    if (!row) throw fail("row " + String(rowID) + " no longer exists");
    if (row.Saved === "") throw fail("row " + String(rowID) + " has no saved value to publish");

    const receipt = {
      Sequence: nextSequence + 1,
      ParentID: child.parentID,
      ChildID: childID,
      RowID: rowID,
      Saved: row.Saved,
      Saves: row.Saves,
      InputRevision: child.inputRevision,
    };
    // Commit only after every admission check has succeeded.
    nextSequence = receipt.Sequence;
    parent.inbox.push(receipt);
    child.messages.push({ Name: "publish", Arg: String(rowID) + "/" + String(revision) });
    markDirty(childID, child.parentID);
    return clone(receipt);
  }

  function dispatch(id, rawStep) {
    exactArity(arguments.length, 2, "dispatch");
    const meta = requireMeta(id);
    const step = normalizeStep(rawStep);
    const current = project(id);
    const target = nodeAtPath(current.tree, step.Path);
    if (target.Key !== step.Key) {
      throw fail("dispatch key " + JSON.stringify(step.Key) + " does not match target key " + JSON.stringify(target.Key));
    }

    const bindings = current.bindings.filter((binding) =>
      binding.Path === step.Path && binding.Event === step.Event);
    const handlers = (target.On ?? []).filter((handler) => handler.Event === step.Event);
    if (bindings.length > 1 || handlers.length > 1) {
      throw fail("dispatch target has ambiguous event declarations");
    }
    const binding = bindings[0] ?? null;
    const handler = handlers[0] ?? null;

    // A publish node is intercepted only after its current path, key, event,
    // and literal ROW/REVISION have all been verified.
    const publishHandler = (target.On ?? []).filter((item) => item.Message === "publish");
    if (publishHandler.length > 0) {
      if (publishHandler.length !== 1 || publishHandler[0].Event !== "click" ||
          step.Event !== "click" || !handler || handler !== publishHandler[0]) {
        throw fail("publish control path, key, or event is not canonical");
      }
      const { rowID, revision } = parsePublicationArg(publishHandler[0].Arg);
      if (step.Value !== publishHandler[0].Arg) {
        throw fail("publish dispatch value must equal the current literal ROW/REVISION argument");
      }
      const row = sessions.snapshot(id).state.Rows.find((candidate) => candidate.ID === rowID);
      if (!row || !step.Path.startsWith("2/")) {
        throw fail("publish control does not identify a current collection row");
      }
      if (disabled(target)) return project(id);
      publish(id, rowID, revision);
      return project(id);
    }

    if (!binding && !handler) {
      throw fail("no " + JSON.stringify(step.Event) + " handler or binding at path " + JSON.stringify(step.Path));
    }
    // Validate the event declaration before applying read-only suppression.
    if (meta.inputs.ReadOnly || disabled(target)) return project(id);

    const before = sessions.snapshot(id);
    const after = sessions.dispatch(id, step);
    appendNewBaseMessages(meta, before, after);
    if (after.messages.length > before.messages.length) markDirty(id);
    return project(id);
  }

  function complete(id, reply) {
    exactArity(arguments.length, 2, "complete");
    const meta = requireMeta(id);
    const before = sessions.snapshot(id);
    const after = sessions.complete(id, reply);
    appendNewBaseMessages(meta, before, after);
    if (after.messages.length > before.messages.length) markDirty(id);
    return project(id);
  }

  function dispose(id) {
    exactArity(arguments.length, 1, "dispose");
    requireMeta(id);
    const commands = sessions.dispose(id);
    clearDisposed([id]);
    return commands;
  }

  function disposeTree(id) {
    exactArity(arguments.length, 1, "disposeTree");
    requireMeta(id);
    const disposed = sessions.disposeTree(id);
    clearDisposed(disposed.map((item) => item.SessionID));
    return disposed;
  }

  return {
    create() {
      exactArity(arguments.length, 0, "create");
      const id = sessions.create();
      metadata.set(id, newMeta(0));
      return id;
    },
    createChild(parentID) {
      exactArity(arguments.length, 1, "createChild");
      requireMeta(parentID, "parent session ID");
      const id = sessions.createChild(parentID);
      metadata.set(id, newMeta(parentID));
      return id;
    },
    tree() {
      exactArity(arguments.length, 0, "tree");
      return sessions.tree();
    },
    list() {
      exactArity(arguments.length, 0, "list");
      return sessions.list();
    },
    snapshot(id) {
      exactArity(arguments.length, 1, "snapshot");
      return project(id);
    },
    dispatch,
    effects(id) {
      exactArity(arguments.length, 1, "effects");
      requireMeta(id);
      return sessions.effects(id);
    },
    complete,
    audit(id) {
      exactArity(arguments.length, 1, "audit");
      requireMeta(id);
      return sessions.audit(id);
    },
    dispose,
    disposeTree,
    setChildInputs(parentID, childID, rawInputs) {
      exactArity(arguments.length, 3, "setChildInputs");
      return setChildInputs(parentID, childID, rawInputs);
    },
    publish(childID, rowID, revision) {
      exactArity(arguments.length, 3, "publish");
      return publish(childID, rowID, revision);
    },
    changes() {
      exactArity(arguments.length, 0, "changes");
      const result = [...dirty].filter((id) => metadata.has(id)).sort((left, right) => left - right);
      dirty.clear();
      return result;
    },
    encodeHTTP,
    decodeHTTP,
  };
}
