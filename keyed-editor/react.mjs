import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync, version as reactDOMVersion } from "react-dom";
import { captureFocus as captureLogicalFocus, restoreFocus as restoreLogicalFocus } from "./dom.mjs";
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
  throw new Error(`keyed React renderer: ${message}`);
}

function listOrEmpty(value, description) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`${description} must be an array or null`);
  return value;
}

function snapshotFrom(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("runtime must return a keyed snapshot object");
  }
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
  for (const attr of listOrEmpty(node.Attrs, "Node.Attrs")) {
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
      if (node.Tag !== "input") fail(`type is supported only on inputs at ${path || "<root>"}`);
      props.type = attr.Value;
    } else if (attr.Name === "value") {
      if (node.Tag !== "input") fail(`value is supported only on inputs at ${path || "<root>"}`);
      props.value = attr.Value;
    }
  }
  return props;
}

/** Mount a finite Go Node tree using Node.Key as React's reconciliation key. */
export function mountKeyedReact(root, runtime) {
  if (!root || root.nodeType !== 1 || !root.ownerDocument) {
    fail("root must be a DOM element with ownerDocument");
  }
  if (!runtime || typeof runtime.init !== "function" || typeof runtime.dispatch !== "function") {
    fail("runtime must expose init() and dispatch(step)");
  }
  if (React.version !== "19.3.1" || reactDOMVersion !== "19.3.1") {
    fail(`expected React and ReactDOM 19.3.1, got ${React.version} and ${reactDOMVersion}`);
  }

  let current = snapshotFrom(runtime.init());
  let active = true;
  let lastError = null;
  let rootMounted = false;
  let reactRoot = null;
  let initialRenderError = null;
  let pathsByKey = new Map();
  let elementOrder = [];
  const elementsByKey = new Map();
  const keysByElement = new WeakMap();
  const refCallbacks = new Map();

  function refFor(key) {
    let callback = refCallbacks.get(key);
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
      refCallbacks.set(key, callback);
    }
    return callback;
  }

  function buildReact(snapshot) {
    const nextPathsByKey = new Map();
    const nextElementOrder = [];

    function toReact(node, path) {
      if (!node || typeof node !== "object" || Array.isArray(node)) {
        fail(`invalid Node at ${path || "<root>"}`);
      }

      if (node.Kind === TEXT) {
        if (node.Tag || node.Key || node.Text == null || typeof node.Text !== "string") {
          fail(`text Node at ${path || "<root>"} must contain only string Text and an empty Key`);
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
          .map((kid, index) => toReact(kid, childPath(path, index)));
        return createElement(Fragment, { key: path || "keyed-root-fragment" }, ...children);
      }

      if (node.Kind !== ELEMENT) fail(`unsupported Node.Kind ${JSON.stringify(node.Kind)}`);
      if (typeof node.Key !== "string" || node.Key === "") {
        fail(`element Node at ${path || "<root>"} requires a non-empty Key`);
      }
      if (typeof node.Tag !== "string" || !ALLOWED_TAGS.has(node.Tag)) {
        fail(`unsupported HTML tag ${JSON.stringify(node.Tag)} at ${path || "<root>"}`);
      }
      assertNoText(node, path);

      const props = elementProps(node, path);
      for (const handler of listOrEmpty(node.On, "Node.On")) {
        if (!handler || handler.Event !== "click" || typeof handler.Message !== "string" ||
            handler.Message === "" || typeof handler.Arg !== "string") {
          fail(`Node.On at ${path || "<root>"} supports only click handlers with Message and string Arg`);
        }
      }
      const binding = bindingAt(snapshot, path, "input");
      const clickHandler = literalHandlerAt(snapshot.tree, path, "click");
      if (binding) {
        props.onInput = (event) => dispatchEvent(node.Key, event);
        // React requires onChange for controlled inputs, while the protocol's
        // declared and dispatched event remains the native input event.
        props.onChange = () => {};
      }
      if (clickHandler) props.onClick = (event) => dispatchEvent(node.Key, event);

      props.key = node.Key;
      props.ref = refFor(node.Key);
      nextPathsByKey.set(node.Key, path);
      nextElementOrder.push({ key: node.Key, path });
      const children = listOrEmpty(node.Kids, "Node.Kids")
        .map((kid, index) => toReact(kid, childPath(path, index)));
      return createElement(node.Tag, props, ...children);
    }

    const element = toReact(snapshot.tree, "");
    return { element, pathsByKey: nextPathsByKey, elementOrder: nextElementOrder };
  }

  function captureFocus() {
    return captureLogicalFocus(root, (element) => {
      const key = keysByElement.get(element);
      return key != null && elementsByKey.get(key) === element ? key : null;
    });
  }

  function restoreFocus(state) {
    return restoreLogicalFocus(
      root,
      state,
      (key) => elementsByKey.get(key) ?? null,
      (key) => {
        const path = pathsByKey.get(key);
        if (path == null) return false;
        const node = nodeAtPath(current.tree, path);
        const element = elementsByKey.get(key);
        return node.Tag === "input" && !isDisabled(node) && element?.disabled !== true;
      },
    );
  }

  function reportReactError(error) {
    lastError = error;
    active = false;
    try {
      if (typeof runtime.rendererFailed === "function") runtime.rendererFailed(error);
    } catch (reportError) {
      lastError = reportError;
    }
  }

  function handleReactError(error) {
    if (!rootMounted) {
      initialRenderError ??= error;
      return;
    }
    reportReactError(error);
  }

  function update(snapshot, focus = captureFocus()) {
    if (!active) fail("cannot update after unmount or renderer failure");
    lastError = null;
    let next;
    let built;
    try {
      next = snapshotFrom(snapshot);
      built = buildReact(next);
    } catch (error) {
      lastError = error;
      active = false;
      throw error;
    }

    const previous = { snapshot: current, pathsByKey, elementOrder };
    current = next;
    pathsByKey = built.pathsByKey;
    elementOrder = built.elementOrder;
    try {
      flushSync(() => reactRoot.render(built.element));
      if (active) restoreFocus(focus);
    } catch (error) {
      current = previous.snapshot;
      pathsByKey = previous.pathsByKey;
      elementOrder = previous.elementOrder;
      lastError = error;
      active = false;
      throw error;
    }
    return clone(current);
  }

  function dispatchEvent(key, event) {
    if (!active || elementsByKey.get(key) !== event.currentTarget || !root.contains(event.currentTarget)) return;
    const path = pathsByKey.get(key);
    if (path == null) return;
    const target = nodeAtPath(current.tree, path);
    if (isDisabled(target) || event.currentTarget.disabled === true) return;

    const binding = bindingAt(current, path, event.type);
    const handler = literalHandlerAt(current.tree, path, event.type);
    if (!binding && !handler) return;
    const focus = captureFocus();
    const step = {
      Path: path,
      Event: event.type,
      Value: binding ? event.currentTarget.value : (handler.Arg ?? ""),
      Key: key,
    };
    lastError = null;
    try {
      update(runtime.dispatch(step), focus);
    } catch (error) {
      reportReactError(error);
    }
  }

  // Validate the full tree and build the initial element before createRoot
  // takes ownership of a reusable container.
  const initial = buildReact(current);
  pathsByKey = initial.pathsByKey;
  elementOrder = initial.elementOrder;
  reactRoot = createRoot(root, {
    onUncaughtError: handleReactError,
    onRecoverableError: handleReactError,
  });
  try {
    flushSync(() => reactRoot.render(initial.element));
    if (initialRenderError) throw initialRenderError;
    rootMounted = true;
  } catch (error) {
    active = false;
    try { flushSync(() => reactRoot.unmount()); } catch { /* preserve initial render error */ }
    throw error;
  }

  function domSnapshot() {
    const disabled = elementOrder.filter(({ key }) => {
      const element = elementsByKey.get(key);
      return Boolean(element && "disabled" in element && element.disabled);
    }).map(({ path }) => path);
    return { html: root.innerHTML, disabled };
  }

  const api = {
    update,
    snapshot() {
      return clone(current);
    },
    domSnapshot,
    focusState: captureFocus,
    restoreFocus,
    click(path) {
      if (!active) fail("cannot click after unmount or renderer failure");
      const normalized = normalizePath(path);
      nodeAtPath(current.tree, normalized);
      const key = [...pathsByKey].find(([, currentPath]) => currentPath === normalized)?.[0];
      const element = key == null ? null : elementsByKey.get(key);
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
      elementsByKey.clear();
      pathsByKey.clear();
      elementOrder = [];
      lastError = null;
      flushSync(() => reactRoot.unmount());
    },
    get lastError() {
      return lastError;
    },
  };
  return api;
}
