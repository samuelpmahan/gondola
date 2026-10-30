import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync, version as reactDOMVersion } from "react-dom";
import {
  bindingAt,
  clone,
  isDisabled,
  literalHandlerAt,
  nodeAtPath,
  normalizePath,
  validateSnapshot,
} from "./protocol.mjs";

const { Fragment, createElement } = React;
const ELEMENT = 1;
const TEXT = 2;
const FRAGMENT = 3;
const ALLOWED_TAGS = new Set(["button", "div", "input", "p"]);
const ALLOWED_ATTRIBUTES = new Set(["aria-label", "class", "disabled", "type", "value"]);

function fail(message) {
  throw new Error(`gobi React editor: ${message}`);
}

function listOrEmpty(value, description) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`${description} must be an array or null`);
  return value;
}

function snapshotFrom(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("runtime must return an editor snapshot object");
  }
  if (value.error) fail(`runtime error: ${String(value.error)}`);
  // Validate before cloning so cycles, non-plain objects and non-JSON values
  // fail with a bounded protocol error instead of escaping the validator.
  validateSnapshot(value);
  return clone(value);
}

function childPath(parent, index) {
  return parent === "" ? String(index) : `${parent}/${index}`;
}

function assertNoText(node, path) {
  if (node.Text != null && node.Text !== "") {
    fail(`element Node at ${path || "<root>"} cannot also contain Text`);
  }
}

function elementProps(node, path) {
  const props = {};
  const attrs = listOrEmpty(node.Attrs, "Node.Attrs");
  for (const attr of attrs) {
    if (!attr || typeof attr !== "object" || !ALLOWED_ATTRIBUTES.has(attr.Name)) {
      fail(`attribute ${JSON.stringify(attr?.Name)} is unsupported at ${path || "<root>"}`);
    }
    if (listOrEmpty(attr.Style, "Attr.Style").length > 0) {
      fail(`styles are unsupported at ${path || "<root>"}`);
    }
    if (attr.Name === "disabled") {
      if ((node.Tag !== "button" && node.Tag !== "input") || attr.Flag !== true || attr.Value !== "") {
        fail(`disabled is supported only as a true button or input flag at ${path || "<root>"}`);
      }
      props.disabled = isDisabled(node);
      continue;
    }
    if (typeof attr.Value !== "string" || attr.Flag !== false) {
      fail(`attribute ${JSON.stringify(attr.Name)} requires a string Value at ${path || "<root>"}`);
    }
    if (attr.Name === "class") props.className = attr.Value;
    else if (attr.Name === "aria-label") props["aria-label"] = attr.Value;
    else if (attr.Name === "type") {
      if (node.Tag !== "input") fail(`type is supported only on the editor input at ${path || "<root>"}`);
      props.type = attr.Value;
    } else if (attr.Name === "value") {
      if (node.Tag !== "input") fail(`value is supported only on the editor input at ${path || "<root>"}`);
      props.value = attr.Value;
    }
  }
  return props;
}

/**
 * Mount an editor snapshot from the synchronous Go runtime in a React 19 root.
 * Go owns every editor transition. The declared target.value binding is the
 * only source of input text sent back to Go.
 */
export function mountEditorReact(root, runtime) {
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
  let rootMounted = false;
  let reactRoot = null;
  let pathElements = new Map();
  let elementPaths = [];
  const refCallbacks = new Map();

  function refFor(path) {
    let callback = refCallbacks.get(path);
    if (!callback) {
      callback = (element) => {
        if (element) pathElements.set(path, element);
        else pathElements.delete(path);
      };
      refCallbacks.set(path, callback);
    }
    return callback;
  }

  function toReact(snapshot, node, path, nextPaths) {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      fail(`invalid Node at ${path || "<root>"}`);
    }

    if (node.Kind === TEXT) {
      if (node.Tag || node.Key || node.Text == null || typeof node.Text !== "string") {
        fail(`text Node at ${path || "<root>"} must contain only string Text`);
      }
      if (listOrEmpty(node.Attrs, "Node.Attrs").length ||
          listOrEmpty(node.On, "Node.On").length ||
          listOrEmpty(node.Kids, "Node.Kids").length) {
        fail(`text Node at ${path || "<root>"} cannot also have attributes, handlers or children`);
      }
      return node.Text;
    }

    if (node.Kind === FRAGMENT) {
      if (node.Tag || node.Key || node.Text) {
        fail(`fragment Node at ${path || "<root>"} can only contain children`);
      }
      if (listOrEmpty(node.Attrs, "Node.Attrs").length || listOrEmpty(node.On, "Node.On").length) {
        fail(`fragment Node at ${path || "<root>"} cannot have attributes or handlers`);
      }
      const children = listOrEmpty(node.Kids, "Node.Kids")
        .map((kid, index) => toReact(snapshot, kid, childPath(path, index), nextPaths));
      return createElement(Fragment, { key: path || "editor-root-fragment" }, ...children);
    }

    if (node.Kind !== ELEMENT) fail(`unsupported Node.Kind ${JSON.stringify(node.Kind)}`);
    if (node.Key) fail(`Node.Key is unsupported at ${path || "<root>"}`);
    if (typeof node.Tag !== "string" || !ALLOWED_TAGS.has(node.Tag)) {
      fail(`unsupported HTML tag ${JSON.stringify(node.Tag)} at ${path || "<root>"}`);
    }
    assertNoText(node, path);

    const props = elementProps(node, path);
    const handlers = listOrEmpty(node.On, "Node.On");
    for (const handler of handlers) {
      if (!handler || handler.Event !== "click" || typeof handler.Message !== "string" ||
          handler.Message === "" || typeof handler.Arg !== "string") {
        fail(`Node.On at ${path || "<root>"} supports only click handlers with a Message and string Arg`);
      }
    }
    const inputBinding = bindingAt(snapshot, path, "input");
    const clickHandler = literalHandlerAt(snapshot.tree, path, "click");

    if (inputBinding) {
      props.onInput = (event) => dispatchInput(path, event);
      // React warns for a controlled value without onChange. The actual edit
      // path is onInput so each native input event can be sent synchronously.
      props.onChange = () => {};
    }
    if (clickHandler) props.onClick = (event) => dispatchClick(path, event);

    props.key = path || "editor-root-element";
    props.ref = refFor(path);
    nextPaths.push(path);
    const children = listOrEmpty(node.Kids, "Node.Kids")
      .map((kid, index) => toReact(snapshot, kid, childPath(path, index), nextPaths));
    return createElement(node.Tag, props, ...children);
  }

  function dispatchSnapshot(step) {
    lastError = null;
    try {
      const next = snapshotFrom(runtime.dispatch(step));
      const nextPaths = [];
      const nextElement = toReact(next, next.tree, "", nextPaths);
      const previous = current;
      current = next;
      try {
        flushSync(() => reactRoot.render(nextElement));
        elementPaths = nextPaths;
      } catch (error) {
        current = previous;
        throw error;
      }
    } catch (error) {
      // A dispatch can already have changed Go state. Keep this renderer on its
      // last valid snapshot and stop callbacks; a host replacement can mount a
      // fresh renderer from the accepted Go snapshot.
      lastError = error;
      active = false;
    }
  }

  function dispatchInput(path, event) {
    if (!active || pathElements.get(path) !== event.currentTarget ||
        isDisabled(nodeAtPath(current.tree, path)) || event.currentTarget.disabled === true) return;
    const binding = bindingAt(current, path, event.type);
    if (!binding) return;
    dispatchSnapshot({
      Path: path,
      Event: event.type,
      Value: event.currentTarget.value,
    });
  }

  function dispatchClick(path, event) {
    if (!active || pathElements.get(path) !== event.currentTarget ||
        isDisabled(nodeAtPath(current.tree, path)) || event.currentTarget.disabled === true) return;
    const handler = literalHandlerAt(current.tree, path, event.type);
    if (!handler) return;
    dispatchSnapshot({
      Path: path,
      Event: event.type,
      // On.Arg remains literal. Input values use the separate binding path.
      Value: handler.Arg ?? "",
    });
  }

  // Validate and build the complete initial React tree before createRoot can
  // attach React internals or clear anything in a root that the caller reuses.
  const initialPaths = [];
  const initialElement = toReact(current, current.tree, "", initialPaths);
  reactRoot = createRoot(root);
  try {
    flushSync(() => reactRoot.render(initialElement));
    elementPaths = initialPaths;
    rootMounted = true;
  } catch (error) {
    active = false;
    try {
      flushSync(() => reactRoot.unmount());
    } catch {
      // Keep the original render error.
    }
    throw error;
  }

  function domSnapshot() {
    const disabled = elementPaths.filter((path) => {
      const element = pathElements.get(path);
      return Boolean(element && "disabled" in element && element.disabled);
    });
    return { html: root.innerHTML, disabled };
  }

  const api = {
    snapshot() {
      return clone(current);
    },
    domSnapshot,
    click(path) {
      if (!active) fail("cannot click after unmount or renderer failure");
      const normalized = normalizePath(path);
      nodeAtPath(current.tree, normalized);
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
    unmount() {
      if (!rootMounted) return;
      active = false;
      rootMounted = false;
      pathElements.clear();
      elementPaths = [];
      lastError = null;
      flushSync(() => reactRoot.unmount());
    },
    get lastError() {
      return lastError;
    },
  };

  return api;
}
