// ../../../../../tmp/gobi-goscript-3281036908/@goscript/builtin/panic.ts
var GoPanic = class extends Error {
  constructor(value) {
    const text = formatPanicValue(value);
    super(typeof text === "string" ? `panic: ${text}` : "panic:");
    this.value = value;
    if (typeof text !== "string") {
      void Promise.resolve(text).then((resolved) => {
        ;
        this.message = `panic: ${resolved}`;
      });
    }
  }
  value;
  recovered = false;
};
var activeRecoverPanic = null;
function withRecoveringPanic(err, fn) {
  const previous = activeRecoverPanic;
  activeRecoverPanic = asGoPanic(err);
  try {
    return fn();
  } finally {
    activeRecoverPanic = previous;
  }
}
var errorPanics = /* @__PURE__ */ new WeakMap();
function asGoPanic(err) {
  if (err instanceof GoPanic) {
    return err;
  }
  if (!(err instanceof Error) || err.name === "GoexitError" || err.name === "ProcessExitError") {
    return null;
  }
  let goPanic = errorPanics.get(err);
  if (goPanic === void 0) {
    const hasError = typeof err.Error === "function";
    goPanic = new GoPanic(hasError ? err : err.message);
    errorPanics.set(err, goPanic);
  }
  return goPanic;
}
var RuntimeError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "RuntimeError";
  }
  Error() {
    return this.message;
  }
  // RuntimeError marks the value as a runtime.Error, as in Go.
  RuntimeError() {
  }
};
function panic(...args) {
  const value = args.length === 1 ? args[0] : args;
  throw new GoPanic(value);
}
function runtimePanic(message) {
  throw new GoPanic(new RuntimeError(message));
}
function formatPanicValue(value) {
  if (isThenableText(value)) {
    return value;
  }
  if (value instanceof Error) {
    return value.message;
  }
  if (value !== null && typeof value === "object" && "Error" in value && typeof value.Error === "function") {
    return value.Error();
  }
  return String(value);
}
function isThenableText(value) {
  return value !== null && typeof value === "object" && typeof value.then === "function";
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/builtin/varRef.ts
var pointerAddressStride = 4294967296;
var pointerAddresses = /* @__PURE__ */ new WeakMap();
var addressObjects = new globalThis.Map();
var addressCleanup = new FinalizationRegistry((address) => {
  addressObjects.delete(address);
});
var fieldReferences = /* @__PURE__ */ new WeakMap();
var nextPointerAddress = 1;
function pointerAddress(value) {
  let address = pointerAddresses.get(value);
  if (address === void 0) {
    address = nextPointerAddress * pointerAddressStride;
    nextPointerAddress++;
    pointerAddresses.set(value, address);
    addressObjects.set(address, new WeakRef(value));
    addressCleanup.register(value, address);
  }
  return address;
}
function refPointer(ref, address) {
  return {
    __goOwnedPointer: true,
    __goAddress: address,
    __goRef: () => ref
  };
}
var VariableRef = class {
  constructor(value) {
    this.value = value;
  }
  value;
  __isVarRef = true;
  pointer;
  get __goPointer() {
    return this.pointer ??= refPointer(this, () => pointerAddress(this));
  }
  get __goAddress() {
    return this.__goPointer.__goAddress;
  }
};
var FieldReference = class {
  constructor(target, key) {
    this.target = target;
    this.key = key;
  }
  target;
  key;
  __isVarRef = true;
  pointer;
  get value() {
    return this.target[this.key];
  }
  set value(value) {
    this.target[this.key] = value;
  }
  get __goPointer() {
    return this.pointer ??= refPointer(this, () => pointerAddress(this));
  }
  get __goAddress() {
    return this.__goPointer.__goAddress;
  }
};
function varRef(v) {
  return new VariableRef(v);
}
function fieldRef(target, key) {
  if (target === lastFieldTarget && key === lastFieldKey) {
    return lastFieldRef;
  }
  const ref = fieldRefLookup(target, key);
  lastFieldTarget = target;
  lastFieldKey = key;
  lastFieldRef = ref;
  return ref;
}
var lastFieldTarget;
var lastFieldKey;
var lastFieldRef;
function fieldRefLookup(target, key) {
  let references = fieldReferences.get(target);
  if (references === void 0) {
    references = new globalThis.Map();
    fieldReferences.set(target, references);
  }
  const existing = references.get(key);
  if (existing !== void 0) return existing;
  const ref = new FieldReference(target, key);
  references.set(key, ref);
  return ref;
}
function isVarRef(v) {
  return v !== null && typeof v === "object" && v.__isVarRef === true;
}
function isOwnedPointerHandle(value) {
  return value !== null && typeof value === "object" && value.__goOwnedPointer === true;
}
function ownedPointerFromRef(ref) {
  return ref.__goPointer;
}
function ownedPointerAddress(pointer) {
  return pointer.__goAddress();
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/builtin/type.ts
function methodSignature(name, args = [], returns = [], pointerReceiver = false, variadic = false) {
  const signature = {
    name,
    args: methodParameters(args, "_p"),
    returns: methodParameters(returns, "_r")
  };
  if (pointerReceiver) {
    signature.pointerReceiver = true;
  }
  if (variadic) {
    signature.variadic = true;
  }
  return signature;
}
function methodParameters(parameters, prefix) {
  return parameters.map(
    (parameter, index2) => isArrayOrGoSlice(parameter) ? { name: parameter[0], type: parameter[1] } : { name: prefix + index2, type: parameter }
  );
}
function basicType(name, typeName) {
  const info = { kind: "basic" /* Basic */, name };
  if (typeName !== void 0) info.typeName = typeName;
  return info;
}
function sliceType(elemType, typeName) {
  const info = { kind: "slice" /* Slice */, elemType };
  if (typeName !== void 0) info.typeName = typeName;
  return info;
}
function isStructTypeInfo(info) {
  return info.kind === "struct" /* Struct */;
}
function isInterfaceTypeInfo(info) {
  return info.kind === "interface" /* Interface */;
}
function isPointerTypeInfo(info) {
  return info.kind === "pointer" /* Pointer */;
}
function isFunctionTypeInfo(info) {
  return info.kind === "function" /* Function */;
}
var typeRegistry = /* @__PURE__ */ new Map();
var duplicateTypeRegistry = /* @__PURE__ */ new Map();
var typeRegistryGeneration = 0;
function typeRegistryVersion() {
  return typeRegistryGeneration;
}
function registerTypeInfo(name, typeInfo) {
  typeRegistryGeneration++;
  const existing = typeRegistry.get(name);
  if (existing && existing !== typeInfo) {
    const candidates = duplicateTypeRegistry.get(name) ?? [existing];
    if (!candidates.includes(typeInfo)) {
      candidates.push(typeInfo);
    }
    duplicateTypeRegistry.set(name, candidates);
  }
  typeRegistry.set(name, typeInfo);
}
var typePackagePaths = /* @__PURE__ */ new Map();
function registerTypePackagePath(pkgPath, typeNames) {
  for (const typeName of typeNames) {
    typePackagePaths.set(typeName, pkgPath);
  }
}
function typePackagePath(typeName) {
  const bracket = typeName.indexOf("[");
  const baseName = bracket >= 0 ? typeName.substring(0, bracket) : typeName;
  const registered = typePackagePaths.get(baseName);
  if (registered !== void 0) {
    return registered;
  }
  const dotIndex = baseName.lastIndexOf(".");
  return dotIndex > 0 ? baseName.substring(0, dotIndex) : "";
}
function goTypeString(name) {
  return name.includes("\xB7") ? name.replace(/·[0-9a-z]+/g, "") : name;
}
var registerStructType = (name, zeroValue, methods, ctor, fields = []) => {
  const typeInfo = {
    name,
    kind: "struct" /* Struct */,
    zeroValue,
    get methods() {
      if (typeof methods === "function") methods = methods();
      return methods;
    },
    set methods(value) {
      methods = value;
    },
    ctor,
    get fields() {
      if (typeof fields === "function") fields = fields();
      return fields;
    },
    set fields(value) {
      fields = value;
    }
  };
  registerTypeInfo(name, typeInfo);
  return typeInfo;
};
var registerInterfaceType = (name, zeroValue, methods) => {
  const typeInfo = {
    name,
    kind: "interface" /* Interface */,
    zeroValue,
    methods
  };
  registerTypeInfo(name, typeInfo);
  return typeInfo;
};
registerInterfaceType("error", null, [
  {
    name: "Error",
    args: [],
    returns: [{ type: { kind: "basic" /* Basic */, name: "string" } }]
  }
]);
var getTypeByName = (name) => {
  return typeRegistry.get(name);
};
function resolveTypeInfo(info) {
  return typeof info === "string" ? getTypeByName(info) : info;
}
function normalizeTypeInfo(info) {
  if (typeof info === "string") {
    const typeInfo = typeRegistry.get(info);
    if (typeInfo) {
      return typeInfo;
    }
    return {
      kind: "basic" /* Basic */,
      name: info
    };
  }
  return info;
}
function isTypeInfoComparable(info) {
  const normalized = normalizeTypeInfo(info);
  switch (normalized.kind) {
    case "map" /* Map */:
    case "slice" /* Slice */:
    case "function" /* Function */:
      return false;
    case "array" /* Array */:
      return normalized.elemType === void 0 || isTypeInfoComparable(normalized.elemType);
    case "struct" /* Struct */:
      return normalized.fields.every(
        (field) => isTypeInfoComparable(field.type)
      );
    default:
      return true;
  }
}
function structFieldRuntimeKey(field) {
  return field.key || field.name;
}
var structValueMarker = "__goStructValue";
function ownKeys(value) {
  const keys = Object.keys(value);
  const i = keys.lastIndexOf(structValueMarker);
  if (i >= 0) {
    keys.splice(i, 1);
  }
  return keys;
}
function markAsStructValue(value) {
  if (typeof value === "object" && value !== null) {
    ;
    value[structValueMarker] = true;
  }
  return value;
}
var ANONYMOUS_STRUCT_TYPE = /* @__PURE__ */ Symbol("anonymousStructType");
function anonymousStructValue(value, typeInfo) {
  ;
  value[ANONYMOUS_STRUCT_TYPE] = typeInfo;
  return markAsStructValue(value);
}
function isStructObject(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const info = value.constructor?.__typeInfo;
  if (info === void 0) {
    return false;
  }
  if (typeof info === "object") {
    return info.kind === "struct" /* Struct */;
  }
  return resolveTypeInfo(info)?.kind === "struct" /* Struct */;
}
function structValueTypeInfo(value) {
  if (typeof value !== "object" || value === null) {
    return void 0;
  }
  return value.constructor?.__typeInfo ?? value[ANONYMOUS_STRUCT_TYPE];
}
function cloneAnonymousStruct(value, typeInfo) {
  const info = normalizeTypeInfo(typeInfo);
  const clone = { ...value };
  if (info.kind === "struct" /* Struct */) {
    for (const field of info.fields) {
      const key = structFieldRuntimeKey(field);
      const fieldValue = clone[key];
      if (isMarkedAsStructValue(fieldValue)) {
        clone[key] = markAsStructValue(cloneStructValue(fieldValue));
        continue;
      }
      if (normalizeTypeInfo(field.type).kind === "array" /* Array */) {
        clone[key] = cloneArrayValue(fieldValue, field.type);
      }
    }
  }
  return anonymousStructValue(clone, typeInfo);
}
function cloneStructValue(value) {
  if (typeof value === "object" && value !== null) {
    const anonymousType = value[ANONYMOUS_STRUCT_TYPE];
    if (anonymousType !== void 0) {
      return cloneAnonymousStruct(value, anonymousType);
    }
  }
  const cloneable = value;
  if (typeof cloneable.__goscriptClone === "function") {
    return cloneable.__goscriptClone();
  }
  if (typeof cloneable.clone === "function") {
    return cloneable.clone();
  }
  throw new Error("runtime error: value is not cloneable");
}
var pointerIdentities = /* @__PURE__ */ new WeakMap();
function elementPointer(value) {
  if (value.__goElementBacking === void 0) {
    return void 0;
  }
  return value;
}
var elementIdentities = /* @__PURE__ */ new WeakMap();
function elementIdentity(pointer) {
  const backing = pointer.__goElementBacking;
  let identities = elementIdentities.get(backing);
  if (identities === void 0) {
    identities = /* @__PURE__ */ new Map();
    elementIdentities.set(backing, identities);
  }
  const index2 = pointer.__goElementIndex;
  const identity = identities.get(index2);
  if (identity !== void 0) {
    return identity;
  }
  identities.set(index2, pointer);
  return pointer;
}
function sameElement(a, b) {
  return a.__goElementBacking === b.__goElementBacking && a.__goElementIndex === b.__goElementIndex;
}
function canonicalPointerIdentity(value) {
  const identity = pointerIdentities.get(value);
  if (identity !== void 0) {
    return identity;
  }
  const element = elementPointer(value);
  const canonical = element === void 0 ? value : elementIdentity(element);
  pointerIdentities.set(value, canonical);
  return canonical;
}
var pointerAliasesMade = false;
function aliasIdentity(value) {
  const identity = pointerIdentities.get(value);
  if (identity !== void 0) {
    return identity;
  }
  const element = elementPointer(value);
  return element === void 0 ? void 0 : elementIdentity(element);
}
function pointerBackingIdentityEqual(a, b) {
  const aElement = elementPointer(a);
  const bElement = elementPointer(b);
  if (aElement !== void 0 && bElement !== void 0 && sameElement(aElement, bElement)) {
    return true;
  }
  if (!pointerAliasesMade) {
    return false;
  }
  const aIdentity = aliasIdentity(a);
  return aIdentity !== void 0 && aIdentity === aliasIdentity(b);
}
function pointerIdentityEqual(a, b) {
  if (!pointerBackingIdentityEqual(a, b)) {
    return false;
  }
  if ("__goType" in a && "__goType" in b && typeof a.__goType === "string" && typeof b.__goType === "string" && a.__goType !== b.__goType) {
    return false;
  }
  return true;
}
var ARRAY_VALUE_TYPE = /* @__PURE__ */ Symbol("arrayValueType");
function arrayValue(value, typeInfo) {
  ;
  value[ARRAY_VALUE_TYPE] = typeInfo ?? true;
  return value;
}
function isArrayValue(value) {
  return typeof value === "object" && value !== null && ARRAY_VALUE_TYPE in value;
}
function arrayValueTypeInfo(value) {
  const info = value[ARRAY_VALUE_TYPE];
  return info === true ? void 0 : info;
}
function cloneArrayValue(value, typeInfo) {
  if (isTypedSlice(value)) {
    return arrayValue(value.slice());
  }
  if (!isArrayOrGoSlice(value)) {
    return value;
  }
  typeInfo ??= arrayValueTypeInfo(value);
  const info = typeInfo === void 0 ? void 0 : normalizeTypeInfo(typeInfo);
  const element = info?.kind === "array" /* Array */ && info.elemType !== void 0 ? normalizeTypeInfo(info.elemType) : void 0;
  if (element?.kind === "array" /* Array */) {
    return arrayValue(
      value.map((item) => cloneArrayValue(item, element)),
      typeInfo
    );
  }
  if (element?.kind === "struct" /* Struct */) {
    return arrayValue(
      value.map((item) => markAsStructValue(cloneStructValue(item))),
      typeInfo
    );
  }
  return arrayValue(value.slice());
}
function isMarkedAsStructValue(value) {
  return typeof value === "object" && value !== null && structValueMarker in value && value[structValueMarker] === true;
}
function generatedStructClass(value) {
  if (!isMarkedAsStructValue(value)) {
    return void 0;
  }
  const cloneable = value;
  if (ANONYMOUS_STRUCT_TYPE in value || typeof cloneable.__goscriptClone === "function" || typeof cloneable.clone !== "function") {
    return void 0;
  }
  return cloneable.constructor;
}
var structCopy = /* @__PURE__ */ Symbol("structCopy");
function structCopyOf(value) {
  const proto = Object.getPrototypeOf(value);
  if (proto === null || proto === Object.prototype || Array.isArray(value) || ANONYMOUS_STRUCT_TYPE in value) {
    return null;
  }
  let copy2;
  if (typeof proto.__goscriptClone === "function") {
    copy2 = (source) => markClonedStructValue(source.__goscriptClone());
  } else if (typeof proto.clone === "function") {
    copy2 = (source) => markClonedStructValue(source.clone());
  } else {
    return null;
  }
  Object.defineProperty(proto, structCopy, { value: copy2, configurable: true });
  return copy2;
}
function markClonedStructValue(copy2) {
  if (copy2[structValueMarker] !== true) {
    markAsStructValue(copy2);
  }
  return copy2;
}
function copyElement(value) {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return copyObjectElement(value);
}
function copyObjectElement(value) {
  if (value[structValueMarker] === true) {
    let copy2 = value[structCopy];
    if (copy2 === void 0) {
      copy2 = structCopyOf(value);
    }
    if (copy2 !== null) {
      return copy2(value);
    }
  }
  if (ARRAY_VALUE_TYPE in value) {
    return cloneArrayValue(value, arrayValueTypeInfo(value));
  }
  if (!isMarkedAsStructValue(value)) {
    return value;
  }
  const cloneable = value;
  if (!(ANONYMOUS_STRUCT_TYPE in value) && typeof cloneable.__goscriptClone !== "function" && typeof cloneable.clone !== "function") {
    return value;
  }
  return markAsStructValue(cloneStructValue(value));
}
function isTypedNilValue(value) {
  return typeof value === "object" && value !== null && "__isTypedNil" in value && value.__isTypedNil === true && "__goType" in value && typeof value.__goType === "string";
}
function typedNil(typeName, typeInfo) {
  const value = /* @__PURE__ */ Object.create(null);
  value.__goType = typeName;
  value.__isTypedNil = true;
  if (typeInfo !== void 0) {
    Object.defineProperty(value, "__goTypeInfo", {
      value: typeInfo,
      writable: true,
      configurable: true
    });
  }
  return value;
}
function interfaceValue(value, typeName, typeInfo) {
  if (value !== null && value !== void 0) {
    if (typeof value === "function" && typeof typeInfo === "object") {
      if (typeInfo.kind === "function" /* Function */) {
        return typedFunction(value, typeName, typeInfo);
      }
    }
    if (typeof value === "object" && (value.__goType !== typeName || typeInfo !== void 0 && value.__goTypeInfo === void 0)) {
      Object.defineProperty(value, "__goType", {
        value: typeName,
        writable: true,
        configurable: true
      });
      if (typeInfo !== void 0) {
        Object.defineProperty(value, "__goTypeInfo", {
          value: typeInfo,
          writable: true,
          configurable: true
        });
      }
    }
    return value;
  }
  const nilValue = typedNil(typeName, typeInfo);
  if (!typeName.startsWith("*")) {
    return nilValue;
  }
  const dynamicType = typeRegistry.get(typeName.slice(1));
  if (!dynamicType || !isStructTypeInfo(dynamicType) || !dynamicType.ctor) {
    return nilValue;
  }
  const prototype = dynamicType.ctor.prototype;
  for (const method of dynamicType.methods) {
    const implementation = prototype[method.name];
    if (typeof implementation !== "function") {
      continue;
    }
    const wrapper = (...args) => implementation.call(null, ...args);
    wrapper.__goscriptMethodSignature = method;
    Object.defineProperty(nilValue, method.name, {
      value: wrapper,
      enumerable: true
    });
  }
  return nilValue;
}
function basicInterfaceValue(value, typeName, valueTypeName = typeName) {
  let typeInfo = basicBoxTypeInfos.get(valueTypeName);
  if (typeInfo === void 0) {
    typeInfo = { kind: "basic" /* Basic */, name: valueTypeName };
    basicBoxTypeInfos.set(valueTypeName, typeInfo);
  }
  const box = Object.create(basicBoxPrototype);
  box.__goType = typeName;
  box.__goValue = value;
  box.__goTypeInfo = typeInfo;
  return box;
}
var basicBoxTypeInfos = /* @__PURE__ */ new Map();
var namedValueMethodRegistry = /* @__PURE__ */ new Map();
function namedValueMethods(typeName) {
  return namedValueMethodRegistry.get(typeName);
}
var genericInstanceKey = /* @__PURE__ */ Symbol("genericInstance");
var genericInstanceMethodSets = /* @__PURE__ */ new WeakMap();
function genericInstanceMethods(value) {
  if (value === null || typeof value !== "object") {
    return void 0;
  }
  const describe = value[genericInstanceKey];
  if (describe === void 0) {
    return void 0;
  }
  let sets = genericInstanceMethodSets.get(describe);
  if (sets === void 0) {
    const [methods, signatures] = describe();
    sets = {
      pointer: { methods, signatures },
      value: valueMethodSet(methods, signatures)
    };
    genericInstanceMethodSets.set(describe, sets);
  }
  return sets;
}
function valueMethodSet(methods, signatures) {
  const valueMethods = {};
  const valueSignatures = signatures.filter((sig) => !sig.pointerReceiver);
  for (const sig of valueSignatures) {
    if (methods[sig.name] !== void 0) {
      valueMethods[sig.name] = methods[sig.name];
    }
  }
  return { methods: valueMethods, signatures: valueSignatures };
}
function namedValueInterfaceValue(value, typeName, methods, typeInfo, methodSignatures) {
  const proto = methodSignatures !== void 0 ? namedValueBoxPrototype(methods) : void 0;
  if (proto !== void 0) {
    const box = Object.create(proto);
    box.__goType = typeName;
    box.__goValue = value;
    box.__goTypeInfo = typeInfo;
    return box;
  }
  const boxed = {
    __goType: typeName,
    __goValue: value,
    __goTypeInfo: typeInfo,
    valueOf: () => value,
    toString: () => String(value),
    [Symbol.toPrimitive]: () => value
  };
  for (const entry of namedValueMethodEntries(
    methods,
    typeInfo,
    methodSignatures
  )) {
    const method = entry.method;
    const wrapper = (...args) => method(value, ...args);
    wrapper.__goscriptMethodWrapper = true;
    if (entry.signature) {
      wrapper.__goscriptMethodSignature = entry.signature;
    }
    boxed[entry.name] = wrapper;
  }
  return boxed;
}
var namedValueBoxPrototypes = /* @__PURE__ */ new WeakMap();
var namedValueBoxMarker = /* @__PURE__ */ Symbol("namedValueBox");
var basicBoxPrototype = {
  valueOf() {
    return this.__goValue;
  },
  toString() {
    return String(this.__goValue);
  },
  [Symbol.toPrimitive]() {
    return this.__goValue;
  },
  [namedValueBoxMarker]: true
};
function namedValueBoxMethod(entry) {
  const method = entry.method;
  if (entry.signature !== void 0 && entry.signature.args.length === 0) {
    return function() {
      return method(this.__goValue);
    };
  }
  return function(...args) {
    return method(this.__goValue, ...args);
  };
}
function namedValueBoxPrototype(methods) {
  let proto = namedValueBoxPrototypes.get(methods);
  if (proto !== void 0) {
    return proto;
  }
  const entries = namedValueMethodCache.get(methods);
  if (entries === void 0) {
    return void 0;
  }
  const p = {
    valueOf() {
      return this.__goValue;
    },
    toString() {
      return String(this.__goValue);
    },
    [Symbol.toPrimitive]() {
      return this.__goValue;
    },
    [namedValueBoxMarker]: true
  };
  for (const entry of entries) {
    const wrapper = namedValueBoxMethod(entry);
    wrapper.__goscriptMethodWrapper = true;
    if (entry.signature) {
      wrapper.__goscriptMethodSignature = entry.signature;
    }
    p[entry.name] = wrapper;
  }
  namedValueBoxPrototypes.set(methods, p);
  return p;
}
var namedValueMethodCache = /* @__PURE__ */ new WeakMap();
function namedValueMethodEntries(methods, typeInfo, methodSignatures) {
  const cached = namedValueMethodCache.get(methods);
  if (cached !== void 0) {
    return cached;
  }
  const entries = Object.entries(methods).map(([name, method]) => ({
    name,
    method,
    signature: methodSignatures?.find((candidate) => candidate.name === name) ?? wrapperMethodSignatureFromTypeInfo(name, typeInfo) ?? void 0
  }));
  if (methodSignatures !== void 0) {
    namedValueMethodCache.set(methods, entries);
  }
  return entries;
}
function isNamedValueBox(v) {
  return typeof v === "object" && v !== null && "__goValue" in v && typeof v.__goType === "string";
}
function wrapperMethodSignatureFromTypeInfo(name, typeInfo) {
  if (typeof typeInfo === "string") {
    typeInfo = typeRegistry.get(typeInfo);
  }
  if (!typeInfo) {
    return null;
  }
  if (isFunctionTypeInfo(typeInfo)) {
    return {
      name,
      args: (typeInfo.params ?? []).map((type) => ({ type })),
      returns: (typeInfo.results ?? []).map((type) => ({ type }))
    };
  }
  if (isStructTypeInfo(typeInfo) || isInterfaceTypeInfo(typeInfo)) {
    return typeInfo.methods.find((method) => method.name === name) ?? null;
  }
  return null;
}
function typedFunction(fn, typeName, typeInfo) {
  const name = typeInfo ? typeInfo.name : typeName;
  const currentInfo = Reflect.get(
    fn,
    "__typeInfo"
  );
  const currentName = Reflect.get(fn, "__goTypeName") ?? currentInfo?.name;
  if (currentName === name && (currentInfo !== void 0 || typeInfo === void 0)) {
    return fn;
  }
  const wrapper = Object.assign(fn.bind(null), {
    __goTypeName: name,
    __typeInfo: typeInfo,
    __goTarget: Reflect.get(fn, "__goTarget") ?? fn
  });
  const goName = Reflect.get(fn, "__goFuncName");
  if (goName !== void 0) {
    Reflect.set(wrapper, "__goFuncName", goName);
  }
  const twin = Reflect.get(fn, "__goReflectTwin");
  if (typeof twin === "function") {
    setReflectTwin(wrapper, twin);
  }
  return wrapper;
}
function functionValue(fn, typeInfo, goName) {
  Object.assign(
    fn,
    typeInfo.name ? { __typeInfo: typeInfo, __goTypeName: typeInfo.name } : { __typeInfo: typeInfo }
  );
  if (goName !== void 0) {
    Reflect.set(fn, "__goFuncName", goName);
  }
  return fn;
}
var reflectTwinSuffix = "$reflect";
function setReflectTwin(fn, twin) {
  Reflect.set(fn, "__goReflectTwin", twin);
}
function reflectTwin(fn) {
  const twin = Reflect.get(fn, "__goReflectTwin");
  return typeof twin === "function" ? twin : fn;
}
function bindReflectMethod(receiver, name, method) {
  const bound = method.bind(receiver);
  const twin = Reflect.get(receiver, name + reflectTwinSuffix);
  if (typeof twin === "function") {
    setReflectTwin(bound, twin.bind(receiver));
  }
  return bound;
}
function functionAddress(fn) {
  const target = Reflect.get(fn, "__goTarget");
  return pointerAddress(typeof target === "function" ? target : fn);
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/builtin/slice.ts
var asciiText = /^[\x00-\x7f]*$/;
var sharedTextEncoder = new TextEncoder();
var sharedTextDecoder = new TextDecoder("utf-8");
function jsString(str) {
  if (str === null || str === void 0) {
    return "";
  }
  if (asciiText.test(str) || nonByteText.test(str)) {
    return str;
  }
  return sharedTextDecoder.decode(goStringBytes(str));
}
var nonByteText = /[^\x00-\xff]/;
function goStringComparableBytes(value) {
  if (typeof value === "string") {
    return goStringBytes(value);
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value === null || value === void 0) {
    return new Uint8Array(0);
  }
  return Uint8Array.from(asArray(value));
}
function sliceMeta(slice) {
  return slice.__meta__;
}
var emptySliceRange = { backing: [], offset: 0, length: 0 };
function sliceRange(slice) {
  if (slice instanceof GoSlice) {
    return slice;
  }
  if (Array.isArray(slice) && slice.__meta__ === void 0) {
    return { backing: slice, offset: 0, length: slice.length };
  }
  return sliceRangeSlow(slice);
}
function sliceRangeSlow(slice) {
  if (slice === null || slice === void 0) {
    return emptySliceRange;
  }
  if (slice instanceof GoSlice) {
    return slice;
  }
  if (isTypedSlice(slice)) {
    return { backing: slice, offset: 0, length: slice.length };
  }
  const meta = sliceMeta(slice);
  if (meta !== void 0) {
    return meta;
  }
  return { backing: slice, offset: 0, length: slice.length };
}
var addressStride = 4294967296;
var nextAddressBase = 1;
var addressBases = /* @__PURE__ */ new WeakMap();
var byteAddressSources = new globalThis.Map();
var GoSlice = class {
  constructor(backing, offset, length, capacity) {
    this.backing = backing;
    this.offset = offset;
    this.length = length;
    this.capacity = capacity;
  }
  backing;
  offset;
  length;
  capacity;
  target;
  get __meta__() {
    return this;
  }
  *[Symbol.iterator]() {
    for (let i = 0; i < this.length; i++) {
      yield this.backing[this.offset + i];
    }
  }
  // window returns a copy of the elements of the slice, as a plain array
  // also when its backing array is a typed array.
  window() {
    const end = this.offset + this.length;
    return isTypedSlice(this.backing) ? Array.from(this.backing.subarray(this.offset, end)) : this.backing.slice(this.offset, end);
  }
  slice(start, end) {
    return this.window().slice(start, end);
  }
  map(f) {
    return this.window().map(f);
  }
  filter(f) {
    return this.window().filter(f);
  }
  forEach(f) {
    this.window().forEach(f);
  }
  reduce(f, init) {
    return this.window().reduce(f, init);
  }
  indexOf(value) {
    return this.window().indexOf(value);
  }
  includes(value) {
    return this.window().includes(value);
  }
  join(sep) {
    return this.window().join(sep);
  }
  every(f) {
    return this.window().every(f);
  }
  some(f) {
    return this.window().some(f);
  }
  // sort sorts the window in place, as Array.prototype.sort does.
  sort(compare) {
    const sorted = this.window().sort(compare);
    for (let i = 0; i < sorted.length; i++) {
      this.backing[this.offset + i] = sorted[i];
    }
    return this;
  }
};
function sliceElems(slice) {
  if (slice instanceof GoSlice) {
    return slice.backing;
  }
  if (ArrayBuffer.isView(slice)) {
    return slice;
  }
  if (Array.isArray(slice) && slice.__meta__ === void 0) {
    return slice;
  }
  return sliceElemsSlow(slice);
}
function sliceElemsSlow(slice) {
  if (isTypedSlice(slice)) {
    return slice;
  }
  const meta = slice === null ? void 0 : sliceMeta(slice);
  return meta !== void 0 ? meta.backing : slice;
}
function sliceSlot(slice, index2) {
  if (slice instanceof GoSlice) {
    if (index2 >= 0 && index2 < slice.length) {
      return slice.offset + index2;
    }
  } else if (ArrayBuffer.isView(slice)) {
    if (index2 >= 0 && index2 < slice.length) {
      return index2;
    }
  } else if (Array.isArray(slice) && slice.__meta__ === void 0) {
    if (index2 >= 0 && index2 < slice.length) {
      return index2;
    }
  }
  return sliceSlotSlow(slice, index2);
}
function sliceSlotSlow(slice, index2) {
  if (slice === null || slice === void 0) {
    outOfRangeIndex(index2, 0);
  }
  if (isTypedSlice(slice)) {
    if (index2 < 0 || index2 >= slice.length) {
      outOfRangeIndex(index2, slice.length);
    }
    return index2;
  }
  const meta = sliceMeta(slice);
  const length = meta !== void 0 ? meta.length : slice.length;
  if (index2 < 0 || index2 >= length) {
    outOfRangeIndex(index2, length);
  }
  return meta !== void 0 ? meta.offset + index2 : index2;
}
function windowSlot(window, index2) {
  if (index2 < 0 || index2 >= window.length) {
    outOfRangeIndex(index2, window.length);
  }
  return window.offset + index2;
}
function isArrayOrGoSlice(value) {
  return Array.isArray(value) || value instanceof GoSlice;
}
var typedSliceConstructors = {
  byte: Uint8Array,
  int8: Int8Array,
  int16: Int16Array,
  uint16: Uint16Array,
  int32: Int32Array,
  uint32: Uint32Array,
  float32: Float32Array,
  float64: Float64Array
};
function typedSliceConstructor(typeHint) {
  return typeHint === void 0 ? void 0 : typedSliceConstructors[typeHint];
}
var typedSliceHintNames = new globalThis.Map(
  Object.entries(typedSliceConstructors).map(([hint, ctor]) => [ctor, hint])
);
function typedElements(slice) {
  if (slice instanceof GoSlice) {
    const backing = slice.backing;
    return isTypedSlice(backing) ? backing.subarray(slice.offset, slice.offset + slice.length) : void 0;
  }
  return isTypedSlice(slice) ? slice : void 0;
}
function isTypedSlice(value) {
  return ArrayBuffer.isView(value);
}
var TypedSliceHint = class {
  constructor(ctor) {
    this.ctor = ctor;
  }
  ctor;
};
var typedSliceHints = {
  int8: new TypedSliceHint(Int8Array),
  int16: new TypedSliceHint(Int16Array),
  uint16: new TypedSliceHint(Uint16Array),
  int32: new TypedSliceHint(Int32Array),
  uint32: new TypedSliceHint(Uint32Array),
  float32: new TypedSliceHint(Float32Array),
  float64: new TypedSliceHint(Float64Array)
};
function sliceIndexProperty(prop) {
  if (typeof prop !== "string" || prop.length === 0) {
    return -1;
  }
  let index2 = 0;
  for (let i = 0; i < prop.length; i++) {
    const digit = prop.charCodeAt(i) - 48;
    if (digit < 0 || digit > 9) {
      return -1;
    }
    index2 = index2 * 10 + digit;
  }
  return index2;
}
function outOfRangeIndex(index2, length) {
  if (index2 < 0) {
    runtimePanic(`runtime error: index out of range [${index2}]`);
  }
  runtimePanic(
    `runtime error: index out of range [${index2}] with length ${length}`
  );
}
var sliceProxyOwnTraps = {
  getOwnPropertyDescriptor(target, prop) {
    const meta = target.__meta__;
    const index2 = sliceIndexProperty(prop);
    if (index2 >= 0 && index2 < meta.length) {
      return {
        value: meta.backing[meta.offset + index2],
        writable: true,
        enumerable: true,
        configurable: true
      };
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  },
  has(target, prop) {
    const index2 = sliceIndexProperty(prop);
    if (index2 >= 0) {
      return index2 < target.__meta__.length;
    }
    return Reflect.has(target, prop);
  },
  ownKeys(target) {
    const keys = [];
    for (let i = 0; i < target.__meta__.length; i++) {
      keys.push(String(i));
    }
    for (const key of Reflect.ownKeys(target)) {
      if (sliceIndexProperty(key) < 0) {
        keys.push(key);
      }
    }
    return keys;
  }
};
var arrayViewProxyHandler = {
  ...sliceProxyOwnTraps,
  get(target, prop, receiver) {
    const meta = target.__meta__;
    if (prop === "__meta__") {
      return meta;
    }
    const index2 = sliceIndexProperty(prop);
    if (index2 >= 0) {
      if (index2 < meta.length) {
        return meta.backing[meta.offset + index2];
      }
      runtimePanic(`Slice index out of range: ${index2} >= ${meta.length}`);
    }
    if (prop === "length") {
      return meta.length;
    }
    if (prop === "sort") {
      return sliceProxySortMethod(meta, receiver);
    }
    if (prop === "slice" || prop === "map" || prop === "filter" || prop === "reduce" || prop === "forEach" || prop === Symbol.iterator) {
      return sliceProxyBackingMethod(meta, prop);
    }
    return Reflect.get(target, prop);
  },
  set(target, prop, value) {
    const meta = target.__meta__;
    const index2 = sliceIndexProperty(prop);
    if (index2 >= 0) {
      if (index2 < meta.length) {
        meta.backing[meta.offset + index2] = value;
        return true;
      }
      if (index2 === meta.length && meta.length < meta.capacity) {
        meta.backing[meta.offset + index2] = value;
        meta.length++;
        return true;
      }
      runtimePanic(`Slice index out of range: ${index2} >= ${meta.length}`);
    }
    if (prop === "length" || prop === "__meta__") {
      return false;
    }
    return Reflect.set(target, prop, value);
  }
};
function sliceProxyBackingMethod(meta, prop) {
  const backingSlice = meta.backing.slice(
    meta.offset,
    meta.offset + meta.length
  );
  const method = Reflect.get(backingSlice, prop);
  if (typeof method === "function") {
    return method.bind(backingSlice);
  }
  return method;
}
function sliceProxySortMethod(meta, receiver) {
  return (compareFn) => {
    const values = meta.backing.slice(meta.offset, meta.offset + meta.length);
    values.sort(compareFn);
    for (let i = 0; i < values.length; i++) {
      meta.backing[meta.offset + i] = values[i];
    }
    return receiver;
  };
}
function sliceProxyFromBacking(backing, offset, length, capacity) {
  return new GoSlice(backing, offset, length, capacity);
}
function asArray(slice) {
  if (slice === null || slice === void 0) {
    return [];
  }
  if (isTypedSlice(slice)) {
    return Array.from(slice);
  }
  if (isComplexSlice(slice)) {
    const result = [];
    for (let i = 0; i < slice.__meta__.length; i++) {
      result.push(slice.__meta__.backing[slice.__meta__.offset + i]);
    }
    return result;
  }
  return slice;
}
function isComplexSlice(slice) {
  return slice !== null && typeof slice === "object" && sliceMeta(slice) !== void 0;
}
function normalizeSliceIndex(value) {
  if (value === void 0) {
    return void 0;
  }
  return Number(value);
}
function typedSliceMeta(slice) {
  return slice.__meta__;
}
function checkTypedSliceBounds(low, high, capacity) {
  if (low < 0 || high < low || low > capacity || high > capacity) {
    runtimePanic(
      `runtime error: slice bounds out of range [${low}:${high}] with capacity ${capacity}`
    );
  }
}
function typedSliceView(backing, offset, length, capacity) {
  if (backing instanceof Uint8Array) {
    return byteSliceView(backing, offset, length, capacity);
  }
  if (offset === 0 && length === capacity && capacity === backing.length) {
    return backing;
  }
  return new GoSlice(
    backing,
    offset,
    length,
    capacity
  );
}
function byteSliceView(backing, offset, length, capacity) {
  const view = backing.subarray(offset, offset + length);
  if (capacity !== length) {
    view.__meta__ = {
      backing,
      offset,
      length,
      capacity
    };
  }
  return view;
}
var makeSlice = (length, capacity, typeHint, zeroFactory) => {
  const typed = typedSliceConstructor(typeHint);
  if (typed !== void 0) {
    return makeTypedSlice(typed, length, capacity);
  }
  const actualCapacity = capacity === void 0 ? length : capacity;
  if (length < 0 || actualCapacity < 0 || length > actualCapacity) {
    runtimePanic(
      actualCapacity < 0 ? "runtime error: makeslice: cap out of range" : "runtime error: makeslice: len out of range"
    );
  }
  const zeroValue = () => {
    if (zeroFactory !== void 0) {
      return zeroFactory();
    }
    switch (typeHint) {
      case "number":
        return 0;
      case "boolean":
        return false;
      case "string":
        return "";
      default:
        return null;
    }
  };
  const backingArr = new Array(actualCapacity);
  for (let i = 0; i < actualCapacity; i++) {
    backingArr[i] = zeroValue();
    if (i === 0 && zeroFactory !== void 0) {
      prepareFloatFields(backingArr[0]);
    }
  }
  if (length === actualCapacity) {
    return backingArr;
  }
  return new GoSlice(backingArr, 0, length, actualCapacity);
};
var preparedStructs = /* @__PURE__ */ new WeakSet();
function prepareFloatFields(zero) {
  const ctor = zero?.constructor;
  if (typeof ctor !== "function" || preparedStructs.has(ctor)) {
    return;
  }
  preparedStructs.add(ctor);
  const info = resolveTypeInfo(structValueTypeInfo(zero));
  if (info === void 0 || info.kind !== "struct" /* Struct */) {
    return;
  }
  const fields = zero;
  for (const field of info.fields) {
    const key = field.key ?? field.name;
    const type = resolveTypeInfo(field.type);
    if (type?.kind === "basic" /* Basic */ && isFloatName(type.name)) {
      fields[key] = 0.5;
      fields[key] = 0;
    } else if (type?.kind === "struct" /* Struct */) {
      prepareFloatFields(fields[key]);
    }
  }
}
function isFloatName(name) {
  return name === "float32" || name === "float64";
}
function makeTypedSlice(ctor, length, capacity) {
  const actualCapacity = capacity === void 0 ? length : capacity;
  if (length < 0 || actualCapacity < 0 || length > actualCapacity) {
    runtimePanic(
      actualCapacity < 0 ? "runtime error: makeslice: cap out of range" : "runtime error: makeslice: len out of range"
    );
  }
  return typedSliceView(new ctor(actualCapacity), 0, length, actualCapacity);
}
function goSlice(s, low, high, max) {
  s = collectionValue(s);
  low = normalizeSliceIndex(low);
  high = normalizeSliceIndex(high);
  max = normalizeSliceIndex(max);
  if (s instanceof GoSlice) {
    const sliced = sliceOfWindow(
      s.backing,
      s.offset,
      s.length,
      s.capacity,
      low,
      high,
      max
    );
    if (sliced !== void 0) {
      return sliced;
    }
  } else if (Array.isArray(s) && s.__meta__ === void 0) {
    const sliced = sliceOfWindow(
      s,
      0,
      s.length,
      s.length,
      low,
      high,
      max
    );
    if (sliced !== void 0) {
      return sliced;
    }
  }
  if (isTypedSlice(s)) {
    return sliceTyped(s, low, high, max);
  }
  if (s === null || s === void 0) {
    low = low ?? 0;
    high = high ?? 0;
    if (low < 0 || high < low) {
      runtimePanic(`runtime error: slice bounds out of range [${low}:${high}]`);
    }
    if (low !== 0 || high !== 0) {
      runtimePanic(
        `runtime error: slice bounds out of range [:${high}] with capacity 0`
      );
    }
    if (max !== void 0 && max !== 0) {
      runtimePanic(
        `runtime error: slice bounds out of range [::${max}] with capacity 0`
      );
    }
    return null;
  }
  const slen = len(s);
  low = low ?? 0;
  high = high ?? slen;
  if (low < 0 || high < low) {
    runtimePanic(`runtime error: slice bounds out of range [${low}:${high}]`);
  }
  const scap = cap(s);
  if (high > scap) {
    runtimePanic(`Slice index out of range: ${high} > ${scap}`);
  }
  if (isArrayOrGoSlice(s) && !isComplexSlice(s) && !isArrayValue(s) && low === 0 && high === s.length && max === void 0) {
    return s;
  }
  let backing;
  let oldOffset = 0;
  let oldCap = scap;
  if (isComplexSlice(s)) {
    backing = s.__meta__.backing;
    oldOffset = s.__meta__.offset;
    oldCap = s.__meta__.capacity;
  } else {
    backing = s;
  }
  let newCap;
  if (max !== void 0) {
    if (max < high) {
      runtimePanic(`runtime error: slice bounds out of range [:${high}:${max}]`);
    }
    if (isComplexSlice(s) && max > oldOffset + oldCap) {
      runtimePanic(`Slice index out of range: ${max} > ${oldOffset + oldCap}`);
    }
    if (!isComplexSlice(s) && max > s.length) {
      runtimePanic(`Slice index out of range: ${max} > ${s.length}`);
    }
    newCap = max - low;
  } else {
    if (isComplexSlice(s)) {
      newCap = oldCap - low;
    } else {
      newCap = s.length - low;
    }
  }
  if (high > slen) {
    fillSpareCapacity(backing, oldOffset + slen, oldOffset + high);
  }
  const newLength = high - low;
  const newOffset = oldOffset + low;
  if (!isArrayValue(backing) && newOffset === 0 && newLength === newCap && backing.length === newLength) {
    return backing;
  }
  return new GoSlice(backing, newOffset, newLength, newCap);
}
function sliceOfWindow(backing, offset, length, capacity, low, high, max) {
  const lo = low ?? 0;
  const hi = high ?? length;
  const mx = max ?? capacity;
  if (lo < 0 || hi < lo || mx < hi || mx > capacity) {
    return void 0;
  }
  if (hi > length) {
    fillSpareCapacity(backing, offset + length, offset + hi);
  }
  const newOffset = offset + lo;
  const newLength = hi - lo;
  const newCap = mx - lo;
  if (newOffset === 0 && newLength === newCap && backing.length === newLength && !isArrayValue(backing)) {
    return backing;
  }
  return new GoSlice(backing, newOffset, newLength, newCap);
}
function sliceTyped(s, low, high, max) {
  const meta = typedSliceMeta(s);
  const backing = meta?.backing ?? s;
  const baseOffset = meta?.offset ?? 0;
  const baseCapacity = meta?.capacity ?? s.length;
  const actualLow = low ?? 0;
  const actualHigh = high ?? s.length;
  checkTypedSliceBounds(actualLow, actualHigh, baseCapacity);
  if (max !== void 0 && (max < actualHigh || max > baseCapacity)) {
    runtimePanic(
      `runtime error: slice bounds out of range [:${actualHigh}:${max}] with capacity ${baseCapacity}`
    );
  }
  const newCap = (max ?? baseCapacity) - actualLow;
  return typedSliceView(
    backing,
    baseOffset + actualLow,
    actualHigh - actualLow,
    newCap
  );
}
function arrayToSlice(arr, depth = 1) {
  if (arr == null) return [];
  if (arr.length === 0) return arr;
  if (depth === 1) {
    return arr;
  }
  const target = {
    __meta__: {
      backing: arr,
      offset: 0,
      length: arr.length,
      capacity: arr.length
    }
  };
  const handler = {
    get(target2, prop) {
      const index2 = sliceIndexProperty(prop);
      if (index2 >= 0) {
        if (index2 < target2.__meta__.length) {
          return target2.__meta__.backing[target2.__meta__.offset + index2];
        }
        runtimePanic(
          `Slice index out of range: ${index2} >= ${target2.__meta__.length}`
        );
      }
      if (prop === "length") {
        return target2.__meta__.length;
      }
      if (prop === "__meta__") {
        return target2.__meta__;
      }
      if (prop === "slice" || prop === "map" || prop === "filter" || prop === "reduce" || prop === "forEach" || prop === Symbol.iterator) {
        const backingSlice = target2.__meta__.backing.slice(
          target2.__meta__.offset,
          target2.__meta__.offset + target2.__meta__.length
        );
        return backingSlice[prop].bind(backingSlice);
      }
      return Reflect.get(target2, prop);
    },
    set(target2, prop, value) {
      const index2 = sliceIndexProperty(prop);
      if (index2 >= 0) {
        if (index2 < target2.__meta__.length) {
          target2.__meta__.backing[target2.__meta__.offset + index2] = value;
          return true;
        }
        if (index2 === target2.__meta__.length && target2.__meta__.length < target2.__meta__.capacity) {
          target2.__meta__.backing[target2.__meta__.offset + index2] = value;
          target2.__meta__.length++;
          return true;
        }
        runtimePanic(
          `Slice index out of range: ${index2} >= ${target2.__meta__.length}`
        );
      }
      if (prop === "length" || prop === "__meta__") {
        return false;
      }
      return Reflect.set(target2, prop, value);
    }
  };
  if (depth > 1 && arr.length > 0) {
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (!isComplexSlice(item) && isArrayOrGoSlice(item)) {
        arr[i] = arrayToSlice(item, depth - 1);
      }
    }
  }
  return new Proxy(target, handler);
}
function sliceLen(slice) {
  if (slice instanceof GoSlice) {
    return slice.length;
  }
  if (ArrayBuffer.isView(slice)) {
    return slice.length;
  }
  if (Array.isArray(slice) && slice.__meta__ === void 0) {
    return slice.length;
  }
  return sliceLenSlow(slice);
}
function sliceLenSlow(slice) {
  if (slice === null || slice === void 0) {
    return 0;
  }
  const meta = sliceMeta(slice);
  if (meta !== void 0) {
    return meta.length;
  }
  if (isArrayOrGoSlice(slice)) {
    const plainMeta = slice.__meta__;
    return plainMeta !== void 0 ? plainMeta.length : slice.length;
  }
  return len(slice);
}
var len = (obj) => {
  if (typeof obj === "object" && obj !== null && isArrayOrGoSlice(obj)) {
    const meta = sliceMeta(obj);
    if (meta !== void 0) {
      return meta.length;
    }
  }
  obj = collectionValue(obj);
  if (obj === null || obj === void 0) {
    return 0;
  }
  if (typeof obj === "string") {
    return stringLen(obj);
  }
  if (isTypedSlice(obj)) {
    return obj.length;
  }
  if (isArrayOrGoSlice(obj)) {
    const meta = obj.__meta__;
    if (meta !== void 0) {
      return meta.length;
    }
    return obj.length;
  }
  if (obj instanceof Map || obj instanceof Set) {
    return obj.size;
  }
  if (isComplexSlice(obj)) {
    return obj.__meta__.length;
  }
  if (typeof obj.len === "function") {
    return obj.len();
  }
  throw new Error("cannot determine len of this type");
};
var cap = (obj) => {
  obj = collectionValue(obj);
  if (obj === null || obj === void 0) {
    return 0;
  }
  if (isComplexSlice(obj)) {
    return obj.__meta__.capacity;
  }
  if (isTypedSlice(obj)) {
    return obj.length;
  }
  if (isArrayOrGoSlice(obj)) {
    return obj.length;
  }
  if (typeof obj.cap === "function") {
    return obj.cap();
  }
  return 0;
};
var byteSliceHint = /* @__PURE__ */ Symbol("goscript.byteSliceHint");
var appendZeroValueMarker = /* @__PURE__ */ Symbol("goscript.appendZeroValue");
function appendZero(factory) {
  return { [appendZeroValueMarker]: factory };
}
var nilZero = () => null;
var appendZeros = Object.freeze({
  complex: appendZero(() => ({ real: 0, imag: 0 })),
  nil: appendZero(nilZero)
});
function keepReference(value) {
  return value;
}
function elementCopy(zeroFactory) {
  return zeroFactory === nilZero ? keepReference : copyElement;
}
function appendZeroValueFactory(value) {
  if (typeof value !== "object" || value === null || !(appendZeroValueMarker in value)) {
    return void 0;
  }
  const factory = value[appendZeroValueMarker];
  return typeof factory === "function" ? factory : void 0;
}
function nextAppendCapacity(oldLength, oldCapacity, newLength) {
  if (oldCapacity === 0) {
    return newLength;
  }
  if (oldLength < 1024) {
    return Math.max(oldCapacity * 2, newLength);
  }
  return Math.max(oldCapacity + Math.floor(oldCapacity / 4), newLength);
}
function typedWindowFrom(slice, ctor) {
  if (slice instanceof GoSlice) {
    const backing2 = slice.backing;
    if (isTypedSlice(backing2) && backing2 instanceof ctor) {
      const { offset, length, capacity } = slice;
      return { backing: backing2, offset, length, capacity };
    }
  }
  if (slice instanceof ctor) {
    const meta = typedSliceMeta(slice);
    return meta ?? {
      backing: slice,
      offset: 0,
      length: slice.length,
      capacity: slice.length
    };
  }
  const backing = slice === null || slice === void 0 ? new ctor(0) : ctor.from(asArray(slice));
  return {
    backing,
    offset: 0,
    length: backing.length,
    capacity: backing.length
  };
}
function typedAppendConstructor(slice, hint) {
  if (hint === byteSliceHint) {
    return Uint8Array;
  }
  if (hint instanceof TypedSliceHint) {
    return hint.ctor;
  }
  const backing = slice instanceof GoSlice ? slice.backing : slice;
  if (isTypedSlice(backing)) {
    return backing.constructor;
  }
  return void 0;
}
function appendZeroValue(sample) {
  switch (typeof sample) {
    case "bigint":
      return 0n;
    case "boolean":
      return false;
    case "number":
      return 0;
    case "string":
      return "";
  }
  if (sample instanceof Uint8Array) {
    return new Uint8Array(sample.length);
  }
  if (isArrayOrGoSlice(sample)) {
    return sample.map(appendZeroValue);
  }
  if (typeof sample === "object" && sample !== null && isMarkedAsStructValue(sample)) {
    const ctor = sample.constructor;
    if (typeof ctor === "function") {
      return markAsStructValue(Reflect.construct(ctor, []));
    }
  }
  return null;
}
function appendOne(slice, value, zeroHint) {
  if (slice instanceof GoSlice) {
    if (slice.length < slice.capacity) {
      slice.backing[slice.offset + slice.length] = value;
      return sliceProxyFromBacking(
        slice.backing,
        slice.offset,
        slice.length + 1,
        slice.capacity
      );
    }
  } else if (slice !== null && slice !== void 0 && !(Array.isArray(slice) && slice.__meta__ === void 0)) {
    const meta = sliceMeta(slice);
    if (meta !== void 0 && meta.length < meta.capacity) {
      meta.backing[meta.offset + meta.length] = value;
      return sliceProxyFromBacking(
        meta.backing,
        meta.offset,
        meta.length + 1,
        meta.capacity
      );
    }
  }
  if (zeroHint === void 0) {
    return append(slice, value);
  }
  return append(slice, value, zeroHint);
}
function append(slice, ...elements) {
  let zeroFactory = appendZeroValueFactory(elements[elements.length - 1]);
  if (zeroFactory !== void 0) {
    elements.pop();
  }
  const hint = elements[elements.length - 1];
  if (hint === byteSliceHint || hint instanceof TypedSliceHint) {
    elements.pop();
  }
  const numAdded = elements.length;
  if (numAdded === 0) {
    return slice;
  }
  const typed = typedAppendConstructor(slice, hint);
  if (typed !== void 0) {
    if (slice instanceof GoSlice && slice.length + numAdded <= slice.capacity) {
      return appendNumbersInPlace(slice, elements);
    }
    if (isTypedSlice(slice) || !appendFitsWindow(slice, numAdded)) {
      return appendTypedSlice(
        typedWindowFrom(slice, typed),
        elements
      );
    }
  }
  let oldLength = 0;
  let oldCapacity;
  let isOriginalComplex = false;
  let originalBacking = void 0;
  let originalOffset = 0;
  if (slice === null || slice === void 0) {
    oldCapacity = 0;
  } else if (isComplexSlice(slice)) {
    const meta = slice.__meta__;
    oldLength = meta.length;
    oldCapacity = meta.capacity;
    isOriginalComplex = true;
    originalBacking = meta.backing;
    originalOffset = meta.offset;
  } else {
    oldLength = slice.length;
    oldCapacity = oldLength;
  }
  const newLength = oldLength + numAdded;
  const copyValue = elementCopy(zeroFactory);
  if (isOriginalComplex && newLength <= oldCapacity && originalBacking) {
    for (let i = 0; i < numAdded; i++) {
      const value = copyValue(elements[i]);
      originalBacking[originalOffset + oldLength + i] = value;
    }
    return sliceProxyFromBacking(
      originalBacking,
      originalOffset,
      newLength,
      oldCapacity
    );
  }
  const newCapacity = nextAppendCapacity(oldLength, oldCapacity, newLength);
  const newBacking = new Array(newCapacity);
  if (oldLength > 0) {
    copyGrownElements(newBacking, slice, oldLength, zeroFactory);
  }
  for (let i = 0; i < numAdded; i++) {
    newBacking[oldLength + i] = copyValue(elements[i]);
  }
  const sample = elements[0];
  setSpareZero(
    newBacking,
    newLength,
    zeroFactory ?? (() => appendZeroValue(sample))
  );
  return sliceProxyFromBacking(newBacking, 0, newLength, newCapacity);
}
var spareZero = /* @__PURE__ */ Symbol("goscript.spareZero");
function setSpareZero(backing, length, zero) {
  if (length < backing.length) {
    ;
    backing[spareZero] = zero;
  }
}
function fillSpareCapacity(backing, start, end) {
  const zero = backing[spareZero];
  if (zero === void 0) {
    return;
  }
  for (let i = start; i < end; i++) {
    if (backing[i] === void 0 && !(i in backing)) {
      backing[i] = zero();
    }
  }
}
function copyGrownElements(dst, slice, count, zeroFactory) {
  const window = sliceRange(slice);
  const backing = window.backing;
  const offset = window.offset;
  const cls = zeroFactory === nilZero ? void 0 : generatedStructClass(backing[offset]);
  if (cls === void 0) {
    copySliceElements(dst, 0, slice, 0, count, false, elementCopy(zeroFactory));
    return;
  }
  for (let i = 0; i < count; i++) {
    const value = backing[offset + i];
    dst[i] = value !== null && value !== void 0 && value.constructor === cls && isMarkedAsStructValue(value) ? value.clone() : copyElement(value);
  }
}
function appendNumbersInPlace(slice, elements) {
  const { backing, offset, length, capacity } = slice;
  for (let i = 0; i < elements.length; i++) {
    backing[offset + length + i] = elements[i];
  }
  return new GoSlice(backing, offset, length + elements.length, capacity);
}
function appendFitsWindow(slice, count) {
  return isComplexSlice(slice) && len(slice) + count <= cap(slice);
}
function appendTypedSlice(window, elements) {
  const { backing, offset, length, capacity } = window;
  let added = 0;
  for (const item of elements) {
    added += typedElementLength(item);
  }
  const newLength = length + added;
  if (newLength <= capacity) {
    writeTypedElements(backing, offset + length, elements);
    return typedSliceView(backing, offset, newLength, capacity);
  }
  const newCapacity = nextAppendCapacity(length, capacity, newLength);
  const ctor = backing.constructor;
  const next = new ctor(newCapacity);
  next.set(backing.subarray(offset, offset + length));
  writeTypedElements(next, length, elements);
  return typedSliceView(next, 0, newLength, newCapacity);
}
function typedElementLength(item) {
  const typed = typedElements(item);
  if (typed !== void 0) {
    return typed.length;
  }
  if (isComplexSlice(item) || isArrayOrGoSlice(item)) {
    return len(item);
  }
  if (typeof item !== "number") {
    throw new Error(
      "Cannot produce a typed slice: appended elements contain non-numbers."
    );
  }
  return 1;
}
function writeTypedElements(dst, offset, elements) {
  let cursor = offset;
  for (const item of elements) {
    const typed = typedElements(item);
    if (typed !== void 0) {
      dst.set(typed, cursor);
      cursor += typed.length;
      continue;
    }
    if (isComplexSlice(item) || isArrayOrGoSlice(item)) {
      const itemLen = len(item);
      for (let i = 0; i < itemLen; i++) {
        const value = arrayIndex(item, i);
        if (typeof value !== "number") {
          throw new Error(
            "Cannot produce a typed slice: appended elements contain non-numbers."
          );
        }
        dst[cursor] = value;
        cursor++;
      }
      continue;
    }
    if (typeof item !== "number") {
      throw new Error(
        "Cannot produce a typed slice: appended elements contain non-numbers."
      );
    }
    dst[cursor] = item;
    cursor++;
  }
}
function copy(dst, src, structs) {
  if (dst === null) {
    return 0;
  }
  if (typeof src === "string") {
    return copyFromString(dst, src);
  }
  if (src === null) {
    return 0;
  }
  const dstLen = isTypedSlice(dst) ? dst.length : len(dst);
  const srcLen = isTypedSlice(src) ? src.length : len(src);
  const count = Math.min(dstLen, srcLen);
  if (count === 0) {
    return 0;
  }
  const dstElements = typedElements(dst);
  const srcElements = typedElements(src);
  if (dstElements !== void 0 && srcElements !== void 0) {
    dstElements.set(srcElements.subarray(0, count));
    return count;
  }
  copySliceElements(dst, 0, src, 0, count, structs);
  return count;
}
function copyFromString(dst, src) {
  const dstLen = isTypedSlice(dst) ? dst.length : len(dst);
  const bytes = goStringBytes(src);
  const count = Math.min(dstLen, bytes.length);
  if (count === 0) {
    return 0;
  }
  if (isTypedSlice(dst)) {
    for (let i = 0; i < count; i++) {
      dst[i] = bytes[i];
    }
  } else if (isComplexSlice(dst)) {
    const dstMeta = dst.__meta__;
    for (let i = 0; i < count; i++) {
      dstMeta.backing[dstMeta.offset + i] = bytes[i];
    }
  } else if (Array.isArray(dst)) {
    for (let i = 0; i < count; i++) {
      dst[i] = bytes[i];
    }
  }
  return count;
}
function copySliceElements(dst, dstIndex, src, srcIndex, count, structs = false, copyValue = copyElement) {
  if (dst == null || src == null || count <= 0) {
    return;
  }
  const dstElements = typedElements(dst);
  const srcElements = typedElements(src);
  if (dstElements !== void 0 && srcElements !== void 0) {
    dstElements.set(srcElements.subarray(srcIndex, srcIndex + count), dstIndex);
    return;
  }
  const srcMeta = isComplexSlice(src) ? src.__meta__ : void 0;
  const dstMeta = isComplexSlice(dst) ? dst.__meta__ : void 0;
  const srcBacking = srcMeta?.backing ?? src;
  const dstBacking = dstMeta?.backing ?? dst;
  const srcStart = (srcMeta?.offset ?? 0) + srcIndex;
  const dstStart = (dstMeta?.offset ?? 0) + dstIndex;
  const backward = srcBacking === dstBacking && dstStart > srcStart && dstStart < srcStart + count;
  for (let step = 0; step < count; step++) {
    const i = backward ? count - 1 - step : step;
    const source = srcBacking[srcStart + i];
    const target = dstBacking[dstStart + i];
    if (structs && assignStructInPlace(target, source)) {
      continue;
    }
    ;
    dstBacking[dstStart + i] = copyValue(source);
  }
}
function assignStructInPlace(target, source) {
  if (target === null || typeof target !== "object" || source === null || typeof source !== "object" || target.constructor !== source.constructor || !("__goscriptAssign" in target) || typeof target.__goscriptAssign !== "function") {
    return false;
  }
  target.__goscriptAssign(source);
  return true;
}
function index(collection, index2) {
  if (collection === null || collection === void 0) {
    runtimePanic("runtime error: index on nil or undefined collection");
  }
  if (isTypedSlice(collection)) {
    if (index2 < 0 || index2 >= collection.length) {
      outOfRangeIndex(index2, collection.length);
    }
    return collection[index2];
  } else if (isComplexSlice(collection)) {
    if (index2 < 0 || index2 >= collection.__meta__.length) {
      outOfRangeIndex(index2, collection.__meta__.length);
    }
    return collection.__meta__.backing[collection.__meta__.offset + index2];
  } else if (isArrayOrGoSlice(collection)) {
    if (index2 < 0 || index2 >= collection.length) {
      outOfRangeIndex(index2, collection.length);
    }
    return collection[index2];
  } else if (typeof collection === "string") {
    return indexString(collection, index2);
  }
  runtimePanic("runtime error: index on unsupported type");
}
function arrayIndex(collection, index2) {
  if (collection instanceof GoSlice) {
    if (index2 >= 0 && index2 < collection.length) {
      return collection.backing[collection.offset + index2];
    }
  } else if (ArrayBuffer.isView(collection)) {
    if (index2 >= 0 && index2 < collection.length) {
      return collection[index2];
    }
  } else if (Array.isArray(collection) && collection.__meta__ === void 0) {
    if (index2 >= 0 && index2 < collection.length) {
      return collection[index2];
    }
  }
  return arrayIndexSlow(collection, index2);
}
function plainSliceIndex(collection, index2) {
  if (Array.isArray(collection) && index2 >= 0 && index2 < collection.length && collection.__meta__ === void 0) {
    return collection[index2];
  }
  if (collection instanceof GoSlice && index2 >= 0 && index2 < collection.length) {
    return collection.backing[collection.offset + index2];
  }
  return arrayIndex(collection, index2);
}
function arrayIndexSlow(collection, index2) {
  if (collection === null || collection === void 0) {
    outOfRangeIndex(index2, 0);
  }
  if (collection instanceof GoSlice) {
    if (index2 < 0 || index2 >= collection.length) {
      outOfRangeIndex(index2, collection.length);
    }
    return collection.backing[collection.offset + index2];
  }
  if (Array.isArray(collection) && collection.__meta__ === void 0) {
    if (index2 < 0 || index2 >= collection.length) {
      outOfRangeIndex(index2, collection.length);
    }
    return collection[index2];
  }
  if (isTypedSlice(collection)) {
    if (index2 < 0 || index2 >= collection.length) {
      outOfRangeIndex(index2, collection.length);
    }
    return collection[index2];
  }
  const meta = sliceMeta(collection);
  if (meta !== void 0) {
    if (index2 < 0 || index2 >= meta.length) {
      outOfRangeIndex(index2, meta.length);
    }
    return meta.backing[meta.offset + index2];
  }
  if (isComplexSlice(collection)) {
    const length = collection.__meta__.length;
    if (index2 < 0 || index2 >= length) {
      outOfRangeIndex(index2, length);
    }
    return collection.__meta__.backing[collection.__meta__.offset + index2];
  }
  if (isArrayOrGoSlice(collection)) {
    if (index2 < 0 || index2 >= collection.length) {
      outOfRangeIndex(index2, collection.length);
    }
    return collection[index2];
  }
  runtimePanic("runtime error: index on unsupported type");
}
function indexRef(collection, index2) {
  if (collection === null || collection === void 0) {
    runtimePanic("runtime error: index on nil or undefined collection");
  }
  if (collection instanceof GoSlice) {
    if (index2 < 0 || index2 >= collection.length) {
      outOfRangeIndex(index2, collection.length);
    }
    return new SliceIndexReference(
      collection,
      index2,
      collection.backing,
      collection.offset + index2
    );
  }
  if (Array.isArray(collection) && collection.__meta__ === void 0) {
    if (index2 < 0 || index2 >= collection.length) {
      outOfRangeIndex(index2, collection.length);
    }
    return new ArrayIndexReference(collection, index2);
  }
  if (isTypedSlice(collection)) {
    if (index2 < 0 || index2 >= collection.length) {
      outOfRangeIndex(index2, collection.length);
    }
    return new ArrayIndexReference(collection, index2);
  }
  if (isComplexSlice(collection)) {
    if (index2 < 0 || index2 >= collection.__meta__.length) {
      outOfRangeIndex(index2, collection.__meta__.length);
    }
    const meta = collection.__meta__;
    return new SliceIndexReference(
      collection,
      index2,
      meta.backing,
      meta.offset + index2
    );
  }
  if (isArrayOrGoSlice(collection)) {
    if (index2 < 0 || index2 >= collection.length) {
      outOfRangeIndex(index2, collection.length);
    }
    return new ArrayIndexReference(collection, index2);
  }
  runtimePanic("runtime error: index on unsupported type");
}
var ArrayIndexReference = class {
  constructor(__goCollection, __goIndex) {
    this.__goCollection = __goCollection;
    this.__goIndex = __goIndex;
  }
  __goCollection;
  __goIndex;
  __isVarRef = true;
  pointer;
  get value() {
    return this.__goCollection[this.__goIndex];
  }
  set value(value) {
    this.__goCollection[this.__goIndex] = value;
  }
  // The element is identified by the storage of the array and its index
  // there (see elementBacking).
  get __goElementBacking() {
    return elementBacking(this.__goCollection);
  }
  get __goElementIndex() {
    return elementBackingIndex(this.__goCollection, this.__goIndex);
  }
  get __goPointer() {
    return this.pointer ??= collectionPointer(
      this,
      this.__goCollection,
      this.__goIndex
    );
  }
  get __goAddress() {
    return this.__goPointer.__goAddress;
  }
};
var SliceIndexReference = class {
  constructor(__goCollection, __goIndex, backing, backingIndex) {
    this.__goCollection = __goCollection;
    this.__goIndex = __goIndex;
    this.backing = backing;
    this.backingIndex = backingIndex;
  }
  __goCollection;
  __goIndex;
  backing;
  backingIndex;
  __isVarRef = true;
  pointer;
  // A slice keeps its backing array, so the element is read from it directly
  // rather than through the slice proxy.
  get value() {
    return this.backing[this.backingIndex];
  }
  set value(value) {
    this.backing[this.backingIndex] = value;
  }
  // The element is identified by the storage of the backing array and its
  // index there (see elementBacking).
  get __goElementBacking() {
    return elementBacking(this.backing);
  }
  get __goElementIndex() {
    return elementBackingIndex(this.backing, this.backingIndex);
  }
  get __goPointer() {
    return this.pointer ??= collectionPointer(
      this,
      this.__goCollection,
      this.__goIndex
    );
  }
  get __goAddress() {
    return this.__goPointer.__goAddress;
  }
};
function elementBacking(array) {
  return ArrayBuffer.isView(array) ? array.buffer : array;
}
function elementBackingIndex(array, index2) {
  if (!ArrayBuffer.isView(array)) {
    return index2;
  }
  const typed = array;
  return typed.byteOffset + index2 * typed.BYTES_PER_ELEMENT;
}
function collectionPointer(ref, collection, index2) {
  return {
    __goOwnedPointer: true,
    __goAddress: () => indexAddress(collection, index2),
    __goRef: () => ref,
    __goSlice: (length) => {
      if (length < 0) {
        runtimePanic("runtime error: unsafe slice length out of range");
      }
      return goSlice(collection, index2, index2 + length, index2 + length);
    }
  };
}
function indexAddress(collection, index2) {
  if (collection === null || collection === void 0) {
    runtimePanic("runtime error: index on nil or undefined collection");
  }
  let backing;
  let backingIndex;
  let length;
  const typed = typedElements(collection);
  if (typed !== void 0) {
    backing = typed.buffer;
    backingIndex = typed.byteOffset + index2 * typed.BYTES_PER_ELEMENT;
    length = typed.length;
  } else if (isComplexSlice(collection)) {
    backing = collection.__meta__.backing;
    backingIndex = collection.__meta__.offset + index2;
    length = collection.__meta__.length;
  } else if (isArrayOrGoSlice(collection)) {
    backing = collection;
    backingIndex = index2;
    length = collection.length;
  } else {
    runtimePanic("runtime error: index on unsupported type");
  }
  if (index2 < 0 || index2 >= length) {
    outOfRangeIndex(index2, length);
  }
  let base = addressBases.get(backing);
  if (base === void 0) {
    base = nextAddressBase * addressStride;
    nextAddressBase++;
    addressBases.set(backing, base);
  }
  return base + backingIndex;
}
var numericBits = new DataView(new ArrayBuffer(8));
function decodeRuneInString(str, i = 0) {
  const n = str.length - i;
  if (n < 1) {
    return [65533, 0];
  }
  const b0 = str.charCodeAt(i);
  if (b0 < 128) {
    return [b0, 1];
  }
  let size;
  let lo = 128;
  let hi = 191;
  if (b0 >= 194 && b0 <= 223) {
    size = 2;
  } else if (b0 >= 224 && b0 <= 239) {
    size = 3;
    if (b0 === 224) lo = 160;
    else if (b0 === 237) hi = 159;
  } else if (b0 >= 240 && b0 <= 244) {
    size = 4;
    if (b0 === 240) lo = 144;
    else if (b0 === 244) hi = 143;
  } else {
    return [65533, 1];
  }
  if (n < size) {
    return [65533, 1];
  }
  const b1 = str.charCodeAt(i + 1);
  if (b1 < lo || b1 > hi) {
    return [65533, 1];
  }
  let r = (b0 & 127 >> size) << 6 | b1 & 63;
  for (let k = 2; k < size; k++) {
    const b = str.charCodeAt(i + k);
    if (b < 128 || b > 191) {
      return [65533, 1];
    }
    r = r << 6 | b & 63;
  }
  return [r, size];
}
var stringToRunes = (str) => {
  str = str.toString();
  const runes = [];
  for (let i = 0; i < str.length; ) {
    const c = str.charCodeAt(i);
    if (c < 128) {
      runes.push(c);
      i++;
      continue;
    }
    const [r, size] = decodeRuneInString(str, i);
    runes.push(r);
    i += size;
  }
  return runes;
};
var rangeString = (str) => {
  const pairs = [];
  for (const runes = new StringRunes(str.toString()); runes.next(); ) {
    pairs.push([runes.index, runes.rune]);
  }
  return pairs;
};
var StringRunes = class {
  constructor(str) {
    this.str = str;
  }
  str;
  index = 0;
  rune = 0;
  // pos is the byte offset of the next rune.
  pos = 0;
  next() {
    const str = this.str;
    const pos = this.pos;
    if (pos >= str.length) {
      return false;
    }
    this.index = pos;
    const c = str.charCodeAt(pos);
    if (c < 128) {
      this.rune = c;
      this.pos = pos + 1;
      return true;
    }
    const [r, size] = decodeRuneInString(str, pos);
    this.rune = r;
    this.pos = pos + size;
    return true;
  }
};
function stringRunes(str) {
  return new StringRunes(str);
}
var runesToString = (runes) => {
  if (!runes?.length) {
    return "";
  }
  const { backing, offset, length } = sliceRange(runes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += runeToString(backing[offset + i]);
  }
  return out;
};
function runeToString(r) {
  let n = Number(r);
  if (n < 0 || n > 1114111 || n >= 55296 && n <= 57343 || !Number.isFinite(n)) {
    n = 65533;
  }
  if (n < 128) {
    return String.fromCharCode(n);
  }
  if (n < 2048) {
    return String.fromCharCode(192 | n >> 6, 128 | n & 63);
  }
  if (n < 65536) {
    return String.fromCharCode(
      224 | n >> 12,
      128 | n >> 6 & 63,
      128 | n & 63
    );
  }
  return String.fromCharCode(
    240 | n >> 18,
    128 | n >> 12 & 63,
    128 | n >> 6 & 63,
    128 | n & 63
  );
}
var indexString = (str, index2) => {
  if (typeof str === "string") {
    if (index2 < 0 || index2 >= str.length) {
      outOfRangeIndex(index2, str.length);
    }
    return Number.isInteger(index2) ? str.charCodeAt(index2) : goStringBytes(str)[index2];
  }
  if (str instanceof Uint8Array) {
    if (index2 < 0 || index2 >= str.length) {
      outOfRangeIndex(index2, str.length);
    }
    return str[index2];
  }
  if (str === null || str === void 0) {
    outOfRangeIndex(index2, 0);
  }
  if (index2 < 0 || index2 >= str.length) {
    outOfRangeIndex(index2, str.length);
  }
  return str instanceof Uint8Array || Array.isArray(str) ? str[index2] : arrayIndex(str, index2);
};
var stringLen = (str) => {
  return str.length;
};
var sliceString = (str, low, high) => {
  const text = str.toString();
  const length = text.length;
  const actualLow = low === void 0 ? 0 : low;
  const actualHigh = high === void 0 ? length : high;
  if (actualLow < 0 || actualHigh < actualLow || actualHigh > length) {
    if (actualLow === actualHigh && actualLow >= 0 && actualLow <= length) {
      return "";
    }
    runtimePanic(
      `runtime error: slice bounds out of range [${actualLow}:${actualHigh}] with length ${length}`
    );
  }
  return text.substring(actualLow, actualHigh);
};
function sliceStringEqual(str, low, high, other) {
  if (typeof str !== "string" || typeof other !== "string") {
    return stringEqual(sliceStringOrBytes(str, low, high), other);
  }
  const actualLow = low === void 0 ? 0 : low;
  const actualHigh = high === void 0 ? str.length : high;
  if (actualLow < 0 || actualHigh < actualLow || actualHigh > str.length) {
    runtimePanic(
      `runtime error: slice bounds out of range [${actualLow}:${actualHigh}] with length ${str.length}`
    );
  }
  const length = other.length;
  if (actualHigh - actualLow !== length) {
    return false;
  }
  if (length > 16) {
    return str.startsWith(other, actualLow);
  }
  for (let i = 0; i < length; i++) {
    if (str.charCodeAt(actualLow + i) !== other.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}
var bytesToString = (bytes) => {
  if (bytes === null) return "";
  if (typeof bytes === "string") return bytes;
  if (isTypedSlice(bytes)) return goStringFromBytes(bytes);
  let byteArray;
  if (isComplexSlice(bytes)) {
    byteArray = bytes.__meta__.backing.slice(
      bytes.__meta__.offset,
      bytes.__meta__.offset + bytes.__meta__.length
    );
  } else {
    byteArray = bytes;
  }
  return goStringFromBytes(Uint8Array.from(byteArray, (b) => b & 255));
};
function stringEqual(left, right) {
  if (typeof left === "string" && typeof right === "string") {
    return left === right;
  }
  const leftBytes = goStringComparableBytes(left);
  const rightBytes = goStringComparableBytes(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  for (let i = 0; i < leftBytes.length; i++) {
    if (leftBytes[i] !== rightBytes[i]) {
      return false;
    }
  }
  return true;
}
function stringCompare(left, right) {
  if (typeof left === "string" && typeof right === "string") {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  if (typeof left !== "string" && typeof right !== "string") {
    const leftBytes2 = byteStringView(left);
    const rightBytes2 = byteStringView(right);
    const leftLen = leftBytes2.length;
    const rightLen = rightBytes2.length;
    const sharedLen2 = Math.min(leftLen, rightLen);
    for (let i = 0; i < sharedLen2; i++) {
      const diff = (leftBytes2.backing[leftBytes2.offset + i] ?? 0) - (rightBytes2.backing[rightBytes2.offset + i] ?? 0);
      if (diff !== 0) {
        return diff;
      }
    }
    return leftLen - rightLen;
  }
  const leftBytes = goStringComparableBytes(left);
  const rightBytes = goStringComparableBytes(right);
  const sharedLen = Math.min(leftBytes.length, rightBytes.length);
  for (let i = 0; i < sharedLen; i++) {
    const diff = leftBytes[i] - rightBytes[i];
    if (diff !== 0) {
      return diff;
    }
  }
  return leftBytes.length - rightBytes.length;
}
function byteStringView(value) {
  value = collectionValue(value);
  if (value === null || value === void 0) {
    return { backing: [], offset: 0, length: 0 };
  }
  if (value instanceof Uint8Array) {
    return { backing: value, offset: 0, length: value.length };
  }
  if (isArrayOrGoSlice(value)) {
    const meta = value.__meta__;
    if (meta !== void 0) {
      return {
        backing: meta.backing,
        offset: meta.offset,
        length: meta.length
      };
    }
    return {
      backing: value,
      offset: 0,
      length: value.length
    };
  }
  if (typeof value === "string") {
    const bytes = goStringBytes(value);
    return { backing: bytes, offset: 0, length: bytes.length };
  }
  return { backing: [], offset: 0, length: 0 };
}
function collectionValue(value) {
  if (isVarRef(value)) {
    return collectionValue(value.value);
  }
  if (isTypedNilValue(value)) {
    return null;
  }
  if (typeof value === "object" && value !== null && typeof value.__goType === "string" && "__goValue" in value) {
    return collectionValue(value.__goValue);
  }
  return value;
}
function goStringFromBytes(bytes) {
  let ascii = true;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] >= 128) {
      ascii = false;
      break;
    }
  }
  if (ascii && bytes.length > 16) {
    return sharedTextDecoder.decode(bytes);
  }
  const chunkSize = 8192;
  if (bytes.length <= chunkSize) {
    return Reflect.apply(String.fromCharCode, null, bytes);
  }
  let out = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    out += Reflect.apply(
      String.fromCharCode,
      null,
      bytes.subarray(i, i + chunkSize)
    );
  }
  return out;
}
function goStringBytes(value) {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    out[i] = value.charCodeAt(i) & 255;
  }
  return out;
}
function stringToBytes(s) {
  if (typeof s === "string") {
    return goStringBytes(s);
  }
  if (s instanceof Uint8Array) {
    return s;
  }
  if (s === null || s === void 0) {
    return new Uint8Array(0);
  }
  return new Uint8Array(isArrayOrGoSlice(s) ? s : []);
}
function sliceStringOrBytes(value, low, high, max) {
  if (typeof value === "string") {
    return sliceString(value, low, high);
  } else {
    return goSlice(value, low, high, max);
  }
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/builtin/hostio.ts
var HostUnsupportedError = class extends Error {
  constructor() {
    super("operation not implemented in JavaScript environment");
  }
};
var decoder = new TextDecoder();
function getDynamicRequire() {
  try {
    return Function(
      "return typeof require !== 'undefined' ? require : null"
    )();
  } catch {
    return null;
  }
}
function writeAllSync(writeChunk, buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    const n = writeChunk(buffer.subarray(offset));
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`invalid write result: ${n}`);
    }
    if (n === 0) {
      throw new Error("short write");
    }
    offset += n;
  }
  return buffer.length;
}
function writeAllText(writeChunk, data) {
  const bytes = stringToBytes(data);
  if (bytes.length === 0) {
    return;
  }
  writeAllSync(writeChunk, bytes);
}
function detectNodeFS(processObj) {
  if (processObj && typeof processObj.getBuiltinModule === "function") {
    const module = processObj.getBuiltinModule("fs");
    if (module && typeof module.readSync === "function" && typeof module.writeSync === "function") {
      return module;
    }
  }
  const requireFn = getDynamicRequire();
  if (requireFn) {
    for (const specifier of ["node:fs", "fs"]) {
      try {
        const module = requireFn(specifier);
        if (module && typeof module.readSync === "function" && typeof module.writeSync === "function") {
          return module;
        }
      } catch {
      }
    }
  }
  return null;
}
function detectNodeCrypto(processObj) {
  if (processObj && typeof processObj.getBuiltinModule === "function") {
    const module = processObj.getBuiltinModule("crypto");
    if (module && typeof module.createHash === "function") {
      return module;
    }
  }
  const requireFn = getDynamicRequire();
  if (requireFn) {
    for (const specifier of ["node:crypto", "crypto"]) {
      try {
        const module = requireFn(specifier);
        if (module && typeof module.createHash === "function") {
          return module;
        }
      } catch {
      }
    }
  }
  return null;
}
function fallbackConsoleLogWriter() {
  return (data) => {
    const consoleMethod = globalThis.console?.log;
    if (!consoleMethod) {
      return;
    }
    if (data.endsWith("\n")) {
      consoleMethod.call(globalThis.console, data.slice(0, -1));
      return;
    }
    consoleMethod.call(globalThis.console, data);
  };
}
function detectHostRuntime() {
  const globalObj = globalThis;
  const deno = globalObj.Deno ?? null;
  const processObj = globalObj.process ?? null;
  const nodeFS = detectNodeFS(processObj);
  const nodeCrypto = detectNodeCrypto(processObj);
  const getStdioHandle = (fd) => {
    if (!deno) {
      return null;
    }
    switch (fd) {
      case 0:
        return deno.stdin ?? null;
      case 1:
        return deno.stdout ?? null;
      case 2:
        return deno.stderr ?? null;
      default:
        return null;
    }
  };
  const platform = deno?.build?.os ?? processObj?.platform ?? "unknown";
  const getEnv = (name) => {
    if (deno?.env?.get) {
      try {
        return deno.env.get(name) ?? "";
      } catch {
        return "";
      }
    }
    return processObj?.env?.[name] ?? "";
  };
  const readFD = (fd, buffer) => {
    const handle = getStdioHandle(fd);
    if (handle && typeof handle.readSync === "function") {
      return handle.readSync(buffer);
    }
    if (nodeFS) {
      return nodeFS.readSync(fd, buffer, 0, buffer.length, null);
    }
    throw new HostUnsupportedError();
  };
  const writeFD = (fd, buffer) => {
    const handle = getStdioHandle(fd);
    if (handle && typeof handle.writeSync === "function") {
      return writeAllSync(
        (chunk) => handle.writeSync(chunk),
        buffer
      );
    }
    if (nodeFS) {
      return writeAllSync(
        (chunk) => nodeFS.writeSync(fd, chunk, 0, chunk.length, null),
        buffer
      );
    }
    if (fd === 1 || fd === 2) {
      fallbackConsoleLogWriter()(decoder.decode(buffer));
      return buffer.length;
    }
    throw new HostUnsupportedError();
  };
  const writeStdoutText = (data) => {
    const handle = getStdioHandle(1);
    if (handle && typeof handle.writeSync === "function") {
      writeAllText((chunk) => handle.writeSync(chunk), data);
      return;
    }
    if (nodeFS) {
      writeAllText(
        (chunk) => nodeFS.writeSync(1, chunk, 0, chunk.length, null),
        data
      );
      return;
    }
    fallbackConsoleLogWriter()(jsString(data));
  };
  const writeStderrText = (data) => {
    const handle = getStdioHandle(2);
    if (handle && typeof handle.writeSync === "function") {
      writeAllText((chunk) => handle.writeSync(chunk), data);
      return;
    }
    if (nodeFS) {
      writeAllText(
        (chunk) => nodeFS.writeSync(2, chunk, 0, chunk.length, null),
        data
      );
      return;
    }
    fallbackConsoleLogWriter()(jsString(data));
  };
  return {
    deno,
    getEnv,
    getStdioHandle,
    nodeCrypto,
    nodeFS,
    platform,
    processObj,
    readFD,
    writeFD,
    writeStderrText,
    writeStdoutText
  };
}
var HostRuntimeOwner = class {
  constructor(detector = detectHostRuntime) {
    this.detector = detector;
    this.runtime = detector();
  }
  detector;
  runtime;
  current() {
    return this.runtime;
  }
  reset() {
    this.runtime = this.detector();
  }
};
var hostRuntimeOwner = new HostRuntimeOwner();

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/builtin/builtin.ts
function assignStruct(target, source, typeInfo) {
  if (target === null || target === void 0 || source === null || source === void 0) {
    return target;
  }
  if (target.constructor === source.constructor && typeof target.__goscriptAssign === "function") {
    ;
    target.__goscriptAssign(source);
    return target;
  }
  const info = structValueTypeInfo(source) ?? typeInfo;
  const resolved = resolveTypeInfo(info);
  if (resolved?.kind === "struct" /* Struct */ && resolved.fields.length !== 0) {
    const destination = target;
    const values = source;
    for (const field of resolved.fields) {
      const key = structFieldRuntimeKey(field);
      destination[key] = assignFieldValue(
        destination[key],
        values[key],
        field.type
      );
    }
    return target;
  }
  const cloneable = source;
  const copied = cloneable.__goscriptClone?.() ?? cloneable.clone?.() ?? source;
  Object.assign(target, copied);
  return target;
}
function isPlainElementType(info) {
  return info !== void 0 && info.kind !== "struct" /* Struct */ && info.kind !== "array" /* Array */ && info.kind !== "interface" /* Interface */;
}
function assignFieldValue(target, source, typeInfo) {
  const info = resolveTypeInfo(typeInfo);
  if (info?.kind === "struct" /* Struct */) {
    assignStruct(target, source, info);
    return target;
  }
  if (info?.kind === "array" /* Array */) {
    if (target === null || target === void 0) {
      return cloneArrayValue(source, info);
    }
    const elem = resolveTypeInfo(info.elemType);
    const targetElems = sliceElems(target);
    const sourceElems = sliceElems(source);
    if (isPlainElementType(elem)) {
      for (let i = 0; i < info.length; i++) {
        targetElems[sliceSlot(target, i)] = sourceElems[sliceSlot(source, i)];
      }
      return target;
    }
    for (let i = 0; i < info.length; i++) {
      const slot = sliceSlot(target, i);
      targetElems[slot] = assignFieldValue(
        targetElems[slot],
        sourceElems[sliceSlot(source, i)],
        elem
      );
    }
    return target;
  }
  if (isArrayValue(source)) {
    return cloneArrayValue(source, arrayValueTypeInfo(source));
  }
  return source;
}
function pointerValue(value) {
  if (value !== null && value !== void 0) {
    if (value.__isVarRef === true) {
      return value.value;
    }
    if (value.__goValue === void 0) {
      return value;
    }
  }
  return pointerValueSlow(value);
}
function pointerValueSlow(value) {
  if (value === null || value === void 0) {
    runtimePanic(
      "runtime error: invalid memory address or nil pointer dereference"
    );
  }
  const boxed = typeof value === "object" && value !== null && "__goValue" in value ? value : null;
  if (boxed !== null && typeof boxed.__goType === "string" && boxed.__goType.startsWith("*") && !hasGoMethodSurface(value)) {
    return pointerValue(boxed.__goValue);
  }
  return value;
}
var nilPointerTarget = new Proxy(
  {},
  {
    get() {
      runtimePanic(
        "runtime error: invalid memory address or nil pointer dereference"
      );
    },
    set() {
      runtimePanic(
        "runtime error: invalid memory address or nil pointer dereference"
      );
    }
  }
);
function pointerTarget(value) {
  if (value === null || value === void 0) {
    return nilPointerTarget;
  }
  return pointerValue(value);
}
var reflectTypeIdentities = /* @__PURE__ */ new WeakMap();
function markReflectTypeIdentity(value, identity) {
  reflectTypeIdentities.set(value, identity);
}
function comparableEqual(a, b) {
  if (hasGoType(a) && hasGoType(b) && a.__isTypedNil === true && b.__isTypedNil === true && a.__goType === b.__goType) {
    const typeInfo = a.__goTypeInfo ?? b.__goTypeInfo;
    if (typeInfo !== void 0 && !isTypeInfoComparable(typeInfo)) {
      runtimePanic(`runtime error: comparing uncomparable type ${a.__goType}`);
    }
  }
  if (a === b) {
    return true;
  }
  if (a === null || a === void 0 || b === null || b === void 0) {
    return false;
  }
  if (typeof a === "object" && typeof b === "object" && pointerIdentityEqual(a, b)) {
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    const aType = reflectTypeIdentities.get(a);
    const bType = reflectTypeIdentities.get(b);
    if (aType !== void 0 || bType !== void 0) {
      return aType !== void 0 && aType === bType;
    }
  }
  if (isArrayLike(a) && isArrayLike(b)) {
    if (a.length !== b.length) {
      return false;
    }
    const aElems = sliceElems(a);
    const bElems = sliceElems(b);
    for (let i = 0; i < a.length; i++) {
      if (!comparableEqual(aElems[sliceSlot(a, i)], bElems[sliceSlot(b, i)])) {
        return false;
      }
    }
    return true;
  }
  if (isComplexValue(a) || isComplexValue(b)) {
    return isComplexValue(a) && isComplexValue(b) && a.real === b.real && a.imag === b.imag;
  }
  if (hasGoType(a) || hasGoType(b)) {
    if (!hasGoType(a) || !hasGoType(b) || a.__goType !== b.__goType) {
      return false;
    }
    if (a.__isTypedNil || b.__isTypedNil) {
      return a.__isTypedNil === true && b.__isTypedNil === true;
    }
    if (a.__goType.startsWith("*")) {
      return false;
    }
    if (hasGoValue(a) || hasGoValue(b)) {
      return hasGoValue(a) && hasGoValue(b) && comparableEqual(a.__goValue, b.__goValue);
    }
  }
  if (isStructObject(a) && isStructObject(b)) {
    if (!hasGoType(a) && !isMarkedAsStructValue(a) && !isMarkedAsStructValue(b)) {
      return false;
    }
    return fieldsEqual(a, b);
  }
  return false;
}
function isArrayLike(value) {
  return isArrayOrGoSlice(value) || isTypedSlice(value);
}
function hasGoType(value) {
  return typeof value === "object" && value !== null && typeof value.__goType === "string";
}
function hasGoValue(value) {
  return typeof value === "object" && value !== null && "__goValue" in value;
}
function hasGoMethodSurface(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto[namedValueBoxMarker] === true) {
    return Object.keys(proto).some(
      (key) => key !== "valueOf" && key !== "toString" && typeof proto[key] === "function"
    );
  }
  return Object.keys(value).some((key) => {
    return key !== "__goType" && key !== "__goValue" && key !== "valueOf" && key !== "toString" && typeof value[key] === "function";
  });
}
function fieldsEqual(a, b) {
  const aKeys = ownKeys(a);
  const bKeys = ownKeys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const key of aKeys) {
    if (!(key in b) || !comparableEqual(a[key], b[key])) {
      return false;
    }
  }
  return true;
}
function isComplexValue(value) {
  return typeof value === "object" && value !== null && typeof value.real === "number" && typeof value.imag === "number";
}
function complex(real2, imag2) {
  return { real: real2, imag: imag2 };
}
function float32(value) {
  return Math.fround(Number(value));
}
function real(value) {
  value = unwrapGoValue(value);
  if (typeof value === "number") {
    return value;
  }
  return value?.real ?? 0;
}
function imag(value) {
  value = unwrapGoValue(value);
  if (typeof value === "number") {
    return 0;
  }
  return value?.imag ?? 0;
}
function unwrapGoValue(value) {
  if (value !== null && value !== void 0 && typeof value === "object" && "__goValue" in value) {
    return value.__goValue;
  }
  return value;
}
var maxUint64BigInt = 0xffffffffffffffffn;
var maxSafeUintBigInt = BigInt(Number.MAX_SAFE_INTEGER);
function int(value, bits = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (bits === 32) {
      return value | 0;
    }
    if (bits === 16) {
      return value << 16 >> 16;
    }
    if (bits === 8) {
      return value << 24 >> 24;
    }
  }
  if (typeof value === "string") {
    value = BigInt(value);
  }
  if (typeof value === "bigint") {
    if (bits > 0 && bits <= 64) {
      return Number(BigInt.asIntN(bits, value));
    }
    return Number(value);
  }
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (bits > 0 && bits < 64) {
    const modulo = 2 ** bits;
    const sign = 2 ** (bits - 1);
    let truncated = Math.trunc(value);
    truncated %= modulo;
    if (truncated < 0) {
      truncated += modulo;
    }
    if (truncated >= sign) {
      truncated -= modulo;
    }
    return truncated;
  }
  return Math.trunc(value);
}
var wideValue = new BigInt64Array(1);
var wideWords = new Int32Array(wideValue.buffer);
function wideFromSafeInteger(value) {
  const high = Math.floor(value / 4294967296);
  wideWords[1] = high;
  wideWords[0] = value - high * 4294967296;
  return wideValue[0];
}
function uint(value, bits = 64) {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (bits === 8) {
      return value & 255;
    }
    if (bits === 16) {
      return value & 65535;
    }
    if (bits === 32) {
      return value >>> 0;
    }
  }
  return uintGeneral(value, bits);
}
function uintGeneral(value, bits) {
  if (typeof value === "object") {
    return value;
  }
  if (typeof value === "string") {
    value = BigInt(value);
  }
  if (typeof value === "bigint") {
    if (bits === 32 && value >= 0n && value <= 0xffffffffn) {
      return Number(value);
    }
    const normalized = BigInt.asUintN(Math.min(bits, 64), value);
    if (bits >= 64 && normalized > maxSafeUintBigInt) {
      return normalized;
    }
    return Number(normalized);
  }
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (bits >= 64) {
    const truncated2 = Math.trunc(value);
    if (truncated2 >= 0 && truncated2 <= Number.MAX_SAFE_INTEGER) {
      return truncated2;
    }
    return uint(BigInt(truncated2), 64);
  }
  const modulo = 2 ** bits;
  let truncated = Math.trunc(value);
  truncated %= modulo;
  if (truncated < 0) {
    truncated += modulo;
  }
  return truncated;
}
function int64(value) {
  if (typeof value === "number" && isSafeNumber(value)) {
    return wideFromSafeInteger(Math.trunc(value));
  }
  if (typeof value === "string") {
    value = BigInt(value);
  }
  return int64Result(int64Value(value));
}
function uint64(value) {
  if (typeof value === "number" && value > -1 && isSafeNumber(value)) {
    return wideFromSafeInteger(Math.trunc(value));
  }
  if (typeof value === "string") {
    value = BigInt(value);
  }
  return uint64Result(uint64Value(value));
}
function isSafeNumber(value) {
  return value > -9007199254740992 && value < 9007199254740992;
}
var wideShiftAmounts = Array.from({ length: 65 }, (_, idx) => BigInt(idx));
var int64Bits = Array.from(
  { length: 64 },
  (_, k) => BigInt.asIntN(64, 1n << BigInt(k))
);
var uint64Bits = Array.from({ length: 64 }, (_, k) => 1n << BigInt(k));
function intOr(left, right) {
  if ((left | 0) === left && (right | 0) === right) {
    return left | right;
  }
  const leftHigh = intHighWord(left);
  const rightHigh = intHighWord(right);
  const low = left - leftHigh * 4294967296 | right - rightHigh * 4294967296;
  return (leftHigh | rightHigh) * 4294967296 + (low >>> 0);
}
function intHighWord(value) {
  return Math.floor(value / 4294967296);
}
function intShl(value, count) {
  if (count >= 0 && count < 32) {
    const shifted = value << count;
    if (shifted >> count === value) {
      return shifted;
    }
  }
  return intShlWide(value, count);
}
function intShlWide(value, count) {
  if (count < 0) {
    runtimePanic("runtime error: negative shift amount");
  }
  if (count >= 64) {
    return 0;
  }
  const shifted = value * 2 ** count;
  if (Number.isSafeInteger(shifted)) {
    return shifted;
  }
  return Number(BigInt.asIntN(64, BigInt(value) << BigInt(count)));
}
function intShr(value, count) {
  if ((value | 0) === value && count >= 0 && count < 32) {
    return value >> count;
  }
  if (count < 0) {
    runtimePanic("runtime error: negative shift amount");
  }
  return Math.floor(value / 2 ** Math.min(count, 63));
}
function int64Value(value) {
  if (typeof value === "bigint") {
    if (value >= -0x8000000000000000n && value <= 0x7fffffffffffffffn) {
      return value;
    }
    return BigInt.asIntN(64, value);
  }
  if (Number.isFinite(value)) {
    const truncated = Math.trunc(value);
    if (truncated >= Number.MIN_SAFE_INTEGER && truncated <= Number.MAX_SAFE_INTEGER) {
      return BigInt(truncated);
    }
  }
  return BigInt.asIntN(64, BigInt(Math.trunc(value)));
}
function int64Result(value) {
  if (value >= -0x8000000000000000n && value <= 0x7fffffffffffffffn) {
    return value;
  }
  return BigInt.asIntN(64, value);
}
function uint64Value(value) {
  if (typeof value === "bigint") {
    if (value >= 0n && value <= maxUint64BigInt) {
      return value;
    }
    return BigInt.asUintN(64, value);
  }
  if (Number.isFinite(value)) {
    const truncated = Math.trunc(value);
    if (truncated >= 0 && truncated <= Number.MAX_SAFE_INTEGER) {
      return BigInt(truncated);
    }
  }
  return BigInt.asUintN(64, BigInt(Math.trunc(value)));
}
function uint64Result(value) {
  if (value >= 0n && value <= maxUint64BigInt) {
    return value;
  }
  return BigInt.asUintN(64, value);
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/builtin/float.ts
function formatFloat(f, fmt, prec, bitSize) {
  if (bitSize === 32) {
    f = Math.fround(f);
  }
  if (Number.isNaN(f)) {
    return "NaN";
  }
  if (f === Infinity) {
    return "+Inf";
  }
  if (f === -Infinity) {
    return "-Inf";
  }
  const sign = f < 0 || Object.is(f, -0) ? "-" : "";
  const a = Math.abs(f);
  const shortest = prec < 0;
  const lower = fmt.toLowerCase();
  let digs;
  if (shortest) {
    digs = shortestDigits(a, bitSize);
    switch (lower) {
      case "e":
        prec = Math.max(digs.d.length - 1, 0);
        break;
      case "f":
        prec = Math.max(digs.d.length - digs.dp, 0);
        break;
      default:
        prec = digs.d.length;
    }
  } else {
    digs = exactDigits(a);
    switch (lower) {
      case "e":
        digs = roundDigits(digs, prec + 1);
        break;
      case "f":
        digs = roundDigits(digs, digs.dp + prec);
        break;
      default:
        if (prec === 0) {
          prec = 1;
        }
        digs = roundDigits(digs, prec);
    }
  }
  switch (lower) {
    case "e":
      return sign + fmtE(digs, prec, fmt === "E" ? "E" : "e");
    case "f":
      return sign + fmtF(digs, prec);
    default: {
      let eprec = prec;
      if (eprec > digs.d.length && digs.d.length >= digs.dp) {
        eprec = digs.d.length;
      }
      if (shortest) {
        eprec = 6;
      }
      const exp = digs.dp - 1;
      if (exp < -4 || exp >= eprec) {
        if (prec > digs.d.length) {
          prec = digs.d.length;
        }
        return sign + fmtE(digs, prec - 1, fmt === "G" ? "E" : "e");
      }
      if (prec > digs.dp) {
        prec = digs.d.length;
      }
      return sign + fmtF(digs, Math.max(prec - digs.dp, 0));
    }
  }
}
var float64View = new DataView(new ArrayBuffer(8));
function exactDigits(a) {
  if (a === 0) {
    return { d: "", dp: 0 };
  }
  float64View.setFloat64(0, a);
  const hi = float64View.getUint32(0);
  const lo = float64View.getUint32(4);
  let mant = BigInt(hi & 1048575) << 32n | BigInt(lo);
  let exp = hi >>> 20 & 2047;
  if (exp === 0) {
    exp = 1;
  } else {
    mant |= 1n << 52n;
  }
  exp -= 1023 + 52;
  if (exp >= 0) {
    const d2 = (mant << BigInt(exp)).toString();
    return { d: d2.replace(/0+$/, ""), dp: d2.length };
  }
  const d = (mant * 5n ** BigInt(-exp)).toString();
  return { d: d.replace(/0+$/, ""), dp: d.length + exp };
}
function roundDigits(digs, nd) {
  const { d, dp } = digs;
  if (nd < 0 || nd >= d.length) {
    return digs;
  }
  const next = d.charCodeAt(nd) - 48;
  const tie = next === 5 && nd + 1 === d.length;
  const odd = nd > 0 && (d.charCodeAt(nd - 1) - 48) % 2 === 1;
  if (next < 5 || tie && !odd) {
    return { d: d.slice(0, nd).replace(/0+$/, ""), dp };
  }
  let i = nd - 1;
  while (i >= 0 && d[i] === "9") {
    i--;
  }
  if (i < 0) {
    return { d: "1", dp: dp + 1 };
  }
  return { d: d.slice(0, i) + String.fromCharCode(d.charCodeAt(i) + 1), dp };
}
function shortestDigits(a, bitSize) {
  if (a === 0) {
    return { d: "", dp: 0 };
  }
  if (bitSize !== 32) {
    return parseExponential(a.toExponential());
  }
  for (let p = 0; p < 8; p++) {
    const s = a.toExponential(p);
    if (Math.fround(Number(s)) === a) {
      return parseExponential(s);
    }
  }
  return parseExponential(a.toExponential(8));
}
function parseExponential(s) {
  const [mantissa, exponent] = s.split("e");
  const d = mantissa.replace(".", "").replace(/0+$/, "");
  return { d, dp: Number(exponent) + 1 };
}
function fmtE(digs, prec, e) {
  let s = digs.d.length === 0 ? "0" : digs.d[0];
  if (prec > 0) {
    s += "." + digs.d.slice(1, prec + 1).padEnd(prec, "0");
  }
  const exp = digs.d.length === 0 ? 0 : digs.dp - 1;
  const expAbs = Math.abs(exp);
  return s + e + (exp < 0 ? "-" : "+") + String(expAbs).padStart(2, "0");
}
function fmtF(digs, prec) {
  let s = digs.dp > 0 ? digs.d.slice(0, digs.dp).padEnd(digs.dp, "0") : "0";
  if (prec > 0) {
    s += ".";
    for (let i = 1; i <= prec; i++) {
      const j = digs.dp + i - 1;
      s += j >= 0 && j < digs.d.length ? digs.d[j] : "0";
    }
  }
  return s;
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/builtin/rand.ts
var runtimeSeed = new Uint32Array(8);
var runtimeBuffer = new ArrayBuffer(256);
var runtimeWords = new Uint32Array(runtimeBuffer);
var runtimeWide = new BigUint64Array(runtimeBuffer);

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/builtin/channel.ts
async function chanSend(channel, value) {
  if (channel === null) {
    return new Promise(() => {
    });
  }
  return channel.send(value);
}
async function chanRecvWithOk(channel) {
  if (channel === null) {
    return new Promise(() => {
    });
  }
  return channel.receiveWithOk();
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/builtin/map.ts
var GoMap = class extends Map {
  pointerKeys;
  pointerIndex;
  structKeys;
  // typedNilKeys holds the stored typed nil key of each Go type. All typed
  // nils of a type are equal, so the map holds at most one of them.
  typedNilKeys;
  constructor(keyType) {
    super();
    const info = resolveTypeInfo(keyType);
    this.pointerKeys = info?.kind === "pointer" /* Pointer */;
  }
  set(key, value) {
    if (this.pointerKeys || isInterfacePointerKey(key)) {
      key = this.storedKey(key);
      if (typeof key === "object" && key !== null) {
        this.pointerIndex ??= /* @__PURE__ */ new Map();
        this.pointerIndex.set(canonicalPointerIdentity(key), key);
      }
    } else if (isTypedNilKey(key)) {
      const stored = this.storedKey(key);
      this.typedNilKeys ??= /* @__PURE__ */ new Map();
      this.typedNilKeys.set(key.__goType, stored);
      key = stored;
    } else if (typeof key !== "string") {
      const stored = this.structEntry(key);
      if (stored !== void 0) {
        key = stored;
      } else {
        this.addStructKey(key);
      }
    }
    return super.set(key, value);
  }
  get(key) {
    return super.get(this.storedKey(key));
  }
  has(key) {
    return super.has(this.storedKey(key));
  }
  delete(key) {
    const stored = this.storedKey(key);
    if (this.pointerKeys || isInterfacePointerKey(key)) {
      if (typeof key === "object" && key !== null)
        this.pointerIndex?.delete(canonicalPointerIdentity(key));
    } else if (isTypedNilKey(key)) {
      if (stored === this.typedNilKeys?.get(key.__goType))
        this.typedNilKeys?.delete(key.__goType);
    } else if (typeof key !== "string") this.removeStructKey(stored);
    return super.delete(stored);
  }
  clear() {
    this.pointerIndex?.clear();
    this.structKeys?.clear();
    this.typedNilKeys?.clear();
    super.clear();
  }
  // structEntry returns the stored key equal to key under Go struct
  // equality, or undefined when the index holds no matching candidate. The
  // bucket only narrows candidates; comparableEqual stays the equality
  // authority, so same-field structs of different types stay distinct.
  structEntry(key) {
    const canonical = structMapKey(key);
    if (canonical === void 0) return void 0;
    return this.structLookup(key, canonical);
  }
  // structLookup returns the stored key equal to key, whose canonical index
  // key is given, or undefined if there is none.
  structLookup(key, canonical) {
    const bucket = this.structKeys?.get(canonical);
    if (bucket === void 0) return void 0;
    for (let i = 0; i < bucket.length; i++) {
      if (structKeysEqual(bucket[i], key)) return bucket[i];
    }
    return void 0;
  }
  storedKey(key) {
    if (this.pointerKeys) {
      return typeof key === "object" && key !== null ? this.pointerIndex?.get(canonicalPointerIdentity(key)) ?? key : key;
    }
    if (isInterfacePointerKey(key)) {
      const stored = this.pointerIndex?.get(canonicalPointerIdentity(key));
      return stored !== void 0 && (stored === key || comparableEqual(stored, key)) ? stored : key;
    }
    if (typeof key === "string") {
      return key;
    }
    if (isTypedNilKey(key)) {
      const stored = this.typedNilKeys?.get(key.__goType);
      return stored !== void 0 && comparableEqual(stored, key) ? stored : key;
    }
    return this.structEntry(key) ?? key;
  }
  addStructKey(key) {
    const canonical = structMapKey(key);
    if (canonical === void 0) return;
    this.addStructKeyCanonical(key, canonical);
  }
  // setStruct sets the value of a struct key, whose canonical index key is
  // given, computing it only once for the whole operation.
  setStruct(key, canonical, value) {
    const stored = this.structLookup(key, canonical);
    if (stored === void 0) {
      this.addStructKeyCanonical(key, canonical);
      super.set(key, value);
    } else {
      super.set(stored, value);
    }
  }
  addStructKeyCanonical(key, canonical) {
    this.structKeys ??= /* @__PURE__ */ new Map();
    const bucket = this.structKeys.get(canonical);
    if (bucket === void 0) {
      this.structKeys.set(canonical, [key]);
    } else {
      bucket.push(key);
    }
  }
  removeStructKey(stored) {
    const canonical = structMapKey(stored);
    if (canonical === void 0) return;
    const bucket = this.structKeys?.get(canonical);
    if (bucket === void 0) return;
    const remaining = bucket.filter((member) => member !== stored);
    if (remaining.length === 0) {
      this.structKeys.delete(canonical);
    } else {
      this.structKeys.set(canonical, remaining);
    }
  }
};
function isInterfacePointerKey(key) {
  if (typeof key !== "object" || key === null) return false;
  const boxed = key;
  return typeof boxed.__goType === "string" && boxed.__goType.startsWith("*") && boxed.__isTypedNil !== true;
}
function isTypedNilKey(key) {
  if (typeof key !== "object" || key === null) return false;
  const boxed = key;
  return typeof boxed.__goType === "string" && boxed.__isTypedNil === true;
}
function makeMap(entries, keyType) {
  const map = new GoMap(keyType);
  if (entries) for (const [key, value] of entries) mapSet(map, key, value);
  return map;
}
function mapGet(map, key, defaultValue) {
  const entry = findMapEntry(map, key);
  if (entry.found) {
    return [entry.value, true];
  } else {
    return [defaultValue, false];
  }
}
var mapSet = (map, key, value) => {
  if (!map) {
    runtimePanic("assignment to entry in nil map");
  }
  const canonical = goMapStructKey(map, key);
  if (canonical !== void 0) {
    ;
    map.setStruct(key, canonical, value);
    return;
  }
  const entry = findMapEntry(map, key);
  map.set(entry.found ? entry.key : key, value);
};
function goMapStructKey(map, key) {
  if (!(map instanceof GoMap) || map.pointerKeys || typeof key !== "object" || key === null) {
    return void 0;
  }
  return structMapKey(key);
}
function findMapEntry(map, key) {
  if (!map) {
    return { found: false };
  }
  const canonical = goMapStructKey(map, key);
  if (canonical !== void 0) {
    const stored = map.structLookup(key, canonical);
    if (stored === void 0) return { found: false };
    return {
      found: true,
      key: stored,
      value: Map.prototype.get.call(map, stored)
    };
  }
  if (map.has(key)) {
    return { found: true, key, value: map.get(key) };
  }
  if (map instanceof GoMap && (map.pointerKeys || isInterfacePointerKey(key) || isTypedNilKey(key))) {
    return { found: false };
  }
  if (typeof key === "string") return { found: false };
  if (key === null || typeof key !== "object" && typeof key !== "function") {
    return { found: false };
  }
  if (map instanceof GoMap && structMapKey(key) !== void 0) {
    return { found: false };
  }
  for (const [candidate, value] of map.entries()) {
    if (candidate !== key && comparableEqual(candidate, key)) {
      return { found: true, key: candidate, value };
    }
  }
  return { found: false };
}
function structMapKey(key) {
  if (!isStructObject(key) || isInterfacePointerKey(key)) return void 0;
  const plan = structKeyPlan(key);
  let text = "";
  for (let i = 0; i < plan.length; i++) {
    const field = plan[i];
    const value = structMapKeyField(key[field.name], field.kind);
    if (value === void 0) return void 0;
    text += value + "|";
  }
  return text;
}
function structKeysEqual(a, b) {
  const plan = cachedStructKeyPlan(a);
  if (plan === void 0 || a.constructor !== b.constructor || a.__goType !== b.__goType || typeof a.__goType !== "string" && a[structValueMarker] !== true && b[structValueMarker] !== true) {
    return comparableEqual(a, b);
  }
  for (let i = 0; i < plan.length; i++) {
    const x = a[plan[i].name];
    const y = b[plan[i].name];
    if (x === y) continue;
    if (typeof x === "object" || typeof y === "object") {
      return comparableEqual(a, b);
    }
    return false;
  }
  return true;
}
var structKeyPlans = /* @__PURE__ */ new WeakMap();
function structKeyPlan(key) {
  const ctor = key.constructor;
  const cacheable = ctor !== void 0 && ctor.__typeInfo !== void 0;
  if (cacheable) {
    const cached = structKeyPlans.get(ctor);
    if (cached !== void 0) return cached;
  }
  const kinds = structFieldKinds(key);
  const plan = ownKeys(key).sort().map((name) => ({ name, kind: kinds?.get(name) }));
  if (cacheable && kinds !== void 0) {
    structKeyPlans.set(ctor, plan);
  }
  return plan;
}
function cachedStructKeyPlan(key) {
  const ctor = key.constructor;
  return ctor === void 0 ? void 0 : structKeyPlans.get(ctor);
}
function structFieldKinds(value) {
  const ctor = value.constructor;
  const info = resolveTypeInfo(ctor?.__typeInfo);
  if (info === void 0 || !isStructTypeInfo(info)) return void 0;
  let kinds = structFieldKindCache.get(info);
  if (kinds === void 0) {
    kinds = /* @__PURE__ */ new Map();
    for (const field of info.fields) {
      const kind = resolveTypeInfo(field.type)?.kind;
      if (kind !== void 0) kinds.set(structFieldRuntimeKey(field), kind);
    }
    structFieldKindCache.set(info, kinds);
  }
  return kinds;
}
var structFieldKindCache = /* @__PURE__ */ new WeakMap();
var pointerKeyIDs = /* @__PURE__ */ new WeakMap();
var nextPointerKeyID = 1;
function structMapKeyField(value, kind) {
  if (typeof value === "string") return "s" + value;
  switch (typeof value) {
    case "number":
      return "n" + String(value);
    case "bigint":
      return "n" + value.toString();
    case "boolean":
      return value ? "t" : "f";
  }
  if (kind === "pointer" /* Pointer */) {
    if (value === null || value === void 0) return "p0";
    if (typeof value !== "object") return void 0;
    const identity = canonicalPointerIdentity(value);
    let id = pointerKeyIDs.get(identity);
    if (id === void 0) {
      id = nextPointerKeyID++;
      pointerKeyIDs.set(identity, id);
    }
    return "p" + id;
  }
  if (kind !== "struct" /* Struct */) return void 0;
  const nested = structMapKey(value);
  return nested === void 0 ? void 0 : "r" + nested;
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/builtin/defer.ts
var disposeSymbol = Symbol.dispose ?? /* @__PURE__ */ Symbol.for("Symbol.dispose");
var asyncDisposeSymbol = Symbol.asyncDispose ?? /* @__PURE__ */ Symbol.for("Symbol.asyncDispose");
var DisposableStack = class {
  stack = [];
  /**
   * Adds a function to be executed when the stack is disposed.
   * @param fn The function to defer.
   */
  defer(fn) {
    this.stack.push(fn);
  }
  dispose() {
    while (this.stack.length) {
      const fn = this.stack.pop();
      fn();
    }
  }
  disposePanic(err) {
    withRecoveringPanic(err, () => this.dispose());
  }
  /**
   * Disposes during ordinary scope exit.
   */
  [disposeSymbol]() {
    this.dispose();
  }
};
var AsyncDisposableStack = class {
  stack = [];
  /**
   * Adds a synchronous or asynchronous function to be executed when the stack is disposed.
   * @param fn The function to defer. Can return void or a Promise<void>.
   */
  defer(fn) {
    this.stack.push(fn);
  }
  async dispose() {
    while (this.stack.length) {
      const fn = this.stack.pop();
      await fn();
    }
  }
  async disposePanic(err) {
    while (this.stack.length) {
      const fn = this.stack.pop();
      const result = withRecoveringPanic(err, () => fn());
      if (result && typeof result.then === "function") {
        await result;
      }
    }
  }
  async [asyncDisposeSymbol]() {
    await this.dispose();
  }
  [disposeSymbol]() {
    while (this.stack.length) {
      const fn = this.stack.pop();
      const result = fn();
      if (result && typeof result.then === "function") {
        throw new Error("async deferred function disposed synchronously");
      }
    }
  }
};

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/builtin/errors.ts
function newError(text) {
  return {
    Error: () => text
  };
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/strconv/atoi.gs.ts
var ErrRange = newError("value out of range");
var ErrSyntax = newError("invalid syntax");
var NumError = class _NumError {
  constructor(init) {
    this.Func = init?.Func ?? "";
    this.Num = init?.Num ?? "";
    this.Err = init?.Err ?? null;
  }
  clone() {
    const cloned = new _NumError();
    cloned.Func = this.Func;
    cloned.Num = this.Num;
    cloned.Err = this.Err;
    return cloned;
  }
  Error() {
    const e = this;
    const inner = e.Err.Error();
    if (typeof inner === "string") {
      return "strconv." + e.Func + ": parsing " + JSON.stringify(e.Num) + ": " + inner;
    }
    return Promise.resolve(inner).then((text) => "strconv." + e.Func + ": parsing " + JSON.stringify(e.Num) + ": " + text);
  }
  Unwrap() {
    const e = this;
    return e.Err;
  }
  // Register this type with the runtime type system
  static __typeInfo = registerStructType(
    "strconv.NumError",
    new _NumError(),
    [{ name: "Error", args: [], returns: [{ type: { kind: "basic" /* Basic */, name: "string" } }] }, { name: "Unwrap", args: [], returns: [{ type: { kind: "interface" /* Interface */, name: "GoError", methods: [{ name: "Error", args: [], returns: [{ type: { kind: "basic" /* Basic */, name: "string" } }] }] } }] }],
    _NumError,
    [{ name: "Func", key: "Func", type: { kind: "basic" /* Basic */, name: "string" } }, { name: "Num", key: "Num", type: { kind: "basic" /* Basic */, name: "string" } }, { name: "Err", key: "Err", type: { kind: "interface" /* Interface */, name: "GoError", methods: [{ name: "Error", args: [], returns: [{ type: { kind: "basic" /* Basic */, name: "string" } }] }] } }]
  );
};

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/strconv/ftoa.gs.ts
var hexConv = new DataView(new ArrayBuffer(8));
function formatHexFloat(f, prec, upper) {
  hexConv.setFloat64(0, f);
  const hi = hexConv.getUint32(0);
  const lo = hexConv.getUint32(4);
  const biasedExp = hi >>> 20 & 2047;
  let frac = BigInt(hi & 1048575) << 32n | BigInt(lo >>> 0);
  const xPrefix = upper ? "0X" : "0x";
  const pChar = upper ? "P" : "p";
  const assemble = (intDigit, fracHex2, exp2) => {
    if (upper) {
      fracHex2 = fracHex2.toUpperCase();
    }
    const expAbs = Math.abs(exp2);
    const expStr = (exp2 < 0 ? "-" : "+") + String(expAbs).padStart(2, "0");
    const mantissa = fracHex2.length > 0 ? intDigit + "." + fracHex2 : intDigit;
    return xPrefix + mantissa + pChar + expStr;
  };
  if (biasedExp === 0 && frac === 0n) {
    const fracHex2 = prec > 0 ? "0".repeat(prec) : "";
    return assemble("0", fracHex2, 0);
  }
  let exp;
  if (biasedExp === 0) {
    let k = 51;
    while ((frac & 1n << BigInt(k)) === 0n) {
      k--;
    }
    exp = k - 1074;
    frac = frac << BigInt(52 - k) & (1n << 52n) - 1n;
  } else {
    exp = biasedExp - 1023;
  }
  let fracHex;
  if (prec < 0) {
    fracHex = frac.toString(16).padStart(13, "0").replace(/0+$/, "");
  } else if (prec >= 13) {
    fracHex = frac.toString(16).padStart(13, "0").padEnd(prec, "0");
  } else {
    const keepBits = BigInt(prec * 4);
    const droppedBits = 52n - keepBits;
    let kept = frac >> droppedBits;
    const remainder = frac & (1n << droppedBits) - 1n;
    const half = 1n << droppedBits - 1n;
    if (remainder > half || remainder === half && (kept & 1n) === 1n) {
      kept += 1n;
    }
    if (kept >= 1n << keepBits) {
      exp += 1;
      kept = 0n;
    }
    fracHex = prec === 0 ? "" : kept.toString(16).padStart(prec, "0");
  }
  return assemble("1", fracHex, exp);
}
function FormatFloat(f, fmt, prec, bitSize) {
  const fmtChar = String.fromCharCode(fmt);
  if (isNaN(f)) {
    return "NaN";
  }
  if (f === Infinity) {
    return "+Inf";
  }
  if (f === -Infinity) {
    return "-Inf";
  }
  if (bitSize === 32) {
    f = Math.fround(f);
  }
  if (fmtChar === "x" || fmtChar === "X") {
    hexConv.setFloat64(0, f);
    const neg = hexConv.getUint32(0) >>> 31 === 1;
    return (neg ? "-" : "") + formatHexFloat(Math.abs(f), prec, fmtChar === "X");
  }
  switch (fmtChar) {
    case "e":
    case "E":
    case "f":
    case "F":
    case "g":
    case "G":
      return formatFloat(f, fmtChar === "F" ? "f" : fmtChar, prec, bitSize);
    case "b":
      return formatBinaryFloat(f, bitSize);
    default:
      return "%" + fmtChar;
  }
}
function formatBinaryFloat(f, bitSize) {
  let neg;
  let mant;
  let exp;
  if (bitSize === 32) {
    hexConv.setFloat32(0, f);
    const bits = hexConv.getUint32(0);
    neg = bits >>> 31 === 1;
    exp = bits >>> 23 & 255;
    mant = BigInt(bits & 8388607);
    if (exp === 0) {
      exp++;
    } else {
      mant |= 1n << 23n;
    }
    exp += -127 - 23;
  } else {
    hexConv.setFloat64(0, f);
    const hi = hexConv.getUint32(0);
    const lo = hexConv.getUint32(4);
    neg = hi >>> 31 === 1;
    exp = hi >>> 20 & 2047;
    mant = BigInt(hi & 1048575) << 32n | BigInt(lo >>> 0);
    if (exp === 0) {
      exp++;
    } else {
      mant |= 1n << 52n;
    }
    exp += -1023 - 52;
  }
  return (neg ? "-" : "") + mant.toString() + "p" + (exp >= 0 ? "+" : "") + String(exp);
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/strconv/itoa.gs.ts
function FormatUint(i, base) {
  if (base < 2 || base > 36) {
    throw new Error("FormatUint: illegal base");
  }
  const v = typeof i === "bigint" ? i : BigInt(Math.trunc(i));
  return BigInt.asUintN(64, v).toString(base);
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/unicode/tables.ts
var categoryData = {
  "C": [[[0, 31, 1], [127, 159, 1], [173, 888, 715], [889, 896, 7], [897, 899, 1], [907, 909, 2], [930, 1328, 398], [1367, 1368, 1], [1419, 1420, 1], [1424, 1480, 56], [1481, 1487, 1], [1515, 1518, 1], [1525, 1541, 1], [1564, 1757, 193], [1806, 1807, 1], [1867, 1868, 1], [1970, 1983, 1], [2043, 2044, 1], [2094, 2095, 1], [2111, 2140, 29], [2141, 2143, 2], [2155, 2159, 1], [2192, 2198, 1], [2274, 2436, 162], [2445, 2446, 1], [2449, 2450, 1], [2473, 2481, 8], [2483, 2485, 1], [2490, 2491, 1], [2501, 2502, 1], [2505, 2506, 1], [2511, 2518, 1], [2520, 2523, 1], [2526, 2532, 6], [2533, 2559, 26], [2560, 2564, 4], [2571, 2574, 1], [2577, 2578, 1], [2601, 2609, 8], [2612, 2618, 3], [2619, 2621, 2], [2627, 2630, 1], [2633, 2634, 1], [2638, 2640, 1], [2642, 2648, 1], [2653, 2655, 2], [2656, 2661, 1], [2679, 2688, 1], [2692, 2702, 10], [2706, 2729, 23], [2737, 2740, 3], [2746, 2747, 1], [2758, 2766, 4], [2767, 2769, 2], [2770, 2783, 1], [2788, 2789, 1], [2802, 2808, 1], [2816, 2820, 4], [2829, 2830, 1], [2833, 2834, 1], [2857, 2865, 8], [2868, 2874, 6], [2875, 2885, 10], [2886, 2889, 3], [2890, 2894, 4], [2895, 2900, 1], [2904, 2907, 1], [2910, 2916, 6], [2917, 2936, 19], [2937, 2945, 1], [2948, 2955, 7], [2956, 2957, 1], [2961, 2966, 5], [2967, 2968, 1], [2971, 2973, 2], [2976, 2978, 1], [2981, 2983, 1], [2987, 2989, 1], [3002, 3005, 1], [3011, 3013, 1], [3017, 3022, 5], [3023, 3025, 2], [3026, 3030, 1], [3032, 3045, 1], [3067, 3071, 1], [3085, 3089, 4], [3113, 3130, 17], [3131, 3141, 10], [3145, 3150, 5], [3151, 3156, 1], [3159, 3163, 4], [3166, 3167, 1], [3172, 3173, 1], [3184, 3190, 1], [3213, 3217, 4], [3241, 3252, 11], [3258, 3259, 1], [3269, 3273, 4], [3278, 3284, 1], [3287, 3291, 1], [3295, 3300, 5], [3301, 3312, 11], [3316, 3327, 1], [3341, 3345, 4], [3397, 3401, 4], [3408, 3411, 1], [3428, 3429, 1], [3456, 3460, 4], [3479, 3481, 1], [3506, 3516, 10], [3518, 3519, 1], [3527, 3529, 1], [3531, 3534, 1], [3541, 3543, 2], [3552, 3557, 1], [3568, 3569, 1], [3573, 3584, 1], [3643, 3646, 1], [3676, 3712, 1], [3715, 3717, 2], [3723, 3748, 25], [3750, 3774, 24], [3775, 3781, 6], [3783, 3791, 8], [3802, 3803, 1], [3808, 3839, 1], [3912, 3949, 37], [3950, 3952, 1], [3992, 4029, 37], [4045, 4059, 14], [4060, 4095, 1], [4294, 4296, 2], [4297, 4300, 1], [4302, 4303, 1], [4681, 4686, 5], [4687, 4695, 8], [4697, 4702, 5], [4703, 4745, 42], [4750, 4751, 1], [4785, 4790, 5], [4791, 4799, 8], [4801, 4806, 5], [4807, 4823, 16], [4881, 4886, 5], [4887, 4955, 68], [4956, 4989, 33], [4990, 4991, 1], [5018, 5023, 1], [5110, 5111, 1], [5118, 5119, 1], [5789, 5791, 1], [5881, 5887, 1], [5910, 5918, 1], [5943, 5951, 1], [5972, 5983, 1], [5997, 6001, 4], [6004, 6015, 1], [6110, 6111, 1], [6122, 6127, 1], [6138, 6143, 1], [6158, 6170, 12], [6171, 6175, 1], [6265, 6271, 1], [6315, 6319, 1], [6390, 6399, 1], [6431, 6444, 13], [6445, 6447, 1], [6460, 6463, 1], [6465, 6467, 1], [6510, 6511, 1], [6517, 6527, 1], [6572, 6575, 1], [6602, 6607, 1], [6619, 6621, 1], [6684, 6685, 1], [6751, 6781, 30], [6782, 6794, 12], [6795, 6799, 1], [6810, 6815, 1], [6830, 6831, 1], [6878, 6879, 1], [6892, 6911, 1], [6989, 7156, 167], [7157, 7163, 1], [7224, 7226, 1], [7242, 7244, 1], [7307, 7311, 1], [7355, 7356, 1], [7368, 7375, 1], [7419, 7423, 1], [7958, 7959, 1], [7966, 7967, 1], [8006, 8007, 1], [8014, 8015, 1], [8024, 8030, 2], [8062, 8063, 1], [8117, 8133, 16], [8148, 8149, 1], [8156, 8176, 20], [8177, 8181, 4], [8191, 8203, 12], [8204, 8207, 1], [8234, 8238, 1], [8288, 8303, 1], [8306, 8307, 1], [8335, 8349, 14], [8350, 8351, 1], [8386, 8399, 1], [8433, 8447, 1], [8588, 8591, 1], [9258, 9279, 1], [9291, 9311, 1], [11124, 11125, 1], [11508, 11512, 1], [11558, 11560, 2], [11561, 11564, 1], [11566, 11567, 1], [11624, 11630, 1], [11633, 11646, 1], [11671, 11679, 1], [11687, 11743, 8], [11870, 11903, 1], [11930, 12020, 90], [12021, 12031, 1], [12246, 12271, 1], [12352, 12439, 87], [12440, 12544, 104], [12545, 12548, 1], [12592, 12687, 95], [12774, 12782, 1], [12831, 42125, 29294], [42126, 42127, 1], [42183, 42191, 1], [42540, 42559, 1], [42744, 42751, 1], [42973, 42992, 1], [43053, 43055, 1], [43066, 43071, 1], [43128, 43135, 1], [43206, 43213, 1], [43226, 43231, 1], [43348, 43358, 1], [43389, 43391, 1], [43470, 43482, 12], [43483, 43485, 1], [43519, 43575, 56], [43576, 43583, 1], [43598, 43599, 1], [43610, 43611, 1], [43715, 43738, 1], [43767, 43776, 1], [43783, 43784, 1], [43791, 43792, 1], [43799, 43807, 1], [43815, 43823, 8], [43884, 43887, 1], [44014, 44015, 1], [44026, 44031, 1], [55204, 55215, 1], [55239, 55242, 1], [55292, 63743, 1], [64110, 64111, 1], [64218, 64255, 1], [64263, 64274, 1], [64280, 64284, 1], [64311, 64317, 6], [64319, 64325, 3], [64976, 65007, 1], [65050, 65055, 1], [65107, 65127, 20], [65132, 65135, 1], [65141, 65277, 136], [65278, 65280, 1], [65471, 65473, 1], [65480, 65481, 1], [65488, 65489, 1], [65496, 65497, 1], [65501, 65503, 1], [65511, 65519, 8], [65520, 65531, 1], [65534, 65535, 1]], [[65548, 65575, 27], [65595, 65598, 3], [65614, 65615, 1], [65630, 65663, 1], [65787, 65791, 1], [65795, 65798, 1], [65844, 65846, 1], [65935, 65949, 14], [65950, 65951, 1], [65953, 65999, 1], [66046, 66175, 1], [66205, 66207, 1], [66257, 66271, 1], [66300, 66303, 1], [66340, 66348, 1], [66379, 66383, 1], [66427, 66431, 1], [66462, 66500, 38], [66501, 66503, 1], [66518, 66559, 1], [66718, 66719, 1], [66730, 66735, 1], [66772, 66775, 1], [66812, 66815, 1], [66856, 66863, 1], [66916, 66926, 1], [66939, 66955, 16], [66963, 66966, 3], [66978, 66994, 16], [67002, 67005, 3], [67006, 67007, 1], [67060, 67071, 1], [67383, 67391, 1], [67414, 67423, 1], [67432, 67455, 1], [67462, 67505, 43], [67515, 67583, 1], [67590, 67591, 1], [67593, 67638, 45], [67641, 67643, 1], [67645, 67646, 1], [67670, 67743, 73], [67744, 67750, 1], [67760, 67807, 1], [67827, 67830, 3], [67831, 67834, 1], [67868, 67870, 1], [67898, 67902, 1], [67930, 67967, 1], [68024, 68027, 1], [68048, 68049, 1], [68100, 68103, 3], [68104, 68107, 1], [68116, 68120, 4], [68150, 68151, 1], [68155, 68158, 1], [68169, 68175, 1], [68185, 68191, 1], [68256, 68287, 1], [68327, 68330, 1], [68343, 68351, 1], [68406, 68408, 1], [68438, 68439, 1], [68467, 68471, 1], [68498, 68504, 1], [68509, 68520, 1], [68528, 68607, 1], [68681, 68735, 1], [68787, 68799, 1], [68851, 68857, 1], [68904, 68911, 1], [68922, 68927, 1], [68966, 68968, 1], [68998, 69005, 1], [69008, 69215, 1], [69247, 69290, 43], [69294, 69295, 1], [69298, 69313, 1], [69320, 69327, 1], [69337, 69369, 1], [69416, 69423, 1], [69466, 69487, 1], [69514, 69551, 1], [69580, 69599, 1], [69623, 69631, 1], [69710, 69713, 1], [69750, 69758, 1], [69821, 69827, 6], [69828, 69839, 1], [69865, 69871, 1], [69882, 69887, 1], [69941, 69960, 19], [69961, 69967, 1], [70007, 70015, 1], [70112, 70133, 21], [70134, 70143, 1], [70162, 70210, 48], [70211, 70271, 1], [70279, 70281, 2], [70286, 70302, 16], [70314, 70319, 1], [70379, 70383, 1], [70394, 70399, 1], [70404, 70413, 9], [70414, 70417, 3], [70418, 70441, 23], [70449, 70452, 3], [70458, 70469, 11], [70470, 70473, 3], [70474, 70478, 4], [70479, 70481, 2], [70482, 70486, 1], [70488, 70492, 1], [70500, 70501, 1], [70509, 70511, 1], [70517, 70527, 1], [70538, 70540, 2], [70541, 70543, 2], [70582, 70593, 11], [70595, 70596, 1], [70598, 70603, 5], [70614, 70617, 3], [70618, 70624, 1], [70627, 70655, 1], [70748, 70754, 6], [70755, 70783, 1], [70856, 70863, 1], [70874, 71039, 1], [71094, 71095, 1], [71134, 71167, 1], [71237, 71247, 1], [71258, 71263, 1], [71277, 71295, 1], [71354, 71359, 1], [71370, 71375, 1], [71396, 71423, 1], [71451, 71452, 1], [71468, 71471, 1], [71495, 71679, 1], [71740, 71839, 1], [71923, 71934, 1], [71943, 71944, 1], [71946, 71947, 1], [71956, 71959, 3], [71990, 71993, 3], [71994, 72007, 13], [72008, 72015, 1], [72026, 72095, 1], [72104, 72105, 1], [72152, 72153, 1], [72165, 72191, 1], [72264, 72271, 1], [72355, 72367, 1], [72441, 72447, 1], [72458, 72543, 1], [72552, 72639, 1], [72674, 72687, 1], [72698, 72703, 1], [72713, 72759, 46], [72774, 72783, 1], [72813, 72815, 1], [72848, 72849, 1], [72872, 72887, 15], [72888, 72959, 1], [72967, 72970, 3], [73015, 73017, 1], [73019, 73022, 3], [73032, 73039, 1], [73050, 73055, 1], [73062, 73065, 3], [73103, 73106, 3], [73113, 73119, 1], [73130, 73135, 1], [73180, 73183, 1], [73194, 73439, 1], [73465, 73471, 1], [73489, 73531, 42], [73532, 73533, 1], [73563, 73647, 1], [73649, 73663, 1], [73714, 73726, 1], [74650, 74751, 1], [74863, 74869, 6], [74870, 74879, 1], [75076, 77711, 1], [77811, 77823, 1], [78896, 78911, 1], [78934, 78943, 1], [82939, 82943, 1], [83527, 90367, 1], [90426, 92159, 1], [92729, 92735, 1], [92767, 92778, 11], [92779, 92781, 1], [92863, 92874, 11], [92875, 92879, 1], [92910, 92911, 1], [92918, 92927, 1], [92998, 93007, 1], [93018, 93026, 8], [93048, 93052, 1], [93072, 93503, 1], [93562, 93759, 1], [93851, 93855, 1], [93881, 93882, 1], [93908, 93951, 1], [94027, 94030, 1], [94088, 94094, 1], [94112, 94175, 1], [94181, 94191, 1], [94199, 94207, 1], [101590, 101630, 1], [101663, 101759, 1], [101875, 110575, 1], [110580, 110588, 8], [110591, 110883, 292], [110884, 110897, 1], [110899, 110927, 1], [110931, 110932, 1], [110934, 110947, 1], [110952, 110959, 1], [111356, 113663, 1], [113771, 113775, 1], [113789, 113791, 1], [113801, 113807, 1], [113818, 113819, 1], [113824, 117759, 1], [118013, 118015, 1], [118452, 118457, 1], [118481, 118495, 1], [118513, 118527, 1], [118574, 118575, 1], [118599, 118607, 1], [118724, 118783, 1], [119030, 119039, 1], [119079, 119080, 1], [119155, 119162, 1], [119275, 119295, 1], [119366, 119487, 1], [119508, 119519, 1], [119540, 119551, 1], [119639, 119647, 1], [119673, 119807, 1], [119893, 119965, 72], [119968, 119969, 1], [119971, 119972, 1], [119975, 119976, 1], [119981, 119994, 13], [119996, 120004, 8], [120070, 120075, 5], [120076, 120085, 9], [120093, 120122, 29], [120127, 120133, 6], [120135, 120137, 1], [120145, 120486, 341], [120487, 120780, 293], [120781, 121484, 703], [121485, 121498, 1], [121504, 121520, 16], [121521, 122623, 1], [122655, 122660, 1], [122667, 122879, 1], [122887, 122905, 18], [122906, 122914, 8], [122917, 122923, 6], [122924, 122927, 1], [122990, 123022, 1], [123024, 123135, 1], [123181, 123183, 1], [123198, 123199, 1], [123210, 123213, 1], [123216, 123535, 1], [123567, 123583, 1], [123642, 123646, 1], [123648, 124111, 1], [124154, 124367, 1], [124411, 124414, 1], [124416, 124607, 1], [124639, 124662, 23], [124663, 124669, 1], [124672, 124895, 1], [124903, 124908, 5], [124911, 124927, 16], [125125, 125126, 1], [125143, 125183, 1], [125260, 125263, 1], [125274, 125277, 1], [125280, 126064, 1], [126133, 126208, 1], [126270, 126463, 1], [126468, 126496, 28], [126499, 126501, 2], [126502, 126504, 2], [126515, 126520, 5], [126522, 126524, 2], [126525, 126529, 1], [126531, 126534, 1], [126536, 126540, 2], [126544, 126547, 3], [126549, 126550, 1], [126552, 126560, 2], [126563, 126565, 2], [126566, 126571, 5], [126579, 126589, 5], [126591, 126602, 11], [126620, 126624, 1], [126628, 126634, 6], [126652, 126703, 1], [126706, 126975, 1], [127020, 127023, 1], [127124, 127135, 1], [127151, 127152, 1], [127168, 127184, 16], [127222, 127231, 1], [127406, 127461, 1], [127491, 127503, 1], [127548, 127551, 1], [127561, 127567, 1], [127570, 127583, 1], [127590, 127743, 1], [128729, 128731, 1], [128749, 128751, 1], [128765, 128767, 1], [128986, 128991, 1], [129004, 129007, 1], [129009, 129023, 1], [129036, 129039, 1], [129096, 129103, 1], [129114, 129119, 1], [129160, 129167, 1], [129198, 129199, 1], [129212, 129215, 1], [129218, 129231, 1], [129241, 129279, 1], [129624, 129631, 1], [129646, 129647, 1], [129661, 129663, 1], [129675, 129677, 1], [129735, 129737, 2], [129738, 129740, 1], [129757, 129758, 1], [129771, 129774, 1], [129785, 129791, 1], [129939, 130043, 104], [130044, 131071, 1], [173792, 173823, 1], [178206, 178207, 1], [183982, 183983, 1], [191457, 191471, 1], [192094, 194559, 1], [195102, 196607, 1], [201547, 201551, 1], [210042, 917759, 1], [918e3, 1114111, 1]], 2],
  "Cc": [[[0, 31, 1], [127, 159, 1]], [], 2],
  "Cf": [[[173, 1536, 1363], [1537, 1541, 1], [1564, 1757, 193], [1807, 2192, 385], [2193, 2274, 81], [6158, 8203, 2045], [8204, 8207, 1], [8234, 8238, 1], [8288, 8292, 1], [8294, 8303, 1], [65279, 65529, 250], [65530, 65531, 1]], [[69821, 69837, 16], [78896, 78911, 1], [113824, 113827, 1], [119155, 119162, 1], [917505, 917536, 31], [917537, 917631, 1]], 0],
  "Cn": [[[888, 889, 1], [896, 899, 1], [907, 909, 2], [930, 1328, 398], [1367, 1368, 1], [1419, 1420, 1], [1424, 1480, 56], [1481, 1487, 1], [1515, 1518, 1], [1525, 1535, 1], [1806, 1867, 61], [1868, 1970, 102], [1971, 1983, 1], [2043, 2044, 1], [2094, 2095, 1], [2111, 2140, 29], [2141, 2143, 2], [2155, 2159, 1], [2194, 2198, 1], [2436, 2445, 9], [2446, 2449, 3], [2450, 2473, 23], [2481, 2483, 2], [2484, 2485, 1], [2490, 2491, 1], [2501, 2502, 1], [2505, 2506, 1], [2511, 2518, 1], [2520, 2523, 1], [2526, 2532, 6], [2533, 2559, 26], [2560, 2564, 4], [2571, 2574, 1], [2577, 2578, 1], [2601, 2609, 8], [2612, 2618, 3], [2619, 2621, 2], [2627, 2630, 1], [2633, 2634, 1], [2638, 2640, 1], [2642, 2648, 1], [2653, 2655, 2], [2656, 2661, 1], [2679, 2688, 1], [2692, 2702, 10], [2706, 2729, 23], [2737, 2740, 3], [2746, 2747, 1], [2758, 2766, 4], [2767, 2769, 2], [2770, 2783, 1], [2788, 2789, 1], [2802, 2808, 1], [2816, 2820, 4], [2829, 2830, 1], [2833, 2834, 1], [2857, 2865, 8], [2868, 2874, 6], [2875, 2885, 10], [2886, 2889, 3], [2890, 2894, 4], [2895, 2900, 1], [2904, 2907, 1], [2910, 2916, 6], [2917, 2936, 19], [2937, 2945, 1], [2948, 2955, 7], [2956, 2957, 1], [2961, 2966, 5], [2967, 2968, 1], [2971, 2973, 2], [2976, 2978, 1], [2981, 2983, 1], [2987, 2989, 1], [3002, 3005, 1], [3011, 3013, 1], [3017, 3022, 5], [3023, 3025, 2], [3026, 3030, 1], [3032, 3045, 1], [3067, 3071, 1], [3085, 3089, 4], [3113, 3130, 17], [3131, 3141, 10], [3145, 3150, 5], [3151, 3156, 1], [3159, 3163, 4], [3166, 3167, 1], [3172, 3173, 1], [3184, 3190, 1], [3213, 3217, 4], [3241, 3252, 11], [3258, 3259, 1], [3269, 3273, 4], [3278, 3284, 1], [3287, 3291, 1], [3295, 3300, 5], [3301, 3312, 11], [3316, 3327, 1], [3341, 3345, 4], [3397, 3401, 4], [3408, 3411, 1], [3428, 3429, 1], [3456, 3460, 4], [3479, 3481, 1], [3506, 3516, 10], [3518, 3519, 1], [3527, 3529, 1], [3531, 3534, 1], [3541, 3543, 2], [3552, 3557, 1], [3568, 3569, 1], [3573, 3584, 1], [3643, 3646, 1], [3676, 3712, 1], [3715, 3717, 2], [3723, 3748, 25], [3750, 3774, 24], [3775, 3781, 6], [3783, 3791, 8], [3802, 3803, 1], [3808, 3839, 1], [3912, 3949, 37], [3950, 3952, 1], [3992, 4029, 37], [4045, 4059, 14], [4060, 4095, 1], [4294, 4296, 2], [4297, 4300, 1], [4302, 4303, 1], [4681, 4686, 5], [4687, 4695, 8], [4697, 4702, 5], [4703, 4745, 42], [4750, 4751, 1], [4785, 4790, 5], [4791, 4799, 8], [4801, 4806, 5], [4807, 4823, 16], [4881, 4886, 5], [4887, 4955, 68], [4956, 4989, 33], [4990, 4991, 1], [5018, 5023, 1], [5110, 5111, 1], [5118, 5119, 1], [5789, 5791, 1], [5881, 5887, 1], [5910, 5918, 1], [5943, 5951, 1], [5972, 5983, 1], [5997, 6001, 4], [6004, 6015, 1], [6110, 6111, 1], [6122, 6127, 1], [6138, 6143, 1], [6170, 6175, 1], [6265, 6271, 1], [6315, 6319, 1], [6390, 6399, 1], [6431, 6444, 13], [6445, 6447, 1], [6460, 6463, 1], [6465, 6467, 1], [6510, 6511, 1], [6517, 6527, 1], [6572, 6575, 1], [6602, 6607, 1], [6619, 6621, 1], [6684, 6685, 1], [6751, 6781, 30], [6782, 6794, 12], [6795, 6799, 1], [6810, 6815, 1], [6830, 6831, 1], [6878, 6879, 1], [6892, 6911, 1], [6989, 7156, 167], [7157, 7163, 1], [7224, 7226, 1], [7242, 7244, 1], [7307, 7311, 1], [7355, 7356, 1], [7368, 7375, 1], [7419, 7423, 1], [7958, 7959, 1], [7966, 7967, 1], [8006, 8007, 1], [8014, 8015, 1], [8024, 8030, 2], [8062, 8063, 1], [8117, 8133, 16], [8148, 8149, 1], [8156, 8176, 20], [8177, 8181, 4], [8191, 8293, 102], [8306, 8307, 1], [8335, 8349, 14], [8350, 8351, 1], [8386, 8399, 1], [8433, 8447, 1], [8588, 8591, 1], [9258, 9279, 1], [9291, 9311, 1], [11124, 11125, 1], [11508, 11512, 1], [11558, 11560, 2], [11561, 11564, 1], [11566, 11567, 1], [11624, 11630, 1], [11633, 11646, 1], [11671, 11679, 1], [11687, 11743, 8], [11870, 11903, 1], [11930, 12020, 90], [12021, 12031, 1], [12246, 12271, 1], [12352, 12439, 87], [12440, 12544, 104], [12545, 12548, 1], [12592, 12687, 95], [12774, 12782, 1], [12831, 42125, 29294], [42126, 42127, 1], [42183, 42191, 1], [42540, 42559, 1], [42744, 42751, 1], [42973, 42992, 1], [43053, 43055, 1], [43066, 43071, 1], [43128, 43135, 1], [43206, 43213, 1], [43226, 43231, 1], [43348, 43358, 1], [43389, 43391, 1], [43470, 43482, 12], [43483, 43485, 1], [43519, 43575, 56], [43576, 43583, 1], [43598, 43599, 1], [43610, 43611, 1], [43715, 43738, 1], [43767, 43776, 1], [43783, 43784, 1], [43791, 43792, 1], [43799, 43807, 1], [43815, 43823, 8], [43884, 43887, 1], [44014, 44015, 1], [44026, 44031, 1], [55204, 55215, 1], [55239, 55242, 1], [55292, 55295, 1], [64110, 64111, 1], [64218, 64255, 1], [64263, 64274, 1], [64280, 64284, 1], [64311, 64317, 6], [64319, 64325, 3], [64976, 65007, 1], [65050, 65055, 1], [65107, 65127, 20], [65132, 65135, 1], [65141, 65277, 136], [65278, 65280, 2], [65471, 65473, 1], [65480, 65481, 1], [65488, 65489, 1], [65496, 65497, 1], [65501, 65503, 1], [65511, 65519, 8], [65520, 65528, 1], [65534, 65535, 1]], [[65548, 65575, 27], [65595, 65598, 3], [65614, 65615, 1], [65630, 65663, 1], [65787, 65791, 1], [65795, 65798, 1], [65844, 65846, 1], [65935, 65949, 14], [65950, 65951, 1], [65953, 65999, 1], [66046, 66175, 1], [66205, 66207, 1], [66257, 66271, 1], [66300, 66303, 1], [66340, 66348, 1], [66379, 66383, 1], [66427, 66431, 1], [66462, 66500, 38], [66501, 66503, 1], [66518, 66559, 1], [66718, 66719, 1], [66730, 66735, 1], [66772, 66775, 1], [66812, 66815, 1], [66856, 66863, 1], [66916, 66926, 1], [66939, 66955, 16], [66963, 66966, 3], [66978, 66994, 16], [67002, 67005, 3], [67006, 67007, 1], [67060, 67071, 1], [67383, 67391, 1], [67414, 67423, 1], [67432, 67455, 1], [67462, 67505, 43], [67515, 67583, 1], [67590, 67591, 1], [67593, 67638, 45], [67641, 67643, 1], [67645, 67646, 1], [67670, 67743, 73], [67744, 67750, 1], [67760, 67807, 1], [67827, 67830, 3], [67831, 67834, 1], [67868, 67870, 1], [67898, 67902, 1], [67930, 67967, 1], [68024, 68027, 1], [68048, 68049, 1], [68100, 68103, 3], [68104, 68107, 1], [68116, 68120, 4], [68150, 68151, 1], [68155, 68158, 1], [68169, 68175, 1], [68185, 68191, 1], [68256, 68287, 1], [68327, 68330, 1], [68343, 68351, 1], [68406, 68408, 1], [68438, 68439, 1], [68467, 68471, 1], [68498, 68504, 1], [68509, 68520, 1], [68528, 68607, 1], [68681, 68735, 1], [68787, 68799, 1], [68851, 68857, 1], [68904, 68911, 1], [68922, 68927, 1], [68966, 68968, 1], [68998, 69005, 1], [69008, 69215, 1], [69247, 69290, 43], [69294, 69295, 1], [69298, 69313, 1], [69320, 69327, 1], [69337, 69369, 1], [69416, 69423, 1], [69466, 69487, 1], [69514, 69551, 1], [69580, 69599, 1], [69623, 69631, 1], [69710, 69713, 1], [69750, 69758, 1], [69827, 69836, 1], [69838, 69839, 1], [69865, 69871, 1], [69882, 69887, 1], [69941, 69960, 19], [69961, 69967, 1], [70007, 70015, 1], [70112, 70133, 21], [70134, 70143, 1], [70162, 70210, 48], [70211, 70271, 1], [70279, 70281, 2], [70286, 70302, 16], [70314, 70319, 1], [70379, 70383, 1], [70394, 70399, 1], [70404, 70413, 9], [70414, 70417, 3], [70418, 70441, 23], [70449, 70452, 3], [70458, 70469, 11], [70470, 70473, 3], [70474, 70478, 4], [70479, 70481, 2], [70482, 70486, 1], [70488, 70492, 1], [70500, 70501, 1], [70509, 70511, 1], [70517, 70527, 1], [70538, 70540, 2], [70541, 70543, 2], [70582, 70593, 11], [70595, 70596, 1], [70598, 70603, 5], [70614, 70617, 3], [70618, 70624, 1], [70627, 70655, 1], [70748, 70754, 6], [70755, 70783, 1], [70856, 70863, 1], [70874, 71039, 1], [71094, 71095, 1], [71134, 71167, 1], [71237, 71247, 1], [71258, 71263, 1], [71277, 71295, 1], [71354, 71359, 1], [71370, 71375, 1], [71396, 71423, 1], [71451, 71452, 1], [71468, 71471, 1], [71495, 71679, 1], [71740, 71839, 1], [71923, 71934, 1], [71943, 71944, 1], [71946, 71947, 1], [71956, 71959, 3], [71990, 71993, 3], [71994, 72007, 13], [72008, 72015, 1], [72026, 72095, 1], [72104, 72105, 1], [72152, 72153, 1], [72165, 72191, 1], [72264, 72271, 1], [72355, 72367, 1], [72441, 72447, 1], [72458, 72543, 1], [72552, 72639, 1], [72674, 72687, 1], [72698, 72703, 1], [72713, 72759, 46], [72774, 72783, 1], [72813, 72815, 1], [72848, 72849, 1], [72872, 72887, 15], [72888, 72959, 1], [72967, 72970, 3], [73015, 73017, 1], [73019, 73022, 3], [73032, 73039, 1], [73050, 73055, 1], [73062, 73065, 3], [73103, 73106, 3], [73113, 73119, 1], [73130, 73135, 1], [73180, 73183, 1], [73194, 73439, 1], [73465, 73471, 1], [73489, 73531, 42], [73532, 73533, 1], [73563, 73647, 1], [73649, 73663, 1], [73714, 73726, 1], [74650, 74751, 1], [74863, 74869, 6], [74870, 74879, 1], [75076, 77711, 1], [77811, 77823, 1], [78934, 78943, 1], [82939, 82943, 1], [83527, 90367, 1], [90426, 92159, 1], [92729, 92735, 1], [92767, 92778, 11], [92779, 92781, 1], [92863, 92874, 11], [92875, 92879, 1], [92910, 92911, 1], [92918, 92927, 1], [92998, 93007, 1], [93018, 93026, 8], [93048, 93052, 1], [93072, 93503, 1], [93562, 93759, 1], [93851, 93855, 1], [93881, 93882, 1], [93908, 93951, 1], [94027, 94030, 1], [94088, 94094, 1], [94112, 94175, 1], [94181, 94191, 1], [94199, 94207, 1], [101590, 101630, 1], [101663, 101759, 1], [101875, 110575, 1], [110580, 110588, 8], [110591, 110883, 292], [110884, 110897, 1], [110899, 110927, 1], [110931, 110932, 1], [110934, 110947, 1], [110952, 110959, 1], [111356, 113663, 1], [113771, 113775, 1], [113789, 113791, 1], [113801, 113807, 1], [113818, 113819, 1], [113828, 117759, 1], [118013, 118015, 1], [118452, 118457, 1], [118481, 118495, 1], [118513, 118527, 1], [118574, 118575, 1], [118599, 118607, 1], [118724, 118783, 1], [119030, 119039, 1], [119079, 119080, 1], [119275, 119295, 1], [119366, 119487, 1], [119508, 119519, 1], [119540, 119551, 1], [119639, 119647, 1], [119673, 119807, 1], [119893, 119965, 72], [119968, 119969, 1], [119971, 119972, 1], [119975, 119976, 1], [119981, 119994, 13], [119996, 120004, 8], [120070, 120075, 5], [120076, 120085, 9], [120093, 120122, 29], [120127, 120133, 6], [120135, 120137, 1], [120145, 120486, 341], [120487, 120780, 293], [120781, 121484, 703], [121485, 121498, 1], [121504, 121520, 16], [121521, 122623, 1], [122655, 122660, 1], [122667, 122879, 1], [122887, 122905, 18], [122906, 122914, 8], [122917, 122923, 6], [122924, 122927, 1], [122990, 123022, 1], [123024, 123135, 1], [123181, 123183, 1], [123198, 123199, 1], [123210, 123213, 1], [123216, 123535, 1], [123567, 123583, 1], [123642, 123646, 1], [123648, 124111, 1], [124154, 124367, 1], [124411, 124414, 1], [124416, 124607, 1], [124639, 124662, 23], [124663, 124669, 1], [124672, 124895, 1], [124903, 124908, 5], [124911, 124927, 16], [125125, 125126, 1], [125143, 125183, 1], [125260, 125263, 1], [125274, 125277, 1], [125280, 126064, 1], [126133, 126208, 1], [126270, 126463, 1], [126468, 126496, 28], [126499, 126501, 2], [126502, 126504, 2], [126515, 126520, 5], [126522, 126524, 2], [126525, 126529, 1], [126531, 126534, 1], [126536, 126540, 2], [126544, 126547, 3], [126549, 126550, 1], [126552, 126560, 2], [126563, 126565, 2], [126566, 126571, 5], [126579, 126589, 5], [126591, 126602, 11], [126620, 126624, 1], [126628, 126634, 6], [126652, 126703, 1], [126706, 126975, 1], [127020, 127023, 1], [127124, 127135, 1], [127151, 127152, 1], [127168, 127184, 16], [127222, 127231, 1], [127406, 127461, 1], [127491, 127503, 1], [127548, 127551, 1], [127561, 127567, 1], [127570, 127583, 1], [127590, 127743, 1], [128729, 128731, 1], [128749, 128751, 1], [128765, 128767, 1], [128986, 128991, 1], [129004, 129007, 1], [129009, 129023, 1], [129036, 129039, 1], [129096, 129103, 1], [129114, 129119, 1], [129160, 129167, 1], [129198, 129199, 1], [129212, 129215, 1], [129218, 129231, 1], [129241, 129279, 1], [129624, 129631, 1], [129646, 129647, 1], [129661, 129663, 1], [129675, 129677, 1], [129735, 129737, 2], [129738, 129740, 1], [129757, 129758, 1], [129771, 129774, 1], [129785, 129791, 1], [129939, 130043, 104], [130044, 131071, 1], [173792, 173823, 1], [178206, 178207, 1], [183982, 183983, 1], [191457, 191471, 1], [192094, 194559, 1], [195102, 196607, 1], [201547, 201551, 1], [210042, 917504, 1], [917506, 917535, 1], [917632, 917759, 1], [918e3, 983039, 1], [1048574, 1048575, 1], [1114110, 1114111, 1]], 0],
  "Co": [[[57344, 63743, 1]], [[983040, 1048573, 1], [1048576, 1114109, 1]], 0],
  "Cs": [[[55296, 57343, 1]], [], 0],
  "L": [[[65, 90, 1], [97, 122, 1], [170, 181, 11], [186, 192, 6], [193, 214, 1], [216, 246, 1], [248, 705, 1], [710, 721, 1], [736, 740, 1], [748, 750, 2], [880, 884, 1], [886, 887, 1], [890, 893, 1], [895, 902, 7], [904, 906, 1], [908, 910, 2], [911, 929, 1], [931, 1013, 1], [1015, 1153, 1], [1162, 1327, 1], [1329, 1366, 1], [1369, 1376, 7], [1377, 1416, 1], [1488, 1514, 1], [1519, 1522, 1], [1568, 1610, 1], [1646, 1647, 1], [1649, 1747, 1], [1749, 1765, 16], [1766, 1774, 8], [1775, 1786, 11], [1787, 1788, 1], [1791, 1808, 17], [1810, 1839, 1], [1869, 1957, 1], [1969, 1994, 25], [1995, 2026, 1], [2036, 2037, 1], [2042, 2048, 6], [2049, 2069, 1], [2074, 2084, 10], [2088, 2112, 24], [2113, 2136, 1], [2144, 2154, 1], [2160, 2183, 1], [2185, 2191, 1], [2208, 2249, 1], [2308, 2361, 1], [2365, 2384, 19], [2392, 2401, 1], [2417, 2432, 1], [2437, 2444, 1], [2447, 2448, 1], [2451, 2472, 1], [2474, 2480, 1], [2482, 2486, 4], [2487, 2489, 1], [2493, 2510, 17], [2524, 2525, 1], [2527, 2529, 1], [2544, 2545, 1], [2556, 2565, 9], [2566, 2570, 1], [2575, 2576, 1], [2579, 2600, 1], [2602, 2608, 1], [2610, 2611, 1], [2613, 2614, 1], [2616, 2617, 1], [2649, 2652, 1], [2654, 2674, 20], [2675, 2676, 1], [2693, 2701, 1], [2703, 2705, 1], [2707, 2728, 1], [2730, 2736, 1], [2738, 2739, 1], [2741, 2745, 1], [2749, 2768, 19], [2784, 2785, 1], [2809, 2821, 12], [2822, 2828, 1], [2831, 2832, 1], [2835, 2856, 1], [2858, 2864, 1], [2866, 2867, 1], [2869, 2873, 1], [2877, 2908, 31], [2909, 2911, 2], [2912, 2913, 1], [2929, 2947, 18], [2949, 2954, 1], [2958, 2960, 1], [2962, 2965, 1], [2969, 2970, 1], [2972, 2974, 2], [2975, 2979, 4], [2980, 2984, 4], [2985, 2986, 1], [2990, 3001, 1], [3024, 3077, 53], [3078, 3084, 1], [3086, 3088, 1], [3090, 3112, 1], [3114, 3129, 1], [3133, 3160, 27], [3161, 3162, 1], [3164, 3165, 1], [3168, 3169, 1], [3200, 3205, 5], [3206, 3212, 1], [3214, 3216, 1], [3218, 3240, 1], [3242, 3251, 1], [3253, 3257, 1], [3261, 3292, 31], [3293, 3294, 1], [3296, 3297, 1], [3313, 3314, 1], [3332, 3340, 1], [3342, 3344, 1], [3346, 3386, 1], [3389, 3406, 17], [3412, 3414, 1], [3423, 3425, 1], [3450, 3455, 1], [3461, 3478, 1], [3482, 3505, 1], [3507, 3515, 1], [3517, 3520, 3], [3521, 3526, 1], [3585, 3632, 1], [3634, 3635, 1], [3648, 3654, 1], [3713, 3714, 1], [3716, 3718, 2], [3719, 3722, 1], [3724, 3747, 1], [3749, 3751, 2], [3752, 3760, 1], [3762, 3763, 1], [3773, 3776, 3], [3777, 3780, 1], [3782, 3804, 22], [3805, 3807, 1], [3840, 3904, 64], [3905, 3911, 1], [3913, 3948, 1], [3976, 3980, 1], [4096, 4138, 1], [4159, 4176, 17], [4177, 4181, 1], [4186, 4189, 1], [4193, 4197, 4], [4198, 4206, 8], [4207, 4208, 1], [4213, 4225, 1], [4238, 4256, 18], [4257, 4293, 1], [4295, 4301, 6], [4304, 4346, 1], [4348, 4680, 1], [4682, 4685, 1], [4688, 4694, 1], [4696, 4698, 2], [4699, 4701, 1], [4704, 4744, 1], [4746, 4749, 1], [4752, 4784, 1], [4786, 4789, 1], [4792, 4798, 1], [4800, 4802, 2], [4803, 4805, 1], [4808, 4822, 1], [4824, 4880, 1], [4882, 4885, 1], [4888, 4954, 1], [4992, 5007, 1], [5024, 5109, 1], [5112, 5117, 1], [5121, 5740, 1], [5743, 5759, 1], [5761, 5786, 1], [5792, 5866, 1], [5873, 5880, 1], [5888, 5905, 1], [5919, 5937, 1], [5952, 5969, 1], [5984, 5996, 1], [5998, 6e3, 1], [6016, 6067, 1], [6103, 6108, 5], [6176, 6264, 1], [6272, 6276, 1], [6279, 6312, 1], [6314, 6320, 6], [6321, 6389, 1], [6400, 6430, 1], [6480, 6509, 1], [6512, 6516, 1], [6528, 6571, 1], [6576, 6601, 1], [6656, 6678, 1], [6688, 6740, 1], [6823, 6917, 94], [6918, 6963, 1], [6981, 6988, 1], [7043, 7072, 1], [7086, 7087, 1], [7098, 7141, 1], [7168, 7203, 1], [7245, 7247, 1], [7258, 7293, 1], [7296, 7306, 1], [7312, 7354, 1], [7357, 7359, 1], [7401, 7404, 1], [7406, 7411, 1], [7413, 7414, 1], [7418, 7424, 6], [7425, 7615, 1], [7680, 7957, 1], [7960, 7965, 1], [7968, 8005, 1], [8008, 8013, 1], [8016, 8023, 1], [8025, 8031, 2], [8032, 8061, 1], [8064, 8116, 1], [8118, 8124, 1], [8126, 8130, 4], [8131, 8132, 1], [8134, 8140, 1], [8144, 8147, 1], [8150, 8155, 1], [8160, 8172, 1], [8178, 8180, 1], [8182, 8188, 1], [8305, 8319, 14], [8336, 8348, 1], [8450, 8455, 5], [8458, 8467, 1], [8469, 8473, 4], [8474, 8477, 1], [8484, 8490, 2], [8491, 8493, 1], [8495, 8505, 1], [8508, 8511, 1], [8517, 8521, 1], [8526, 8579, 53], [8580, 11264, 2684], [11265, 11492, 1], [11499, 11502, 1], [11506, 11507, 1], [11520, 11557, 1], [11559, 11565, 6], [11568, 11623, 1], [11631, 11648, 17], [11649, 11670, 1], [11680, 11686, 1], [11688, 11694, 1], [11696, 11702, 1], [11704, 11710, 1], [11712, 11718, 1], [11720, 11726, 1], [11728, 11734, 1], [11736, 11742, 1], [11823, 12293, 470], [12294, 12337, 43], [12338, 12341, 1], [12347, 12348, 1], [12353, 12438, 1], [12445, 12447, 1], [12449, 12538, 1], [12540, 12543, 1], [12549, 12591, 1], [12593, 12686, 1], [12704, 12735, 1], [12784, 12799, 1], [13312, 19903, 1], [19968, 42124, 1], [42192, 42237, 1], [42240, 42508, 1], [42512, 42527, 1], [42538, 42539, 1], [42560, 42606, 1], [42623, 42653, 1], [42656, 42725, 1], [42775, 42783, 1], [42786, 42888, 1], [42891, 42972, 1], [42993, 43009, 1], [43011, 43013, 1], [43015, 43018, 1], [43020, 43042, 1], [43072, 43123, 1], [43138, 43187, 1], [43250, 43255, 1], [43259, 43261, 2], [43262, 43274, 12], [43275, 43301, 1], [43312, 43334, 1], [43360, 43388, 1], [43396, 43442, 1], [43471, 43488, 17], [43489, 43492, 1], [43494, 43503, 1], [43514, 43518, 1], [43520, 43560, 1], [43584, 43586, 1], [43588, 43595, 1], [43616, 43638, 1], [43642, 43646, 4], [43647, 43695, 1], [43697, 43701, 4], [43702, 43705, 3], [43706, 43709, 1], [43712, 43714, 2], [43739, 43741, 1], [43744, 43754, 1], [43762, 43764, 1], [43777, 43782, 1], [43785, 43790, 1], [43793, 43798, 1], [43808, 43814, 1], [43816, 43822, 1], [43824, 43866, 1], [43868, 43881, 1], [43888, 44002, 1], [44032, 55203, 1], [55216, 55238, 1], [55243, 55291, 1], [63744, 64109, 1], [64112, 64217, 1], [64256, 64262, 1], [64275, 64279, 1], [64285, 64287, 2], [64288, 64296, 1], [64298, 64310, 1], [64312, 64316, 1], [64318, 64320, 2], [64321, 64323, 2], [64324, 64326, 2], [64327, 64433, 1], [64467, 64829, 1], [64848, 64911, 1], [64914, 64967, 1], [65008, 65019, 1], [65136, 65140, 1], [65142, 65276, 1], [65313, 65338, 1], [65345, 65370, 1], [65382, 65470, 1], [65474, 65479, 1], [65482, 65487, 1], [65490, 65495, 1], [65498, 65500, 1]], [[65536, 65547, 1], [65549, 65574, 1], [65576, 65594, 1], [65596, 65597, 1], [65599, 65613, 1], [65616, 65629, 1], [65664, 65786, 1], [66176, 66204, 1], [66208, 66256, 1], [66304, 66335, 1], [66349, 66368, 1], [66370, 66377, 1], [66384, 66421, 1], [66432, 66461, 1], [66464, 66499, 1], [66504, 66511, 1], [66560, 66717, 1], [66736, 66771, 1], [66776, 66811, 1], [66816, 66855, 1], [66864, 66915, 1], [66928, 66938, 1], [66940, 66954, 1], [66956, 66962, 1], [66964, 66965, 1], [66967, 66977, 1], [66979, 66993, 1], [66995, 67001, 1], [67003, 67004, 1], [67008, 67059, 1], [67072, 67382, 1], [67392, 67413, 1], [67424, 67431, 1], [67456, 67461, 1], [67463, 67504, 1], [67506, 67514, 1], [67584, 67589, 1], [67592, 67594, 2], [67595, 67637, 1], [67639, 67640, 1], [67644, 67647, 3], [67648, 67669, 1], [67680, 67702, 1], [67712, 67742, 1], [67808, 67826, 1], [67828, 67829, 1], [67840, 67861, 1], [67872, 67897, 1], [67904, 67929, 1], [67968, 68023, 1], [68030, 68031, 1], [68096, 68112, 16], [68113, 68115, 1], [68117, 68119, 1], [68121, 68149, 1], [68192, 68220, 1], [68224, 68252, 1], [68288, 68295, 1], [68297, 68324, 1], [68352, 68405, 1], [68416, 68437, 1], [68448, 68466, 1], [68480, 68497, 1], [68608, 68680, 1], [68736, 68786, 1], [68800, 68850, 1], [68864, 68899, 1], [68938, 68965, 1], [68975, 68997, 1], [69248, 69289, 1], [69296, 69297, 1], [69314, 69319, 1], [69376, 69404, 1], [69415, 69424, 9], [69425, 69445, 1], [69488, 69505, 1], [69552, 69572, 1], [69600, 69622, 1], [69635, 69687, 1], [69745, 69746, 1], [69749, 69763, 14], [69764, 69807, 1], [69840, 69864, 1], [69891, 69926, 1], [69956, 69959, 3], [69968, 70002, 1], [70006, 70019, 13], [70020, 70066, 1], [70081, 70084, 1], [70106, 70108, 2], [70144, 70161, 1], [70163, 70187, 1], [70207, 70208, 1], [70272, 70278, 1], [70280, 70282, 2], [70283, 70285, 1], [70287, 70301, 1], [70303, 70312, 1], [70320, 70366, 1], [70405, 70412, 1], [70415, 70416, 1], [70419, 70440, 1], [70442, 70448, 1], [70450, 70451, 1], [70453, 70457, 1], [70461, 70480, 19], [70493, 70497, 1], [70528, 70537, 1], [70539, 70542, 3], [70544, 70581, 1], [70583, 70609, 26], [70611, 70656, 45], [70657, 70708, 1], [70727, 70730, 1], [70751, 70753, 1], [70784, 70831, 1], [70852, 70853, 1], [70855, 71040, 185], [71041, 71086, 1], [71128, 71131, 1], [71168, 71215, 1], [71236, 71296, 60], [71297, 71338, 1], [71352, 71424, 72], [71425, 71450, 1], [71488, 71494, 1], [71680, 71723, 1], [71840, 71903, 1], [71935, 71942, 1], [71945, 71948, 3], [71949, 71955, 1], [71957, 71958, 1], [71960, 71983, 1], [71999, 72001, 2], [72096, 72103, 1], [72106, 72144, 1], [72161, 72163, 2], [72192, 72203, 11], [72204, 72242, 1], [72250, 72272, 22], [72284, 72329, 1], [72349, 72368, 19], [72369, 72440, 1], [72640, 72672, 1], [72704, 72712, 1], [72714, 72750, 1], [72768, 72818, 50], [72819, 72847, 1], [72960, 72966, 1], [72968, 72969, 1], [72971, 73008, 1], [73030, 73056, 26], [73057, 73061, 1], [73063, 73064, 1], [73066, 73097, 1], [73112, 73136, 24], [73137, 73179, 1], [73440, 73458, 1], [73474, 73476, 2], [73477, 73488, 1], [73490, 73523, 1], [73648, 73728, 80], [73729, 74649, 1], [74880, 75075, 1], [77712, 77808, 1], [77824, 78895, 1], [78913, 78918, 1], [78944, 82938, 1], [82944, 83526, 1], [90368, 90397, 1], [92160, 92728, 1], [92736, 92766, 1], [92784, 92862, 1], [92880, 92909, 1], [92928, 92975, 1], [92992, 92995, 1], [93027, 93047, 1], [93053, 93071, 1], [93504, 93548, 1], [93760, 93823, 1], [93856, 93880, 1], [93883, 93907, 1], [93952, 94026, 1], [94032, 94099, 67], [94100, 94111, 1], [94176, 94177, 1], [94179, 94194, 15], [94195, 94208, 13], [94209, 101589, 1], [101631, 101662, 1], [101760, 101874, 1], [110576, 110579, 1], [110581, 110587, 1], [110589, 110590, 1], [110592, 110882, 1], [110898, 110928, 30], [110929, 110930, 1], [110933, 110948, 15], [110949, 110951, 1], [110960, 111355, 1], [113664, 113770, 1], [113776, 113788, 1], [113792, 113800, 1], [113808, 113817, 1], [119808, 119892, 1], [119894, 119964, 1], [119966, 119967, 1], [119970, 119973, 3], [119974, 119977, 3], [119978, 119980, 1], [119982, 119993, 1], [119995, 119997, 2], [119998, 120003, 1], [120005, 120069, 1], [120071, 120074, 1], [120077, 120084, 1], [120086, 120092, 1], [120094, 120121, 1], [120123, 120126, 1], [120128, 120132, 1], [120134, 120138, 4], [120139, 120144, 1], [120146, 120485, 1], [120488, 120512, 1], [120514, 120538, 1], [120540, 120570, 1], [120572, 120596, 1], [120598, 120628, 1], [120630, 120654, 1], [120656, 120686, 1], [120688, 120712, 1], [120714, 120744, 1], [120746, 120770, 1], [120772, 120779, 1], [122624, 122654, 1], [122661, 122666, 1], [122928, 122989, 1], [123136, 123180, 1], [123191, 123197, 1], [123214, 123536, 322], [123537, 123565, 1], [123584, 123627, 1], [124112, 124139, 1], [124368, 124397, 1], [124400, 124608, 208], [124609, 124638, 1], [124640, 124642, 1], [124644, 124645, 1], [124647, 124653, 1], [124656, 124660, 1], [124670, 124671, 1], [124896, 124902, 1], [124904, 124907, 1], [124909, 124910, 1], [124912, 124926, 1], [124928, 125124, 1], [125184, 125251, 1], [125259, 126464, 1205], [126465, 126467, 1], [126469, 126495, 1], [126497, 126498, 1], [126500, 126503, 3], [126505, 126514, 1], [126516, 126519, 1], [126521, 126523, 2], [126530, 126535, 5], [126537, 126541, 2], [126542, 126543, 1], [126545, 126546, 1], [126548, 126551, 3], [126553, 126561, 2], [126562, 126564, 2], [126567, 126570, 1], [126572, 126578, 1], [126580, 126583, 1], [126585, 126588, 1], [126590, 126592, 2], [126593, 126601, 1], [126603, 126619, 1], [126625, 126627, 1], [126629, 126633, 1], [126635, 126651, 1], [131072, 173791, 1], [173824, 178205, 1], [178208, 183981, 1], [183984, 191456, 1], [191472, 192093, 1], [194560, 195101, 1], [196608, 201546, 1], [201552, 210041, 1]], 6],
  "LC": [[[65, 90, 1], [97, 122, 1], [181, 192, 11], [193, 214, 1], [216, 246, 1], [248, 442, 1], [444, 447, 1], [452, 659, 1], [662, 687, 1], [880, 883, 1], [886, 887, 1], [891, 893, 1], [895, 902, 7], [904, 906, 1], [908, 910, 2], [911, 929, 1], [931, 1013, 1], [1015, 1153, 1], [1162, 1327, 1], [1329, 1366, 1], [1376, 1416, 1], [4256, 4293, 1], [4295, 4301, 6], [4304, 4346, 1], [4349, 4351, 1], [5024, 5109, 1], [5112, 5117, 1], [7296, 7306, 1], [7312, 7354, 1], [7357, 7359, 1], [7424, 7467, 1], [7531, 7543, 1], [7545, 7578, 1], [7680, 7957, 1], [7960, 7965, 1], [7968, 8005, 1], [8008, 8013, 1], [8016, 8023, 1], [8025, 8031, 2], [8032, 8061, 1], [8064, 8116, 1], [8118, 8124, 1], [8126, 8130, 4], [8131, 8132, 1], [8134, 8140, 1], [8144, 8147, 1], [8150, 8155, 1], [8160, 8172, 1], [8178, 8180, 1], [8182, 8188, 1], [8450, 8455, 5], [8458, 8467, 1], [8469, 8473, 4], [8474, 8477, 1], [8484, 8490, 2], [8491, 8493, 1], [8495, 8500, 1], [8505, 8508, 3], [8509, 8511, 1], [8517, 8521, 1], [8526, 8579, 53], [8580, 11264, 2684], [11265, 11387, 1], [11390, 11492, 1], [11499, 11502, 1], [11506, 11507, 1], [11520, 11557, 1], [11559, 11565, 6], [42560, 42605, 1], [42624, 42651, 1], [42786, 42863, 1], [42865, 42887, 1], [42891, 42894, 1], [42896, 42972, 1], [42997, 42998, 1], [43002, 43824, 822], [43825, 43866, 1], [43872, 43880, 1], [43888, 43967, 1], [64256, 64262, 1], [64275, 64279, 1], [65313, 65338, 1], [65345, 65370, 1]], [[66560, 66639, 1], [66736, 66771, 1], [66776, 66811, 1], [66928, 66938, 1], [66940, 66954, 1], [66956, 66962, 1], [66964, 66965, 1], [66967, 66977, 1], [66979, 66993, 1], [66995, 67001, 1], [67003, 67004, 1], [68736, 68786, 1], [68800, 68850, 1], [68944, 68965, 1], [68976, 68997, 1], [71840, 71903, 1], [93760, 93823, 1], [93856, 93880, 1], [93883, 93907, 1], [119808, 119892, 1], [119894, 119964, 1], [119966, 119967, 1], [119970, 119973, 3], [119974, 119977, 3], [119978, 119980, 1], [119982, 119993, 1], [119995, 119997, 2], [119998, 120003, 1], [120005, 120069, 1], [120071, 120074, 1], [120077, 120084, 1], [120086, 120092, 1], [120094, 120121, 1], [120123, 120126, 1], [120128, 120132, 1], [120134, 120138, 4], [120139, 120144, 1], [120146, 120485, 1], [120488, 120512, 1], [120514, 120538, 1], [120540, 120570, 1], [120572, 120596, 1], [120598, 120628, 1], [120630, 120654, 1], [120656, 120686, 1], [120688, 120712, 1], [120714, 120744, 1], [120746, 120770, 1], [120772, 120779, 1], [122624, 122633, 1], [122635, 122654, 1], [122661, 122666, 1], [125184, 125251, 1]], 5],
  "Ll": [[[97, 122, 1], [181, 223, 42], [224, 246, 1], [248, 255, 1], [257, 311, 2], [312, 328, 2], [329, 375, 2], [378, 382, 2], [383, 384, 1], [387, 389, 2], [392, 396, 4], [397, 402, 5], [405, 409, 4], [410, 411, 1], [414, 417, 3], [419, 421, 2], [424, 426, 2], [427, 429, 2], [432, 436, 4], [438, 441, 3], [442, 445, 3], [446, 447, 1], [454, 460, 3], [462, 476, 2], [477, 495, 2], [496, 499, 3], [501, 505, 4], [507, 563, 2], [564, 569, 1], [572, 575, 3], [576, 578, 2], [583, 591, 2], [592, 659, 1], [662, 687, 1], [881, 883, 2], [887, 891, 4], [892, 893, 1], [912, 940, 28], [941, 974, 1], [976, 977, 1], [981, 983, 1], [985, 1007, 2], [1008, 1011, 1], [1013, 1019, 3], [1020, 1072, 52], [1073, 1119, 1], [1121, 1153, 2], [1163, 1215, 2], [1218, 1230, 2], [1231, 1327, 2], [1376, 1416, 1], [4304, 4346, 1], [4349, 4351, 1], [5112, 5117, 1], [7296, 7304, 1], [7306, 7424, 118], [7425, 7467, 1], [7531, 7543, 1], [7545, 7578, 1], [7681, 7829, 2], [7830, 7837, 1], [7839, 7935, 2], [7936, 7943, 1], [7952, 7957, 1], [7968, 7975, 1], [7984, 7991, 1], [8e3, 8005, 1], [8016, 8023, 1], [8032, 8039, 1], [8048, 8061, 1], [8064, 8071, 1], [8080, 8087, 1], [8096, 8103, 1], [8112, 8116, 1], [8118, 8119, 1], [8126, 8130, 4], [8131, 8132, 1], [8134, 8135, 1], [8144, 8147, 1], [8150, 8151, 1], [8160, 8167, 1], [8178, 8180, 1], [8182, 8183, 1], [8458, 8462, 4], [8463, 8467, 4], [8495, 8505, 5], [8508, 8509, 1], [8518, 8521, 1], [8526, 8580, 54], [11312, 11359, 1], [11361, 11365, 4], [11366, 11372, 2], [11377, 11379, 2], [11380, 11382, 2], [11383, 11387, 1], [11393, 11491, 2], [11492, 11500, 8], [11502, 11507, 5], [11520, 11557, 1], [11559, 11565, 6], [42561, 42605, 2], [42625, 42651, 2], [42787, 42799, 2], [42800, 42801, 1], [42803, 42865, 2], [42866, 42872, 1], [42874, 42876, 2], [42879, 42887, 2], [42892, 42894, 2], [42897, 42899, 2], [42900, 42901, 1], [42903, 42921, 2], [42927, 42933, 6], [42935, 42947, 2], [42952, 42954, 2], [42957, 42971, 2], [42998, 43002, 4], [43824, 43866, 1], [43872, 43880, 1], [43888, 43967, 1], [64256, 64262, 1], [64275, 64279, 1], [65345, 65370, 1]], [[66600, 66639, 1], [66776, 66811, 1], [66967, 66977, 1], [66979, 66993, 1], [66995, 67001, 1], [67003, 67004, 1], [68800, 68850, 1], [68976, 68997, 1], [71872, 71903, 1], [93792, 93823, 1], [93883, 93907, 1], [119834, 119859, 1], [119886, 119892, 1], [119894, 119911, 1], [119938, 119963, 1], [119990, 119993, 1], [119995, 119997, 2], [119998, 120003, 1], [120005, 120015, 1], [120042, 120067, 1], [120094, 120119, 1], [120146, 120171, 1], [120198, 120223, 1], [120250, 120275, 1], [120302, 120327, 1], [120354, 120379, 1], [120406, 120431, 1], [120458, 120485, 1], [120514, 120538, 1], [120540, 120545, 1], [120572, 120596, 1], [120598, 120603, 1], [120630, 120654, 1], [120656, 120661, 1], [120688, 120712, 1], [120714, 120719, 1], [120746, 120770, 1], [120772, 120777, 1], [120779, 122624, 1845], [122625, 122633, 1], [122635, 122654, 1], [122661, 122666, 1], [125218, 125251, 1]], 4],
  "Lm": [[[688, 705, 1], [710, 721, 1], [736, 740, 1], [748, 750, 2], [884, 890, 6], [1369, 1600, 231], [1765, 1766, 1], [2036, 2037, 1], [2042, 2074, 32], [2084, 2088, 4], [2249, 2417, 168], [3654, 3782, 128], [4348, 6103, 1755], [6211, 6823, 612], [7288, 7293, 1], [7468, 7530, 1], [7544, 7579, 35], [7580, 7615, 1], [8305, 8319, 14], [8336, 8348, 1], [11388, 11389, 1], [11631, 11823, 192], [12293, 12337, 44], [12338, 12341, 1], [12347, 12445, 98], [12446, 12540, 94], [12541, 12542, 1], [40981, 42232, 1251], [42233, 42237, 1], [42508, 42623, 115], [42652, 42653, 1], [42775, 42783, 1], [42864, 42888, 24], [42993, 42996, 1], [43e3, 43001, 1], [43471, 43494, 23], [43632, 43741, 109], [43763, 43764, 1], [43868, 43871, 1], [43881, 65392, 21511], [65438, 65439, 1]], [[67456, 67461, 1], [67463, 67504, 1], [67506, 67514, 1], [68942, 68975, 33], [69317, 73177, 3860], [92992, 92995, 1], [93504, 93506, 1], [93547, 93548, 1], [94099, 94111, 1], [94176, 94177, 1], [94179, 94194, 15], [94195, 110576, 16381], [110577, 110579, 1], [110581, 110587, 1], [110589, 110590, 1], [122928, 122989, 1], [123191, 123197, 1], [124139, 124671, 532], [125259, 125259, 1]], 0],
  "Lo": [[[170, 186, 16], [443, 448, 5], [449, 451, 1], [660, 661, 1], [1488, 1514, 1], [1519, 1522, 1], [1568, 1599, 1], [1601, 1610, 1], [1646, 1647, 1], [1649, 1747, 1], [1749, 1774, 25], [1775, 1786, 11], [1787, 1788, 1], [1791, 1808, 17], [1810, 1839, 1], [1869, 1957, 1], [1969, 1994, 25], [1995, 2026, 1], [2048, 2069, 1], [2112, 2136, 1], [2144, 2154, 1], [2160, 2183, 1], [2185, 2191, 1], [2208, 2248, 1], [2308, 2361, 1], [2365, 2384, 19], [2392, 2401, 1], [2418, 2432, 1], [2437, 2444, 1], [2447, 2448, 1], [2451, 2472, 1], [2474, 2480, 1], [2482, 2486, 4], [2487, 2489, 1], [2493, 2510, 17], [2524, 2525, 1], [2527, 2529, 1], [2544, 2545, 1], [2556, 2565, 9], [2566, 2570, 1], [2575, 2576, 1], [2579, 2600, 1], [2602, 2608, 1], [2610, 2611, 1], [2613, 2614, 1], [2616, 2617, 1], [2649, 2652, 1], [2654, 2674, 20], [2675, 2676, 1], [2693, 2701, 1], [2703, 2705, 1], [2707, 2728, 1], [2730, 2736, 1], [2738, 2739, 1], [2741, 2745, 1], [2749, 2768, 19], [2784, 2785, 1], [2809, 2821, 12], [2822, 2828, 1], [2831, 2832, 1], [2835, 2856, 1], [2858, 2864, 1], [2866, 2867, 1], [2869, 2873, 1], [2877, 2908, 31], [2909, 2911, 2], [2912, 2913, 1], [2929, 2947, 18], [2949, 2954, 1], [2958, 2960, 1], [2962, 2965, 1], [2969, 2970, 1], [2972, 2974, 2], [2975, 2979, 4], [2980, 2984, 4], [2985, 2986, 1], [2990, 3001, 1], [3024, 3077, 53], [3078, 3084, 1], [3086, 3088, 1], [3090, 3112, 1], [3114, 3129, 1], [3133, 3160, 27], [3161, 3162, 1], [3164, 3165, 1], [3168, 3169, 1], [3200, 3205, 5], [3206, 3212, 1], [3214, 3216, 1], [3218, 3240, 1], [3242, 3251, 1], [3253, 3257, 1], [3261, 3292, 31], [3293, 3294, 1], [3296, 3297, 1], [3313, 3314, 1], [3332, 3340, 1], [3342, 3344, 1], [3346, 3386, 1], [3389, 3406, 17], [3412, 3414, 1], [3423, 3425, 1], [3450, 3455, 1], [3461, 3478, 1], [3482, 3505, 1], [3507, 3515, 1], [3517, 3520, 3], [3521, 3526, 1], [3585, 3632, 1], [3634, 3635, 1], [3648, 3653, 1], [3713, 3714, 1], [3716, 3718, 2], [3719, 3722, 1], [3724, 3747, 1], [3749, 3751, 2], [3752, 3760, 1], [3762, 3763, 1], [3773, 3776, 3], [3777, 3780, 1], [3804, 3807, 1], [3840, 3904, 64], [3905, 3911, 1], [3913, 3948, 1], [3976, 3980, 1], [4096, 4138, 1], [4159, 4176, 17], [4177, 4181, 1], [4186, 4189, 1], [4193, 4197, 4], [4198, 4206, 8], [4207, 4208, 1], [4213, 4225, 1], [4238, 4352, 114], [4353, 4680, 1], [4682, 4685, 1], [4688, 4694, 1], [4696, 4698, 2], [4699, 4701, 1], [4704, 4744, 1], [4746, 4749, 1], [4752, 4784, 1], [4786, 4789, 1], [4792, 4798, 1], [4800, 4802, 2], [4803, 4805, 1], [4808, 4822, 1], [4824, 4880, 1], [4882, 4885, 1], [4888, 4954, 1], [4992, 5007, 1], [5121, 5740, 1], [5743, 5759, 1], [5761, 5786, 1], [5792, 5866, 1], [5873, 5880, 1], [5888, 5905, 1], [5919, 5937, 1], [5952, 5969, 1], [5984, 5996, 1], [5998, 6e3, 1], [6016, 6067, 1], [6108, 6176, 68], [6177, 6210, 1], [6212, 6264, 1], [6272, 6276, 1], [6279, 6312, 1], [6314, 6320, 6], [6321, 6389, 1], [6400, 6430, 1], [6480, 6509, 1], [6512, 6516, 1], [6528, 6571, 1], [6576, 6601, 1], [6656, 6678, 1], [6688, 6740, 1], [6917, 6963, 1], [6981, 6988, 1], [7043, 7072, 1], [7086, 7087, 1], [7098, 7141, 1], [7168, 7203, 1], [7245, 7247, 1], [7258, 7287, 1], [7401, 7404, 1], [7406, 7411, 1], [7413, 7414, 1], [7418, 8501, 1083], [8502, 8504, 1], [11568, 11623, 1], [11648, 11670, 1], [11680, 11686, 1], [11688, 11694, 1], [11696, 11702, 1], [11704, 11710, 1], [11712, 11718, 1], [11720, 11726, 1], [11728, 11734, 1], [11736, 11742, 1], [12294, 12348, 54], [12353, 12438, 1], [12447, 12449, 2], [12450, 12538, 1], [12543, 12549, 6], [12550, 12591, 1], [12593, 12686, 1], [12704, 12735, 1], [12784, 12799, 1], [13312, 19903, 1], [19968, 40980, 1], [40982, 42124, 1], [42192, 42231, 1], [42240, 42507, 1], [42512, 42527, 1], [42538, 42539, 1], [42606, 42656, 50], [42657, 42725, 1], [42895, 42999, 104], [43003, 43009, 1], [43011, 43013, 1], [43015, 43018, 1], [43020, 43042, 1], [43072, 43123, 1], [43138, 43187, 1], [43250, 43255, 1], [43259, 43261, 2], [43262, 43274, 12], [43275, 43301, 1], [43312, 43334, 1], [43360, 43388, 1], [43396, 43442, 1], [43488, 43492, 1], [43495, 43503, 1], [43514, 43518, 1], [43520, 43560, 1], [43584, 43586, 1], [43588, 43595, 1], [43616, 43631, 1], [43633, 43638, 1], [43642, 43646, 4], [43647, 43695, 1], [43697, 43701, 4], [43702, 43705, 3], [43706, 43709, 1], [43712, 43714, 2], [43739, 43740, 1], [43744, 43754, 1], [43762, 43777, 15], [43778, 43782, 1], [43785, 43790, 1], [43793, 43798, 1], [43808, 43814, 1], [43816, 43822, 1], [43968, 44002, 1], [44032, 55203, 1], [55216, 55238, 1], [55243, 55291, 1], [63744, 64109, 1], [64112, 64217, 1], [64285, 64287, 2], [64288, 64296, 1], [64298, 64310, 1], [64312, 64316, 1], [64318, 64320, 2], [64321, 64323, 2], [64324, 64326, 2], [64327, 64433, 1], [64467, 64829, 1], [64848, 64911, 1], [64914, 64967, 1], [65008, 65019, 1], [65136, 65140, 1], [65142, 65276, 1], [65382, 65391, 1], [65393, 65437, 1], [65440, 65470, 1], [65474, 65479, 1], [65482, 65487, 1], [65490, 65495, 1], [65498, 65500, 1]], [[65536, 65547, 1], [65549, 65574, 1], [65576, 65594, 1], [65596, 65597, 1], [65599, 65613, 1], [65616, 65629, 1], [65664, 65786, 1], [66176, 66204, 1], [66208, 66256, 1], [66304, 66335, 1], [66349, 66368, 1], [66370, 66377, 1], [66384, 66421, 1], [66432, 66461, 1], [66464, 66499, 1], [66504, 66511, 1], [66640, 66717, 1], [66816, 66855, 1], [66864, 66915, 1], [67008, 67059, 1], [67072, 67382, 1], [67392, 67413, 1], [67424, 67431, 1], [67584, 67589, 1], [67592, 67594, 2], [67595, 67637, 1], [67639, 67640, 1], [67644, 67647, 3], [67648, 67669, 1], [67680, 67702, 1], [67712, 67742, 1], [67808, 67826, 1], [67828, 67829, 1], [67840, 67861, 1], [67872, 67897, 1], [67904, 67929, 1], [67968, 68023, 1], [68030, 68031, 1], [68096, 68112, 16], [68113, 68115, 1], [68117, 68119, 1], [68121, 68149, 1], [68192, 68220, 1], [68224, 68252, 1], [68288, 68295, 1], [68297, 68324, 1], [68352, 68405, 1], [68416, 68437, 1], [68448, 68466, 1], [68480, 68497, 1], [68608, 68680, 1], [68864, 68899, 1], [68938, 68941, 1], [68943, 69248, 305], [69249, 69289, 1], [69296, 69297, 1], [69314, 69316, 1], [69318, 69319, 1], [69376, 69404, 1], [69415, 69424, 9], [69425, 69445, 1], [69488, 69505, 1], [69552, 69572, 1], [69600, 69622, 1], [69635, 69687, 1], [69745, 69746, 1], [69749, 69763, 14], [69764, 69807, 1], [69840, 69864, 1], [69891, 69926, 1], [69956, 69959, 3], [69968, 70002, 1], [70006, 70019, 13], [70020, 70066, 1], [70081, 70084, 1], [70106, 70108, 2], [70144, 70161, 1], [70163, 70187, 1], [70207, 70208, 1], [70272, 70278, 1], [70280, 70282, 2], [70283, 70285, 1], [70287, 70301, 1], [70303, 70312, 1], [70320, 70366, 1], [70405, 70412, 1], [70415, 70416, 1], [70419, 70440, 1], [70442, 70448, 1], [70450, 70451, 1], [70453, 70457, 1], [70461, 70480, 19], [70493, 70497, 1], [70528, 70537, 1], [70539, 70542, 3], [70544, 70581, 1], [70583, 70609, 26], [70611, 70656, 45], [70657, 70708, 1], [70727, 70730, 1], [70751, 70753, 1], [70784, 70831, 1], [70852, 70853, 1], [70855, 71040, 185], [71041, 71086, 1], [71128, 71131, 1], [71168, 71215, 1], [71236, 71296, 60], [71297, 71338, 1], [71352, 71424, 72], [71425, 71450, 1], [71488, 71494, 1], [71680, 71723, 1], [71935, 71942, 1], [71945, 71948, 3], [71949, 71955, 1], [71957, 71958, 1], [71960, 71983, 1], [71999, 72001, 2], [72096, 72103, 1], [72106, 72144, 1], [72161, 72163, 2], [72192, 72203, 11], [72204, 72242, 1], [72250, 72272, 22], [72284, 72329, 1], [72349, 72368, 19], [72369, 72440, 1], [72640, 72672, 1], [72704, 72712, 1], [72714, 72750, 1], [72768, 72818, 50], [72819, 72847, 1], [72960, 72966, 1], [72968, 72969, 1], [72971, 73008, 1], [73030, 73056, 26], [73057, 73061, 1], [73063, 73064, 1], [73066, 73097, 1], [73112, 73136, 24], [73137, 73176, 1], [73178, 73179, 1], [73440, 73458, 1], [73474, 73476, 2], [73477, 73488, 1], [73490, 73523, 1], [73648, 73728, 80], [73729, 74649, 1], [74880, 75075, 1], [77712, 77808, 1], [77824, 78895, 1], [78913, 78918, 1], [78944, 82938, 1], [82944, 83526, 1], [90368, 90397, 1], [92160, 92728, 1], [92736, 92766, 1], [92784, 92862, 1], [92880, 92909, 1], [92928, 92975, 1], [93027, 93047, 1], [93053, 93071, 1], [93507, 93546, 1], [93952, 94026, 1], [94032, 94208, 176], [94209, 101589, 1], [101631, 101662, 1], [101760, 101874, 1], [110592, 110882, 1], [110898, 110928, 30], [110929, 110930, 1], [110933, 110948, 15], [110949, 110951, 1], [110960, 111355, 1], [113664, 113770, 1], [113776, 113788, 1], [113792, 113800, 1], [113808, 113817, 1], [122634, 123136, 502], [123137, 123180, 1], [123214, 123536, 322], [123537, 123565, 1], [123584, 123627, 1], [124112, 124138, 1], [124368, 124397, 1], [124400, 124608, 208], [124609, 124638, 1], [124640, 124642, 1], [124644, 124645, 1], [124647, 124653, 1], [124656, 124660, 1], [124670, 124896, 226], [124897, 124902, 1], [124904, 124907, 1], [124909, 124910, 1], [124912, 124926, 1], [124928, 125124, 1], [126464, 126467, 1], [126469, 126495, 1], [126497, 126498, 1], [126500, 126503, 3], [126505, 126514, 1], [126516, 126519, 1], [126521, 126523, 2], [126530, 126535, 5], [126537, 126541, 2], [126542, 126543, 1], [126545, 126546, 1], [126548, 126551, 3], [126553, 126561, 2], [126562, 126564, 2], [126567, 126570, 1], [126572, 126578, 1], [126580, 126583, 1], [126585, 126588, 1], [126590, 126592, 2], [126593, 126601, 1], [126603, 126619, 1], [126625, 126627, 1], [126629, 126633, 1], [126635, 126651, 1], [131072, 173791, 1], [173824, 178205, 1], [178208, 183981, 1], [183984, 191456, 1], [191472, 192093, 1], [194560, 195101, 1], [196608, 201546, 1], [201552, 210041, 1]], 1],
  "Lt": [[[453, 459, 3], [498, 8072, 7574], [8073, 8079, 1], [8088, 8095, 1], [8104, 8111, 1], [8124, 8140, 16], [8188, 8188, 1]], [], 0],
  "Lu": [[[65, 90, 1], [192, 214, 1], [216, 222, 1], [256, 310, 2], [313, 327, 2], [330, 376, 2], [377, 381, 2], [385, 386, 1], [388, 390, 2], [391, 393, 2], [394, 395, 1], [398, 401, 1], [403, 404, 1], [406, 408, 1], [412, 413, 1], [415, 416, 1], [418, 422, 2], [423, 425, 2], [428, 430, 2], [431, 433, 2], [434, 435, 1], [437, 439, 2], [440, 444, 4], [452, 461, 3], [463, 475, 2], [478, 494, 2], [497, 500, 3], [502, 504, 1], [506, 562, 2], [570, 571, 1], [573, 574, 1], [577, 579, 2], [580, 582, 1], [584, 590, 2], [880, 882, 2], [886, 895, 9], [902, 904, 2], [905, 906, 1], [908, 910, 2], [911, 913, 2], [914, 929, 1], [931, 939, 1], [975, 978, 3], [979, 980, 1], [984, 1006, 2], [1012, 1015, 3], [1017, 1018, 1], [1021, 1071, 1], [1120, 1152, 2], [1162, 1216, 2], [1217, 1229, 2], [1232, 1326, 2], [1329, 1366, 1], [4256, 4293, 1], [4295, 4301, 6], [5024, 5109, 1], [7305, 7312, 7], [7313, 7354, 1], [7357, 7359, 1], [7680, 7828, 2], [7838, 7934, 2], [7944, 7951, 1], [7960, 7965, 1], [7976, 7983, 1], [7992, 7999, 1], [8008, 8013, 1], [8025, 8031, 2], [8040, 8047, 1], [8120, 8123, 1], [8136, 8139, 1], [8152, 8155, 1], [8168, 8172, 1], [8184, 8187, 1], [8450, 8455, 5], [8459, 8461, 1], [8464, 8466, 1], [8469, 8473, 4], [8474, 8477, 1], [8484, 8490, 2], [8491, 8493, 1], [8496, 8499, 1], [8510, 8511, 1], [8517, 8579, 62], [11264, 11311, 1], [11360, 11362, 2], [11363, 11364, 1], [11367, 11373, 2], [11374, 11376, 1], [11378, 11381, 3], [11390, 11392, 1], [11394, 11490, 2], [11499, 11501, 2], [11506, 42560, 31054], [42562, 42604, 2], [42624, 42650, 2], [42786, 42798, 2], [42802, 42862, 2], [42873, 42877, 2], [42878, 42886, 2], [42891, 42893, 2], [42896, 42898, 2], [42902, 42922, 2], [42923, 42926, 1], [42928, 42932, 1], [42934, 42948, 2], [42949, 42951, 1], [42953, 42955, 2], [42956, 42972, 2], [42997, 65313, 22316], [65314, 65338, 1]], [[66560, 66599, 1], [66736, 66771, 1], [66928, 66938, 1], [66940, 66954, 1], [66956, 66962, 1], [66964, 66965, 1], [68736, 68786, 1], [68944, 68965, 1], [71840, 71871, 1], [93760, 93791, 1], [93856, 93880, 1], [119808, 119833, 1], [119860, 119885, 1], [119912, 119937, 1], [119964, 119966, 2], [119967, 119973, 3], [119974, 119977, 3], [119978, 119980, 1], [119982, 119989, 1], [120016, 120041, 1], [120068, 120069, 1], [120071, 120074, 1], [120077, 120084, 1], [120086, 120092, 1], [120120, 120121, 1], [120123, 120126, 1], [120128, 120132, 1], [120134, 120138, 4], [120139, 120144, 1], [120172, 120197, 1], [120224, 120249, 1], [120276, 120301, 1], [120328, 120353, 1], [120380, 120405, 1], [120432, 120457, 1], [120488, 120512, 1], [120546, 120570, 1], [120604, 120628, 1], [120662, 120686, 1], [120720, 120744, 1], [120778, 125184, 4406], [125185, 125217, 1]], 3],
  "M": [[[768, 879, 1], [1155, 1161, 1], [1425, 1469, 1], [1471, 1473, 2], [1474, 1476, 2], [1477, 1479, 2], [1552, 1562, 1], [1611, 1631, 1], [1648, 1750, 102], [1751, 1756, 1], [1759, 1764, 1], [1767, 1768, 1], [1770, 1773, 1], [1809, 1840, 31], [1841, 1866, 1], [1958, 1968, 1], [2027, 2035, 1], [2045, 2070, 25], [2071, 2073, 1], [2075, 2083, 1], [2085, 2087, 1], [2089, 2093, 1], [2137, 2139, 1], [2199, 2207, 1], [2250, 2273, 1], [2275, 2307, 1], [2362, 2364, 1], [2366, 2383, 1], [2385, 2391, 1], [2402, 2403, 1], [2433, 2435, 1], [2492, 2494, 2], [2495, 2500, 1], [2503, 2504, 1], [2507, 2509, 1], [2519, 2530, 11], [2531, 2558, 27], [2561, 2563, 1], [2620, 2622, 2], [2623, 2626, 1], [2631, 2632, 1], [2635, 2637, 1], [2641, 2672, 31], [2673, 2677, 4], [2689, 2691, 1], [2748, 2750, 2], [2751, 2757, 1], [2759, 2761, 1], [2763, 2765, 1], [2786, 2787, 1], [2810, 2815, 1], [2817, 2819, 1], [2876, 2878, 2], [2879, 2884, 1], [2887, 2888, 1], [2891, 2893, 1], [2901, 2903, 1], [2914, 2915, 1], [2946, 3006, 60], [3007, 3010, 1], [3014, 3016, 1], [3018, 3021, 1], [3031, 3072, 41], [3073, 3076, 1], [3132, 3134, 2], [3135, 3140, 1], [3142, 3144, 1], [3146, 3149, 1], [3157, 3158, 1], [3170, 3171, 1], [3201, 3203, 1], [3260, 3262, 2], [3263, 3268, 1], [3270, 3272, 1], [3274, 3277, 1], [3285, 3286, 1], [3298, 3299, 1], [3315, 3328, 13], [3329, 3331, 1], [3387, 3388, 1], [3390, 3396, 1], [3398, 3400, 1], [3402, 3405, 1], [3415, 3426, 11], [3427, 3457, 30], [3458, 3459, 1], [3530, 3535, 5], [3536, 3540, 1], [3542, 3544, 2], [3545, 3551, 1], [3570, 3571, 1], [3633, 3636, 3], [3637, 3642, 1], [3655, 3662, 1], [3761, 3764, 3], [3765, 3772, 1], [3784, 3790, 1], [3864, 3865, 1], [3893, 3897, 2], [3902, 3903, 1], [3953, 3972, 1], [3974, 3975, 1], [3981, 3991, 1], [3993, 4028, 1], [4038, 4139, 101], [4140, 4158, 1], [4182, 4185, 1], [4190, 4192, 1], [4194, 4196, 1], [4199, 4205, 1], [4209, 4212, 1], [4226, 4237, 1], [4239, 4250, 11], [4251, 4253, 1], [4957, 4959, 1], [5906, 5909, 1], [5938, 5940, 1], [5970, 5971, 1], [6002, 6003, 1], [6068, 6099, 1], [6109, 6155, 46], [6156, 6157, 1], [6159, 6277, 118], [6278, 6313, 35], [6432, 6443, 1], [6448, 6459, 1], [6679, 6683, 1], [6741, 6750, 1], [6752, 6780, 1], [6783, 6832, 49], [6833, 6877, 1], [6880, 6891, 1], [6912, 6916, 1], [6964, 6980, 1], [7019, 7027, 1], [7040, 7042, 1], [7073, 7085, 1], [7142, 7155, 1], [7204, 7223, 1], [7376, 7378, 1], [7380, 7400, 1], [7405, 7412, 7], [7415, 7417, 1], [7616, 7679, 1], [8400, 8432, 1], [11503, 11505, 1], [11647, 11744, 97], [11745, 11775, 1], [12330, 12335, 1], [12441, 12442, 1], [42607, 42610, 1], [42612, 42621, 1], [42654, 42655, 1], [42736, 42737, 1], [43010, 43014, 4], [43019, 43043, 24], [43044, 43047, 1], [43052, 43136, 84], [43137, 43188, 51], [43189, 43205, 1], [43232, 43249, 1], [43263, 43302, 39], [43303, 43309, 1], [43335, 43347, 1], [43392, 43395, 1], [43443, 43456, 1], [43493, 43561, 68], [43562, 43574, 1], [43587, 43596, 9], [43597, 43643, 46], [43644, 43645, 1], [43696, 43698, 2], [43699, 43700, 1], [43703, 43704, 1], [43710, 43711, 1], [43713, 43755, 42], [43756, 43759, 1], [43765, 43766, 1], [44003, 44010, 1], [44012, 44013, 1], [64286, 65024, 738], [65025, 65039, 1], [65056, 65071, 1]], [[66045, 66272, 227], [66422, 66426, 1], [68097, 68099, 1], [68101, 68102, 1], [68108, 68111, 1], [68152, 68154, 1], [68159, 68325, 166], [68326, 68900, 574], [68901, 68903, 1], [68969, 68973, 1], [69291, 69292, 1], [69370, 69375, 1], [69446, 69456, 1], [69506, 69509, 1], [69632, 69634, 1], [69688, 69702, 1], [69744, 69747, 3], [69748, 69759, 11], [69760, 69762, 1], [69808, 69818, 1], [69826, 69888, 62], [69889, 69890, 1], [69927, 69940, 1], [69957, 69958, 1], [70003, 70016, 13], [70017, 70018, 1], [70067, 70080, 1], [70089, 70092, 1], [70094, 70095, 1], [70188, 70199, 1], [70206, 70209, 3], [70367, 70378, 1], [70400, 70403, 1], [70459, 70460, 1], [70462, 70468, 1], [70471, 70472, 1], [70475, 70477, 1], [70487, 70498, 11], [70499, 70502, 3], [70503, 70508, 1], [70512, 70516, 1], [70584, 70592, 1], [70594, 70597, 3], [70599, 70602, 1], [70604, 70608, 1], [70610, 70625, 15], [70626, 70709, 83], [70710, 70726, 1], [70750, 70832, 82], [70833, 70851, 1], [71087, 71093, 1], [71096, 71104, 1], [71132, 71133, 1], [71216, 71232, 1], [71339, 71351, 1], [71453, 71467, 1], [71724, 71738, 1], [71984, 71989, 1], [71991, 71992, 1], [71995, 71998, 1], [72e3, 72002, 2], [72003, 72145, 142], [72146, 72151, 1], [72154, 72160, 1], [72164, 72193, 29], [72194, 72202, 1], [72243, 72249, 1], [72251, 72254, 1], [72263, 72273, 10], [72274, 72283, 1], [72330, 72345, 1], [72544, 72551, 1], [72751, 72758, 1], [72760, 72767, 1], [72850, 72871, 1], [72873, 72886, 1], [73009, 73014, 1], [73018, 73020, 2], [73021, 73023, 2], [73024, 73029, 1], [73031, 73098, 67], [73099, 73102, 1], [73104, 73105, 1], [73107, 73111, 1], [73459, 73462, 1], [73472, 73473, 1], [73475, 73524, 49], [73525, 73530, 1], [73534, 73538, 1], [73562, 78912, 5350], [78919, 78933, 1], [90398, 90415, 1], [92912, 92916, 1], [92976, 92982, 1], [94031, 94033, 2], [94034, 94087, 1], [94095, 94098, 1], [94180, 94192, 12], [94193, 113821, 19628], [113822, 118528, 4706], [118529, 118573, 1], [118576, 118598, 1], [119141, 119145, 1], [119149, 119154, 1], [119163, 119170, 1], [119173, 119179, 1], [119210, 119213, 1], [119362, 119364, 1], [121344, 121398, 1], [121403, 121452, 1], [121461, 121476, 15], [121499, 121503, 1], [121505, 121519, 1], [122880, 122886, 1], [122888, 122904, 1], [122907, 122913, 1], [122915, 122916, 1], [122918, 122922, 1], [123023, 123184, 161], [123185, 123190, 1], [123566, 123628, 62], [123629, 123631, 1], [124140, 124143, 1], [124398, 124399, 1], [124643, 124646, 3], [124654, 124655, 1], [124661, 125136, 475], [125137, 125142, 1], [125252, 125258, 1], [917760, 917999, 1]], 0],
  "Mc": [[[2307, 2363, 56], [2366, 2368, 1], [2377, 2380, 1], [2382, 2383, 1], [2434, 2435, 1], [2494, 2496, 1], [2503, 2504, 1], [2507, 2508, 1], [2519, 2563, 44], [2622, 2624, 1], [2691, 2750, 59], [2751, 2752, 1], [2761, 2763, 2], [2764, 2818, 54], [2819, 2878, 59], [2880, 2887, 7], [2888, 2891, 3], [2892, 2903, 11], [3006, 3007, 1], [3009, 3010, 1], [3014, 3016, 1], [3018, 3020, 1], [3031, 3073, 42], [3074, 3075, 1], [3137, 3140, 1], [3202, 3203, 1], [3262, 3264, 2], [3265, 3268, 1], [3271, 3272, 1], [3274, 3275, 1], [3285, 3286, 1], [3315, 3330, 15], [3331, 3390, 59], [3391, 3392, 1], [3398, 3400, 1], [3402, 3404, 1], [3415, 3458, 43], [3459, 3535, 76], [3536, 3537, 1], [3544, 3551, 1], [3570, 3571, 1], [3902, 3903, 1], [3967, 4139, 172], [4140, 4145, 5], [4152, 4155, 3], [4156, 4182, 26], [4183, 4194, 11], [4195, 4196, 1], [4199, 4205, 1], [4227, 4228, 1], [4231, 4236, 1], [4239, 4250, 11], [4251, 4252, 1], [5909, 5940, 31], [6070, 6078, 8], [6079, 6085, 1], [6087, 6088, 1], [6435, 6438, 1], [6441, 6443, 1], [6448, 6449, 1], [6451, 6456, 1], [6681, 6682, 1], [6741, 6743, 2], [6753, 6755, 2], [6756, 6765, 9], [6766, 6770, 1], [6916, 6965, 49], [6971, 6973, 2], [6974, 6977, 1], [6979, 6980, 1], [7042, 7073, 31], [7078, 7079, 1], [7082, 7143, 61], [7146, 7148, 1], [7150, 7154, 4], [7155, 7204, 49], [7205, 7211, 1], [7220, 7221, 1], [7393, 7415, 22], [12334, 12335, 1], [43043, 43044, 1], [43047, 43136, 89], [43137, 43188, 51], [43189, 43203, 1], [43346, 43347, 1], [43395, 43444, 49], [43445, 43450, 5], [43451, 43454, 3], [43455, 43456, 1], [43567, 43568, 1], [43571, 43572, 1], [43597, 43643, 46], [43645, 43755, 110], [43758, 43759, 1], [43765, 44003, 238], [44004, 44006, 2], [44007, 44009, 2], [44010, 44012, 2]], [[69632, 69634, 2], [69762, 69808, 46], [69809, 69810, 1], [69815, 69816, 1], [69932, 69957, 25], [69958, 70018, 60], [70067, 70069, 1], [70079, 70080, 1], [70094, 70188, 94], [70189, 70190, 1], [70194, 70195, 1], [70197, 70368, 171], [70369, 70370, 1], [70402, 70403, 1], [70462, 70463, 1], [70465, 70468, 1], [70471, 70472, 1], [70475, 70477, 1], [70487, 70498, 11], [70499, 70584, 85], [70585, 70586, 1], [70594, 70597, 3], [70599, 70602, 1], [70604, 70605, 1], [70607, 70709, 102], [70710, 70711, 1], [70720, 70721, 1], [70725, 70832, 107], [70833, 70834, 1], [70841, 70843, 2], [70844, 70846, 1], [70849, 71087, 238], [71088, 71089, 1], [71096, 71099, 1], [71102, 71216, 114], [71217, 71218, 1], [71227, 71228, 1], [71230, 71340, 110], [71342, 71343, 1], [71350, 71454, 104], [71456, 71457, 1], [71462, 71724, 262], [71725, 71726, 1], [71736, 71984, 248], [71985, 71989, 1], [71991, 71992, 1], [71997, 72e3, 3], [72002, 72145, 143], [72146, 72147, 1], [72156, 72159, 1], [72164, 72249, 85], [72279, 72280, 1], [72343, 72545, 202], [72549, 72551, 2], [72751, 72766, 15], [72873, 72881, 8], [72884, 73098, 214], [73099, 73102, 1], [73107, 73108, 1], [73110, 73461, 351], [73462, 73475, 13], [73524, 73525, 1], [73534, 73535, 1], [73537, 90410, 16873], [90411, 90412, 1], [94033, 94087, 1], [94192, 94193, 1], [119141, 119142, 1], [119149, 119154, 1]], 0],
  "Me": [[[1160, 1161, 1], [6846, 8413, 1567], [8414, 8416, 1], [8418, 8420, 1], [42608, 42610, 1]], [], 0],
  "Mn": [[[768, 879, 1], [1155, 1159, 1], [1425, 1469, 1], [1471, 1473, 2], [1474, 1476, 2], [1477, 1479, 2], [1552, 1562, 1], [1611, 1631, 1], [1648, 1750, 102], [1751, 1756, 1], [1759, 1764, 1], [1767, 1768, 1], [1770, 1773, 1], [1809, 1840, 31], [1841, 1866, 1], [1958, 1968, 1], [2027, 2035, 1], [2045, 2070, 25], [2071, 2073, 1], [2075, 2083, 1], [2085, 2087, 1], [2089, 2093, 1], [2137, 2139, 1], [2199, 2207, 1], [2250, 2273, 1], [2275, 2306, 1], [2362, 2364, 2], [2369, 2376, 1], [2381, 2385, 4], [2386, 2391, 1], [2402, 2403, 1], [2433, 2492, 59], [2497, 2500, 1], [2509, 2530, 21], [2531, 2558, 27], [2561, 2562, 1], [2620, 2625, 5], [2626, 2631, 5], [2632, 2635, 3], [2636, 2637, 1], [2641, 2672, 31], [2673, 2677, 4], [2689, 2690, 1], [2748, 2753, 5], [2754, 2757, 1], [2759, 2760, 1], [2765, 2786, 21], [2787, 2810, 23], [2811, 2815, 1], [2817, 2876, 59], [2879, 2881, 2], [2882, 2884, 1], [2893, 2901, 8], [2902, 2914, 12], [2915, 2946, 31], [3008, 3021, 13], [3072, 3076, 4], [3132, 3134, 2], [3135, 3136, 1], [3142, 3144, 1], [3146, 3149, 1], [3157, 3158, 1], [3170, 3171, 1], [3201, 3260, 59], [3263, 3270, 7], [3276, 3277, 1], [3298, 3299, 1], [3328, 3329, 1], [3387, 3388, 1], [3393, 3396, 1], [3405, 3426, 21], [3427, 3457, 30], [3530, 3538, 8], [3539, 3540, 1], [3542, 3633, 91], [3636, 3642, 1], [3655, 3662, 1], [3761, 3764, 3], [3765, 3772, 1], [3784, 3790, 1], [3864, 3865, 1], [3893, 3897, 2], [3953, 3966, 1], [3968, 3972, 1], [3974, 3975, 1], [3981, 3991, 1], [3993, 4028, 1], [4038, 4141, 103], [4142, 4144, 1], [4146, 4151, 1], [4153, 4154, 1], [4157, 4158, 1], [4184, 4185, 1], [4190, 4192, 1], [4209, 4212, 1], [4226, 4229, 3], [4230, 4237, 7], [4253, 4957, 704], [4958, 4959, 1], [5906, 5908, 1], [5938, 5939, 1], [5970, 5971, 1], [6002, 6003, 1], [6068, 6069, 1], [6071, 6077, 1], [6086, 6089, 3], [6090, 6099, 1], [6109, 6155, 46], [6156, 6157, 1], [6159, 6277, 118], [6278, 6313, 35], [6432, 6434, 1], [6439, 6440, 1], [6450, 6457, 7], [6458, 6459, 1], [6679, 6680, 1], [6683, 6742, 59], [6744, 6750, 1], [6752, 6754, 2], [6757, 6764, 1], [6771, 6780, 1], [6783, 6832, 49], [6833, 6845, 1], [6847, 6877, 1], [6880, 6891, 1], [6912, 6915, 1], [6964, 6966, 2], [6967, 6970, 1], [6972, 6978, 6], [7019, 7027, 1], [7040, 7041, 1], [7074, 7077, 1], [7080, 7081, 1], [7083, 7085, 1], [7142, 7144, 2], [7145, 7149, 4], [7151, 7153, 1], [7212, 7219, 1], [7222, 7223, 1], [7376, 7378, 1], [7380, 7392, 1], [7394, 7400, 1], [7405, 7412, 7], [7416, 7417, 1], [7616, 7679, 1], [8400, 8412, 1], [8417, 8421, 4], [8422, 8432, 1], [11503, 11505, 1], [11647, 11744, 97], [11745, 11775, 1], [12330, 12333, 1], [12441, 12442, 1], [42607, 42612, 5], [42613, 42621, 1], [42654, 42655, 1], [42736, 42737, 1], [43010, 43014, 4], [43019, 43045, 26], [43046, 43052, 6], [43204, 43205, 1], [43232, 43249, 1], [43263, 43302, 39], [43303, 43309, 1], [43335, 43345, 1], [43392, 43394, 1], [43443, 43446, 3], [43447, 43449, 1], [43452, 43453, 1], [43493, 43561, 68], [43562, 43566, 1], [43569, 43570, 1], [43573, 43574, 1], [43587, 43596, 9], [43644, 43696, 52], [43698, 43700, 1], [43703, 43704, 1], [43710, 43711, 1], [43713, 43756, 43], [43757, 43766, 9], [44005, 44008, 3], [44013, 64286, 20273], [65024, 65039, 1], [65056, 65071, 1]], [[66045, 66272, 227], [66422, 66426, 1], [68097, 68099, 1], [68101, 68102, 1], [68108, 68111, 1], [68152, 68154, 1], [68159, 68325, 166], [68326, 68900, 574], [68901, 68903, 1], [68969, 68973, 1], [69291, 69292, 1], [69370, 69375, 1], [69446, 69456, 1], [69506, 69509, 1], [69633, 69688, 55], [69689, 69702, 1], [69744, 69747, 3], [69748, 69759, 11], [69760, 69761, 1], [69811, 69814, 1], [69817, 69818, 1], [69826, 69888, 62], [69889, 69890, 1], [69927, 69931, 1], [69933, 69940, 1], [70003, 70016, 13], [70017, 70070, 53], [70071, 70078, 1], [70089, 70092, 1], [70095, 70191, 96], [70192, 70193, 1], [70196, 70198, 2], [70199, 70206, 7], [70209, 70367, 158], [70371, 70378, 1], [70400, 70401, 1], [70459, 70460, 1], [70464, 70502, 38], [70503, 70508, 1], [70512, 70516, 1], [70587, 70592, 1], [70606, 70610, 2], [70625, 70626, 1], [70712, 70719, 1], [70722, 70724, 1], [70726, 70750, 24], [70835, 70840, 1], [70842, 70847, 5], [70848, 70850, 2], [70851, 71090, 239], [71091, 71093, 1], [71100, 71101, 1], [71103, 71104, 1], [71132, 71133, 1], [71219, 71226, 1], [71229, 71231, 2], [71232, 71339, 107], [71341, 71344, 3], [71345, 71349, 1], [71351, 71453, 102], [71455, 71458, 3], [71459, 71461, 1], [71463, 71467, 1], [71727, 71735, 1], [71737, 71738, 1], [71995, 71996, 1], [71998, 72003, 5], [72148, 72151, 1], [72154, 72155, 1], [72160, 72193, 33], [72194, 72202, 1], [72243, 72248, 1], [72251, 72254, 1], [72263, 72273, 10], [72274, 72278, 1], [72281, 72283, 1], [72330, 72342, 1], [72344, 72345, 1], [72544, 72546, 2], [72547, 72548, 1], [72550, 72752, 202], [72753, 72758, 1], [72760, 72765, 1], [72767, 72850, 83], [72851, 72871, 1], [72874, 72880, 1], [72882, 72883, 1], [72885, 72886, 1], [73009, 73014, 1], [73018, 73020, 2], [73021, 73023, 2], [73024, 73029, 1], [73031, 73104, 73], [73105, 73109, 4], [73111, 73459, 348], [73460, 73472, 12], [73473, 73526, 53], [73527, 73530, 1], [73536, 73538, 2], [73562, 78912, 5350], [78919, 78933, 1], [90398, 90409, 1], [90413, 90415, 1], [92912, 92916, 1], [92976, 92982, 1], [94031, 94095, 64], [94096, 94098, 1], [94180, 113821, 19641], [113822, 118528, 4706], [118529, 118573, 1], [118576, 118598, 1], [119143, 119145, 1], [119163, 119170, 1], [119173, 119179, 1], [119210, 119213, 1], [119362, 119364, 1], [121344, 121398, 1], [121403, 121452, 1], [121461, 121476, 15], [121499, 121503, 1], [121505, 121519, 1], [122880, 122886, 1], [122888, 122904, 1], [122907, 122913, 1], [122915, 122916, 1], [122918, 122922, 1], [123023, 123184, 161], [123185, 123190, 1], [123566, 123628, 62], [123629, 123631, 1], [124140, 124143, 1], [124398, 124399, 1], [124643, 124646, 3], [124654, 124655, 1], [124661, 125136, 475], [125137, 125142, 1], [125252, 125258, 1], [917760, 917999, 1]], 0],
  "N": [[[48, 57, 1], [178, 179, 1], [185, 188, 3], [189, 190, 1], [1632, 1641, 1], [1776, 1785, 1], [1984, 1993, 1], [2406, 2415, 1], [2534, 2543, 1], [2548, 2553, 1], [2662, 2671, 1], [2790, 2799, 1], [2918, 2927, 1], [2930, 2935, 1], [3046, 3058, 1], [3174, 3183, 1], [3192, 3198, 1], [3302, 3311, 1], [3416, 3422, 1], [3430, 3448, 1], [3558, 3567, 1], [3664, 3673, 1], [3792, 3801, 1], [3872, 3891, 1], [4160, 4169, 1], [4240, 4249, 1], [4969, 4988, 1], [5870, 5872, 1], [6112, 6121, 1], [6128, 6137, 1], [6160, 6169, 1], [6470, 6479, 1], [6608, 6618, 1], [6784, 6793, 1], [6800, 6809, 1], [6992, 7001, 1], [7088, 7097, 1], [7232, 7241, 1], [7248, 7257, 1], [8304, 8308, 4], [8309, 8313, 1], [8320, 8329, 1], [8528, 8578, 1], [8581, 8585, 1], [9312, 9371, 1], [9450, 9471, 1], [10102, 10131, 1], [11517, 12295, 778], [12321, 12329, 1], [12344, 12346, 1], [12690, 12693, 1], [12832, 12841, 1], [12872, 12879, 1], [12881, 12895, 1], [12928, 12937, 1], [12977, 12991, 1], [42528, 42537, 1], [42726, 42735, 1], [43056, 43061, 1], [43216, 43225, 1], [43264, 43273, 1], [43472, 43481, 1], [43504, 43513, 1], [43600, 43609, 1], [44016, 44025, 1], [65296, 65305, 1]], [[65799, 65843, 1], [65856, 65912, 1], [65930, 65931, 1], [66273, 66299, 1], [66336, 66339, 1], [66369, 66378, 9], [66513, 66517, 1], [66720, 66729, 1], [67672, 67679, 1], [67705, 67711, 1], [67751, 67759, 1], [67835, 67839, 1], [67862, 67867, 1], [68028, 68029, 1], [68032, 68047, 1], [68050, 68095, 1], [68160, 68168, 1], [68221, 68222, 1], [68253, 68255, 1], [68331, 68335, 1], [68440, 68447, 1], [68472, 68479, 1], [68521, 68527, 1], [68858, 68863, 1], [68912, 68921, 1], [68928, 68937, 1], [69216, 69246, 1], [69405, 69414, 1], [69457, 69460, 1], [69573, 69579, 1], [69714, 69743, 1], [69872, 69881, 1], [69942, 69951, 1], [70096, 70105, 1], [70113, 70132, 1], [70384, 70393, 1], [70736, 70745, 1], [70864, 70873, 1], [71248, 71257, 1], [71360, 71369, 1], [71376, 71395, 1], [71472, 71483, 1], [71904, 71922, 1], [72016, 72025, 1], [72688, 72697, 1], [72784, 72812, 1], [73040, 73049, 1], [73120, 73129, 1], [73184, 73193, 1], [73552, 73561, 1], [73664, 73684, 1], [74752, 74862, 1], [90416, 90425, 1], [92768, 92777, 1], [92864, 92873, 1], [93008, 93017, 1], [93019, 93025, 1], [93552, 93561, 1], [93824, 93846, 1], [94196, 94198, 1], [118e3, 118009, 1], [119488, 119507, 1], [119520, 119539, 1], [119648, 119672, 1], [120782, 120831, 1], [123200, 123209, 1], [123632, 123641, 1], [124144, 124153, 1], [124401, 124410, 1], [125127, 125135, 1], [125264, 125273, 1], [126065, 126123, 1], [126125, 126127, 1], [126129, 126132, 1], [126209, 126253, 1], [126255, 126269, 1], [127232, 127244, 1], [130032, 130041, 1]], 4],
  "Nd": [[[48, 57, 1], [1632, 1641, 1], [1776, 1785, 1], [1984, 1993, 1], [2406, 2415, 1], [2534, 2543, 1], [2662, 2671, 1], [2790, 2799, 1], [2918, 2927, 1], [3046, 3055, 1], [3174, 3183, 1], [3302, 3311, 1], [3430, 3439, 1], [3558, 3567, 1], [3664, 3673, 1], [3792, 3801, 1], [3872, 3881, 1], [4160, 4169, 1], [4240, 4249, 1], [6112, 6121, 1], [6160, 6169, 1], [6470, 6479, 1], [6608, 6617, 1], [6784, 6793, 1], [6800, 6809, 1], [6992, 7001, 1], [7088, 7097, 1], [7232, 7241, 1], [7248, 7257, 1], [42528, 42537, 1], [43216, 43225, 1], [43264, 43273, 1], [43472, 43481, 1], [43504, 43513, 1], [43600, 43609, 1], [44016, 44025, 1], [65296, 65305, 1]], [[66720, 66729, 1], [68912, 68921, 1], [68928, 68937, 1], [69734, 69743, 1], [69872, 69881, 1], [69942, 69951, 1], [70096, 70105, 1], [70384, 70393, 1], [70736, 70745, 1], [70864, 70873, 1], [71248, 71257, 1], [71360, 71369, 1], [71376, 71395, 1], [71472, 71481, 1], [71904, 71913, 1], [72016, 72025, 1], [72688, 72697, 1], [72784, 72793, 1], [73040, 73049, 1], [73120, 73129, 1], [73184, 73193, 1], [73552, 73561, 1], [90416, 90425, 1], [92768, 92777, 1], [92864, 92873, 1], [93008, 93017, 1], [93552, 93561, 1], [118e3, 118009, 1], [120782, 120831, 1], [123200, 123209, 1], [123632, 123641, 1], [124144, 124153, 1], [124401, 124410, 1], [125264, 125273, 1], [130032, 130041, 1]], 1],
  "Nl": [[[5870, 5872, 1], [8544, 8578, 1], [8581, 8584, 1], [12295, 12321, 26], [12322, 12329, 1], [12344, 12346, 1], [42726, 42735, 1]], [[65856, 65908, 1], [66369, 66378, 9], [66513, 66517, 1], [74752, 74862, 1], [94196, 94198, 1]], 0],
  "No": [[[178, 179, 1], [185, 188, 3], [189, 190, 1], [2548, 2553, 1], [2930, 2935, 1], [3056, 3058, 1], [3192, 3198, 1], [3416, 3422, 1], [3440, 3448, 1], [3882, 3891, 1], [4969, 4988, 1], [6128, 6137, 1], [6618, 8304, 1686], [8308, 8313, 1], [8320, 8329, 1], [8528, 8543, 1], [8585, 9312, 727], [9313, 9371, 1], [9450, 9471, 1], [10102, 10131, 1], [11517, 12690, 1173], [12691, 12693, 1], [12832, 12841, 1], [12872, 12879, 1], [12881, 12895, 1], [12928, 12937, 1], [12977, 12991, 1], [43056, 43061, 1]], [[65799, 65843, 1], [65909, 65912, 1], [65930, 65931, 1], [66273, 66299, 1], [66336, 66339, 1], [67672, 67679, 1], [67705, 67711, 1], [67751, 67759, 1], [67835, 67839, 1], [67862, 67867, 1], [68028, 68029, 1], [68032, 68047, 1], [68050, 68095, 1], [68160, 68168, 1], [68221, 68222, 1], [68253, 68255, 1], [68331, 68335, 1], [68440, 68447, 1], [68472, 68479, 1], [68521, 68527, 1], [68858, 68863, 1], [69216, 69246, 1], [69405, 69414, 1], [69457, 69460, 1], [69573, 69579, 1], [69714, 69733, 1], [70113, 70132, 1], [71482, 71483, 1], [71914, 71922, 1], [72794, 72812, 1], [73664, 73684, 1], [93019, 93025, 1], [93824, 93846, 1], [119488, 119507, 1], [119520, 119539, 1], [119648, 119672, 1], [125127, 125135, 1], [126065, 126123, 1], [126125, 126127, 1], [126129, 126132, 1], [126209, 126253, 1], [126255, 126269, 1], [127232, 127244, 1]], 3],
  "P": [[[33, 35, 1], [37, 42, 1], [44, 47, 1], [58, 59, 1], [63, 64, 1], [91, 93, 1], [95, 123, 28], [125, 161, 36], [167, 171, 4], [182, 183, 1], [187, 191, 4], [894, 903, 9], [1370, 1375, 1], [1417, 1418, 1], [1470, 1472, 2], [1475, 1478, 3], [1523, 1524, 1], [1545, 1546, 1], [1548, 1549, 1], [1563, 1565, 2], [1566, 1567, 1], [1642, 1645, 1], [1748, 1792, 44], [1793, 1805, 1], [2039, 2041, 1], [2096, 2110, 1], [2142, 2404, 262], [2405, 2416, 11], [2557, 2678, 121], [2800, 3191, 391], [3204, 3572, 368], [3663, 3674, 11], [3675, 3844, 169], [3845, 3858, 1], [3860, 3898, 38], [3899, 3901, 1], [3973, 4048, 75], [4049, 4052, 1], [4057, 4058, 1], [4170, 4175, 1], [4347, 4960, 613], [4961, 4968, 1], [5120, 5742, 622], [5787, 5788, 1], [5867, 5869, 1], [5941, 5942, 1], [6100, 6102, 1], [6104, 6106, 1], [6144, 6154, 1], [6468, 6469, 1], [6686, 6687, 1], [6816, 6822, 1], [6824, 6829, 1], [6990, 6991, 1], [7002, 7008, 1], [7037, 7039, 1], [7164, 7167, 1], [7227, 7231, 1], [7294, 7295, 1], [7360, 7367, 1], [7379, 8208, 829], [8209, 8231, 1], [8240, 8259, 1], [8261, 8273, 1], [8275, 8286, 1], [8317, 8318, 1], [8333, 8334, 1], [8968, 8971, 1], [9001, 9002, 1], [10088, 10101, 1], [10181, 10182, 1], [10214, 10223, 1], [10627, 10648, 1], [10712, 10715, 1], [10748, 10749, 1], [11513, 11516, 1], [11518, 11519, 1], [11632, 11776, 144], [11777, 11822, 1], [11824, 11855, 1], [11858, 11869, 1], [12289, 12291, 1], [12296, 12305, 1], [12308, 12319, 1], [12336, 12349, 13], [12448, 12539, 91], [42238, 42239, 1], [42509, 42511, 1], [42611, 42622, 11], [42738, 42743, 1], [43124, 43127, 1], [43214, 43215, 1], [43256, 43258, 1], [43260, 43310, 50], [43311, 43359, 48], [43457, 43469, 1], [43486, 43487, 1], [43612, 43615, 1], [43742, 43743, 1], [43760, 43761, 1], [44011, 64830, 20819], [64831, 65040, 209], [65041, 65049, 1], [65072, 65106, 1], [65108, 65121, 1], [65123, 65128, 5], [65130, 65131, 1], [65281, 65283, 1], [65285, 65290, 1], [65292, 65295, 1], [65306, 65307, 1], [65311, 65312, 1], [65339, 65341, 1], [65343, 65371, 28], [65373, 65375, 2], [65376, 65381, 1]], [[65792, 65794, 1], [66463, 66512, 49], [66927, 67671, 744], [67871, 67903, 32], [68176, 68184, 1], [68223, 68336, 113], [68337, 68342, 1], [68409, 68415, 1], [68505, 68508, 1], [68974, 69293, 319], [69328, 69461, 133], [69462, 69465, 1], [69510, 69513, 1], [69703, 69709, 1], [69819, 69820, 1], [69822, 69825, 1], [69952, 69955, 1], [70004, 70005, 1], [70085, 70088, 1], [70093, 70107, 14], [70109, 70111, 1], [70200, 70205, 1], [70313, 70612, 299], [70613, 70615, 2], [70616, 70731, 115], [70732, 70735, 1], [70746, 70747, 1], [70749, 70854, 105], [71105, 71127, 1], [71233, 71235, 1], [71264, 71276, 1], [71353, 71484, 131], [71485, 71486, 1], [71739, 72004, 265], [72005, 72006, 1], [72162, 72255, 93], [72256, 72262, 1], [72346, 72348, 1], [72350, 72354, 1], [72448, 72457, 1], [72673, 72769, 96], [72770, 72773, 1], [72816, 72817, 1], [73463, 73464, 1], [73539, 73551, 1], [73727, 74864, 1137], [74865, 74868, 1], [77809, 77810, 1], [92782, 92783, 1], [92917, 92983, 66], [92984, 92987, 1], [92996, 93549, 553], [93550, 93551, 1], [93847, 93850, 1], [94178, 113823, 19645], [121479, 121483, 1], [124415, 125278, 863], [125279, 125279, 1]], 11],
  "Pc": [[[95, 8255, 8160], [8256, 8276, 20], [65075, 65076, 1], [65101, 65103, 1], [65343, 65343, 1]], [], 0],
  "Pd": [[[45, 1418, 1373], [1470, 5120, 3650], [6150, 8208, 2058], [8209, 8213, 1], [11799, 11802, 3], [11834, 11835, 1], [11840, 11869, 29], [12316, 12336, 20], [12448, 65073, 52625], [65074, 65112, 38], [65123, 65293, 170]], [[68974, 69293, 319]], 0],
  "Pe": [[[41, 93, 52], [125, 3899, 3774], [3901, 5788, 1887], [8262, 8318, 56], [8334, 8969, 635], [8971, 9002, 31], [10089, 10101, 2], [10182, 10215, 33], [10217, 10223, 2], [10628, 10648, 2], [10713, 10715, 2], [10749, 11811, 1062], [11813, 11817, 2], [11862, 11868, 2], [12297, 12305, 2], [12309, 12315, 2], [12318, 12319, 1], [64830, 65048, 218], [65078, 65092, 2], [65096, 65114, 18], [65116, 65118, 2], [65289, 65341, 52], [65373, 65379, 3]], [], 1],
  "Pf": [[[187, 8217, 8030], [8221, 8250, 29], [11779, 11781, 2], [11786, 11789, 3], [11805, 11809, 4]], [], 0],
  "Pi": [[[171, 8216, 8045], [8219, 8220, 1], [8223, 8249, 26], [11778, 11780, 2], [11785, 11788, 3], [11804, 11808, 4]], [], 0],
  "Po": [[[33, 35, 1], [37, 39, 1], [42, 46, 2], [47, 58, 11], [59, 63, 4], [64, 92, 28], [161, 167, 6], [182, 183, 1], [191, 894, 703], [903, 1370, 467], [1371, 1375, 1], [1417, 1472, 55], [1475, 1478, 3], [1523, 1524, 1], [1545, 1546, 1], [1548, 1549, 1], [1563, 1565, 2], [1566, 1567, 1], [1642, 1645, 1], [1748, 1792, 44], [1793, 1805, 1], [2039, 2041, 1], [2096, 2110, 1], [2142, 2404, 262], [2405, 2416, 11], [2557, 2678, 121], [2800, 3191, 391], [3204, 3572, 368], [3663, 3674, 11], [3675, 3844, 169], [3845, 3858, 1], [3860, 3973, 113], [4048, 4052, 1], [4057, 4058, 1], [4170, 4175, 1], [4347, 4960, 613], [4961, 4968, 1], [5742, 5867, 125], [5868, 5869, 1], [5941, 5942, 1], [6100, 6102, 1], [6104, 6106, 1], [6144, 6149, 1], [6151, 6154, 1], [6468, 6469, 1], [6686, 6687, 1], [6816, 6822, 1], [6824, 6829, 1], [6990, 6991, 1], [7002, 7008, 1], [7037, 7039, 1], [7164, 7167, 1], [7227, 7231, 1], [7294, 7295, 1], [7360, 7367, 1], [7379, 8214, 835], [8215, 8224, 9], [8225, 8231, 1], [8240, 8248, 1], [8251, 8254, 1], [8257, 8259, 1], [8263, 8273, 1], [8275, 8277, 2], [8278, 8286, 1], [11513, 11516, 1], [11518, 11519, 1], [11632, 11776, 144], [11777, 11782, 5], [11783, 11784, 1], [11787, 11790, 3], [11791, 11798, 1], [11800, 11801, 1], [11803, 11806, 3], [11807, 11818, 11], [11819, 11822, 1], [11824, 11833, 1], [11836, 11839, 1], [11841, 11843, 2], [11844, 11855, 1], [11858, 11860, 1], [12289, 12291, 1], [12349, 12539, 190], [42238, 42239, 1], [42509, 42511, 1], [42611, 42622, 11], [42738, 42743, 1], [43124, 43127, 1], [43214, 43215, 1], [43256, 43258, 1], [43260, 43310, 50], [43311, 43359, 48], [43457, 43469, 1], [43486, 43487, 1], [43612, 43615, 1], [43742, 43743, 1], [43760, 43761, 1], [44011, 65040, 21029], [65041, 65046, 1], [65049, 65072, 23], [65093, 65094, 1], [65097, 65100, 1], [65104, 65106, 1], [65108, 65111, 1], [65119, 65121, 1], [65128, 65130, 2], [65131, 65281, 150], [65282, 65283, 1], [65285, 65287, 1], [65290, 65294, 2], [65295, 65306, 11], [65307, 65311, 4], [65312, 65340, 28], [65377, 65380, 3], [65381, 65381, 1]], [[65792, 65794, 1], [66463, 66512, 49], [66927, 67671, 744], [67871, 67903, 32], [68176, 68184, 1], [68223, 68336, 113], [68337, 68342, 1], [68409, 68415, 1], [68505, 68508, 1], [69328, 69461, 133], [69462, 69465, 1], [69510, 69513, 1], [69703, 69709, 1], [69819, 69820, 1], [69822, 69825, 1], [69952, 69955, 1], [70004, 70005, 1], [70085, 70088, 1], [70093, 70107, 14], [70109, 70111, 1], [70200, 70205, 1], [70313, 70612, 299], [70613, 70615, 2], [70616, 70731, 115], [70732, 70735, 1], [70746, 70747, 1], [70749, 70854, 105], [71105, 71127, 1], [71233, 71235, 1], [71264, 71276, 1], [71353, 71484, 131], [71485, 71486, 1], [71739, 72004, 265], [72005, 72006, 1], [72162, 72255, 93], [72256, 72262, 1], [72346, 72348, 1], [72350, 72354, 1], [72448, 72457, 1], [72673, 72769, 96], [72770, 72773, 1], [72816, 72817, 1], [73463, 73464, 1], [73539, 73551, 1], [73727, 74864, 1137], [74865, 74868, 1], [77809, 77810, 1], [92782, 92783, 1], [92917, 92983, 66], [92984, 92987, 1], [92996, 93549, 553], [93550, 93551, 1], [93847, 93850, 1], [94178, 113823, 19645], [121479, 121483, 1], [124415, 125278, 863], [125279, 125279, 1]], 8],
  "Ps": [[[40, 91, 51], [123, 3898, 3775], [3900, 5787, 1887], [8218, 8222, 4], [8261, 8317, 56], [8333, 8968, 635], [8970, 9001, 31], [10088, 10100, 2], [10181, 10214, 33], [10216, 10222, 2], [10627, 10647, 2], [10712, 10714, 2], [10748, 11810, 1062], [11812, 11816, 2], [11842, 11861, 19], [11863, 11867, 2], [12296, 12304, 2], [12308, 12314, 2], [12317, 64831, 52514], [65047, 65077, 30], [65079, 65091, 2], [65095, 65113, 18], [65115, 65117, 2], [65288, 65339, 51], [65371, 65375, 4], [65378, 65378, 1]], [], 1],
  "S": [[[36, 43, 7], [60, 62, 1], [94, 96, 2], [124, 126, 2], [162, 166, 1], [168, 169, 1], [172, 174, 2], [175, 177, 1], [180, 184, 4], [215, 247, 32], [706, 709, 1], [722, 735, 1], [741, 747, 1], [749, 751, 2], [752, 767, 1], [885, 900, 15], [901, 1014, 113], [1154, 1421, 267], [1422, 1423, 1], [1542, 1544, 1], [1547, 1550, 3], [1551, 1758, 207], [1769, 1789, 20], [1790, 2038, 248], [2046, 2047, 1], [2184, 2546, 362], [2547, 2554, 7], [2555, 2801, 246], [2928, 3059, 131], [3060, 3066, 1], [3199, 3407, 208], [3449, 3647, 198], [3841, 3843, 1], [3859, 3861, 2], [3862, 3863, 1], [3866, 3871, 1], [3892, 3896, 2], [4030, 4037, 1], [4039, 4044, 1], [4046, 4047, 1], [4053, 4056, 1], [4254, 4255, 1], [5008, 5017, 1], [5741, 6107, 366], [6464, 6622, 158], [6623, 6655, 1], [7009, 7018, 1], [7028, 7036, 1], [8125, 8127, 2], [8128, 8129, 1], [8141, 8143, 1], [8157, 8159, 1], [8173, 8175, 1], [8189, 8190, 1], [8260, 8274, 14], [8314, 8316, 1], [8330, 8332, 1], [8352, 8385, 1], [8448, 8449, 1], [8451, 8454, 1], [8456, 8457, 1], [8468, 8470, 2], [8471, 8472, 1], [8478, 8483, 1], [8485, 8489, 2], [8494, 8506, 12], [8507, 8512, 5], [8513, 8516, 1], [8522, 8525, 1], [8527, 8586, 59], [8587, 8592, 5], [8593, 8967, 1], [8972, 9e3, 1], [9003, 9257, 1], [9280, 9290, 1], [9372, 9449, 1], [9472, 10087, 1], [10132, 10180, 1], [10183, 10213, 1], [10224, 10626, 1], [10649, 10711, 1], [10716, 10747, 1], [10750, 11123, 1], [11126, 11263, 1], [11493, 11498, 1], [11856, 11857, 1], [11904, 11929, 1], [11931, 12019, 1], [12032, 12245, 1], [12272, 12287, 1], [12292, 12306, 14], [12307, 12320, 13], [12342, 12343, 1], [12350, 12351, 1], [12443, 12444, 1], [12688, 12689, 1], [12694, 12703, 1], [12736, 12773, 1], [12783, 12800, 17], [12801, 12830, 1], [12842, 12871, 1], [12880, 12896, 16], [12897, 12927, 1], [12938, 12976, 1], [12992, 13311, 1], [19904, 19967, 1], [42128, 42182, 1], [42752, 42774, 1], [42784, 42785, 1], [42889, 42890, 1], [43048, 43051, 1], [43062, 43065, 1], [43639, 43641, 1], [43867, 43882, 15], [43883, 64297, 20414], [64434, 64466, 1], [64832, 64847, 1], [64912, 64913, 1], [64968, 64975, 1], [65020, 65023, 1], [65122, 65124, 2], [65125, 65126, 1], [65129, 65284, 155], [65291, 65308, 17], [65309, 65310, 1], [65342, 65344, 2], [65372, 65374, 2], [65504, 65510, 1], [65512, 65518, 1], [65532, 65533, 1]], [[65847, 65855, 1], [65913, 65929, 1], [65932, 65934, 1], [65936, 65948, 1], [65952, 66e3, 48], [66001, 66044, 1], [67703, 67704, 1], [68296, 69006, 710], [69007, 69329, 322], [69330, 69336, 1], [71487, 73685, 2198], [73686, 73713, 1], [92988, 92991, 1], [92997, 113820, 20823], [117760, 117999, 1], [118010, 118012, 1], [118016, 118451, 1], [118458, 118480, 1], [118496, 118512, 1], [118608, 118723, 1], [118784, 119029, 1], [119040, 119078, 1], [119081, 119140, 1], [119146, 119148, 1], [119171, 119172, 1], [119180, 119209, 1], [119214, 119274, 1], [119296, 119361, 1], [119365, 119552, 187], [119553, 119638, 1], [120513, 120539, 26], [120571, 120597, 26], [120629, 120655, 26], [120687, 120713, 26], [120745, 120771, 26], [120832, 121343, 1], [121399, 121402, 1], [121453, 121460, 1], [121462, 121475, 1], [121477, 121478, 1], [123215, 123647, 432], [126124, 126128, 4], [126254, 126704, 450], [126705, 126976, 271], [126977, 127019, 1], [127024, 127123, 1], [127136, 127150, 1], [127153, 127167, 1], [127169, 127183, 1], [127185, 127221, 1], [127245, 127405, 1], [127462, 127490, 1], [127504, 127547, 1], [127552, 127560, 1], [127568, 127569, 1], [127584, 127589, 1], [127744, 128728, 1], [128732, 128748, 1], [128752, 128764, 1], [128768, 128985, 1], [128992, 129003, 1], [129008, 129024, 16], [129025, 129035, 1], [129040, 129095, 1], [129104, 129113, 1], [129120, 129159, 1], [129168, 129197, 1], [129200, 129211, 1], [129216, 129217, 1], [129232, 129240, 1], [129280, 129623, 1], [129632, 129645, 1], [129648, 129660, 1], [129664, 129674, 1], [129678, 129734, 1], [129736, 129741, 5], [129742, 129756, 1], [129759, 129770, 1], [129775, 129784, 1], [129792, 129938, 1], [129940, 130031, 1], [130042, 130042, 1]], 10],
  "Sc": [[[36, 162, 126], [163, 165, 1], [1423, 1547, 124], [2046, 2047, 1], [2546, 2547, 1], [2555, 2801, 246], [3065, 3647, 582], [6107, 8352, 2245], [8353, 8385, 1], [43064, 65020, 21956], [65129, 65284, 155], [65504, 65505, 1], [65509, 65510, 1]], [[73693, 73696, 1], [123647, 126128, 2481]], 2],
  "Sk": [[[94, 96, 2], [168, 175, 7], [180, 184, 4], [706, 709, 1], [722, 735, 1], [741, 747, 1], [749, 751, 2], [752, 767, 1], [885, 900, 15], [901, 2184, 1283], [8125, 8127, 2], [8128, 8129, 1], [8141, 8143, 1], [8157, 8159, 1], [8173, 8175, 1], [8189, 8190, 1], [12443, 12444, 1], [42752, 42774, 1], [42784, 42785, 1], [42889, 42890, 1], [43867, 43882, 15], [43883, 64434, 20551], [64435, 64450, 1], [65342, 65344, 2], [65507, 65507, 1]], [[127995, 127999, 1]], 3],
  "Sm": [[[43, 60, 17], [61, 62, 1], [124, 126, 2], [172, 177, 5], [215, 247, 32], [1014, 1542, 528], [1543, 1544, 1], [8260, 8274, 14], [8314, 8316, 1], [8330, 8332, 1], [8472, 8512, 40], [8513, 8516, 1], [8523, 8592, 69], [8593, 8596, 1], [8602, 8603, 1], [8608, 8614, 3], [8622, 8654, 32], [8655, 8658, 3], [8660, 8692, 32], [8693, 8959, 1], [8992, 8993, 1], [9084, 9115, 31], [9116, 9139, 1], [9180, 9185, 1], [9655, 9665, 10], [9720, 9727, 1], [9839, 10176, 337], [10177, 10180, 1], [10183, 10213, 1], [10224, 10239, 1], [10496, 10626, 1], [10649, 10711, 1], [10716, 10747, 1], [10750, 11007, 1], [11056, 11076, 1], [11079, 11084, 1], [64297, 65122, 825], [65124, 65126, 1], [65291, 65308, 17], [65309, 65310, 1], [65372, 65374, 2], [65506, 65513, 7], [65514, 65516, 1]], [[69006, 69007, 1], [118512, 120513, 2001], [120539, 120571, 32], [120597, 120629, 32], [120655, 120687, 32], [120713, 120745, 32], [120771, 126704, 5933], [126705, 129232, 2527], [129233, 129240, 1]], 5],
  "So": [[[166, 169, 3], [174, 176, 2], [1154, 1421, 267], [1422, 1550, 128], [1551, 1758, 207], [1769, 1789, 20], [1790, 2038, 248], [2554, 2928, 374], [3059, 3064, 1], [3066, 3199, 133], [3407, 3449, 42], [3841, 3843, 1], [3859, 3861, 2], [3862, 3863, 1], [3866, 3871, 1], [3892, 3896, 2], [4030, 4037, 1], [4039, 4044, 1], [4046, 4047, 1], [4053, 4056, 1], [4254, 4255, 1], [5008, 5017, 1], [5741, 6464, 723], [6622, 6655, 1], [7009, 7018, 1], [7028, 7036, 1], [8448, 8449, 1], [8451, 8454, 1], [8456, 8457, 1], [8468, 8470, 2], [8471, 8478, 7], [8479, 8483, 1], [8485, 8489, 2], [8494, 8506, 12], [8507, 8522, 15], [8524, 8525, 1], [8527, 8586, 59], [8587, 8597, 10], [8598, 8601, 1], [8604, 8607, 1], [8609, 8610, 1], [8612, 8613, 1], [8615, 8621, 1], [8623, 8653, 1], [8656, 8657, 1], [8659, 8661, 2], [8662, 8691, 1], [8960, 8967, 1], [8972, 8991, 1], [8994, 9e3, 1], [9003, 9083, 1], [9085, 9114, 1], [9140, 9179, 1], [9186, 9257, 1], [9280, 9290, 1], [9372, 9449, 1], [9472, 9654, 1], [9656, 9664, 1], [9666, 9719, 1], [9728, 9838, 1], [9840, 10087, 1], [10132, 10175, 1], [10240, 10495, 1], [11008, 11055, 1], [11077, 11078, 1], [11085, 11123, 1], [11126, 11263, 1], [11493, 11498, 1], [11856, 11857, 1], [11904, 11929, 1], [11931, 12019, 1], [12032, 12245, 1], [12272, 12287, 1], [12292, 12306, 14], [12307, 12320, 13], [12342, 12343, 1], [12350, 12351, 1], [12688, 12689, 1], [12694, 12703, 1], [12736, 12773, 1], [12783, 12800, 17], [12801, 12830, 1], [12842, 12871, 1], [12880, 12896, 16], [12897, 12927, 1], [12938, 12976, 1], [12992, 13311, 1], [19904, 19967, 1], [42128, 42182, 1], [43048, 43051, 1], [43062, 43063, 1], [43065, 43639, 574], [43640, 43641, 1], [64451, 64466, 1], [64832, 64847, 1], [64912, 64913, 1], [64968, 64975, 1], [65021, 65023, 1], [65508, 65512, 4], [65517, 65518, 1], [65532, 65533, 1]], [[65847, 65855, 1], [65913, 65929, 1], [65932, 65934, 1], [65936, 65948, 1], [65952, 66e3, 48], [66001, 66044, 1], [67703, 67704, 1], [68296, 69329, 1033], [69330, 69336, 1], [71487, 73685, 2198], [73686, 73692, 1], [73697, 73713, 1], [92988, 92991, 1], [92997, 113820, 20823], [117760, 117999, 1], [118010, 118012, 1], [118016, 118451, 1], [118458, 118480, 1], [118496, 118511, 1], [118608, 118723, 1], [118784, 119029, 1], [119040, 119078, 1], [119081, 119140, 1], [119146, 119148, 1], [119171, 119172, 1], [119180, 119209, 1], [119214, 119274, 1], [119296, 119361, 1], [119365, 119552, 187], [119553, 119638, 1], [120832, 121343, 1], [121399, 121402, 1], [121453, 121460, 1], [121462, 121475, 1], [121477, 121478, 1], [123215, 126124, 2909], [126254, 126976, 722], [126977, 127019, 1], [127024, 127123, 1], [127136, 127150, 1], [127153, 127167, 1], [127169, 127183, 1], [127185, 127221, 1], [127245, 127405, 1], [127462, 127490, 1], [127504, 127547, 1], [127552, 127560, 1], [127568, 127569, 1], [127584, 127589, 1], [127744, 127994, 1], [128e3, 128728, 1], [128732, 128748, 1], [128752, 128764, 1], [128768, 128985, 1], [128992, 129003, 1], [129008, 129024, 16], [129025, 129035, 1], [129040, 129095, 1], [129104, 129113, 1], [129120, 129159, 1], [129168, 129197, 1], [129200, 129211, 1], [129216, 129217, 1], [129280, 129623, 1], [129632, 129645, 1], [129648, 129660, 1], [129664, 129674, 1], [129678, 129734, 1], [129736, 129741, 5], [129742, 129756, 1], [129759, 129770, 1], [129775, 129784, 1], [129792, 129938, 1], [129940, 130031, 1], [130042, 130042, 1]], 2],
  "Z": [[[32, 160, 128], [5760, 8192, 2432], [8193, 8202, 1], [8232, 8233, 1], [8239, 8287, 48], [12288, 12288, 1]], [], 1],
  "Zl": [[[8232, 8232, 1]], [], 0],
  "Zp": [[[8233, 8233, 1]], [], 0],
  "Zs": [[[32, 160, 128], [5760, 8192, 2432], [8193, 8202, 1], [8239, 8287, 48], [12288, 12288, 1]], [], 1]
};
var scriptData = {
  "Adlam": [[], [[125184, 125259, 1], [125264, 125273, 1], [125278, 125279, 1]], 0],
  "Ahom": [[], [[71424, 71450, 1], [71453, 71467, 1], [71472, 71494, 1]], 0],
  "Anatolian_Hieroglyphs": [[], [[82944, 83526, 1]], 0],
  "Arabic": [[[1536, 1540, 1], [1542, 1547, 1], [1549, 1562, 1], [1564, 1566, 1], [1568, 1599, 1], [1601, 1610, 1], [1622, 1647, 1], [1649, 1756, 1], [1758, 1791, 1], [1872, 1919, 1], [2160, 2193, 1], [2199, 2273, 1], [2275, 2303, 1], [64336, 64829, 1], [64832, 64975, 1], [65008, 65023, 1], [65136, 65140, 1], [65142, 65276, 1]], [[69216, 69246, 1], [69314, 69319, 1], [69328, 69336, 1], [69370, 69375, 1], [126464, 126467, 1], [126469, 126495, 1], [126497, 126498, 1], [126500, 126503, 3], [126505, 126514, 1], [126516, 126519, 1], [126521, 126523, 2], [126530, 126535, 5], [126537, 126541, 2], [126542, 126543, 1], [126545, 126546, 1], [126548, 126551, 3], [126553, 126561, 2], [126562, 126564, 2], [126567, 126570, 1], [126572, 126578, 1], [126580, 126583, 1], [126585, 126588, 1], [126590, 126592, 2], [126593, 126601, 1], [126603, 126619, 1], [126625, 126627, 1], [126629, 126633, 1], [126635, 126651, 1], [126704, 126705, 1]], 0],
  "Armenian": [[[1329, 1366, 1], [1369, 1418, 1], [1421, 1423, 1], [64275, 64279, 1]], [], 0],
  "Avestan": [[], [[68352, 68405, 1], [68409, 68415, 1]], 0],
  "Balinese": [[[6912, 6988, 1], [6990, 7039, 1]], [], 0],
  "Bamum": [[[42656, 42743, 1]], [[92160, 92728, 1]], 0],
  "Bassa_Vah": [[], [[92880, 92909, 1], [92912, 92917, 1]], 0],
  "Batak": [[[7104, 7155, 1], [7164, 7167, 1]], [], 0],
  "Bengali": [[[2432, 2435, 1], [2437, 2444, 1], [2447, 2448, 1], [2451, 2472, 1], [2474, 2480, 1], [2482, 2486, 4], [2487, 2489, 1], [2492, 2500, 1], [2503, 2504, 1], [2507, 2510, 1], [2519, 2524, 5], [2525, 2527, 2], [2528, 2531, 1], [2534, 2558, 1]], [], 0],
  "Beria_Erfe": [[], [[93856, 93880, 1], [93883, 93907, 1]], 0],
  "Bhaiksuki": [[], [[72704, 72712, 1], [72714, 72758, 1], [72760, 72773, 1], [72784, 72812, 1]], 0],
  "Bopomofo": [[[746, 747, 1], [12549, 12591, 1], [12704, 12735, 1]], [], 0],
  "Brahmi": [[], [[69632, 69709, 1], [69714, 69749, 1], [69759, 69759, 1]], 0],
  "Braille": [[[10240, 10495, 1]], [], 0],
  "Buginese": [[[6656, 6683, 1], [6686, 6687, 1]], [], 0],
  "Buhid": [[[5952, 5971, 1]], [], 0],
  "Canadian_Aboriginal": [[[5120, 5759, 1], [6320, 6389, 1]], [[72368, 72383, 1]], 0],
  "Carian": [[], [[66208, 66256, 1]], 0],
  "Caucasian_Albanian": [[], [[66864, 66915, 1], [66927, 66927, 1]], 0],
  "Chakma": [[], [[69888, 69940, 1], [69942, 69959, 1]], 0],
  "Cham": [[[43520, 43574, 1], [43584, 43597, 1], [43600, 43609, 1], [43612, 43615, 1]], [], 0],
  "Cherokee": [[[5024, 5109, 1], [5112, 5117, 1], [43888, 43967, 1]], [], 0],
  "Chorasmian": [[], [[69552, 69579, 1]], 0],
  "Common": [[[0, 64, 1], [91, 96, 1], [123, 169, 1], [171, 185, 1], [187, 191, 1], [215, 247, 32], [697, 735, 1], [741, 745, 1], [748, 767, 1], [884, 894, 10], [901, 903, 2], [1541, 1548, 7], [1563, 1567, 4], [1600, 1757, 157], [2274, 2404, 130], [2405, 3647, 1242], [4053, 4056, 1], [4347, 5867, 1520], [5868, 5869, 1], [5941, 5942, 1], [6146, 6147, 1], [6149, 7379, 1230], [7393, 7401, 8], [7402, 7404, 1], [7406, 7411, 1], [7413, 7415, 1], [7418, 8192, 774], [8193, 8203, 1], [8206, 8292, 1], [8294, 8304, 1], [8308, 8318, 1], [8320, 8334, 1], [8352, 8385, 1], [8448, 8485, 1], [8487, 8489, 1], [8492, 8497, 1], [8499, 8525, 1], [8527, 8543, 1], [8585, 8587, 1], [8592, 9257, 1], [9280, 9290, 1], [9312, 10239, 1], [10496, 11123, 1], [11126, 11263, 1], [11776, 11869, 1], [12272, 12292, 1], [12294, 12296, 2], [12297, 12320, 1], [12336, 12343, 1], [12348, 12351, 1], [12443, 12444, 1], [12448, 12539, 91], [12540, 12688, 148], [12689, 12703, 1], [12736, 12773, 1], [12783, 12832, 49], [12833, 12895, 1], [12927, 13007, 1], [13055, 13144, 89], [13145, 13311, 1], [19904, 19967, 1], [42752, 42785, 1], [42888, 42890, 1], [43056, 43065, 1], [43310, 43471, 161], [43867, 43882, 15], [43883, 64830, 20947], [64831, 65040, 209], [65041, 65049, 1], [65072, 65106, 1], [65108, 65126, 1], [65128, 65131, 1], [65279, 65281, 2], [65282, 65312, 1], [65339, 65344, 1], [65371, 65381, 1], [65392, 65438, 46], [65439, 65504, 65], [65505, 65510, 1], [65512, 65518, 1], [65529, 65533, 1]], [[65792, 65794, 1], [65799, 65843, 1], [65847, 65855, 1], [65936, 65948, 1], [66e3, 66044, 1], [66273, 66299, 1], [113824, 113827, 1], [117760, 118012, 1], [118016, 118451, 1], [118458, 118480, 1], [118496, 118512, 1], [118608, 118723, 1], [118784, 119029, 1], [119040, 119078, 1], [119081, 119142, 1], [119146, 119162, 1], [119171, 119172, 1], [119180, 119209, 1], [119214, 119274, 1], [119488, 119507, 1], [119520, 119539, 1], [119552, 119638, 1], [119648, 119672, 1], [119808, 119892, 1], [119894, 119964, 1], [119966, 119967, 1], [119970, 119973, 3], [119974, 119977, 3], [119978, 119980, 1], [119982, 119993, 1], [119995, 119997, 2], [119998, 120003, 1], [120005, 120069, 1], [120071, 120074, 1], [120077, 120084, 1], [120086, 120092, 1], [120094, 120121, 1], [120123, 120126, 1], [120128, 120132, 1], [120134, 120138, 4], [120139, 120144, 1], [120146, 120485, 1], [120488, 120779, 1], [120782, 120831, 1], [126065, 126132, 1], [126209, 126269, 1], [126976, 127019, 1], [127024, 127123, 1], [127136, 127150, 1], [127153, 127167, 1], [127169, 127183, 1], [127185, 127221, 1], [127232, 127405, 1], [127462, 127487, 1], [127489, 127490, 1], [127504, 127547, 1], [127552, 127560, 1], [127568, 127569, 1], [127584, 127589, 1], [127744, 128728, 1], [128732, 128748, 1], [128752, 128764, 1], [128768, 128985, 1], [128992, 129003, 1], [129008, 129024, 16], [129025, 129035, 1], [129040, 129095, 1], [129104, 129113, 1], [129120, 129159, 1], [129168, 129197, 1], [129200, 129211, 1], [129216, 129217, 1], [129232, 129240, 1], [129280, 129623, 1], [129632, 129645, 1], [129648, 129660, 1], [129664, 129674, 1], [129678, 129734, 1], [129736, 129741, 5], [129742, 129756, 1], [129759, 129770, 1], [129775, 129784, 1], [129792, 129938, 1], [129940, 130042, 1], [917505, 917536, 31], [917537, 917631, 1]], 6],
  "Coptic": [[[994, 1007, 1], [11392, 11507, 1], [11513, 11519, 1]], [], 0],
  "Cuneiform": [[], [[73728, 74649, 1], [74752, 74862, 1], [74864, 74868, 1], [74880, 75075, 1]], 0],
  "Cypriot": [[], [[67584, 67589, 1], [67592, 67594, 2], [67595, 67637, 1], [67639, 67640, 1], [67644, 67647, 3]], 0],
  "Cypro_Minoan": [[], [[77712, 77810, 1]], 0],
  "Cyrillic": [[[1024, 1156, 1], [1159, 1327, 1], [7296, 7306, 1], [7467, 7544, 77], [11744, 11775, 1], [42560, 42655, 1], [65070, 65071, 1]], [[122928, 122989, 1], [123023, 123023, 1]], 0],
  "Deseret": [[], [[66560, 66639, 1]], 0],
  "Devanagari": [[[2304, 2384, 1], [2389, 2403, 1], [2406, 2431, 1], [43232, 43263, 1]], [[72448, 72457, 1]], 0],
  "Dives_Akuru": [[], [[71936, 71942, 1], [71945, 71948, 3], [71949, 71955, 1], [71957, 71958, 1], [71960, 71989, 1], [71991, 71992, 1], [71995, 72006, 1], [72016, 72025, 1]], 0],
  "Dogra": [[], [[71680, 71739, 1]], 0],
  "Duployan": [[], [[113664, 113770, 1], [113776, 113788, 1], [113792, 113800, 1], [113808, 113817, 1], [113820, 113823, 1]], 0],
  "Egyptian_Hieroglyphs": [[], [[77824, 78933, 1], [78944, 82938, 1]], 0],
  "Elbasan": [[], [[66816, 66855, 1]], 0],
  "Elymaic": [[], [[69600, 69622, 1]], 0],
  "Ethiopic": [[[4608, 4680, 1], [4682, 4685, 1], [4688, 4694, 1], [4696, 4698, 2], [4699, 4701, 1], [4704, 4744, 1], [4746, 4749, 1], [4752, 4784, 1], [4786, 4789, 1], [4792, 4798, 1], [4800, 4802, 2], [4803, 4805, 1], [4808, 4822, 1], [4824, 4880, 1], [4882, 4885, 1], [4888, 4954, 1], [4957, 4988, 1], [4992, 5017, 1], [11648, 11670, 1], [11680, 11686, 1], [11688, 11694, 1], [11696, 11702, 1], [11704, 11710, 1], [11712, 11718, 1], [11720, 11726, 1], [11728, 11734, 1], [11736, 11742, 1], [43777, 43782, 1], [43785, 43790, 1], [43793, 43798, 1], [43808, 43814, 1], [43816, 43822, 1]], [[124896, 124902, 1], [124904, 124907, 1], [124909, 124910, 1], [124912, 124926, 1]], 0],
  "Garay": [[], [[68928, 68965, 1], [68969, 68997, 1], [69006, 69007, 1]], 0],
  "Georgian": [[[4256, 4293, 1], [4295, 4301, 6], [4304, 4346, 1], [4348, 4351, 1], [7312, 7354, 1], [7357, 7359, 1], [11520, 11557, 1], [11559, 11565, 6]], [], 0],
  "Glagolitic": [[[11264, 11359, 1]], [[122880, 122886, 1], [122888, 122904, 1], [122907, 122913, 1], [122915, 122916, 1], [122918, 122922, 1]], 0],
  "Gothic": [[], [[66352, 66378, 1]], 0],
  "Grantha": [[], [[70400, 70403, 1], [70405, 70412, 1], [70415, 70416, 1], [70419, 70440, 1], [70442, 70448, 1], [70450, 70451, 1], [70453, 70457, 1], [70460, 70468, 1], [70471, 70472, 1], [70475, 70477, 1], [70480, 70487, 7], [70493, 70499, 1], [70502, 70508, 1], [70512, 70516, 1]], 0],
  "Greek": [[[880, 883, 1], [885, 887, 1], [890, 893, 1], [895, 900, 5], [902, 904, 2], [905, 906, 1], [908, 910, 2], [911, 929, 1], [931, 993, 1], [1008, 1023, 1], [7462, 7466, 1], [7517, 7521, 1], [7526, 7530, 1], [7615, 7936, 321], [7937, 7957, 1], [7960, 7965, 1], [7968, 8005, 1], [8008, 8013, 1], [8016, 8023, 1], [8025, 8031, 2], [8032, 8061, 1], [8064, 8116, 1], [8118, 8132, 1], [8134, 8147, 1], [8150, 8155, 1], [8157, 8175, 1], [8178, 8180, 1], [8182, 8190, 1], [8486, 43877, 35391]], [[65856, 65934, 1], [65952, 119296, 53344], [119297, 119365, 1]], 0],
  "Gujarati": [[[2689, 2691, 1], [2693, 2701, 1], [2703, 2705, 1], [2707, 2728, 1], [2730, 2736, 1], [2738, 2739, 1], [2741, 2745, 1], [2748, 2757, 1], [2759, 2761, 1], [2763, 2765, 1], [2768, 2784, 16], [2785, 2787, 1], [2790, 2801, 1], [2809, 2815, 1]], [], 0],
  "Gunjala_Gondi": [[], [[73056, 73061, 1], [73063, 73064, 1], [73066, 73102, 1], [73104, 73105, 1], [73107, 73112, 1], [73120, 73129, 1]], 0],
  "Gurmukhi": [[[2561, 2563, 1], [2565, 2570, 1], [2575, 2576, 1], [2579, 2600, 1], [2602, 2608, 1], [2610, 2611, 1], [2613, 2614, 1], [2616, 2617, 1], [2620, 2622, 2], [2623, 2626, 1], [2631, 2632, 1], [2635, 2637, 1], [2641, 2649, 8], [2650, 2652, 1], [2654, 2662, 8], [2663, 2678, 1]], [], 0],
  "Gurung_Khema": [[], [[90368, 90425, 1]], 0],
  "Han": [[[11904, 11929, 1], [11931, 12019, 1], [12032, 12245, 1], [12293, 12295, 2], [12321, 12329, 1], [12344, 12347, 1], [13312, 19903, 1], [19968, 40959, 1], [63744, 64109, 1], [64112, 64217, 1]], [[94178, 94179, 1], [94192, 94198, 1], [131072, 173791, 1], [173824, 178205, 1], [178208, 183981, 1], [183984, 191456, 1], [191472, 192093, 1], [194560, 195101, 1], [196608, 201546, 1], [201552, 210041, 1]], 0],
  "Hangul": [[[4352, 4607, 1], [12334, 12335, 1], [12593, 12686, 1], [12800, 12830, 1], [12896, 12926, 1], [43360, 43388, 1], [44032, 55203, 1], [55216, 55238, 1], [55243, 55291, 1], [65440, 65470, 1], [65474, 65479, 1], [65482, 65487, 1], [65490, 65495, 1], [65498, 65500, 1]], [], 0],
  "Hanifi_Rohingya": [[], [[68864, 68903, 1], [68912, 68921, 1]], 0],
  "Hanunoo": [[[5920, 5940, 1]], [], 0],
  "Hatran": [[], [[67808, 67826, 1], [67828, 67829, 1], [67835, 67839, 1]], 0],
  "Hebrew": [[[1425, 1479, 1], [1488, 1514, 1], [1519, 1524, 1], [64285, 64310, 1], [64312, 64316, 1], [64318, 64320, 2], [64321, 64323, 2], [64324, 64326, 2], [64327, 64335, 1]], [], 0],
  "Hiragana": [[[12353, 12438, 1], [12445, 12447, 1]], [[110593, 110879, 1], [110898, 110928, 30], [110929, 110930, 1], [127488, 127488, 1]], 0],
  "Imperial_Aramaic": [[], [[67648, 67669, 1], [67671, 67679, 1]], 0],
  "Inherited": [[[768, 879, 1], [1157, 1158, 1], [1611, 1621, 1], [1648, 2385, 737], [2386, 2388, 1], [6832, 6877, 1], [6880, 6891, 1], [7376, 7378, 1], [7380, 7392, 1], [7394, 7400, 1], [7405, 7412, 7], [7416, 7417, 1], [7616, 7679, 1], [8204, 8205, 1], [8400, 8432, 1], [12330, 12333, 1], [12441, 12442, 1], [65024, 65039, 1], [65056, 65069, 1]], [[66045, 66272, 227], [70459, 118528, 48069], [118529, 118573, 1], [118576, 118598, 1], [119143, 119145, 1], [119163, 119170, 1], [119173, 119179, 1], [119210, 119213, 1], [917760, 917999, 1]], 0],
  "Inscriptional_Pahlavi": [[], [[68448, 68466, 1], [68472, 68479, 1]], 0],
  "Inscriptional_Parthian": [[], [[68416, 68437, 1], [68440, 68447, 1]], 0],
  "Javanese": [[[43392, 43469, 1], [43472, 43481, 1], [43486, 43487, 1]], [], 0],
  "Kaithi": [[], [[69760, 69826, 1], [69837, 69837, 1]], 0],
  "Kannada": [[[3200, 3212, 1], [3214, 3216, 1], [3218, 3240, 1], [3242, 3251, 1], [3253, 3257, 1], [3260, 3268, 1], [3270, 3272, 1], [3274, 3277, 1], [3285, 3286, 1], [3292, 3294, 1], [3296, 3299, 1], [3302, 3311, 1], [3313, 3315, 1]], [], 0],
  "Katakana": [[[12449, 12538, 1], [12541, 12543, 1], [12784, 12799, 1], [13008, 13054, 1], [13056, 13143, 1], [65382, 65391, 1], [65393, 65437, 1]], [[110576, 110579, 1], [110581, 110587, 1], [110589, 110590, 1], [110592, 110880, 288], [110881, 110882, 1], [110933, 110948, 15], [110949, 110951, 1]], 0],
  "Kawi": [[], [[73472, 73488, 1], [73490, 73530, 1], [73534, 73562, 1]], 0],
  "Kayah_Li": [[[43264, 43309, 1], [43311, 43311, 1]], [], 0],
  "Kharoshthi": [[], [[68096, 68099, 1], [68101, 68102, 1], [68108, 68115, 1], [68117, 68119, 1], [68121, 68149, 1], [68152, 68154, 1], [68159, 68168, 1], [68176, 68184, 1]], 0],
  "Khitan_Small_Script": [[], [[94180, 101120, 6940], [101121, 101589, 1], [101631, 101631, 1]], 0],
  "Khmer": [[[6016, 6109, 1], [6112, 6121, 1], [6128, 6137, 1], [6624, 6655, 1]], [], 0],
  "Khojki": [[], [[70144, 70161, 1], [70163, 70209, 1]], 0],
  "Khudawadi": [[], [[70320, 70378, 1], [70384, 70393, 1]], 0],
  "Kirat_Rai": [[], [[93504, 93561, 1]], 0],
  "Lao": [[[3713, 3714, 1], [3716, 3718, 2], [3719, 3722, 1], [3724, 3747, 1], [3749, 3751, 2], [3752, 3773, 1], [3776, 3780, 1], [3782, 3784, 2], [3785, 3790, 1], [3792, 3801, 1], [3804, 3807, 1]], [], 0],
  "Latin": [[[65, 90, 1], [97, 122, 1], [170, 186, 16], [192, 214, 1], [216, 246, 1], [248, 696, 1], [736, 740, 1], [7424, 7461, 1], [7468, 7516, 1], [7522, 7525, 1], [7531, 7543, 1], [7545, 7614, 1], [7680, 7935, 1], [8305, 8319, 14], [8336, 8348, 1], [8490, 8491, 1], [8498, 8526, 28], [8544, 8584, 1], [11360, 11391, 1], [42786, 42887, 1], [42891, 42972, 1], [42993, 43007, 1], [43824, 43866, 1], [43868, 43876, 1], [43878, 43881, 1], [64256, 64262, 1], [65313, 65338, 1], [65345, 65370, 1]], [[67456, 67461, 1], [67463, 67504, 1], [67506, 67514, 1], [122624, 122654, 1], [122661, 122666, 1]], 5],
  "Lepcha": [[[7168, 7223, 1], [7227, 7241, 1], [7245, 7247, 1]], [], 0],
  "Limbu": [[[6400, 6430, 1], [6432, 6443, 1], [6448, 6459, 1], [6464, 6468, 4], [6469, 6479, 1]], [], 0],
  "Linear_A": [[], [[67072, 67382, 1], [67392, 67413, 1], [67424, 67431, 1]], 0],
  "Linear_B": [[], [[65536, 65547, 1], [65549, 65574, 1], [65576, 65594, 1], [65596, 65597, 1], [65599, 65613, 1], [65616, 65629, 1], [65664, 65786, 1]], 0],
  "Lisu": [[[42192, 42239, 1]], [[73648, 73648, 1]], 0],
  "Lycian": [[], [[66176, 66204, 1]], 0],
  "Lydian": [[], [[67872, 67897, 1], [67903, 67903, 1]], 0],
  "Mahajani": [[], [[69968, 70006, 1]], 0],
  "Makasar": [[], [[73440, 73464, 1]], 0],
  "Malayalam": [[[3328, 3340, 1], [3342, 3344, 1], [3346, 3396, 1], [3398, 3400, 1], [3402, 3407, 1], [3412, 3427, 1], [3430, 3455, 1]], [], 0],
  "Mandaic": [[[2112, 2139, 1], [2142, 2142, 1]], [], 0],
  "Manichaean": [[], [[68288, 68326, 1], [68331, 68342, 1]], 0],
  "Marchen": [[], [[72816, 72847, 1], [72850, 72871, 1], [72873, 72886, 1]], 0],
  "Masaram_Gondi": [[], [[72960, 72966, 1], [72968, 72969, 1], [72971, 73014, 1], [73018, 73020, 2], [73021, 73023, 2], [73024, 73031, 1], [73040, 73049, 1]], 0],
  "Medefaidrin": [[], [[93760, 93850, 1]], 0],
  "Meetei_Mayek": [[[43744, 43766, 1], [43968, 44013, 1], [44016, 44025, 1]], [], 0],
  "Mende_Kikakui": [[], [[124928, 125124, 1], [125127, 125142, 1]], 0],
  "Meroitic_Cursive": [[], [[68e3, 68023, 1], [68028, 68047, 1], [68050, 68095, 1]], 0],
  "Meroitic_Hieroglyphs": [[], [[67968, 67999, 1]], 0],
  "Miao": [[], [[93952, 94026, 1], [94031, 94087, 1], [94095, 94111, 1]], 0],
  "Modi": [[], [[71168, 71236, 1], [71248, 71257, 1]], 0],
  "Mongolian": [[[6144, 6145, 1], [6148, 6150, 2], [6151, 6169, 1], [6176, 6264, 1], [6272, 6314, 1]], [[71264, 71276, 1]], 0],
  "Mro": [[], [[92736, 92766, 1], [92768, 92777, 1], [92782, 92783, 1]], 0],
  "Multani": [[], [[70272, 70278, 1], [70280, 70282, 2], [70283, 70285, 1], [70287, 70301, 1], [70303, 70313, 1]], 0],
  "Myanmar": [[[4096, 4255, 1], [43488, 43518, 1], [43616, 43647, 1]], [[71376, 71395, 1]], 0],
  "Nabataean": [[], [[67712, 67742, 1], [67751, 67759, 1]], 0],
  "Nag_Mundari": [[], [[124112, 124153, 1]], 0],
  "Nandinagari": [[], [[72096, 72103, 1], [72106, 72151, 1], [72154, 72164, 1]], 0],
  "New_Tai_Lue": [[[6528, 6571, 1], [6576, 6601, 1], [6608, 6618, 1], [6622, 6623, 1]], [], 0],
  "Newa": [[], [[70656, 70747, 1], [70749, 70753, 1]], 0],
  "Nko": [[[1984, 2042, 1], [2045, 2047, 1]], [], 0],
  "Nushu": [[], [[94177, 110960, 16783], [110961, 111355, 1]], 0],
  "Nyiakeng_Puachue_Hmong": [[], [[123136, 123180, 1], [123184, 123197, 1], [123200, 123209, 1], [123214, 123215, 1]], 0],
  "Ogham": [[[5760, 5788, 1]], [], 0],
  "Ol_Chiki": [[[7248, 7295, 1]], [], 0],
  "Ol_Onal": [[], [[124368, 124410, 1], [124415, 124415, 1]], 0],
  "Old_Hungarian": [[], [[68736, 68786, 1], [68800, 68850, 1], [68858, 68863, 1]], 0],
  "Old_Italic": [[], [[66304, 66339, 1], [66349, 66351, 1]], 0],
  "Old_North_Arabian": [[], [[68224, 68255, 1]], 0],
  "Old_Permic": [[], [[66384, 66426, 1]], 0],
  "Old_Persian": [[], [[66464, 66499, 1], [66504, 66517, 1]], 0],
  "Old_Sogdian": [[], [[69376, 69415, 1]], 0],
  "Old_South_Arabian": [[], [[68192, 68223, 1]], 0],
  "Old_Turkic": [[], [[68608, 68680, 1]], 0],
  "Old_Uyghur": [[], [[69488, 69513, 1]], 0],
  "Oriya": [[[2817, 2819, 1], [2821, 2828, 1], [2831, 2832, 1], [2835, 2856, 1], [2858, 2864, 1], [2866, 2867, 1], [2869, 2873, 1], [2876, 2884, 1], [2887, 2888, 1], [2891, 2893, 1], [2901, 2903, 1], [2908, 2909, 1], [2911, 2915, 1], [2918, 2935, 1]], [], 0],
  "Osage": [[], [[66736, 66771, 1], [66776, 66811, 1]], 0],
  "Osmanya": [[], [[66688, 66717, 1], [66720, 66729, 1]], 0],
  "Pahawh_Hmong": [[], [[92928, 92997, 1], [93008, 93017, 1], [93019, 93025, 1], [93027, 93047, 1], [93053, 93071, 1]], 0],
  "Palmyrene": [[], [[67680, 67711, 1]], 0],
  "Pau_Cin_Hau": [[], [[72384, 72440, 1]], 0],
  "Phags_Pa": [[[43072, 43127, 1]], [], 0],
  "Phoenician": [[], [[67840, 67867, 1], [67871, 67871, 1]], 0],
  "Psalter_Pahlavi": [[], [[68480, 68497, 1], [68505, 68508, 1], [68521, 68527, 1]], 0],
  "Rejang": [[[43312, 43347, 1], [43359, 43359, 1]], [], 0],
  "Runic": [[[5792, 5866, 1], [5870, 5880, 1]], [], 0],
  "Samaritan": [[[2048, 2093, 1], [2096, 2110, 1]], [], 0],
  "Saurashtra": [[[43136, 43205, 1], [43214, 43225, 1]], [], 0],
  "Sharada": [[], [[70016, 70111, 1], [72544, 72551, 1]], 0],
  "Shavian": [[], [[66640, 66687, 1]], 0],
  "Siddham": [[], [[71040, 71093, 1], [71096, 71133, 1]], 0],
  "Sidetic": [[], [[67904, 67929, 1]], 0],
  "SignWriting": [[], [[120832, 121483, 1], [121499, 121503, 1], [121505, 121519, 1]], 0],
  "Sinhala": [[[3457, 3459, 1], [3461, 3478, 1], [3482, 3505, 1], [3507, 3515, 1], [3517, 3520, 3], [3521, 3526, 1], [3530, 3535, 5], [3536, 3540, 1], [3542, 3544, 2], [3545, 3551, 1], [3558, 3567, 1], [3570, 3572, 1]], [[70113, 70132, 1]], 0],
  "Sogdian": [[], [[69424, 69465, 1]], 0],
  "Sora_Sompeng": [[], [[69840, 69864, 1], [69872, 69881, 1]], 0],
  "Soyombo": [[], [[72272, 72354, 1]], 0],
  "Sundanese": [[[7040, 7103, 1], [7360, 7367, 1]], [], 0],
  "Sunuwar": [[], [[72640, 72673, 1], [72688, 72697, 1]], 0],
  "Syloti_Nagri": [[[43008, 43052, 1]], [], 0],
  "Syriac": [[[1792, 1805, 1], [1807, 1866, 1], [1869, 1871, 1], [2144, 2154, 1]], [], 0],
  "Tagalog": [[[5888, 5909, 1], [5919, 5919, 1]], [], 0],
  "Tagbanwa": [[[5984, 5996, 1], [5998, 6e3, 1], [6002, 6003, 1]], [], 0],
  "Tai_Le": [[[6480, 6509, 1], [6512, 6516, 1]], [], 0],
  "Tai_Tham": [[[6688, 6750, 1], [6752, 6780, 1], [6783, 6793, 1], [6800, 6809, 1], [6816, 6829, 1]], [], 0],
  "Tai_Viet": [[[43648, 43714, 1], [43739, 43743, 1]], [], 0],
  "Tai_Yo": [[], [[124608, 124638, 1], [124640, 124661, 1], [124670, 124671, 1]], 0],
  "Takri": [[], [[71296, 71353, 1], [71360, 71369, 1]], 0],
  "Tamil": [[[2946, 2947, 1], [2949, 2954, 1], [2958, 2960, 1], [2962, 2965, 1], [2969, 2970, 1], [2972, 2974, 2], [2975, 2979, 4], [2980, 2984, 4], [2985, 2986, 1], [2990, 3001, 1], [3006, 3010, 1], [3014, 3016, 1], [3018, 3021, 1], [3024, 3031, 7], [3046, 3066, 1]], [[73664, 73713, 1], [73727, 73727, 1]], 0],
  "Tangsa": [[], [[92784, 92862, 1], [92864, 92873, 1]], 0],
  "Tangut": [[], [[94176, 94208, 32], [94209, 101119, 1], [101632, 101662, 1], [101760, 101874, 1]], 0],
  "Telugu": [[[3072, 3084, 1], [3086, 3088, 1], [3090, 3112, 1], [3114, 3129, 1], [3132, 3140, 1], [3142, 3144, 1], [3146, 3149, 1], [3157, 3158, 1], [3160, 3162, 1], [3164, 3165, 1], [3168, 3171, 1], [3174, 3183, 1], [3191, 3199, 1]], [], 0],
  "Thaana": [[[1920, 1969, 1]], [], 0],
  "Thai": [[[3585, 3642, 1], [3648, 3675, 1]], [], 0],
  "Tibetan": [[[3840, 3911, 1], [3913, 3948, 1], [3953, 3991, 1], [3993, 4028, 1], [4030, 4044, 1], [4046, 4052, 1], [4057, 4058, 1]], [], 0],
  "Tifinagh": [[[11568, 11623, 1], [11631, 11632, 1], [11647, 11647, 1]], [], 0],
  "Tirhuta": [[], [[70784, 70855, 1], [70864, 70873, 1]], 0],
  "Todhri": [[], [[67008, 67059, 1]], 0],
  "Tolong_Siki": [[], [[73136, 73179, 1], [73184, 73193, 1]], 0],
  "Toto": [[], [[123536, 123566, 1]], 0],
  "Tulu_Tigalari": [[], [[70528, 70537, 1], [70539, 70542, 3], [70544, 70581, 1], [70583, 70592, 1], [70594, 70597, 3], [70599, 70602, 1], [70604, 70613, 1], [70615, 70616, 1], [70625, 70626, 1]], 0],
  "Ugaritic": [[], [[66432, 66461, 1], [66463, 66463, 1]], 0],
  "Vai": [[[42240, 42539, 1]], [], 0],
  "Vithkuqi": [[], [[66928, 66938, 1], [66940, 66954, 1], [66956, 66962, 1], [66964, 66965, 1], [66967, 66977, 1], [66979, 66993, 1], [66995, 67001, 1], [67003, 67004, 1]], 0],
  "Wancho": [[], [[123584, 123641, 1], [123647, 123647, 1]], 0],
  "Warang_Citi": [[], [[71840, 71922, 1], [71935, 71935, 1]], 0],
  "Yezidi": [[], [[69248, 69289, 1], [69291, 69293, 1], [69296, 69297, 1]], 0],
  "Yi": [[[40960, 42124, 1], [42128, 42182, 1]], [], 0],
  "Zanabazar_Square": [[], [[72192, 72263, 1]], 0]
};
var propertyData = {
  "ASCII_Hex_Digit": [[[48, 57, 1], [65, 70, 1], [97, 102, 1]], [], 3],
  "Bidi_Control": [[[1564, 8206, 6642], [8207, 8234, 27], [8235, 8238, 1], [8294, 8297, 1]], [], 0],
  "Dash": [[[45, 1418, 1373], [1470, 5120, 3650], [6150, 8208, 2058], [8209, 8213, 1], [8275, 8315, 40], [8331, 8722, 391], [11799, 11802, 3], [11834, 11835, 1], [11840, 11869, 29], [12316, 12336, 20], [12448, 65073, 52625], [65074, 65112, 38], [65123, 65293, 170]], [[68974, 69293, 319]], 0],
  "Deprecated": [[[329, 1651, 1322], [3959, 3961, 2], [6051, 6052, 1], [8298, 8303, 1], [9001, 9002, 1]], [[917505, 917505, 1]], 0],
  "Diacritic": [[[94, 96, 2], [168, 175, 7], [180, 183, 3], [184, 688, 504], [689, 846, 1], [848, 855, 1], [861, 866, 1], [884, 885, 1], [890, 900, 10], [901, 1155, 254], [1156, 1159, 1], [1369, 1425, 56], [1426, 1469, 1], [1471, 1473, 2], [1474, 1476, 2], [1477, 1479, 2], [1611, 1618, 1], [1623, 1624, 1], [1759, 1760, 1], [1765, 1766, 1], [1770, 1772, 1], [1840, 1866, 1], [1958, 1968, 1], [2027, 2037, 1], [2072, 2073, 1], [2200, 2207, 1], [2249, 2258, 1], [2275, 2302, 1], [2364, 2381, 17], [2385, 2388, 1], [2417, 2492, 75], [2509, 2620, 111], [2637, 2748, 111], [2765, 2813, 48], [2814, 2815, 1], [2876, 2893, 17], [2901, 3021, 120], [3132, 3149, 17], [3260, 3277, 17], [3387, 3388, 1], [3405, 3530, 125], [3642, 3655, 13], [3656, 3660, 1], [3662, 3770, 108], [3784, 3788, 1], [3864, 3865, 1], [3893, 3897, 2], [3902, 3903, 1], [3970, 3972, 1], [3974, 3975, 1], [4038, 4151, 113], [4153, 4154, 1], [4195, 4196, 1], [4201, 4205, 1], [4231, 4237, 1], [4239, 4250, 11], [4251, 4957, 706], [4958, 4959, 1], [5908, 5909, 1], [5940, 6089, 149], [6090, 6099, 1], [6109, 6457, 348], [6458, 6459, 1], [6752, 6773, 21], [6774, 6780, 1], [6783, 6832, 49], [6833, 6846, 1], [6849, 6859, 1], [6863, 6877, 1], [6880, 6891, 1], [6964, 6980, 16], [7019, 7027, 1], [7082, 7083, 1], [7142, 7154, 12], [7155, 7222, 67], [7223, 7288, 65], [7289, 7293, 1], [7376, 7400, 1], [7405, 7412, 7], [7415, 7417, 1], [7468, 7530, 1], [7579, 7614, 1], [7620, 7631, 1], [7669, 7679, 1], [8125, 8127, 2], [8128, 8129, 1], [8141, 8143, 1], [8157, 8159, 1], [8173, 8175, 1], [8189, 8190, 1], [11503, 11505, 1], [11823, 12330, 507], [12331, 12335, 1], [12441, 12444, 1], [12540, 42607, 30067], [42620, 42621, 1], [42623, 42652, 29], [42653, 42736, 83], [42737, 42752, 15], [42753, 42785, 1], [42888, 42890, 1], [42993, 43e3, 7], [43001, 43014, 13], [43052, 43204, 152], [43232, 43249, 1], [43307, 43310, 1], [43347, 43443, 96], [43456, 43493, 37], [43643, 43645, 1], [43711, 43714, 1], [43766, 43867, 101], [43868, 43871, 1], [43881, 43883, 1], [44012, 44013, 1], [64286, 65056, 770], [65057, 65071, 1], [65342, 65344, 2], [65392, 65438, 46], [65439, 65507, 68]], [[66272, 67456, 1184], [67457, 67461, 1], [67463, 67504, 1], [67506, 67514, 1], [68152, 68154, 1], [68159, 68325, 166], [68326, 68898, 572], [68899, 68903, 1], [68942, 68969, 27], [68970, 68973, 1], [69370, 69373, 3], [69374, 69375, 1], [69446, 69456, 1], [69506, 69509, 1], [69702, 69744, 42], [69817, 69818, 1], [69939, 69940, 1], [70003, 70080, 77], [70090, 70092, 1], [70197, 70198, 1], [70377, 70378, 1], [70459, 70460, 1], [70477, 70502, 25], [70503, 70508, 1], [70512, 70516, 1], [70606, 70608, 1], [70610, 70611, 1], [70625, 70626, 1], [70722, 70726, 4], [70850, 70851, 1], [71103, 71104, 1], [71231, 71350, 119], [71351, 71467, 116], [71737, 71738, 1], [71997, 71998, 1], [72003, 72160, 157], [72244, 72263, 19], [72345, 72767, 422], [73026, 73028, 2], [73029, 73111, 82], [73177, 73537, 360], [73538, 73562, 24], [78919, 78933, 1], [90415, 92912, 2497], [92913, 92916, 1], [92976, 92982, 1], [93547, 93548, 1], [94095, 94111, 1], [94192, 94193, 1], [110576, 110579, 1], [110581, 110587, 1], [110589, 110590, 1], [118528, 118573, 1], [118576, 118598, 1], [119143, 119145, 1], [119149, 119154, 1], [119163, 119170, 1], [119173, 119179, 1], [119210, 119213, 1], [122928, 122989, 1], [123184, 123190, 1], [123566, 123628, 62], [123629, 123631, 1], [124398, 124399, 1], [125136, 125142, 1], [125252, 125254, 1], [125256, 125258, 1]], 3],
  "Extender": [[[183, 720, 537], [721, 1600, 879], [2042, 2673, 631], [2811, 2901, 90], [3654, 3782, 128], [6154, 6211, 57], [6823, 7222, 399], [7291, 12293, 5002], [12337, 12341, 1], [12445, 12446, 1], [12540, 12542, 1], [40981, 42508, 1527], [43471, 43494, 23], [43632, 43741, 109], [43763, 43764, 1], [65392, 65392, 1]], [[67457, 67458, 1], [68942, 68970, 28], [68975, 70199, 1224], [70493, 70610, 117], [70611, 71110, 499], [71111, 71112, 1], [72344, 73177, 833], [92994, 92995, 1], [94176, 94177, 1], [94179, 94194, 15], [94195, 123196, 29001], [123197, 124399, 1202], [125252, 125254, 1]], 0],
  "Hex_Digit": [[[48, 57, 1], [65, 70, 1], [97, 102, 1], [65296, 65305, 1], [65313, 65318, 1], [65345, 65350, 1]], [], 3],
  "Hyphen": [[[45, 173, 128], [1418, 6150, 4732], [8208, 8209, 1], [11799, 12539, 740], [65123, 65293, 170], [65381, 65381, 1]], [], 1],
  "IDS_Binary_Operator": [[[12272, 12273, 1], [12276, 12285, 1], [12783, 12783, 1]], [], 0],
  "IDS_Trinary_Operator": [[[12274, 12275, 1]], [], 0],
  "IDS_Unary_Operator": [[[12286, 12287, 1]], [], 0],
  "ID_Compat_Math_Continue": [[[178, 179, 1], [185, 8304, 8119], [8308, 8318, 1], [8320, 8334, 1], [8706, 8711, 5], [8734, 8734, 1]], [[120513, 120539, 26], [120571, 120597, 26], [120629, 120655, 26], [120687, 120713, 26], [120745, 120771, 26]], 1],
  "ID_Compat_Math_Start": [[[8706, 8711, 5], [8734, 8734, 1]], [[120513, 120539, 26], [120571, 120597, 26], [120629, 120655, 26], [120687, 120713, 26], [120745, 120771, 26]], 0],
  "Ideographic": [[[12294, 12295, 1], [12321, 12329, 1], [12344, 12346, 1], [13312, 19903, 1], [19968, 40959, 1], [63744, 64109, 1], [64112, 64217, 1]], [[94180, 94194, 14], [94195, 94198, 1], [94208, 101589, 1], [101631, 101662, 1], [101760, 101874, 1], [110960, 111355, 1], [131072, 173791, 1], [173824, 178205, 1], [178208, 183981, 1], [183984, 191456, 1], [191472, 192093, 1], [194560, 195101, 1], [196608, 201546, 1], [201552, 210041, 1]], 0],
  "Join_Control": [[[8204, 8205, 1]], [], 0],
  "Logical_Order_Exception": [[[3648, 3652, 1], [3776, 3780, 1], [6581, 6583, 1], [6586, 43701, 37115], [43702, 43705, 3], [43707, 43708, 1]], [], 0],
  "Modifier_Combining_Mark": [[[1620, 1621, 1], [1624, 1756, 132], [1763, 1767, 4], [1768, 2250, 482], [2251, 2253, 2], [2254, 2255, 1], [2259, 2291, 32]], [], 0],
  "Noncharacter_Code_Point": [[[64976, 65007, 1], [65534, 65535, 1]], [[131070, 131071, 1], [196606, 196607, 1], [262142, 262143, 1], [327678, 327679, 1], [393214, 393215, 1], [458750, 458751, 1], [524286, 524287, 1], [589822, 589823, 1], [655358, 655359, 1], [720894, 720895, 1], [786430, 786431, 1], [851966, 851967, 1], [917502, 917503, 1], [983038, 983039, 1], [1048574, 1048575, 1], [1114110, 1114111, 1]], 0],
  "Other_Alphabetic": [[[837, 867, 30], [868, 879, 1], [1456, 1469, 1], [1471, 1473, 2], [1474, 1476, 2], [1477, 1479, 2], [1552, 1562, 1], [1611, 1623, 1], [1625, 1631, 1], [1648, 1750, 102], [1751, 1756, 1], [1761, 1764, 1], [1767, 1768, 1], [1773, 1809, 36], [1840, 1855, 1], [1958, 1968, 1], [2070, 2071, 1], [2075, 2083, 1], [2085, 2087, 1], [2089, 2092, 1], [2199, 2260, 61], [2261, 2271, 1], [2275, 2281, 1], [2288, 2307, 1], [2362, 2363, 1], [2366, 2380, 1], [2382, 2383, 1], [2389, 2391, 1], [2402, 2403, 1], [2433, 2435, 1], [2494, 2500, 1], [2503, 2504, 1], [2507, 2508, 1], [2519, 2530, 11], [2531, 2561, 30], [2562, 2563, 1], [2622, 2626, 1], [2631, 2632, 1], [2635, 2636, 1], [2641, 2672, 31], [2673, 2677, 4], [2689, 2691, 1], [2750, 2757, 1], [2759, 2761, 1], [2763, 2764, 1], [2786, 2787, 1], [2810, 2812, 1], [2817, 2819, 1], [2878, 2884, 1], [2887, 2888, 1], [2891, 2892, 1], [2902, 2903, 1], [2914, 2915, 1], [2946, 3006, 60], [3007, 3010, 1], [3014, 3016, 1], [3018, 3020, 1], [3031, 3072, 41], [3073, 3076, 1], [3134, 3140, 1], [3142, 3144, 1], [3146, 3148, 1], [3157, 3158, 1], [3170, 3171, 1], [3201, 3203, 1], [3262, 3268, 1], [3270, 3272, 1], [3274, 3276, 1], [3285, 3286, 1], [3298, 3299, 1], [3315, 3328, 13], [3329, 3331, 1], [3390, 3396, 1], [3398, 3400, 1], [3402, 3404, 1], [3415, 3426, 11], [3427, 3457, 30], [3458, 3459, 1], [3535, 3540, 1], [3542, 3544, 2], [3545, 3551, 1], [3570, 3571, 1], [3633, 3636, 3], [3637, 3642, 1], [3661, 3761, 100], [3764, 3769, 1], [3771, 3772, 1], [3789, 3953, 164], [3954, 3971, 1], [3981, 3991, 1], [3993, 4028, 1], [4139, 4150, 1], [4152, 4155, 3], [4156, 4158, 1], [4182, 4185, 1], [4190, 4192, 1], [4194, 4196, 1], [4199, 4205, 1], [4209, 4212, 1], [4226, 4237, 1], [4239, 4250, 11], [4251, 4253, 1], [5906, 5907, 1], [5938, 5939, 1], [5970, 5971, 1], [6002, 6003, 1], [6070, 6088, 1], [6277, 6278, 1], [6313, 6432, 119], [6433, 6443, 1], [6448, 6456, 1], [6679, 6683, 1], [6741, 6750, 1], [6753, 6772, 1], [6847, 6848, 1], [6860, 6862, 1], [6912, 6916, 1], [6965, 6979, 1], [7040, 7042, 1], [7073, 7081, 1], [7084, 7085, 1], [7143, 7153, 1], [7204, 7222, 1], [7635, 7668, 1], [9398, 9449, 1], [11744, 11775, 1], [42612, 42619, 1], [42654, 42655, 1], [43010, 43019, 9], [43043, 43047, 1], [43136, 43137, 1], [43188, 43203, 1], [43205, 43263, 58], [43302, 43306, 1], [43335, 43346, 1], [43392, 43395, 1], [43444, 43455, 1], [43493, 43561, 68], [43562, 43574, 1], [43587, 43596, 9], [43597, 43643, 46], [43644, 43645, 1], [43696, 43698, 2], [43699, 43700, 1], [43703, 43704, 1], [43710, 43755, 45], [43756, 43759, 1], [43765, 44003, 238], [44004, 44010, 1], [64286, 64286, 1]], [[66422, 66426, 1], [68097, 68099, 1], [68101, 68102, 1], [68108, 68111, 1], [68900, 68903, 1], [68969, 69291, 322], [69292, 69370, 78], [69371, 69372, 1], [69632, 69634, 1], [69688, 69701, 1], [69747, 69748, 1], [69760, 69762, 1], [69808, 69816, 1], [69826, 69888, 62], [69889, 69890, 1], [69927, 69938, 1], [69957, 69958, 1], [70016, 70018, 1], [70067, 70079, 1], [70094, 70095, 1], [70188, 70196, 1], [70199, 70206, 7], [70209, 70367, 158], [70368, 70376, 1], [70400, 70403, 1], [70462, 70468, 1], [70471, 70472, 1], [70475, 70476, 1], [70487, 70498, 11], [70499, 70584, 85], [70585, 70592, 1], [70594, 70597, 3], [70599, 70602, 1], [70604, 70605, 1], [70709, 70721, 1], [70723, 70725, 1], [70832, 70849, 1], [71087, 71093, 1], [71096, 71102, 1], [71132, 71133, 1], [71216, 71230, 1], [71232, 71339, 107], [71340, 71349, 1], [71453, 71466, 1], [71724, 71736, 1], [71984, 71989, 1], [71991, 71992, 1], [71995, 71996, 1], [72e3, 72002, 2], [72145, 72151, 1], [72154, 72159, 1], [72164, 72193, 29], [72194, 72202, 1], [72245, 72249, 1], [72251, 72254, 1], [72273, 72283, 1], [72330, 72343, 1], [72544, 72551, 1], [72751, 72758, 1], [72760, 72766, 1], [72850, 72871, 1], [72873, 72886, 1], [73009, 73014, 1], [73018, 73020, 2], [73021, 73023, 2], [73024, 73025, 1], [73027, 73031, 4], [73098, 73102, 1], [73104, 73105, 1], [73107, 73110, 1], [73459, 73462, 1], [73472, 73473, 1], [73475, 73524, 49], [73525, 73530, 1], [73534, 73536, 1], [90398, 90414, 1], [94031, 94033, 2], [94034, 94087, 1], [94095, 94098, 1], [94192, 94193, 1], [113822, 122880, 9058], [122881, 122886, 1], [122888, 122904, 1], [122907, 122913, 1], [122915, 122916, 1], [122918, 122922, 1], [123023, 124643, 1620], [124646, 124654, 8], [124655, 124661, 6], [125255, 127280, 2025], [127281, 127305, 1], [127312, 127337, 1], [127344, 127369, 1]], 0],
  "Other_Default_Ignorable_Code_Point": [[[847, 4447, 3600], [4448, 6068, 1620], [6069, 8293, 2224], [12644, 65440, 52796], [65520, 65528, 1]], [[917504, 917506, 2], [917507, 917535, 1], [917632, 917759, 1], [918e3, 921599, 1]], 0],
  "Other_Grapheme_Extend": [[[2494, 2519, 25], [2878, 2903, 25], [3006, 3031, 25], [3264, 3266, 2], [3271, 3272, 1], [3274, 3275, 1], [3285, 3286, 1], [3390, 3415, 25], [3535, 3551, 16], [5909, 5940, 31], [6965, 6971, 6], [6973, 6979, 6], [6980, 7082, 102], [7154, 7155, 1], [8204, 12334, 4130], [12335, 43347, 31012], [43456, 65438, 21982], [65439, 65439, 1]], [[70080, 70197, 117], [70462, 70477, 15], [70487, 70584, 97], [70594, 70597, 3], [70599, 70601, 1], [70607, 70832, 225], [70845, 71087, 242], [71350, 71984, 634], [71997, 73537, 1540], [94192, 94193, 1], [119141, 119142, 1], [119149, 119154, 1], [917536, 917631, 1]], 0],
  "Other_ID_Continue": [[[183, 903, 720], [4969, 4977, 1], [6618, 8204, 1586], [8205, 12539, 4334], [65381, 65381, 1]], [], 0],
  "Other_ID_Start": [[[6277, 6278, 1], [8472, 8494, 22], [12443, 12444, 1]], [], 0],
  "Other_Lowercase": [[[170, 186, 16], [688, 696, 1], [704, 705, 1], [736, 740, 1], [837, 890, 53], [4348, 7468, 3120], [7469, 7530, 1], [7544, 7579, 35], [7580, 7615, 1], [8305, 8319, 14], [8336, 8348, 1], [8560, 8575, 1], [9424, 9449, 1], [11388, 11389, 1], [42652, 42653, 1], [42864, 42993, 129], [42994, 42996, 1], [43e3, 43001, 1], [43868, 43871, 1], [43881, 43881, 1]], [[67456, 67459, 3], [67460, 67461, 1], [67463, 67504, 1], [67506, 67514, 1], [122928, 122989, 1]], 1],
  "Other_Math": [[[94, 976, 882], [977, 978, 1], [981, 1008, 27], [1009, 1012, 3], [1013, 8214, 7201], [8242, 8244, 1], [8256, 8289, 33], [8290, 8292, 1], [8317, 8318, 1], [8333, 8334, 1], [8400, 8412, 1], [8417, 8421, 4], [8422, 8427, 5], [8428, 8431, 1], [8450, 8455, 5], [8458, 8467, 1], [8469, 8473, 4], [8474, 8477, 1], [8484, 8488, 4], [8489, 8492, 3], [8493, 8495, 2], [8496, 8497, 1], [8499, 8504, 1], [8508, 8511, 1], [8517, 8521, 1], [8597, 8601, 1], [8604, 8607, 1], [8609, 8610, 1], [8612, 8613, 1], [8615, 8617, 2], [8618, 8621, 1], [8624, 8625, 1], [8630, 8631, 1], [8636, 8653, 1], [8656, 8657, 1], [8659, 8661, 2], [8662, 8667, 1], [8669, 8676, 7], [8677, 8968, 291], [8969, 8971, 1], [9140, 9141, 1], [9143, 9168, 25], [9186, 9632, 446], [9633, 9646, 13], [9647, 9654, 1], [9660, 9664, 1], [9670, 9671, 1], [9674, 9675, 1], [9679, 9683, 1], [9698, 9700, 2], [9703, 9708, 1], [9733, 9734, 1], [9792, 9794, 2], [9824, 9827, 1], [9837, 9838, 1], [10181, 10182, 1], [10214, 10223, 1], [10627, 10648, 1], [10712, 10715, 1], [10748, 10749, 1], [65121, 65123, 2], [65128, 65340, 212], [65342, 65342, 1]], [[119808, 119892, 1], [119894, 119964, 1], [119966, 119967, 1], [119970, 119973, 3], [119974, 119977, 3], [119978, 119980, 1], [119982, 119993, 1], [119995, 119997, 2], [119998, 120003, 1], [120005, 120069, 1], [120071, 120074, 1], [120077, 120084, 1], [120086, 120092, 1], [120094, 120121, 1], [120123, 120126, 1], [120128, 120132, 1], [120134, 120138, 4], [120139, 120144, 1], [120146, 120485, 1], [120488, 120512, 1], [120514, 120538, 1], [120540, 120570, 1], [120572, 120596, 1], [120598, 120628, 1], [120630, 120654, 1], [120656, 120686, 1], [120688, 120712, 1], [120714, 120744, 1], [120746, 120770, 1], [120772, 120779, 1], [120782, 120831, 1], [126464, 126467, 1], [126469, 126495, 1], [126497, 126498, 1], [126500, 126503, 3], [126505, 126514, 1], [126516, 126519, 1], [126521, 126523, 2], [126530, 126535, 5], [126537, 126541, 2], [126542, 126543, 1], [126545, 126546, 1], [126548, 126551, 3], [126553, 126561, 2], [126562, 126564, 2], [126567, 126570, 1], [126572, 126578, 1], [126580, 126583, 1], [126585, 126588, 1], [126590, 126592, 2], [126593, 126601, 1], [126603, 126619, 1], [126625, 126627, 1], [126629, 126633, 1], [126635, 126651, 1]], 0],
  "Other_Uppercase": [[[8544, 8559, 1], [9398, 9423, 1]], [[127280, 127305, 1], [127312, 127337, 1], [127344, 127369, 1]], 0],
  "Pattern_Syntax": [[[33, 47, 1], [58, 64, 1], [91, 94, 1], [96, 123, 27], [124, 126, 1], [161, 167, 1], [169, 171, 2], [172, 176, 2], [177, 187, 5], [191, 215, 24], [247, 8208, 7961], [8209, 8231, 1], [8240, 8254, 1], [8257, 8275, 1], [8277, 8286, 1], [8592, 9311, 1], [9472, 10101, 1], [10132, 11263, 1], [11776, 11903, 1], [12289, 12291, 1], [12296, 12320, 1], [12336, 64830, 52494], [64831, 65093, 262], [65094, 65094, 1]], [], 10],
  "Pattern_White_Space": [[[9, 13, 1], [32, 133, 101], [8206, 8207, 1], [8232, 8233, 1]], [], 2],
  "Prepended_Concatenation_Mark": [[[1536, 1541, 1], [1757, 1807, 50], [2192, 2193, 1], [2274, 2274, 1]], [[69821, 69837, 16]], 0],
  "Quotation_Mark": [[[34, 39, 5], [171, 187, 16], [8216, 8223, 1], [8249, 8250, 1], [11842, 12300, 458], [12301, 12303, 1], [12317, 12319, 1], [65089, 65092, 1], [65282, 65287, 5], [65378, 65379, 1]], [], 2],
  "Radical": [[[11904, 11929, 1], [11931, 12019, 1], [12032, 12245, 1]], [], 0],
  "Regional_Indicator": [[], [[127462, 127487, 1]], 0],
  "STerm": [[[33, 46, 13], [63, 1417, 1354], [1565, 1567, 1], [1748, 1792, 44], [1793, 1794, 1], [2041, 2103, 62], [2105, 2109, 4], [2110, 2404, 294], [2405, 4170, 1765], [4171, 4962, 791], [4967, 4968, 1], [5742, 5941, 199], [5942, 6100, 158], [6101, 6147, 46], [6153, 6468, 315], [6469, 6824, 355], [6825, 6827, 1], [6990, 6991, 1], [7002, 7003, 1], [7006, 7007, 1], [7037, 7039, 1], [7227, 7228, 1], [7294, 7295, 1], [8228, 8252, 24], [8253, 8263, 10], [8264, 8265, 1], [11513, 11515, 1], [11822, 11836, 14], [11859, 11860, 1], [12290, 42239, 29949], [42510, 42511, 1], [42739, 42743, 4], [43126, 43127, 1], [43214, 43215, 1], [43311, 43464, 153], [43465, 43613, 148], [43614, 43615, 1], [43760, 43761, 1], [44011, 65042, 21031], [65045, 65046, 1], [65106, 65110, 4], [65111, 65281, 170], [65294, 65311, 17], [65377, 65377, 1]], [[68182, 68183, 1], [69461, 69465, 1], [69510, 69513, 1], [69703, 69704, 1], [69822, 69825, 1], [69953, 69955, 1], [70085, 70086, 1], [70093, 70110, 17], [70111, 70200, 89], [70201, 70203, 2], [70204, 70313, 109], [70612, 70613, 1], [70731, 70732, 1], [71106, 71107, 1], [71113, 71127, 1], [71233, 71234, 1], [71484, 71486, 1], [72004, 72006, 2], [72258, 72259, 1], [72347, 72348, 1], [72769, 72770, 1], [73463, 73464, 1], [73539, 73540, 1], [92782, 92783, 1], [92917, 92983, 66], [92984, 92996, 12], [93550, 93551, 1], [93848, 113823, 19975], [121480, 121480, 1]], 1],
  "Sentence_Terminal": [[[33, 46, 13], [63, 1417, 1354], [1565, 1567, 1], [1748, 1792, 44], [1793, 1794, 1], [2041, 2103, 62], [2105, 2109, 4], [2110, 2404, 294], [2405, 4170, 1765], [4171, 4962, 791], [4967, 4968, 1], [5742, 5941, 199], [5942, 6100, 158], [6101, 6147, 46], [6153, 6468, 315], [6469, 6824, 355], [6825, 6827, 1], [6990, 6991, 1], [7002, 7003, 1], [7006, 7007, 1], [7037, 7039, 1], [7227, 7228, 1], [7294, 7295, 1], [8228, 8252, 24], [8253, 8263, 10], [8264, 8265, 1], [11513, 11515, 1], [11822, 11836, 14], [11859, 11860, 1], [12290, 42239, 29949], [42510, 42511, 1], [42739, 42743, 4], [43126, 43127, 1], [43214, 43215, 1], [43311, 43464, 153], [43465, 43613, 148], [43614, 43615, 1], [43760, 43761, 1], [44011, 65042, 21031], [65045, 65046, 1], [65106, 65110, 4], [65111, 65281, 170], [65294, 65311, 17], [65377, 65377, 1]], [[68182, 68183, 1], [69461, 69465, 1], [69510, 69513, 1], [69703, 69704, 1], [69822, 69825, 1], [69953, 69955, 1], [70085, 70086, 1], [70093, 70110, 17], [70111, 70200, 89], [70201, 70203, 2], [70204, 70313, 109], [70612, 70613, 1], [70731, 70732, 1], [71106, 71107, 1], [71113, 71127, 1], [71233, 71234, 1], [71484, 71486, 1], [72004, 72006, 2], [72258, 72259, 1], [72347, 72348, 1], [72769, 72770, 1], [73463, 73464, 1], [73539, 73540, 1], [92782, 92783, 1], [92917, 92983, 66], [92984, 92996, 12], [93550, 93551, 1], [93848, 113823, 19975], [121480, 121480, 1]], 1],
  "Soft_Dotted": [[[105, 106, 1], [303, 585, 282], [616, 669, 53], [690, 1011, 321], [1110, 1112, 2], [7522, 7574, 52], [7588, 7592, 4], [7725, 7883, 158], [8305, 8520, 215], [8521, 11388, 2867]], [[119842, 119843, 1], [119894, 119895, 1], [119946, 119947, 1], [119998, 119999, 1], [120050, 120051, 1], [120102, 120103, 1], [120154, 120155, 1], [120206, 120207, 1], [120258, 120259, 1], [120310, 120311, 1], [120362, 120363, 1], [120414, 120415, 1], [120466, 120467, 1], [122650, 122956, 306], [122957, 122984, 27]], 1],
  "Terminal_Punctuation": [[[33, 44, 11], [46, 58, 12], [59, 63, 4], [894, 903, 9], [1417, 1475, 58], [1548, 1563, 15], [1565, 1567, 1], [1748, 1792, 44], [1793, 1802, 1], [1804, 2040, 236], [2041, 2096, 55], [2097, 2101, 1], [2103, 2110, 1], [2142, 2404, 262], [2405, 3674, 1269], [3675, 3848, 173], [3853, 3858, 1], [4170, 4171, 1], [4961, 4968, 1], [5742, 5867, 125], [5868, 5869, 1], [5941, 5942, 1], [6100, 6102, 1], [6106, 6146, 40], [6147, 6149, 1], [6152, 6153, 1], [6468, 6469, 1], [6824, 6827, 1], [6990, 6991, 1], [7002, 7003, 1], [7005, 7007, 1], [7037, 7039, 1], [7227, 7231, 1], [7294, 7295, 1], [8228, 8252, 24], [8253, 8263, 10], [8264, 8265, 1], [11513, 11515, 1], [11822, 11836, 14], [11841, 11852, 11], [11854, 11855, 1], [11859, 11860, 1], [12289, 12290, 1], [42238, 42239, 1], [42509, 42511, 1], [42739, 42743, 1], [43126, 43127, 1], [43214, 43215, 1], [43311, 43463, 152], [43464, 43465, 1], [43613, 43615, 1], [43743, 43760, 17], [43761, 44011, 250], [65042, 65045, 3], [65046, 65104, 58], [65105, 65106, 1], [65108, 65111, 1], [65281, 65292, 11], [65294, 65306, 12], [65307, 65311, 4], [65377, 65380, 3]], [[66463, 66512, 49], [67671, 67871, 200], [68182, 68183, 1], [68336, 68341, 1], [68410, 68415, 1], [68505, 68508, 1], [69461, 69465, 1], [69510, 69513, 1], [69703, 69709, 1], [69822, 69825, 1], [69953, 69955, 1], [70085, 70086, 1], [70093, 70110, 17], [70111, 70200, 89], [70201, 70204, 1], [70313, 70612, 299], [70613, 70731, 118], [70732, 70733, 1], [70746, 70747, 1], [71106, 71109, 1], [71113, 71127, 1], [71233, 71234, 1], [71484, 71486, 1], [72004, 72006, 2], [72258, 72259, 1], [72347, 72348, 1], [72353, 72354, 1], [72769, 72771, 1], [72817, 73463, 646], [73464, 73539, 75], [73540, 74864, 1324], [74865, 74868, 1], [92782, 92783, 1], [92917, 92983, 66], [92984, 92985, 1], [92996, 93550, 554], [93551, 93847, 296], [93848, 113823, 19975], [121479, 121482, 1]], 3],
  "Unified_Ideograph": [[[13312, 19903, 1], [19968, 40959, 1], [64014, 64015, 1], [64017, 64019, 2], [64020, 64031, 11], [64033, 64035, 2], [64036, 64039, 3], [64040, 64041, 1]], [[131072, 173791, 1], [173824, 178205, 1], [178208, 183981, 1], [183984, 191456, 1], [191472, 192093, 1], [196608, 201546, 1], [201552, 210041, 1]], 0],
  "Variation_Selector": [[[6155, 6157, 1], [6159, 65024, 58865], [65025, 65039, 1]], [[917760, 917999, 1]], 0],
  "White_Space": [[[9, 13, 1], [32, 133, 101], [160, 5760, 5600], [8192, 8202, 1], [8232, 8233, 1], [8239, 8287, 48], [12288, 12288, 1]], [], 2]
};
var foldCategoryData = {
  "L": [[[837, 837, 1]], [], 0],
  "Ll": [[[65, 90, 1], [192, 214, 1], [216, 222, 1], [256, 302, 2], [306, 310, 2], [313, 327, 2], [330, 376, 2], [377, 381, 2], [385, 386, 1], [388, 390, 2], [391, 393, 2], [394, 395, 1], [398, 401, 1], [403, 404, 1], [406, 408, 1], [412, 413, 1], [415, 416, 1], [418, 422, 2], [423, 425, 2], [428, 430, 2], [431, 433, 2], [434, 435, 1], [437, 439, 2], [440, 444, 4], [452, 453, 1], [455, 456, 1], [458, 459, 1], [461, 475, 2], [478, 494, 2], [497, 498, 1], [500, 502, 2], [503, 504, 1], [506, 562, 2], [570, 571, 1], [573, 574, 1], [577, 579, 2], [580, 582, 1], [584, 590, 2], [837, 880, 43], [882, 886, 4], [895, 902, 7], [904, 906, 1], [908, 910, 2], [911, 913, 2], [914, 929, 1], [931, 939, 1], [975, 984, 9], [986, 1006, 2], [1012, 1015, 3], [1017, 1018, 1], [1021, 1071, 1], [1120, 1152, 2], [1162, 1216, 2], [1217, 1229, 2], [1232, 1326, 2], [1329, 1366, 1], [4256, 4293, 1], [4295, 4301, 6], [5024, 5109, 1], [7305, 7312, 7], [7313, 7354, 1], [7357, 7359, 1], [7680, 7828, 2], [7838, 7934, 2], [7944, 7951, 1], [7960, 7965, 1], [7976, 7983, 1], [7992, 7999, 1], [8008, 8013, 1], [8025, 8031, 2], [8040, 8047, 1], [8072, 8079, 1], [8088, 8095, 1], [8104, 8111, 1], [8120, 8124, 1], [8136, 8140, 1], [8152, 8155, 1], [8168, 8172, 1], [8184, 8188, 1], [8486, 8490, 4], [8491, 8498, 7], [8579, 11264, 2685], [11265, 11311, 1], [11360, 11362, 2], [11363, 11364, 1], [11367, 11373, 2], [11374, 11376, 1], [11378, 11381, 3], [11390, 11392, 1], [11394, 11490, 2], [11499, 11501, 2], [11506, 42560, 31054], [42562, 42604, 2], [42624, 42650, 2], [42786, 42798, 2], [42802, 42862, 2], [42873, 42877, 2], [42878, 42886, 2], [42891, 42893, 2], [42896, 42898, 2], [42902, 42922, 2], [42923, 42926, 1], [42928, 42932, 1], [42934, 42948, 2], [42949, 42951, 1], [42953, 42955, 2], [42956, 42972, 2], [42997, 65313, 22316], [65314, 65338, 1]], [[66560, 66599, 1], [66736, 66771, 1], [66928, 66938, 1], [66940, 66954, 1], [66956, 66962, 1], [66964, 66965, 1], [68736, 68786, 1], [68944, 68965, 1], [71840, 71871, 1], [93760, 93791, 1], [93856, 93880, 1], [125184, 125217, 1]], 3],
  "Lt": [[[452, 454, 2], [455, 457, 2], [458, 460, 2], [497, 499, 2], [8064, 8071, 1], [8080, 8087, 1], [8096, 8103, 1], [8115, 8131, 16], [8179, 8179, 1]], [], 0],
  "Lu": [[[97, 122, 1], [181, 223, 42], [224, 246, 1], [248, 255, 1], [257, 303, 2], [307, 311, 2], [314, 328, 2], [331, 375, 2], [378, 382, 2], [383, 384, 1], [387, 389, 2], [392, 396, 4], [402, 405, 3], [409, 411, 1], [414, 417, 3], [419, 421, 2], [424, 429, 5], [432, 436, 4], [438, 441, 3], [445, 447, 2], [453, 454, 1], [456, 457, 1], [459, 460, 1], [462, 476, 2], [477, 495, 2], [498, 499, 1], [501, 505, 4], [507, 543, 2], [547, 563, 2], [572, 575, 3], [576, 578, 2], [583, 591, 2], [592, 596, 1], [598, 599, 1], [601, 603, 2], [604, 608, 4], [609, 611, 2], [612, 614, 1], [616, 620, 1], [623, 625, 2], [626, 629, 3], [637, 640, 3], [642, 643, 1], [647, 652, 1], [658, 669, 11], [670, 837, 167], [881, 883, 2], [887, 891, 4], [892, 893, 1], [940, 943, 1], [945, 974, 1], [976, 977, 1], [981, 983, 1], [985, 1007, 2], [1008, 1011, 1], [1013, 1019, 3], [1072, 1119, 1], [1121, 1153, 2], [1163, 1215, 2], [1218, 1230, 2], [1231, 1327, 2], [1377, 1414, 1], [4304, 4346, 1], [4349, 4351, 1], [5112, 5117, 1], [7296, 7304, 1], [7306, 7545, 239], [7549, 7566, 17], [7681, 7829, 2], [7835, 7841, 6], [7843, 7935, 2], [7936, 7943, 1], [7952, 7957, 1], [7968, 7975, 1], [7984, 7991, 1], [8e3, 8005, 1], [8017, 8023, 2], [8032, 8039, 1], [8048, 8061, 1], [8112, 8113, 1], [8126, 8144, 18], [8145, 8160, 15], [8161, 8165, 4], [8526, 8580, 54], [11312, 11359, 1], [11361, 11365, 4], [11366, 11372, 2], [11379, 11382, 3], [11393, 11491, 2], [11500, 11502, 2], [11507, 11520, 13], [11521, 11557, 1], [11559, 11565, 6], [42561, 42605, 2], [42625, 42651, 2], [42787, 42799, 2], [42803, 42863, 2], [42874, 42876, 2], [42879, 42887, 2], [42892, 42897, 5], [42899, 42900, 1], [42903, 42921, 2], [42933, 42947, 2], [42952, 42954, 2], [42957, 42971, 2], [42998, 43859, 861], [43888, 43967, 1], [65345, 65370, 1]], [[66600, 66639, 1], [66776, 66811, 1], [66967, 66977, 1], [66979, 66993, 1], [66995, 67001, 1], [67003, 67004, 1], [68800, 68850, 1], [68976, 68997, 1], [71872, 71903, 1], [93792, 93823, 1], [93883, 93907, 1], [125218, 125251, 1]], 4],
  "M": [[[921, 953, 32], [8126, 8126, 1]], [], 0],
  "Mn": [[[921, 953, 32], [8126, 8126, 1]], [], 0]
};
var foldScriptData = {
  "Common": [[[924, 956, 32]], [], 0],
  "Greek": [[[181, 837, 656]], [], 0],
  "Inherited": [[[921, 953, 32], [8126, 8126, 1]], [], 0]
};
var caseRangeData = [
  [65, 90, 0, 32, 0],
  [97, 122, -32, 0, -32],
  [181, 181, 743, 0, 743],
  [192, 214, 0, 32, 0],
  [216, 222, 0, 32, 0],
  [224, 246, -32, 0, -32],
  [248, 254, -32, 0, -32],
  [255, 255, 121, 0, 121],
  [256, 303, 1114112, 1114112, 1114112],
  [304, 304, 0, -199, 0],
  [305, 305, -232, 0, -232],
  [306, 311, 1114112, 1114112, 1114112],
  [313, 328, 1114112, 1114112, 1114112],
  [330, 375, 1114112, 1114112, 1114112],
  [376, 376, 0, -121, 0],
  [377, 382, 1114112, 1114112, 1114112],
  [383, 383, -300, 0, -300],
  [384, 384, 195, 0, 195],
  [385, 385, 0, 210, 0],
  [386, 389, 1114112, 1114112, 1114112],
  [390, 390, 0, 206, 0],
  [391, 392, 1114112, 1114112, 1114112],
  [393, 394, 0, 205, 0],
  [395, 396, 1114112, 1114112, 1114112],
  [398, 398, 0, 79, 0],
  [399, 399, 0, 202, 0],
  [400, 400, 0, 203, 0],
  [401, 402, 1114112, 1114112, 1114112],
  [403, 403, 0, 205, 0],
  [404, 404, 0, 207, 0],
  [405, 405, 97, 0, 97],
  [406, 406, 0, 211, 0],
  [407, 407, 0, 209, 0],
  [408, 409, 1114112, 1114112, 1114112],
  [410, 410, 163, 0, 163],
  [411, 411, 42561, 0, 42561],
  [412, 412, 0, 211, 0],
  [413, 413, 0, 213, 0],
  [414, 414, 130, 0, 130],
  [415, 415, 0, 214, 0],
  [416, 421, 1114112, 1114112, 1114112],
  [422, 422, 0, 218, 0],
  [423, 424, 1114112, 1114112, 1114112],
  [425, 425, 0, 218, 0],
  [428, 429, 1114112, 1114112, 1114112],
  [430, 430, 0, 218, 0],
  [431, 432, 1114112, 1114112, 1114112],
  [433, 434, 0, 217, 0],
  [435, 438, 1114112, 1114112, 1114112],
  [439, 439, 0, 219, 0],
  [440, 441, 1114112, 1114112, 1114112],
  [444, 445, 1114112, 1114112, 1114112],
  [447, 447, 56, 0, 56],
  [452, 452, 0, 2, 1],
  [453, 453, -1, 1, 0],
  [454, 454, -2, 0, -1],
  [455, 455, 0, 2, 1],
  [456, 456, -1, 1, 0],
  [457, 457, -2, 0, -1],
  [458, 458, 0, 2, 1],
  [459, 459, -1, 1, 0],
  [460, 460, -2, 0, -1],
  [461, 476, 1114112, 1114112, 1114112],
  [477, 477, -79, 0, -79],
  [478, 495, 1114112, 1114112, 1114112],
  [497, 497, 0, 2, 1],
  [498, 498, -1, 1, 0],
  [499, 499, -2, 0, -1],
  [500, 501, 1114112, 1114112, 1114112],
  [502, 502, 0, -97, 0],
  [503, 503, 0, -56, 0],
  [504, 543, 1114112, 1114112, 1114112],
  [544, 544, 0, -130, 0],
  [546, 563, 1114112, 1114112, 1114112],
  [570, 570, 0, 10795, 0],
  [571, 572, 1114112, 1114112, 1114112],
  [573, 573, 0, -163, 0],
  [574, 574, 0, 10792, 0],
  [575, 576, 10815, 0, 10815],
  [577, 578, 1114112, 1114112, 1114112],
  [579, 579, 0, -195, 0],
  [580, 580, 0, 69, 0],
  [581, 581, 0, 71, 0],
  [582, 591, 1114112, 1114112, 1114112],
  [592, 592, 10783, 0, 10783],
  [593, 593, 10780, 0, 10780],
  [594, 594, 10782, 0, 10782],
  [595, 595, -210, 0, -210],
  [596, 596, -206, 0, -206],
  [598, 599, -205, 0, -205],
  [601, 601, -202, 0, -202],
  [603, 603, -203, 0, -203],
  [604, 604, 42319, 0, 42319],
  [608, 608, -205, 0, -205],
  [609, 609, 42315, 0, 42315],
  [611, 611, -207, 0, -207],
  [612, 612, 42343, 0, 42343],
  [613, 613, 42280, 0, 42280],
  [614, 614, 42308, 0, 42308],
  [616, 616, -209, 0, -209],
  [617, 617, -211, 0, -211],
  [618, 618, 42308, 0, 42308],
  [619, 619, 10743, 0, 10743],
  [620, 620, 42305, 0, 42305],
  [623, 623, -211, 0, -211],
  [625, 625, 10749, 0, 10749],
  [626, 626, -213, 0, -213],
  [629, 629, -214, 0, -214],
  [637, 637, 10727, 0, 10727],
  [640, 640, -218, 0, -218],
  [642, 642, 42307, 0, 42307],
  [643, 643, -218, 0, -218],
  [647, 647, 42282, 0, 42282],
  [648, 648, -218, 0, -218],
  [649, 649, -69, 0, -69],
  [650, 651, -217, 0, -217],
  [652, 652, -71, 0, -71],
  [658, 658, -219, 0, -219],
  [669, 669, 42261, 0, 42261],
  [670, 670, 42258, 0, 42258],
  [837, 837, 84, 0, 84],
  [880, 883, 1114112, 1114112, 1114112],
  [886, 887, 1114112, 1114112, 1114112],
  [891, 893, 130, 0, 130],
  [895, 895, 0, 116, 0],
  [902, 902, 0, 38, 0],
  [904, 906, 0, 37, 0],
  [908, 908, 0, 64, 0],
  [910, 911, 0, 63, 0],
  [913, 929, 0, 32, 0],
  [931, 939, 0, 32, 0],
  [940, 940, -38, 0, -38],
  [941, 943, -37, 0, -37],
  [945, 961, -32, 0, -32],
  [962, 962, -31, 0, -31],
  [963, 971, -32, 0, -32],
  [972, 972, -64, 0, -64],
  [973, 974, -63, 0, -63],
  [975, 975, 0, 8, 0],
  [976, 976, -62, 0, -62],
  [977, 977, -57, 0, -57],
  [981, 981, -47, 0, -47],
  [982, 982, -54, 0, -54],
  [983, 983, -8, 0, -8],
  [984, 1007, 1114112, 1114112, 1114112],
  [1008, 1008, -86, 0, -86],
  [1009, 1009, -80, 0, -80],
  [1010, 1010, 7, 0, 7],
  [1011, 1011, -116, 0, -116],
  [1012, 1012, 0, -60, 0],
  [1013, 1013, -96, 0, -96],
  [1015, 1016, 1114112, 1114112, 1114112],
  [1017, 1017, 0, -7, 0],
  [1018, 1019, 1114112, 1114112, 1114112],
  [1021, 1023, 0, -130, 0],
  [1024, 1039, 0, 80, 0],
  [1040, 1071, 0, 32, 0],
  [1072, 1103, -32, 0, -32],
  [1104, 1119, -80, 0, -80],
  [1120, 1153, 1114112, 1114112, 1114112],
  [1162, 1215, 1114112, 1114112, 1114112],
  [1216, 1216, 0, 15, 0],
  [1217, 1230, 1114112, 1114112, 1114112],
  [1231, 1231, -15, 0, -15],
  [1232, 1327, 1114112, 1114112, 1114112],
  [1329, 1366, 0, 48, 0],
  [1377, 1414, -48, 0, -48],
  [4256, 4293, 0, 7264, 0],
  [4295, 4295, 0, 7264, 0],
  [4301, 4301, 0, 7264, 0],
  [4304, 4346, 3008, 0, 0],
  [4349, 4351, 3008, 0, 0],
  [5024, 5103, 0, 38864, 0],
  [5104, 5109, 0, 8, 0],
  [5112, 5117, -8, 0, -8],
  [7296, 7296, -6254, 0, -6254],
  [7297, 7297, -6253, 0, -6253],
  [7298, 7298, -6244, 0, -6244],
  [7299, 7300, -6242, 0, -6242],
  [7301, 7301, -6243, 0, -6243],
  [7302, 7302, -6236, 0, -6236],
  [7303, 7303, -6181, 0, -6181],
  [7304, 7304, 35266, 0, 35266],
  [7305, 7306, 1114112, 1114112, 1114112],
  [7312, 7354, 0, -3008, 0],
  [7357, 7359, 0, -3008, 0],
  [7545, 7545, 35332, 0, 35332],
  [7549, 7549, 3814, 0, 3814],
  [7566, 7566, 35384, 0, 35384],
  [7680, 7829, 1114112, 1114112, 1114112],
  [7835, 7835, -59, 0, -59],
  [7838, 7838, 0, -7615, 0],
  [7840, 7935, 1114112, 1114112, 1114112],
  [7936, 7943, 8, 0, 8],
  [7944, 7951, 0, -8, 0],
  [7952, 7957, 8, 0, 8],
  [7960, 7965, 0, -8, 0],
  [7968, 7975, 8, 0, 8],
  [7976, 7983, 0, -8, 0],
  [7984, 7991, 8, 0, 8],
  [7992, 7999, 0, -8, 0],
  [8e3, 8005, 8, 0, 8],
  [8008, 8013, 0, -8, 0],
  [8017, 8017, 8, 0, 8],
  [8019, 8019, 8, 0, 8],
  [8021, 8021, 8, 0, 8],
  [8023, 8023, 8, 0, 8],
  [8025, 8025, 0, -8, 0],
  [8027, 8027, 0, -8, 0],
  [8029, 8029, 0, -8, 0],
  [8031, 8031, 0, -8, 0],
  [8032, 8039, 8, 0, 8],
  [8040, 8047, 0, -8, 0],
  [8048, 8049, 74, 0, 74],
  [8050, 8053, 86, 0, 86],
  [8054, 8055, 100, 0, 100],
  [8056, 8057, 128, 0, 128],
  [8058, 8059, 112, 0, 112],
  [8060, 8061, 126, 0, 126],
  [8064, 8071, 8, 0, 8],
  [8072, 8079, 0, -8, 0],
  [8080, 8087, 8, 0, 8],
  [8088, 8095, 0, -8, 0],
  [8096, 8103, 8, 0, 8],
  [8104, 8111, 0, -8, 0],
  [8112, 8113, 8, 0, 8],
  [8115, 8115, 9, 0, 9],
  [8120, 8121, 0, -8, 0],
  [8122, 8123, 0, -74, 0],
  [8124, 8124, 0, -9, 0],
  [8126, 8126, -7205, 0, -7205],
  [8131, 8131, 9, 0, 9],
  [8136, 8139, 0, -86, 0],
  [8140, 8140, 0, -9, 0],
  [8144, 8145, 8, 0, 8],
  [8152, 8153, 0, -8, 0],
  [8154, 8155, 0, -100, 0],
  [8160, 8161, 8, 0, 8],
  [8165, 8165, 7, 0, 7],
  [8168, 8169, 0, -8, 0],
  [8170, 8171, 0, -112, 0],
  [8172, 8172, 0, -7, 0],
  [8179, 8179, 9, 0, 9],
  [8184, 8185, 0, -128, 0],
  [8186, 8187, 0, -126, 0],
  [8188, 8188, 0, -9, 0],
  [8486, 8486, 0, -7517, 0],
  [8490, 8490, 0, -8383, 0],
  [8491, 8491, 0, -8262, 0],
  [8498, 8498, 0, 28, 0],
  [8526, 8526, -28, 0, -28],
  [8544, 8559, 0, 16, 0],
  [8560, 8575, -16, 0, -16],
  [8579, 8580, 1114112, 1114112, 1114112],
  [9398, 9423, 0, 26, 0],
  [9424, 9449, -26, 0, -26],
  [11264, 11311, 0, 48, 0],
  [11312, 11359, -48, 0, -48],
  [11360, 11361, 1114112, 1114112, 1114112],
  [11362, 11362, 0, -10743, 0],
  [11363, 11363, 0, -3814, 0],
  [11364, 11364, 0, -10727, 0],
  [11365, 11365, -10795, 0, -10795],
  [11366, 11366, -10792, 0, -10792],
  [11367, 11372, 1114112, 1114112, 1114112],
  [11373, 11373, 0, -10780, 0],
  [11374, 11374, 0, -10749, 0],
  [11375, 11375, 0, -10783, 0],
  [11376, 11376, 0, -10782, 0],
  [11378, 11379, 1114112, 1114112, 1114112],
  [11381, 11382, 1114112, 1114112, 1114112],
  [11390, 11391, 0, -10815, 0],
  [11392, 11491, 1114112, 1114112, 1114112],
  [11499, 11502, 1114112, 1114112, 1114112],
  [11506, 11507, 1114112, 1114112, 1114112],
  [11520, 11557, -7264, 0, -7264],
  [11559, 11559, -7264, 0, -7264],
  [11565, 11565, -7264, 0, -7264],
  [42560, 42605, 1114112, 1114112, 1114112],
  [42624, 42651, 1114112, 1114112, 1114112],
  [42786, 42799, 1114112, 1114112, 1114112],
  [42802, 42863, 1114112, 1114112, 1114112],
  [42873, 42876, 1114112, 1114112, 1114112],
  [42877, 42877, 0, -35332, 0],
  [42878, 42887, 1114112, 1114112, 1114112],
  [42891, 42892, 1114112, 1114112, 1114112],
  [42893, 42893, 0, -42280, 0],
  [42896, 42899, 1114112, 1114112, 1114112],
  [42900, 42900, 48, 0, 48],
  [42902, 42921, 1114112, 1114112, 1114112],
  [42922, 42922, 0, -42308, 0],
  [42923, 42923, 0, -42319, 0],
  [42924, 42924, 0, -42315, 0],
  [42925, 42925, 0, -42305, 0],
  [42926, 42926, 0, -42308, 0],
  [42928, 42928, 0, -42258, 0],
  [42929, 42929, 0, -42282, 0],
  [42930, 42930, 0, -42261, 0],
  [42931, 42931, 0, 928, 0],
  [42932, 42947, 1114112, 1114112, 1114112],
  [42948, 42948, 0, -48, 0],
  [42949, 42949, 0, -42307, 0],
  [42950, 42950, 0, -35384, 0],
  [42951, 42954, 1114112, 1114112, 1114112],
  [42955, 42955, 0, -42343, 0],
  [42956, 42971, 1114112, 1114112, 1114112],
  [42972, 42972, 0, -42561, 0],
  [42997, 42998, 1114112, 1114112, 1114112],
  [43859, 43859, -928, 0, -928],
  [43888, 43967, -38864, 0, -38864],
  [65313, 65338, 0, 32, 0],
  [65345, 65370, -32, 0, -32],
  [66560, 66599, 0, 40, 0],
  [66600, 66639, -40, 0, -40],
  [66736, 66771, 0, 40, 0],
  [66776, 66811, -40, 0, -40],
  [66928, 66938, 0, 39, 0],
  [66940, 66954, 0, 39, 0],
  [66956, 66962, 0, 39, 0],
  [66964, 66965, 0, 39, 0],
  [66967, 66977, -39, 0, -39],
  [66979, 66993, -39, 0, -39],
  [66995, 67001, -39, 0, -39],
  [67003, 67004, -39, 0, -39],
  [68736, 68786, 0, 64, 0],
  [68800, 68850, -64, 0, -64],
  [68944, 68965, 0, 32, 0],
  [68976, 68997, -32, 0, -32],
  [71840, 71871, 0, 32, 0],
  [71872, 71903, -32, 0, -32],
  [93760, 93791, 0, 32, 0],
  [93792, 93823, -32, 0, -32],
  [93856, 93880, 0, 27, 0],
  [93883, 93907, -27, 0, -27],
  [125184, 125217, 0, 34, 0],
  [125218, 125251, -34, 0, -34]
];
var turkishCaseData = [
  [73, 73, 0, 232, 0],
  [105, 105, 199, 0, 199],
  [304, 304, 0, -199, 0],
  [305, 305, -232, 0, -232]
];
var caseOrbitData = [
  [223, 7838],
  [229, 8491],
  [304, 304],
  [305, 305],
  [452, 453],
  [455, 456],
  [458, 459],
  [497, 498],
  [912, 8147],
  [931, 962],
  [944, 8163],
  [946, 976],
  [949, 1013],
  [952, 977],
  [953, 8126],
  [954, 1008],
  [956, 181],
  [960, 982],
  [961, 1009],
  [962, 963],
  [966, 981],
  [969, 8486],
  [977, 1012],
  [1012, 920],
  [1074, 7296],
  [1076, 7297],
  [1086, 7298],
  [1089, 7299],
  [1090, 7300],
  [1098, 7302],
  [1123, 7303],
  [7300, 7301],
  [7777, 7835],
  [8126, 837],
  [8147, 912],
  [8163, 944],
  [8486, 937],
  [8490, 75],
  [8491, 197],
  [42571, 7304],
  [64261, 64262],
  [64262, 64261]
];

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/unicode/unicode.ts
var MaxRune = 1114111;
var ReplacementChar = 65533;
var MaxASCII = 127;
var UpperCase = 0;
var LowerCase = 1;
var TitleCase = 2;
var MaxCase = 3;
var UpperLower = MaxRune + 1;
var Range16 = class _Range16 {
  Lo;
  Hi;
  Stride;
  constructor(loOrInit = 0, hi = 0, stride = 0) {
    if (typeof loOrInit === "object") {
      this.Lo = loOrInit.Lo ?? 0;
      this.Hi = loOrInit.Hi ?? 0;
      this.Stride = loOrInit.Stride ?? 0;
      return;
    }
    this.Lo = loOrInit;
    this.Hi = hi;
    this.Stride = stride;
  }
  clone() {
    return new _Range16(this.Lo, this.Hi, this.Stride);
  }
};
var Range32 = class _Range32 {
  Lo;
  Hi;
  Stride;
  constructor(loOrInit = 0, hi = 0, stride = 0) {
    if (typeof loOrInit === "object") {
      this.Lo = loOrInit.Lo ?? 0;
      this.Hi = loOrInit.Hi ?? 0;
      this.Stride = loOrInit.Stride ?? 0;
      return;
    }
    this.Lo = loOrInit;
    this.Hi = hi;
    this.Stride = stride;
  }
  clone() {
    return new _Range32(this.Lo, this.Hi, this.Stride);
  }
};
var RangeTable = class _RangeTable {
  R16;
  R32;
  LatinOffset;
  constructor(r16OrInit = [], r32 = [], latinOffset = 0) {
    if (isRangeTableInit(r16OrInit)) {
      this.R16 = sliceToArray(r16OrInit.R16);
      this.R32 = sliceToArray(r16OrInit.R32);
      this.LatinOffset = r16OrInit.LatinOffset ?? 0;
      return;
    }
    this.R16 = sliceToArray(r16OrInit);
    this.R32 = sliceToArray(r32);
    this.LatinOffset = latinOffset;
  }
  clone() {
    return new _RangeTable(
      this.R16.map((r) => r.clone()),
      this.R32.map((r) => r.clone()),
      this.LatinOffset
    );
  }
};
function isRangeTableInit(value) {
  return value !== null && typeof value === "object" && ("R16" in value || "R32" in value || "LatinOffset" in value);
}
function sliceToArray(value) {
  return asArray(value ?? null);
}
var CaseRange = class _CaseRange {
  Lo;
  Hi;
  Delta;
  constructor(lo, hi, delta) {
    this.Lo = lo;
    this.Hi = hi;
    this.Delta = delta;
  }
  clone() {
    return new _CaseRange(this.Lo, this.Hi, [...this.Delta]);
  }
};
var SpecialCase = class {
  ranges;
  constructor(ranges = []) {
    this.ranges = ranges;
  }
  ToUpper(r) {
    let [r1, hadMapping] = to(UpperCase, r, this.ranges);
    if (r1 === r && !hadMapping) {
      r1 = ToUpper(r);
    }
    return r1;
  }
  ToTitle(r) {
    let [r1, hadMapping] = to(TitleCase, r, this.ranges);
    if (r1 === r && !hadMapping) {
      r1 = ToTitle(r);
    }
    return r1;
  }
  ToLower(r) {
    let [r1, hadMapping] = to(LowerCase, r, this.ranges);
    if (r1 === r && !hadMapping) {
      r1 = ToLower(r);
    }
    return r1;
  }
};
function buildRangeTable(d) {
  return new RangeTable(
    d[0].map((t) => new Range16(t[0], t[1], t[2])),
    d[1].map((t) => new Range32(t[0], t[1], t[2])),
    d[2]
  );
}
function buildTableMap(data) {
  const out = /* @__PURE__ */ new Map();
  for (const key of Object.keys(data)) {
    out.set(key, buildRangeTable(data[key]));
  }
  return out;
}
function buildCaseRanges(data) {
  return data.map((d) => new CaseRange(d[0], d[1], [d[2], d[3], d[4]]));
}
var Categories = buildTableMap(categoryData);
var Scripts = buildTableMap(scriptData);
var Properties = buildTableMap(propertyData);
var FoldCategory = buildTableMap(foldCategoryData);
var FoldScript = buildTableMap(foldScriptData);
var C = Categories.get("C");
var Cc = Categories.get("Cc");
var Cf = Categories.get("Cf");
var Cn = Categories.get("Cn");
var Co = Categories.get("Co");
var Cs = Categories.get("Cs");
var L = Categories.get("L");
var LC = Categories.get("LC");
var Ll = Categories.get("Ll");
var Lm = Categories.get("Lm");
var Lo = Categories.get("Lo");
var Lt = Categories.get("Lt");
var Lu = Categories.get("Lu");
var M = Categories.get("M");
var Mc = Categories.get("Mc");
var Me = Categories.get("Me");
var Mn = Categories.get("Mn");
var N = Categories.get("N");
var Nd = Categories.get("Nd");
var Nl = Categories.get("Nl");
var No = Categories.get("No");
var P = Categories.get("P");
var Pc = Categories.get("Pc");
var Pd = Categories.get("Pd");
var Pe = Categories.get("Pe");
var Pf = Categories.get("Pf");
var Pi = Categories.get("Pi");
var Po = Categories.get("Po");
var Ps = Categories.get("Ps");
var S = Categories.get("S");
var Sc = Categories.get("Sc");
var Sk = Categories.get("Sk");
var Sm = Categories.get("Sm");
var So = Categories.get("So");
var Z = Categories.get("Z");
var Zl = Categories.get("Zl");
var Zp = Categories.get("Zp");
var Zs = Categories.get("Zs");
var White_Space = Properties.get("White_Space");
var CaseRanges = buildCaseRanges(caseRangeData);
var TurkishCase = new SpecialCase(buildCaseRanges(turkishCaseData));
var caseOrbit = new Map(caseOrbitData);
function to(_case, r, caseRange) {
  if (_case < 0 || _case >= MaxCase) {
    return [ReplacementChar, false];
  }
  let lo = 0;
  let hi = caseRange.length;
  while (lo < hi) {
    const m = lo + (hi - lo >> 1);
    const cr = caseRange[m];
    if (cr.Lo <= r && r <= cr.Hi) {
      const delta = cr.Delta[_case];
      if (delta > MaxRune) {
        return [cr.Lo + (r - cr.Lo & ~1 | _case & 1), true];
      }
      return [r + delta, true];
    }
    if (r < cr.Lo) {
      hi = m;
    } else {
      lo = m + 1;
    }
  }
  return [r, false];
}
function To(_case, r) {
  return to(_case, r, CaseRanges)[0];
}
function ToUpper(r) {
  if (r <= MaxASCII) {
    if (r >= 97 && r <= 122) {
      r -= 32;
    }
    return r;
  }
  return To(UpperCase, r);
}
function ToLower(r) {
  if (r <= MaxASCII) {
    if (r >= 65 && r <= 90) {
      r += 32;
    }
    return r;
  }
  return To(LowerCase, r);
}
function ToTitle(r) {
  if (r <= MaxASCII) {
    if (r >= 97 && r <= 122) {
      r -= 32;
    }
    return r;
  }
  return To(TitleCase, r);
}
var L1_CONTROL = 1 << 0;
var L1_LETTER = 1 << 1;
var L1_UPPER = 1 << 2;
var L1_LOWER = 1 << 3;
var L1_TITLE = 1 << 4;
var L1_NUMBER = 1 << 5;
var L1_DIGIT = 1 << 6;
var L1_MARK = 1 << 7;
var L1_PUNCT = 1 << 8;
var L1_SYMBOL = 1 << 9;
var L1_SPACE = 1 << 10;
var L1_GRAPHIC = 1 << 11;
var L1_PRINT = 1 << 12;

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/unicode/named.ts
var Adlam = Scripts.get("Adlam");
var Ahom = Scripts.get("Ahom");
var Anatolian_Hieroglyphs = Scripts.get("Anatolian_Hieroglyphs");
var Arabic = Scripts.get("Arabic");
var Armenian = Scripts.get("Armenian");
var Avestan = Scripts.get("Avestan");
var Balinese = Scripts.get("Balinese");
var Bamum = Scripts.get("Bamum");
var Bassa_Vah = Scripts.get("Bassa_Vah");
var Batak = Scripts.get("Batak");
var Bengali = Scripts.get("Bengali");
var Beria_Erfe = Scripts.get("Beria_Erfe");
var Bhaiksuki = Scripts.get("Bhaiksuki");
var Bopomofo = Scripts.get("Bopomofo");
var Brahmi = Scripts.get("Brahmi");
var Braille = Scripts.get("Braille");
var Buginese = Scripts.get("Buginese");
var Buhid = Scripts.get("Buhid");
var Canadian_Aboriginal = Scripts.get("Canadian_Aboriginal");
var Carian = Scripts.get("Carian");
var Caucasian_Albanian = Scripts.get("Caucasian_Albanian");
var Chakma = Scripts.get("Chakma");
var Cham = Scripts.get("Cham");
var Cherokee = Scripts.get("Cherokee");
var Chorasmian = Scripts.get("Chorasmian");
var Common = Scripts.get("Common");
var Coptic = Scripts.get("Coptic");
var Cuneiform = Scripts.get("Cuneiform");
var Cypriot = Scripts.get("Cypriot");
var Cypro_Minoan = Scripts.get("Cypro_Minoan");
var Cyrillic = Scripts.get("Cyrillic");
var Deseret = Scripts.get("Deseret");
var Devanagari = Scripts.get("Devanagari");
var Dives_Akuru = Scripts.get("Dives_Akuru");
var Dogra = Scripts.get("Dogra");
var Duployan = Scripts.get("Duployan");
var Egyptian_Hieroglyphs = Scripts.get("Egyptian_Hieroglyphs");
var Elbasan = Scripts.get("Elbasan");
var Elymaic = Scripts.get("Elymaic");
var Ethiopic = Scripts.get("Ethiopic");
var Garay = Scripts.get("Garay");
var Georgian = Scripts.get("Georgian");
var Glagolitic = Scripts.get("Glagolitic");
var Gothic = Scripts.get("Gothic");
var Grantha = Scripts.get("Grantha");
var Greek = Scripts.get("Greek");
var Gujarati = Scripts.get("Gujarati");
var Gunjala_Gondi = Scripts.get("Gunjala_Gondi");
var Gurmukhi = Scripts.get("Gurmukhi");
var Gurung_Khema = Scripts.get("Gurung_Khema");
var Han = Scripts.get("Han");
var Hangul = Scripts.get("Hangul");
var Hanifi_Rohingya = Scripts.get("Hanifi_Rohingya");
var Hanunoo = Scripts.get("Hanunoo");
var Hatran = Scripts.get("Hatran");
var Hebrew = Scripts.get("Hebrew");
var Hiragana = Scripts.get("Hiragana");
var Imperial_Aramaic = Scripts.get("Imperial_Aramaic");
var Inherited = Scripts.get("Inherited");
var Inscriptional_Pahlavi = Scripts.get("Inscriptional_Pahlavi");
var Inscriptional_Parthian = Scripts.get("Inscriptional_Parthian");
var Javanese = Scripts.get("Javanese");
var Kaithi = Scripts.get("Kaithi");
var Kannada = Scripts.get("Kannada");
var Katakana = Scripts.get("Katakana");
var Kawi = Scripts.get("Kawi");
var Kayah_Li = Scripts.get("Kayah_Li");
var Kharoshthi = Scripts.get("Kharoshthi");
var Khitan_Small_Script = Scripts.get("Khitan_Small_Script");
var Khmer = Scripts.get("Khmer");
var Khojki = Scripts.get("Khojki");
var Khudawadi = Scripts.get("Khudawadi");
var Kirat_Rai = Scripts.get("Kirat_Rai");
var Lao = Scripts.get("Lao");
var Latin = Scripts.get("Latin");
var Lepcha = Scripts.get("Lepcha");
var Limbu = Scripts.get("Limbu");
var Linear_A = Scripts.get("Linear_A");
var Linear_B = Scripts.get("Linear_B");
var Lisu = Scripts.get("Lisu");
var Lycian = Scripts.get("Lycian");
var Lydian = Scripts.get("Lydian");
var Mahajani = Scripts.get("Mahajani");
var Makasar = Scripts.get("Makasar");
var Malayalam = Scripts.get("Malayalam");
var Mandaic = Scripts.get("Mandaic");
var Manichaean = Scripts.get("Manichaean");
var Marchen = Scripts.get("Marchen");
var Masaram_Gondi = Scripts.get("Masaram_Gondi");
var Medefaidrin = Scripts.get("Medefaidrin");
var Meetei_Mayek = Scripts.get("Meetei_Mayek");
var Mende_Kikakui = Scripts.get("Mende_Kikakui");
var Meroitic_Cursive = Scripts.get("Meroitic_Cursive");
var Meroitic_Hieroglyphs = Scripts.get("Meroitic_Hieroglyphs");
var Miao = Scripts.get("Miao");
var Modi = Scripts.get("Modi");
var Mongolian = Scripts.get("Mongolian");
var Mro = Scripts.get("Mro");
var Multani = Scripts.get("Multani");
var Myanmar = Scripts.get("Myanmar");
var Nabataean = Scripts.get("Nabataean");
var Nag_Mundari = Scripts.get("Nag_Mundari");
var Nandinagari = Scripts.get("Nandinagari");
var New_Tai_Lue = Scripts.get("New_Tai_Lue");
var Newa = Scripts.get("Newa");
var Nko = Scripts.get("Nko");
var Nushu = Scripts.get("Nushu");
var Nyiakeng_Puachue_Hmong = Scripts.get("Nyiakeng_Puachue_Hmong");
var Ogham = Scripts.get("Ogham");
var Ol_Chiki = Scripts.get("Ol_Chiki");
var Ol_Onal = Scripts.get("Ol_Onal");
var Old_Hungarian = Scripts.get("Old_Hungarian");
var Old_Italic = Scripts.get("Old_Italic");
var Old_North_Arabian = Scripts.get("Old_North_Arabian");
var Old_Permic = Scripts.get("Old_Permic");
var Old_Persian = Scripts.get("Old_Persian");
var Old_Sogdian = Scripts.get("Old_Sogdian");
var Old_South_Arabian = Scripts.get("Old_South_Arabian");
var Old_Turkic = Scripts.get("Old_Turkic");
var Old_Uyghur = Scripts.get("Old_Uyghur");
var Oriya = Scripts.get("Oriya");
var Osage = Scripts.get("Osage");
var Osmanya = Scripts.get("Osmanya");
var Pahawh_Hmong = Scripts.get("Pahawh_Hmong");
var Palmyrene = Scripts.get("Palmyrene");
var Pau_Cin_Hau = Scripts.get("Pau_Cin_Hau");
var Phags_Pa = Scripts.get("Phags_Pa");
var Phoenician = Scripts.get("Phoenician");
var Psalter_Pahlavi = Scripts.get("Psalter_Pahlavi");
var Rejang = Scripts.get("Rejang");
var Runic = Scripts.get("Runic");
var Samaritan = Scripts.get("Samaritan");
var Saurashtra = Scripts.get("Saurashtra");
var Sharada = Scripts.get("Sharada");
var Shavian = Scripts.get("Shavian");
var Siddham = Scripts.get("Siddham");
var Sidetic = Scripts.get("Sidetic");
var SignWriting = Scripts.get("SignWriting");
var Sinhala = Scripts.get("Sinhala");
var Sogdian = Scripts.get("Sogdian");
var Sora_Sompeng = Scripts.get("Sora_Sompeng");
var Soyombo = Scripts.get("Soyombo");
var Sundanese = Scripts.get("Sundanese");
var Sunuwar = Scripts.get("Sunuwar");
var Syloti_Nagri = Scripts.get("Syloti_Nagri");
var Syriac = Scripts.get("Syriac");
var Tagalog = Scripts.get("Tagalog");
var Tagbanwa = Scripts.get("Tagbanwa");
var Tai_Le = Scripts.get("Tai_Le");
var Tai_Tham = Scripts.get("Tai_Tham");
var Tai_Viet = Scripts.get("Tai_Viet");
var Tai_Yo = Scripts.get("Tai_Yo");
var Takri = Scripts.get("Takri");
var Tamil = Scripts.get("Tamil");
var Tangsa = Scripts.get("Tangsa");
var Tangut = Scripts.get("Tangut");
var Telugu = Scripts.get("Telugu");
var Thaana = Scripts.get("Thaana");
var Thai = Scripts.get("Thai");
var Tibetan = Scripts.get("Tibetan");
var Tifinagh = Scripts.get("Tifinagh");
var Tirhuta = Scripts.get("Tirhuta");
var Todhri = Scripts.get("Todhri");
var Tolong_Siki = Scripts.get("Tolong_Siki");
var Toto = Scripts.get("Toto");
var Tulu_Tigalari = Scripts.get("Tulu_Tigalari");
var Ugaritic = Scripts.get("Ugaritic");
var Vai = Scripts.get("Vai");
var Vithkuqi = Scripts.get("Vithkuqi");
var Wancho = Scripts.get("Wancho");
var Warang_Citi = Scripts.get("Warang_Citi");
var Yezidi = Scripts.get("Yezidi");
var Yi = Scripts.get("Yi");
var Zanabazar_Square = Scripts.get("Zanabazar_Square");
var ASCII_Hex_Digit = Properties.get("ASCII_Hex_Digit");
var Bidi_Control = Properties.get("Bidi_Control");
var Dash = Properties.get("Dash");
var Deprecated = Properties.get("Deprecated");
var Diacritic = Properties.get("Diacritic");
var Extender = Properties.get("Extender");
var Hex_Digit = Properties.get("Hex_Digit");
var Hyphen = Properties.get("Hyphen");
var IDS_Binary_Operator = Properties.get("IDS_Binary_Operator");
var IDS_Trinary_Operator = Properties.get("IDS_Trinary_Operator");
var IDS_Unary_Operator = Properties.get("IDS_Unary_Operator");
var ID_Compat_Math_Continue = Properties.get("ID_Compat_Math_Continue");
var ID_Compat_Math_Start = Properties.get("ID_Compat_Math_Start");
var Ideographic = Properties.get("Ideographic");
var Join_Control = Properties.get("Join_Control");
var Logical_Order_Exception = Properties.get("Logical_Order_Exception");
var Modifier_Combining_Mark = Properties.get("Modifier_Combining_Mark");
var Noncharacter_Code_Point = Properties.get("Noncharacter_Code_Point");
var Other_Alphabetic = Properties.get("Other_Alphabetic");
var Other_Default_Ignorable_Code_Point = Properties.get("Other_Default_Ignorable_Code_Point");
var Other_Grapheme_Extend = Properties.get("Other_Grapheme_Extend");
var Other_ID_Continue = Properties.get("Other_ID_Continue");
var Other_ID_Start = Properties.get("Other_ID_Start");
var Other_Lowercase = Properties.get("Other_Lowercase");
var Other_Math = Properties.get("Other_Math");
var Other_Uppercase = Properties.get("Other_Uppercase");
var Pattern_Syntax = Properties.get("Pattern_Syntax");
var Pattern_White_Space = Properties.get("Pattern_White_Space");
var Prepended_Concatenation_Mark = Properties.get("Prepended_Concatenation_Mark");
var Quotation_Mark = Properties.get("Quotation_Mark");
var Radical = Properties.get("Radical");
var Regional_Indicator = Properties.get("Regional_Indicator");
var STerm = Properties.get("STerm");
var Sentence_Terminal = Properties.get("Sentence_Terminal");
var Soft_Dotted = Properties.get("Soft_Dotted");
var Terminal_Punctuation = Properties.get("Terminal_Punctuation");
var Unified_Ideograph = Properties.get("Unified_Ideograph");
var Variation_Selector = Properties.get("Variation_Selector");

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/github.com/samuelpmahan/gondola/gobi/build.gs.ts
registerTypePackagePath("github.com/samuelpmahan/gondola/gobi", ["gobi.App", "gobi.Component", "gobi.File", "gobi.Backend", "gobi.Step", "gobi.Script", "gobi.Tick", "gobi.Trace", "gobi.Oracle", "gobi.Level", "gobi.Diff"]);
registerInterfaceType(
  "gobi.Backend",
  null,
  [{ name: "Emit", args: [{ type: { kind: "basic" /* Basic */, name: "unknown" } }], returns: [{ type: /* @__PURE__ */ sliceType("gobi.File") }, { type: "error" }] }, { name: "Name", args: [], returns: [{ type: /* @__PURE__ */ basicType("string") }] }]
);
registerInterfaceType(
  "gobi.Oracle",
  null,
  [{ name: "Name", args: [], returns: [{ type: /* @__PURE__ */ basicType("string") }] }, { name: "Play", args: [{ type: { kind: "basic" /* Basic */, name: "unknown" } }, { type: { kind: "basic" /* Basic */, name: "unknown" } }], returns: [{ type: "gobi.Trace" }, { type: "error" }] }]
);
var App = class _App {
  constructor(__goscriptValue, Module$, Root$, Components$) {
    this.Module = Module$ ?? "";
    this.Root = Root$ ?? "";
    this.Components = Components$ ?? null;
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _App(true, this.Module, this.Root, this.Components);
  }
  __goscriptAssign(source) {
    this.Module = source.Module;
    this.Root = source.Root;
    this.Components = source.Components;
    return this;
  }
  static __typeInfo = registerStructType(
    "gobi.App",
    () => new _App(),
    () => [],
    _App,
    () => [{ name: "Module", key: "Module", type: /* @__PURE__ */ basicType("string") }, { name: "Root", key: "Root", type: /* @__PURE__ */ basicType("string") }, { name: "Components", key: "Components", type: /* @__PURE__ */ sliceType("gobi.Component") }]
  );
};
var Component = class _Component {
  constructor(__goscriptValue, Package$, State$, Messages$, Uses$) {
    this.Package = Package$ ?? "";
    this.State = State$ ?? "";
    this.Messages = Messages$ ?? null;
    this.Uses = Uses$ ?? null;
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _Component(true, this.Package, this.State, this.Messages, this.Uses);
  }
  __goscriptAssign(source) {
    this.Package = source.Package;
    this.State = source.State;
    this.Messages = source.Messages;
    this.Uses = source.Uses;
    return this;
  }
  static __typeInfo = registerStructType(
    "gobi.Component",
    () => new _Component(),
    () => [],
    _Component,
    () => [{ name: "Package", key: "Package", type: /* @__PURE__ */ basicType("string") }, { name: "State", key: "State", type: /* @__PURE__ */ basicType("string") }, { name: "Messages", key: "Messages", type: /* @__PURE__ */ sliceType(/* @__PURE__ */ basicType("string")) }, { name: "Uses", key: "Uses", type: /* @__PURE__ */ sliceType(/* @__PURE__ */ basicType("string")) }]
  );
};
var File = class _File {
  constructor(__goscriptValue, Path$, Bytes$) {
    this.Path = Path$ ?? "";
    this.Bytes = Bytes$ ?? null;
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _File(true, this.Path, this.Bytes);
  }
  __goscriptAssign(source) {
    this.Path = source.Path;
    this.Bytes = source.Bytes;
    return this;
  }
  static __typeInfo = registerStructType(
    "gobi.File",
    () => new _File(),
    () => [],
    _File,
    () => [{ name: "Path", key: "Path", type: /* @__PURE__ */ basicType("string") }, { name: "Bytes", key: "Bytes", type: /* @__PURE__ */ sliceType(/* @__PURE__ */ basicType("uint8")) }]
  );
};
var Step = class _Step {
  constructor(__goscriptValue, Path$, Event$, Value$) {
    this.Path = Path$ ?? "";
    this.Event = Event$ ?? "";
    this.Value = Value$ ?? "";
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _Step(true, this.Path, this.Event, this.Value);
  }
  __goscriptAssign(source) {
    this.Path = source.Path;
    this.Event = source.Event;
    this.Value = source.Value;
    return this;
  }
  static __typeInfo = registerStructType(
    "gobi.Step",
    () => new _Step(),
    () => [],
    _Step,
    () => [{ name: "Path", key: "Path", type: /* @__PURE__ */ basicType("string") }, { name: "Event", key: "Event", type: /* @__PURE__ */ basicType("string") }, { name: "Value", key: "Value", type: /* @__PURE__ */ basicType("string") }]
  );
};
var Script = class _Script {
  constructor(__goscriptValue, Seed$, Steps$) {
    this.Seed = Seed$ ?? 0n;
    this.Steps = Steps$ ?? null;
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _Script(true, this.Seed, this.Steps);
  }
  __goscriptAssign(source) {
    this.Seed = source.Seed;
    this.Steps = source.Steps;
    return this;
  }
  static __typeInfo = registerStructType(
    "gobi.Script",
    () => new _Script(),
    () => [],
    _Script,
    () => [{ name: "Seed", key: "Seed", type: /* @__PURE__ */ basicType("uint64") }, { name: "Steps", key: "Steps", type: /* @__PURE__ */ sliceType("gobi.Step") }]
  );
};
var Tick = class _Tick {
  constructor(__goscriptValue, Index$, Step$, State$, Tree$, DOM$, Pixels$, Mutations$) {
    this.Index = Index$ ?? 0;
    this.Step = Step$ ?? new Step(true);
    this.State = State$ ?? "";
    this.Tree = Tree$ ?? "";
    this.DOM = DOM$ ?? "";
    this.Pixels = Pixels$ ?? "";
    this.Mutations = Mutations$ ?? 0;
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _Tick(true, this.Index, this.Step.clone(), this.State, this.Tree, this.DOM, this.Pixels, this.Mutations);
  }
  __goscriptAssign(source) {
    this.Index = source.Index;
    this.Step.__goscriptAssign(source.Step);
    this.State = source.State;
    this.Tree = source.Tree;
    this.DOM = source.DOM;
    this.Pixels = source.Pixels;
    this.Mutations = source.Mutations;
    return this;
  }
  static __typeInfo = registerStructType(
    "gobi.Tick",
    () => new _Tick(),
    () => [],
    _Tick,
    () => [{ name: "Index", key: "Index", type: /* @__PURE__ */ basicType("int") }, { name: "Step", key: "Step", type: "gobi.Step" }, { name: "State", key: "State", type: /* @__PURE__ */ basicType("string") }, { name: "Tree", key: "Tree", type: /* @__PURE__ */ basicType("string") }, { name: "DOM", key: "DOM", type: /* @__PURE__ */ basicType("string") }, { name: "Pixels", key: "Pixels", type: /* @__PURE__ */ basicType("string") }, { name: "Mutations", key: "Mutations", type: /* @__PURE__ */ basicType("int") }]
  );
};
var Trace = class _Trace {
  constructor(__goscriptValue, Implementation$, Ticks$) {
    this.Implementation = Implementation$ ?? "";
    this.Ticks = Ticks$ ?? null;
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _Trace(true, this.Implementation, this.Ticks);
  }
  __goscriptAssign(source) {
    this.Implementation = source.Implementation;
    this.Ticks = source.Ticks;
    return this;
  }
  static __typeInfo = registerStructType(
    "gobi.Trace",
    () => new _Trace(),
    () => [],
    _Trace,
    () => [{ name: "Implementation", key: "Implementation", type: /* @__PURE__ */ basicType("string") }, { name: "Ticks", key: "Ticks", type: /* @__PURE__ */ sliceType("gobi.Tick") }]
  );
};
var Diff = class _Diff {
  constructor(__goscriptValue, Tick$, Part$, Want$, Got$, Found$) {
    this.Tick = Tick$ ?? 0;
    this.Part = Part$ ?? "";
    this.Want = Want$ ?? "";
    this.Got = Got$ ?? "";
    this.Found = Found$ ?? false;
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _Diff(true, this.Tick, this.Part, this.Want, this.Got, this.Found);
  }
  __goscriptAssign(source) {
    this.Tick = source.Tick;
    this.Part = source.Part;
    this.Want = source.Want;
    this.Got = source.Got;
    this.Found = source.Found;
    return this;
  }
  static __typeInfo = registerStructType(
    "gobi.Diff",
    () => new _Diff(),
    () => [],
    _Diff,
    () => [{ name: "Tick", key: "Tick", type: /* @__PURE__ */ basicType("int") }, { name: "Part", key: "Part", type: /* @__PURE__ */ basicType("string") }, { name: "Want", key: "Want", type: /* @__PURE__ */ basicType("string") }, { name: "Got", key: "Got", type: /* @__PURE__ */ basicType("string") }, { name: "Found", key: "Found", type: /* @__PURE__ */ basicType("bool") }]
  );
};

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/github.com/samuelpmahan/gondola/gobi/node.gs.ts
registerTypePackagePath("github.com/samuelpmahan/gondola/gobi", ["gobi.Kind", "gobi.Node", "gobi.Attr", "gobi.Style", "gobi.On", "gobi.Message", "gobi.Effect"]);
var Node = class _Node {
  constructor(__goscriptValue, Kind$, Tag$, Key$, Attrs$, On$, Kids$, Text$) {
    this.Kind = Kind$ ?? 0;
    this.Tag = Tag$ ?? "";
    this.Key = Key$ ?? "";
    this.Attrs = Attrs$ ?? null;
    this.On = On$ ?? null;
    this.Kids = Kids$ ?? null;
    this.Text = Text$ ?? "";
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _Node(true, this.Kind, this.Tag, this.Key, this.Attrs, this.On, this.Kids, this.Text);
  }
  __goscriptAssign(source) {
    this.Kind = source.Kind;
    this.Tag = source.Tag;
    this.Key = source.Key;
    this.Attrs = source.Attrs;
    this.On = source.On;
    this.Kids = source.Kids;
    this.Text = source.Text;
    return this;
  }
  Css(styles) {
    const n = this;
    n.Attrs = appendOne(goSlice(n.Attrs, void 0, sliceLen(n.Attrs), sliceLen(n.Attrs)), new Attr(true, "style", void 0, void 0, styles));
    return n.clone();
  }
  Flag(name) {
    const n = this;
    n.Attrs = appendOne(goSlice(n.Attrs, void 0, sliceLen(n.Attrs), sliceLen(n.Attrs)), new Attr(true, name, void 0, true));
    return n.clone();
  }
  Handle(event, message, arg) {
    const n = this;
    n.On = appendOne(goSlice(n.On, void 0, sliceLen(n.On), sliceLen(n.On)), new On(true, event, message, arg));
    return n.clone();
  }
  Keyed(key) {
    const n = this;
    n.Key = key;
    return n.clone();
  }
  Set(name, value) {
    const n = this;
    n.Attrs = appendOne(goSlice(n.Attrs, void 0, sliceLen(n.Attrs), sliceLen(n.Attrs)), new Attr(true, name, value));
    return n.clone();
  }
  static __typeInfo = registerStructType(
    "gobi.Node",
    () => new _Node(),
    () => [{ name: "Css", args: [{ type: { kind: "basic" /* Basic */, name: "unknown" } }], returns: [{ type: "gobi.Node" }], variadic: true }, { name: "Flag", args: [{ type: { kind: "basic" /* Basic */, name: "unknown" } }], returns: [{ type: "gobi.Node" }] }, { name: "Handle", args: [{ type: { kind: "basic" /* Basic */, name: "unknown" } }, { type: { kind: "basic" /* Basic */, name: "unknown" } }, { type: { kind: "basic" /* Basic */, name: "unknown" } }], returns: [{ type: "gobi.Node" }] }, { name: "Keyed", args: [{ type: { kind: "basic" /* Basic */, name: "unknown" } }], returns: [{ type: "gobi.Node" }] }, { name: "Set", args: [{ type: { kind: "basic" /* Basic */, name: "unknown" } }, { type: { kind: "basic" /* Basic */, name: "unknown" } }], returns: [{ type: "gobi.Node" }] }],
    _Node,
    () => [{ name: "Kind", key: "Kind", type: /* @__PURE__ */ basicType("uint8", "gobi.Kind") }, { name: "Tag", key: "Tag", type: /* @__PURE__ */ basicType("string") }, { name: "Key", key: "Key", type: /* @__PURE__ */ basicType("string") }, { name: "Attrs", key: "Attrs", type: /* @__PURE__ */ sliceType("gobi.Attr") }, { name: "On", key: "On", type: /* @__PURE__ */ sliceType("gobi.On") }, { name: "Kids", key: "Kids", type: /* @__PURE__ */ sliceType("gobi.Node") }, { name: "Text", key: "Text", type: /* @__PURE__ */ basicType("string") }]
  );
};
var Attr = class _Attr {
  constructor(__goscriptValue, Name$, Value$, Flag$, Style$) {
    this.Name = Name$ ?? "";
    this.Value = Value$ ?? "";
    this.Flag = Flag$ ?? false;
    this.Style = Style$ ?? null;
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _Attr(true, this.Name, this.Value, this.Flag, this.Style);
  }
  __goscriptAssign(source) {
    this.Name = source.Name;
    this.Value = source.Value;
    this.Flag = source.Flag;
    this.Style = source.Style;
    return this;
  }
  static __typeInfo = registerStructType(
    "gobi.Attr",
    () => new _Attr(),
    () => [],
    _Attr,
    () => [{ name: "Name", key: "Name", type: /* @__PURE__ */ basicType("string") }, { name: "Value", key: "Value", type: /* @__PURE__ */ basicType("string") }, { name: "Flag", key: "Flag", type: /* @__PURE__ */ basicType("bool") }, { name: "Style", key: "Style", type: /* @__PURE__ */ sliceType("gobi.Style") }]
  );
};
var Style = class _Style {
  constructor(__goscriptValue, Property$, Value$) {
    this.Property = Property$ ?? "";
    this.Value = Value$ ?? "";
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _Style(true, this.Property, this.Value);
  }
  __goscriptAssign(source) {
    this.Property = source.Property;
    this.Value = source.Value;
    return this;
  }
  static __typeInfo = registerStructType(
    "gobi.Style",
    () => new _Style(),
    () => [],
    _Style,
    () => [{ name: "Property", key: "Property", type: /* @__PURE__ */ basicType("string") }, { name: "Value", key: "Value", type: /* @__PURE__ */ basicType("string") }]
  );
};
var On = class _On {
  constructor(__goscriptValue, Event$, Message$, Arg$) {
    this.Event = Event$ ?? "";
    this.Message = Message$ ?? "";
    this.Arg = Arg$ ?? "";
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _On(true, this.Event, this.Message, this.Arg);
  }
  __goscriptAssign(source) {
    this.Event = source.Event;
    this.Message = source.Message;
    this.Arg = source.Arg;
    return this;
  }
  static __typeInfo = registerStructType(
    "gobi.On",
    () => new _On(),
    () => [],
    _On,
    () => [{ name: "Event", key: "Event", type: /* @__PURE__ */ basicType("string") }, { name: "Message", key: "Message", type: /* @__PURE__ */ basicType("string") }, { name: "Arg", key: "Arg", type: /* @__PURE__ */ basicType("string") }]
  );
};
var Message = class _Message {
  constructor(__goscriptValue, Name$, Arg$) {
    this.Name = Name$ ?? "";
    this.Arg = Arg$ ?? "";
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _Message(true, this.Name, this.Arg);
  }
  __goscriptAssign(source) {
    this.Name = source.Name;
    this.Arg = source.Arg;
    return this;
  }
  static __typeInfo = registerStructType(
    "gobi.Message",
    () => new _Message(),
    () => [],
    _Message,
    () => [{ name: "Name", key: "Name", type: /* @__PURE__ */ basicType("string") }, { name: "Arg", key: "Arg", type: /* @__PURE__ */ basicType("string") }]
  );
};
var Effect = class _Effect {
  constructor(__goscriptValue, Kind$, Name$, Arg$, Reply$) {
    this.Kind = Kind$ ?? "";
    this.Name = Name$ ?? "";
    this.Arg = Arg$ ?? "";
    this.Reply = Reply$ ?? "";
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _Effect(true, this.Kind, this.Name, this.Arg, this.Reply);
  }
  __goscriptAssign(source) {
    this.Kind = source.Kind;
    this.Name = source.Name;
    this.Arg = source.Arg;
    this.Reply = source.Reply;
    return this;
  }
  static __typeInfo = registerStructType(
    "gobi.Effect",
    () => new _Effect(),
    () => [],
    _Effect,
    () => [{ name: "Kind", key: "Kind", type: /* @__PURE__ */ basicType("string") }, { name: "Name", key: "Name", type: /* @__PURE__ */ basicType("string") }, { name: "Arg", key: "Arg", type: /* @__PURE__ */ basicType("string") }, { name: "Reply", key: "Reply", type: /* @__PURE__ */ basicType("string") }]
  );
};
function El(tag, kids) {
  return new Node(true, 1, tag, void 0, void 0, void 0, kids);
}
function Txt(text) {
  return new Node(true, 2, void 0, void 0, void 0, void 0, void 0, text);
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/reflect/types.ts
var StructField = class _StructField {
  Name = "";
  PkgPath = "";
  Type = null;
  Tag = "";
  Offset = 0;
  Index = null;
  Anonymous = false;
  constructor(init) {
    if (init) {
      Object.assign(this, init);
    }
  }
  clone() {
    return new _StructField({
      Name: this.Name,
      PkgPath: this.PkgPath,
      Type: this.Type,
      Tag: this.Tag,
      Offset: this.Offset,
      Index: arrayToSlice(asArray(this.Index)),
      Anonymous: this.Anonymous
    });
  }
  IsExported() {
    return this.PkgPath === "";
  }
};
var Method = class _Method {
  Name = "";
  PkgPath = "";
  Type = null;
  // Func is the method as a function taking the receiver first; it is the
  // zero Value for an interface type.
  Func;
  Index = 0;
  constructor(init) {
    if (init) {
      Object.assign(this, init);
    }
  }
  // IsExported reports whether the method is exported.
  IsExported() {
    return this.PkgPath === "";
  }
  // clone copies the method, as Go copies a Method struct value.
  clone() {
    return new _Method(this);
  }
};
var ValueError = class _ValueError extends Error {
  Kind;
  Method;
  constructor(init) {
    const kind = init.Kind === 0 ? "zero" : Kind_String(init.Kind);
    super(`reflect: call of reflect.Value.${init.Method} on ${kind} Value`);
    this.Kind = init.Kind;
    this.Method = init.Method;
    this.name = "ValueError";
  }
  // Error returns the message, as the Error method of *ValueError.
  Error() {
    return this.message;
  }
  // Register the type, so that a recovered *ValueError asserts as one.
  static __typeInfo = registerStructType(
    "reflect.ValueError",
    null,
    [
      {
        name: "Error",
        args: [],
        returns: [{ type: { kind: "basic" /* Basic */, name: "string" } }]
      }
    ],
    _ValueError,
    [
      {
        name: "Kind",
        key: "Kind",
        type: { kind: "basic" /* Basic */, name: "int" }
      },
      {
        name: "Method",
        key: "Method",
        type: { kind: "basic" /* Basic */, name: "string" }
      }
    ]
  );
};

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/reflect/map.ts
var MapIter = class {
  constructor(map, typ = null) {
    this.map = map;
    this.typ = typ;
    this.iterator = map.entries();
  }
  map;
  typ;
  iterator;
  current = null;
  Next() {
    this.current = this.iterator.next();
    return !this.current.done;
  }
  Key() {
    if (this.current === null || this.current.done) {
      throw new Error("MapIter.Key called on exhausted iterator");
    }
    const rawKey = this.current.value[0];
    return new Value2(rawKey, this.typ?.Key() ?? TypeOf(rawKey));
  }
  Value() {
    if (this.current === null || this.current.done) {
      throw new Error("MapIter.Value called on exhausted iterator");
    }
    const rawVal = this.current.value[1];
    return new Value2(rawVal, this.typ?.Elem() ?? TypeOf(rawVal));
  }
  // Reset modifies iter to iterate over v, which must be a map value or the
  // zero Value, as in Go.
  Reset(v) {
    if (!v.IsValid()) {
      this.map = new globalThis.Map();
      this.typ = null;
    } else {
      const m = v.Interface();
      this.map = m ?? new globalThis.Map();
      this.typ = v.Type();
    }
    this.iterator = this.map.entries();
    this.current = null;
  }
};

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/reflect/value.ts
function Zero(typ) {
  if (typ === null) {
    return new Value2();
  }
  return new Value2(zeroReflectValue(typ), typ);
}
function zeroReflectValue(typ) {
  switch (typ.Kind()) {
    case Bool:
      return false;
    case Int:
    case Int8:
    case Int16:
    case Int32:
    case Uint:
    case Uint8:
    case Uint16:
    case Uint32:
    case Float32:
    case Float64:
      return 0;
    case Int64:
    case Uint64:
    case Uintptr:
      return 0n;
    case String2:
      return "";
    case Array2:
      return zeroArrayValue(typ);
    case Struct:
      return markAsStructValue(newStructPointer(typ));
    default:
      return null;
  }
}
function zeroArrayValue(typ) {
  const length = typ.Len();
  const elem = typ.Elem();
  if (elem.Kind() === Uint8) {
    return arrayValue(new Uint8Array(length));
  }
  const values = globalThis.Array.from({ length }, () => zeroReflectValue(elem));
  return arrayValue(values, typeInfoFromReflectType(typ));
}
function newStructPointer(typ) {
  const typeInfo = getTypeByName(runtimeTypeString(typ));
  if (typeInfo && isStructTypeInfo(typeInfo) && typeInfo.ctor) {
    return new typeInfo.ctor();
  }
  return newStructValue(typ);
}
function newStructValue(typ) {
  const StructValue = structValueClass(typ);
  return new StructValue();
}
var structValueClasses = /* @__PURE__ */ new WeakMap();
function structValueClass(typ) {
  const cached = structValueClasses.get(typ);
  if (cached !== void 0) {
    return cached;
  }
  const StructValue = class {
    constructor() {
      initStructFields(typ, this);
    }
    clone() {
      const cloned = new StructValue();
      for (const key of Object.keys(this)) {
        cloned[key] = this[key];
      }
      return cloned;
    }
  };
  Object.defineProperty(StructValue, "__reflectType", { value: typ });
  Object.defineProperty(StructValue, "__typeInfo", {
    value: typeInfoFromReflectType(typ)
  });
  const ctor = StructValue;
  structValueClasses.set(typ, ctor);
  return ctor;
}
function initStructFields(typ, value) {
  for (let i = 0; i < typ.NumField(); i++) {
    const field = typ.Field(i);
    const key = structFieldStorageKey(typ, i);
    value[key] = zeroReflectValue(field.Type);
  }
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/reflect/iter.ts
function rangeNum(num, t) {
  return async (_yield) => {
    let convert = t.PkgPath() != "";
    for (let i = 0; i < num; i++) {
      let tmp = ValueOf(i).clone();
      if (convert) {
        tmp = tmp.Convert(t).clone();
      }
      if (!await _yield(tmp)) {
        return;
      }
    }
  };
}
function valueSeq(v) {
  const t = v.Type();
  if (v.Kind() === Func && t.CanSeq()) {
    return async (_yield) => {
      const rf = MakeFunc(t.In(0), async (args) => [
        ValueOf(await _yield(asArray(args)[0]))
      ]);
      await v.Call(arrayToSlice([rf]));
    };
  }
  switch (v.Kind()) {
    case Int:
    case Int8:
    case Int16:
    case Int32:
    case Int64:
      return rangeNum(Number(v.Int()), t);
    case Uint:
    case Uint8:
    case Uint16:
    case Uint32:
    case Uint64:
    case Uintptr:
      return rangeNum(Number(v.Uint()), t);
    case Ptr:
      if (t.Elem().Kind() !== Array2) {
        break;
      }
      return rangeNum(v.Elem().Len(), TypeOf(0));
    case Array2:
    case Slice:
      return rangeNum(v.Len(), TypeOf(0));
    case String2:
      return async (_yield) => {
        for (const [i] of rangeString(v.String())) {
          if (!await _yield(ValueOf(i))) {
            return;
          }
        }
      };
    case Map2:
      return async (_yield) => {
        for (const key of asArray(v.MapKeys())) {
          if (!await _yield(key)) {
            return;
          }
        }
      };
    case Chan:
      return async (_yield) => {
        for (; ; ) {
          const [value, ok] = await v.Recv();
          if (!ok || !await _yield(value)) {
            return;
          }
        }
      };
  }
  throw new Error(`reflect: ${t.String()} cannot produce iter.Seq[Value]`);
}
function valueSeq2(v) {
  const t = v.Type();
  if (v.Kind() === Func && t.CanSeq2()) {
    return async (_yield) => {
      const rf = MakeFunc(t.In(0), async (args) => {
        const a = asArray(args);
        return [ValueOf(await _yield(a[0], a[1]))];
      });
      await v.Call(arrayToSlice([rf]));
    };
  }
  switch (v.Kind()) {
    case Ptr:
    case Array2:
    case Slice: {
      if (v.Kind() === Ptr && t.Elem().Kind() !== Array2) {
        break;
      }
      const elems = v.Kind() === Ptr ? v.Elem() : v;
      return async (_yield) => {
        for (let i = 0; i < elems.Len(); i++) {
          if (!await _yield(ValueOf(i), elems.Index(i))) {
            return;
          }
        }
      };
    }
    case String2:
      return async (_yield) => {
        for (const [i, r] of rangeString(v.String())) {
          if (!await _yield(ValueOf(i), ValueOf(r))) {
            return;
          }
        }
      };
    case Map2:
      return async (_yield) => {
        for (const key of asArray(v.MapKeys())) {
          if (!await _yield(key, v.MapIndex(key))) {
            return;
          }
        }
      };
  }
  throw new Error(
    `reflect: ${t.String()} cannot produce iter.Seq2[Value, Value]`
  );
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/reflect/type.ts
var rtype = class {
  constructor(kind) {
    this.kind = kind;
  }
  kind;
  Kind() {
    return this.kind;
  }
  String() {
    return Kind_String(this.kind);
  }
  Pointers() {
    const k = this.kind;
    return k === Ptr || k === Map2 || k === Slice || k === Interface;
  }
};
function Kind_String(k) {
  const kindNames = [
    "invalid",
    "bool",
    "int",
    "int8",
    "int16",
    "int32",
    "int64",
    "uint",
    "uint8",
    "uint16",
    "uint32",
    "uint64",
    "uintptr",
    "float32",
    "float64",
    "complex64",
    "complex128",
    "array",
    "chan",
    "func",
    "interface",
    "map",
    "ptr",
    "slice",
    "string",
    "struct",
    "unsafe.Pointer"
  ];
  if (k >= 0 && k < kindNames.length) {
    return kindNames[k];
  }
  return "invalid";
}
var RecvDir = 1;
var SendDir = 2;
var BothDir = 3;
var Invalid = 0;
var Bool = 1;
var Int = 2;
var Int8 = 3;
var Int16 = 4;
var Int32 = 5;
var Int64 = 6;
var Uint = 7;
var Uint8 = 8;
var Uint16 = 9;
var Uint32 = 10;
var Uint64 = 11;
var Uintptr = 12;
var Float32 = 13;
var Float64 = 14;
var Complex64 = 15;
var Complex128 = 16;
var Array2 = 17;
var Chan = 18;
var Func = 19;
var Interface = 20;
var Map2 = 21;
var Ptr = 22;
var Slice = 23;
var String2 = 24;
var Struct = 25;
var UnsafePointer = 26;
var typedSliceHints2 = {
  [Uint8]: "byte",
  [Int8]: "int8",
  [Int16]: "int16",
  [Uint16]: "uint16",
  [Int32]: "int32",
  [Uint32]: "uint32",
  [Float32]: "float32",
  [Float64]: "float64"
};
function sliceTypeHint(elem) {
  return typedSliceHints2[elem.Kind()];
}
var canonicalTypes = new globalThis.Map();
var constructingRegisteredTypes = new globalThis.Map();
function isIntegerKind(k) {
  return k >= Int && k <= Uintptr;
}
function isFloatKind(k) {
  return k === Float32 || k === Float64;
}
function convertInteger(x, k) {
  switch (k) {
    case Int8:
      return int(x, 8);
    case Int16:
      return int(x, 16);
    case Int32:
      return int(x, 32);
    case Int:
      return int(x, 64);
    case Int64:
      return int64(x);
    case Uint8:
      return uint(x, 8);
    case Uint16:
      return uint(x, 16);
    case Uint32:
      return uint(x, 32);
    case Uint64:
      return uint64(x);
    default:
      return uint(x, 64);
  }
}
function convertValue(x, ft, t) {
  const from = ft.Kind();
  const to2 = t.Kind();
  const numeric = typeof x === "number" || typeof x === "bigint";
  if (numeric && (isIntegerKind(from) || isFloatKind(from))) {
    if (isIntegerKind(to2)) {
      return convertInteger(x, to2);
    }
    if (to2 === Float32) {
      return float32(x);
    }
    if (to2 === Float64) {
      return Number(x);
    }
    if (to2 === String2 && isIntegerKind(from)) {
      return runeToString(x);
    }
  }
  if (from === String2 && typeof x === "string" && to2 === Slice) {
    if (t.Elem().Kind() === Uint8) {
      return stringToBytes(x);
    }
    if (t.Elem().Kind() === Int32) {
      return arrayToSlice(stringToRunes(x));
    }
  }
  if (from === Slice && to2 === String2) {
    if (x === null) {
      return "";
    }
    if (ft.Elem().Kind() === Int32) {
      return runesToString(x);
    }
    return bytesToString(x);
  }
  return x;
}
function internType(t) {
  if (internedTypes.has(t)) {
    return t;
  }
  const key = typeIdentityKey(t);
  markReflectTypeIdentity(t, key);
  const existing = canonicalTypes.get(key);
  if (existing) {
    markReflectTypeIdentity(existing, key);
    mergeTypeMetadata(existing, t);
    return existing;
  }
  canonicalTypes.set(key, t);
  internedTypes.add(t);
  return t;
}
var internedTypes = /* @__PURE__ */ new WeakSet();
function mergeTypeMetadata(target, source) {
  if (target instanceof BasicType && source instanceof BasicType) {
    target.mergeMethodSignatures(source.methodSignatures());
    return;
  }
  if (target instanceof PointerType && source instanceof PointerType) {
    target.mergeMethodSignatures(source.methodSignatures());
    return;
  }
  if (target instanceof FunctionType && source instanceof FunctionType) {
    target.mergeSignature(source);
    target.mergeMethodSignatures(source.methodSignatures());
  }
}
function typeIdentityKey(t, seen = /* @__PURE__ */ new Set()) {
  if (seen.has(t)) {
    return `${t.Kind()}:${t.PkgPath()}:${t.Name()}:${runtimeTypeString(t)}`;
  }
  seen.add(t);
  if (t instanceof StructType) {
    return t.identityKey(seen);
  }
  switch (t.Kind()) {
    // A named array or map differs from its underlying type by its name.
    case Array2:
      return `${t.Kind()}:${runtimeTypeString(t)}:${t.Len()}:${typeIdentityKey(t.Elem(), seen)}`;
    case Chan:
    case Ptr:
    case Slice:
      return `${t.Kind()}:${runtimeTypeString(t)}:${typeIdentityKey(t.Elem(), seen)}`;
    case Map2:
      return `${t.Kind()}:${runtimeTypeString(t)}:${typeIdentityKey(t.Key(), seen)}:${typeIdentityKey(t.Elem(), seen)}`;
    case Func: {
      if (t.Name() !== "") {
        return `${t.Kind()}:named:${t.PkgPath()}:${t.Name()}`;
      }
      const params = globalThis.Array.from(
        { length: t.NumIn() },
        (_unused, idx) => typeIdentityKey(t.In(idx), seen)
      );
      const results = globalThis.Array.from(
        { length: t.NumOut() },
        (_unused, idx) => typeIdentityKey(t.Out(idx), seen)
      );
      return `${t.Kind()}:${t.PkgPath()}:${t.Name()}:${runtimeTypeString(t)}:${t.IsVariadic()}:${params.join(",")}:${results.join(",")}`;
    }
    default:
      return `${t.Kind()}:${t.PkgPath()}:${t.Name()}:${runtimeTypeString(t)}`;
  }
}
function typeUnderlyingIdentityKey(t, seen = /* @__PURE__ */ new Set()) {
  if (seen.has(t)) {
    return `${t.Kind()}:${t.PkgPath()}:${t.Name()}:${runtimeTypeString(t)}`;
  }
  seen.add(t);
  if (t instanceof BasicType) {
    return `basic:${t.underlyingName()}`;
  }
  if (t instanceof StructType) {
    return t.underlyingIdentityKey(seen);
  }
  switch (t.Kind()) {
    case Array2:
      return `array:${t.Len()}:${typeIdentityKey(t.Elem(), seen)}`;
    case Chan:
      return `chan:${runtimeTypeString(t)}:${typeIdentityKey(t.Elem(), seen)}`;
    case Ptr:
      return `ptr:${typeIdentityKey(t.Elem(), seen)}`;
    case Slice:
      return `slice:${typeIdentityKey(t.Elem(), seen)}`;
    case Map2:
      return `map:${typeIdentityKey(t.Key(), seen)}:${typeIdentityKey(
        t.Elem(),
        seen
      )}`;
    case Func: {
      const params = globalThis.Array.from(
        { length: t.NumIn() },
        (_unused, idx) => typeIdentityKey(t.In(idx), seen)
      );
      const results = globalThis.Array.from(
        { length: t.NumOut() },
        (_unused, idx) => typeIdentityKey(t.Out(idx), seen)
      );
      return `func:${t.IsVariadic()}:${params.join(",")}:${results.join(",")}`;
    }
    case Interface:
      return `interface:${typeMethods(t).map(methodSignatureIdentityKey).join("|")}`;
    default:
      return `${t.Kind()}:${t.PkgPath()}:${t.Name()}:${runtimeTypeString(t)}`;
  }
}
function isInterfaceLiteral(name) {
  return name === "interface{}" || name.startsWith("interface {");
}
function typeIsNamed(t) {
  if (t.Kind() === Interface) {
    return !isInterfaceLiteral(runtimeTypeString(t));
  }
  if (t.Kind() === Struct || t.Kind() === Func) {
    return t.Name() !== "";
  }
  if (t instanceof BasicType) {
    return t.Kind() !== Invalid && t.Name() !== "";
  }
  return t.Name() !== "";
}
function typeMethodsSeq(t) {
  return async (_yield) => {
    for (let i = 0; i < t.NumMethod(); i++) {
      if (!await _yield(t.Method(i))) {
        return;
      }
    }
  };
}
function typeFieldsSeq(t) {
  if (t.Kind() !== Struct) {
    throw new Error("reflect: Fields of non-struct type " + t.String());
  }
  return async (_yield) => {
    for (let i = 0; i < t.NumField(); i++) {
      if (!await _yield(t.Field(i))) {
        return;
      }
    }
  };
}
function typeInsSeq(t) {
  if (t.Kind() !== Func) {
    throw new Error("reflect: Ins of non-func type " + t.String());
  }
  return async (_yield) => {
    for (let i = 0; i < t.NumIn(); i++) {
      if (!await _yield(t.In(i))) {
        return;
      }
    }
  };
}
function typeOutsSeq(t) {
  if (t.Kind() !== Func) {
    throw new Error("reflect: Outs of non-func type " + t.String());
  }
  return async (_yield) => {
    for (let i = 0; i < t.NumOut(); i++) {
      if (!await _yield(t.Out(i))) {
        return;
      }
    }
  };
}
function nonChanTypePanic(t) {
  throw new Error(`reflect: ChanDir of non-chan type ${t.String()}`);
}
function canRangeFunc(t, n) {
  if (t.Kind() !== Func || t.NumIn() !== 1 || t.NumOut() !== 0) {
    return false;
  }
  const y = t.In(0);
  return y.Kind() === Func && y.NumIn() === n && y.NumOut() === 1 && y.Out(0).Kind() === Bool;
}
function typeCanSeq(t) {
  switch (t.Kind()) {
    case Int:
    case Int8:
    case Int16:
    case Int32:
    case Int64:
    case Uint:
    case Uint8:
    case Uint16:
    case Uint32:
    case Uint64:
    case Uintptr:
    case Array2:
    case Slice:
    case Chan:
    case String2:
    case Map2:
      return true;
    case Func:
      return canRangeFunc(t, 1);
    case Ptr:
      return t.Elem().Kind() === Array2;
  }
  return false;
}
function typeCanSeq2(t) {
  switch (t.Kind()) {
    case Array2:
    case Slice:
    case String2:
    case Map2:
      return true;
    case Func:
      return canRangeFunc(t, 2);
    case Ptr:
      return t.Elem().Kind() === Array2;
  }
  return false;
}
function nonFunctionTypePanic(method, t) {
  throw new Error(`reflect: ${method} of non-func type ${t.String()}`);
}
function typeFieldByIndex(t, index2) {
  let typ = t;
  let field = new StructField({ Type: t });
  for (let i = 0; i < len(index2); i++) {
    if (i > 0) {
      typ = field.Type;
      if (typ.Kind() === Ptr && typ.Elem().Kind() === Struct) {
        typ = typ.Elem();
      }
    }
    field = typ.Field(index(index2, i));
  }
  return field;
}
var InvalidTypeClass = class {
  Kind() {
    return Invalid;
  }
  Comparable() {
    return false;
  }
  String() {
    return "<invalid reflect.Value>";
  }
  Name() {
    return "";
  }
  PkgPath() {
    return "";
  }
  Size() {
    return 0;
  }
  Elem() {
    throw new Error("reflect: Elem of invalid type");
  }
  Key() {
    throw new Error("reflect: Key of invalid type");
  }
  NumField() {
    return 0;
  }
  NumIn() {
    return nonFunctionTypePanic("NumIn", this);
  }
  In(_i) {
    return nonFunctionTypePanic("In", this);
  }
  NumOut() {
    return nonFunctionTypePanic("NumOut", this);
  }
  Out(_i) {
    return nonFunctionTypePanic("Out", this);
  }
  IsVariadic() {
    return nonFunctionTypePanic("IsVariadic", this);
  }
  Field(_i) {
    throw new Error("reflect: Field of invalid type");
  }
  FieldByIndex(index2) {
    return typeFieldByIndex(this, index2);
  }
  FieldByName(_name) {
    return [new StructField(), false];
  }
  FieldByNameFunc(_match) {
    return [new StructField(), false];
  }
  Implements(_u) {
    return false;
  }
  ConvertibleTo(u) {
    return typeConvertibleTo(this, u);
  }
  AssignableTo(_u) {
    return false;
  }
  OverflowInt(_x) {
    throw new Error("reflect: OverflowInt of invalid type");
  }
  OverflowUint(_x) {
    throw new Error("reflect: OverflowUint of invalid type");
  }
  OverflowFloat(_x) {
    throw new Error("reflect: OverflowFloat of invalid type");
  }
  Methods() {
    return typeMethodsSeq(this);
  }
  Fields() {
    return typeFieldsSeq(this);
  }
  Ins() {
    return typeInsSeq(this);
  }
  Outs() {
    return typeOutsSeq(this);
  }
  NumMethod() {
    return 0;
  }
  Method(i) {
    return typeMethod(this, i);
  }
  MethodByName(_name) {
    return [zeroMethod(), false];
  }
  Len() {
    throw new Error("reflect: Len of invalid type");
  }
  Bits() {
    throw new Error("reflect: Bits of invalid type");
  }
  ChanDir() {
    return nonChanTypePanic(this);
  }
  CanSeq() {
    return typeCanSeq(this);
  }
  CanSeq2() {
    return typeCanSeq2(this);
  }
};
var invalidTypeInstance = new InvalidTypeClass();
function isEmptyObject(value) {
  for (const key in value) {
    if (key !== structValueMarker && globalThis.Object.hasOwn(value, key)) {
      return false;
    }
  }
  return true;
}
var Value2 = class _Value {
  // __typeInfo is the runtime type of reflect.Value, registered after the
  // class is defined.
  static __typeInfo;
  _value;
  _type;
  // _parentVarRef tracks the VarRef this value was dereferenced from (for Set support)
  _parentVarRef;
  // _parentStruct and _fieldName track the parent struct and field name for struct field Set() support
  _parentStruct;
  _fieldName;
  _interfaceValue;
  // _addressable is whether the value is addressable, as in Go: an element
  // of a pointer or slice, or a field or array element of an addressable value.
  _addressable = false;
  constructor(value, type, parentVarRef, parentStruct, fieldName, interfaceValue2) {
    if (type === void 0 || type === null || typeof value === "object" && value !== null && !(value instanceof globalThis.Array) && !(value instanceof globalThis.Map) && !globalThis.ArrayBuffer.isView(value) && !isStructObject(value) && isEmptyObject(value)) {
      this._value = null;
      this._type = invalidTypeInstance;
    } else {
      this._value = value;
      this._type = type;
    }
    this._parentVarRef = parentVarRef;
    this._parentStruct = parentStruct;
    this._fieldName = fieldName;
    this._interfaceValue = interfaceValue2;
  }
  clone() {
    const cloned = new _Value();
    cloned._value = this._value;
    cloned._type = this._type;
    cloned._parentVarRef = this._parentVarRef;
    cloned._parentStruct = this._parentStruct;
    cloned._fieldName = this._fieldName;
    cloned._interfaceValue = this._interfaceValue;
    cloned._addressable = this._addressable;
    return cloned;
  }
  // withAddressable sets whether v is addressable and returns v.
  withAddressable(addressable) {
    this._addressable = addressable;
    return this;
  }
  // currentValue returns the value v refers to. Calling a method copies a
  // Value, as in Go, so a setter on a copy updates the shared parent VarRef or
  // struct field but not this Value's own _value; getters and Select read
  // through here.
  currentValue() {
    if (this._parentVarRef) {
      return this._parentVarRef.value;
    }
    if (this._parentStruct && this._fieldName !== void 0) {
      const value = this._parentStruct[this._fieldName];
      return value === void 0 ? null : value;
    }
    return this._value;
  }
  storeValue(value) {
    if (this.Kind() === Float32 && typeof value === "number") {
      value = Math.fround(value);
    }
    if (this.Kind() === Array2) {
      value = cloneArrayValue(
        value,
        typeInfoFromReflectType(this._type)
      );
    }
    if (this.Kind() === Struct) {
      const target = this.currentValue();
      assignStruct(target, value, typeInfoFromReflectType(this._type));
      this._value = target;
      return;
    }
    this._value = value;
    if (this._parentVarRef) {
      this._parentVarRef.value = value;
    }
    if (this._parentStruct && this._fieldName !== void 0) {
      this._parentStruct[this._fieldName] = value;
    }
  }
  // integerValue reads the underlying value as a bigint regardless of whether it
  // is stored as a number (int8..int32/uint8..uint32) or a bigint (int64/uint64).
  integerValue() {
    const current = this.currentValue();
    if (typeof current === "bigint") {
      return current;
    }
    const value = this.numericValue();
    if (value !== null && Number.isInteger(value)) {
      return BigInt(value);
    }
    return null;
  }
  // Int returns v's underlying value as an int64, matching reflect.Value.Int.
  Int() {
    const value = this.integerValue();
    if (value !== null) {
      return value;
    }
    throw new Error(
      "reflect: call of reflect.Value.Int on " + Kind_String(this._type.Kind()) + " Value"
    );
  }
  // Uint returns v's underlying value as a uint64, matching reflect.Value.Uint.
  Uint() {
    const value = this.integerValue();
    if (value !== null && value >= 0n) {
      return value;
    }
    throw new Error(
      "reflect: call of reflect.Value.Uint on " + Kind_String(this._type.Kind()) + " Value"
    );
  }
  Float() {
    const value = this.numericValue();
    if (value !== null) {
      return value;
    }
    throw new Error(
      "reflect: call of reflect.Value.Float on " + Kind_String(this._type.Kind()) + " Value"
    );
  }
  Bool() {
    const current = this.currentValue();
    if (typeof current === "boolean") {
      return current;
    }
    throw new Error(
      "reflect: call of reflect.Value.Bool on " + Kind_String(this._type.Kind()) + " Value"
    );
  }
  numericValue() {
    const current = this.currentValue();
    if (typeof current === "number") {
      return current;
    }
    if (current !== null && typeof current === "object" && typeof current.valueOf === "function") {
      const value = current.valueOf();
      if (typeof value === "number") {
        return value;
      }
    }
    return null;
  }
  String() {
    const current = this.currentValue();
    if (typeof current === "string") {
      return current;
    }
    if (this._type.Kind() === Bool) {
      return "<bool Value>";
    }
    return this._type.String();
  }
  Len() {
    const value = this.currentValue();
    if (this.Kind() === Slice || this.Kind() === Array2) {
      return len(value);
    }
    if (this.Kind() === Map2) {
      if (value instanceof globalThis.Map) {
        return value.size;
      }
      if (value !== null && value !== void 0) {
        throw new ValueError({ Kind: this.Kind(), Method: "Len" });
      }
      return 0;
    }
    if (value && typeof value === "object" && "__meta__" in value) {
      const meta = value.__meta__;
      if (meta && typeof meta.length === "number") {
        return meta.length;
      }
    }
    if (value instanceof Uint8Array || value instanceof Int8Array || value instanceof Uint16Array || value instanceof Int16Array || value instanceof Uint32Array || value instanceof Int32Array || value instanceof Float32Array || value instanceof Float64Array) {
      return value.length;
    }
    if (globalThis.Array.isArray(value)) {
      return value.length;
    }
    if (typeof value === "string") {
      return len(value);
    }
    throw new Error(
      "reflect: call of reflect.Value.Len on " + Kind_String(this._type.Kind()) + " Value"
    );
  }
  Kind() {
    return this._type.Kind();
  }
  Type() {
    return this._type;
  }
  IsValid() {
    return this._type !== invalidTypeInstance;
  }
  IsNil() {
    const value = this.currentValue();
    if (value === null || value === void 0) {
      return true;
    }
    return this.Kind() !== Interface && isTypedNilValue(value);
  }
  Index(i) {
    if (this.Kind() === Slice || this.Kind() === Array2) {
      const ref = indexRef(
        this.currentValue(),
        i
      );
      return new _Value(ref.value, this._type.Elem(), ref).withAddressable(
        this.Kind() === Slice || this._addressable
      );
    }
    throw new Error(
      "reflect: call of reflect.Value.Index on " + Kind_String(this._type.Kind()) + " Value"
    );
  }
  Slice(i, j) {
    const length = this.Len();
    if (i < 0 || j < i || j > length) {
      throw new Error(
        `reflect.Value.Slice: slice index out of bounds [${i}:${j}] with length ${length}`
      );
    }
    const value = this.currentValue();
    if (value && typeof value === "object" && "__meta__" in value || isTypedSlice(value)) {
      return new _Value(goSlice(value, i, j), this._type);
    }
    if (globalThis.Array.isArray(value)) {
      return new _Value(value.slice(i, j), this._type);
    }
    if (typeof value === "string") {
      return new _Value(value.slice(i, j), this._type);
    }
    throw new ValueError({ Kind: this.Kind(), Method: "Slice" });
  }
  // Slice3 is the 3-index form of the slice operation: it returns v[i:j:k].
  Slice3(i, j, k) {
    const value = this.currentValue();
    if (this.Kind() !== Slice && this.Kind() !== Array2 || value !== null && typeof value !== "object") {
      throw new ValueError({ Kind: this.Kind(), Method: "Slice3" });
    }
    const capacity = cap(value);
    if (i < 0 || j < i || k < j || k > capacity) {
      throw new Error(
        `reflect.Value.Slice3: slice index out of bounds [${i}:${j}:${k}] with capacity ${capacity}`
      );
    }
    const typ = this.Kind() === Array2 ? SliceOf(this._type.Elem()) : this._type;
    return new _Value(goSlice(value, i, j, k), typ);
  }
  // Recv receives and returns a value from the channel v. It blocks until a
  // value is ready. The boolean is false if the value is the zero value
  // received because the channel is closed.
  async Recv() {
    const result = await chanRecvWithOk(this.recvChan());
    if (!result.ok) {
      return [Zero(this._type.Elem()), false];
    }
    return [new _Value(result.value, this._type.Elem()), true];
  }
  // Seq returns an iter.Seq[Value] that loops over the elements of v, as a
  // range loop would.
  Seq() {
    return valueSeq(this);
  }
  // Seq2 returns an iter.Seq2[Value, Value] that loops over the elements of
  // v, as a range loop with two variables would.
  Seq2() {
    return valueSeq2(this);
  }
  Bytes() {
    const value = this.currentValue();
    if (this.Kind() === Slice && this._type.Elem()?.Kind() === Uint8 && (value === null || value instanceof Uint8Array || globalThis.Array.isArray(value) || typeof value === "object" && "__meta__" in value)) {
      return value;
    }
    if (this.Kind() === String2 && typeof value === "string") {
      return stringToBytes(value);
    }
    throw new Error(
      "reflect: call of reflect.Value.Bytes on " + Kind_String(this._type.Kind()) + " Value"
    );
  }
  Elem() {
    const value = this.currentValue();
    if (this._type.Kind() === Ptr && isVarRef(value)) {
      const varRef2 = value;
      const elemType = this._type.Elem();
      return new _Value(varRef2.value, elemType, varRef2).withAddressable(true);
    }
    if (this._type.Kind() === Ptr && value && typeof value === "object" && "__goValue" in value && isVarRef(value.__goValue)) {
      const varRef2 = value.__goValue;
      return new _Value(varRef2.value, this._type.Elem(), varRef2).withAddressable(
        true
      );
    }
    if (this._type.Kind() === Interface) {
      const value2 = this.currentValue();
      if (value2 === null || value2 === void 0) {
        return new _Value();
      }
      return ValueOf(value2);
    }
    if (this._type.Kind() === Ptr) {
      if (this.IsNil()) {
        return new _Value();
      }
      return new _Value(value, this._type.Elem()).withAddressable(true);
    }
    return new _Value(value, this._type, this._parentVarRef);
  }
  NumField() {
    return this._type.NumField();
  }
  Field(i) {
    if (this.Kind() !== Struct) {
      throw new ValueError({ Kind: this.Kind(), Method: "Field" });
    }
    const typ = this.Type();
    let fieldType;
    let fieldKey;
    if (typ instanceof StructType) {
      fieldType = typ.fieldType(i);
      fieldKey = typ.fieldKey(i);
    } else {
      const field = typ.Field(i);
      if (!field) {
        throw new Error("reflect: struct field index out of range");
      }
      fieldType = field.Type;
      fieldKey = structFieldStorageKey(typ, i);
    }
    const structValue = this.currentValue();
    const parentObj = structValue;
    const fieldVal = parentObj[fieldKey] ?? null;
    return new _Value(
      fieldVal,
      fieldType,
      void 0,
      parentObj,
      fieldKey
    ).withAddressable(this._addressable);
  }
  FieldByIndex(index2) {
    const [field, err] = this.FieldByIndexErr(index2);
    if (err !== null) {
      panic(err);
    }
    return field;
  }
  // FieldByIndexErr returns the nested field corresponding to index, or an
  // error if evaluation requires stepping through a nil pointer to an
  // embedded struct.
  FieldByIndexErr(index2) {
    let current = this;
    let i = 0;
    for (const fieldIndex of asArray(index2)) {
      if (i > 0 && current.Kind() === Ptr && current.Type().Elem().Kind() === Struct) {
        if (current.IsNil()) {
          return [
            new _Value(),
            newError(
              "reflect: indirection through nil pointer to embedded struct field " + current.Type().Elem().Name()
            )
          ];
        }
        current = current.Elem();
      }
      current = current.Field(fieldIndex);
      i++;
    }
    return [current, null];
  }
  FieldByName(name) {
    const [field, ok] = this.Type().FieldByName(name);
    if (!ok) {
      return new _Value(null, invalidTypeInstance);
    }
    return this.FieldByIndex(field.Index);
  }
  // FieldByNameFunc returns the struct field with a name that satisfies
  // the match function, or the zero Value if no field was found.
  FieldByNameFunc(match) {
    const [field, ok] = this.Type().FieldByNameFunc(match);
    if (!ok) {
      return new _Value(null, invalidTypeInstance);
    }
    return this.FieldByIndex(field.Index);
  }
  // Additional methods needed by various parts of the codebase
  UnsafePointer() {
    return this._value;
  }
  Pointer() {
    const kind = this.Kind();
    if (kind !== Chan && kind !== Func && kind !== Map2 && kind !== Ptr && kind !== Slice && kind !== UnsafePointer) {
      throw new ValueError({ Kind: kind, Method: "Pointer" });
    }
    const value = this.currentValue();
    if (value === null || value === void 0 || isTypedNilValue(value)) {
      return 0;
    }
    if (isOwnedPointerHandle(value)) {
      return ownedPointerAddress(value);
    }
    if (isVarRef(value)) {
      const address = value.__goAddress?.();
      if (address !== void 0) {
        return address;
      }
      return pointerAddress(value);
    }
    if (kind === Slice) {
      const slice = value;
      try {
        if (len(slice) === 0) {
          return 0;
        }
        return indexAddress(slice, 0);
      } catch {
        return 0;
      }
    }
    if (typeof value === "function") {
      return functionAddress(value);
    }
    if (typeof value === "object") {
      return pointerAddress(value);
    }
    return 0;
  }
  UnsafeAddr() {
    if (!this.canTakeAddress()) {
      throw new ValueError({ Kind: this.Kind(), Method: "UnsafeAddr" });
    }
    if (this._parentStruct && this._fieldName) {
      const target = this._parentStruct;
      const key = this._fieldName;
      const ref = fieldRef(
        target,
        key
      );
      return ownedPointerFromRef(ref);
    }
    if (this._parentVarRef?.__goPointer) {
      return this._parentVarRef.__goPointer;
    }
    return this.Pointer();
  }
  pointer() {
    return this._value;
  }
  get ptr() {
    return this._value;
  }
  // Internal method to access the underlying value
  get value() {
    return this.currentValue();
  }
  // Convert method needed by iter.ts
  // Convert returns the value v converted to type t, as a Go conversion
  // would: numeric values change their representation and width, and
  // strings convert to and from byte and rune slices.
  Convert(t) {
    if (!this.IsValid()) {
      throw new ValueError({ Kind: Invalid, Method: "Convert" });
    }
    return new _Value(convertValue(this.currentValue(), this.Type(), t), t);
  }
  // CanConvert reports whether the value is convertible to type t. The
  // interface dynamic-type case from Go does not arise here because values
  // are always built from their dynamic type.
  CanConvert(t) {
    if (t === null) {
      return false;
    }
    if (!this.IsValid()) {
      return false;
    }
    return this.Type().ConvertibleTo(t);
  }
  // CanAddr reports whether v is addressable, as in Go.
  CanAddr() {
    return this._addressable;
  }
  // canTakeAddress reports whether Addr and UnsafeAddr can produce a pointer
  // to v. It is more permissive than CanAddr: any value with storage can be
  // referenced in GoScript, even one Go would not consider addressable.
  canTakeAddress() {
    return this._addressable || this.Kind() !== Ptr && (this._parentVarRef !== void 0 || this._parentStruct !== void 0 && this._fieldName !== void 0 || this._value !== null);
  }
  Addr() {
    if (!this.canTakeAddress()) {
      throw new Error("reflect: call of reflect.Value.Addr on invalid Value");
    }
    const ptrType = PointerTo(this.Type());
    if (this._parentStruct && this._fieldName) {
      return new _Value(fieldRef(this._parentStruct, this._fieldName), ptrType);
    }
    if (this._parentVarRef) {
      return new _Value(this._parentVarRef, ptrType);
    }
    if (this.Kind() === Struct) {
      return new _Value(this._value, ptrType);
    }
    return new _Value(varRef(this._value), ptrType);
  }
  CanSet() {
    return this.IsValid() && (this._addressable || this._parentVarRef !== void 0 || this._parentStruct !== void 0);
  }
  Set(x) {
    if (!this.CanSet()) {
      throw new Error("reflect: assign to invalid value");
    }
    const thisType = this.Type();
    const xType = x.Type();
    if (!xType.AssignableTo(thisType)) {
      throw new Error("reflect: assign to wrong type");
    }
    this.storeValue(interfaceStoreValue(x, thisType));
  }
  // Interface returns v's current value as an interface value, boxed with its
  // named type.
  Interface() {
    if (this._interfaceValue !== void 0) {
      return this._interfaceValue;
    }
    const current = this.currentValue();
    if (this._type.Kind() === Interface) {
      return current;
    }
    const { typeInfo, typeString, namedType, elemType, namedElemType } = boxingInfo(this._type);
    const generic = genericInstanceMethodSet(this._type, current);
    if (generic !== void 0) {
      return namedValueInterfaceValue(
        isVarRef(current) ? current.value : current,
        typeString,
        generic.methods,
        typeInfo,
        generic.signatures
      );
    }
    if (elemType !== null && elemType.Kind() === Struct) {
      let target = isVarRef(current) ? current.value : current;
      if (elemType.Name() === "" && isNamedStructObject(target)) {
        target = unnamedStructView(target);
      }
      return interfaceValue(
        target ?? null,
        typeString,
        typeInfo
      );
    }
    if (this._type.Kind() === Struct && namedType) {
      return interfaceValue(current, typeString, typeInfo);
    }
    if (namedType && this._type.Kind() !== Struct || this._type.Kind() === Ptr && namedElemType) {
      const registered = namedValueMethods(typeString);
      return namedValueInterfaceValue(
        current,
        typeString,
        registered?.methods ?? {},
        typeInfo,
        registered?.signatures
      );
    }
    const kind = this._type.Kind();
    if (kind >= Int && kind <= Float64 && kind !== Int64 && kind !== Uint64 && kind !== Uintptr) {
      return basicInterfaceValue(current, typeString);
    }
    return interfaceValue(current, typeString, typeInfo);
  }
  MethodByName(name) {
    if (!this.IsValid()) {
      return new _Value();
    }
    const bound = this.boundMethod(name);
    if (bound === void 0) {
      return new _Value();
    }
    const [signature] = methodSignatureByName(this.Type(), name);
    const methodType = signature ? methodTypeFromSignature(signature, this.Type(), false) : new FunctionType("func");
    return new _Value(bound, methodType);
  }
  // Method returns a function value for the i'th method of the method set of
  // v's type, with v bound as its receiver.
  Method(i) {
    return this.MethodByName(this.Type().Method(i).Name);
  }
  // boundMethod returns the method called name bound to the value, or
  // undefined if the value has no such method.
  boundMethod(name) {
    const current = this.currentValue();
    const receiver = isVarRef(current) ? current.value : current;
    if (receiver === null || receiver === void 0) {
      return void 0;
    }
    const set = genericInstanceMethodSet(this.Type(), current);
    const generic = set?.methods[name];
    if (generic !== void 0) {
      const [declared] = methodSignatureByName(this.Type(), name);
      const instance = set.signatures.find((sig) => sig.name === name);
      return genericMethodCall(generic, current, declared, instance);
    }
    const method = typeof receiver === "object" || typeof receiver === "function" ? receiver[name] : void 0;
    if (typeof method === "function") {
      return bindReflectMethod(
        receiver,
        name,
        method
      );
    }
    const named = namedValueMethods(runtimeTypeString(this.Type()))?.methods[name];
    if (named === void 0) {
      return void 0;
    }
    return (...args) => named(current, ...args);
  }
  async Call(inArgs) {
    const fn = this.currentValue();
    if (this.Kind() !== Func || typeof fn !== "function") {
      throw new ValueError({ Kind: this.Kind(), Method: "Call" });
    }
    return await callReflectFunction(
      fn,
      this._type,
      inArgs,
      "Call"
    );
  }
  async CallSlice(inArgs) {
    const fn = this.currentValue();
    if (this.Kind() !== Func || typeof fn !== "function") {
      throw new ValueError({ Kind: this.Kind(), Method: "CallSlice" });
    }
    return await callReflectFunction(
      fn,
      this._type,
      inArgs,
      "CallSlice"
    );
  }
  // IsZero reports whether v is the zero value for its type, as in Go:
  // reference kinds are zero only when nil, floats only when +0, and arrays
  // and structs when all their elements and fields are zero.
  IsZero() {
    const value = this.currentValue();
    switch (this.Kind()) {
      case Invalid:
        throw new ValueError({ Kind: Invalid, Method: "IsZero" });
      case Bool:
        return value === false || value === null;
      case String2:
        return value === "" || value === null;
      case Float32:
      case Float64:
        return value === null || Object.is(value, 0);
      case Complex64:
      case Complex128: {
        const c = value;
        return c === null || Object.is(c.real, 0) && Object.is(c.imag, 0);
      }
      case Chan:
      case Func:
      case Interface:
      case Map2:
      case Ptr:
      case Slice:
      case UnsafePointer:
        return this.IsNil();
      case Array2: {
        const n = this.Len();
        for (let i = 0; i < n; i++) {
          if (!this.Index(i).IsZero()) {
            return false;
          }
        }
        return true;
      }
      case Struct: {
        const n = this.NumField();
        for (let i = 0; i < n; i++) {
          if (!this.Field(i).IsZero()) {
            return false;
          }
        }
        return true;
      }
    }
    return value === null || value === 0 || value === 0n;
  }
  typ() {
    return new rtype(this._type.Kind());
  }
  get flag() {
    return 0;
  }
  MapRange() {
    if (this.Kind() !== Map2) {
      throw new ValueError({ Kind: this.Kind(), Method: "MapRange" });
    }
    const value = this.currentValue();
    if (value === null || value === void 0) {
      return new MapIter(new globalThis.Map(), this._type);
    }
    if (!(value instanceof globalThis.Map)) {
      throw new ValueError({ Kind: this.Kind(), Method: "MapRange" });
    }
    return new MapIter(value, this._type);
  }
  MapIndex(key) {
    if (this.Kind() !== Map2) {
      throw new ValueError({ Kind: this.Kind(), Method: "MapIndex" });
    }
    const value = this.currentValue();
    if (!(value instanceof globalThis.Map)) {
      return new _Value();
    }
    const rawKey = key.value;
    if (!value.has(rawKey)) {
      return new _Value();
    }
    return new _Value(value.get(rawKey), this.Type().Elem());
  }
  MapKeys() {
    if (this.Kind() !== Map2) {
      throw new ValueError({ Kind: this.Kind(), Method: "MapKeys" });
    }
    const value = this.currentValue();
    if (value === null || value === void 0) {
      return makeSlice(0);
    }
    if (!(value instanceof globalThis.Map)) {
      throw new ValueError({ Kind: this.Kind(), Method: "MapKeys" });
    }
    const keyType = this.Type().Key();
    const keys = [];
    for (const key of value.keys()) {
      keys.push(new _Value(key, keyType));
    }
    return arrayToSlice(keys);
  }
  Complex() {
    const k = this.Kind();
    if (k !== Complex64 && k !== Complex128) {
      throw new Error(
        "reflect: call of reflect.Value.Complex on " + Kind_String(k) + " Value"
      );
    }
    const value = this._parentVarRef ? this._parentVarRef.value : this._value;
    if (value === null || value === void 0) {
      return complex(0, 0);
    }
    if (typeof value === "number") {
      return complex(value, 0);
    }
    return value;
  }
  // Close closes the channel v. It panics if v is not a channel that can
  // send.
  Close() {
    const ch = this.sendChan();
    if (ch === null) {
      throw new Error("close of nil channel");
    }
    ch.close();
  }
  // Send sends x on the channel v. It blocks until the value is sent.
  async Send(x) {
    await chanSend(this.sendChan(), x.currentValue());
  }
  // recvChan returns the channel v holds for a receive, or null for a nil
  // channel. It panics if v is not a channel that can receive.
  recvChan() {
    if (this.Kind() !== Chan) {
      throw new ValueError({ Kind: this.Kind(), Method: "Recv" });
    }
    if (this._type.ChanDir() === SendDir) {
      throw new Error("reflect: recv on send-only channel");
    }
    return this.chanValue();
  }
  // sendChan returns the channel v holds for a send, or null for a nil
  // channel. It panics if v is not a channel that can send.
  sendChan() {
    if (this.Kind() !== Chan) {
      throw new ValueError({ Kind: this.Kind(), Method: "Send" });
    }
    if (this._type.ChanDir() === RecvDir) {
      throw new Error("reflect: send on recv-only channel");
    }
    return this.chanValue();
  }
  // chanValue returns the channel v holds, or null for a nil channel,
  // including a typed nil boxed in an interface.
  chanValue() {
    if (this.IsNil()) {
      return null;
    }
    return this.currentValue();
  }
  // SetString sets v's underlying value to x
  SetString(x) {
    if (!this.CanSet()) {
      throw new Error(
        "reflect: call of reflect.Value.SetString on unaddressable value"
      );
    }
    if (this.Kind() !== String2) {
      throw new Error(
        "reflect: call of reflect.Value.SetString on " + this.Kind() + " Value"
      );
    }
    this._value = x;
    if (this._parentVarRef) {
      this._parentVarRef.value = x;
    }
    if (this._parentStruct && this._fieldName) {
      this._parentStruct[this._fieldName] = x;
    }
  }
  // SetInt sets v's underlying value to x. x is an int64 (bigint); the stored
  // value uses the field's representation: bigint for Int64, number otherwise.
  SetInt(x) {
    if (!this.CanSet()) {
      throw new Error(
        "reflect: call of reflect.Value.SetInt on unaddressable value"
      );
    }
    const k = this.Kind();
    if (k !== Int && k !== Int8 && k !== Int16 && k !== Int32 && k !== Int64) {
      throw new Error(
        "reflect: call of reflect.Value.SetInt on " + k + " Value"
      );
    }
    const stored = k === Int64 ? x : Number(x);
    this._value = stored;
    if (this._parentVarRef) {
      this._parentVarRef.value = stored;
    }
    if (this._parentStruct && this._fieldName) {
      this._parentStruct[this._fieldName] = stored;
    }
  }
  // SetUint sets v's underlying value to x. x is a uint64 (bigint); the stored
  // value uses the field's representation: bigint for Uint64, number otherwise.
  SetUint(x) {
    if (!this.CanSet()) {
      throw new Error(
        "reflect: call of reflect.Value.SetUint on unaddressable value"
      );
    }
    const k = this.Kind();
    if (k !== Uint && k !== Uint8 && k !== Uint16 && k !== Uint32 && k !== Uint64 && k !== Uintptr) {
      throw new Error(
        "reflect: call of reflect.Value.SetUint on " + k + " Value"
      );
    }
    const stored = k === Uint64 ? x : Number(x);
    this._value = stored;
    if (this._parentVarRef) {
      this._parentVarRef.value = stored;
    }
    if (this._parentStruct && this._fieldName) {
      this._parentStruct[this._fieldName] = stored;
    }
  }
  // SetBool sets v's underlying value to x
  SetBool(x) {
    if (!this.CanSet()) {
      throw new Error(
        "reflect: call of reflect.Value.SetBool on unaddressable value"
      );
    }
    if (this.Kind() !== Bool) {
      throw new Error(
        "reflect: call of reflect.Value.SetBool on " + this.Kind() + " Value"
      );
    }
    this._value = x;
    if (this._parentVarRef) {
      this._parentVarRef.value = x;
    }
    if (this._parentStruct && this._fieldName) {
      this._parentStruct[this._fieldName] = x;
    }
  }
  // SetFloat sets v's underlying value to x
  SetFloat(x) {
    if (!this.CanSet()) {
      throw new Error(
        "reflect: call of reflect.Value.SetFloat on unaddressable value"
      );
    }
    const k = this.Kind();
    if (k !== Float32 && k !== Float64) {
      throw new Error(
        "reflect: call of reflect.Value.SetFloat on " + k + " Value"
      );
    }
    this.storeValue(x);
  }
  // SetComplex sets v's underlying value to x
  SetComplex(x) {
    if (!this.CanSet()) {
      throw new Error(
        "reflect: call of reflect.Value.SetComplex on unaddressable value"
      );
    }
    const k = this.Kind();
    if (k !== Complex64 && k !== Complex128) {
      throw new Error(
        "reflect: call of reflect.Value.SetComplex on " + k + " Value"
      );
    }
    this._value = x;
    if (this._parentVarRef) {
      this._parentVarRef.value = x;
    }
    if (this._parentStruct && this._fieldName) {
      this._parentStruct[this._fieldName] = x;
    }
  }
  // SetBytes sets v's underlying value to x, a byte slice it then shares
  // storage with, as in Go.
  SetBytes(x) {
    if (!this.CanSet()) {
      throw new Error(
        "reflect: call of reflect.Value.SetBytes on unaddressable value"
      );
    }
    if (this.Kind() !== Slice || this._type.Elem().Kind() !== Uint8) {
      throw new Error("reflect.Value.SetBytes of non-byte slice");
    }
    this.storeValue(x);
  }
  // SetZero sets v to be the zero value of v's type
  // SetIterKey assigns to v the key of iter's current map entry, as
  // v.Set(iter.Key()) does.
  SetIterKey(iter) {
    this.Set(iter.Key());
  }
  // SetIterValue assigns to v the value of iter's current map entry, as
  // v.Set(iter.Value()) does.
  SetIterValue(iter) {
    this.Set(iter.Value());
  }
  // SetCap sets v's capacity to n. It panics if v's Kind is not Slice, or if
  // n is smaller than the length or greater than the capacity of the slice.
  SetCap(n) {
    if (!this.CanSet()) {
      throw new Error(
        "reflect: call of reflect.Value.SetCap on unaddressable value"
      );
    }
    if (this.Kind() !== Slice) {
      throw new ValueError({ Kind: this.Kind(), Method: "SetCap" });
    }
    const value = this.currentValue();
    if (n < len(value) || n > cap(value)) {
      throw new Error("reflect: slice capacity out of range in SetCap");
    }
    this.storeValue(goSlice(value, 0, len(value), n));
  }
  // Clear clears the contents of a map or zeros the contents of a slice, as
  // the clear builtin does.
  Clear() {
    const k = this.Kind();
    if (k === Map2) {
      ;
      this.currentValue()?.clear();
      return;
    }
    if (k !== Slice) {
      throw new ValueError({ Kind: k, Method: "Clear" });
    }
    for (let i = 0; i < this.Len(); i++) {
      this.Index(i).SetZero();
    }
  }
  // CanInt reports whether Int can be used without panicking.
  CanInt() {
    const k = this.Kind();
    return k === Int || k === Int8 || k === Int16 || k === Int32 || k === Int64;
  }
  // CanUint reports whether Uint can be used without panicking.
  CanUint() {
    const k = this.Kind();
    return k === Uint || k === Uint8 || k === Uint16 || k === Uint32 || k === Uint64 || k === Uintptr;
  }
  // CanFloat reports whether Float can be used without panicking.
  CanFloat() {
    const k = this.Kind();
    return k === Float32 || k === Float64;
  }
  // CanComplex reports whether Complex can be used without panicking.
  CanComplex() {
    const k = this.Kind();
    return k === Complex64 || k === Complex128;
  }
  // OverflowComplex reports whether the complex128 x cannot be represented by
  // v's type. It panics if v's Kind is not Complex64 or Complex128.
  OverflowComplex(x) {
    const k = this.Kind();
    if (k === Complex64) {
      const f32max = 34028234663852886e22;
      const overflows = (f) => isFinite(f) && Math.abs(f) > f32max;
      return overflows(real(x)) || overflows(imag(x));
    }
    if (k === Complex128) {
      return false;
    }
    throw new ValueError({ Kind: k, Method: "OverflowComplex" });
  }
  // Comparable reports whether v is comparable. For an interface, array or
  // struct, it depends on the values it holds, as in Go.
  Comparable() {
    switch (this.Kind()) {
      case Invalid:
        return false;
      case Interface:
        return this.IsNil() || this.Elem().Comparable();
      case Array2:
      case Struct: {
        const n = this.Kind() === Array2 ? this.Len() : this.NumField();
        for (let i = 0; i < n; i++) {
          const elem = this.Kind() === Array2 ? this.Index(i) : this.Field(i);
          if (!elem.Comparable()) {
            return false;
          }
        }
        return true;
      }
      default:
        return this.Type().Comparable();
    }
  }
  // Fields returns an iterator over the fields of the struct v, yielding
  // each field's StructField and Value.
  Fields() {
    return async (_yield) => {
      const t = this.Type();
      for (let i = 0; i < this.NumField(); i++) {
        if (!await _yield(t.Field(i), this.Field(i))) {
          return;
        }
      }
    };
  }
  // Methods returns an iterator over the exported methods of v, yielding
  // each method's Method and its value bound to v.
  Methods() {
    return async (_yield) => {
      const t = this.Type();
      for (let i = 0; i < this.NumMethod(); i++) {
        if (!await _yield(t.Method(i), this.Method(i))) {
          return;
        }
      }
    };
  }
  // TryRecv receives a value from the channel v if it can without blocking,
  // reporting whether it did; ok is false for a closed channel.
  async TryRecv() {
    const ch = this.recvChan();
    if (ch === null || !ch.canReceiveNonBlocking()) {
      return [new _Value(null, invalidTypeInstance), false];
    }
    return this.Recv();
  }
  // TrySend sends x on the channel v if it can without blocking, reporting
  // whether it did.
  async TrySend(x) {
    const ch = this.sendChan();
    if (ch === null || !ch.canSendNonBlocking()) {
      return false;
    }
    await this.Send(x);
    return true;
  }
  // InterfaceData is deprecated and needs the memory layout of an interface,
  // which values do not have here.
  InterfaceData() {
    throw new Error("reflect: InterfaceData is not supported");
  }
  // SetPointer needs unsafe pointers, which values do not have here.
  SetPointer(_x) {
    throw new Error("reflect: SetPointer is not supported");
  }
  SetZero() {
    if (!this.CanSet()) {
      throw new Error(
        "reflect: call of reflect.Value.SetZero on unaddressable value"
      );
    }
    const zeroVal = Zero(this.Type());
    this.storeValue(zeroVal.value);
  }
  // SetLen sets v's length to n
  SetLen(n) {
    if (!this.CanSet()) {
      throw new Error(
        "reflect: call of reflect.Value.SetLen on unaddressable value"
      );
    }
    if (this.Kind() !== Slice) {
      throw new Error(
        "reflect: call of reflect.Value.SetLen on " + this.Kind() + " Value"
      );
    }
    const value = this.currentValue();
    if (n < 0 || n > cap(value)) {
      throw new Error("reflect: slice length out of range in SetLen");
    }
    this.storeValue(goSlice(value, 0, n));
  }
  // SetMapIndex sets the element associated with key in the map v to elem
  SetMapIndex(key, elem) {
    if (!this.IsValid()) {
      throw new ValueError({ Kind: Invalid, Method: "SetMapIndex" });
    }
    if (this.Kind() !== Map2) {
      throw new Error(
        "reflect: call of reflect.Value.SetMapIndex on " + this.Kind() + " Value"
      );
    }
    const mapObj = this.currentValue();
    if (!(mapObj instanceof globalThis.Map)) {
      throw new Error("reflect: assignment to entry in nil map");
    }
    const keyVal = key.value;
    if (!elem.IsValid()) {
      mapObj.delete(keyVal);
      return;
    }
    mapObj.set(keyVal, interfaceStoreValue(elem, this.Type().Elem()));
  }
  // Grow increases the slice's capacity, if necessary, to guarantee space
  // for another n elements, so that SetLen can extend the length after it.
  Grow(n) {
    if (this.Kind() !== Slice) {
      throw new Error(
        "reflect: call of reflect.Value.Grow on " + this.Kind() + " Value"
      );
    }
    if (n < 0) {
      throw new Error("reflect.Value.Grow: negative len");
    }
    if (!this.CanSet()) {
      throw new Error(
        "reflect: call of reflect.Value.Grow on unaddressable value"
      );
    }
    const value = this.currentValue();
    const len2 = len(value);
    const cap2 = cap(value);
    if (cap2 - len2 >= n) {
      return;
    }
    const elemType = this._type.Elem();
    const grown = makeSlice(
      len2,
      Math.max(len2 + n, 2 * cap2),
      sliceTypeHint(elemType),
      () => Zero(elemType).value
    );
    copy(grown, value);
    this.storeValue(grown);
  }
  // Cap returns v's capacity
  Cap() {
    const k = this.Kind();
    if (k === Slice || k === Array2) {
      return cap(this._value);
    }
    if (k === Chan) {
      return 0;
    }
    throw new Error("reflect: call of reflect.Value.Cap on " + k + " Value");
  }
  // NumMethod returns the number of methods in the value's method set
  NumMethod() {
    if (!this.IsValid()) {
      return 0;
    }
    return this.Type().NumMethod();
  }
  // Equal reports whether v is equal to u, as the == operator would report
  // for the values they hold: interfaces compare their dynamic values,
  // pointers and channels compare identity, and arrays and structs compare
  // their elements and fields.
  Equal(u) {
    let v = this;
    if (v.Kind() === Interface) {
      v = v.Elem();
    }
    if (u.Kind() === Interface) {
      u = u.Elem();
    }
    if (!v.IsValid() || !u.IsValid()) {
      return v.IsValid() === u.IsValid();
    }
    if (v.Kind() !== u.Kind() || typeIdentityKey(v.Type()) !== typeIdentityKey(u.Type())) {
      return false;
    }
    switch (v.Kind()) {
      case Chan:
      case Ptr:
      case UnsafePointer:
        if (v.IsNil() || u.IsNil()) {
          return v.IsNil() && u.IsNil();
        }
        return v.Pointer() === u.Pointer();
      case Array2: {
        const n = v.Len();
        for (let i = 0; i < n; i++) {
          if (!v.Index(i).Equal(u.Index(i))) {
            return false;
          }
        }
        return true;
      }
      case Struct: {
        const n = v.NumField();
        for (let i = 0; i < n; i++) {
          if (!v.Field(i).Equal(u.Field(i))) {
            return false;
          }
        }
        return true;
      }
      case Complex64:
      case Complex128: {
        const a = v.currentValue();
        const b = u.currentValue();
        return a.real === b.real && a.imag === b.imag;
      }
      case Func:
      case Map2:
      case Slice:
        throw new Error(
          "reflect.Value.Equal: values of type " + v.Type().String() + " are not comparable"
        );
    }
    return v.currentValue() === u.currentValue();
  }
  // CanInterface reports whether Interface can be used without panicking
  CanInterface() {
    return this.IsValid();
  }
  // OverflowInt reports whether the int64 x cannot be represented by v's type
  OverflowInt(x) {
    const k = this.Kind();
    switch (k) {
      case Int8:
        return x < -128n || x > 127n;
      case Int16:
        return x < -32768n || x > 32767n;
      case Int32:
        return x < -2147483648n || x > 2147483647n;
      case Int:
      case Int64:
        return false;
      default:
        throw new Error(
          "reflect: call of reflect.Value.OverflowInt on " + k + " Value"
        );
    }
  }
  // OverflowUint reports whether the uint64 x cannot be represented by v's type
  OverflowUint(x) {
    const k = this.Kind();
    switch (k) {
      case Uint8:
        return x < 0n || x > 255n;
      case Uint16:
        return x < 0n || x > 65535n;
      case Uint32:
        return x < 0n || x > 4294967295n;
      case Uint:
      case Uint64:
      case Uintptr:
        return false;
      default:
        throw new Error(
          "reflect: call of reflect.Value.OverflowUint on " + k + " Value"
        );
    }
  }
  // OverflowFloat reports whether the float64 x cannot be represented by v's type
  OverflowFloat(x) {
    const k = this.Kind();
    if (k === Float32) {
      const f32max = 34028234663852886e22;
      return Math.abs(x) > f32max && !isNaN(x) && !!isFinite(x);
    }
    if (k === Float64) {
      return false;
    }
    throw new Error(
      "reflect: call of reflect.Value.OverflowFloat on " + k + " Value"
    );
  }
};
var BasicType = class {
  constructor(_kind, _name, _size = 8, _typeName = "", _methods = []) {
    this._kind = _kind;
    this._name = _name;
    this._size = _size;
    this._typeName = _typeName;
    this._methods = _methods;
  }
  _kind;
  _name;
  _size;
  _typeName;
  _methods;
  String() {
    return goTypeString(this.runtimeString());
  }
  runtimeString() {
    return this._typeName || this._name;
  }
  Kind() {
    return this._kind;
  }
  underlyingName() {
    return Kind_String(this._kind);
  }
  Comparable() {
    return this._kind !== Func && this._kind !== Map2 && this._kind !== Slice;
  }
  Size() {
    return this._size;
  }
  Elem() {
    throw new Error(`reflect: Elem of invalid type ${this._name}`);
  }
  NumField() {
    return 0;
  }
  NumIn() {
    return nonFunctionTypePanic("NumIn", this);
  }
  In(_i) {
    return nonFunctionTypePanic("In", this);
  }
  NumOut() {
    return nonFunctionTypePanic("NumOut", this);
  }
  Out(_i) {
    return nonFunctionTypePanic("Out", this);
  }
  IsVariadic() {
    return nonFunctionTypePanic("IsVariadic", this);
  }
  PkgPath() {
    return this._typeName ? typePackagePath(this._typeName) : "";
  }
  Name() {
    if (this._typeName) {
      return typeNameName(this._typeName);
    }
    return this._name;
  }
  Field(_i) {
    throw new Error(`reflect: Field of non-struct type ${this._name}`);
  }
  FieldByIndex(index2) {
    return typeFieldByIndex(this, index2);
  }
  FieldByName(name) {
    return typeFieldByName(this, name);
  }
  FieldByNameFunc(match) {
    return typeFieldByNameFunc(this, match);
  }
  Key() {
    throw new Error(`reflect: Key of non-map type ${this._name}`);
  }
  Implements(u) {
    if (!u) {
      return false;
    }
    if (u.Kind() !== Interface) {
      throw new Error("reflect: non-interface type passed to Type.Implements");
    }
    return typeImplementsInterface(this, u);
  }
  AssignableTo(u) {
    return typeAssignableTo(this, u);
  }
  ConvertibleTo(u) {
    return typeConvertibleTo(this, u);
  }
  common() {
    return new rtype(this._kind);
  }
  OverflowInt(x) {
    const k = this._kind;
    switch (k) {
      case Int8:
        return x < -128n || x > 127n;
      case Int16:
        return x < -32768n || x > 32767n;
      case Int32:
        return x < -2147483648n || x > 2147483647n;
      case Int:
      case Int64:
        return false;
      default:
        throw new Error(
          "reflect: call of reflect.Type.OverflowInt on " + Kind_String(k) + " Type"
        );
    }
  }
  OverflowUint(x) {
    const k = this._kind;
    switch (k) {
      case Uint8:
        return x < 0n || x > 255n;
      case Uint16:
        return x < 0n || x > 65535n;
      case Uint32:
        return x < 0n || x > 4294967295n;
      case Uint:
      case Uint64:
      case Uintptr:
        return false;
      default:
        throw new Error(
          "reflect: call of reflect.Type.OverflowUint on " + Kind_String(k) + " Type"
        );
    }
  }
  OverflowFloat(x) {
    const k = this._kind;
    if (k === Float32) {
      const f32max = 34028234663852886e22;
      return Math.abs(x) > f32max && !isNaN(x) && !!isFinite(x);
    }
    if (k === Float64) {
      return false;
    }
    throw new Error(
      "reflect: call of reflect.Type.OverflowFloat on " + Kind_String(k) + " Type"
    );
  }
  Methods() {
    return typeMethodsSeq(this);
  }
  Fields() {
    return typeFieldsSeq(this);
  }
  Ins() {
    return typeInsSeq(this);
  }
  Outs() {
    return typeOutsSeq(this);
  }
  NumMethod() {
    return typeMethods(this).length;
  }
  Method(i) {
    return typeMethod(this, i);
  }
  MethodByName(name) {
    return typeMethodByName(this, name);
  }
  methodSignatures() {
    return this._methods;
  }
  mergeMethodSignatures(methods) {
    this._methods = mergeMethodSignatureList(this._methods, methods);
  }
  Len() {
    throw new Error(
      "reflect: call of reflect.Type.Len on " + Kind_String(this._kind) + " Type"
    );
  }
  Bits() {
    const k = this._kind;
    switch (k) {
      case Bool:
        return 1;
      case Int8:
      case Uint8:
        return 8;
      case Int16:
      case Uint16:
        return 16;
      case Int32:
      case Uint32:
      case Float32:
        return 32;
      case Int64:
      case Uint64:
      case Float64:
        return 64;
      case Complex64:
        return 64;
      case Complex128:
        return 128;
      case Int:
      case Uint:
      case Uintptr:
        return 64;
      // Assuming 64-bit architecture
      default:
        throw new Error(
          "reflect: call of reflect.Type.Bits on " + Kind_String(k) + " Type"
        );
    }
  }
  ChanDir() {
    return nonChanTypePanic(this);
  }
  CanSeq() {
    return typeCanSeq(this);
  }
  CanSeq2() {
    return typeCanSeq2(this);
  }
};
var SliceType = class {
  constructor(_elemType, _typeName = "") {
    this._elemType = _elemType;
    this._typeName = _typeName;
  }
  _elemType;
  _typeName;
  String() {
    return goTypeString(this.runtimeString());
  }
  runtimeString() {
    return this._typeName || "[]" + runtimeTypeString(this._elemType);
  }
  Kind() {
    return Slice;
  }
  Comparable() {
    return false;
  }
  Size() {
    return 24;
  }
  Elem() {
    return this._elemType;
  }
  NumField() {
    return 0;
  }
  NumIn() {
    return nonFunctionTypePanic("NumIn", this);
  }
  In(_i) {
    return nonFunctionTypePanic("In", this);
  }
  NumOut() {
    return nonFunctionTypePanic("NumOut", this);
  }
  Out(_i) {
    return nonFunctionTypePanic("Out", this);
  }
  IsVariadic() {
    return nonFunctionTypePanic("IsVariadic", this);
  }
  PkgPath() {
    return this._typeName ? typePackagePath(this._typeName) : "";
  }
  Name() {
    if (!this._typeName) return "";
    return typeNameName(this._typeName);
  }
  Field(_i) {
    throw new Error("reflect: Field of non-struct type");
  }
  FieldByIndex(index2) {
    return typeFieldByIndex(this, index2);
  }
  FieldByName(name) {
    return typeFieldByName(this, name);
  }
  FieldByNameFunc(match) {
    return typeFieldByNameFunc(this, match);
  }
  Key() {
    throw new Error("reflect: Key of non-map type");
  }
  Implements(u) {
    if (!u) {
      return false;
    }
    if (u.Kind() !== Interface) {
      throw new Error("reflect: non-interface type passed to Type.Implements");
    }
    return typeImplementsInterface(this, u);
  }
  AssignableTo(u) {
    return typeAssignableTo(this, u);
  }
  ConvertibleTo(u) {
    return typeConvertibleTo(this, u);
  }
  OverflowInt(_x) {
    throw new Error("reflect: call of reflect.Type.OverflowInt on slice Type");
  }
  OverflowUint(_x) {
    throw new Error("reflect: call of reflect.Type.OverflowUint on slice Type");
  }
  OverflowFloat(_x) {
    throw new Error("reflect: call of reflect.Type.OverflowFloat on slice Type");
  }
  Methods() {
    return typeMethodsSeq(this);
  }
  Fields() {
    return typeFieldsSeq(this);
  }
  Ins() {
    return typeInsSeq(this);
  }
  Outs() {
    return typeOutsSeq(this);
  }
  NumMethod() {
    return typeMethods(this).length;
  }
  Method(i) {
    return typeMethod(this, i);
  }
  MethodByName(name) {
    return typeMethodByName(this, name);
  }
  Len() {
    throw new Error("reflect: call of reflect.Type.Len on slice Type");
  }
  Bits() {
    throw new Error("reflect: call of reflect.Type.Bits on slice Type");
  }
  ChanDir() {
    return nonChanTypePanic(this);
  }
  CanSeq() {
    return typeCanSeq(this);
  }
  CanSeq2() {
    return typeCanSeq2(this);
  }
};
var ArrayType = class {
  constructor(_elemType, _len, _typeName = "") {
    this._elemType = _elemType;
    this._len = _len;
    this._typeName = _typeName;
  }
  _elemType;
  _len;
  _typeName;
  String() {
    return goTypeString(this.runtimeString());
  }
  runtimeString() {
    return this._typeName || `[${this._len}]${runtimeTypeString(this._elemType)}`;
  }
  Kind() {
    return Array2;
  }
  Comparable() {
    return this._elemType.Comparable();
  }
  Size() {
    return this._elemType.Size() * this._len;
  }
  Elem() {
    return this._elemType;
  }
  NumField() {
    return 0;
  }
  NumIn() {
    return nonFunctionTypePanic("NumIn", this);
  }
  In(_i) {
    return nonFunctionTypePanic("In", this);
  }
  NumOut() {
    return nonFunctionTypePanic("NumOut", this);
  }
  Out(_i) {
    return nonFunctionTypePanic("Out", this);
  }
  IsVariadic() {
    return nonFunctionTypePanic("IsVariadic", this);
  }
  Len() {
    return this._len;
  }
  PkgPath() {
    return typePackagePath(this._typeName);
  }
  Name() {
    return typeNameName(this._typeName);
  }
  Field(_i) {
    throw new Error("reflect: Field of non-struct type");
  }
  FieldByIndex(index2) {
    return typeFieldByIndex(this, index2);
  }
  FieldByName(name) {
    return typeFieldByName(this, name);
  }
  FieldByNameFunc(match) {
    return typeFieldByNameFunc(this, match);
  }
  Key() {
    throw new Error("reflect: Key of non-map type");
  }
  Implements(u) {
    if (!u) {
      return false;
    }
    if (u.Kind() !== Interface) {
      throw new Error("reflect: non-interface type passed to Type.Implements");
    }
    return typeImplementsInterface(this, u);
  }
  AssignableTo(u) {
    return typeAssignableTo(this, u);
  }
  ConvertibleTo(u) {
    return typeConvertibleTo(this, u);
  }
  common() {
    return new rtype(this.Kind());
  }
  OverflowInt(_x) {
    throw new Error("reflect: call of reflect.Type.OverflowInt on array Type");
  }
  OverflowUint(_x) {
    throw new Error("reflect: call of reflect.Type.OverflowUint on array Type");
  }
  OverflowFloat(_x) {
    throw new Error("reflect: call of reflect.Type.OverflowFloat on array Type");
  }
  Methods() {
    return typeMethodsSeq(this);
  }
  Fields() {
    return typeFieldsSeq(this);
  }
  Ins() {
    return typeInsSeq(this);
  }
  Outs() {
    return typeOutsSeq(this);
  }
  NumMethod() {
    return typeMethods(this).length;
  }
  Method(i) {
    return typeMethod(this, i);
  }
  MethodByName(name) {
    return typeMethodByName(this, name);
  }
  Bits() {
    throw new Error("reflect: call of reflect.Type.Bits on array Type");
  }
  ChanDir() {
    return nonChanTypePanic(this);
  }
  CanSeq() {
    return typeCanSeq(this);
  }
  CanSeq2() {
    return typeCanSeq2(this);
  }
};
var PointerType = class {
  constructor(_elemType, _methods = []) {
    this._elemType = _elemType;
    this._methods = _methods;
  }
  _elemType;
  _methods;
  String() {
    return goTypeString(this.runtimeString());
  }
  runtimeString() {
    return "*" + runtimeTypeString(this._elemType);
  }
  Kind() {
    return Ptr;
  }
  Comparable() {
    return true;
  }
  Size() {
    return 8;
  }
  Elem() {
    return this._elemType;
  }
  NumField() {
    return 0;
  }
  NumIn() {
    return nonFunctionTypePanic("NumIn", this);
  }
  In(_i) {
    return nonFunctionTypePanic("In", this);
  }
  NumOut() {
    return nonFunctionTypePanic("NumOut", this);
  }
  Out(_i) {
    return nonFunctionTypePanic("Out", this);
  }
  IsVariadic() {
    return nonFunctionTypePanic("IsVariadic", this);
  }
  PkgPath() {
    return "";
  }
  Name() {
    return "";
  }
  Field(_i) {
    throw new Error("reflect: Field of non-struct type");
  }
  FieldByIndex(index2) {
    return typeFieldByIndex(this, index2);
  }
  FieldByName(name) {
    return typeFieldByName(this, name);
  }
  FieldByNameFunc(match) {
    return typeFieldByNameFunc(this, match);
  }
  Key() {
    throw new Error("reflect: Key of non-map type");
  }
  Implements(u) {
    if (!u) {
      return false;
    }
    if (u.Kind() !== Interface) {
      throw new Error("reflect: non-interface type passed to Type.Implements");
    }
    return typeImplementsInterface(this, u);
  }
  AssignableTo(u) {
    return typeAssignableTo(this, u);
  }
  ConvertibleTo(u) {
    return typeConvertibleTo(this, u);
  }
  common() {
    return new rtype(this.Kind());
  }
  OverflowInt(_x) {
    throw new Error("reflect: call of reflect.Type.OverflowInt on pointer Type");
  }
  OverflowUint(_x) {
    throw new Error(
      "reflect: call of reflect.Type.OverflowUint on pointer Type"
    );
  }
  OverflowFloat(_x) {
    throw new Error(
      "reflect: call of reflect.Type.OverflowFloat on pointer Type"
    );
  }
  Methods() {
    return typeMethodsSeq(this);
  }
  Fields() {
    return typeFieldsSeq(this);
  }
  Ins() {
    return typeInsSeq(this);
  }
  Outs() {
    return typeOutsSeq(this);
  }
  NumMethod() {
    return typeMethods(this).length;
  }
  Method(i) {
    return typeMethod(this, i);
  }
  MethodByName(name) {
    return typeMethodByName(this, name);
  }
  methodSignatures() {
    return this._methods;
  }
  mergeMethodSignatures(methods) {
    this._methods = mergeMethodSignatureList(this._methods, methods);
  }
  Len() {
    throw new Error("reflect: call of reflect.Type.Len on pointer Type");
  }
  Bits() {
    throw new Error("reflect: call of reflect.Type.Bits on pointer Type");
  }
  ChanDir() {
    return nonChanTypePanic(this);
  }
  CanSeq() {
    return typeCanSeq(this);
  }
  CanSeq2() {
    return typeCanSeq2(this);
  }
};
var FunctionType = class {
  _name;
  _signature;
  _params;
  _results;
  _variadic;
  _hasSignature;
  _methods;
  constructor(signatureOrDescriptor) {
    if (typeof signatureOrDescriptor === "string") {
      this._name = "";
      this._signature = signatureOrDescriptor;
      this._params = [];
      this._results = [];
      this._variadic = false;
      this._hasSignature = false;
      this._methods = [];
      return;
    }
    this._name = signatureOrDescriptor.name ?? "";
    this._params = signatureOrDescriptor.params ?? [];
    this._results = signatureOrDescriptor.results ?? [];
    this._variadic = signatureOrDescriptor.variadic ?? false;
    this._hasSignature = signatureOrDescriptor.signature !== void 0 || signatureOrDescriptor.params !== void 0 || signatureOrDescriptor.results !== void 0;
    this._methods = signatureOrDescriptor.methods ?? [];
    this._signature = signatureOrDescriptor.signature ?? formatFunctionSignature(this._params, this._results, this._variadic);
  }
  String() {
    return goTypeString(this.runtimeString());
  }
  runtimeString() {
    return this._name !== "" ? this._name : this._signature;
  }
  Kind() {
    return Func;
  }
  Comparable() {
    return false;
  }
  Size() {
    return 8;
  }
  Elem() {
    throw new Error("reflect: Elem of invalid type");
  }
  NumField() {
    return 0;
  }
  NumIn() {
    return this._params.length;
  }
  In(i) {
    if (i < 0 || i >= this._params.length) {
      throw new Error(
        `reflect: In index out of range [${i}] with length ${this._params.length}`
      );
    }
    return this._params[i];
  }
  NumOut() {
    return this._results.length;
  }
  Out(i) {
    if (i < 0 || i >= this._results.length) {
      throw new Error(
        `reflect: Out index out of range [${i}] with length ${this._results.length}`
      );
    }
    return this._results[i];
  }
  IsVariadic() {
    return this._variadic;
  }
  PkgPath() {
    return this._name !== "" ? typePackagePath(this._name) : "";
  }
  Name() {
    if (this._name !== "") {
      return typeNameName(this._name);
    }
    return "";
  }
  Field(_i) {
    throw new Error("reflect: Field of non-struct type");
  }
  FieldByIndex(index2) {
    return typeFieldByIndex(this, index2);
  }
  FieldByName(name) {
    return typeFieldByName(this, name);
  }
  FieldByNameFunc(match) {
    return typeFieldByNameFunc(this, match);
  }
  Key() {
    throw new Error("reflect: Key of non-map type");
  }
  Implements(u) {
    if (!u) {
      return false;
    }
    if (u.Kind() !== Interface) {
      throw new Error("reflect: non-interface type passed to Type.Implements");
    }
    return typeImplementsInterface(this, u);
  }
  AssignableTo(u) {
    return typeAssignableTo(this, u);
  }
  ConvertibleTo(u) {
    return typeConvertibleTo(this, u);
  }
  common() {
    return new rtype(this.Kind());
  }
  OverflowInt(_x) {
    throw new Error("reflect: call of reflect.Type.OverflowInt on func Type");
  }
  OverflowUint(_x) {
    throw new Error("reflect: call of reflect.Type.OverflowUint on func Type");
  }
  OverflowFloat(_x) {
    throw new Error("reflect: call of reflect.Type.OverflowFloat on func Type");
  }
  Methods() {
    return typeMethodsSeq(this);
  }
  Fields() {
    return typeFieldsSeq(this);
  }
  Ins() {
    return typeInsSeq(this);
  }
  Outs() {
    return typeOutsSeq(this);
  }
  NumMethod() {
    return typeMethods(this).length;
  }
  Method(i) {
    return typeMethod(this, i);
  }
  MethodByName(name) {
    return typeMethodByName(this, name);
  }
  methodSignatures() {
    return this._methods;
  }
  mergeMethodSignatures(methods) {
    this._methods = mergeMethodSignatureList(this._methods, methods);
  }
  mergeSignature(source) {
    if (!source._hasSignature || this._hasSignature) {
      return;
    }
    this._params = source._params;
    this._results = source._results;
    this._variadic = source._variadic;
    this._signature = source._signature;
    this._hasSignature = true;
  }
  Len() {
    throw new Error("reflect: call of reflect.Type.Len on func Type");
  }
  Bits() {
    throw new Error("reflect: call of reflect.Type.Bits on func Type");
  }
  ChanDir() {
    return nonChanTypePanic(this);
  }
  CanSeq() {
    return typeCanSeq(this);
  }
  CanSeq2() {
    return typeCanSeq2(this);
  }
};
function formatFunctionSignature(params, results, variadic) {
  const paramStrings = params.map((param, index2) => {
    const typeName = runtimeTypeString(param);
    if (!variadic || index2 !== params.length - 1) {
      return typeName;
    }
    if (typeName.startsWith("[]")) {
      return "..." + typeName.slice(2);
    }
    return "..." + typeName;
  });
  let signature = `func(${paramStrings.join(", ")})`;
  if (results.length === 1) {
    signature += ` ${runtimeTypeString(results[0])}`;
  } else if (results.length > 1) {
    signature += ` (${results.map((result) => runtimeTypeString(result)).join(", ")})`;
  }
  return signature;
}
async function callReflectFunction(fn, fnType, inArgs, op) {
  const args = asArray(inArgs);
  const rawArgs = reflectCallRawArgs(fnType, args, op);
  const result = await reflectTwin(fn)(...rawArgs);
  return normalizeReflectCallResults(fnType, result);
}
function reflectCallRawArgs(fnType, args, op) {
  if (op === "CallSlice") {
    return reflectCallSliceRawArgs(fnType, args);
  }
  if (!fnType.IsVariadic()) {
    validateReflectCallInputCount(fnType, args.length);
    return args.map(
      (arg, index2) => reflectCallValueInterface(op, arg, fnType.In(index2), index2)
    );
  }
  const fixedCount = fnType.NumIn() - 1;
  if (args.length < fixedCount) {
    throw new Error("reflect: Call with too few input arguments");
  }
  const rawArgs = [];
  for (let i = 0; i < fixedCount; i++) {
    rawArgs.push(reflectCallValueInterface(op, args[i], fnType.In(i), i));
  }
  const variadicElemType = fnType.In(fixedCount).Elem();
  const variadicValues = args.slice(fixedCount);
  for (let i = 0; i < variadicValues.length; i++) {
    const value = variadicValues[i];
    if (!value.IsValid()) {
      throw new Error(`reflect: ${op} using zero Value argument`);
    }
    if (!value.Type().AssignableTo(variadicElemType)) {
      throw new Error(
        `reflect: cannot use ${value.Type().String()} as type ${variadicElemType.String()} in ${op}`
      );
    }
  }
  rawArgs.push(
    arrayToSlice(
      variadicValues.map((value) => valueForTarget(value, variadicElemType))
    )
  );
  return rawArgs;
}
function reflectCallSliceRawArgs(fnType, args) {
  if (!fnType.IsVariadic()) {
    throw new Error("reflect: CallSlice of non-variadic function");
  }
  const expected = fnType.NumIn();
  if (args.length < expected) {
    throw new Error("reflect: CallSlice with too few input arguments");
  }
  if (args.length > expected) {
    throw new Error("reflect: CallSlice with too many input arguments");
  }
  return args.map(
    (arg, index2) => reflectCallValueInterface("CallSlice", arg, fnType.In(index2), index2)
  );
}
function reflectCallValueInterface(op, value, target, _index) {
  if (!value.IsValid()) {
    throw new Error(`reflect: ${op} using zero Value argument`);
  }
  if (!value.Type().AssignableTo(target)) {
    throw new Error(
      `reflect: ${op} using ${value.Type().String()} as type ${target.String()}`
    );
  }
  return valueForTarget(value, target);
}
function validateReflectCallInputCount(fnType, actual) {
  const expected = fnType.NumIn();
  if (actual !== expected) {
    throw new Error(
      `reflect: Call with ${actual} input arguments for function with ${expected} inputs`
    );
  }
}
function normalizeReflectCallResults(fnType, result) {
  const expected = fnType.NumOut();
  if (expected === 0) {
    if (result !== void 0) {
      throw new Error(
        "reflect: Call returned 1 results for function with 0 outputs"
      );
    }
    return makeSlice(0);
  }
  if (expected === 1) {
    return arrayToSlice([new Value2(result, fnType.Out(0))]);
  }
  if (!globalThis.Array.isArray(result)) {
    throw new Error(
      `reflect: Call returned 1 results for function with ${expected} outputs`
    );
  }
  if (result.length !== expected) {
    throw new Error(
      `reflect: Call returned ${result.length} results for function with ${expected} outputs`
    );
  }
  return arrayToSlice(
    result.map(
      (value, index2) => new Value2(value, fnType.Out(index2))
    )
  );
}
function MakeFunc(typ, fn) {
  if (!typ || typ.Kind() !== Func) {
    throw new Error("reflect: call of MakeFunc with non-Func type");
  }
  if (typeof fn !== "function") {
    throw new Error("reflect.MakeFunc: nil implementation");
  }
  const typeInfo = functionTypeInfoFromType(typ);
  const wrapper = functionValue(async (...rawArgs) => {
    const args = makeFuncArgs(typ, rawArgs);
    const resultValues = asArray(await fn(arrayToSlice(args)));
    validateMakeFuncResults(typ, resultValues);
    if (typ.NumOut() === 0) {
      return void 0;
    }
    if (typ.NumOut() === 1) {
      return valueForTarget(resultValues[0], typ.Out(0));
    }
    return resultValues.map(
      (value, index2) => valueForTarget(value, typ.Out(index2))
    );
  }, typeInfo);
  return new Value2(wrapper, typ);
}
function makeFuncArgs(typ, rawArgs) {
  validateReflectCallInputCount(typ, rawArgs.length);
  return rawArgs.map((arg, index2) => {
    const target = typ.In(index2);
    if (target.Kind() !== Interface) {
      return new Value2(arg, target);
    }
    const value = ValueOf(arg);
    if (!value.Type().AssignableTo(target)) {
      throw new Error(
        `reflect.MakeFunc: cannot use ${value.Type().String()} as type ${target.String()} in argument ${index2}`
      );
    }
    return value;
  });
}
function validateMakeFuncResults(typ, resultValues) {
  const expected = typ.NumOut();
  if (resultValues.length !== expected) {
    throw new Error(
      `reflect.MakeFunc: returned ${resultValues.length} results for function with ${expected} outputs`
    );
  }
  for (let i = 0; i < resultValues.length; i++) {
    const result = resultValues[i];
    if (!result.IsValid()) {
      throw new Error(`reflect.MakeFunc: returned zero Value for result ${i}`);
    }
    const target = typ.Out(i);
    if (!result.Type().AssignableTo(target)) {
      throw new Error(
        `reflect.MakeFunc: cannot use ${result.Type().String()} as type ${target.String()} in result ${i}`
      );
    }
  }
}
function interfaceStoreValue(x, target) {
  if (target.Kind() === Interface && x.Kind() !== Interface) {
    return x.Interface();
  }
  return x.value;
}
function valueForTarget(value, target) {
  const raw = value.Interface();
  if (target.Kind() === Interface) {
    return raw;
  }
  return unwrapGoInterfaceBox(raw);
}
function unwrapGoInterfaceBox(value) {
  if (value !== null && value !== void 0 && typeof value === "object" && "__goValue" in value) {
    return value.__goValue;
  }
  return value;
}
function genericMethodCall(method, receiver, declared, instance) {
  const fixedArgs = (declared?.args.length ?? 0) - (declared?.variadic ? 1 : 0);
  const params = [];
  for (let i = 0; i < fixedArgs; i++) {
    params.push(typeArgumentType(declared?.args[i], instance?.args[i]));
  }
  const results = (declared?.returns ?? []).map(
    (result, i) => typeArgumentType(result, instance?.returns[i])
  );
  if (!params.some(Boolean) && !results.some(Boolean)) {
    return (...args) => method(receiver, ...args);
  }
  const box = (value, i) => results[i] ? new Value2(value, results[i]).Interface() : value;
  const boxResults = (out) => results.length > 1 ? out.map((value, i) => box(value, i)) : box(out, 0);
  return (...args) => {
    const unboxed = args.map(
      (arg, i) => params[i] ? unwrapGoInterfaceBox(arg) : arg
    );
    const out = method(receiver, ...unboxed);
    return out instanceof Promise ? out.then(boxResults) : boxResults(out);
  };
}
function typeArgumentType(declared, instance) {
  if (declared === void 0 || instance === void 0) {
    return void 0;
  }
  const t = typeFromTypeInfo(instance.type);
  if (typeFromTypeInfo(declared.type).Kind() !== Interface) {
    return void 0;
  }
  return t.Kind() !== Interface ? t : void 0;
}
var boxingInfos = /* @__PURE__ */ new WeakMap();
function boxingInfo(t) {
  const version = typeRegistryVersion();
  const cached = boxingInfos.get(t);
  if (cached !== void 0 && cached[0] === version) {
    return cached[1];
  }
  const typeInfo = typeInfoFromReflectType(t);
  const typeString = runtimeTypeString(t);
  const elemType = t.Kind() === Ptr ? t.Elem() : null;
  const info = {
    typeInfo,
    typeString,
    namedType: t.Name() !== "" && (t.PkgPath() !== "" || typeString.includes(".")),
    elemType,
    namedElemType: elemType !== null && elemType.Name() !== "" && (elemType.PkgPath() !== "" || runtimeTypeString(elemType).includes("."))
  };
  boxingInfos.set(t, [version, info]);
  return info;
}
function genericInstanceMethodSet(typ, value) {
  const kind = typ.Kind();
  if (kind !== Struct && (kind !== Ptr || typ.Elem().Kind() !== Struct)) {
    return void 0;
  }
  const target = isVarRef(value) ? value.value : value;
  const sets = genericInstanceMethods(target);
  if (sets === void 0) {
    return void 0;
  }
  return kind === Ptr ? sets.pointer : sets.value;
}
var MapType = class {
  constructor(_keyType, _elemType, _typeName = "") {
    this._keyType = _keyType;
    this._elemType = _elemType;
    this._typeName = _typeName;
  }
  _keyType;
  _elemType;
  _typeName;
  String() {
    return goTypeString(this.runtimeString());
  }
  runtimeString() {
    return this._typeName || `map[${runtimeTypeString(this._keyType)}]${runtimeTypeString(this._elemType)}`;
  }
  Kind() {
    return Map2;
  }
  Comparable() {
    return false;
  }
  Size() {
    return 8;
  }
  Elem() {
    return this._elemType;
  }
  NumField() {
    return 0;
  }
  NumIn() {
    return nonFunctionTypePanic("NumIn", this);
  }
  In(_i) {
    return nonFunctionTypePanic("In", this);
  }
  NumOut() {
    return nonFunctionTypePanic("NumOut", this);
  }
  Out(_i) {
    return nonFunctionTypePanic("Out", this);
  }
  IsVariadic() {
    return nonFunctionTypePanic("IsVariadic", this);
  }
  Key() {
    return this._keyType;
  }
  PkgPath() {
    return typePackagePath(this._typeName);
  }
  Name() {
    return typeNameName(this._typeName);
  }
  Field(_i) {
    throw new Error("reflect: Field of non-struct type");
  }
  FieldByIndex(index2) {
    return typeFieldByIndex(this, index2);
  }
  FieldByName(name) {
    return typeFieldByName(this, name);
  }
  FieldByNameFunc(match) {
    return typeFieldByNameFunc(this, match);
  }
  Implements(u) {
    if (!u) {
      return false;
    }
    if (u.Kind() !== Interface) {
      throw new Error("reflect: non-interface type passed to Type.Implements");
    }
    return typeImplementsInterface(this, u);
  }
  AssignableTo(u) {
    return typeAssignableTo(this, u);
  }
  ConvertibleTo(u) {
    return typeConvertibleTo(this, u);
  }
  common() {
    return new rtype(this.Kind());
  }
  OverflowInt(_x) {
    throw new Error("reflect: call of reflect.Type.OverflowInt on map Type");
  }
  OverflowUint(_x) {
    throw new Error("reflect: call of reflect.Type.OverflowUint on map Type");
  }
  OverflowFloat(_x) {
    throw new Error("reflect: call of reflect.Type.OverflowFloat on map Type");
  }
  Methods() {
    return typeMethodsSeq(this);
  }
  Fields() {
    return typeFieldsSeq(this);
  }
  Ins() {
    return typeInsSeq(this);
  }
  Outs() {
    return typeOutsSeq(this);
  }
  NumMethod() {
    return typeMethods(this).length;
  }
  Method(i) {
    return typeMethod(this, i);
  }
  MethodByName(name) {
    return typeMethodByName(this, name);
  }
  Len() {
    throw new Error("reflect: call of reflect.Type.Len on map Type");
  }
  Bits() {
    throw new Error("reflect: call of reflect.Type.Bits on map Type");
  }
  ChanDir() {
    return nonChanTypePanic(this);
  }
  CanSeq() {
    return typeCanSeq(this);
  }
  CanSeq2() {
    return typeCanSeq2(this);
  }
};
function typeImplementsInterface(t, interfaceType) {
  if (interfaceType.Kind() !== Interface) {
    throw new Error("reflect: non-interface type passed to Type.Implements");
  }
  const requiredMethods = typeMethods(interfaceType);
  if (requiredMethods.length === 0) {
    return true;
  }
  const methods = typeMethods(t);
  return requiredMethods.every((requiredMethod) => {
    const method = methods.find(
      (candidate) => candidate.name === requiredMethod.name
    );
    return method !== void 0 && methodSignatureIdentical(method, requiredMethod);
  });
}
function methodSignatureIdentical(actual, required) {
  return methodArgListIdentical(actual.args, required.args) && methodArgListIdentical(actual.returns, required.returns);
}
function methodArgListIdentical(actual, required) {
  if (actual.length !== required.length) {
    return false;
  }
  return actual.every(
    (arg, index2) => methodArgIdentityKey(arg) === methodArgIdentityKey(required[index2])
  );
}
function methodArgIdentityKey(arg) {
  return typeInfoIdentityKey(arg.type, /* @__PURE__ */ new Set());
}
function methodSignatureIdentityKey(method) {
  const args = method.args.map(methodArgIdentityKey).join(",");
  const returns = method.returns.map(methodArgIdentityKey).join(",");
  return `${method.name}(${args})(${returns})`;
}
function mergeMethodSignatureList(existing, incoming) {
  if (incoming.length === 0) {
    return existing;
  }
  const merged = [...existing];
  for (const method of incoming) {
    const existingIndex = merged.findIndex(
      (candidate) => candidate.name === method.name
    );
    if (existingIndex === -1) {
      merged.push(method);
      continue;
    }
    if (methodSignatureIdentityKey(merged[existingIndex]) !== methodSignatureIdentityKey(method)) {
      merged[existingIndex] = method;
    }
  }
  return merged.sort((left, right) => stringCompare(left.name, right.name));
}
function typeInfoIdentityKey(info, seen) {
  if (isGoErrorTypeInfo(info)) {
    info = "error";
  }
  if (typeof info === "string") {
    const registered = getTypeByName(info);
    if (!registered) {
      return `named:${info}`;
    }
    const registeredName = registered.name ?? info;
    if (registeredName !== "") {
      return `named:${registeredName}`;
    }
    if (seen.has(info)) {
      return `named:${info}`;
    }
    seen.add(info);
    const key = typeInfoIdentityKey(registered, seen);
    seen.delete(info);
    return key;
  }
  switch (info.kind) {
    case "basic" /* Basic */:
      if (info.typeName) {
        return `named:${info.typeName}`;
      }
      return `basic:${info.name ?? "unknown"}`;
    case "interface" /* Interface */:
      if (info.name) {
        return `named:${info.name}`;
      }
      return `interface:${(info.methods ?? []).map(methodSignatureIdentityKey).join("|")}`;
    case "struct" /* Struct */:
      if (info.name) {
        return `named:${info.name}`;
      }
      return `struct:${(info.fields ?? []).map(
        (field) => [
          field.name,
          field.pkgPath ?? "",
          field.tag ?? "",
          field.anonymous === true ? "anonymous" : "named",
          typeInfoIdentityKey(field.type, seen)
        ].join("\0")
      ).join("")}`;
    case "pointer" /* Pointer */:
      return `ptr:${typeInfoIdentityKey(
        info.elemType ?? { kind: "basic" /* Basic */, name: "unknown" },
        seen
      )}`;
    case "slice" /* Slice */:
      return `slice:${typeInfoIdentityKey(
        info.elemType ?? { kind: "basic" /* Basic */, name: "unknown" },
        seen
      )}`;
    case "array" /* Array */:
      return `array:${info.length}:${typeInfoIdentityKey(
        info.elemType ?? { kind: "basic" /* Basic */, name: "unknown" },
        seen
      )}`;
    case "map" /* Map */:
      return `map:${typeInfoIdentityKey(
        info.keyType ?? { kind: "basic" /* Basic */, name: "unknown" },
        seen
      )}:${typeInfoIdentityKey(
        info.elemType ?? { kind: "basic" /* Basic */, name: "unknown" },
        seen
      )}`;
    case "function" /* Function */:
      if (info.name) {
        return `named:${info.name}`;
      }
      return `func:${info.isVariadic === true}:${(info.params ?? []).map((param) => typeInfoIdentityKey(param, seen)).join(",")}:${(info.results ?? []).map((result) => typeInfoIdentityKey(result, seen)).join(",")}`;
    case "channel" /* Channel */:
      return `chan:${info.direction ?? "both"}:${typeInfoIdentityKey(
        info.elemType ?? { kind: "basic" /* Basic */, name: "unknown" },
        seen
      )}`;
    default:
      return "unknown";
  }
}
function typeFieldByName(t, name) {
  return typeFieldByNameFunc(t, (fieldName) => fieldName === name);
}
function typeFieldByNameFunc(t, match) {
  if (t.Kind() !== Struct) {
    throw new Error("reflect: FieldByName of non-struct type");
  }
  for (const field of visibleStructFields(t)) {
    if (match(field.Name)) {
      return [field, true];
    }
  }
  return [new StructField(), false];
}
function visibleStructFields(t) {
  const fields = [];
  const byName = new globalThis.Map();
  const visiting = /* @__PURE__ */ new Set();
  const index2 = [];
  const walk = (typ) => {
    if (visiting.has(typ)) {
      return;
    }
    visiting.add(typ);
    for (let i = 0; i < typ.NumField(); i++) {
      const field = typ.Field(i).clone();
      index2.push(i);
      let add = true;
      const oldIndex = byName.get(field.Name);
      if (oldIndex !== void 0) {
        const old = fields[oldIndex];
        if (index2.length === len(old.Index)) {
          old.Name = "";
          add = false;
        } else if (index2.length < len(old.Index)) {
          old.Name = "";
        } else {
          add = false;
        }
      }
      if (add) {
        field.Index = arrayToSlice([...index2]);
        byName.set(field.Name, fields.length);
        fields.push(field);
      }
      if (field.Anonymous) {
        let fieldType = field.Type;
        if (fieldType.Kind() === Ptr) {
          fieldType = fieldType.Elem();
        }
        if (fieldType.Kind() === Struct) {
          walk(fieldType);
        }
      }
      index2.pop();
    }
    visiting.delete(typ);
  };
  walk(t);
  return fields.filter((field) => field.Name !== "");
}
function zeroMethod() {
  return new Method({
    Type: new BasicType(Invalid, "<invalid>"),
    Func: new Value2()
  });
}
function methodFromSignature(signature, index2, receiver) {
  const iface = receiver.Kind() === Interface;
  const type = methodTypeFromSignature(signature, receiver, !iface);
  return new Method({
    Name: signature.name,
    Type: type,
    Func: iface ? new Value2() : methodFuncValue(signature.name, receiver, type),
    Index: index2
  });
}
function methodFuncValue(name, receiver, type) {
  const fn = (recv, ...args) => {
    const bound = new Value2(recv, receiver).MethodByName(name).currentValue();
    return bound(...args);
  };
  return new Value2(fn, type);
}
var methodTypes = /* @__PURE__ */ new WeakMap();
function methodTypeFromSignature(signature, receiver, includeReceiver) {
  const version = typeRegistryVersion();
  let cached = methodTypes.get(signature);
  if (cached === void 0 || cached.version !== version) {
    cached = { version, byReceiver: /* @__PURE__ */ new WeakMap() };
    methodTypes.set(signature, cached);
  }
  if (!includeReceiver) {
    cached.bare ??= makeMethodType(signature, receiver, false);
    return cached.bare;
  }
  let typ = cached.byReceiver.get(receiver);
  if (typ === void 0) {
    typ = makeMethodType(signature, receiver, true);
    cached.byReceiver.set(receiver, typ);
  }
  return typ;
}
function makeMethodType(signature, receiver, includeReceiver) {
  const params = signature.args.map(methodArgType);
  if (includeReceiver) {
    params.unshift(receiver);
  }
  return new FunctionType({
    params,
    results: signature.returns.map(methodArgType),
    variadic: signature.variadic === true
  });
}
function methodArgType(arg) {
  return typeFromTypeInfoWithSeen(arg.type, /* @__PURE__ */ new Set());
}
function runtimeTypeString(t) {
  return t.runtimeString !== void 0 ? t.runtimeString() : t.String();
}
function typeNameName(typeName) {
  const bracket = typeName.indexOf("[");
  const baseName = bracket >= 0 ? typeName.substring(0, bracket) : typeName;
  const typeArgs = bracket >= 0 ? typeName.substring(bracket) : "";
  const dotIndex = baseName.lastIndexOf(".");
  return goTypeString(
    (dotIndex >= 0 ? baseName.substring(dotIndex + 1) : baseName) + typeArgs
  );
}
function typeMethods(t) {
  const methods = registeredTypeMethods(t);
  if (t.Kind() === Ptr || !methods.some((m) => m.pointerReceiver === true)) {
    return methods;
  }
  return methods.filter((method) => method.pointerReceiver !== true);
}
function registeredTypeMethods(t) {
  const named = namedValueMethods(runtimeTypeString(t));
  if (named !== void 0) {
    return named.signatures;
  }
  let typeInfo = getTypeByName(runtimeTypeString(t));
  if (!typeInfo && t.Kind() === Ptr) {
    typeInfo = getTypeByName(runtimeTypeString(t.Elem()));
  }
  if (!typeInfo && t instanceof InterfaceType) {
    const registeredName = t.registeredName();
    if (registeredName) {
      typeInfo = getTypeByName(registeredName);
    }
  }
  if (!typeInfo && t instanceof InterfaceType) {
    return t.methodSignatures();
  }
  if (!typeInfo && t instanceof PointerType) {
    return mergeMethodSignatureList(typeMethods(t.Elem()), t.methodSignatures());
  }
  if (!typeInfo && t instanceof BasicType) {
    return t.methodSignatures();
  }
  if (!typeInfo && t instanceof FunctionType) {
    return t.methodSignatures();
  }
  if (!typeInfo) {
    return [];
  }
  if (isInterfaceTypeInfo(typeInfo)) {
    return typeInfo.methods || [];
  }
  if (!isStructTypeInfo(typeInfo)) {
    return [];
  }
  const methods = typeInfo.methods || [];
  if (t.Kind() === Ptr) {
    return methods;
  }
  return methods.filter((method) => !method.pointerReceiver);
}
function methodSignatureByName(t, name) {
  const methods = typeMethods(t);
  const index2 = methods.findIndex((method) => method.name === name);
  if (index2 === -1) {
    return [void 0, -1];
  }
  return [methods[index2], index2];
}
function typeMethod(t, i) {
  const methods = typeMethods(t);
  if (i < 0 || i >= methods.length) {
    throw new Error("reflect: Method index out of range");
  }
  return methodFromSignature(methods[i], i, t);
}
function typeMethodByName(t, name) {
  const [signature, index2] = methodSignatureByName(t, name);
  if (!signature) {
    return [zeroMethod(), false];
  }
  return [methodFromSignature(signature, index2, t), true];
}
function typeAssignableTo(t, u) {
  if (u === null) {
    return false;
  }
  if (t === u) {
    return true;
  }
  if (t.Kind() !== u.Kind()) {
    return u.Kind() === Interface && t.Implements(u);
  }
  if (typeIdentityKey(t) === typeIdentityKey(u)) {
    return true;
  }
  if ((!typeIsNamed(t) || !typeIsNamed(u)) && typeUnderlyingIdentityKey(t) === typeUnderlyingIdentityKey(u)) {
    return true;
  }
  if (u.Kind() !== Interface) {
    return false;
  }
  return t.Implements(u);
}
function typeConvertibleTo(source, target) {
  if (target === null) {
    throw new Error("reflect: nil type passed to Type.ConvertibleTo");
  }
  const from = source.Kind();
  const to2 = target.Kind();
  if (from >= Int && from <= Float64 && to2 >= Int && to2 <= Float64) return true;
  if (from >= Int && from <= Uintptr && to2 === String2) return true;
  if ((from === Complex64 || from === Complex128) && (to2 === Complex64 || to2 === Complex128))
    return true;
  if (from === String2 && to2 === Slice && (target.Elem().Kind() === Uint8 || target.Elem().Kind() === Int32))
    return true;
  if (from === Slice) {
    const element = source.Elem();
    if (to2 === String2 && (element.Kind() === Uint8 || element.Kind() === Int32))
      return true;
    const array = to2 === Ptr ? target.Elem() : target;
    if (array.Kind() === Array2 && typeIdentityKey(element) === typeIdentityKey(array.Elem()))
      return true;
  }
  if (from === Chan && to2 === Chan && channelDirectionFromString(source.String()) === "both" && (!typeIsNamed(source) || !typeIsNamed(target)) && typeIdentityKey(source.Elem()) === typeIdentityKey(target.Elem()))
    return true;
  if (conversionUnderlyingEqual(source, target, new globalThis.Map()))
    return true;
  if (from === Ptr && to2 === Ptr && !typeIsNamed(source) && !typeIsNamed(target) && conversionUnderlyingEqual(
    source.Elem(),
    target.Elem(),
    new globalThis.Map()
  ))
    return true;
  return to2 === Interface && source.Implements(target);
}
function conversionTypeEqual(source, target, seen) {
  return source.Name() === target.Name() && source.PkgPath() === target.PkgPath() && conversionUnderlyingEqual(source, target, seen);
}
function conversionUnderlyingEqual(source, target, seen) {
  if (source === target) return true;
  const kind = source.Kind();
  if (kind !== target.Kind()) return false;
  if (kind >= Bool && kind <= Complex128 || kind === String2 || kind === UnsafePointer)
    return true;
  if (seen.get(source)?.has(target)) return true;
  const targets = seen.get(source) ?? /* @__PURE__ */ new Set();
  targets.add(target);
  seen.set(source, targets);
  switch (kind) {
    case Array2:
      return source.Len() === target.Len() && conversionTypeEqual(source.Elem(), target.Elem(), seen);
    case Chan:
      return channelDirectionFromString(source.String()) === channelDirectionFromString(target.String()) && conversionTypeEqual(source.Elem(), target.Elem(), seen);
    case Ptr:
    case Slice:
      return conversionTypeEqual(source.Elem(), target.Elem(), seen);
    case Map2:
      return conversionTypeEqual(source.Key(), target.Key(), seen) && conversionTypeEqual(source.Elem(), target.Elem(), seen);
    case Func:
      if (source.NumIn() !== target.NumIn() || source.NumOut() !== target.NumOut() || source.IsVariadic() !== target.IsVariadic())
        return false;
      for (let index2 = 0; index2 < source.NumIn(); index2++) {
        if (!conversionTypeEqual(source.In(index2), target.In(index2), seen))
          return false;
      }
      for (let index2 = 0; index2 < source.NumOut(); index2++) {
        if (!conversionTypeEqual(source.Out(index2), target.Out(index2), seen))
          return false;
      }
      return true;
    case Interface:
      return source.NumMethod() === 0 && target.NumMethod() === 0;
    case Struct:
      if (source.NumField() !== target.NumField()) return false;
      for (let index2 = 0; index2 < source.NumField(); index2++) {
        const left = source.Field(index2);
        const right = target.Field(index2);
        if (left.Name !== right.Name || left.PkgPath !== right.PkgPath || left.Anonymous !== right.Anonymous || !conversionTypeEqual(left.Type, right.Type, seen))
          return false;
      }
      return true;
    default:
      return false;
  }
}
function structFieldStorageKey(t, i) {
  if (t instanceof StructType) {
    return t.fieldKey(i);
  }
  return t.Field(i).Name;
}
function typeAlignment(typ) {
  switch (typ.Kind()) {
    case Bool:
    case Int8:
    case Uint8:
      return 1;
    case Int16:
    case Uint16:
      return 2;
    case Int32:
    case Uint32:
    case Float32:
    case Complex64:
      return 4;
    case Array2:
      return typeAlignment(typ.Elem());
    case Struct: {
      let align = 1;
      for (let i = 0; i < typ.NumField(); i++) {
        align = Math.max(align, typeAlignment(typ.Field(i).Type));
      }
      return align;
    }
    default:
      return 8;
  }
}
function alignOffset(offset, alignment) {
  if (alignment <= 1) {
    return offset;
  }
  return Math.ceil(offset / alignment) * alignment;
}
function structDescriptorSize(fields) {
  let size = 0;
  let alignment = 1;
  for (const field of fields) {
    alignment = Math.max(alignment, typeAlignment(field.type));
    size = Math.max(size, field.offset + field.type.Size());
  }
  return alignOffset(size, alignment);
}
var StructType = class _StructType {
  constructor(_name, _fields = [], _pkgPath = "", _string = _name) {
    this._name = _name;
    this._fields = _fields;
    this._pkgPath = _pkgPath;
    this._string = _string;
  }
  _name;
  _fields;
  _pkgPath;
  _string;
  String() {
    return goTypeString(this.runtimeString());
  }
  runtimeString() {
    return this._string;
  }
  Kind() {
    return Struct;
  }
  Comparable() {
    return this._fields.every((field) => field.type.Comparable());
  }
  Size() {
    return structDescriptorSize(this._fields);
  }
  Elem() {
    throw new Error("reflect: Elem of invalid type");
  }
  NumField() {
    return this._fields.length;
  }
  NumIn() {
    return nonFunctionTypePanic("NumIn", this);
  }
  In(_i) {
    return nonFunctionTypePanic("In", this);
  }
  NumOut() {
    return nonFunctionTypePanic("NumOut", this);
  }
  Out(_i) {
    return nonFunctionTypePanic("Out", this);
  }
  IsVariadic() {
    return nonFunctionTypePanic("IsVariadic", this);
  }
  PkgPath() {
    if (this._pkgPath !== "") {
      return this._pkgPath;
    }
    if (this._name === "") {
      return "";
    }
    return typePackagePath(this._name);
  }
  Name() {
    if (this._name === "") {
      return "";
    }
    return typeNameName(this._name);
  }
  Field(i) {
    if (i < 0 || i >= this.NumField()) {
      throw new Error(
        `reflect: Field index out of range [${i}] with length ${this.NumField()}`
      );
    }
    const f = this._fields[i];
    return new StructField({
      Name: f.name,
      PkgPath: f.pkgPath,
      Type: f.type,
      Tag: f.tag ?? "",
      Offset: f.offset,
      Index: [...f.index],
      Anonymous: f.anonymous
    });
  }
  fieldType(i) {
    if (i < 0 || i >= this.NumField()) {
      throw new Error(
        `reflect: Field index out of range [${i}] with length ${this.NumField()}`
      );
    }
    return this._fields[i].type;
  }
  fieldKey(i) {
    if (i < 0 || i >= this.NumField()) {
      throw new Error(
        `reflect: Field index out of range [${i}] with length ${this.NumField()}`
      );
    }
    return this._fields[i].key;
  }
  descriptors() {
    return this._fields.map((field) => ({
      ...field,
      index: [...field.index]
    }));
  }
  replaceDescriptors(fields) {
    this._fields = fields;
  }
  identityKey(seen) {
    if (this._name !== "") {
      return `struct:${this._name}`;
    }
    const fields = this._fields.map(
      (field) => [
        field.name,
        field.pkgPath,
        field.tag ?? "",
        field.anonymous ? "anonymous" : "named",
        typeIdentityKey(field.type, seen)
      ].join("\0")
    ).join("");
    return `struct:${this._pkgPath}:${this._name}:${fields}`;
  }
  underlyingIdentityKey(seen) {
    const fields = this._fields.map(
      (field) => [
        field.name,
        field.pkgPath,
        field.tag ?? "",
        field.anonymous ? "anonymous" : "named",
        typeIdentityKey(field.type, seen)
      ].join("\0")
    ).join("");
    return `struct:${fields}`;
  }
  FieldByIndex(index2) {
    return typeFieldByIndex(this, index2);
  }
  FieldByName(name) {
    return typeFieldByName(this, name);
  }
  FieldByNameFunc(match) {
    return typeFieldByNameFunc(this, match);
  }
  Key() {
    throw new Error("reflect: Key of non-map type");
  }
  Implements(u) {
    if (!u) {
      return false;
    }
    if (u.Kind() !== Interface) {
      throw new Error("reflect: non-interface type passed to Type.Implements");
    }
    return typeImplementsInterface(this, u);
  }
  AssignableTo(u) {
    return typeAssignableTo(this, u);
  }
  ConvertibleTo(u) {
    return typeConvertibleTo(this, u);
  }
  common() {
    return new rtype(this.Kind());
  }
  OverflowInt(_x) {
    throw new Error("reflect: call of reflect.Type.OverflowInt on struct Type");
  }
  OverflowUint(_x) {
    throw new Error("reflect: call of reflect.Type.OverflowUint on struct Type");
  }
  OverflowFloat(_x) {
    throw new Error(
      "reflect: call of reflect.Type.OverflowFloat on struct Type"
    );
  }
  Methods() {
    return typeMethodsSeq(this);
  }
  Fields() {
    return typeFieldsSeq(this);
  }
  Ins() {
    return typeInsSeq(this);
  }
  Outs() {
    return typeOutsSeq(this);
  }
  NumMethod() {
    return typeMethods(this).length;
  }
  Method(i) {
    return typeMethod(this, i);
  }
  MethodByName(name) {
    return typeMethodByName(this, name);
  }
  Len() {
    throw new Error("reflect: call of reflect.Type.Len on struct Type");
  }
  Bits() {
    throw new Error("reflect: call of reflect.Type.Bits on struct Type");
  }
  static createTypeFromFieldInfo(ti, seen = /* @__PURE__ */ new Set()) {
    if (typeof ti === "string") {
      return basicTypeFromName(ti === "number" ? "int" : ti);
    } else if (ti && ti.kind) {
      const name = ti.name || "unknown";
      const typeName = ti.typeName || "";
      switch (ti.kind) {
        case "basic":
          return basicTypeFromName(name === "number" ? "int" : name, typeName);
        case "slice":
          if (ti.elemType) {
            return new SliceType(
              _StructType.createTypeFromFieldInfo(ti.elemType, seen)
            );
          }
          return new SliceType(new BasicType(Invalid, "unknown", 8));
        case "pointer":
          if (ti.elemType) {
            return new PointerType(
              _StructType.createTypeFromFieldInfo(ti.elemType, seen)
            );
          }
          return new PointerType(new BasicType(Invalid, "unknown", 8));
        case "interface":
          return interfaceTypeFromInfo(ti, seen);
        case "struct": {
          const structName = ti.name ?? "";
          const fields = structFieldsFromTypeInfo(ti, seen);
          return new _StructType(
            structName,
            fields,
            "",
            structName === "" ? structTypeString(fields) : structName
          );
        }
        default:
          return new BasicType(Invalid, name, 8);
      }
    }
    return new BasicType(Invalid, "unknown", 8);
  }
  ChanDir() {
    return nonChanTypePanic(this);
  }
  CanSeq() {
    return typeCanSeq(this);
  }
  CanSeq2() {
    return typeCanSeq2(this);
  }
};
function basicTypeFromName(name, typeName = "") {
  switch (name) {
    case "string":
      return new BasicType(String2, "string", 16, typeName);
    case "bool":
    case "boolean":
      return new BasicType(Bool, "bool", 1, typeName);
    case "int":
      return new BasicType(Int, "int", 8, typeName);
    case "int8":
      return new BasicType(Int8, "int8", 1, typeName);
    case "int16":
      return new BasicType(Int16, "int16", 2, typeName);
    case "int32":
      return new BasicType(Int32, "int32", 4, typeName);
    case "int64":
      return new BasicType(Int64, "int64", 8, typeName);
    case "uint":
      return new BasicType(Uint, "uint", 8, typeName);
    case "uint8":
    case "byte":
      return new BasicType(Uint8, name, 1, typeName);
    case "uint16":
      return new BasicType(Uint16, "uint16", 2, typeName);
    case "uint32":
      return new BasicType(Uint32, "uint32", 4, typeName);
    case "uint64":
      return new BasicType(Uint64, "uint64", 8, typeName);
    case "uintptr":
      return new BasicType(Uintptr, "uintptr", 8, typeName);
    case "float32":
      return new BasicType(Float32, "float32", 4, typeName);
    case "float64":
      return new BasicType(Float64, "float64", 8, typeName);
    case "complex64":
      return new BasicType(Complex64, "complex64", 8, typeName);
    case "complex128":
      return new BasicType(Complex128, "complex128", 16, typeName);
    default:
      return new BasicType(Invalid, name, 8, typeName);
  }
}
function typeFromGoTypeName(typeName) {
  const trimmed = typeName.trim();
  if (trimmed === "") return null;
  if (trimmed.startsWith("<-chan ")) {
    return new ChannelType(
      typeFromGoTypeName(trimmed.slice(7)) ?? anyType(),
      RecvDir
    );
  }
  if (trimmed.startsWith("chan<- ")) {
    return new ChannelType(
      typeFromGoTypeName(trimmed.slice(7)) ?? anyType(),
      SendDir
    );
  }
  if (trimmed.startsWith("chan ")) {
    return new ChannelType(
      typeFromGoTypeName(trimmed.slice(5)) ?? anyType(),
      BothDir
    );
  }
  if (trimmed.startsWith("[]")) {
    return new SliceType(typeFromGoTypeName(trimmed.slice(2)) ?? anyType());
  }
  if (trimmed.startsWith("*")) {
    return new PointerType(typeFromGoTypeName(trimmed.slice(1)) ?? anyType());
  }
  if (trimmed === "struct{}" || trimmed === "struct {}") {
    return new StructType("", [], "", "struct {}");
  }
  if (trimmed === "interface{}" || trimmed === "any") {
    return anyType();
  }
  if (trimmed === "error") {
    return new InterfaceType("error", "error");
  }
  const registered = getTypeByName(trimmed);
  if (registered) {
    return typeFromTypeInfo(registered);
  }
  const basic = basicTypeFromName(trimmed);
  if (basic.Kind() !== Invalid) {
    return basic;
  }
  return null;
}
function channelTypeFromGoTypeName(typeName) {
  const typ = typeFromGoTypeName(typeName);
  if (typ?.Kind() === Chan) {
    return typ;
  }
  return null;
}
function anyType() {
  return new BasicType(Interface, "interface{}", 16);
}
function structFieldsFromTypeInfo(ti, seen = /* @__PURE__ */ new Set()) {
  return (ti.fields || []).map((fieldInfo, index2) => {
    return {
      name: fieldInfo.name,
      key: structFieldRuntimeKey(fieldInfo),
      type: typeFromTypeInfoWithSeen(fieldInfo.type, seen),
      tag: fieldInfo.tag,
      pkgPath: fieldInfo.pkgPath ?? "",
      anonymous: fieldInfo.anonymous ?? false,
      index: fieldInfo.index ? [...fieldInfo.index] : [index2],
      offset: fieldInfo.offset ?? index2 * 8,
      exported: fieldInfo.exported ?? (fieldInfo.pkgPath ?? "") === ""
    };
  });
}
var ChannelType = class {
  constructor(_elemType, _dir) {
    this._elemType = _elemType;
    this._dir = _dir;
  }
  _elemType;
  _dir;
  String() {
    return goTypeString(this.runtimeString());
  }
  runtimeString() {
    const elem = runtimeTypeString(this._elemType);
    switch (this._dir) {
      case RecvDir:
        return `<-chan ${elem}`;
      case SendDir:
        return `chan<- ${elem}`;
      case BothDir:
      default:
        return `chan ${elem}`;
    }
  }
  Kind() {
    return Chan;
  }
  Comparable() {
    return true;
  }
  Size() {
    return 8;
  }
  Elem() {
    return this._elemType;
  }
  NumField() {
    return 0;
  }
  NumIn() {
    return nonFunctionTypePanic("NumIn", this);
  }
  In(_i) {
    return nonFunctionTypePanic("In", this);
  }
  NumOut() {
    return nonFunctionTypePanic("NumOut", this);
  }
  Out(_i) {
    return nonFunctionTypePanic("Out", this);
  }
  IsVariadic() {
    return nonFunctionTypePanic("IsVariadic", this);
  }
  PkgPath() {
    return "";
  }
  Name() {
    return "";
  }
  Field(_i) {
    throw new Error("reflect: Field of non-struct type");
  }
  FieldByIndex(index2) {
    return typeFieldByIndex(this, index2);
  }
  FieldByName(name) {
    return typeFieldByName(this, name);
  }
  FieldByNameFunc(match) {
    return typeFieldByNameFunc(this, match);
  }
  Key() {
    throw new Error("reflect: Key of non-map type");
  }
  Implements(u) {
    if (!u) {
      return false;
    }
    if (u.Kind() !== Interface) {
      throw new Error("reflect: non-interface type passed to Type.Implements");
    }
    return typeImplementsInterface(this, u);
  }
  AssignableTo(u) {
    return typeAssignableTo(this, u);
  }
  ConvertibleTo(u) {
    return typeConvertibleTo(this, u);
  }
  common() {
    return new rtype(this.Kind());
  }
  ChanDir() {
    return this._dir;
  }
  OverflowInt(_x) {
    throw new Error("reflect: call of reflect.Type.OverflowInt on chan Type");
  }
  OverflowUint(_x) {
    throw new Error("reflect: call of reflect.Type.OverflowUint on chan Type");
  }
  OverflowFloat(_x) {
    throw new Error("reflect: call of reflect.Type.OverflowFloat on chan Type");
  }
  Methods() {
    return typeMethodsSeq(this);
  }
  Fields() {
    return typeFieldsSeq(this);
  }
  Ins() {
    return typeInsSeq(this);
  }
  Outs() {
    return typeOutsSeq(this);
  }
  NumMethod() {
    return 0;
  }
  Method(i) {
    return typeMethod(this, i);
  }
  MethodByName(_name) {
    return [zeroMethod(), false];
  }
  Len() {
    throw new Error("reflect: call of reflect.Type.Len on chan Type");
  }
  Bits() {
    throw new Error("reflect: call of reflect.Type.Bits on chan Type");
  }
  CanSeq() {
    return typeCanSeq(this);
  }
  CanSeq2() {
    return typeCanSeq2(this);
  }
};
var InterfaceType = class {
  constructor(_name = "interface{}", _registeredName, _methods = []) {
    this._name = _name;
    this._registeredName = _registeredName;
    this._methods = _methods;
  }
  _name;
  _registeredName;
  _methods;
  String() {
    return goTypeString(this.runtimeString());
  }
  runtimeString() {
    return this._name === "interface{}" ? "interface {}" : this._name;
  }
  Kind() {
    return Interface;
  }
  Comparable() {
    return true;
  }
  Size() {
    return 16;
  }
  Elem() {
    throw new Error("reflect: Elem of invalid type");
  }
  NumField() {
    return 0;
  }
  NumIn() {
    return nonFunctionTypePanic("NumIn", this);
  }
  In(_i) {
    return nonFunctionTypePanic("In", this);
  }
  NumOut() {
    return nonFunctionTypePanic("NumOut", this);
  }
  Out(_i) {
    return nonFunctionTypePanic("Out", this);
  }
  IsVariadic() {
    return nonFunctionTypePanic("IsVariadic", this);
  }
  PkgPath() {
    if (isInterfaceLiteral(this._name)) {
      return "";
    }
    return typePackagePath(this._name);
  }
  Name() {
    if (isInterfaceLiteral(this._name)) {
      return "";
    }
    return typeNameName(this._name);
  }
  Field(_i) {
    throw new Error("reflect: Field of non-struct type");
  }
  FieldByIndex(index2) {
    return typeFieldByIndex(this, index2);
  }
  FieldByName(name) {
    return typeFieldByName(this, name);
  }
  FieldByNameFunc(match) {
    return typeFieldByNameFunc(this, match);
  }
  Key() {
    throw new Error("reflect: Key of non-map type");
  }
  Implements(u) {
    if (!u) {
      return false;
    }
    if (u.Kind() !== Interface) {
      throw new Error("reflect: non-interface type passed to Type.Implements");
    }
    return typeImplementsInterface(this, u);
  }
  AssignableTo(u) {
    return typeAssignableTo(this, u);
  }
  ConvertibleTo(u) {
    return typeConvertibleTo(this, u);
  }
  common() {
    return new rtype(this.Kind());
  }
  OverflowInt(_x) {
    throw new Error(
      "reflect: call of reflect.Type.OverflowInt on interface Type"
    );
  }
  OverflowUint(_x) {
    throw new Error(
      "reflect: call of reflect.Type.OverflowUint on interface Type"
    );
  }
  OverflowFloat(_x) {
    throw new Error(
      "reflect: call of reflect.Type.OverflowFloat on interface Type"
    );
  }
  Methods() {
    return typeMethodsSeq(this);
  }
  Fields() {
    return typeFieldsSeq(this);
  }
  Ins() {
    return typeInsSeq(this);
  }
  Outs() {
    return typeOutsSeq(this);
  }
  NumMethod() {
    return typeMethods(this).length;
  }
  Method(i) {
    return typeMethod(this, i);
  }
  MethodByName(name) {
    return typeMethodByName(this, name);
  }
  Len() {
    throw new Error("reflect: call of reflect.Type.Len on interface Type");
  }
  Bits() {
    throw new Error("reflect: call of reflect.Type.Bits on interface Type");
  }
  registeredName() {
    return this._registeredName;
  }
  methodSignatures() {
    return this._methods;
  }
  ChanDir() {
    return nonChanTypePanic(this);
  }
  CanSeq() {
    return typeCanSeq(this);
  }
  CanSeq2() {
    return typeCanSeq2(this);
  }
};
function getTypeOf(value) {
  if (isTypedNilValue(value)) {
    const typedNil2 = value;
    if (typedNil2.__goTypeInfo !== void 0) {
      return typeFromTypeInfo(typedNil2.__goTypeInfo);
    }
    if (typedNil2.__goType.startsWith("*")) {
      const elemTypeName = typedNil2.__goType.slice(1);
      return new PointerType(new InterfaceType(elemTypeName));
    }
  }
  if (value === null || value === void 0) {
    return new BasicType(Interface, "interface{}", 16);
  }
  switch (typeof value) {
    case "boolean":
      return new BasicType(Bool, "bool", 1);
    case "number":
      if (Number.isInteger(value)) {
        return new BasicType(Int, "int", 8);
      }
      return new BasicType(Float64, "float64", 8);
    case "bigint":
      return new BasicType(Int64, "int64", 8);
    case "string":
      return new BasicType(String2, "string", 16);
    case "function": {
      const funcWithMeta = value;
      if (funcWithMeta.__typeInfo) {
        const typeInfo = funcWithMeta.__typeInfo;
        if ((typeInfo.kind === "function" || typeInfo.kind === "Function") && typeInfo.params && typeInfo.results) {
          const named = funcWithMeta.__goTypeName && !typeInfo.name;
          const infoKey = typeInfoCacheKey(typeInfo);
          const cacheKey = infoKey === "" ? "" : infoKey + (named ? "#" + funcWithMeta.__goTypeName : "");
          if (cacheKey !== "") {
            const cached = functionValueTypes.get(cacheKey);
            if (cached !== void 0) {
              return cached;
            }
          }
          const typ = named ? functionTypeFromInfo({
            ...typeInfo,
            name: funcWithMeta.__goTypeName
          }) : functionTypeFromInfo(typeInfo);
          if (cacheKey !== "") {
            functionValueTypes.set(cacheKey, typ);
          }
          return typ;
        }
      }
      if (funcWithMeta.__goTypeName) {
        const typeName = funcWithMeta.__goTypeName;
        return new FunctionType({ name: typeName });
      }
      const funcStr = value.toString();
      let signature = "func";
      const match = funcStr.match(/function\s*\([^)]*\)/);
      if (match) {
        const params = match[0].replace("function", "").trim();
        if (params === "()") {
          signature = "func()";
        } else if (params.includes(",")) {
          const paramCount = params.split(",").length;
          signature = `func(${globalThis.Array(paramCount).fill("any").join(", ")})`;
        } else if (params !== "()") {
          signature = "func(any)";
        }
      }
      if (funcStr.includes("return ")) {
        signature += " any";
      }
      return new FunctionType(signature);
    }
    case "object": {
      if (value === null) {
        return new BasicType(Interface, "interface{}", 16);
      }
      if (isVarRef(value)) {
        const tagged = value.__goTypeInfo;
        if (tagged !== void 0) {
          const taggedType = typeFromTypeInfo(tagged);
          if (taggedType.Kind() === Ptr) {
            return taggedType;
          }
        }
        const elemType = getTypeOf(value.value);
        return new PointerType(elemType);
      }
      if ("__goTypeInfo" in value && value.__goTypeInfo) {
        return typeWithMethodSignatures(
          typeFromTypeInfo(
            value.__goTypeInfo
          ),
          boxedMethodSignatures(value)
        );
      }
      if ("__goType" in value) {
        const goType = value.__goType;
        if (typeof goType === "string") {
          const channelType = channelTypeFromGoTypeName(goType);
          if (channelType) {
            return channelType;
          }
        }
      }
      if ("real" in value && "imag" in value && typeof value.real === "number" && typeof value.imag === "number") {
        return new BasicType(Complex128, "complex128", 16);
      }
      if (globalThis.Array.isArray(value)) {
        if (value.length === 0) {
          return new SliceType(new BasicType(Interface, "interface{}", 16));
        }
        const elemType = getTypeOf(value[0]);
        return new SliceType(elemType);
      }
      if (value instanceof Uint8Array)
        return new SliceType(new BasicType(Uint8, "uint8", 1));
      if (value instanceof Int8Array)
        return new SliceType(new BasicType(Int8, "int8", 1));
      if (value instanceof Uint16Array)
        return new SliceType(new BasicType(Uint16, "uint16", 2));
      if (value instanceof Int16Array)
        return new SliceType(new BasicType(Int16, "int16", 2));
      if (value instanceof Uint32Array)
        return new SliceType(new BasicType(Uint32, "uint32", 4));
      if (value instanceof Int32Array)
        return new SliceType(new BasicType(Int32, "int32", 4));
      if (value instanceof Float32Array)
        return new SliceType(new BasicType(Float32, "float32", 4));
      if (value instanceof Float64Array)
        return new SliceType(new BasicType(Float64, "float64", 8));
      if (value instanceof globalThis.Map) {
        if (value.size === 0) {
          const anyType2 = new BasicType(Interface, "interface{}", 16);
          return new MapType(anyType2, anyType2);
        }
        const firstEntry = value.entries().next().value;
        if (firstEntry) {
          const keyType = getTypeOf(firstEntry[0]);
          const valueType = getTypeOf(firstEntry[1]);
          return new MapType(keyType, valueType);
        }
      }
      if (value && typeof value === "object" && "__meta__" in value) {
        const meta = value.__meta__;
        if (meta && typeof meta === "object" && "backing" in meta && "length" in meta && globalThis.Array.isArray(meta.backing)) {
          if (meta.backing.length === 0) {
            return new SliceType(new BasicType(Interface, "interface{}", 16));
          }
          const elemType = getTypeOf(meta.backing[0]);
          return new SliceType(elemType);
        }
      }
      if (value && typeof value === "object" && value.constructor && "__reflectType" in value.constructor) {
        const reflectType = value.constructor.__reflectType;
        if (reflectType) {
          return reflectType;
        }
      }
      if (value && typeof value === "object" && value.constructor && "__typeInfo" in value.constructor) {
        const typeInfo = value.constructor.__typeInfo;
        if (typeInfo && isStructTypeInfo(typeInfo)) {
          const ctor = value.constructor;
          const cached = structConstructorTypes.get(ctor);
          if (cached !== void 0) {
            return cached;
          }
          const typ = structTypeOfConstructor(typeInfo);
          structConstructorTypes.set(ctor, typ);
          return typ;
        }
      }
      const constructorName = value.constructor?.name;
      if (constructorName && constructorName !== "Object") {
        return new StructType(constructorName, []);
      }
      return new StructType("struct", []);
    }
    default:
      return new BasicType(Interface, "interface{}", 16);
  }
}
var structConstructorTypes = /* @__PURE__ */ new WeakMap();
function structTypeOfConstructor(typeInfo) {
  const name = typeInfo.name ?? "";
  if (name === "") {
    return new StructType("", structFieldsFromTypeInfo(typeInfo));
  }
  const typeName = name.includes(".") ? name : `main.${name}`;
  const regTypeInfo = getTypeByName(typeName);
  const fields = regTypeInfo && isStructTypeInfo(regTypeInfo) ? structFieldsFromTypeInfo(regTypeInfo) : structFieldsFromTypeInfo(typeInfo);
  return new StructType(typeName, fields);
}
function boxedMethodSignatures(value) {
  const signatures = [];
  for (const method of Object.values(value)) {
    const signature = typeof method === "function" ? method.__goscriptMethodSignature : void 0;
    if (signature) {
      signatures.push(signature);
    }
  }
  return signatures;
}
function TypeOf(i) {
  if (i === null || i === void 0) {
    return null;
  }
  return internedTypeOf(i);
}
var boxedTypes = new globalThis.Map();
var boxedTypesVersion = -1;
function internedTypeOf(i) {
  const key = boxedTypeKey(i);
  if (key === void 0) {
    return internType(getTypeOf(i));
  }
  const version = typeRegistryVersion();
  if (version !== boxedTypesVersion) {
    boxedTypes.clear();
    boxedTypesVersion = version;
  }
  let typ = boxedTypes.get(key);
  if (typ === void 0) {
    typ = internType(getTypeOf(i));
    boxedTypes.set(key, typ);
  }
  return typ;
}
function boxedTypeKey(i) {
  if (typeof i !== "object" || i === null || isVarRef(i) || isNamedValueBox(i) || isTypedNilValue(i)) {
    return void 0;
  }
  const boxed = i;
  const info = boxed.__goTypeInfo;
  if (typeof boxed.__goType !== "string" || info === void 0) {
    return void 0;
  }
  let infoName;
  if (typeof info === "string") {
    infoName = info;
  } else if (info.name) {
    infoName = info.name;
  } else if (isPointerTypeInfo(info) && typeof info.elemType === "string") {
    infoName = "*" + info.elemType;
  }
  return infoName === void 0 ? void 0 : boxed.__goType + " " + infoName;
}
function ValueOf(i) {
  if (i === null || i === void 0) {
    return new Value2();
  }
  const typ = internedTypeOf(i);
  if (isNamedValueBox(i)) {
    return new Value2(
      i.__goValue,
      typ,
      void 0,
      void 0,
      void 0,
      i
    );
  }
  return new Value2(i, typ);
}
var sliceTypes = /* @__PURE__ */ new WeakMap();
var pointerTypes = /* @__PURE__ */ new WeakMap();
function SliceOf(t) {
  let st = sliceTypes.get(t);
  if (st === void 0) {
    st = internType(new SliceType(t));
    sliceTypes.set(t, st);
  }
  return st;
}
function PointerTo(t) {
  if (t === null) return null;
  let pt = pointerTypes.get(t);
  if (pt === void 0) {
    pt = internType(new PointerType(t));
    pointerTypes.set(t, pt);
  }
  return pt;
}
function structTypeString(fields) {
  if (fields.length === 0) {
    return "struct {}";
  }
  return `struct { ${fields.map(structFieldString).join("; ")} }`;
}
function structFieldString(field) {
  const tag = field.tag ? ` ${JSON.stringify(field.tag)}` : "";
  const prefix = field.anonymous ? "" : `${field.name} `;
  return `${prefix}${field.type.String()}${tag}`;
}
function typeWithMethodSignatures(typ, methods) {
  if (methods.length === 0) {
    return typ;
  }
  if (typ instanceof BasicType) {
    typ.mergeMethodSignatures(methods);
    return typ;
  }
  if (typ instanceof PointerType) {
    typ.mergeMethodSignatures(methods);
    return typ;
  }
  if (typ instanceof FunctionType) {
    typ.mergeMethodSignatures(methods);
    return typ;
  }
  return typ;
}
var typeInfoTypes = /* @__PURE__ */ new WeakMap();
var namedTypeInfoTypes = new globalThis.Map();
function typeInfoCacheKey(info) {
  if (info === void 0) {
    return "";
  }
  if (typeof info === "string") {
    return getTypeByName(info) ? info : "";
  }
  if (info.name !== void 0 && getTypeByName(info.name) === info) {
    return info.name;
  }
  switch (info.kind) {
    case "basic" /* Basic */: {
      if (info.name === void 0) {
        return "";
      }
      return "b:" + info.name + "|" + (info.typeName ?? "");
    }
    case "pointer" /* Pointer */: {
      const elem = typeInfoCacheKey(info.elemType);
      return elem === "" ? "" : "*" + elem;
    }
    case "slice" /* Slice */: {
      const elem = typeInfoCacheKey(info.elemType);
      return elem === "" ? "" : "[]" + elem + "|" + (info.typeName ?? "");
    }
    case "array" /* Array */: {
      const array = info;
      const elem = typeInfoCacheKey(array.elemType);
      return elem === "" ? "" : "[" + array.length + "]" + elem + "|" + (info.typeName ?? "");
    }
    case "map" /* Map */: {
      const map = info;
      const key = typeInfoCacheKey(map.keyType);
      const elem = typeInfoCacheKey(map.elemType);
      return key === "" || elem === "" ? "" : "map[" + key + "]" + elem + "|" + (info.typeName ?? "");
    }
    case "function" /* Function */: {
      const fn = info;
      const params = (fn.params ?? []).map(typeInfoCacheKey);
      const results = (fn.results ?? []).map(typeInfoCacheKey);
      if (params.includes("") || results.includes("")) {
        return "";
      }
      return "func(" + params.join(",") + ")(" + results.join(",") + ")" + (fn.isVariadic ? "..." : "") + "|" + (fn.name ?? "") + "|" + (info.typeName ?? "");
    }
    case "interface" /* Interface */: {
      if (info.name !== void 0 && info.name !== "") {
        return "";
      }
      const methods = info.methods ?? [];
      const keys = methods.map(methodSignatureCacheKey);
      if (keys.includes("")) {
        return "";
      }
      return "interface{" + keys.join(";") + "}|" + (info.typeName ?? "");
    }
    case "struct" /* Struct */: {
      if (info.name !== void 0 && info.name !== "") {
        return "";
      }
      const fields = info.fields ?? [];
      const keys = fields.map(structFieldCacheKey);
      if (keys.includes("")) {
        return "";
      }
      return "struct{" + keys.join(";") + "}|" + (info.typeName ?? "");
    }
  }
  return "";
}
function methodSignatureCacheKey(method) {
  const args = method.args.map((arg) => typeInfoCacheKey(arg.type));
  const returns = method.returns.map((arg) => typeInfoCacheKey(arg.type));
  if (args.includes("") || returns.includes("")) {
    return "";
  }
  return method.name + "(" + args.join(",") + ")(" + returns.join(",") + ")";
}
function structFieldCacheKey(field) {
  const typ = typeInfoCacheKey(field.type);
  if (typ === "") {
    return "";
  }
  return field.name + " " + (field.key ?? "") + " " + typ + " " + JSON.stringify(field.tag ?? "") + " " + (field.pkgPath ?? "") + (field.anonymous ? " embedded" : "");
}
var functionValueTypes = new globalThis.Map();
function typeFromTypeInfo(info) {
  const key = typeInfoCacheKey(info);
  if (key !== "") {
    let typ2 = namedTypeInfoTypes.get(key);
    if (typ2 === void 0) {
      typ2 = typeFromTypeInfoWithSeen(info, /* @__PURE__ */ new Set());
      namedTypeInfoTypes.set(key, typ2);
    }
    return typ2;
  }
  if (typeof info === "string") {
    return typeFromTypeInfoWithSeen(info, /* @__PURE__ */ new Set());
  }
  let typ = typeInfoTypes.get(info);
  if (typ === void 0) {
    typ = typeFromTypeInfoWithSeen(info, /* @__PURE__ */ new Set());
    typeInfoTypes.set(info, typ);
  }
  return typ;
}
function typeFromTypeInfoWithSeen(info, seen) {
  if (isGoErrorTypeInfo(info)) {
    info = "error";
  }
  const key = typeInfoCacheKey(info);
  if (key !== "") {
    const cached = namedTypeInfoTypes.get(key);
    if (cached !== void 0) {
      return cached;
    }
  }
  if (typeof info === "string") {
    const registered = getTypeByName(info);
    if (registered) {
      const typ = typeFromTypeInfoWithSeen(registered, seen);
      return internType(typ);
    }
    return internType(StructType.createTypeFromFieldInfo(info, seen));
  }
  const recursiveName = recursiveTypeInfoName(info);
  if (recursiveName !== "") {
    const constructing = constructingRegisteredTypes.get(recursiveName);
    if (constructing) {
      return constructing;
    }
    if (seen.has(recursiveName)) {
      return internType(shallowTypeFromRegisteredInfo(recursiveName, info));
    }
    if (info.kind === "struct" /* Struct */) {
      const typ2 = new StructType(recursiveName, []);
      constructingRegisteredTypes.set(recursiveName, typ2);
      seen.add(recursiveName);
      try {
        typ2.replaceDescriptors(structFieldsFromTypeInfo(info, seen));
        const interned = internType(typ2);
        if (key !== "") {
          namedTypeInfoTypes.set(key, interned);
        }
        return interned;
      } finally {
        seen.delete(recursiveName);
        constructingRegisteredTypes.delete(recursiveName);
      }
    }
    seen.add(recursiveName);
    const typ = typeFromStructuredTypeInfoWithSeen(info, seen);
    seen.delete(recursiveName);
    return internType(typ);
  }
  return internType(typeFromStructuredTypeInfoWithSeen(info, seen));
}
function isGoErrorTypeInfo(info) {
  if (typeof info === "string") {
    return info === "GoError";
  }
  return info.kind === "interface" /* Interface */ && info.name === "GoError";
}
function recursiveTypeInfoName(info) {
  if (info.kind === "basic" /* Basic */) {
    return info.typeName ?? "";
  }
  return info.name ?? "";
}
function typeFromStructuredTypeInfoWithSeen(info, seen) {
  switch (info.kind) {
    case "array" /* Array */:
      return new ArrayType(
        typeFromTypeInfoWithSeen(
          info.elemType ?? { kind: "basic" /* Basic */, name: "unknown" },
          seen
        ),
        info.length,
        info.typeName
      );
    case "basic" /* Basic */:
      return StructType.createTypeFromFieldInfo(info, seen);
    case "channel" /* Channel */:
      return new ChannelType(
        typeFromTypeInfoWithSeen(
          info.elemType ?? { kind: "basic" /* Basic */, name: "unknown" },
          seen
        ),
        chanDirFromTypeInfo(info.direction)
      );
    case "function" /* Function */:
      return functionTypeFromInfo(info, seen);
    case "interface" /* Interface */:
      return interfaceTypeFromInfo(info, seen);
    case "map" /* Map */:
      return new MapType(
        typeFromTypeInfoWithSeen(
          info.keyType ?? { kind: "basic" /* Basic */, name: "unknown" },
          seen
        ),
        typeFromTypeInfoWithSeen(
          info.elemType ?? { kind: "basic" /* Basic */, name: "unknown" },
          seen
        ),
        info.typeName
      );
    case "slice" /* Slice */:
      return new SliceType(
        typeFromTypeInfoWithSeen(
          info.elemType ?? { kind: "basic" /* Basic */, name: "unknown" },
          seen
        ),
        info.typeName
      );
    case "struct" /* Struct */:
      return StructType.createTypeFromFieldInfo(info, seen);
    case "pointer" /* Pointer */:
      return new PointerType(
        typeFromTypeInfoWithSeen(
          info.elemType ?? { kind: "basic" /* Basic */, name: "unknown" },
          seen
        )
      );
    default:
      return StructType.createTypeFromFieldInfo(info, seen);
  }
}
function shallowTypeFromRegisteredInfo(name, info) {
  switch (info.kind) {
    case "interface" /* Interface */:
      return new InterfaceType(name, name, info.methods ?? []);
    case "struct" /* Struct */:
      return new StructType(name, []);
    case "function" /* Function */:
      return new FunctionType({ name });
    case "basic" /* Basic */:
      return StructType.createTypeFromFieldInfo({
        kind: "basic" /* Basic */,
        name: info.name ?? "unknown",
        typeName: info.typeName ?? name
      });
    default:
      return StructType.createTypeFromFieldInfo(name);
  }
}
function functionTypeFromInfo(info, seen = /* @__PURE__ */ new Set()) {
  const params = (info.params ?? []).map(
    (param) => typeFromTypeInfoWithSeen(param, seen)
  );
  const results = (info.results ?? []).map(
    (result) => typeFromTypeInfoWithSeen(result, seen)
  );
  return new FunctionType({
    name: info.name,
    params,
    results,
    variadic: info.isVariadic ?? false
  });
}
function functionTypeInfoFromType(typ) {
  const params = [];
  for (let i = 0; i < typ.NumIn(); i++) {
    params.push(typeInfoFromReflectType(typ.In(i)));
  }
  const results = [];
  for (let i = 0; i < typ.NumOut(); i++) {
    results.push(typeInfoFromReflectType(typ.Out(i)));
  }
  const info = {
    kind: "function" /* Function */,
    params,
    results
  };
  if (typ.Name() !== "") {
    info.name = runtimeTypeString(typ);
  }
  if (typ.IsVariadic()) {
    info.isVariadic = true;
  }
  return info;
}
function typeInfoFromReflectType(typ) {
  const typeName = typ.PkgPath() !== "" && typ.Name() !== "" ? runtimeTypeString(typ) : "";
  if (typeName !== "" && (typ.Kind() === Struct || getTypeByName(typeName) !== void 0)) {
    return typeName;
  }
  switch (typ.Kind()) {
    case Bool:
    case Int:
    case Int8:
    case Int16:
    case Int32:
    case Int64:
    case Uint:
    case Uint8:
    case Uint16:
    case Uint32:
    case Uint64:
    case Uintptr:
    case Float32:
    case Float64:
    case Complex64:
    case Complex128:
    case String2:
    case UnsafePointer:
      return {
        kind: "basic" /* Basic */,
        name: Kind_String(typ.Kind()),
        ...typeName !== "" ? { typeName } : {}
      };
    case Interface:
      return {
        kind: "interface" /* Interface */,
        methods: typeMethods(typ).map((method) => ({
          name: method.name,
          args: method.args,
          returns: method.returns
        }))
      };
    case Slice:
      return {
        kind: "slice" /* Slice */,
        ...typeName !== "" ? { typeName } : {},
        elemType: typeInfoFromReflectType(typ.Elem())
      };
    case Array2:
      return {
        kind: "array" /* Array */,
        elemType: typeInfoFromReflectType(typ.Elem()),
        length: typ.Len()
      };
    case Ptr:
      return {
        kind: "pointer" /* Pointer */,
        elemType: typeInfoFromReflectType(typ.Elem())
      };
    case Map2:
      return {
        kind: "map" /* Map */,
        keyType: typeInfoFromReflectType(typ.Key()),
        elemType: typeInfoFromReflectType(typ.Elem())
      };
    case Chan:
      return {
        kind: "channel" /* Channel */,
        elemType: typeInfoFromReflectType(typ.Elem()),
        direction: channelDirectionFromString(typ.String())
      };
    case Func:
      return functionTypeInfoFromType(typ);
    case Struct: {
      const fields = typ instanceof StructType ? typ.descriptors() : globalThis.Array.from({ length: typ.NumField() }, (_unused, idx) => {
        const field = typ.Field(idx);
        return {
          name: field.Name,
          key: structFieldStorageKey(typ, idx),
          type: field.Type,
          tag: field.Tag || void 0,
          pkgPath: field.PkgPath,
          anonymous: field.Anonymous,
          index: [...asArray(field.Index)],
          offset: field.Offset,
          exported: field.IsExported()
        };
      });
      return {
        kind: "struct" /* Struct */,
        name: typ.Name() === "" ? "" : runtimeTypeString(typ),
        methods: [],
        fields: fields.map((field) => ({
          name: field.name,
          key: field.key,
          type: typeInfoFromReflectType(field.type),
          ...field.tag ? { tag: field.tag } : {},
          ...field.pkgPath ? { pkgPath: field.pkgPath } : {},
          ...field.anonymous ? { anonymous: true } : {},
          index: [...field.index],
          offset: field.offset,
          exported: field.exported
        }))
      };
    }
    default:
      return runtimeTypeString(typ);
  }
}
function channelDirectionFromString(typeName) {
  if (typeName.startsWith("<-chan ")) {
    return "receive";
  }
  if (typeName.startsWith("chan<- ")) {
    return "send";
  }
  return "both";
}
function interfaceTypeFromInfo(info, seen = /* @__PURE__ */ new Set()) {
  const methods = info.methods ?? [];
  if (info.name && !isInterfaceLiteral(info.name)) {
    return new InterfaceType(info.name, info.name, methods);
  }
  if (methods.length === 0) {
    return new InterfaceType("interface{}", info.name, methods);
  }
  return new InterfaceType(
    interfaceTypeString(methods, seen),
    info.name,
    methods
  );
}
function interfaceTypeString(methods, seen = /* @__PURE__ */ new Set()) {
  return `interface { ${methods.map((method) => interfaceMethodString(method, seen)).join("; ")} }`;
}
function interfaceMethodString(method, seen) {
  const args = method.args.map((arg) => methodArgString(arg, seen)).join(", ");
  const returns = method.returns.map((arg) => methodArgString(arg, seen));
  if (returns.length === 0) {
    return `${method.name}(${args})`;
  }
  if (returns.length === 1) {
    return `${method.name}(${args}) ${returns[0]}`;
  }
  return `${method.name}(${args}) (${returns.join(", ")})`;
}
function structTypeInfoString(info, seen) {
  if (info.name) {
    return info.name;
  }
  const fields = info.fields ?? [];
  if (fields.length === 0) {
    return "struct {}";
  }
  return `struct { ${fields.map((field) => structFieldInfoString(field, seen)).join("; ")} }`;
}
function structFieldInfoString(field, seen) {
  const tag = field.tag ? ` ${JSON.stringify(field.tag)}` : "";
  const prefix = field.anonymous ? "" : `${field.name} `;
  return `${prefix}${typeInfoString(field.type, seen)}${tag}`;
}
function methodArgString(arg, seen) {
  return typeInfoString(arg.type, seen);
}
function typeInfoString(info, seen) {
  if (typeof info === "string") {
    return info;
  }
  switch (info.kind) {
    case "basic" /* Basic */:
      return info.typeName ?? info.name ?? "unknown";
    case "interface" /* Interface */: {
      const name = info.name ?? "";
      if (name !== "" && seen.has(name)) {
        return name;
      }
      if (info.methods.length === 0) {
        return "interface{}";
      }
      if (name !== "") {
        seen.add(name);
      }
      const text = interfaceTypeString(info.methods, seen);
      if (name !== "") {
        seen.delete(name);
      }
      return text;
    }
    case "struct" /* Struct */:
      return structTypeInfoString(info, seen);
    case "pointer" /* Pointer */:
      return `*${typeInfoString(
        info.elemType ?? { kind: "basic" /* Basic */, name: "unknown" },
        seen
      )}`;
    case "slice" /* Slice */:
      return `[]${typeInfoString(
        info.elemType ?? { kind: "basic" /* Basic */, name: "unknown" },
        seen
      )}`;
    case "array" /* Array */:
      return `[${info.length}]${typeInfoString(
        info.elemType ?? { kind: "basic" /* Basic */, name: "unknown" },
        seen
      )}`;
    case "map" /* Map */:
      return `map[${typeInfoString(
        info.keyType ?? { kind: "basic" /* Basic */, name: "unknown" },
        seen
      )}]${typeInfoString(
        info.elemType ?? { kind: "basic" /* Basic */, name: "unknown" },
        seen
      )}`;
    case "function" /* Function */: {
      const params = (info.params ?? []).map((param) => typeInfoString(param, seen)).join(", ");
      const results = (info.results ?? []).map(
        (result) => typeInfoString(result, seen)
      );
      if (results.length === 0) {
        return `func(${params})`;
      }
      if (results.length === 1) {
        return `func(${params}) ${results[0]}`;
      }
      return `func(${params}) (${results.join(", ")})`;
    }
    case "channel" /* Channel */:
      return `chan ${typeInfoString(
        info.elemType ?? { kind: "basic" /* Basic */, name: "unknown" },
        seen
      )}`;
    default:
      return "unknown";
  }
}
function chanDirFromTypeInfo(direction) {
  switch (direction) {
    case "send":
      return SendDir;
    case "receive":
      return RecvDir;
    default:
      return BothDir;
  }
}
Value2.__typeInfo = registerStructType(
  "reflect.Value",
  () => new Value2(),
  [],
  Value2
);
function isNamedStructObject(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const ctor = value.constructor;
  return ctor !== void 0 && ctor !== Object && ctor.__typeInfo !== void 0;
}
var unnamedStructViews = /* @__PURE__ */ new WeakMap();
function unnamedStructView(target) {
  const existing = unnamedStructViews.get(target);
  if (existing !== void 0) {
    return existing;
  }
  const tags = {};
  const isTag = (prop) => prop === "__goType" || prop === "__goTypeInfo";
  const view = new Proxy(target, {
    get(obj, prop) {
      if (isTag(prop)) {
        return tags[prop];
      }
      const value = Reflect.get(obj, prop, obj);
      if (typeof value === "function" && typeof prop === "string" && prop !== "constructor" && prop !== "clone" && !prop.startsWith("_") && !Object.prototype.hasOwnProperty.call(obj, prop)) {
        return void 0;
      }
      return value;
    },
    set(obj, prop, value) {
      return Reflect.set(obj, prop, value, obj);
    },
    has(obj, prop) {
      if (isTag(prop)) {
        return prop in tags;
      }
      return Reflect.has(obj, prop);
    },
    defineProperty(obj, prop, descriptor) {
      if (isTag(prop)) {
        tags[prop] = descriptor.value;
        return true;
      }
      return Reflect.defineProperty(obj, prop, descriptor);
    }
  });
  unnamedStructViews.set(target, view);
  return view;
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/fmt/fmt.ts
registerInterfaceType("fmt.Stringer", null, [
  methodSignature("String", [], [basicType("string")])
]);
registerInterfaceType("fmt.GoStringer", null, [
  methodSignature("GoString", [], [basicType("string")])
]);
registerInterfaceType("fmt.State", null, [
  methodSignature("Flag", [["c", basicType("int")]], [basicType("bool")]),
  methodSignature("Precision", [], [basicType("int"), basicType("bool")]),
  methodSignature("Width", [], [basicType("int"), basicType("bool")]),
  methodSignature(
    "Write",
    [["b", sliceType(basicType("uint8"))]],
    [basicType("int"), "error"]
  )
]);
registerInterfaceType("fmt.Formatter", null, [
  methodSignature("Format", [
    ["f", "fmt.State"],
    ["verb", basicType("int32")]
  ])
]);
registerInterfaceType("fmt.ScanState", null, [
  methodSignature(
    "Read",
    [["buf", sliceType(basicType("uint8"))]],
    [basicType("int"), "error"]
  ),
  methodSignature(
    "ReadRune",
    [],
    [basicType("int32"), basicType("int"), "error"]
  ),
  methodSignature("SkipSpace"),
  methodSignature(
    "Token",
    [
      ["skipSpace", basicType("bool")],
      [
        "f",
        {
          kind: "function" /* Function */,
          params: [basicType("int32")],
          results: [basicType("bool")]
        }
      ]
    ],
    [sliceType(basicType("uint8")), "error"]
  ),
  methodSignature("UnreadRune", [], ["error"]),
  methodSignature("Width", [], [basicType("int"), basicType("bool")])
]);
registerInterfaceType("fmt.Scanner", null, [
  methodSignature(
    "Scan",
    [
      ["state", "fmt.ScanState"],
      ["verb", basicType("int32")]
    ],
    ["error"]
  )
]);

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/github.com/samuelpmahan/gondola/gobi/names.gs.ts
registerTypePackagePath("github.com/samuelpmahan/gondola/gobi", ["gobi.AttributeName"]);
var AttributeName = class _AttributeName {
  constructor(__goscriptValue, DOM$, Prop$, Output$) {
    this.DOM = DOM$ ?? "";
    this.Prop = Prop$ ?? "";
    this.Output = Output$ ?? "";
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _AttributeName(true, this.DOM, this.Prop, this.Output);
  }
  __goscriptAssign(source) {
    this.DOM = source.DOM;
    this.Prop = source.Prop;
    this.Output = source.Output;
    return this;
  }
  static __typeInfo = registerStructType(
    "gobi.AttributeName",
    () => new _AttributeName(),
    () => [],
    _AttributeName,
    () => [{ name: "DOM", key: "DOM", type: /* @__PURE__ */ basicType("string") }, { name: "Prop", key: "Prop", type: /* @__PURE__ */ basicType("string") }, { name: "Output", key: "Output", type: /* @__PURE__ */ basicType("string") }]
  );
};
var AttributeNames = arrayToSlice([new AttributeName(true, "class", "className", "class"), new AttributeName(true, "for", "htmlFor", "for"), new AttributeName(true, "tabindex", "tabIndex", "tabindex"), new AttributeName(true, "readonly", "readOnly", "readOnly"), new AttributeName(true, "maxlength", "maxLength", "maxLength"), new AttributeName(true, "minlength", "minLength", "minLength"), new AttributeName(true, "colspan", "colSpan", "colSpan"), new AttributeName(true, "rowspan", "rowSpan", "rowSpan"), new AttributeName(true, "autofocus", "autoFocus", "autofocus"), new AttributeName(true, "autocomplete", "autoComplete", "autoComplete"), new AttributeName(true, "autoplay", "autoPlay", "autoPlay"), new AttributeName(true, "contenteditable", "contentEditable", "contentEditable"), new AttributeName(true, "crossorigin", "crossOrigin", "crossorigin"), new AttributeName(true, "enctype", "encType", "encType"), new AttributeName(true, "formaction", "formAction", "formAction"), new AttributeName(true, "accept-charset", "acceptCharset", "accept-charset"), new AttributeName(true, "http-equiv", "httpEquiv", "http-equiv"), new AttributeName(true, "novalidate", "noValidate", "noValidate"), new AttributeName(true, "spellcheck", "spellCheck", "spellCheck"), new AttributeName(true, "srcset", "srcSet", "srcSet"), new AttributeName(true, "usemap", "useMap", "useMap"), new AttributeName(true, "allowfullscreen", "allowFullScreen", "allowFullScreen"), new AttributeName(true, "formnovalidate", "formNoValidate", "formNoValidate"), new AttributeName(true, "playsinline", "playsInline", "playsInline"), new AttributeName(true, "nomodule", "noModule", "noModule"), new AttributeName(true, "itemscope", "itemScope", "itemScope"), new AttributeName(true, "stroke-width", "strokeWidth", "stroke-width"), new AttributeName(true, "stroke-linecap", "strokeLinecap", "stroke-linecap"), new AttributeName(true, "stroke-linejoin", "strokeLinejoin", "stroke-linejoin"), new AttributeName(true, "stroke-dasharray", "strokeDasharray", "stroke-dasharray"), new AttributeName(true, "stroke-dashoffset", "strokeDashoffset", "stroke-dashoffset"), new AttributeName(true, "stroke-opacity", "strokeOpacity", "stroke-opacity"), new AttributeName(true, "stroke-miterlimit", "strokeMiterlimit", "stroke-miterlimit"), new AttributeName(true, "fill-opacity", "fillOpacity", "fill-opacity"), new AttributeName(true, "fill-rule", "fillRule", "fill-rule"), new AttributeName(true, "clip-rule", "clipRule", "clip-rule"), new AttributeName(true, "clip-path", "clipPath", "clip-path"), new AttributeName(true, "font-size", "fontSize", "font-size"), new AttributeName(true, "font-family", "fontFamily", "font-family"), new AttributeName(true, "font-weight", "fontWeight", "font-weight"), new AttributeName(true, "text-anchor", "textAnchor", "text-anchor"), new AttributeName(true, "text-decoration", "textDecoration", "text-decoration"), new AttributeName(true, "stop-color", "stopColor", "stop-color"), new AttributeName(true, "stop-opacity", "stopOpacity", "stop-opacity"), new AttributeName(true, "shape-rendering", "shapeRendering", "shape-rendering"), new AttributeName(true, "marker-start", "markerStart", "marker-start"), new AttributeName(true, "marker-mid", "markerMid", "marker-mid"), new AttributeName(true, "marker-end", "markerEnd", "marker-end"), new AttributeName(true, "vector-effect", "vectorEffect", "vector-effect"), new AttributeName(true, "xlink:href", "xlinkHref", "xlink:href"), new AttributeName(true, "xml:lang", "xmlLang", "xml:lang"), new AttributeName(true, "xml:space", "xmlSpace", "xml:space")]);
var BooleanAttributes = arrayToSlice(["allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls", "default", "defer", "disabled", "formnovalidate", "hidden", "inert", "loop", "multiple", "muted", "nomodule", "novalidate", "open", "playsinline", "readonly", "required", "reversed", "selected", "itemscope"]);
function outputName(dom) {
  for (let __goscriptRangeTarget0 = AttributeNames, __goscriptRangeWindow0 = sliceRange(__goscriptRangeTarget0), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow0.length; __rangeIndex++) {
    let a = __goscriptRangeWindow0.backing[__goscriptRangeWindow0.offset + __rangeIndex];
    if (stringEqual(a.DOM, dom)) {
      return a.Output;
    }
  }
  return dom;
}
function isBoolean(dom) {
  for (let __goscriptRangeTarget1 = BooleanAttributes, __goscriptRangeWindow1 = sliceRange(__goscriptRangeTarget1), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow1.length; __rangeIndex++) {
    let b = __goscriptRangeWindow1.backing[__goscriptRangeWindow1.offset + __rangeIndex];
    if (stringEqual(b, dom)) {
      return true;
    }
  }
  return false;
}
function StyleKey(property) {
  if (stringLen(property) >= 2 && indexString(property, 0) == 45 && indexString(property, 1) == 45) {
    return property;
  }
  if (stringLen(property) >= 4 && sliceStringEqual(property, void 0, 4, "-ms-")) {
    return "ms" + camelCase("-" + sliceStringOrBytes(property, 4, void 0));
  }
  return camelCase(property);
}
function camelCase(s) {
  let out = "";
  for (let i = 0; i < stringLen(s); i++) {
    if (indexString(s, i) == 45 && i + 1 < stringLen(s) && indexString(s, i + 1) >= 97 && indexString(s, i + 1) <= 122) {
      out += runeToString(uint((indexString(s, i + 1) - 97 & 255) + 65 & 255, 8));
      i++;
      continue;
    }
    out += sliceStringOrBytes(s, i, i + 1);
  }
  return out;
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/github.com/samuelpmahan/gondola/gobi/html.gs.ts
registerTypePackagePath("github.com/samuelpmahan/gondola/gobi", ["gobi.htmlState", "gobi.selectScope", "gobi.written"]);
var htmlState = class _htmlState {
  constructor(__goscriptValue, out$, preloads$, seen$) {
    this.out = out$ ?? "";
    this.preloads = preloads$ ?? "";
    this.seen = seen$ ?? null;
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _htmlState(true, this.out, this.preloads, this.seen);
  }
  __goscriptAssign(source) {
    this.out = source.out;
    this.preloads = source.preloads;
    this.seen = source.seen;
    return this;
  }
  attributes(n, scope) {
    const s = this;
    let list = null;
    let textareaValue = "";
    let hasTextareaValue = false;
    let flagSelected = false;
    for (let __goscriptRangeTarget0 = n.Attrs, __goscriptRangeWindow0 = sliceRange(__goscriptRangeTarget0), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow0.length; __rangeIndex++) {
      let a = __goscriptRangeWindow0.backing[__goscriptRangeWindow0.offset + __rangeIndex].clone();
      switch (true) {
        case a.Flag: {
          switch (true) {
            case stringEqual(a.Name, "selected"): {
              flagSelected = stringEqual(n.Tag, "option");
              break;
            }
            case stringEqual(a.Name, "checked"): {
              if (stringEqual(n.Tag, "input")) {
                list = appendOne(list, new written(true, "checked", ' checked=""'));
              }
              break;
            }
            case isBoolean(a.Name): {
              let name = outputName(a.Name);
              list = appendOne(list, new written(true, name, " " + name + '=""'));
              break;
            }
            case (hasPrefix(a.Name, "data-") || hasPrefix(a.Name, "aria-")): {
              list = appendOne(list, new written(true, a.Name, " " + a.Name + '="true"'));
              break;
            }
          }
          break;
        }
        case stringEqual(a.Name, "style"): {
          let css = styleText(a.Style);
          if (!stringEqual(css, "")) {
            list = appendOne(list, (() => {
              const __goscriptLiteralField0 = ' style="' + escape(css) + '"';
              return new written(true, "style", __goscriptLiteralField0);
            })());
          }
          break;
        }
        case (stringEqual(a.Name, "value") && stringEqual(n.Tag, "textarea")): {
          let __goscriptAssign0_0 = a.Value;
          let __goscriptAssign0_1 = true;
          textareaValue = __goscriptAssign0_0;
          hasTextareaValue = __goscriptAssign0_1;
          break;
        }
        case (stringEqual(a.Name, "value") && stringEqual(n.Tag, "select")): {
          break;
        }
        case (stringEqual(a.Name, "src") && stringEqual(a.Value, "")):
        case (stringEqual(a.Name, "href") && stringEqual(a.Value, "") && !stringEqual(n.Tag, "a")): {
          break;
        }
        case (stringEqual(a.Name, "rowspan") && numberIsNaN(a.Value)): {
          break;
        }
        default: {
          let name = outputName(a.Name);
          let value = a.Value;
          if ((stringEqual(a.Name, "href") || stringEqual(a.Name, "src")) && isJavascriptURL(value)) {
            value = "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')";
          }
          list = appendOne(list, (() => {
            const __goscriptLiteralField1 = " " + name + '="' + escape(value) + '"';
            return new written(true, name, __goscriptLiteralField1);
          })());
          break;
        }
      }
    }
    if (stringEqual(n.Tag, "input")) {
      list = inputOrder(list);
    }
    if (stringEqual(n.Tag, "button")) {
      list = nameLast(list);
    }
    if (stringEqual(n.Tag, "option")) {
      let selected = flagSelected;
      if (scope.has) {
        selected = optionMatches(n, scope.value);
      }
      if (selected) {
        list = appendOne(list, new written(true, "selected", ' selected=""'));
      }
    }
    if (stringEqual(n.Tag, "img")) {
      void (s !== null && s.__isVarRef !== true && s.__goValue === void 0 ? s.preloadImage(n) : _htmlState.prototype.preloadImage.call(s, n));
    }
    return [list, textareaValue, hasTextareaValue];
  }
  element(n, scope) {
    const s = this;
    const s$ = s == null ? pointerTarget(s) : s.__isVarRef === true ? s.value : s.__goValue === void 0 ? s : pointerTarget(s);
    let __goscriptTuple0 = s !== null && s.__isVarRef !== true && s.__goValue === void 0 ? s.attributes(n, scope) : _htmlState.prototype.attributes.call(s, n, scope);
    let attrs = __goscriptTuple0[0];
    let textareaValue = __goscriptTuple0[1];
    let hasTextareaValue = __goscriptTuple0[2];
    ;
    s$.out += "<" + n.Tag;
    for (let __goscriptRangeTarget1 = attrs, __goscriptRangeWindow1 = sliceRange(__goscriptRangeTarget1), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow1.length; __rangeIndex++) {
      let a = __goscriptRangeWindow1.backing[__goscriptRangeWindow1.offset + __rangeIndex].clone();
      ;
      s$.out += a.text;
    }
    if (mapGet(_void, n.Tag, false)[0]) {
      ;
      s$.out += "/>";
      return;
    }
    ;
    s$.out += ">";
    switch (n.Tag) {
      case "textarea": {
        let content = textareaValue;
        if (!hasTextareaValue && sliceLen(n.Kids) == 1 && plainSliceIndex(n.Kids, 0).Kind == 2) {
          content = plainSliceIndex(n.Kids, 0).Text;
        }
        if (stringLen(content) > 0 && indexString(content, 0) == 10) {
          ;
          s$.out += "\n";
        }
        ;
        s$.out += escape(content);
        break;
      }
      case "select": {
        let inner = new selectScope(true);
        for (let __goscriptRangeTarget2 = n.Attrs, __goscriptRangeWindow2 = sliceRange(__goscriptRangeTarget2), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow2.length; __rangeIndex++) {
          let a = __goscriptRangeWindow2.backing[__goscriptRangeWindow2.offset + __rangeIndex].clone();
          if (stringEqual(a.Name, "value") && !a.Flag) {
            inner = inner.__goscriptAssign(new selectScope(true, true, a.Value));
          }
        }
        for (let __goscriptRangeTarget3 = n.Kids, __goscriptRangeWindow3 = sliceRange(__goscriptRangeTarget3), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow3.length; __rangeIndex++) {
          let k = __goscriptRangeWindow3.backing[__goscriptRangeWindow3.offset + __rangeIndex].clone();
          void (s !== null && s.__isVarRef !== true && s.__goValue === void 0 ? s.write(k.clone(), inner) : _htmlState.prototype.write.call(s, k.clone(), inner));
        }
        break;
      }
      default: {
        for (let __goscriptRangeTarget4 = n.Kids, __goscriptRangeWindow4 = sliceRange(__goscriptRangeTarget4), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow4.length; __rangeIndex++) {
          let k = __goscriptRangeWindow4.backing[__goscriptRangeWindow4.offset + __rangeIndex].clone();
          void (s !== null && s.__isVarRef !== true && s.__goValue === void 0 ? s.write(k.clone(), scope) : _htmlState.prototype.write.call(s, k.clone(), scope));
        }
        break;
      }
    }
    ;
    s$.out += "</" + n.Tag + ">";
  }
  preloadImage(n) {
    const s = this;
    const s$ = s == null ? pointerTarget(s) : s.__isVarRef === true ? s.value : s.__goValue === void 0 ? s : pointerTarget(s);
    let src = "";
    let hasSrc = false;
    let typeValue = "";
    let hasType = false;
    for (let __goscriptRangeTarget5 = n.Attrs, __goscriptRangeWindow5 = sliceRange(__goscriptRangeTarget5), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow5.length; __rangeIndex++) {
      let a = __goscriptRangeWindow5.backing[__goscriptRangeWindow5.offset + __rangeIndex];
      if (stringEqual(a.Name, "src") && !a.Flag) {
        let __goscriptAssign1_0 = a.Value;
        let __goscriptAssign1_1 = true;
        src = __goscriptAssign1_0;
        hasSrc = __goscriptAssign1_1;
      }
      if (stringEqual(a.Name, "type") && !a.Flag) {
        let __goscriptAssign2_0 = a.Value;
        let __goscriptAssign2_1 = true;
        typeValue = __goscriptAssign2_0;
        hasType = __goscriptAssign2_1;
      }
    }
    if (!hasSrc || stringEqual(src, "") || hasPrefixFold(src, "data:")) {
      return;
    }
    for (let __goscriptRangeTarget6 = s$.seen, __goscriptRangeWindow6 = sliceRange(__goscriptRangeTarget6), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow6.length; __rangeIndex++) {
      let __goscriptRangeShadow0 = __goscriptRangeWindow6.backing[__goscriptRangeWindow6.offset + __rangeIndex];
      if (stringEqual(__goscriptRangeShadow0, src)) {
        return;
      }
    }
    ;
    s$.seen = appendOne(s$.seen, src);
    if (isJavascriptURL(src)) {
      src = "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')";
    }
    let link = '<link rel="preload" as="image" href="' + escape(src) + '"';
    if (hasType) {
      link += ' type="' + escape(typeValue) + '"';
    }
    ;
    s$.preloads += link + "/>";
  }
  write(n, scope) {
    const s = this;
    const s$ = s == null ? pointerTarget(s) : s.__isVarRef === true ? s.value : s.__goValue === void 0 ? s : pointerTarget(s);
    switch (n.Kind) {
      case 2: {
        ;
        s$.out += escape(n.Text);
        break;
      }
      case 3: {
        for (let __goscriptRangeTarget7 = n.Kids, __goscriptRangeWindow7 = sliceRange(__goscriptRangeTarget7), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow7.length; __rangeIndex++) {
          let k = __goscriptRangeWindow7.backing[__goscriptRangeWindow7.offset + __rangeIndex].clone();
          void (s !== null && s.__isVarRef !== true && s.__goValue === void 0 ? s.write(k.clone(), scope) : _htmlState.prototype.write.call(s, k.clone(), scope));
        }
        break;
      }
      case 1: {
        void (s !== null && s.__isVarRef !== true && s.__goValue === void 0 ? s.element(n, scope) : _htmlState.prototype.element.call(s, n, scope));
        break;
      }
    }
  }
  static __typeInfo = registerStructType(
    "gobi.htmlState",
    () => new _htmlState(),
    () => [{ name: "attributes", args: [{ type: { kind: "basic" /* Basic */, name: "unknown" } }, { type: { kind: "basic" /* Basic */, name: "unknown" } }], returns: [{ type: /* @__PURE__ */ sliceType("gobi.written") }, { type: /* @__PURE__ */ basicType("string") }, { type: /* @__PURE__ */ basicType("bool") }], pointerReceiver: true }, { name: "element", args: [{ type: { kind: "basic" /* Basic */, name: "unknown" } }, { type: { kind: "basic" /* Basic */, name: "unknown" } }], returns: [], pointerReceiver: true }, { name: "preloadImage", args: [{ type: { kind: "basic" /* Basic */, name: "unknown" } }], returns: [], pointerReceiver: true }, { name: "write", args: [{ type: { kind: "basic" /* Basic */, name: "unknown" } }, { type: { kind: "basic" /* Basic */, name: "unknown" } }], returns: [], pointerReceiver: true }],
    _htmlState,
    () => [{ name: "out", key: "out", type: /* @__PURE__ */ basicType("string") }, { name: "preloads", key: "preloads", type: /* @__PURE__ */ basicType("string") }, { name: "seen", key: "seen", type: /* @__PURE__ */ sliceType(/* @__PURE__ */ basicType("string")) }]
  );
};
var selectScope = class _selectScope {
  constructor(__goscriptValue, has$, value$) {
    this.has = has$ ?? false;
    this.value = value$ ?? "";
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _selectScope(true, this.has, this.value);
  }
  __goscriptAssign(source) {
    this.has = source.has;
    this.value = source.value;
    return this;
  }
  static __typeInfo = registerStructType(
    "gobi.selectScope",
    () => new _selectScope(),
    () => [],
    _selectScope,
    () => [{ name: "has", key: "has", type: /* @__PURE__ */ basicType("bool") }, { name: "value", key: "value", type: /* @__PURE__ */ basicType("string") }]
  );
};
var written = class _written {
  constructor(__goscriptValue, name$, text$) {
    this.name = name$ ?? "";
    this.text = text$ ?? "";
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _written(true, this.name, this.text);
  }
  __goscriptAssign(source) {
    this.name = source.name;
    this.text = source.text;
    return this;
  }
  static __typeInfo = registerStructType(
    "gobi.written",
    () => new _written(),
    () => [],
    _written,
    () => [{ name: "name", key: "name", type: /* @__PURE__ */ basicType("string") }, { name: "text", key: "text", type: /* @__PURE__ */ basicType("string") }]
  );
};
var _void = makeMap([["area", true], ["base", true], ["br", true], ["col", true], ["embed", true], ["hr", true], ["img", true], ["input", true], ["link", true], ["meta", true], ["source", true], ["track", true], ["wbr", true]]);
function inputOrder(list) {
  let out = null;
  for (let __goscriptRangeTarget8 = list, __goscriptRangeWindow8 = sliceRange(__goscriptRangeTarget8), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow8.length; __rangeIndex++) {
    let a = __goscriptRangeWindow8.backing[__goscriptRangeWindow8.offset + __rangeIndex].clone();
    if (!stringEqual(a.name, "name") && !stringEqual(a.name, "checked") && !stringEqual(a.name, "value")) {
      out = appendOne(out, a.clone());
    }
  }
  for (let __goscriptRangeTarget10 = arrayToSlice(["name", "checked", "value"]), __goscriptRangeWindow9 = sliceRange(__goscriptRangeTarget10), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow9.length; __rangeIndex++) {
    let last = __goscriptRangeWindow9.backing[__goscriptRangeWindow9.offset + __rangeIndex];
    for (let __goscriptRangeTarget9 = list, __goscriptRangeWindow10 = sliceRange(__goscriptRangeTarget9), __rangeIndex2 = 0; __rangeIndex2 < __goscriptRangeWindow10.length; __rangeIndex2++) {
      let a = __goscriptRangeWindow10.backing[__goscriptRangeWindow10.offset + __rangeIndex2].clone();
      if (stringEqual(a.name, last)) {
        out = appendOne(out, a.clone());
      }
    }
  }
  return out;
}
function nameLast(list) {
  let out = null;
  for (let __goscriptRangeTarget11 = list, __goscriptRangeWindow11 = sliceRange(__goscriptRangeTarget11), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow11.length; __rangeIndex++) {
    let a = __goscriptRangeWindow11.backing[__goscriptRangeWindow11.offset + __rangeIndex].clone();
    if (!stringEqual(a.name, "name")) {
      out = appendOne(out, a.clone());
    }
  }
  for (let __goscriptRangeTarget12 = list, __goscriptRangeWindow12 = sliceRange(__goscriptRangeTarget12), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow12.length; __rangeIndex++) {
    let a = __goscriptRangeWindow12.backing[__goscriptRangeWindow12.offset + __rangeIndex].clone();
    if (stringEqual(a.name, "name")) {
      out = appendOne(out, a.clone());
    }
  }
  return out;
}
function optionMatches(n, value) {
  for (let __goscriptRangeTarget13 = n.Attrs, __goscriptRangeWindow13 = sliceRange(__goscriptRangeTarget13), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow13.length; __rangeIndex++) {
    let a = __goscriptRangeWindow13.backing[__goscriptRangeWindow13.offset + __rangeIndex];
    if (stringEqual(a.Name, "value") && !a.Flag) {
      return stringEqual(a.Value, value);
    }
  }
  let text = "";
  for (let __goscriptRangeTarget14 = n.Kids, __goscriptRangeWindow14 = sliceRange(__goscriptRangeTarget14), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow14.length; __rangeIndex++) {
    let k = __goscriptRangeWindow14.backing[__goscriptRangeWindow14.offset + __rangeIndex];
    if (k.Kind != 2) {
      return false;
    }
    text += k.Text;
  }
  return stringEqual(joinSurrogates(text), joinSurrogates(value));
}
function isJavascriptURL(url) {
  let i = 0;
  while (i < stringLen(url) && (indexString(url, i) <= 31 || indexString(url, i) == 32)) {
    i++;
  }
  let word = "javascript";
  for (let w = 0; w < stringLen(word); w++) {
    while (i < stringLen(url) && (indexString(url, i) == 9 || indexString(url, i) == 10 || indexString(url, i) == 13) && w > 0) {
      i++;
    }
    if (i >= stringLen(url)) {
      return false;
    }
    let c = indexString(url, i);
    if (c >= 65 && c <= 90) {
      c = uint((c - 65 & 255) + 97 & 255, 8);
    }
    if (c != indexString(word, w)) {
      return false;
    }
    i++;
  }
  while (i < stringLen(url) && (indexString(url, i) == 9 || indexString(url, i) == 10 || indexString(url, i) == 13)) {
    i++;
  }
  return i < stringLen(url) && indexString(url, i) == 58;
}
function joinSurrogates(s) {
  let found = false;
  for (let i = 0; i + 5 < stringLen(s); i++) {
    if (indexString(s, i) == 237 && indexString(s, i + 1) >= 160 && indexString(s, i + 1) <= 175 && indexString(s, i + 3) == 237 && indexString(s, i + 4) >= 176 && indexString(s, i + 4) <= 191) {
      found = true;
    }
  }
  if (!found) {
    return s;
  }
  let out = "";
  for (let i = 0; i < stringLen(s); i++) {
    if (indexString(s, i) == 237 && i + 5 < stringLen(s) && indexString(s, i + 1) >= 160 && indexString(s, i + 1) <= 175 && indexString(s, i + 3) == 237 && indexString(s, i + 4) >= 176 && indexString(s, i + 4) <= 191) {
      let high = 53248 + intShl(indexString(s, i + 1) & 63, 6) + (indexString(s, i + 2) & 63);
      let low = 53248 + intShl(indexString(s, i + 4) & 63, 6) + (indexString(s, i + 5) & 63);
      let r = 65536 + intShl(high - 55296, 10) + (low - 56320);
      out += bytesToString(new Uint8Array([uint(intOr(240, intShr(r, 18)), 8), uint(intOr(128, intShr(r, 12) & 63), 8), uint(intOr(128, intShr(r, 6) & 63), 8), uint(intOr(128, r & 63), 8)]));
      i += 5;
      continue;
    }
    out += sliceStringOrBytes(s, i, i + 1);
  }
  return out;
}
function styleText(styles) {
  let keys = null;
  let values = null;
  for (let __goscriptRangeTarget16 = styles, __goscriptRangeWindow15 = sliceRange(__goscriptRangeTarget16), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow15.length; __rangeIndex++) {
    let st = __goscriptRangeWindow15.backing[__goscriptRangeWindow15.offset + __rangeIndex].clone();
    let key = StyleKey(st.Property);
    let found = false;
    for (let __goscriptRangeTarget15 = keys, __goscriptRangeWindow16 = sliceRange(__goscriptRangeTarget15), __goscriptSliceWindow0 = sliceRange(values), i = 0; i < __goscriptRangeWindow16.length; i++) {
      if (stringEqual(__goscriptRangeWindow16.backing[__goscriptRangeWindow16.offset + i], key)) {
        ;
        __goscriptSliceWindow0.backing[windowSlot(__goscriptSliceWindow0, i)] = st.Value;
        found = true;
      }
    }
    if (!found) {
      keys = appendOne(keys, key);
      values = appendOne(values, st.Value);
    }
  }
  let css = "";
  for (let __goscriptRangeTarget17 = keys, __goscriptRangeWindow17 = sliceRange(__goscriptRangeTarget17), __goscriptSliceWindow1 = sliceRange(values), i = 0; i < __goscriptRangeWindow17.length; i++) {
    if (stringEqual(__goscriptSliceWindow1.backing[windowSlot(__goscriptSliceWindow1, i)], "")) {
      continue;
    }
    if (!stringEqual(css, "")) {
      css += ";";
    }
    css += hyphenate(__goscriptRangeWindow17.backing[__goscriptRangeWindow17.offset + i]) + ":" + trimJS(__goscriptSliceWindow1.backing[windowSlot(__goscriptSliceWindow1, i)]);
  }
  return css;
}
function hyphenate(key) {
  if (stringLen(key) >= 2 && indexString(key, 0) == 45 && indexString(key, 1) == 45) {
    return key;
  }
  if (stringLen(key) > 2 && sliceStringEqual(key, void 0, 2, "ms") && indexString(key, 2) >= 65 && indexString(key, 2) <= 90) {
    key = "-" + key;
  }
  let out = "";
  for (let i = 0; i < stringLen(key); i++) {
    let c = indexString(key, i);
    if (c >= 65 && c <= 90) {
      out += "-" + runeToString(uint((c - 65 & 255) + 97 & 255, 8));
    } else {
      out += sliceStringOrBytes(key, i, i + 1);
    }
  }
  return out;
}
function hasPrefix(s, prefix) {
  return stringLen(s) >= stringLen(prefix) && sliceStringEqual(s, void 0, stringLen(prefix), prefix);
}
function hasPrefixFold(s, prefix) {
  if (stringLen(s) < stringLen(prefix)) {
    return false;
  }
  for (let i = 0; i < stringLen(prefix); i++) {
    let c = indexString(s, i);
    if (c >= 65 && c <= 90) {
      c = uint((c - 65 & 255) + 97 & 255, 8);
    }
    if (c != indexString(prefix, i)) {
      return false;
    }
  }
  return true;
}
function isJSSpace(r) {
  switch (r) {
    case 9:
    case 10:
    case 11:
    case 12:
    case 13:
    case 32:
    case 160:
    case 5760:
    case 8232:
    case 8233:
    case 8239:
    case 8287:
    case 12288:
    case 65279: {
      return true;
      break;
    }
  }
  return r >= 8192 && r <= 8202;
}
function trimJS(s) {
  let start = stringLen(s);
  let end = stringLen(s);
  let lastWasText = false;
  for (let __goscriptRunes0 = stringRunes(s); __goscriptRunes0.next(); ) {
    const i = __goscriptRunes0.index;
    const r = __goscriptRunes0.rune;
    if (isJSSpace(r)) {
      if (lastWasText) {
        end = i;
      }
      lastWasText = false;
      continue;
    }
    if (start == stringLen(s)) {
      start = i;
    }
    lastWasText = true;
    end = stringLen(s);
  }
  if (start == stringLen(s)) {
    return "";
  }
  return sliceStringOrBytes(s, start, end);
}
function numberIsNaN(s) {
  s = trimJS(s);
  if (stringEqual(s, "")) {
    return false;
  }
  if (stringLen(s) > 2 && indexString(s, 0) == 48) {
    let base = 0;
    switch (indexString(s, 1)) {
      case 120:
      case 88: {
        base = 16;
        break;
      }
      case 111:
      case 79: {
        base = 8;
        break;
      }
      case 98:
      case 66: {
        base = 2;
        break;
      }
    }
    if (base != 0) {
      for (let i2 = 2; i2 < stringLen(s); i2++) {
        if (digitValue(indexString(s, i2)) >= base) {
          return true;
        }
      }
      return false;
    }
  }
  let i = 0;
  if (indexString(s, i) == 43 || indexString(s, i) == 45) {
    i++;
  }
  if (sliceStringEqual(s, i, void 0, "Infinity")) {
    return false;
  }
  let digits = 0;
  while (i < stringLen(s) && indexString(s, i) >= 48 && indexString(s, i) <= 57) {
    i++;
    digits++;
  }
  if (i < stringLen(s) && indexString(s, i) == 46) {
    i++;
    while (i < stringLen(s) && indexString(s, i) >= 48 && indexString(s, i) <= 57) {
      i++;
      digits++;
    }
  }
  if (digits == 0) {
    return true;
  }
  if (i < stringLen(s) && (indexString(s, i) == 101 || indexString(s, i) == 69)) {
    i++;
    if (i < stringLen(s) && (indexString(s, i) == 43 || indexString(s, i) == 45)) {
      i++;
    }
    let exponent = 0;
    while (i < stringLen(s) && indexString(s, i) >= 48 && indexString(s, i) <= 57) {
      i++;
      exponent++;
    }
    if (exponent == 0) {
      return true;
    }
  }
  return i != stringLen(s);
}
function digitValue(c) {
  switch (true) {
    case (c >= 48 && c <= 57): {
      return uint(c - 48 & 255, 8);
      break;
    }
    case (c >= 97 && c <= 102): {
      return uint(c - 97 & 255, 8) + 10;
      break;
    }
    case (c >= 65 && c <= 70): {
      return uint(c - 65 & 255, 8) + 10;
      break;
    }
  }
  return 99;
}
function escape(s) {
  let out = "";
  for (let i = 0; i < stringLen(s); i++) {
    switch (indexString(s, i)) {
      case 38: {
        out += "&amp;";
        break;
      }
      case 60: {
        out += "&lt;";
        break;
      }
      case 62: {
        out += "&gt;";
        break;
      }
      case 34: {
        out += "&quot;";
        break;
      }
      case 39: {
        out += "&#x27;";
        break;
      }
      default: {
        out += sliceStringOrBytes(s, i, i + 1);
        break;
      }
    }
  }
  return out;
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/github.com/samuelpmahan/gondola/counter/counter.gs.ts
registerTypePackagePath("github.com/samuelpmahan/gondola/counter", ["counter.State"]);
var State = class _State {
  constructor(__goscriptValue, Count$) {
    this.Count = Count$ ?? 0;
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _State(true, this.Count);
  }
  __goscriptAssign(source) {
    this.Count = source.Count;
    return this;
  }
  static __typeInfo = registerStructType(
    "counter.State",
    () => new _State(),
    () => [],
    _State,
    () => [{ name: "Count", key: "Count", type: /* @__PURE__ */ basicType("float64") }]
  );
};
function Init() {
  return new State(true);
}
function Update(s, m) {
  switch (m.Name) {
    case "add": {
      s.Count++;
      break;
    }
    case "reset": {
      s.Count = 0;
      break;
    }
  }
  return [s, null];
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle/app.gs.ts
registerTypePackagePath("github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", ["lifecycle.NodeState", "lifecycle.State"]);
var NodeState = class _NodeState {
  constructor(__goscriptValue, ID$, ParentID$, Generation$, RequestID$, Alive$, Requested$, Pending$, Token$, Reply$, Counter$) {
    this.ID = ID$ ?? "";
    this.ParentID = ParentID$ ?? "";
    this.Generation = Generation$ ?? 0n;
    this.RequestID = RequestID$ ?? 0n;
    this.Alive = Alive$ ?? false;
    this.Requested = Requested$ ?? false;
    this.Pending = Pending$ ?? false;
    this.Token = Token$ ?? "";
    this.Reply = Reply$ ?? "";
    this.Counter = Counter$ ?? new State(true);
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _NodeState(true, this.ID, this.ParentID, this.Generation, this.RequestID, this.Alive, this.Requested, this.Pending, this.Token, this.Reply, this.Counter.clone());
  }
  __goscriptAssign(source) {
    this.ID = source.ID;
    this.ParentID = source.ParentID;
    this.Generation = source.Generation;
    this.RequestID = source.RequestID;
    this.Alive = source.Alive;
    this.Requested = source.Requested;
    this.Pending = source.Pending;
    this.Token = source.Token;
    this.Reply = source.Reply;
    this.Counter.__goscriptAssign(source.Counter);
    return this;
  }
  static __typeInfo = registerStructType(
    "lifecycle.NodeState",
    () => new _NodeState(),
    () => [],
    _NodeState,
    () => [{ name: "ID", key: "ID", type: /* @__PURE__ */ basicType("string") }, { name: "ParentID", key: "ParentID", type: /* @__PURE__ */ basicType("string") }, { name: "Generation", key: "Generation", type: /* @__PURE__ */ basicType("uint64") }, { name: "RequestID", key: "RequestID", type: /* @__PURE__ */ basicType("uint64") }, { name: "Alive", key: "Alive", type: /* @__PURE__ */ basicType("bool") }, { name: "Requested", key: "Requested", type: /* @__PURE__ */ basicType("bool") }, { name: "Pending", key: "Pending", type: /* @__PURE__ */ basicType("bool") }, { name: "Token", key: "Token", type: /* @__PURE__ */ basicType("string") }, { name: "Reply", key: "Reply", type: /* @__PURE__ */ basicType("string") }, { name: "Counter", key: "Counter", type: "counter.State" }]
  );
};
var State2 = class _State {
  constructor(__goscriptValue, Parent$, Child$, Grandchild$, Sibling$, NextRequestID$) {
    this.Parent = Parent$ ?? new NodeState(true);
    this.Child = Child$ ?? new NodeState(true);
    this.Grandchild = Grandchild$ ?? new NodeState(true);
    this.Sibling = Sibling$ ?? new NodeState(true);
    this.NextRequestID = NextRequestID$ ?? 0n;
    this.__goStructValue = __goscriptValue === true;
  }
  clone() {
    return new _State(true, this.Parent.clone(), this.Child.clone(), this.Grandchild.clone(), this.Sibling.clone(), this.NextRequestID);
  }
  __goscriptAssign(source) {
    this.Parent.__goscriptAssign(source.Parent);
    this.Child.__goscriptAssign(source.Child);
    this.Grandchild.__goscriptAssign(source.Grandchild);
    this.Sibling.__goscriptAssign(source.Sibling);
    this.NextRequestID = source.NextRequestID;
    return this;
  }
  static __typeInfo = registerStructType(
    "lifecycle.State",
    () => new _State(),
    () => [],
    _State,
    () => [{ name: "Parent", key: "Parent", type: "lifecycle.NodeState" }, { name: "Child", key: "Child", type: "lifecycle.NodeState" }, { name: "Grandchild", key: "Grandchild", type: "lifecycle.NodeState" }, { name: "Sibling", key: "Sibling", type: "lifecycle.NodeState" }, { name: "NextRequestID", key: "NextRequestID", type: /* @__PURE__ */ basicType("uint64") }]
  );
};
function Init2() {
  return new State2(true, (() => {
    const __goscriptLiteralField0 = Init();
    return new NodeState(true, "parent", "", 1n, void 0, true, void 0, void 0, void 0, void 0, __goscriptLiteralField0);
  })(), (() => {
    const __goscriptLiteralField1 = Init();
    return new NodeState(true, "child", "parent", 1n, void 0, true, void 0, void 0, void 0, void 0, __goscriptLiteralField1);
  })(), (() => {
    const __goscriptLiteralField2 = Init();
    return new NodeState(true, "grandchild", "child", 1n, void 0, true, void 0, void 0, void 0, void 0, __goscriptLiteralField2);
  })(), (() => {
    const __goscriptLiteralField3 = Init();
    return new NodeState(true, "sibling", "", 1n, void 0, true, void 0, void 0, void 0, void 0, __goscriptLiteralField3);
  })());
}
function Update2(state, message) {
  switch (message.Name) {
    case "addParent": {
      if (state.Parent.Alive) {
        let __goscriptTuple0 = Update(state.Parent.Counter.clone(), new Message(true, "add"));
        state.Parent.Counter.__goscriptAssign(__goscriptTuple0[0]);
      }
      break;
    }
    case "addChild": {
      if (state.Child.Alive) {
        let __goscriptTuple1 = Update(state.Child.Counter.clone(), new Message(true, "add"));
        state.Child.Counter.__goscriptAssign(__goscriptTuple1[0]);
      }
      break;
    }
    case "addGrandchild": {
      if (state.Grandchild.Alive) {
        let __goscriptTuple2 = Update(state.Grandchild.Counter.clone(), new Message(true, "add"));
        state.Grandchild.Counter.__goscriptAssign(__goscriptTuple2[0]);
      }
      break;
    }
    case "addSibling": {
      if (state.Sibling.Alive) {
        let __goscriptTuple3 = Update(state.Sibling.Counter.clone(), new Message(true, "add"));
        state.Sibling.Counter.__goscriptAssign(__goscriptTuple3[0]);
      }
      break;
    }
    case "requestParent": {
      return requestParent(state.clone());
      break;
    }
    case "requestChild": {
      return requestChild(state.clone());
      break;
    }
    case "requestGrandchild": {
      return requestGrandchild(state.clone());
      break;
    }
    case "requestSibling": {
      return requestSibling(state.clone());
      break;
    }
    case "removeParent": {
      return removeParent(state.clone());
      break;
    }
    case "remountParent": {
      return remountParent(state.clone());
      break;
    }
    case "complete": {
      return complete(state.clone(), message.Arg);
      break;
    }
  }
  return [state, arrayToSlice([])];
}
function requestParent(state) {
  if (!state.Parent.Alive || state.Parent.Requested) {
    return [state, arrayToSlice([])];
  }
  if (state.NextRequestID < 9007199254740991n) {
    state.NextRequestID++;
    state.Parent.Requested = true;
    state.Parent.Pending = true;
    state.Parent.RequestID = state.NextRequestID;
    state.Parent.Token = tokenFor("parent", state.Parent.Generation, state.Parent.RequestID);
    return [state.clone(), arrayToSlice([requestEffect(state.Parent.Token)])];
  }
  return [state, arrayToSlice([])];
}
function requestChild(state) {
  if (!state.Child.Alive || state.Child.Requested) {
    return [state, arrayToSlice([])];
  }
  if (state.NextRequestID < 9007199254740991n) {
    state.NextRequestID++;
    state.Child.Requested = true;
    state.Child.Pending = true;
    state.Child.RequestID = state.NextRequestID;
    state.Child.Token = tokenFor("child", state.Child.Generation, state.Child.RequestID);
    return [state.clone(), arrayToSlice([requestEffect(state.Child.Token)])];
  }
  return [state, arrayToSlice([])];
}
function requestGrandchild(state) {
  if (!state.Grandchild.Alive || state.Grandchild.Requested) {
    return [state, arrayToSlice([])];
  }
  if (state.NextRequestID < 9007199254740991n) {
    state.NextRequestID++;
    state.Grandchild.Requested = true;
    state.Grandchild.Pending = true;
    state.Grandchild.RequestID = state.NextRequestID;
    state.Grandchild.Token = tokenFor("grandchild", state.Grandchild.Generation, state.Grandchild.RequestID);
    return [state.clone(), arrayToSlice([requestEffect(state.Grandchild.Token)])];
  }
  return [state, arrayToSlice([])];
}
function requestSibling(state) {
  if (!state.Sibling.Alive || state.Sibling.Requested) {
    return [state, arrayToSlice([])];
  }
  if (state.NextRequestID < 9007199254740991n) {
    state.NextRequestID++;
    state.Sibling.Requested = true;
    state.Sibling.Pending = true;
    state.Sibling.RequestID = state.NextRequestID;
    state.Sibling.Token = tokenFor("sibling", state.Sibling.Generation, state.Sibling.RequestID);
    return [state.clone(), arrayToSlice([requestEffect(state.Sibling.Token)])];
  }
  return [state, arrayToSlice([])];
}
function removeParent(state) {
  if (!state.Parent.Alive) {
    return [state, arrayToSlice([])];
  }
  let effects = arrayToSlice([]);
  if (state.Grandchild.Pending) {
    effects = appendOne(effects, cancelEffect(state.Grandchild.Token));
  }
  if (state.Child.Pending) {
    effects = appendOne(effects, cancelEffect(state.Child.Token));
  }
  if (state.Parent.Pending) {
    effects = appendOne(effects, cancelEffect(state.Parent.Token));
  }
  state.Grandchild.Alive = false;
  state.Grandchild.Pending = false;
  state.Grandchild.Token = "";
  state.Child.Alive = false;
  state.Child.Pending = false;
  state.Child.Token = "";
  state.Parent.Alive = false;
  state.Parent.Pending = false;
  state.Parent.Token = "";
  return [state, effects];
}
function remountParent(state) {
  if (state.Parent.Alive) {
    return [state, arrayToSlice([])];
  }
  if (state.Parent.Generation >= 9007199254740991n || state.Child.Generation >= 9007199254740991n || state.Grandchild.Generation >= 9007199254740991n) {
    return [state, arrayToSlice([])];
  }
  if (state.Parent.Generation < 9007199254740991n) {
    state.Parent.Generation++;
  }
  if (state.Child.Generation < 9007199254740991n) {
    state.Child.Generation++;
  }
  if (state.Grandchild.Generation < 9007199254740991n) {
    state.Grandchild.Generation++;
  }
  state.Parent.Alive = true;
  state.Parent.Requested = false;
  state.Parent.Pending = false;
  state.Parent.RequestID = 0n;
  state.Parent.Token = "";
  state.Parent.Reply = "";
  state.Parent.Counter.__goscriptAssign(Init());
  state.Child.Alive = true;
  state.Child.Requested = false;
  state.Child.Pending = false;
  state.Child.RequestID = 0n;
  state.Child.Token = "";
  state.Child.Reply = "";
  state.Child.Counter.__goscriptAssign(Init());
  state.Grandchild.Alive = true;
  state.Grandchild.Requested = false;
  state.Grandchild.Pending = false;
  state.Grandchild.RequestID = 0n;
  state.Grandchild.Token = "";
  state.Grandchild.Reply = "";
  state.Grandchild.Counter.__goscriptAssign(Init());
  return [state, arrayToSlice([])];
}
function complete(state, token) {
  if (state.Parent.Alive && state.Parent.Pending && stringEqual(state.Parent.Token, token)) {
    state.Parent.Pending = false;
    state.Parent.Reply = token;
  } else {
    if (state.Child.Alive && state.Child.Pending && stringEqual(state.Child.Token, token)) {
      state.Child.Pending = false;
      state.Child.Reply = token;
    } else {
      if (state.Grandchild.Alive && state.Grandchild.Pending && stringEqual(state.Grandchild.Token, token)) {
        state.Grandchild.Pending = false;
        state.Grandchild.Reply = token;
      } else {
        if (state.Sibling.Alive && state.Sibling.Pending && stringEqual(state.Sibling.Token, token)) {
          state.Sibling.Pending = false;
          state.Sibling.Reply = token;
        }
      }
    }
  }
  return [state, arrayToSlice([])];
}
function tokenFor(scope, generation, requestID) {
  return scope + ":g" + FormatUint(generation, 10) + ":r" + FormatUint(requestID, 10);
}
function requestEffect(token) {
  return new Effect(true, "fixture.request", "lookup", token, "complete");
}
function cancelEffect(token) {
  return new Effect(true, "lifecycle.cancel", "cancel", token, "");
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle/view.gs.ts
function InitViewStateLabel(node, label) {
  let count = FormatFloat(node.Counter.Count, 102, -1, 64);
  let status = "idle";
  if (node.Pending) {
    status = "pending " + node.Token;
  }
  if (!stringEqual(node.Reply, "")) {
    status = "complete " + node.Reply;
  }
  return label + ": live; count=" + count + "; " + status;
}
function nodeView(node, label, addMessage, requestMessage, children) {
  let status = markAsStructValue(cloneStructValue(El("p", arrayToSlice([Txt(InitViewStateLabel(node, label))])))).Keyed(node.ID + "-status");
  let add = markAsStructValue(cloneStructValue(markAsStructValue(cloneStructValue(markAsStructValue(cloneStructValue(El("button", arrayToSlice([Txt(label + " +")])))).Set("class", "lifecycle-add"))).Keyed(node.ID + "-add"))).Handle("click", addMessage, "");
  let request = markAsStructValue(cloneStructValue(markAsStructValue(cloneStructValue(markAsStructValue(cloneStructValue(El("button", arrayToSlice([Txt("Request " + lowerLabel(label))])))).Set("class", "lifecycle-request"))).Keyed(node.ID + "-request"))).Handle("click", requestMessage, "");
  if (node.Requested) {
    request = request.__goscriptAssign(markAsStructValue(cloneStructValue(request)).Flag("disabled"));
  }
  let kids = arrayToSlice([status, add, request]);
  for (let __goscriptRangeTarget0 = children, __goscriptRangeWindow0 = sliceRange(__goscriptRangeTarget0), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow0.length; __rangeIndex++) {
    let child = __goscriptRangeWindow0.backing[__goscriptRangeWindow0.offset + __rangeIndex].clone();
    kids = appendOne(kids, child.clone());
  }
  return markAsStructValue(cloneStructValue(markAsStructValue(cloneStructValue(El("section", kids))).Set("class", "lifecycle-node lifecycle-" + node.ID))).Keyed(node.ID);
}
function lowerLabel(label) {
  switch (label) {
    case "Parent": {
      return "parent";
      break;
    }
    case "Child": {
      return "child";
      break;
    }
    case "Grandchild": {
      return "grandchild";
      break;
    }
    case "Sibling": {
      return "sibling";
      break;
    }
  }
  return "node";
}
function View2(state) {
  let parent = new Node(true);
  if (state.Parent.Alive) {
    let grandchild = markAsStructValue(cloneStructValue(markAsStructValue(cloneStructValue(El("p", arrayToSlice([Txt("Grandchild: removed")])))).Set("class", "lifecycle-removed"))).Keyed("grandchild-removed");
    if (state.Grandchild.Alive) {
      grandchild = grandchild.__goscriptAssign(nodeView(state.Grandchild.clone(), "Grandchild", "addGrandchild", "requestGrandchild", null));
    }
    let child = markAsStructValue(cloneStructValue(markAsStructValue(cloneStructValue(El("p", arrayToSlice([Txt("Child: removed")])))).Set("class", "lifecycle-removed"))).Keyed("child-removed");
    if (state.Child.Alive) {
      child = child.__goscriptAssign(nodeView(state.Child.clone(), "Child", "addChild", "requestChild", arrayToSlice([grandchild])));
    }
    parent = parent.__goscriptAssign(nodeView(state.Parent.clone(), "Parent", "addParent", "requestParent", arrayToSlice([child])));
  } else {
    parent = parent.__goscriptAssign(markAsStructValue(cloneStructValue(markAsStructValue(cloneStructValue(El("p", arrayToSlice([Txt("Parent: removed")])))).Set("class", "lifecycle-removed"))).Keyed("parent-removed"));
  }
  let sibling = nodeView(state.Sibling.clone(), "Sibling", "addSibling", "requestSibling", null);
  let remove = markAsStructValue(cloneStructValue(markAsStructValue(cloneStructValue(markAsStructValue(cloneStructValue(El("button", arrayToSlice([Txt("Remove parent")])))).Set("class", "lifecycle-remove"))).Keyed("parent-remove"))).Handle("click", "removeParent", "");
  if (!state.Parent.Alive) {
    remove = remove.__goscriptAssign(markAsStructValue(cloneStructValue(remove)).Flag("disabled"));
  }
  let remount = markAsStructValue(cloneStructValue(markAsStructValue(cloneStructValue(markAsStructValue(cloneStructValue(El("button", arrayToSlice([Txt("Remount parent")])))).Set("class", "lifecycle-remount"))).Keyed("parent-remount"))).Handle("click", "remountParent", "");
  if (state.Parent.Alive) {
    remount = remount.__goscriptAssign(markAsStructValue(cloneStructValue(remount)).Flag("disabled"));
  }
  let controls = markAsStructValue(cloneStructValue(markAsStructValue(cloneStructValue(El("aside", arrayToSlice([remove, remount])))).Set("class", "lifecycle-controls"))).Keyed("lifecycle-controls");
  return markAsStructValue(cloneStructValue(markAsStructValue(cloneStructValue(El("main", arrayToSlice([parent, sibling, controls])))).Set("class", "lifecycle"))).Keyed("lifecycle");
}

// ../../../../../tmp/gobi-goscript-3281036908/@goscript/gobi.generated/compiled/facades/lifecycle-7e6575d90707/forwarder.gs.ts
function GobiCompiledInit() {
  return Init2();
}
function GobiCompiledUpdate(state, message) {
  return Update2(state.clone(), message);
}
function GobiCompiledView(state) {
  return View2(state);
}

// ../compiled-lifecycle/coordination/reviews/xr-fixture/cli-react/.gobi-stage-571800403/apps/lifecycle-7e6575d90707/components.gen.mjs
var appIR = Object.freeze({ "schema": "gobi.app-ir/v1", "packagePath": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", "components": [{ "id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", "packagePath": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", "stateType": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State", "messageType": "github.com/samuelpmahan/gondola/gobi.Message", "init": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.Init", "update": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.Update", "view": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.View", "capabilities": ["view.node", "numeric.safe-integer", "numeric.float64", "effect.request-reply"] }], "symbols": [{ "id": "github.com/samuelpmahan/gondola/counter.Init", "packagePath": "github.com/samuelpmahan/gondola/counter", "name": "Init", "signature": { "params": [], "results": ["github.com/samuelpmahan/gondola/counter.State"] }, "span": { "file": "counter/counter.go", "startByte": 220, "endByte": 256 }, "calls": [] }, { "id": "github.com/samuelpmahan/gondola/counter.Update", "packagePath": "github.com/samuelpmahan/gondola/counter", "name": "Update", "signature": { "params": ["github.com/samuelpmahan/gondola/counter.State", "github.com/samuelpmahan/gondola/gobi.Message"], "results": ["github.com/samuelpmahan/gondola/counter.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"] }, "span": { "file": "counter/counter.go", "startByte": 258, "endByte": 410 }, "calls": [] }, { "id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.Init", "packagePath": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", "name": "Init", "signature": { "params": [], "results": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State"] }, "span": { "file": "fixtures/compiled/lifecycle/app.go", "startByte": 969, "endByte": 1447 }, "calls": ["github.com/samuelpmahan/gondola/counter.Init"] }, { "id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.Update", "packagePath": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", "name": "Update", "signature": { "params": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State", "github.com/samuelpmahan/gondola/gobi.Message"], "results": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"] }, "span": { "file": "fixtures/compiled/lifecycle/app.go", "startByte": 1449, "endByte": 2543 }, "calls": ["github.com/samuelpmahan/gondola/counter.Update", "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.requestParent", "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.requestChild", "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.requestGrandchild", "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.requestSibling", "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.removeParent", "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.remountParent", "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.complete"] }, { "id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.requestParent", "packagePath": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", "name": "requestParent", "signature": { "params": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State"], "results": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"] }, "span": { "file": "fixtures/compiled/lifecycle/app.go", "startByte": 2545, "endByte": 3051 }, "calls": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.tokenFor", "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.requestEffect"] }, { "id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.requestChild", "packagePath": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", "name": "requestChild", "signature": { "params": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State"], "results": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"] }, "span": { "file": "fixtures/compiled/lifecycle/app.go", "startByte": 3053, "endByte": 3548 }, "calls": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.tokenFor", "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.requestEffect"] }, { "id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.requestGrandchild", "packagePath": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", "name": "requestGrandchild", "signature": { "params": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State"], "results": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"] }, "span": { "file": "fixtures/compiled/lifecycle/app.go", "startByte": 3550, "endByte": 4100 }, "calls": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.tokenFor", "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.requestEffect"] }, { "id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.requestSibling", "packagePath": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", "name": "requestSibling", "signature": { "params": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State"], "results": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"] }, "span": { "file": "fixtures/compiled/lifecycle/app.go", "startByte": 4102, "endByte": 4619 }, "calls": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.tokenFor", "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.requestEffect"] }, { "id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.removeParent", "packagePath": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", "name": "removeParent", "signature": { "params": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State"], "results": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"] }, "span": { "file": "fixtures/compiled/lifecycle/app.go", "startByte": 4621, "endByte": 5330 }, "calls": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.cancelEffect"] }, { "id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.remountParent", "packagePath": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", "name": "remountParent", "signature": { "params": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State"], "results": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"] }, "span": { "file": "fixtures/compiled/lifecycle/app.go", "startByte": 5332, "endByte": 6506 }, "calls": ["github.com/samuelpmahan/gondola/counter.Init"] }, { "id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.complete", "packagePath": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", "name": "complete", "signature": { "params": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State", "string"], "results": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"] }, "span": { "file": "fixtures/compiled/lifecycle/app.go", "startByte": 6508, "endByte": 7210 }, "calls": [] }, { "id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.tokenFor", "packagePath": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", "name": "tokenFor", "signature": { "params": ["string", "uint64", "uint64"], "results": ["string"] }, "span": { "file": "fixtures/compiled/lifecycle/app.go", "startByte": 7212, "endByte": 7381 }, "calls": [] }, { "id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.requestEffect", "packagePath": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", "name": "requestEffect", "signature": { "params": ["string"], "results": ["github.com/samuelpmahan/gondola/gobi.Effect"] }, "span": { "file": "fixtures/compiled/lifecycle/app.go", "startByte": 7383, "endByte": 7523 }, "calls": [] }, { "id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.cancelEffect", "packagePath": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", "name": "cancelEffect", "signature": { "params": ["string"], "results": ["github.com/samuelpmahan/gondola/gobi.Effect"] }, "span": { "file": "fixtures/compiled/lifecycle/app.go", "startByte": 7525, "endByte": 7657 }, "calls": [] }, { "id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.InitViewStateLabel", "packagePath": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", "name": "InitViewStateLabel", "signature": { "params": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.NodeState", "string"], "results": ["string"] }, "span": { "file": "fixtures/compiled/lifecycle/view.go", "startByte": 83, "endByte": 404 }, "calls": [] }, { "id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.nodeView", "packagePath": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", "name": "nodeView", "signature": { "params": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.NodeState", "string", "string", "string", "[]github.com/samuelpmahan/gondola/gobi.Node"], "results": ["github.com/samuelpmahan/gondola/gobi.Node"] }, "span": { "file": "fixtures/compiled/lifecycle/view.go", "startByte": 406, "endByte": 1177 }, "calls": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.InitViewStateLabel", "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.lowerLabel"] }, { "id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.lowerLabel", "packagePath": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", "name": "lowerLabel", "signature": { "params": ["string"], "results": ["string"] }, "span": { "file": "fixtures/compiled/lifecycle/view.go", "startByte": 1179, "endByte": 1397 }, "calls": [] }, { "id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.View", "packagePath": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", "name": "View", "signature": { "params": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State"], "results": ["github.com/samuelpmahan/gondola/gobi.Node"] }, "span": { "file": "fixtures/compiled/lifecycle/view.go", "startByte": 1399, "endByte": 2876 }, "calls": ["github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.nodeView"] }], "types": [{ "id": "[]github.com/samuelpmahan/gondola/gobi.Attr", "kind": "slice", "elemType": "github.com/samuelpmahan/gondola/gobi.Attr", "jsRepresentation": "goscript-slice" }, { "id": "[]github.com/samuelpmahan/gondola/gobi.Effect", "kind": "slice", "elemType": "github.com/samuelpmahan/gondola/gobi.Effect", "jsRepresentation": "array-or-goscript-slice" }, { "id": "[]github.com/samuelpmahan/gondola/gobi.Node", "kind": "slice", "elemType": "github.com/samuelpmahan/gondola/gobi.Node", "jsRepresentation": "array-or-goscript-slice" }, { "id": "[]github.com/samuelpmahan/gondola/gobi.On", "kind": "slice", "elemType": "github.com/samuelpmahan/gondola/gobi.On", "jsRepresentation": "goscript-slice" }, { "id": "[]github.com/samuelpmahan/gondola/gobi.Style", "kind": "slice", "elemType": "github.com/samuelpmahan/gondola/gobi.Style", "jsRepresentation": "array-or-goscript-slice" }, { "id": "bool", "kind": "bool", "jsRepresentation": "direct" }, { "id": "byte", "kind": "uint", "bits": 8, "jsRepresentation": "number" }, { "id": "float64", "kind": "float64", "jsRepresentation": "number" }, { "id": "github.com/samuelpmahan/gondola/counter.State", "kind": "struct", "fields": [{ "name": "Count", "type": "float64" }], "jsRepresentation": "class" }, { "id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.NodeState", "kind": "struct", "fields": [{ "name": "ID", "type": "string" }, { "name": "ParentID", "type": "string" }, { "name": "Generation", "type": "uint64" }, { "name": "RequestID", "type": "uint64" }, { "name": "Alive", "type": "bool" }, { "name": "Requested", "type": "bool" }, { "name": "Pending", "type": "bool" }, { "name": "Token", "type": "string" }, { "name": "Reply", "type": "string" }, { "name": "Counter", "type": "github.com/samuelpmahan/gondola/counter.State" }], "jsRepresentation": "class" }, { "id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.State", "kind": "struct", "fields": [{ "name": "Parent", "type": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.NodeState" }, { "name": "Child", "type": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.NodeState" }, { "name": "Grandchild", "type": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.NodeState" }, { "name": "Sibling", "type": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.NodeState" }, { "name": "NextRequestID", "type": "uint64" }], "jsRepresentation": "class" }, { "id": "github.com/samuelpmahan/gondola/gobi.Attr", "kind": "struct", "fields": [{ "name": "Name", "type": "string" }, { "name": "Value", "type": "string" }, { "name": "Flag", "type": "bool" }, { "name": "Style", "type": "[]github.com/samuelpmahan/gondola/gobi.Style" }], "jsRepresentation": "class" }, { "id": "github.com/samuelpmahan/gondola/gobi.Effect", "kind": "struct", "fields": [{ "name": "Kind", "type": "string" }, { "name": "Name", "type": "string" }, { "name": "Arg", "type": "string" }, { "name": "Reply", "type": "string" }], "jsRepresentation": "class" }, { "id": "github.com/samuelpmahan/gondola/gobi.Kind", "kind": "uint", "bits": 8, "jsRepresentation": "number" }, { "id": "github.com/samuelpmahan/gondola/gobi.Message", "kind": "struct", "fields": [{ "name": "Name", "type": "string" }, { "name": "Arg", "type": "string" }], "jsRepresentation": "class" }, { "id": "github.com/samuelpmahan/gondola/gobi.Node", "kind": "struct", "fields": [{ "name": "Kind", "type": "github.com/samuelpmahan/gondola/gobi.Kind" }, { "name": "Tag", "type": "string" }, { "name": "Key", "type": "string" }, { "name": "Attrs", "type": "[]github.com/samuelpmahan/gondola/gobi.Attr" }, { "name": "On", "type": "[]github.com/samuelpmahan/gondola/gobi.On" }, { "name": "Kids", "type": "[]github.com/samuelpmahan/gondola/gobi.Node" }, { "name": "Text", "type": "string" }], "jsRepresentation": "class" }, { "id": "github.com/samuelpmahan/gondola/gobi.On", "kind": "struct", "fields": [{ "name": "Event", "type": "string" }, { "name": "Message", "type": "string" }, { "name": "Arg", "type": "string" }], "jsRepresentation": "class" }, { "id": "github.com/samuelpmahan/gondola/gobi.Style", "kind": "struct", "fields": [{ "name": "Property", "type": "string" }, { "name": "Value", "type": "string" }], "jsRepresentation": "class" }, { "id": "int", "kind": "int", "bits": 64, "jsRepresentation": "number" }, { "id": "string", "kind": "string", "jsRepresentation": "direct" }, { "id": "uint64", "kind": "uint", "bits": 64, "jsRepresentation": "bigint" }] });
var componentRoles = Object.freeze(appIR.components.map((component2) => Object.freeze({
  id: component2.id,
  packagePath: component2.packagePath,
  stateType: component2.stateType,
  messageType: component2.messageType,
  init: component2.init,
  update: component2.update,
  view: component2.view,
  capabilities: Object.freeze([...component2.capabilities])
})));

// ../compiled-lifecycle/coordination/reviews/xr-fixture/cli-react/.gobi-stage-571800403/apps/lifecycle-7e6575d90707/.gobi-compiled.entry.mjs
var component = appIR.components[0];
if (!component || component.packagePath !== "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle" || component.init !== "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.Init" || component.update !== "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.Update" || component.view !== "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.View") {
  throw new Error("generated compiled role metadata does not match the requested package");
}
var symbols = /* @__PURE__ */ Object.create(null);
Object.defineProperty(symbols, "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.Init", { value: GobiCompiledInit, enumerable: true });
Object.defineProperty(symbols, "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.Update", { value: GobiCompiledUpdate, enumerable: true });
Object.defineProperty(symbols, "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.View", { value: GobiCompiledView, enumerable: true });
var gobiCompiled = Object.freeze({ schema: "gobi.compiled-module/v1", appIR, symbols: Object.freeze(symbols) });
export {
  gobiCompiled
};
