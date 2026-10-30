// Independent session-tree manager and pinned React collection renderer.
// All collection state and Go-shaped snapshots come from the existing JS
// reference model; this module never reads a candidate manager or renderer.

import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync, version as reactDOMVersion } from "react-dom";
import { createCollectionReference } from "../keyed-editor/model.mjs";

const h = React.createElement;
const MAX_SESSION_ID = Number.MAX_SAFE_INTEGER;
export const MAX_TREE_DEPTH = 32;
export const referenceReactVersion = React.version;
export const referenceReactDOMVersion = reactDOMVersion;

function fail(message, cause) {
  return new Error(`session-tree reference: ${message}`, cause === undefined ? undefined : { cause });
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const copy = {};
    for (const [key, item] of Object.entries(value)) copy[key] = clone(item);
    return copy;
  }
  return value;
}

function assertSessionID(id, description = "session ID") {
  if (!Number.isSafeInteger(id) || id <= 0 || id > MAX_SESSION_ID) {
    throw fail(`${description} must be a positive JavaScript-safe integer`);
  }
  return id;
}

/** Create an independent Go-manager-shaped tree over collection reference models. */
export function createSessionTreeReference() {
  let nextID = 0;
  const sessions = new Map();
  const positions = new Map();

  function requireSession(id) {
    assertSessionID(id);
    const session = sessions.get(id);
    if (!session) throw fail(`unknown or disposed session ID ${id}`);
    return session;
  }

  function createAt(parentID, depth) {
    if (nextID >= MAX_SESSION_ID) throw fail("session ID allocation exceeds the JavaScript-safe integer limit");
    const id = ++nextID;
    const model = createCollectionReference();
    model.init();
    sessions.set(id, model);
    positions.set(id, { SessionID: id, ParentID: parentID, Depth: depth });
    return id;
  }

  function childrenOf(id) {
    return [...positions.values()]
      .filter((info) => info.ParentID === id)
      .map((info) => info.SessionID)
      .sort((left, right) => left - right);
  }

  function postorder(id, result = []) {
    for (const childID of childrenOf(id)) postorder(childID, result);
    result.push(id);
    return result;
  }

  function disposeOne(id) {
    const session = requireSession(id);
    const queued = session.effects();
    const commands = [];
    const seen = new Set();
    const appendCancel = (requestID) => {
      if (!Number.isSafeInteger(requestID) || requestID <= 0 || seen.has(requestID)) return;
      seen.add(requestID);
      // This matches the actual Go-to-JavaScript JSON representation: the
      // empty command Value field is present, not omitted.
      commands.push({ Kind: "cancel", ID: requestID, Value: "" });
    };
    for (const command of queued) {
      if (command.Kind === "cancel") appendCancel(command.ID);
    }
    for (const row of session.snapshot().state.Rows) appendCancel(row.PendingID);
    sessions.delete(id);
    positions.delete(id);
    return commands;
  }

  return {
    create() {
      return createAt(0, 1);
    },
    createChild(parentID) {
      assertSessionID(parentID, "parent session ID");
      requireSession(parentID);
      const parent = positions.get(parentID);
      if (!parent) throw fail(`unknown parent session ID ${parentID}`);
      if (parent.Depth >= MAX_TREE_DEPTH) {
        throw fail(`parent session ID ${parentID} is at maximum tree depth ${MAX_TREE_DEPTH}`);
      }
      return createAt(parentID, parent.Depth + 1);
    },
    tree() {
      return [...positions.values()]
        .sort((left, right) => left.SessionID - right.SessionID)
        .map((info) => clone(info));
    },
    list() {
      return [...sessions.keys()].sort((left, right) => left - right);
    },
    snapshot(id) {
      return requireSession(id).snapshot();
    },
    dispatch(id, step) {
      return requireSession(id).dispatch(step);
    },
    effects(id) {
      return requireSession(id).effects();
    },
    complete(id, reply) {
      const session = requireSession(id);
      return session.complete(reply);
    },
    audit(id) {
      return requireSession(id).audit();
    },
    dispose(id) {
      requireSession(id);
      if (childrenOf(id).length > 0) throw fail(`session ID ${id} has live children`);
      return disposeOne(id);
    },
    disposeTree(id) {
      requireSession(id);
      return postorder(id).map((sessionID) => ({
        SessionID: sessionID,
        Commands: disposeOne(sessionID),
      }));
    },
  };
}

function childPath(parent, index) {
  return parent === "" ? String(index) : `${parent}/${index}`;
}

function listOrEmpty(value) {
  return value == null ? [] : value;
}

function nodeAtPath(tree, path) {
  let current = tree;
  if (path === "") return current;
  for (const part of path.split("/")) {
    const index = Number(part);
    if (!Number.isSafeInteger(index) || index < 0 || !Array.isArray(current?.Kids) || index >= current.Kids.length) {
      throw fail(`invalid collection path ${JSON.stringify(path)}`);
    }
    current = current.Kids[index];
  }
  return current;
}

function pathFromRoot(element, treeRoot) {
  const indexes = [];
  let current = element;
  while (current && current !== treeRoot) {
    const parent = current.parentNode;
    if (!parent) return null;
    indexes.push(Array.prototype.indexOf.call(parent.childNodes, current));
    current = parent;
  }
  return current === treeRoot ? indexes.reverse().join("/") : null;
}

function isDisabled(node) {
  return (node?.Attrs ?? []).some((attribute) => attribute.Name === "disabled" && attribute.Flag === true);
}

function assertSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) ||
      !snapshot.state || !snapshot.tree || !Array.isArray(snapshot.bindings) || !Array.isArray(snapshot.messages)) {
    throw fail("reference runtime returned an invalid collection snapshot");
  }
  return clone(snapshot);
}

function assertElementAttributes(node) {
  const props = {};
  for (const attribute of listOrEmpty(node.Attrs)) {
    if (!attribute || typeof attribute.Name !== "string") throw fail("collection attributes must have a string Name");
    switch (attribute.Name) {
      case "class":
        props.className = attribute.Value;
        break;
      case "aria-label":
        props["aria-label"] = attribute.Value;
        break;
      case "type":
        props.type = attribute.Value;
        break;
      case "value":
        props.value = attribute.Value;
        break;
      case "disabled":
        props.disabled = attribute.Flag === true;
        break;
      default:
        throw fail(`independent React projection does not accept attribute ${JSON.stringify(attribute.Name)}`);
    }
  }
  return props;
}

/**
 * Mount one independent keyed React collection into a tree host's view root.
 * `initial` is a snapshot of this reference session; it is never obtained from
 * the candidate manager.
 */
export function mountTreeReferenceCollection(root, runtime, initial, onFailure = undefined) {
  if (!root || root.nodeType !== 1 || !root.ownerDocument) {
    throw fail("mountTreeReferenceCollection requires a DOM element with ownerDocument");
  }
  if (!runtime || typeof runtime !== "object" || typeof runtime.dispatch !== "function") {
    throw fail("reference runtime must expose dispatch(step)");
  }
  if (initial === undefined) {
    if (typeof runtime.init !== "function") throw fail("initial snapshot is required when runtime.init() is unavailable");
    initial = runtime.init();
  }
  if (onFailure !== undefined && typeof onFailure !== "function") throw fail("onFailure must be a function when supplied");
  if (React.version !== "19.3.1" || reactDOMVersion !== "19.3.1") {
    throw fail(`expected React and ReactDOM 19.3.1, got ${React.version} and ${reactDOMVersion}`);
  }

  let current = assertSnapshot(initial);
  let active = true;
  let lastError = null;
  let reactRoot = null;
  let rootMounted = false;
  let pathsByKey = new Map();
  let elementOrder = [];
  const elementsByKey = new Map();
  const keysByElement = new WeakMap();
  const refsByKey = new Map();

  function refFor(key) {
    let callback = refsByKey.get(key);
    if (!callback) {
      callback = (element) => {
        if (element) {
          elementsByKey.set(key, element);
          keysByElement.set(element, key);
        } else {
          const previous = elementsByKey.get(key);
          if (previous) keysByElement.delete(previous);
          elementsByKey.delete(key);
        }
      };
      refsByKey.set(key, callback);
    }
    return callback;
  }

  function notifyFailure(error) {
    lastError = error;
    active = false;
    try {
      if (onFailure) onFailure(error);
      else if (typeof runtime.rendererFailed === "function") runtime.rendererFailed(error);
    } catch (reportError) {
      lastError = reportError;
    }
  }

  function buildReact(snapshot) {
    const nextPathsByKey = new Map();
    const nextElementOrder = [];

    function toReact(node, path) {
      if (!node || typeof node !== "object" || Array.isArray(node)) {
        throw fail(`invalid collection Node at ${path || "<root>"}`);
      }
      if (node.Kind === 2) {
        if (node.Tag || node.Key || typeof node.Text !== "string") {
          throw fail(`invalid text Node at ${path || "<root>"}`);
        }
        return node.Text;
      }
      if (node.Kind === 3) {
        const children = listOrEmpty(node.Kids).map((child, index) => toReact(child, childPath(path, index)));
        return h(React.Fragment, { key: path || "reference-fragment" }, ...children);
      }
      if (node.Kind !== 1 || typeof node.Tag !== "string" || typeof node.Key !== "string" || node.Key === "") {
        throw fail(`invalid element Node at ${path || "<root>"}`);
      }
      const props = assertElementAttributes(node);
      const binding = snapshot.bindings.find((item) => item.Path === path && item.Event === "input");
      const click = listOrEmpty(node.On).find((item) => item.Event === "click");
      if (binding) {
        props.onInput = (event) => dispatchEvent(node.Key, event);
        props.onChange = () => {};
      }
      if (click) props.onClick = (event) => dispatchEvent(node.Key, event);
      props.key = node.Key;
      props.ref = refFor(node.Key);
      nextPathsByKey.set(node.Key, path);
      nextElementOrder.push({ key: node.Key, path });
      const children = listOrEmpty(node.Kids).map((child, index) => toReact(child, childPath(path, index)));
      return h(node.Tag, props, ...children);
    }

    return { element: toReact(snapshot.tree, ""), pathsByKey: nextPathsByKey, elementOrder: nextElementOrder };
  }

  function treeRoot() {
    return root.firstElementChild;
  }

  function captureFocus() {
    const top = treeRoot();
    const activeElement = root.ownerDocument.activeElement;
    if (!top || !activeElement || !top.contains(activeElement) || activeElement.tagName !== "INPUT") return null;
    const key = keysByElement.get(activeElement);
    if (key == null || elementsByKey.get(key) !== activeElement) return null;
    const path = pathFromRoot(activeElement, top);
    const node = nodeAtPath(current.tree, path);
    return {
      Key: node.Key,
      Path: path,
      SelectionStart: activeElement.selectionStart,
      SelectionEnd: activeElement.selectionEnd,
      SelectionDirection: activeElement.selectionDirection,
    };
  }

  function restoreFocus(focus) {
    if (!focus || typeof focus.Key !== "string") return false;
    const element = elementsByKey.get(focus.Key);
    if (!element || !root.contains(element) || element.tagName !== "INPUT" || element.disabled) return false;
    try {
      element.focus();
      if (Number.isInteger(focus.SelectionStart) && Number.isInteger(focus.SelectionEnd)) {
        element.setSelectionRange(focus.SelectionStart, focus.SelectionEnd, focus.SelectionDirection ?? "none");
      }
      return true;
    } catch {
      return false;
    }
  }

  function update(snapshot, focus = captureFocus()) {
    if (!active) throw fail("cannot update after unmount or renderer failure");
    const next = assertSnapshot(snapshot);
    const built = buildReact(next);
    const previous = { current, pathsByKey, elementOrder };
    current = next;
    pathsByKey = built.pathsByKey;
    elementOrder = built.elementOrder;
    lastError = null;
    try {
      flushSync(() => reactRoot.render(built.element));
      if (active) restoreFocus(focus);
    } catch (error) {
      current = previous.current;
      pathsByKey = previous.pathsByKey;
      elementOrder = previous.elementOrder;
      throw error;
    }
    return clone(current);
  }

  function dispatchEvent(key, event) {
    const element = event.currentTarget;
    if (!active || elementsByKey.get(key) !== element || !root.contains(element)) return;
    const path = pathsByKey.get(key);
    if (path == null) return;
    const target = nodeAtPath(current.tree, path);
    if (isDisabled(target)) return;
    const binding = current.bindings.find((item) => item.Path === path && item.Event === event.type);
    const handler = listOrEmpty(target.On).find((item) => item.Event === event.type);
    if (!binding && !handler) return;
    const focus = captureFocus();
    const step = {
      Path: path,
      Event: event.type,
      Value: binding ? element.value : (handler.Arg ?? ""),
      Key: key,
    };
    try {
      update(runtime.dispatch(step), focus);
    } catch (error) {
      notifyFailure(error);
    }
  }

  const firstRender = buildReact(current);
  pathsByKey = firstRender.pathsByKey;
  elementOrder = firstRender.elementOrder;
  reactRoot = createRoot(root, {
    onUncaughtError(error) { notifyFailure(error); },
    onRecoverableError(error) { notifyFailure(error); },
  });
  try {
    flushSync(() => reactRoot.render(firstRender.element));
    rootMounted = true;
  } catch (error) {
    active = false;
    try { flushSync(() => reactRoot.unmount()); } catch { /* preserve the render failure */ }
    throw error;
  }

  function domSnapshot() {
    const disabled = elementOrder.filter(({ key }) => {
      const element = elementsByKey.get(key);
      return Boolean(element && "disabled" in element && element.disabled);
    }).map(({ path }) => path);
    return { html: root.innerHTML, disabled };
  }

  function inputForKey(key) {
    if (typeof key !== "string") throw new TypeError("inputForKey requires a primitive string key");
    const element = elementsByKey.get(key);
    return element?.tagName === "INPUT" && root.contains(element) ? element : null;
  }

  const api = {
    update,
    snapshot() { return clone(current); },
    domSnapshot,
    focusState: captureFocus,
    restoreFocus,
    inputForKey,
    click(path) {
      if (!active) throw fail("cannot click after unmount or renderer failure");
      const normalized = Array.isArray(path) ? path.join("/") : String(path);
      const target = nodeAtPath(current.tree, normalized);
      const key = target?.Key;
      const element = typeof key === "string" ? elementsByKey.get(key) : null;
      if (!element || !root.contains(element)) throw fail(`no rendered element exists at collection path ${JSON.stringify(normalized)}`);
      element.click();
      if (lastError) throw lastError;
      return api.snapshot();
    },
    unmount() {
      if (!rootMounted) return;
      active = false;
      rootMounted = false;
      elementsByKey.clear();
      pathsByKey.clear();
      elementOrder = [];
      lastError = null;
      flushSync(() => reactRoot.unmount());
    },
    get lastError() { return lastError; },
  };
  return api;
}
