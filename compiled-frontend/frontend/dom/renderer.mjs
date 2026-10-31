import { createViewTools, ELEMENT, TEXT, FRAGMENT } from "../shared/view.mjs";
import { booleanAttributes, eventNames } from "../react/react-map.gen.mjs";

const FORM_CONTROLS = new Set(["button", "input", "select", "textarea"]);
const viewTools = createViewTools({ rendererName: "compiled DOM renderer", eventNames, booleanAttributes });
const {
  fail, isRecord, exactKeys, normalizeAndValidate, emptyArrays,
  identityFor, childPath, nodeRecord, bindingRecord,
} = viewTools;

function identityKey(parts) {
  return JSON.stringify(parts);
}

function cssPropertyName(property) {
  if (property.startsWith("--")) return property;
  if (property.startsWith("-")) return property;
  const kebab = property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return /^(?:ms|webkit|moz|o)-/.test(kebab) ? `-${kebab}` : kebab;
}

function styleDeclarations(attr) {
  const result = [];
  for (const declaration of emptyArrays(attr.Style)) {
    const value = declaration.Value.trim();
    if (value !== "") result.push([cssPropertyName(declaration.Property), value]);
  }
  return result;
}

function attributeValue(attr) {
  if (!attr.Flag) return attr.Value;
  return attr.Name.startsWith("data-") || attr.Name.startsWith("aria-") ? "true" : "";
}

function attributesInDOMOrder(node) {
  const attributes = emptyArrays(node.Attrs);
  if (node.Tag !== "input") return attributes;
  const inputProperties = new Set(["type", "value", "checked"]);
  return [
    ...attributes.filter((attr) => !inputProperties.has(attr.Name)),
    ...attributes.filter((attr) => attr.Name === "type"),
    ...attributes.filter((attr) => attr.Name === "value"),
  ];
}

function compatible(instance, node) {
  if (!instance || instance.kind !== node.Kind) return false;
  return node.Kind !== ELEMENT || instance.tag === node.Tag;
}

function makeInstance(document, previous, node, key) {
  if (compatible(previous, node)) return previous;
  if (node.Kind === TEXT) return { kind: TEXT, tag: "", key, dom: document.createTextNode(node.Text), listeners: new Map(), attributes: new Set() };
  if (node.Kind === FRAGMENT) return { kind: FRAGMENT, tag: "", key, dom: null, listeners: new Map(), attributes: new Set() };
  return { kind: ELEMENT, tag: node.Tag, key, dom: document.createElement(node.Tag), listeners: new Map(), attributes: new Set() };
}

function applyAttributes(instance, node, binding) {
  const element = instance.dom;
  const nextAttributes = new Set();
  const hasChecked = node.Tag === "input" && emptyArrays(node.Attrs).some((attr) => attr.Name === "checked");
  let hasValue = false;
  for (const attr of attributesInDOMOrder(node)) {
    if (attr.Name === "style") {
      const declarations = styleDeclarations(attr);
      if (declarations.length === 0) continue;
      nextAttributes.add("style");
      element.setAttribute("style", element.getAttribute("style") ?? "");
      for (const property of [...element.style]) element.style.removeProperty(property);
      for (const [property, value] of declarations) element.style.setProperty(property, value);
      continue;
    }
    nextAttributes.add(attr.Name);
    element.setAttribute(attr.Name, attributeValue(attr));
    if (attr.Name === "value") hasValue = true;
  }

  if (hasChecked) {
    element.checked = true;
  } else if (binding?.Source === "target.checked") {
    element.checked = false;
  }
  if (hasValue && "value" in element) {
    const value = emptyArrays(node.Attrs).find((attr) => attr.Name === "value");
    element.value = value.Value;
  }
  for (const name of instance.attributes) {
    if (!nextAttributes.has(name)) element.removeAttribute(name);
  }
  instance.attributes = nextAttributes;
}

function bindingMap(bindings) {
  return new Map(bindings.map((binding) => [`${binding.Path}\u0000${binding.Event}`, binding]));
}

function clearListeners(instance) {
  if (!instance.dom) return;
  for (const [eventType, listener] of instance.listeners) instance.dom.removeEventListener(eventType, listener);
  instance.listeners.clear();
}

function createHandler({ node, path, eventType, binding, literal, callbacks, epoch, isCurrent }) {
  return (event) => {
    const target = event?.currentTarget;
    if (!target || target.disabled === true || target.matches?.(":disabled")) return;
    let valueArg;
    let message;
    if (binding) {
      if (binding.Source === "target.value") {
        if (typeof target.value !== "string") throw fail(`input event target at ${path || "<root>"} has no string value`);
        valueArg = target.value;
      } else {
        if (typeof target.checked !== "boolean") throw fail(`checked event target at ${path || "<root>"} has no boolean checked property`);
        valueArg = target.checked ? "true" : "false";
      }
      message = { Name: binding.Message, Arg: valueArg };
    } else {
      valueArg = typeof target.value === "string" ? target.value : "";
      message = { Name: literal.Message, Arg: literal.Arg };
    }
    const action = { path, event: eventType, value: valueArg };
    try {
      if (isCurrent(epoch)) callbacks.dispatch(action, message);
      else callbacks.onStaleAction(action, epoch);
    } catch (error) {
      throw fail(`event callback failed at ${path || "<root>"}`, error);
    }
  };
}

function setListeners(instance, node, path, bindingAt, viewBindings, callbacks, epoch, isCurrent) {
  clearListeners(instance);
  const literals = new Map(emptyArrays(node.On).map((handler) => [handler.Event, handler]));
  const eventTypes = new Set([...literals.keys(), ...viewBindings.filter((binding) => binding.Path === path).map((binding) => binding.Event)]);
  for (const eventType of eventTypes) {
    const binding = bindingAt.get(`${path}\u0000${eventType}`) ?? null;
    const literal = literals.get(eventType) ?? null;
    const listener = createHandler({ node, path, eventType, binding, literal, callbacks, epoch, isCurrent });
    instance.dom.addEventListener(eventType, listener);
    instance.listeners.set(eventType, listener);
  }
}

function childInstances(document, oldInstances, nextInstances, node, path, parentIdentity, bindingAt, bindings, callbacks, epoch, isCurrent, elementByPath, elementByIdentity) {
  const instanceKey = identityKey(identityFor(parentIdentity, node, path));
  const previous = oldInstances.get(instanceKey);
  const instance = makeInstance(document, previous, node, instanceKey);
  nextInstances.set(instanceKey, instance);

  if (node.Kind === TEXT) {
    if (instance.dom.nodeValue !== node.Text) instance.dom.nodeValue = node.Text;
    return [instance.dom];
  }
  if (node.Kind === FRAGMENT) {
    const fragmentIdentity = identityFor(parentIdentity, node, path);
    const children = [];
    emptyArrays(node.Kids).forEach((kid, index) => {
      children.push(...childInstances(document, oldInstances, nextInstances, kid, childPath(path, index), fragmentIdentity,
        bindingAt, bindings, callbacks, epoch, isCurrent, elementByPath, elementByIdentity));
    });
    return children;
  }

  elementByPath.set(path, instance.dom);
  elementByIdentity.set(instanceKey, instance.dom);
  const identityParts = identityFor(parentIdentity, node, path);
  const binding = bindingAt.get(`${path}\u0000input`) ?? bindingAt.get(`${path}\u0000change`) ?? null;
  applyAttributes(instance, node, binding);
  setListeners(instance, node, path, bindingAt, bindings, callbacks, epoch, isCurrent);
  const desiredChildren = [];
  emptyArrays(node.Kids).forEach((kid, index) => {
    desiredChildren.push(...childInstances(document, oldInstances, nextInstances, kid, childPath(path, index), identityParts,
      bindingAt, bindings, callbacks, epoch, isCurrent, elementByPath, elementByIdentity));
  });
  for (let index = 0; index < desiredChildren.length; index += 1) {
    const desired = desiredChildren[index];
    const current = instance.dom.childNodes[index] ?? null;
    if (current !== desired) instance.dom.insertBefore(desired, current);
  }
  while (instance.dom.childNodes.length > desiredChildren.length) {
    instance.dom.removeChild(instance.dom.lastChild);
  }
  return [instance.dom];
}

/** Create a synchronous, keyed native DOM adapter for the generic compiled runtime. */
export function createDOMRenderer({ container, onFailure = null } = {}) {
  if (!container || container.nodeType !== 1 || !container.ownerDocument || typeof container.contains !== "function") {
    throw fail("container must be a DOM element with ownerDocument");
  }
  if (onFailure !== null && typeof onFailure !== "function") throw fail("onFailure must be a function when supplied");

  let active = true;
  let mounted = false;
  let updating = false;
  let current = null;
  let activeEpoch = 0;
  let nextEpoch = 1;
  let hasCommitted = false;
  let lastError = null;
  let instances = new Map();
  let elementByPath = new Map();
  let elementByIdentity = new Map();

  function reportFailure(error) {
    lastError = error instanceof Error ? error : new Error(String(error));
    active = false;
    try {
      onFailure?.(lastError);
    } catch (reportError) {
      lastError = reportError instanceof Error ? reportError : new Error(String(reportError));
    }
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
      // Some browser input types do not support selection restoration.
    }
    return true;
  }

  function update(value, callbacks = {}) {
    if (!active) throw fail("cannot update after unmount or renderer failure", lastError ?? undefined);
    if (updating) throw fail("cannot update reentrantly");
    if (!isRecord(callbacks) || typeof callbacks.dispatch !== "function" || typeof callbacks.onStaleAction !== "function") {
      throw fail("update needs dispatch and onStaleAction callbacks");
    }
    const normalized = normalizeAndValidate(value);
    const { view, bindings } = normalized;
    if (view.Tree.Kind !== ELEMENT) throw fail("outerHTML-v1 browser snapshots require an element view root");
    const focus = focusState();
    const candidateEpoch = nextEpoch++;
    const previous = { current, activeEpoch, instances, elementByPath, elementByIdentity };
    const nextInstances = new Map();
    const nextByPath = new Map();
    const nextByIdentity = new Map();
    const bindingAt = bindingMap(bindings);
    updating = true;
    try {
      const rootIdentity = [];
      const desiredRoots = childInstances(container.ownerDocument, instances, nextInstances, view.Tree, "", rootIdentity,
        bindingAt, bindings, callbacks, candidateEpoch, (epoch) => active && epoch === activeEpoch, nextByPath, nextByIdentity);
      for (let index = 0; index < desiredRoots.length; index += 1) {
        const desired = desiredRoots[index];
        const existing = container.childNodes[index] ?? null;
        if (existing !== desired) container.insertBefore(desired, existing);
      }
      while (container.childNodes.length > desiredRoots.length) container.removeChild(container.lastChild);
      for (const [key, instance] of instances) {
        if (nextInstances.get(key) !== instance) clearListeners(instance);
      }
      current = view;
      instances = nextInstances;
      elementByPath = nextByPath;
      elementByIdentity = nextByIdentity;
      mounted = true;
      hasCommitted = true;
      restoreFocus(focus);
      activeEpoch = candidateEpoch;
      lastError = null;
      return viewRecord();
    } catch (error) {
      current = previous.current;
      activeEpoch = previous.activeEpoch;
      instances = previous.instances;
      elementByPath = previous.elementByPath;
      elementByIdentity = previous.elementByIdentity;
      reportFailure(error);
      throw error;
    } finally {
      updating = false;
    }
  }

  function viewRecord() {
    if (current === null) return null;
    return {
      tree: nodeRecord(current.Tree),
      bindings: current.Bindings == null ? [] : emptyArrays(current.Bindings).map(bindingRecord),
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
    return { normalization: "outerHTML-v1", html: renderedRoot.outerHTML, controls };
  }

  function unmount() {
    if (!active && !mounted && container.childNodes.length === 0) return;
    active = false;
    activeEpoch = 0;
    for (const instance of instances.values()) clearListeners(instance);
    while (container.firstChild) container.removeChild(container.firstChild);
    mounted = false;
    current = null;
    instances = new Map();
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
