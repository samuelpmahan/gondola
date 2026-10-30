// Independent React implementation of the counter used by the browser parity harness.
// It owns its state and event handlers; it does not read Go snapshots or share the Go
// renderer's tree-building code.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync, version as reactDOMVersion } from "react-dom";

const h = React.createElement;
export const reactReferenceVersion = React.version;
export const reactDOMReferenceVersion = reactDOMVersion;

function treeFor(count) {
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
  const attr = (Name, Value = "", Flag = false) => ({
    Name,
    Value,
    Flag,
    Style: null,
  });
  const on = (Event, Message, Arg = "") => ({ Event, Message, Arg });

  return element(
    "div",
    [attr("class", "counter")],
    null,
    [
      element("p", null, null, [text("Count: "), text(String(count))]),
      element("button", [attr("class", "add")], [on("click", "add")], [text("+")]),
      element(
        "button",
        count === 0 ? [attr("disabled", "", true)] : null,
        [on("click", "reset")],
        [text("Reset")],
      ),
    ],
  );
}

function childAtPath(root, path) {
  const indexes = String(path).split("/").map((part) => Number(part));
  let node = root.firstElementChild;
  if (!node) throw new Error("React counter root is not mounted");
  for (const index of indexes) {
    if (!Number.isInteger(index) || index < 0 || index >= node.childNodes.length) {
      throw new Error(`invalid child path ${path}`);
    }
    node = node.childNodes[index];
  }
  return node;
}

function copy(value) {
  return structuredClone(value);
}

/** Mount the genuine React 19 reference app in an existing DOM root. */
export function mountReactReference(container) {
  const messageLog = [];
  const snapshotRef = { current: null };

  function Counter() {
    const [count, setCount] = useState(0);

    function send(Name, Arg = "") {
      messageLog.push({ Name, Arg });
      if (Name === "add") setCount((current) => current + 1);
      else if (Name === "reset") setCount(0);
    }

    const tree = treeFor(count);
    snapshotRef.current = {
      state: { Count: count },
      tree,
      messages: messageLog.map((message) => ({ ...message })),
    };

    return h(
      "div",
      { className: "counter" },
      h("p", null, "Count: ", String(count)),
      h("button", { className: "add", onClick: () => send("add") }, "+"),
      h("button", { disabled: count === 0, onClick: () => send("reset") }, "Reset"),
    );
  }

  const root = createRoot(container);
  flushSync(() => root.render(h(Counter)));

  return {
    snapshot() {
      return copy(snapshotRef.current);
    },
    domSnapshot() {
      const counterRoot = container.firstElementChild;
      return {
        html: container.innerHTML,
        disabled: counterRoot
          ? Array.from(counterRoot.children, (child, index) => child.disabled ? String(index) : null).filter(Boolean)
          : [],
      };
    },
    click(path) {
      const target = childAtPath(container, path);
      if (!(target instanceof container.ownerDocument.defaultView.HTMLElement)) {
        throw new Error(`child path ${path} does not identify an element`);
      }
      flushSync(() => target.click());
    },
    unmount() {
      flushSync(() => root.unmount());
    },
  };
}
