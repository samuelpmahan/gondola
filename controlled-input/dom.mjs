import {
  ELEMENT,
  FRAGMENT,
  TEXT,
  bindingAt,
  clone,
  isDisabled,
  literalHandlerAt,
  nodeAtPath,
  normalizePath,
  validateSnapshot,
} from "./protocol.mjs";

function fail(message, cause) {
  return new Error(`controlled input DOM: ${message}`, cause === undefined ? undefined : { cause });
}

const NO_HANDLER = Symbol("no declared event handler");

function listOrEmpty(value) {
  return value == null ? [] : value;
}

function childPath(parent, index) {
  return parent === "" ? String(index) : `${parent}/${index}`;
}

function indexTree(tree) {
  const result = new Map();
  function visit(node, path) {
    result.set(path, node);
    if (node.Kind === ELEMENT || node.Kind === FRAGMENT) {
      listOrEmpty(node.Kids).forEach((child, index) => visit(child, childPath(path, index)));
    }
  }
  visit(tree, "");
  return result;
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

/**
 * Mount the bounded Gobi editor view into a real DOM root.
 *
 * The renderer only transports browser events to the runtime. It does not
 * implement or infer application state transitions.
 */
export function mountEditorDOM(root, runtime) {
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
  let listenerRecords = new Map();
  let logicalPaths = new WeakMap();

  function removeListenersFor(element) {
    const records = listenerRecords.get(element);
    if (!records) return;
    for (const [eventName, record] of records) {
      element.removeEventListener(eventName, record.listener);
    }
    listenerRecords.delete(element);
  }

  function syncListeners(element, path, node, snapshot) {
    const desired = new Map();
    for (const handler of listOrEmpty(node.On)) desired.set(handler.Event, { kind: "literal" });
    for (const binding of snapshot.bindings) {
      if (binding.Path === path) desired.set(binding.Event, { kind: "binding" });
    }

    let records = listenerRecords.get(element);
    if (!records) {
      records = new Map();
      listenerRecords.set(element, records);
    }

    for (const [eventName, record] of records) {
      if (!desired.has(eventName) || record.path !== path) {
        element.removeEventListener(eventName, record.listener);
        records.delete(eventName);
      }
    }

    for (const [eventName] of desired) {
      if (records.has(eventName)) continue;
      const record = {
        path,
        listener: (event) => handleEvent(path, event),
      };
      records.set(eventName, record);
      element.addEventListener(eventName, record.listener);
    }
  }

  function patchAttributes(element, node) {
    const declared = listOrEmpty(node.Attrs);
    // React's controlled input wrapper emits ordinary attributes first, then
    // type, then the controlled value. Match that real DOM serialization so
    // raw innerHTML comparisons agree across the two renderers.
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

    for (const attr of attrs) {
      if (attr.Flag) {
        if (!element.hasAttribute(attr.Name)) element.setAttribute(attr.Name, "");
      } else if (element.getAttribute(attr.Name) !== attr.Value) {
        element.setAttribute(attr.Name, attr.Value);
      }
      if (attr.Name === "value" && "value" in element && element.value !== attr.Value) {
        // Avoid assigning an unchanged value: for focused inputs that preserves
        // the browser's caret and selection during ordinary typing.
        element.value = attr.Value;
      }
    }
  }

  function createOrPatch(entry, nextSnapshot, previousNodes, previousDOM, nextNodes, nextElements) {
    const { node, path } = entry;
    const oldNode = previousNodes.get(path);
    const oldDOM = previousDOM.get(path);
    const compatible = oldNode && sameRenderedKind(node, oldDOM) && oldNode.Kind === node.Kind &&
      (node.Kind !== ELEMENT || oldNode.Tag === node.Tag);
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

    nextNodes.set(path, domNode);
    logicalPaths.set(domNode, path);
    if (node.Kind === TEXT) {
      if (domNode.nodeValue !== node.Text) domNode.nodeValue = node.Text;
      return domNode;
    }

    nextElements.set(path, domNode);
    patchAttributes(domNode, node);
    syncListeners(domNode, path, node, nextSnapshot);
    reconcileChildren(domNode, node.Kids, path, nextSnapshot, previousNodes, previousDOM, nextNodes, nextElements);
    return domNode;
  }

  function reconcileChildren(container, kids, parentPath, nextSnapshot, previousNodes, previousDOM, nextNodes, nextElements) {
    const entries = flattenedChildren(kids, parentPath);
    reconcileEntries(container, entries, nextSnapshot, previousNodes, previousDOM, nextNodes, nextElements);
  }

  function reconcileEntries(container, entries, nextSnapshot, previousNodes, previousDOM, nextNodes, nextElements) {
    for (let index = 0; index < entries.length; index += 1) {
      const domNode = createOrPatch(entries[index], nextSnapshot, previousNodes, previousDOM, nextNodes, nextElements);
      const existing = container.childNodes[index] ?? null;
      if (existing !== domNode) container.insertBefore(domNode, existing);
    }
    while (container.childNodes.length > entries.length) {
      container.removeChild(container.childNodes[entries.length]);
    }
  }

  function paint(snapshot) {
    const previousNodes = indexTree(current.tree);
    const nextElements = new Map();
    const nextDOMByPath = new Map();
    const previousDOMByPath = domByPath;
    const previousListeners = listenerRecords;
    patching = true;
    try {
      const rootEntries = snapshot.tree.Kind === FRAGMENT
        ? flattenedChildren(snapshot.tree.Kids, "")
        : [{ node: snapshot.tree, path: "" }];
      reconcileEntries(root, rootEntries, snapshot, previousNodes, previousDOMByPath, nextDOMByPath, nextElements);
      for (const [element] of previousListeners) {
        if (!nextElementsHas(nextElements, element)) removeListenersFor(element);
      }
      current = snapshot;
      pathElements = nextElements;
      domByPath = nextDOMByPath;
      logicalPaths = new WeakMap();
      for (const [path, node] of domByPath) logicalPaths.set(node, path);
    } finally {
      patching = false;
    }
  }

  function nextElementsHas(elements, target) {
    for (const element of elements.values()) if (element === target) return true;
    return false;
  }

  function failClosed(error) {
    lastError = error instanceof Error ? error : fail(String(error));
    active = false;
  }

  function dispatchForEvent(path, event) {
    const binding = bindingAt(current, path, event.type);
    if (binding) {
      // This read is deliberately from currentTarget: event.target may be a
      // descendant and a stale closure must never supply an earlier value.
      const value = event.currentTarget.value;
      if (typeof value !== "string") throw fail("bound input currentTarget.value must be a string");
      return runtime.dispatch({ Path: path, Event: event.type, Value: value });
    }
    const handler = literalHandlerAt(current.tree, path, event.type);
    if (!handler) return NO_HANDLER;
    return runtime.dispatch({ Path: path, Event: event.type, Value: handler.Arg });
  }

  function handleEvent(path, event) {
    if (!active || patching || !event?.currentTarget || pathElements.get(path) !== event.currentTarget ||
        (typeof root.contains === "function" && !root.contains(event.currentTarget))) return;
    const currentNode = nodeAtPath(current.tree, path);
    if (isDisabled(currentNode) || event.currentTarget.disabled === true) return;
    try {
      const result = dispatchForEvent(path, event);
      if (result === NO_HANDLER) return;
      const next = clone(validateSnapshot(result));
      paint(next);
      lastError = null;
    } catch (error) {
      failClosed(error);
    }
  }

  function assertActive() {
    if (disposed) throw fail("renderer has been unmounted");
    if (!active) {
      if (lastError) throw fail("renderer is fenced after an error", lastError);
      throw fail("renderer is inactive");
    }
  }

  function serializeDOMNode(node) {
    if (node.nodeType === 3) {
      return { type: "text", path: logicalPaths.get(node) ?? null, text: node.nodeValue ?? "" };
    }
    if (node.nodeType !== 1) return { type: "other", nodeType: node.nodeType };
    return {
      type: "element",
      path: logicalPaths.get(node) ?? null,
      tag: node.localName,
      attributes: Array.from(node.attributes, ({ name, value }) => [name, value]),
      disabled: Boolean("disabled" in node && node.disabled),
      children: Array.from(node.childNodes, serializeDOMNode),
    };
  }

  function domSnapshot() {
    const disabled = [...pathElements]
      .filter(([, element]) => Boolean("disabled" in element && element.disabled))
      .map(([path]) => path);
    return {
      html: root.innerHTML,
      disabled,
      nodes: Array.from(root.childNodes, serializeDOMNode),
    };
  }

  const api = {
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
    lastError() {
      return lastError;
    },
    unmount() {
      if (disposed) return;
      active = false;
      disposed = true;
      for (const element of listenerRecords.keys()) removeListenersFor(element);
      pathElements.clear();
      domByPath.clear();
      listenerRecords.clear();
      root.replaceChildren();
    },
  };

  try {
    paint(current);
  } catch (error) {
    for (const element of listenerRecords.keys()) removeListenersFor(element);
    root.replaceChildren();
    throw fail("initial DOM mount failed", error);
  }
  return api;
}
