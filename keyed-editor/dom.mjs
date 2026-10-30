import {
  ELEMENT,
  FRAGMENT,
  TEXT,
  bindingAt,
  clone,
  isDisabled,
  keyAtPath,
  literalHandlerAt,
  nodeAtPath,
  normalizePath,
  pathForKey,
  validateSnapshot,
} from "./protocol.mjs";

function fail(message, cause) {
  return new Error(`keyed editor DOM: ${message}`, cause === undefined ? undefined : { cause });
}

const NO_HANDLER = Symbol("no declared event handler");

function listOrEmpty(value) {
  return value == null ? [] : value;
}

function childPath(parent, index) {
  return parent === "" ? String(index) : `${parent}/${index}`;
}

function indexTree(tree) {
  const byPath = new Map();
  const byKey = new Map();
  function visit(node, path) {
    byPath.set(path, node);
    if (node.Kind === ELEMENT) byKey.set(node.Key, node);
    if (node.Kind === ELEMENT || node.Kind === FRAGMENT) {
      listOrEmpty(node.Kids).forEach((child, index) => visit(child, childPath(path, index)));
    }
  }
  visit(tree, "");
  return { byPath, byKey };
}

function flattenedChildren(kids, parentPath) {
  const result = [];
  function append(node, path) {
    if (node.Kind === FRAGMENT) {
      listOrEmpty(node.Kids).forEach((child, index) => append(child, childPath(path, index)));
    } else {
      result.push({ node, path });
    }
  }
  listOrEmpty(kids).forEach((node, index) => append(node, childPath(parentPath, index)));
  return result;
}

function sameRenderedKind(node, domNode) {
  if (!domNode) return false;
  if (node.Kind === TEXT) return domNode.nodeType === 3;
  return node.Kind === ELEMENT && domNode.nodeType === 1 && domNode.localName === node.Tag;
}

function inputValue(node) {
  if (!node || node.Kind !== ELEMENT || node.Tag !== "input") return undefined;
  const values = listOrEmpty(node.Attrs).filter((attr) => attr.Name === "value");
  return values.length === 1 && !values[0].Flag ? values[0].Value : undefined;
}

/**
 * Capture selection for the active keyed text input. The caller supplies a
 * current DOM-element-to-key lookup so this helper never adds key attributes.
 */
export function captureFocus(root, keyForElement) {
  if (!root || typeof keyForElement !== "function") return null;
  const element = root.ownerDocument?.activeElement;
  if (!element || typeof root.contains !== "function" || !root.contains(element) ||
      element.localName !== "input" || element.disabled === true ||
      typeof element.setSelectionRange !== "function" ||
      !("selectionStart" in element) || !("selectionEnd" in element)) return null;
  let key;
  let start;
  let end;
  let direction;
  try {
    key = keyForElement(element);
    start = element.selectionStart;
    end = element.selectionEnd;
    direction = element.selectionDirection;
  } catch {
    return null;
  }
  if (typeof key !== "string" || key === "" || !Number.isInteger(start) || !Number.isInteger(end)) return null;
  return {
    key,
    selectionStart: start,
    selectionEnd: end,
    selectionDirection: typeof direction === "string" ? direction : "none",
  };
}

/** Restore a captured logical input selection by key, if its input still exists. */
export function restoreFocus(root, state, elementForKey, enabledForKey = () => true) {
  if (state == null) return false;
  if (!state || typeof state !== "object" || Array.isArray(state) ||
      Object.keys(state).sort().join(",") !== "key,selectionDirection,selectionEnd,selectionStart" ||
      typeof state.key !== "string" || !Number.isInteger(state.selectionStart) ||
      !Number.isInteger(state.selectionEnd) || typeof state.selectionDirection !== "string" ||
      typeof elementForKey !== "function") {
    throw fail("focus state must contain key, selectionStart, selectionEnd and selectionDirection");
  }
  let element;
  let enabled;
  try {
    element = elementForKey(state.key);
    enabled = enabledForKey(state.key);
  } catch (error) {
    throw fail("focus lookup failed", error);
  }
  if (!element || enabled !== true || element.localName !== "input" || element.disabled === true ||
      typeof element.focus !== "function" || typeof element.setSelectionRange !== "function" ||
      !("selectionStart" in element) || !("selectionEnd" in element) ||
      typeof root?.contains !== "function" || !root.contains(element)) return false;

  if (root.ownerDocument?.activeElement !== element) element.focus();
  try {
    if (element.selectionStart !== state.selectionStart || element.selectionEnd !== state.selectionEnd ||
        element.selectionDirection !== state.selectionDirection) {
      element.setSelectionRange(state.selectionStart, state.selectionEnd, state.selectionDirection);
    }
  } catch {
    // Some input implementations expose a partial selection API. Focus remains
    // useful, while unsupported selection restoration is simply skipped.
  }
  return true;
}

/**
 * Mount a bounded keyed Gobi tree into real DOM. All application transitions
 * remain in the runtime; this renderer only validates, patches and transports
 * current browser events.
 */
export function mountKeyedDOM(root, runtime) {
  if (!root || typeof root.replaceChildren !== "function" || !root.ownerDocument) {
    throw fail("root must be a DOM element with ownerDocument and replaceChildren()");
  }
  if (!runtime || typeof runtime.init !== "function" || typeof runtime.dispatch !== "function") {
    throw fail("runtime must expose init() and dispatch(step)");
  }

  const document = root.ownerDocument;
  let current;
  try {
    current = clone(validateSnapshot(runtime.init()));
  } catch (error) {
    throw fail("runtime.init() returned an invalid snapshot", error);
  }

  let active = true;
  let disposed = false;
  let patching = false;
  let lastError = null;
  let pathElements = new Map();
  let domByPath = new Map();
  let domByKey = new Map();
  let elementByKey = new Map();
  let elementKeyByDOM = new WeakMap();
  let pathByDOM = new WeakMap();
  let listenerRecords = new Map();

  function removeListenersFor(element) {
    const records = listenerRecords.get(element);
    if (!records) return;
    for (const [eventName, record] of records) element.removeEventListener(eventName, record.listener);
    listenerRecords.delete(element);
  }

  function syncListeners(element, path, node, snapshot) {
    const desired = new Set();
    for (const handler of listOrEmpty(node.On)) desired.add(handler.Event);
    for (const binding of snapshot.bindings) {
      if (binding.Path === path) desired.add(binding.Event);
    }

    let records = listenerRecords.get(element);
    if (!records) {
      records = new Map();
      listenerRecords.set(element, records);
    }
    for (const [eventName, record] of records) {
      if (!desired.has(eventName)) {
        element.removeEventListener(eventName, record.listener);
        records.delete(eventName);
      }
    }
    for (const eventName of desired) {
      if (records.has(eventName)) continue;
      const record = { listener: (event) => handleEvent(event) };
      records.set(eventName, record);
      element.addEventListener(eventName, record.listener);
    }
  }

  function patchAttributes(element, node, previousNode) {
    const declared = listOrEmpty(node.Attrs);
    // Match React's ordinary-attributes, type, value order for inputs.
    const attrs = node.Tag === "input"
      ? [
          ...declared.filter((attr) => attr.Name !== "type" && attr.Name !== "value"),
          ...declared.filter((attr) => attr.Name === "type"),
          ...declared.filter((attr) => attr.Name === "value"),
        ]
      : declared;
    const nextNames = new Set(attrs.map((attr) => attr.Name));
    for (const existing of Array.from(element.attributes)) {
      if (!nextNames.has(existing.name)) element.removeAttribute(existing.name);
    }

    const oldValue = inputValue(previousNode);
    for (const attr of attrs) {
      const before = element.getAttribute(attr.Name);
      if (attr.Flag) {
        if (!element.hasAttribute(attr.Name)) element.setAttribute(attr.Name, "");
      } else if (before !== attr.Value) {
        element.setAttribute(attr.Name, attr.Value);
      }
      if (attr.Name === "value" && "value" in element && oldValue !== attr.Value && element.value !== attr.Value) {
        element.value = attr.Value;
      }
    }
  }

  function createOrPatch(entry, nextSnapshot, previousNodes, previousDOMByPath, previousDOMByKey,
                         nextDOMByPath, nextDOMByKey, nextElements, nextElementsByKey) {
    const { node, path } = entry;
    const oldNodeAtPath = previousNodes.byPath.get(path);
    const oldNodeByKey = node.Kind === ELEMENT ? previousNodes.byKey.get(node.Key) : oldNodeAtPath;
    const oldDOM = node.Kind === ELEMENT
      ? previousDOMByKey.get(node.Key)
      : previousDOMByPath.get(path);
    const compatible = oldDOM && sameRenderedKind(node, oldDOM) && oldNodeByKey?.Kind === node.Kind &&
      (node.Kind !== ELEMENT || oldNodeByKey.Tag === node.Tag);
    let domNode;

    if (compatible) {
      domNode = oldDOM;
    } else if (node.Kind === TEXT) {
      domNode = document.createTextNode(node.Text);
    } else if (node.Kind === ELEMENT) {
      domNode = document.createElement(node.Tag);
    } else {
      throw fail(`cannot render Node.Kind ${JSON.stringify(node.Kind)} at ${JSON.stringify(path)}`);
    }

    nextDOMByPath.set(path, domNode);
    if (node.Kind === TEXT) {
      if (domNode.nodeValue !== node.Text) domNode.nodeValue = node.Text;
      return domNode;
    }

    nextDOMByKey.set(node.Key, domNode);
    nextElements.set(path, domNode);
    nextElementsByKey.set(node.Key, domNode);
    patchAttributes(domNode, node, compatible ? oldNodeByKey : null);
    syncListeners(domNode, path, node, nextSnapshot);
    reconcileChildren(domNode, node.Kids, path, nextSnapshot, previousNodes, previousDOMByPath,
      previousDOMByKey, nextDOMByPath, nextDOMByKey, nextElements, nextElementsByKey);
    return domNode;
  }

  function reconcileChildren(container, kids, parentPath, nextSnapshot, previousNodes, previousDOMByPath,
                             previousDOMByKey, nextDOMByPath, nextDOMByKey, nextElements, nextElementsByKey) {
    const entries = flattenedChildren(kids, parentPath);
    reconcileEntries(container, entries, nextSnapshot, previousNodes, previousDOMByPath, previousDOMByKey,
      nextDOMByPath, nextDOMByKey, nextElements, nextElementsByKey);
  }

  function reconcileEntries(container, entries, nextSnapshot, previousNodes, previousDOMByPath,
                            previousDOMByKey, nextDOMByPath, nextDOMByKey, nextElements, nextElementsByKey) {
    for (let index = 0; index < entries.length; index += 1) {
      const domNode = createOrPatch(entries[index], nextSnapshot, previousNodes, previousDOMByPath,
        previousDOMByKey, nextDOMByPath, nextDOMByKey, nextElements, nextElementsByKey);
      const existing = container.childNodes[index] ?? null;
      if (existing !== domNode) container.insertBefore(domNode, existing);
    }
    while (container.childNodes.length > entries.length) container.removeChild(container.childNodes[entries.length]);
  }

  function paint(snapshot) {
    const previousNodes = indexTree(current.tree);
    const previousDOMByKey = domByKey;
    const nextDOMByPath = new Map();
    const nextDOMByKey = new Map();
    const nextElements = new Map();
    const nextElementsByKey = new Map();
    const previousListeners = listenerRecords;
    patching = true;
    try {
      const rootEntries = snapshot.tree.Kind === FRAGMENT
        ? flattenedChildren(snapshot.tree.Kids, "")
        : [{ node: snapshot.tree, path: "" }];
      reconcileEntries(root, rootEntries, snapshot, previousNodes, domByPath, previousDOMByKey,
        nextDOMByPath, nextDOMByKey, nextElements, nextElementsByKey);
      for (const element of [...previousListeners.keys()]) {
        if (!nextElementsByKeyHas(nextElementsByKey, element)) removeListenersFor(element);
      }
      current = snapshot;
      pathElements = nextElements;
      domByPath = nextDOMByPath;
      domByKey = nextDOMByKey;
      elementByKey = nextElementsByKey;
      elementKeyByDOM = new WeakMap();
      pathByDOM = new WeakMap();
      for (const [path, node] of nextDOMByPath) pathByDOM.set(node, path);
      for (const [key, element] of nextElementsByKey) elementKeyByDOM.set(element, key);
    } finally {
      patching = false;
    }
  }

  function nextElementsByKeyHas(elements, target) {
    for (const element of elements.values()) if (element === target) return true;
    return false;
  }

  function failClosed(error, notifyHost = false) {
    lastError = error instanceof Error ? error : fail(String(error));
    active = false;
    if (notifyHost && typeof runtime.rendererFailed === "function") {
      try { runtime.rendererFailed(lastError); } catch { /* retain the renderer failure */ }
    }
  }

  function dispatchForEvent(path, event) {
    const node = nodeAtPath(current.tree, path);
    const key = keyAtPath(current.tree, path);
    const binding = bindingAt(current, path, event.type);
    let value;
    if (binding) {
      // Read the actual currentTarget, never a captured event.target or stale value.
      value = event.currentTarget.value;
      if (typeof value !== "string") throw fail("bound input currentTarget.value must be a string");
    } else {
      const handler = literalHandlerAt(current.tree, path, event.type);
      if (!handler) return NO_HANDLER;
      value = handler.Arg;
    }
    if (node.Kind !== ELEMENT || key === "") throw fail(`event target at ${path} is not a keyed element`);
    return runtime.dispatch({ Path: path, Event: event.type, Value: value, Key: key });
  }

  function handleEvent(event) {
    const target = event?.currentTarget;
    const path = target ? pathByDOM.get(target) : null;
    if (!active || patching || !target || typeof path !== "string" || pathElements.get(path) !== target ||
        (typeof root.contains === "function" && !root.contains(target))) return;
    try {
      const node = nodeAtPath(current.tree, path);
      if (isDisabled(node) || target.disabled === true) return;
      const result = dispatchForEvent(path, event);
      if (result === NO_HANDLER) return;
      const next = clone(validateSnapshot(result));
      const focus = captureFocus(root, (element) => elementKeyByDOM.get(element));
      paint(next);
      restoreLogicalFocus(focus);
      lastError = null;
    } catch (error) {
      failClosed(error, true);
    }
  }

  function restoreLogicalFocus(state) {
    if (!state) return false;
    const keyPath = pathForKey(current.tree, state.key);
    if (keyPath === null) return false;
    const node = nodeAtPath(current.tree, keyPath);
    if (node.Kind !== ELEMENT || node.Tag !== "input" || isDisabled(node)) return false;
    return restoreFocus(
      root,
      state,
      (key) => elementByKey.get(key) ?? null,
      (key) => {
        const path = pathForKey(current.tree, key);
        if (path === null) return false;
        return !isDisabled(nodeAtPath(current.tree, path));
      },
    );
  }

  function assertActive() {
    if (disposed) throw fail("renderer has been unmounted");
    if (!active) {
      if (lastError) throw fail("renderer is fenced after an error", lastError);
      throw fail("renderer is inactive");
    }
  }

  function domSnapshot() {
    const disabled = [...pathElements]
      .filter(([, element]) => Boolean("disabled" in element && element.disabled))
      .map(([path]) => path);
    return { html: root.innerHTML, disabled };
  }

  const api = {
    update(snapshot) {
      assertActive();
      try {
        const next = clone(validateSnapshot(snapshot));
        const focus = captureFocus(root, (element) => elementKeyByDOM.get(element));
        paint(next);
        restoreLogicalFocus(focus);
        lastError = null;
        return api.snapshot();
      } catch (error) {
        failClosed(error);
        throw error instanceof Error ? error : fail(String(error));
      }
    },
    snapshot() {
      return clone(current);
    },
    domSnapshot,
    click(path) {
      assertActive();
      const normalized = normalizePath(path);
      const element = pathElements.get(normalized);
      if (!element) throw fail(`no rendered element exists at child-index path ${JSON.stringify(normalized)}`);
      if (isDisabled(nodeAtPath(current.tree, normalized)) || element.disabled === true) return api.snapshot();
      lastError = null;
      element.click();
      if (lastError) throw lastError;
      return api.snapshot();
    },
    focusState() {
      return captureFocus(root, (element) => elementKeyByDOM.get(element));
    },
    restoreFocus(state) {
      return restoreLogicalFocus(state);
    },
    lastError() {
      return lastError;
    },
    unmount() {
      if (disposed) return;
      active = false;
      disposed = true;
      for (const element of [...listenerRecords.keys()]) removeListenersFor(element);
      pathElements.clear();
      domByPath.clear();
      domByKey.clear();
      elementByKey.clear();
      listenerRecords.clear();
      root.replaceChildren();
    },
  };

  try {
    paint(current);
  } catch (error) {
    for (const element of [...listenerRecords.keys()]) removeListenersFor(element);
    root.replaceChildren();
    throw fail("initial DOM mount failed", error);
  }
  return api;
}
