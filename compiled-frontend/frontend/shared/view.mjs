export const ELEMENT = 1;
export const TEXT = 2;
export const FRAGMENT = 3;

export function createViewTools({ rendererName = "compiled renderer", eventNames, booleanAttributes } = {}) {
  if (!eventNames || typeof eventNames !== "object" || !Array.isArray(booleanAttributes)) {
    throw new TypeError("view tools need eventNames and booleanAttributes metadata");
  }
  const BOOLEAN_ATTRIBUTES = new Set(booleanAttributes);
  const RESERVED_ATTRIBUTES = new Set(["children", "dangerouslysetinnerhtml", "key", "ref"]);
  const fail = (message, cause) => new Error(`${rendererName}: ${message}`, cause === undefined ? undefined : { cause });
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

function snapshotGoSliceBacking(value, offset, length, capacity, description) {
  if (!isNativeArray(value)) throw fail(`${description} must be a native array`);
  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch (error) {
    throw fail(`${description} own keys could not be inspected`, error);
  }
  const lengthDescriptor = ownDescriptorOf(value, "length", description);
  const backingLength = lengthDescriptor?.value;
  if (!lengthDescriptor || lengthDescriptor.enumerable || !lengthDescriptor.writable || lengthDescriptor.configurable ||
      "get" in lengthDescriptor || "set" in lengthDescriptor || !Number.isSafeInteger(backingLength) || backingLength < 0) {
    throw fail(`${description} has an invalid native array length`);
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0 ||
      !Number.isSafeInteger(capacity) || capacity < length || capacity > backingLength ||
      offset > backingLength - capacity) {
    throw fail(`${description} has invalid GoScript slice bounds or backing`);
  }

  const windowEnd = offset + length;
  const capacityEnd = offset + capacity;
  const symbolKeys = keys.filter((key) => typeof key === "symbol");
  let hasSpareZero = false;
  if (symbolKeys.length > 1) throw fail(`${description} has unsupported symbol properties`);
  if (symbolKeys.length === 1) {
    const key = symbolKeys[0];
    const descriptor = ownDescriptorOf(value, key, description);
    if (key.description !== "goscript.spareZero" || Symbol.keyFor(key) !== undefined) {
      throw fail(`${description} has unsupported symbol properties`);
    }
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
        typeof descriptor.value !== "function" || descriptor.enumerable !== true ||
        descriptor.writable !== true || descriptor.configurable !== true || "get" in descriptor || "set" in descriptor) {
      throw fail(`${description} has invalid GoScript spare-capacity metadata`);
    }
    hasSpareZero = true;
  }

  const descriptors = new Map();
  let visiblePresent = 0;
  let requiredPresent = 0;
  let sparePresent = 0;
  for (const key of keys) {
    if (key === "length" || typeof key === "symbol") continue;
    if (!/^(0|[1-9][0-9]*)$/.test(key)) throw fail(`${description} has unexpected own properties`);
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index >= backingLength) {
      throw fail(`${description} has unexpected own properties`);
    }
    const descriptor = ownDescriptorOf(value, key, description);
    if (!descriptor || !descriptor.enumerable || !descriptor.writable || !descriptor.configurable ||
        "get" in descriptor || "set" in descriptor) {
      throw fail(`${description}[${index}] must be an own data property`);
    }
    descriptors.set(index, descriptor);
    if (index >= offset && index < windowEnd) visiblePresent += 1;
    if (index < windowEnd || index >= capacityEnd) requiredPresent += 1;
    if (index >= windowEnd && index < capacityEnd) sparePresent += 1;
  }
  if (visiblePresent !== length) throw fail(`${description} has a hole in the visible GoSlice window`);
  const requiredLength = backingLength - (capacityEnd - windowEnd);
  if (requiredPresent !== requiredLength) {
    throw fail(`${description} has a hole outside unused GoScript spare capacity`);
  }
  if (sparePresent !== capacity - length && !hasSpareZero) {
    throw fail(`${description} has sparse spare capacity without GoScript spare-capacity metadata`);
  }

  const snapshot = new Array(length);
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors.get(offset + index);
    Object.defineProperty(snapshot, String(index), {
      value: descriptor.value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return snapshot;
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
  const offset = copy.offset;
  const length = copy.length;
  const capacity = copy.capacity;
  return snapshotGoSliceBacking(backingValue, offset, length, capacity, `${description}.backing`);
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
          if (!attr.Flag && BOOLEAN_ATTRIBUTES.has(attr.Name)) {
            throw fail(`boolean attribute ${JSON.stringify(attr.Name)} must use Flag`);
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

  return {
    fail, isRecord, listOrEmpty, childPath, pathIndexes, exactKeys, normalizeAndValidate,
    emptyArrays, identityFor, nodeRecord, bindingRecord,
  };
}
