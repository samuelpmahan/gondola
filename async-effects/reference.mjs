// Independent React 19.3.1 oracle for the asynchronous-save experiment.
// This module owns its model, request IDs, outbox, and audit. It never reads a
// Go snapshot or imports the production asyncsave transition functions.

import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync, version as reactDOMVersion } from "react-dom";

const h = React.createElement;
export const referenceReactVersion = React.version;
export const referenceReactDOMVersion = reactDOMVersion;
export const MAX_REQUEST_ID = Number.MAX_SAFE_INTEGER;

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = clone(item);
    return result;
  }
  return value;
}

export function initialAsyncState() {
  return { Draft: "", Saved: "", Saves: 0, NextID: 0, PendingID: 0, Status: "idle" };
}

const attr = (Name, Value = "", Flag = false) => ({ Name, Value, Flag, Style: null });
const text = (Text) => ({
  Kind: 2,
  Tag: "",
  Key: "",
  Attrs: null,
  On: null,
  Kids: null,
  Text,
});
const element = (Tag, Attrs, On, Kids) => ({
  Kind: 1,
  Tag,
  Key: "",
  Attrs,
  On,
  Kids,
  Text: "",
});
const literal = (Event, Message, Arg = "") => ({ Event, Message, Arg });

function resetDisabled(state) {
  return state.Draft === "" && state.Saved === "" && state.Saves === 0 && state.Status === "idle";
}

function exactFields(value, expected, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${description} must be an object`);
  }
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  if (actualKeys.length !== expectedKeys.length ||
      actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new TypeError(`${description} must contain exactly ${expectedKeys.join(", ")}`);
  }
}

/** Project independent oracle state into the Go snapshot wire shape. */
export function projectAsyncSnapshot(state, messages) {
  const tree = element("div", [attr("class", "editor")], null, [
    element("input", [
      attr("type", "text"),
      attr("value", state.Draft),
      attr("aria-label", "Draft"),
    ], null, null),
    element("p", null, null, [text("Saved: "), text(state.Saved)]),
    element("p", null, null, [text("Saves: "), text(String(state.Saves))]),
    element("button", [
      attr("class", "save"),
      ...(state.Draft === "" ? [attr("disabled", "", true)] : []),
    ], [literal("click", "save")], [text("Save")]),
    element("button", [
      attr("class", "reset"),
      ...(resetDisabled(state) ? [attr("disabled", "", true)] : []),
    ], [literal("click", "reset")], [text("Reset")]),
    element("button", [
      attr("class", "cancel"),
      ...(state.PendingID === 0 ? [attr("disabled", "", true)] : []),
    ], [literal("click", "cancel")], [text("Cancel")]),
    element("p", null, null, [text(`Status: ${state.Status}`)]),
    element("p", null, null, [text(`Pending: ${String(state.PendingID)}`)]),
  ]);

  return {
    state: { ...state },
    tree,
    bindings: [{ Path: "0", Event: "input", Message: "edit", Source: "target.value" }],
    messages: messages.map(({ Name, Arg }) => ({ Name, Arg })),
  };
}

function validateStep(step) {
  exactFields(step, ["Path", "Event", "Value"], "dispatch step");
  if (typeof step.Path !== "string" || typeof step.Event !== "string" || typeof step.Value !== "string") {
    throw new TypeError("dispatch step Path, Event, and Value must be strings");
  }
  return { Path: step.Path, Event: step.Event, Value: step.Value };
}

function validateReply(reply) {
  exactFields(reply, ["ID", "Value", "Error"], "reply");
  if (!Number.isSafeInteger(reply.ID) || reply.ID < 1 || reply.ID > MAX_REQUEST_ID) {
    throw new RangeError("reply ID must be a nonzero JavaScript-safe integer");
  }
  if (typeof reply.Value !== "string" || typeof reply.Error !== "string") {
    throw new TypeError("reply Value and Error must be strings");
  }
  return { ID: reply.ID, Value: reply.Value, Error: reply.Error };
}

function parsePath(path) {
  if (path === "") return [];
  if (!/^(?:0|[1-9]\d*)(?:\/(?:0|[1-9]\d*))*$/.test(path)) {
    throw new Error(`invalid child path ${JSON.stringify(path)}`);
  }
  return path.split("/").map(Number);
}

/**
 * Create a pure independent reference session. Methods use Go's public
 * runtime-shaped API, but every transition below is implemented here.
 */
export function createAsyncReference() {
  let state = initialAsyncState();
  let messages = [];
  let outbox = [];
  let receipts = [];

  const snapshot = () => projectAsyncSnapshot(state, messages);

  function init() {
    state = initialAsyncState();
    messages = [];
    outbox = [];
    receipts = [];
    return snapshot();
  }

  function dispatch(rawStep) {
    const step = validateStep(rawStep);
    const indexes = parsePath(step.Path);
    if (indexes.length !== 1 || indexes[0] < 0 || indexes[0] > 7) {
      throw new Error(`no ${JSON.stringify(step.Event)} handler or binding at path ${JSON.stringify(step.Path)}`);
    }

    const disabled = indexes[0] === 3 && state.Draft === "" ||
      indexes[0] === 4 && resetDisabled(state) ||
      indexes[0] === 5 && state.PendingID === 0;
    // Match the Go session's order: an event sent to a disabled target is
    // ignored before handler resolution, even if the event name is unknown.
    if (disabled) return snapshot();

    let name;
    if (indexes[0] === 0 && step.Event === "input") name = "edit";
    else if (step.Event === "click" && indexes[0] === 3) name = "save";
    else if (step.Event === "click" && indexes[0] === 4) name = "reset";
    else if (step.Event === "click" && indexes[0] === 5) name = "cancel";
    else throw new Error(`no ${JSON.stringify(step.Event)} handler or binding at path ${JSON.stringify(step.Path)}`);

    const next = { ...state };
    const newMessages = [...messages];
    const newEffects = [];
    const message = { Name: name, Arg: name === "edit" ? step.Value : "" };

    switch (name) {
      case "edit":
        next.Draft = message.Arg;
        break;
      case "save":
        if (next.NextID >= MAX_REQUEST_ID) {
          throw new RangeError("request ID allocation exceeds the JavaScript-safe integer limit");
        }
        if (next.PendingID !== 0) newEffects.push({ Kind: "cancel", ID: next.PendingID, Value: "" });
        next.NextID += 1;
        next.PendingID = next.NextID;
        next.Status = "pending";
        newEffects.push({ Kind: "start", ID: next.PendingID, Value: next.Draft });
        break;
      case "cancel":
        newEffects.push({ Kind: "cancel", ID: next.PendingID, Value: "" });
        next.PendingID = 0;
        next.Status = "cancelled";
        break;
      case "reset": {
        const nextID = next.NextID;
        if (next.PendingID !== 0) newEffects.push({ Kind: "cancel", ID: next.PendingID, Value: "" });
        Object.assign(next, initialAsyncState(), { NextID: nextID });
        break;
      }
    }

    newMessages.push(message);
    state = next;
    messages = newMessages;
    outbox = outbox.concat(newEffects);
    return snapshot();
  }

  function complete(rawReply) {
    const reply = validateReply(rawReply);
    const accepted = state.PendingID !== 0 && reply.ID === state.PendingID;
    const reason = !accepted ? "stale" : reply.Error !== "" ? "error" : "saved";
    const next = { ...state };
    if (accepted) {
      next.PendingID = 0;
      if (reply.Error !== "") {
        next.Status = `error: ${reply.Error}`;
      } else {
        next.Saved = reply.Value;
        next.Saves += 1;
        next.Status = "saved";
      }
    }
    state = next;
    messages = messages.concat({ Name: "reply", Arg: String(reply.ID) });
    receipts = receipts.concat({
      ID: reply.ID,
      Value: reply.Value,
      Error: reply.Error,
      Accepted: accepted,
      Reason: reason,
    });
    return snapshot();
  }

  return {
    init,
    dispatch,
    complete,
    effects() {
      const drained = outbox;
      outbox = [];
      return clone(drained);
    },
    audit() {
      return clone(receipts);
    },
    snapshot() {
      return clone(snapshot());
    },
  };
}

function childAtPath(root, path) {
  const indexes = Array.isArray(path) ? path : parsePath(String(path));
  let element = root.firstElementChild;
  if (!element) throw new Error("async reference root is not mounted");
  for (const index of indexes) {
    if (!Number.isInteger(index) || index < 0 || index >= element.childNodes.length) {
      throw new Error(`invalid child path ${String(path)}`);
    }
    element = element.childNodes[index];
  }
  return element;
}

function pathFromRoot(elementToFind, top) {
  const indexes = [];
  let element = elementToFind;
  while (element && element !== top) {
    const parent = element.parentNode;
    if (!parent) return null;
    indexes.push(Array.prototype.indexOf.call(parent.childNodes, element));
    element = parent;
  }
  return element === top ? indexes.reverse().join("/") : null;
}

/** Mount the independent model as a real, controlled React 19.3.1 tree. */
export function mountReference(container) {
  if (!container || container.nodeType !== 1 || !container.ownerDocument) {
    throw new TypeError("mountReference requires a DOM element");
  }
  if (React.version !== "19.3.1" || reactDOMVersion !== "19.3.1") {
    throw new Error(`expected React and ReactDOM 19.3.1, got ${React.version} and ${reactDOMVersion}`);
  }

  const model = createAsyncReference();
  model.init();
  let current = model.snapshot();
  let reactRoot;
  let mounted = false;

  function deliver(step) {
    const next = model.dispatch(step);
    current = next;
    if (mounted) flushSync(() => setView(next));
    return clone(current);
  }

  function complete(reply) {
    const next = model.complete(reply);
    current = next;
    if (mounted) flushSync(() => setView(next));
    return clone(current);
  }

  function ReferenceApp() {
    const [view, setState] = useState(() => current);
    setView = setState;
    const currentState = view.state;
    return h("div", { className: "editor" },
      h("input", {
        type: "text",
        value: currentState.Draft,
        "aria-label": "Draft",
        onInput: (event) => deliver({ Path: "0", Event: "input", Value: event.currentTarget.value }),
        onChange: () => {},
      }),
      h("p", null, "Saved: ", currentState.Saved),
      h("p", null, "Saves: ", String(currentState.Saves)),
      h("button", {
        className: "save",
        disabled: currentState.Draft === "",
        onClick: () => deliver({ Path: "3", Event: "click", Value: "" }),
      }, "Save"),
      h("button", {
        className: "reset",
        disabled: resetDisabled(currentState),
        onClick: () => deliver({ Path: "4", Event: "click", Value: "" }),
      }, "Reset"),
      h("button", {
        className: "cancel",
        disabled: currentState.PendingID === 0,
        onClick: () => deliver({ Path: "5", Event: "click", Value: "" }),
      }, "Cancel"),
      h("p", null, `Status: ${currentState.Status}`),
      h("p", null, `Pending: ${String(currentState.PendingID)}`),
    );
  }

  // Assigned by ReferenceApp on first render; kept as a function so external
  // complete() can update the same React-owned view synchronously.
  let setView = () => {};
  reactRoot = createRoot(container);
  flushSync(() => reactRoot.render(h(ReferenceApp)));
  mounted = true;

  function domSnapshot() {
    const top = container.firstElementChild;
    const disabled = top
      ? Array.from(top.querySelectorAll("button, input"))
        .filter((element) => element.disabled)
        .map((element) => pathFromRoot(element, top))
      : [];
    return { html: container.innerHTML, disabled };
  }

  const api = {
    init() {
      current = model.init();
      if (mounted) flushSync(() => setView(current));
      return clone(current);
    },
    dispatch(step) {
      return deliver(step);
    },
    complete,
    effects() {
      return model.effects();
    },
    audit() {
      return model.audit();
    },
    snapshot() {
      return clone(current);
    },
    domSnapshot,
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
