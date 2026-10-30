// Small DOM renderer for the counter experiment. It intentionally supports a
// narrow, data-only part of gobi.Node: HTML elements, text, fragments,
// attributes/flags/styles and declared DOM event handlers. It replaces the
// rendered tree after each message; keyed reconciliation and effects are not
// implemented here.

const ELEMENT = 1;
const TEXT = 2;
const FRAGMENT = 3;
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr",
]);

function fail(message) {
  throw new Error(`gobi DOM renderer: ${message}`);
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = clone(item);
    return result;
  }
  return value;
}

function listOrEmpty(value, description) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`${description} must be an array or null`);
  return value;
}

function assertSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("runtime must return a snapshot object");
  }
  if (value.error) fail(`runtime error: ${value.error}`);
  assertNoEffects(value);
  if (!Object.hasOwn(value, "tree")) fail("runtime snapshot is missing tree");
  return value;
}

function normalizePath(path) {
  if (Array.isArray(path)) {
    if (path.some((part) => !Number.isInteger(part) || part < 0)) {
      fail("click path must contain non-negative child indexes");
    }
    return path.join("/");
  }
  if (typeof path !== "string" || (path !== "" && !/^(?:0|[1-9]\d*)(?:\/(?:0|[1-9]\d*))*$/.test(path))) {
    fail("click path must be slash-separated child indexes, such as '1' or '0/1'");
  }
  return path;
}

function atPath(tree, path) {
  let node = tree;
  if (path === "") return node;
  for (const part of path.split("/").map(Number)) {
    const kids = listOrEmpty(node?.Kids, "Node.Kids");
    if (!kids[part]) return null;
    node = kids[part];
  }
  return node;
}

function assertNoEffects(snapshot) {
  if (snapshot.effects == null) return;
  if (!Array.isArray(snapshot.effects)) fail("runtime effects must be an array when present");
  if (snapshot.effects.length > 0) fail("Go effects are unsupported by this DOM renderer");
}

function applyAttribute(element, attr) {
  if (!attr || typeof attr !== "object" || typeof attr.Name !== "string" || attr.Name === "") {
    fail("each Node.Attrs entry must have a non-empty Name");
  }
  const name = attr.Name;
  if (!/^[A-Za-z_:][A-Za-z0-9_.:-]*$/.test(name)) fail(`unsupported attribute name ${JSON.stringify(name)}`);
  if (/^on/i.test(name)) fail(`inline event attribute ${JSON.stringify(name)} is unsupported; use Node.On`);

  const styles = listOrEmpty(attr.Style, "Attr.Style");
  if (styles.length > 0) {
    if (name.toLowerCase() !== "style" || attr.Value) {
      fail("structured styles are supported only on a style attribute with no text Value");
    }
    for (const style of styles) {
      if (!style || typeof style.Property !== "string" || style.Property === "" || typeof style.Value !== "string") {
        fail("each Attr.Style entry must have string Property and Value fields");
      }
      element.style.setProperty(style.Property, style.Value);
    }
    return;
  }

  if (attr.Flag === true) {
    element.setAttribute(name, "");
    return;
  }
  if (attr.Flag != null && typeof attr.Flag !== "boolean") fail("Attr.Flag must be a boolean");
  if (typeof attr.Value !== "string") fail(`attribute ${JSON.stringify(name)} must have a string Value`);
  element.setAttribute(name, attr.Value);
}

function validateEffects(snapshot) {
  assertNoEffects(snapshot);
  return snapshot;
}

/**
 * Mount a gobi.Node tree into a DOM container.
 *
 * The runtime must expose synchronous init() and dispatch({Path, Event, Value})
 * functions. init() is called by mountGobi. Child-index paths start at the
 * returned tree root's Kids, so the counter buttons are "1" and "2".
 */
export function mountGobi(root, runtime) {
  if (!root || typeof root.replaceChildren !== "function" || !root.ownerDocument) {
    fail("root must be a DOM element with ownerDocument and replaceChildren()");
  }
  if (!runtime || typeof runtime.init !== "function" || typeof runtime.dispatch !== "function") {
    fail("runtime must expose init() and dispatch(input)");
  }

  const document = root.ownerDocument;
  let current = validateEffects(assertSnapshot(runtime.init()));
  let pathElements = new Map();
  let logicalPaths = new WeakMap();
  let active = true;
  let lastError = null;
  const subscribers = new Set();

  function currentNode(path, eventType) {
    const node = atPath(current.tree, path);
    if (!node) return null;
    const handlers = listOrEmpty(node.On, "Node.On");
    return handlers.find((handler) => handler && handler.Event === eventType) ?? null;
  }

  function renderNode(node, path, nextElements, nextLogicalPaths) {
    if (!node || typeof node !== "object") fail(`invalid Node at ${path || "<root>"}`);
    switch (node.Kind) {
      case TEXT:
        if (node.Tag || node.Key || listOrEmpty(node.Attrs, "Node.Attrs").length > 0 ||
            listOrEmpty(node.On, "Node.On").length > 0 || listOrEmpty(node.Kids, "Node.Kids").length > 0) {
          fail(`text Node at ${path || "<root>"} cannot also have a tag, key, attributes, handlers or children`);
        }
        if (typeof node.Text !== "string") fail(`Text node at ${path || "<root>"} must have string Text`);
        const textNode = document.createTextNode(node.Text);
        nextLogicalPaths.set(textNode, path);
        return textNode;
      case FRAGMENT: {
        if (node.Tag || node.Key || node.Text || listOrEmpty(node.Attrs, "Node.Attrs").length > 0 ||
            listOrEmpty(node.On, "Node.On").length > 0) {
          fail(`fragment Node at ${path || "<root>"} can only contain children`);
        }
        const fragment = document.createDocumentFragment();
        const kids = listOrEmpty(node.Kids, "Node.Kids");
        kids.forEach((kid, index) => fragment.appendChild(renderNode(kid, childPath(path, index), nextElements, nextLogicalPaths)));
        return fragment;
      }
      case ELEMENT: {
        if (typeof node.Tag !== "string" || !/^[A-Za-z][A-Za-z0-9-]*$/.test(node.Tag)) {
          fail(`unsupported HTML tag ${JSON.stringify(node.Tag)}`);
        }
        if (node.Key) fail("keyed reconciliation is unsupported");
        if (node.Text) fail(`element Node at ${path || "<root>"} cannot also contain Text`);
        const kids = listOrEmpty(node.Kids, "Node.Kids");
        const tag = node.Tag.toLowerCase();
        if (VOID_TAGS.has(tag) && kids.length > 0) fail(`void HTML element <${tag}> cannot have children`);

        const element = document.createElement(tag);
        nextElements.set(path, element);
        nextLogicalPaths.set(element, path);
        const attrs = listOrEmpty(node.Attrs, "Node.Attrs");
        for (const attr of attrs) applyAttribute(element, attr);

        const handlers = listOrEmpty(node.On, "Node.On");
        const seenEvents = new Set();
        for (const handler of handlers) {
          if (!handler || typeof handler.Event !== "string" || handler.Event === "" ||
              typeof handler.Message !== "string" || typeof handler.Arg !== "string") {
            fail(`Node.On at ${path || "<root>"} must contain string Event, Message and Arg fields`);
          }
          if (seenEvents.has(handler.Event)) {
            fail(`duplicate Node.On event ${JSON.stringify(handler.Event)} at ${path || "<root>"}`);
          }
          seenEvents.add(handler.Event);
          const eventPath = path;
          element.addEventListener(handler.Event, (event) => {
            if (!active || pathElements.get(eventPath) !== event.currentTarget) return;
            const currentHandler = currentNode(eventPath, event.type);
            if (!currentHandler) return;
            try {
              const next = validateEffects(assertSnapshot(runtime.dispatch({
                Path: eventPath,
                Event: event.type,
                Value: currentHandler.Arg ?? "",
              })));
              current = next;
              redraw();
            } catch (error) {
              lastError = error;
              throw error;
            }
          });
        }

        kids.forEach((kid, index) => element.appendChild(renderNode(kid, childPath(path, index), nextElements, nextLogicalPaths)));
        return element;
      }
      default:
        fail(`unsupported Node.Kind ${JSON.stringify(node.Kind)}`);
    }
  }

  function childPath(parent, index) {
    return parent === "" ? String(index) : `${parent}/${index}`;
  }

  function redraw() {
    if (!active) return;
    const nextElements = new Map();
    const nextLogicalPaths = new WeakMap();
    const rendered = renderNode(current.tree, "", nextElements, nextLogicalPaths);
    root.replaceChildren(rendered);
    pathElements = nextElements;
    logicalPaths = nextLogicalPaths;
    for (const listener of subscribers) listener(api.snapshot());
  }

  function serializeDOMNode(node, logicalPaths) {
    if (node.nodeType === 3) {
      return { type: "text", path: logicalPaths.get(node) ?? null, text: node.nodeValue ?? "" };
    }
    if (node.nodeType !== 1) return { type: "other", nodeType: node.nodeType };
    const attributes = Array.from(node.attributes, ({ name, value }) => [name, value]);
    return {
      type: "element",
      path: logicalPaths.get(node) ?? null,
      tag: node.localName,
      attributes,
      disabled: Boolean("disabled" in node && node.disabled),
      children: Array.from(node.childNodes, (child) => serializeDOMNode(child, logicalPaths)),
    };
  }

  function domSnapshot() {
    const disabled = [...pathElements]
      .filter(([, element]) => Boolean("disabled" in element && element.disabled))
      .map(([path]) => path);
    return {
      html: root.innerHTML,
      nodes: Array.from(root.childNodes, (node) => serializeDOMNode(node, logicalPaths)),
      disabled,
    };
  }

  const api = {
    snapshot() {
      return clone(current);
    },
    domSnapshot,
    click(path) {
      const normalized = normalizePath(path);
      const element = pathElements.get(normalized);
      if (!element) fail(`no rendered element exists at child-index path ${JSON.stringify(normalized)}`);
      lastError = null;
      element.click();
      if (lastError) {
        const error = lastError;
        lastError = null;
        throw error;
      }
      return api.snapshot();
    },
    subscribe(listener) {
      if (typeof listener !== "function") fail("subscribe() requires a function");
      subscribers.add(listener);
      listener(api.snapshot());
      return () => subscribers.delete(listener);
    },
    unmount() {
      if (!active) return;
      active = false;
      pathElements.clear();
      subscribers.clear();
      root.replaceChildren();
    },
  };

  // Initial render is complete before the mount API is returned.
  redraw();
  return api;
}
