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

const { Fragment, createElement } = React;
const ELEMENT = 1;
const TEXT = 2;
const FRAGMENT = 3;
const FORM_CONTROLS = new Set(["button", "input", "select", "textarea"]);
const BOOLEAN_ATTRIBUTES = new Set(booleanAttributes);
const RESERVED_ATTRIBUTES = new Set(["children", "dangerouslysetinnerhtml", "key", "ref"]);

function fail(message, cause) {
  return new Error(`compiled React renderer: ${message}`, cause === undefined ? undefined : { cause });
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !isNativeArray(value);
}

function isNativeArray(value) {
  try {
    return Array.isArray(value);
  } catch {
    return false;
  }
}

function ownKeysOf(value, description) {
  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch (error) {
    throw fail(`${description} own keys could not be inspected`, error);
  }
  if (keys.some((key) => typeof key !== "string")) {
    throw fail(`${description} has unsupported symbol properties`);
  }
  return keys;
}

function ownDescriptorOf(value, key, description) {
  try {
    return Object.getOwnPropertyDescriptor(value, key);
  } catch (error) {
    throw fail(`${description}.${String(key)} descriptor could not be inspected`, error);
  }
}

function copyOwnDataProperties(value, description, allowGoStructMarker = false, expected = null) {
  if (!isRecord(value)) throw fail(`${description} must be an object`);
  const ownKeys = ownKeysOf(value, description);
  const descriptors = new Map();
  for (const key of ownKeys) descriptors.set(key, ownDescriptorOf(value, key, description));

  const marker = descriptors.get("__goStructValue");
  if (ownKeys.includes("__goStructValue") && (!marker || !allowGoStructMarker || marker.value !== true || marker.enumerable !== true ||
      marker.writable !== true || marker.configurable !== true || "get" in marker || "set" in marker)) {
    throw fail(`${description} has an invalid GoScript struct marker`);
  }

  const keys = ownKeys.filter((key) => key !== "__goStructValue");
  if (expected !== null) {
    const sortedKeys = [...keys].sort();
    const want = [...expected].sort();
    if (sortedKeys.length !== want.length || sortedKeys.some((key, index) => key !== want[index])) {
      throw fail(`${description} must contain exactly ${want.join(", ")}`);
    }
  }
  const copy = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors.get(key);
    if (!descriptor || !descriptor.enumerable || !descriptor.writable || !descriptor.configurable ||
        "get" in descriptor || "set" in descriptor) {
      throw fail(`${description}.${key} is not an own data property`);
    }
    Object.defineProperty(copy, key, {
      value: descriptor.value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return { copy, keys, descriptors };
}

function snapshotNativeArray(value, description) {
  if (!isNativeArray(value)) throw fail(`${description} must be a native array`);
  const keys = ownKeysOf(value, description);
  const lengthDescriptor = ownDescriptorOf(value, "length", description);
  const length = lengthDescriptor?.value;
  if (!lengthDescriptor || lengthDescriptor.enumerable || !lengthDescriptor.writable || lengthDescriptor.configurable ||
      "get" in lengthDescriptor || "set" in lengthDescriptor || !Number.isSafeInteger(length) || length < 0) {
    throw fail(`${description} has an invalid native array length`);
  }
  const keySet = new Set(keys);
  if (keys.length !== length + 1 || !keySet.has("length")) {
    throw fail(`${description} must be a dense native array without extra properties`);
  }
  const snapshot = new Array(length);
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    if (!keySet.has(key)) throw fail(`${description} must be a dense native array without extra properties`);
    const descriptor = ownDescriptorOf(value, key, description);
    if (!descriptor || !descriptor.enumerable || !descriptor.writable || !descriptor.configurable ||
        "get" in descriptor || "set" in descriptor) {
      throw fail(`${description}[${index}] must be an own data property`);
    }
    Object.defineProperty(snapshot, key, {
      value: descriptor.value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return snapshot;
}

function copyArrayWindow(array, offset, length) {
  const copy = new Array(length);
  for (let index = 0; index < length; index += 1) copy[index] = array[offset + index];
  return copy;
}

function listOrEmpty(value, description) {
  if (value === null) return [];
  if (value === undefined) throw fail(`${description} must be null or an admitted slice`);
  if (isNativeArray(value)) return snapshotNativeArray(value, description);
  if (!isRecord(value)) throw fail(`${description} must be an array, GoScript slice, or null`);
  const { copy, keys, descriptors } = copyOwnDataProperties(value, description, false);
  const sortedKeys = [...keys].sort();
  const observedShape = ["backing", "capacity", "length", "offset", "target"].sort();
  if (sortedKeys.join("\u0000") !== observedShape.join("\u0000")) {
    throw fail(`${description} has an unsupported GoScript slice shape`);
  }
  for (const key of keys) {
    const descriptor = descriptors.get(key);
    if (!descriptor || !descriptor.enumerable || !descriptor.writable || !descriptor.configurable ||
        "get" in descriptor || "set" in descriptor) {
      throw fail(`${description}.${key} is not an own GoScript data property`);
    }
  }
  if (descriptors.get("target")?.value !== undefined) {
    throw fail(`${description} has invalid GoScript slice bounds or backing`);
  }
  const backingValue = descriptors.get("backing")?.value;
  if (!isNativeArray(backingValue)) {
    throw fail(`${description} has invalid GoScript slice bounds or backing`);
  }
  const backing = snapshotNativeArray(backingValue, `${description}.backing`);
  const offset = copy.offset;
  const length = copy.length;
  const capacity = copy.capacity;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0 ||
      !Number.isSafeInteger(capacity) || capacity < length || capacity > backing.length ||
      offset > backing.length - capacity) {
    throw fail(`${description} has invalid GoScript slice bounds or backing`);
  }
  return copyArrayWindow(backing, offset, length);
}

function childPath(parent, index) {
  return parent === "" ? String(index) : `${parent}/${index}`;
}

function pathIndexes(path) {
  if (path === "") return [];
  if (typeof path !== "string") throw fail("binding Path must be a string");
  return path.split("/").map((part) => {
    if (!/^(0|[1-9][0-9]*)$/.test(part)) throw fail(`binding Path ${JSON.stringify(path)} is not canonical`);
    const index = Number(part);
    if (!Number.isSafeInteger(index)) throw fail(`binding Path ${JSON.stringify(path)} is out of range`);
    return index;
  });
}

function exactKeys(value, expected, description, allowGoStructMarker = false) {
  const { copy } = copyOwnDataProperties(value, description, allowGoStructMarker, expected);
  return copy;
}

function normalizeView(value) {
  if (!isRecord(value)) throw fail("View must be a Node or View object");
  const snapshot = copyOwnDataProperties(value, "View or Node", true);
  if (snapshot.keys.includes("Tree") || snapshot.keys.includes("Bindings")) {
    const view = exactKeys(snapshot.copy, ["Tree", "Bindings"], "View", false);
    return { Tree: view.Tree, Bindings: view.Bindings };
  }
  return { Tree: snapshot.copy, Bindings: null };
}

function validateAttributeName(name, path) {
  if (typeof name !== "string" || !/^[a-z][a-z0-9:_-]*$/.test(name)) {
    throw fail(`invalid attribute name ${JSON.stringify(name)} at ${path || "<root>"}`);
  }
  const lowered = name.toLowerCase();
  if (lowered.startsWith("on") || RESERVED_ATTRIBUTES.has(lowered)) {
    throw fail(`reserved attribute ${JSON.stringify(name)} at ${path || "<root>"}`);
  }
}

function validateTree(tree) {
  const active = new WeakSet();
  const indexed = new Map();

  function visit(rawNode, path) {
    if (!isRecord(rawNode)) throw fail(`Node at ${path || "<root>"} must be an object`);
    if (active.has(rawNode)) throw fail(`Node tree contains a cycle at ${path || "<root>"}`);
    const node = exactKeys(rawNode, ["Kind", "Tag", "Key", "Attrs", "On", "Kids", "Text"], `Node at ${path || "<root>"}`, true);
    if (![ELEMENT, TEXT, FRAGMENT].includes(node.Kind)) {
      throw fail(`unsupported Node.Kind ${JSON.stringify(node.Kind)} at ${path || "<root>"}`);
    }
    if (typeof node.Tag !== "string" || typeof node.Key !== "string" || typeof node.Text !== "string") {
      throw fail(`Node.Tag, Node.Key and Node.Text must be strings at ${path || "<root>"}`);
    }

    let attrs = node.Attrs === null ? null : listOrEmpty(node.Attrs, "Node.Attrs");
    let handlers = node.On === null ? null : listOrEmpty(node.On, "Node.On");
    const rawKids = node.Kids === null ? null : listOrEmpty(node.Kids, "Node.Kids");
    const where = path || "<root>";
    active.add(rawNode);

    if (node.Kind === TEXT) {
      if (node.Tag !== "" || node.Key !== "" || (attrs?.length ?? 0) !== 0 ||
          (handlers?.length ?? 0) !== 0 || (rawKids?.length ?? 0) !== 0) {
        throw fail(`text Node at ${where} cannot have a tag, key, attributes, handlers or children`);
      }
    } else if (node.Kind === FRAGMENT) {
      if (node.Tag !== "" || node.Text !== "" || (attrs?.length ?? 0) !== 0 || (handlers?.length ?? 0) !== 0) {
        throw fail(`fragment Node at ${where} can contain only a key and children`);
      }
    } else {
      if (!/^[a-z][a-z0-9-]*$/.test(node.Tag)) throw fail(`invalid HTML tag ${JSON.stringify(node.Tag)} at ${where}`);
      if (node.Text !== "") throw fail(`element Node at ${where} cannot also contain Text`);
      const seenAttrs = new Set();
      if (attrs !== null) {
        attrs = attrs.map((rawAttr) => {
          const attr = exactKeys(rawAttr, ["Name", "Value", "Flag", "Style"], `Attr at ${where}`, true);
          validateAttributeName(attr.Name, where);
          if (seenAttrs.has(attr.Name)) throw fail(`duplicate attribute ${JSON.stringify(attr.Name)} at ${where}`);
          seenAttrs.add(attr.Name);
          if (typeof attr.Value !== "string" || typeof attr.Flag !== "boolean") {
            throw fail(`Attr.Value and Attr.Flag have invalid types at ${where}`);
          }
          let styles = attr.Style === null ? null : listOrEmpty(attr.Style, "Attr.Style");
          if (attr.Name === "style") {
            if (attr.Flag || attr.Value !== "") throw fail(`style at ${where} must use Style declarations only`);
            if (styles !== null) {
              styles = styles.map((rawStyle) => {
                const style = exactKeys(rawStyle, ["Property", "Value"], `Style at ${where}`, true);
                if (typeof style.Property !== "string" || typeof style.Value !== "string" || style.Property === "") {
                  throw fail(`Style.Property and Style.Value must be non-empty/string at ${where}`);
                }
                return { Property: style.Property, Value: style.Value };
              });
            }
          } else if ((styles?.length ?? 0) !== 0) {
            throw fail(`Attr.Style is only valid for style at ${where}`);
          }
          if (attr.Flag && !BOOLEAN_ATTRIBUTES.has(attr.Name) &&
              !attr.Name.startsWith("data-") && !attr.Name.startsWith("aria-")) {
            throw fail(`Flag is unsupported for attribute ${JSON.stringify(attr.Name)} at ${where}`);
          }
          if (attr.Name === "checked" && node.Tag !== "input") {
            throw fail(`checked is only supported on input at ${where}`);
          }
          return { Name: attr.Name, Value: attr.Value, Flag: attr.Flag, Style: styles };
        });
      }

      const seenEvents = new Set();
      if (handlers !== null) {
        handlers = handlers.map((rawHandler) => {
          const handler = exactKeys(rawHandler, ["Event", "Message", "Arg"], `On handler at ${where}`, true);
          if (typeof handler.Event !== "string" || !Object.hasOwn(eventNames, handler.Event)) {
            throw fail(`unsupported event ${JSON.stringify(handler.Event)} at ${where}`);
          }
          if (typeof handler.Message !== "string" || handler.Message === "" || typeof handler.Arg !== "string") {
            throw fail(`On.Message and On.Arg must be strings with a non-empty Message at ${where}`);
          }
          if (seenEvents.has(handler.Event)) throw fail(`duplicate event ${JSON.stringify(handler.Event)} at ${where}`);
          seenEvents.add(handler.Event);
          return { Event: handler.Event, Message: handler.Message, Arg: handler.Arg };
        });
      }
    }

    const kids = rawKids === null ? null : rawKids.map((kid, index) => visit(kid, childPath(path, index)));
    const siblingKeys = new Set();
    for (let index = 0; index < (kids?.length ?? 0); index += 1) {
      const child = kids[index];
      if ([ELEMENT, FRAGMENT].includes(child.Kind) && child.Key !== "") {
        if (siblingKeys.has(child.Key)) {
          throw fail(`duplicate sibling key ${JSON.stringify(child.Key)} at ${childPath(path, index) || "<root>"}`);
        }
        siblingKeys.add(child.Key);
      }
    }

    const normalizedNode = {
      Kind: node.Kind,
      Tag: node.Tag,
      Key: node.Key,
      Attrs: attrs,
      On: handlers,
      Kids: kids,
      Text: node.Text,
    };
    indexed.set(path, normalizedNode);
    active.delete(rawNode);
    return normalizedNode;
  }

  const normalizedTree = visit(tree, "");
  return { tree: normalizedTree, nodesByPath: indexed };
}

function validateBindings(view, nodesByPath) {
  const rawBindings = view.Bindings === null ? [] : listOrEmpty(view.Bindings, "View.Bindings");
  const seen = new Set();
  const bindings = [];
  for (const rawBinding of rawBindings) {
    const binding = exactKeys(rawBinding, ["Path", "Event", "Message", "Source"], "Binding", true);
    if (typeof binding.Path !== "string" || typeof binding.Event !== "string" ||
        typeof binding.Message !== "string" || binding.Message === "" || typeof binding.Source !== "string") {
      throw fail("Binding fields have invalid types or an empty Message");
    }
    pathIndexes(binding.Path);
    const key = `${binding.Path}\u0000${binding.Event}`;
    if (seen.has(key)) throw fail(`duplicate binding for ${JSON.stringify(binding.Path)} and ${JSON.stringify(binding.Event)}`);
    seen.add(key);
    if (!Object.hasOwn(eventNames, binding.Event)) throw fail(`unsupported binding event ${JSON.stringify(binding.Event)}`);
    if (binding.Source !== "target.value" && binding.Source !== "target.checked") {
      throw fail(`unsupported binding source ${JSON.stringify(binding.Source)}`);
    }
    const node = nodesByPath.get(binding.Path);
    if (!node || node.Kind !== ELEMENT || node.Tag !== "input") {
      throw fail(`binding target at ${JSON.stringify(binding.Path)} must be an input element`);
    }
    const attrs = node.Attrs ?? [];
    const attrValues = new Map(attrs.map((attr) => [attr.Name, attr]));
    if (binding.Source === "target.value") {
      if (binding.Event !== "input") throw fail("target.value bindings must use the input event");
      if (attrValues.get("type")?.Value !== "text" || attrValues.get("type")?.Flag !== false) {
        throw fail(`target.value binding at ${JSON.stringify(binding.Path)} requires input type=text`);
      }
      if (!attrValues.has("value") || attrValues.get("value").Flag) {
        throw fail(`target.value binding at ${JSON.stringify(binding.Path)} requires a string value attribute`);
      }
    } else {
      if (binding.Event !== "change") throw fail("target.checked bindings must use the change event");
      if (attrValues.get("type")?.Value !== "checkbox" || attrValues.get("type")?.Flag !== false) {
        throw fail(`target.checked binding at ${JSON.stringify(binding.Path)} requires input type=checkbox`);
      }
      const checked = attrValues.get("checked");
      if (checked && (!checked.Flag || checked.Value !== "")) {
        throw fail(`target.checked state at ${JSON.stringify(binding.Path)} must use a checked flag`);
      }
    }
    for (const handler of node.On ?? []) {
      if (handler.Event === binding.Event) {
        throw fail(`binding collides with literal ${JSON.stringify(binding.Event)} handler at ${JSON.stringify(binding.Path)}`);
      }
    }
    bindings.push({ Path: binding.Path, Event: binding.Event, Message: binding.Message, Source: binding.Source });
  }
  return bindings;
}

function normalizeAndValidate(viewValue) {
  const inputView = normalizeView(viewValue);
  const { tree, nodesByPath } = validateTree(inputView.Tree);
  const bindings = validateBindings(inputView, nodesByPath);
  const view = { Tree: tree, Bindings: inputView.Bindings === null ? null : bindings };
  return { view, nodesByPath, bindings };
}

function emptyArrays(value) {
  return listOrEmpty(value, "Go slice");
}

function identityFor(parentIdentity, node, path) {
  const segment = path === "" ? "root" : path.slice(path.lastIndexOf("/") + 1);
  const part = node.Key === "" ? `@${segment}` : node.Key;
  return [...parentIdentity, part];
}

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

function nodeRecord(node) {
  return {
    kind: node.Kind,
    tag: node.Tag,
    key: node.Key,
    attrs: node.Attrs == null ? null : listOrEmpty(node.Attrs, "Node.Attrs").map((attr) => ({
      name: attr.Name,
      value: attr.Value,
      flag: attr.Flag,
      style: attr.Style == null ? null : listOrEmpty(attr.Style, "Attr.Style").map((style) => ({ property: style.Property, value: style.Value })),
    })),
    on: node.On == null ? null : listOrEmpty(node.On, "Node.On").map((handler) => ({ event: handler.Event, message: handler.Message, arg: handler.Arg })),
    kids: node.Kids == null ? null : listOrEmpty(node.Kids, "Node.Kids").map(nodeRecord),
    text: node.Text,
  };
}

function bindingRecord(binding) {
  return { path: binding.Path, event: binding.Event, message: binding.Message, source: binding.Source };
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

