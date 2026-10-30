// Independent React oracle for the controlled editor. This module owns its
// state transitions and tree projection; it never reads a Go snapshot.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync, version as reactDOMVersion } from "react-dom";

const h = React.createElement;
export const referenceReactVersion = React.version;
export const referenceReactDOMVersion = reactDOMVersion;

export function initialEditorState() {
  return { Draft: "", Saved: "", Saves: 0 };
}

/** Apply the frozen editor transition contract without consulting a runtime. */
export function updateEditorState(state, message) {
  if (message?.Name === "edit") return { ...state, Draft: message.Arg };
  if (message?.Name === "save" && state.Draft !== "") {
    return { ...state, Saved: state.Draft, Saves: state.Saves + 1 };
  }
  if (message?.Name === "reset") return initialEditorState();
  return { ...state };
}

const attr = (Name, Value = "", Flag = false) => ({
  Name,
  Value,
  Flag,
  Style: null,
});
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

/** Project oracle-owned state and messages into the serialized Gobi contract. */
export function projectEditorSnapshot(state, messages) {
  const resetDisabled = state.Draft === "" && state.Saved === "" && state.Saves === 0;
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
      ...(resetDisabled ? [attr("disabled", "", true)] : []),
    ], [literal("click", "reset")], [text("Reset")]),
  ]);

  return {
    state: { ...state },
    tree,
    bindings: [{ Path: "0", Event: "input", Message: "edit", Source: "target.value" }],
    messages: messages.map(({ Name, Arg }) => ({ Name, Arg })),
  };
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

function childAtPath(root, path) {
  const parts = Array.isArray(path) ? path : String(path).split("/");
  let element = root.firstElementChild;
  if (!element) throw new Error("editor reference root is not mounted");
  for (const part of parts) {
    const index = Number(part);
    if (!Number.isInteger(index) || index < 0 || index >= element.childNodes.length) {
      throw new Error(`invalid child path ${String(path)}`);
    }
    element = element.childNodes[index];
  }
  return element;
}

/** Mount an independent React editor whose native input and button events own its model. */
export function mountReference(container) {
  if (!container || container.nodeType !== 1 || !container.ownerDocument) {
    throw new TypeError("mountReference requires a DOM element");
  }
  if (React.version !== "19.3.1" || reactDOMVersion !== "19.3.1") {
    throw new Error(`expected React and ReactDOM 19.3.1, got ${React.version} and ${reactDOMVersion}`);
  }

  const messagesRef = { current: [] };
  const currentRef = { current: null };
  let reactRoot;
  let mounted = false;

  function Editor() {
    const [state, setState] = useState(initialEditorState);
    const snapshot = projectEditorSnapshot(state, messagesRef.current);
    currentRef.current = snapshot;

    function deliver(Name, Arg = "") {
      messagesRef.current.push({ Name, Arg });
      flushSync(() => setState((current) => updateEditorState(current, { Name, Arg })));
    }

    const resetDisabled = state.Draft === "" && state.Saved === "" && state.Saves === 0;
    return h("div", { className: "editor" },
      h("input", {
        type: "text",
        value: state.Draft,
        "aria-label": "Draft",
        onInput: (event) => deliver("edit", event.currentTarget.value),
        onChange: () => {},
      }),
      h("p", null, "Saved: ", state.Saved),
      h("p", null, "Saves: ", String(state.Saves)),
      h("button", {
        className: "save",
        disabled: state.Draft === "",
        onClick: () => deliver("save"),
      }, "Save"),
      h("button", {
        className: "reset",
        disabled: resetDisabled,
        onClick: () => deliver("reset"),
      }, "Reset"),
    );
  }

  reactRoot = createRoot(container);
  flushSync(() => reactRoot.render(h(Editor)));
  mounted = true;

  function domSnapshot() {
    const top = container.firstElementChild;
    const disabled = top
      ? Array.from(top.querySelectorAll("button"))
        .filter((button) => button.disabled)
        .map((button) => pathFromRoot(button, top))
      : [];
    return { html: container.innerHTML, disabled };
  }

  const api = {
    snapshot() {
      return structuredClone(currentRef.current);
    },
    domSnapshot,
    click(path) {
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
