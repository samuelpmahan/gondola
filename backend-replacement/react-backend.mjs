import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync, version as reactDOMVersion } from "react-dom";

const { Fragment, createElement } = React;
const ELEMENT = 1;
const TEXT = 2;
const FRAGMENT = 3;
const ALLOWED_TAGS = new Set(["button", "div", "p"]);

function fail(message) {
  throw new Error(`gobi React backend: ${message}`);
}

function copyData(value, seen = new Map()) {
  if (value === null || value === undefined || typeof value === "string" ||
      typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value !== "object") fail("runtime snapshots must contain only JSON data");
  if (seen.has(value)) fail("runtime snapshot cannot contain cycles");

  if (Array.isArray(value)) {
    seen.set(value, true);
    const copy = value.map((item) => copyData(item, seen));
    seen.delete(value);
    return copy;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("runtime snapshots must contain plain objects");
  }
  seen.set(value, true);
  const copy = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, copyData(item, seen)]),
  );
  seen.delete(value);
  return copy;
}

function listOrEmpty(value, description) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`${description} must be an array or null`);
  return value;
}

function snapshotFrom(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("runtime must return a snapshot object");
  }
  if (value.error) fail(`runtime error: ${String(value.error)}`);
  if (value.effects != null) {
    if (!Array.isArray(value.effects)) fail("runtime effects must be an array when present");
    if (value.effects.length > 0) fail("Go effects are unsupported by this React backend");
  }
  if (!Object.hasOwn(value, "tree")) fail("runtime snapshot is missing tree");
  return copyData(value);
}

function normalizePath(path) {
  if (Array.isArray(path)) {
    if (path.some((part) => !Number.isInteger(part) || part < 0)) {
      fail("click path must contain non-negative child indexes");
    }
    return path.join("/");
  }
  if (typeof path !== "string" ||
      (path !== "" && !/^(?:0|[1-9]\d*)(?:\/(?:0|[1-9]\d*))*$/.test(path))) {
    fail("click path must be slash-separated child indexes, such as '1' or '0/1'");
  }
  return path;
}

function childPath(parent, index) {
  return parent === "" ? String(index) : `${parent}/${index}`;
}

function nodeAtPath(tree, path) {
  let node = tree;
  if (path === "") return node;
  for (const part of path.split("/").map(Number)) {
    const kids = listOrEmpty(node?.Kids, "Node.Kids");
    if (!kids[part]) return null;
    node = kids[part];
  }
  return node;
}

function handlerAt(tree, path) {
  const node = nodeAtPath(tree, path);
  if (!node) return null;
  return listOrEmpty(node.On, "Node.On").find((handler) => handler.Event === "click") ?? null;
}

function assertEmpty(value, description) {
  if (value != null && (!Array.isArray(value) || value.length > 0)) {
    fail(`${description} is unsupported by this React backend`);
  }
}

function assertUnkeyed(node, path) {
  if (node.Key != null && node.Key !== "") {
    fail(`Node.Key is unsupported at ${path || "<root>"}`);
  }
}

function assertNoText(node, path) {
  if (node.Text != null && node.Text !== "") {
    fail(`element Node at ${path || "<root>"} cannot also contain Text`);
  }
}

function elementProps(node, path) {
  const props = {};
  const seenAttributes = new Set();
  const attrs = listOrEmpty(node.Attrs, "Node.Attrs");
  for (const attr of attrs) {
    if (!attr || typeof attr !== "object" || typeof attr.Name !== "string" || attr.Name === "") {
      fail(`each Node.Attrs entry at ${path || "<root>"} must have a non-empty Name`);
    }
    if (seenAttributes.has(attr.Name)) {
      fail(`duplicate Node.Attrs name ${JSON.stringify(attr.Name)} at ${path || "<root>"}`);
    }
    seenAttributes.add(attr.Name);
    assertEmpty(attr.Style, `Attr.Style for ${JSON.stringify(attr.Name)}`);

    if (attr.Name === "class") {
      if (attr.Flag === true) fail("class attributes cannot use Flag");
      if (attr.Value != null && typeof attr.Value !== "string") {
        fail("class Attr.Value must be a string");
      }
      props.className = attr.Value ?? "";
    } else if (attr.Name === "disabled") {
      if (attr.Flag !== true || (attr.Value != null && attr.Value !== "")) {
        fail("disabled is supported only as a true Flag attribute");
      }
      props.disabled = true;
    } else {
      fail(`attribute ${JSON.stringify(attr.Name)} is unsupported by this React backend`);
    }
  }

  const handlers = listOrEmpty(node.On, "Node.On");
  const seenEvents = new Set();
  for (const handler of handlers) {
    if (!handler || typeof handler !== "object" || handler.Event !== "click" ||
        typeof handler.Message !== "string" || handler.Message === "" ||
        (handler.Arg != null && typeof handler.Arg !== "string")) {
      fail(`Node.On at ${path || "<root>"} supports only click handlers with a Message and string Arg`);
    }
    if (seenEvents.has(handler.Event)) {
      fail(`duplicate Node.On event ${JSON.stringify(handler.Event)} at ${path || "<root>"}`);
    }
    seenEvents.add(handler.Event);
  }
  return { props, handlers };
}

/**
 * Mount a Gobi tree returned by a synchronous runtime into a React 19 root.
 * The runtime owns state: every declared click dispatches to Go and React only
 * renders the snapshot returned by that dispatch.
 */
export function mountGobiReact(root, runtime) {
  if (!root || root.nodeType !== 1 || !root.ownerDocument) {
    fail("root must be a DOM element with ownerDocument");
  }
  if (!runtime || typeof runtime.init !== "function" || typeof runtime.dispatch !== "function") {
    fail("runtime must expose init() and dispatch(input)");
  }
  if (React.version !== "19.3.1" || reactDOMVersion !== "19.3.1") {
    fail(`expected React and ReactDOM 19.3.1, got ${React.version} and ${reactDOMVersion}`);
  }

  let current = snapshotFrom(runtime.init());
  let active = true;
  let lastError = null;
  let rootMounted = true;
  let pathElements = new Map();
  let elementPaths = [];
  let reactRoot;

  function dispatchClick(path, event) {
    if (!active || pathElements.get(path) !== event.currentTarget) return;
    const handler = handlerAt(current.tree, path);
    if (!handler) return;

    lastError = null;
    try {
      const next = snapshotFrom(runtime.dispatch({
        Path: path,
        Event: "click",
        Value: handler.Arg ?? "",
      }));
      const nextPaths = [];
      const nextElement = toReact(next.tree, "", nextPaths);
      const previous = current;
      current = next;
      try {
        flushSync(() => reactRoot.render(nextElement));
        elementPaths = nextPaths;
      } catch (error) {
        current = previous;
        lastError = error;
        active = false;
      }
    } catch (error) {
      lastError = error;
      active = false;
    }
  }

  function toReact(node, path, nextPaths) {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      fail(`invalid Node at ${path || "<root>"}`);
    }
    assertUnkeyed(node, path);

    if (node.Kind === TEXT) {
      if (node.Tag || node.Key || node.Text == null || typeof node.Text !== "string") {
        fail(`text Node at ${path || "<root>"} must contain only string Text`);
      }
      assertEmpty(node.Attrs, "Text Node.Attrs");
      assertEmpty(node.On, "Text Node.On");
      assertEmpty(node.Kids, "Text Node.Kids");
      return node.Text;
    }

    if (node.Kind === FRAGMENT) {
      if (node.Tag || node.Text) fail(`fragment Node at ${path || "<root>"} can only contain children`);
      assertEmpty(node.Attrs, "Fragment Node.Attrs");
      assertEmpty(node.On, "Fragment Node.On");
      const kids = listOrEmpty(node.Kids, "Node.Kids");
      const children = kids.map((kid, index) => toReact(kid, childPath(path, index), nextPaths));
      return createElement(Fragment, { key: path || "gobi-root-fragment" }, ...children);
    }

    if (node.Kind !== ELEMENT) fail(`unsupported Node.Kind ${JSON.stringify(node.Kind)}`);
    if (typeof node.Tag !== "string" || !ALLOWED_TAGS.has(node.Tag)) {
      fail(`unsupported HTML tag ${JSON.stringify(node.Tag)}`);
    }
    assertNoText(node, path);
    const kids = listOrEmpty(node.Kids, "Node.Kids");
    const { props, handlers } = elementProps(node, path);
    if (handlers.length > 0) {
      props.onClick = (event) => dispatchClick(path, event);
    }
    props.key = path || "gobi-root-element";
    props.ref = (element) => {
      if (element) {
        pathElements.set(path, element);
      } else {
        pathElements.delete(path);
      }
    };
    nextPaths.push(path);
    const children = kids.map((kid, index) => toReact(kid, childPath(path, index), nextPaths));
    return createElement(node.Tag, props, ...children);
  }

  function clearElementIndex() {
    pathElements = new Map();
    elementPaths = [];
  }

  // Validate and build the full React element tree before touching the DOM.
  const initialPaths = [];
  const initialElement = toReact(current.tree, "", initialPaths);
  reactRoot = createRoot(root);
  flushSync(() => reactRoot.render(initialElement));
  elementPaths = initialPaths;

  function domSnapshot() {
    const disabled = elementPaths.filter((path) => {
      const element = pathElements.get(path);
      return Boolean(element && "disabled" in element && element.disabled);
    });
    return { html: root.innerHTML, disabled };
  }

  const api = {
    snapshot() {
      return copyData(current);
    },
    domSnapshot,
    click(path) {
      if (!active) fail("cannot click after unmount or renderer failure");
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
    backendName() {
      return "react";
    },
    unmount() {
      if (!active && !rootMounted) return;
      active = false;
      clearElementIndex();
      lastError = null;
      if (!rootMounted) return;
      rootMounted = false;
      flushSync(() => reactRoot.unmount());
    },
    get lastError() {
      return lastError;
    },
  };

  return api;
}
