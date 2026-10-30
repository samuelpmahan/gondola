// Independently rendered React reference for the keyed collection model.
// React receives only this module's own model snapshots; candidate renderers
// and Go snapshots are never used as the reference source.

import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync, version as reactDOMVersion } from "react-dom";
import { createCollectionReference, MAX_COLLECTION_ID, MAX_ROWS } from "./model.mjs";

const h = React.createElement;
export {
  createCollectionReference,
  createCollectionReference as createCollectionReferenceRuntime,
  MAX_COLLECTION_ID,
  MAX_ROWS,
};
export const referenceReactVersion = React.version;
export const referenceReactDOMVersion = reactDOMVersion;

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const copied = {};
    for (const [key, item] of Object.entries(value)) copied[key] = clone(item);
    return copied;
  }
  return value;
}

function childAtPath(container, path) {
  const indexes = Array.isArray(path)
    ? path
    : (path === "" ? [] : path.split("/").map(Number));
  let current = container.firstElementChild;
  if (!current) throw new Error("collection reference root is not mounted");
  for (const index of indexes) {
    if (!Number.isInteger(index) || index < 0 || index >= current.childNodes.length) {
      throw new Error(`invalid child path ${String(path)}`);
    }
    current = current.childNodes[index];
  }
  return current;
}

function pathFromRoot(element, root) {
  const indexes = [];
  let current = element;
  while (current && current !== root) {
    const parent = current.parentNode;
    if (!parent) return null;
    indexes.push(Array.prototype.indexOf.call(parent.childNodes, current));
    current = parent;
  }
  return current === root ? indexes.reverse().join("/") : null;
}

function nodeAtPath(root, path) {
  let node = root;
  if (path === "") return node;
  for (const part of path.split("/")) {
    const index = Number(part);
    if (!Array.isArray(node.Kids) || !Number.isInteger(index) || index < 0 || index >= node.Kids.length) {
      throw new Error(`invalid child path ${JSON.stringify(path)}`);
    }
    node = node.Kids[index];
  }
  return node;
}

function disabledPaths(top) {
  return Array.from(top.querySelectorAll("button, input"))
    .filter((element) => element.disabled)
    .map((element) => pathFromRoot(element, top));
}

function rowButton(row, index, action, onClick) {
  const childIndex = { save: 5, remove: 6, up: 7, cancel: 8 }[action];
  const disabled = action === "save" ? row.Draft === ""
    : action === "up" ? index === 0
      : action === "cancel" ? row.PendingID === 0
        : false;
  return h("button", {
    key: `row-${row.ID}-${action}`,
    className: action,
    disabled,
    onClick: () => onClick({
      Path: `2/${index}/${childIndex}`,
      Event: "click",
      Value: "",
      Key: `row-${row.ID}-${action}`,
    }),
  }, action === "up" ? "Up" : action[0].toUpperCase() + action.slice(1));
}

function ReferenceApp({ view, onDispatch }) {
  const rows = view.state.Rows;
  return h("div", { className: "collection", key: "collection" },
    h("button", {
      key: "add",
      className: "add",
      disabled: rows.length >= MAX_ROWS,
      onClick: () => onDispatch({ Path: "0", Event: "click", Value: "", Key: "add" }),
    }, "Add row"),
    h("button", {
      key: "reset",
      className: "reset",
      disabled: rows.length === 0,
      onClick: () => onDispatch({ Path: "1", Event: "click", Value: "", Key: "reset" }),
    }, "Reset"),
    h("div", { className: "rows", key: "rows" }, ...rows.map((row, index) => {
      const id = String(row.ID);
      return h("div", { className: "row", key: `row-${id}` },
        h("input", {
          key: `row-${id}-input`,
          type: "text",
          value: row.Draft,
          "aria-label": `Row ${id}`,
          onInput: (event) => onDispatch({
            Path: `2/${index}/0`,
            Event: event.type,
            Value: event.currentTarget.value,
            Key: `row-${id}-input`,
          }),
          // The edit channel is deliberately `input`; this handler only keeps
          // React's controlled-input diagnostic quiet.
          onChange: () => {},
        }),
        h("p", { key: `row-${id}-saved` }, "Saved: ", row.Saved),
        h("p", { key: `row-${id}-saves` }, "Saves: ", String(row.Saves)),
        h("p", { key: `row-${id}-status` }, `Status: ${row.Status}`),
        h("p", { key: `row-${id}-pending` }, `Pending: ${String(row.PendingID)}`),
        rowButton(row, index, "save", onDispatch),
        rowButton(row, index, "remove", onDispatch),
        rowButton(row, index, "up", onDispatch),
        rowButton(row, index, "cancel", onDispatch));
    })));
}

/** Mount a real keyed React reference whose model and projection are independent. */
export function mountReference(container) {
  if (!container || container.nodeType !== 1 || !container.ownerDocument) {
    throw new TypeError("mountReference requires a DOM element");
  }
  if (React.version !== "19.3.1" || reactDOMVersion !== "19.3.1") {
    throw new Error(`expected React and ReactDOM 19.3.1, got ${React.version} and ${reactDOMVersion}`);
  }

  const model = createCollectionReference();
  model.init();
  let current = model.snapshot();
  let setView = () => {};
  let mounted = false;
  const reactRoot = createRoot(container);

  function render(next) {
    current = clone(next);
    if (mounted) flushSync(() => setView(current));
    return clone(current);
  }

  function onDispatch(step) {
    return render(model.dispatch(step));
  }

  function complete(reply) {
    return render(model.complete(reply));
  }

  function App() {
    const [view, setState] = useState(() => current);
    setView = setState;
    return h(ReferenceApp, { view, onDispatch });
  }

  flushSync(() => reactRoot.render(h(App)));
  mounted = true;

  function domSnapshot() {
    const top = container.firstElementChild;
    return { html: container.innerHTML, disabled: top ? disabledPaths(top) : [] };
  }

  function focusState() {
    const top = container.firstElementChild;
    const active = container.ownerDocument.activeElement;
    if (!top || !active || !top.contains(active) || active.tagName !== "INPUT") return null;
    const path = pathFromRoot(active, top);
    const node = nodeAtPath(current.tree, path);
    return {
      Key: node.Key,
      Path: path,
      SelectionStart: active.selectionStart,
      SelectionEnd: active.selectionEnd,
      SelectionDirection: active.selectionDirection,
    };
  }

  function inputForKey(key) {
    if (typeof key !== "string") throw new TypeError("inputForKey requires a primitive string key");
    const match = /^row-(\d+)-input$/.exec(key);
    if (!match || !current.state.Rows.some((row) => String(row.ID) === match[1])) return null;
    return Array.from(container.querySelectorAll("input"))
      .find((input) => input.getAttribute("aria-label") === `Row ${match[1]}`) ?? null;
  }

  const api = {
    init() { return render(model.init()); },
    dispatch(step) { return onDispatch(step); },
    complete,
    effects() { return model.effects(); },
    audit() { return model.audit(); },
    encodeHTTP: model.encodeHTTP,
    decodeHTTP: model.decodeHTTP,
    snapshot() { return clone(current); },
    domSnapshot,
    focusState,
    inputForKey,
    click(path) {
      if (!mounted) throw new Error("cannot click after unmount");
      const target = childAtPath(container, path);
      if (!(target instanceof container.ownerDocument.defaultView.HTMLElement)) {
        throw new Error(`child path ${String(path)} does not identify an element`);
      }
      target.click();
      return api.snapshot();
    },
    unmount() {
      if (!mounted) return;
      mounted = false;
      flushSync(() => reactRoot.unmount());
    },
  };
  return api;
}

export const mountCollectionReference = mountReference;

