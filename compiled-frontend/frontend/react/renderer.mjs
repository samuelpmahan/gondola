import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync, version as reactDOMVersion } from "react-dom";
import {
  attributeName,
  booleanAttributes,
  eventNames,
  eventName,
  styleKey,
} from "./react-map.gen.mjs";
import { createViewTools, ELEMENT, TEXT, FRAGMENT } from "../shared/view.mjs";

const { Fragment, createElement } = React;
const FORM_CONTROLS = new Set(["button", "input", "select", "textarea"]);
const BOOLEAN_ATTRIBUTES = new Set(booleanAttributes);

const viewTools = createViewTools({ rendererName: "compiled React renderer", eventNames, booleanAttributes });
const {
  fail, isRecord, listOrEmpty, childPath, exactKeys, normalizeAndValidate,
  emptyArrays, identityFor, nodeRecord, bindingRecord,
} = viewTools;

function getAttribute(node, name) {
  return emptyArrays(node.Attrs).find((attr) => attr.Name === name);
}

function styleObject(attr, path) {
  const result = {};
  for (const style of emptyArrays(attr.Style)) {
    const key = styleKey(style.Property);
    const value = style.Value.trim();
    if (value !== "") result[key] = value;
    else delete result[key];
  }
  return result;
}

function propsFor(node, path, binding) {
  const props = {};
  for (const attr of emptyArrays(node.Attrs)) {
    if (attr.Name === "style") {
      const styles = styleObject(attr, path);
      if (Object.keys(styles).length !== 0) props.style = styles;
      continue;
    }
    const name = attributeName(attr.Name);
    if (attr.Flag) {
      if (attr.Name.startsWith("data-") || attr.Name.startsWith("aria-")) props[name] = "true";
      else props[name] = true;
    } else {
      if (BOOLEAN_ATTRIBUTES.has(attr.Name)) throw fail(`boolean attribute ${JSON.stringify(attr.Name)} must use Flag`);
      props[name] = attr.Value;
    }
  }
  if (binding?.Source === "target.checked" && !getAttribute(node, "checked")) props.checked = false;
  return props;
}

/** Lower one typed Go View into React elements without running application code. */
export function lowerView(value, { dispatch, onStaleAction, renderEpoch = 1, isCurrent = () => true, refFor = () => null } = {}) {
  if (typeof dispatch !== "function" || typeof onStaleAction !== "function" || typeof isCurrent !== "function" || typeof refFor !== "function") {
    throw fail("lowerView needs dispatch, onStaleAction, isCurrent and refFor callbacks");
  }
  if (!Number.isSafeInteger(renderEpoch) || renderEpoch < 1) throw fail("renderEpoch must be a positive safe integer");
  const normalized = normalizeAndValidate(value);
  const { view, bindings } = normalized;
  const bindingAt = new Map(bindings.map((binding) => [`${binding.Path}\u0000${binding.Event}`, binding]));

  function toReact(node, path, parentIdentity) {
    if (node.Kind === TEXT) return node.Text;
    const identityParts = node.Kind === ELEMENT ? identityFor(parentIdentity, node, path) : parentIdentity;
    const identity = JSON.stringify(identityParts);
    if (node.Kind === FRAGMENT) {
      const fragmentIdentity = identityFor(parentIdentity, node, path);
      const children = emptyArrays(node.Kids).map((kid, index) => toReact(kid, childPath(path, index), fragmentIdentity));
      return createElement(Fragment, { key: node.Key || `gobi-fragment:${path || "root"}` }, ...children);
    }

    const binding = bindingAt.get(`${path}\u0000input`) ?? bindingAt.get(`${path}\u0000change`) ?? null;
    const props = propsFor(node, path, binding);
    props.key = node.Key || `gobi-node:${path || "root"}`;
    props.ref = refFor(path, identity, node);

    const handlers = new Map(emptyArrays(node.On).map((handler) => [handler.Event, handler]));
    const eventTypes = new Set([...handlers.keys(), ...emptyArrays(view.Bindings).filter((b) => b.Path === path).map((b) => b.Event)]);
    for (const type of eventTypes) {
      const eventBinding = bindingAt.get(`${path}\u0000${type}`) ?? null;
      const literal = handlers.get(type) ?? null;
      const prop = eventName(type);
      props[prop] = (event) => {
        const target = event?.currentTarget;
        if (!target || target.disabled === true || target.matches?.(":disabled")) return;

        let message;
        let valueArg;
        if (eventBinding) {
          if (eventBinding.Source === "target.value") {
            if (typeof target.value !== "string") throw fail(`input event target at ${path || "<root>"} has no string value`);
            valueArg = target.value;
          } else {
            if (typeof target.checked !== "boolean") throw fail(`checked event target at ${path || "<root>"} has no boolean checked property`);
            valueArg = target.checked ? "true" : "false";
          }
          message = { Name: eventBinding.Message, Arg: valueArg };
        } else {
          // Action.Value describes the physical event target. The application
          // message remains bound to the literal On.Arg, even when that text
          // happens to look like a dynamic target expression.
          valueArg = typeof target.value === "string" ? target.value : "";
          message = { Name: literal.Message, Arg: literal.Arg };
        }
        const action = { path, event: type, value: valueArg };
        try {
          if (isCurrent(renderEpoch)) dispatch(action, message);
          else onStaleAction(action, renderEpoch);
        } catch (error) {
          throw fail(`event callback failed at ${path || "<root>"}`, error);
        }
      };
    }

    if ((Object.hasOwn(props, "value") || Object.hasOwn(props, "checked")) && !props.onChange) {
      // React treats value/checked as controlled properties and expects an
      // onChange callback, even when this Node is intentionally read-only.
      props.onChange = () => {};
    }

    const children = emptyArrays(node.Kids).map((kid, index) => toReact(kid, childPath(path, index), identityParts));
    return createElement(node.Tag, props, ...children);
  }

  const element = toReact(view.Tree, "", []);
  return { element, view, nodesByPath: normalized.nodesByPath, bindings };
}

/** Create a synchronous, keyed React adapter for the generic compiled runtime. */
export function createReactRenderer({ container, onFailure = null, strictMode = false } = {}) {
  if (!container || container.nodeType !== 1 || !container.ownerDocument || typeof container.contains !== "function") {
    throw fail("container must be a DOM element with ownerDocument");
  }
  if (React.version !== "19.3.1" || reactDOMVersion !== "19.3.1") {
    throw fail(`expected React and ReactDOM 19.3.1, got ${React.version} and ${reactDOMVersion}`);
  }
  if (onFailure !== null && typeof onFailure !== "function") throw fail("onFailure must be a function when supplied");
  if (typeof strictMode !== "boolean") throw fail("strictMode must be a boolean");

  let active = true;
  let mounted = false;
  let root = null;
  let current = null;
  let currentBindings = null;
  let activeEpoch = 0;
  let nextEpoch = 1;
  let hasCommitted = false;
  let lastError = null;
  const elementByPath = new Map();
  const elementByIdentity = new Map();

  function reportFailure(error) {
    lastError = error instanceof Error ? error : new Error(String(error));
    active = false;
    try {
      onFailure?.(lastError);
    } catch (reportError) {
      lastError = reportError instanceof Error ? reportError : new Error(String(reportError));
    }
  }

  function refFor(path, identity) {
    let attached = null;
    return (element) => {
      if (element) {
        attached = element;
        elementByPath.set(path, element);
        elementByIdentity.set(identity, element);
      } else {
        if (attached && elementByPath.get(path) === attached) elementByPath.delete(path);
        if (attached && elementByIdentity.get(identity) === attached) {
          elementByIdentity.delete(identity);
        }
        attached = null;
      }
    };
  }

  function focusState() {
    const element = container.ownerDocument.activeElement;
    if (!element || !container.contains(element) || element.localName !== "input" || element.disabled === true ||
        typeof element.setSelectionRange !== "function" || !("selectionStart" in element) || !("selectionEnd" in element)) return null;
    const match = [...elementByIdentity.entries()].find(([, candidate]) => candidate === element);
    if (!match) return null;
    let selectionStart;
    let selectionEnd;
    let selectionDirection;
    try {
      selectionStart = element.selectionStart;
      selectionEnd = element.selectionEnd;
      selectionDirection = element.selectionDirection;
    } catch {
      return null;
    }
    if (!Number.isInteger(selectionStart) || !Number.isInteger(selectionEnd)) return null;
    return {
      identity: match[0],
      selectionStart,
      selectionEnd,
      selectionDirection: typeof selectionDirection === "string" ? selectionDirection : "none",
    };
  }

  function restoreFocus(state) {
    if (state == null) return false;
    state = exactKeys(state, ["identity", "selectionStart", "selectionEnd", "selectionDirection"], "focus state");
    if (typeof state.identity !== "string" || !Number.isInteger(state.selectionStart) ||
        !Number.isInteger(state.selectionEnd) || typeof state.selectionDirection !== "string") {
      throw fail("focus state fields have invalid types");
    }
    const element = elementByIdentity.get(state.identity);
    if (!element || !container.contains(element) || element.localName !== "input" || element.disabled === true ||
        typeof element.focus !== "function" || typeof element.setSelectionRange !== "function") return false;
    if (container.ownerDocument.activeElement !== element) element.focus();
    try {
      if (element.selectionStart !== state.selectionStart || element.selectionEnd !== state.selectionEnd ||
          element.selectionDirection !== state.selectionDirection) {
        element.setSelectionRange(state.selectionStart, state.selectionEnd, state.selectionDirection);
      }
    } catch {
      // A browser may not implement selection restoration for a particular input type.
    }
    return true;
  }

  function clearControlledCheckedAttributes(bindings) {
    for (const binding of bindings) {
      if (binding.Source !== "target.checked") continue;
      const element = elementByPath.get(binding.Path);
      if (!element || !container.contains(element)) continue;
      const checked = element.checked;
      element.removeAttribute("checked");
      element.checked = checked;
    }
  }

  function update(value, callbacks = {}) {
    if (!active) throw fail("cannot update after unmount or renderer failure", lastError ?? undefined);
    if (!isRecord(callbacks) || typeof callbacks.dispatch !== "function" || typeof callbacks.onStaleAction !== "function") {
      throw fail("update needs dispatch and onStaleAction callbacks");
    }
    const focus = focusState();
    const candidateEpoch = nextEpoch++;
    const built = lowerView(value, {
      dispatch: callbacks.dispatch,
      onStaleAction: callbacks.onStaleAction,
      renderEpoch: candidateEpoch,
      isCurrent: (epoch) => active && epoch === activeEpoch,
      refFor,
    });
    if (built.view.Tree.Kind !== ELEMENT) {
      throw fail("outerHTML-v1 browser snapshots require an element view root");
    }
    const previous = { view: current, bindings: currentBindings, epoch: activeEpoch };
    try {
      if (!root) {
        root = createRoot(container, {
          onUncaughtError(error) {
            reportFailure(error);
          },
          onRecoverableError(error) {
            reportFailure(error);
          },
        });
      }
      const rendered = strictMode ? createElement(React.StrictMode, null, built.element) : built.element;
      flushSync(() => root.render(rendered));
      clearControlledCheckedAttributes(built.bindings);
      current = built.view;
      currentBindings = built.bindings;
      activeEpoch = candidateEpoch;
      mounted = true;
      hasCommitted = true;
      restoreFocus(focus);
      lastError = null;
      return viewRecord();
    } catch (error) {
      current = previous.view;
      currentBindings = previous.bindings;
      activeEpoch = previous.epoch;
      reportFailure(error);
      throw error;
    }
  }

  function viewRecord() {
    if (current === null) return null;
    return {
      tree: nodeRecord(current.Tree),
      bindings: current.Bindings == null ? [] : listOrEmpty(current.Bindings, "View.Bindings").map(bindingRecord),
    };
  }

  function domSnapshot() {
    if (!hasCommitted) throw fail("cannot snapshot DOM before the first update");
    if (!mounted || current === null) {
      if (container.childNodes.length !== 0) throw fail("mounted root remains in the container after unmount");
      return { normalization: "outerHTML-v1", html: "", controls: [] };
    }
    const renderedRoot = container.firstElementChild;
    if (!renderedRoot) throw fail("element root is missing from the mounted container");
    const html = renderedRoot.outerHTML;
    const controls = [];
    function collect(node, path) {
      if (node.Kind === ELEMENT) {
        if (FORM_CONTROLS.has(node.Tag)) {
          const element = elementByPath.get(path);
          if (!element || !container.contains(element)) throw fail(`mounted control at ${JSON.stringify(path)} is missing`);
          controls.push({
            path,
            key: node.Key,
            tag: node.Tag,
            type: typeof element.type === "string" ? element.type : "",
            value: typeof element.value === "string" ? element.value : "",
            checked: typeof element.checked === "boolean" ? element.checked : false,
            disabled: typeof element.disabled === "boolean" ? element.disabled : false,
          });
        }
        emptyArrays(node.Kids).forEach((kid, index) => collect(kid, childPath(path, index)));
      } else if (node.Kind === FRAGMENT) {
        emptyArrays(node.Kids).forEach((kid, index) => collect(kid, childPath(path, index)));
      }
    }
    collect(current.Tree, "");
    return { normalization: "outerHTML-v1", html, controls };
  }

  function unmount() {
    if (!active && !root) return;
    active = false;
    activeEpoch = 0;
    if (root) {
      try {
        flushSync(() => root.unmount());
      } catch (error) {
        reportFailure(error);
        throw error;
      }
    }
    root = null;
    mounted = false;
    current = null;
    currentBindings = null;
    elementByPath.clear();
    elementByIdentity.clear();
  }

  return {
    update,
    snapshot: viewRecord,
    viewRecord,
    domSnapshot,
    focusState,
    restoreFocus,
    unmount,
    get lastError() { return lastError; },
  };
}

