const MODULE_SCHEMA = "gobi.compiled-module/v1";
const APP_IR_SCHEMA = "gobi.app-ir/v1";
const SUPPORTED_CAPABILITIES = new Set([
  "view.node",
  "binding.value",
  "binding.checked",
  "effect.request-reply",
  "effect.cancel",
  "numeric.safe-integer",
  "numeric.float64",
]);

function fail(message) {
  throw new Error(`compiled React bindings: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, description) {
  if (!isRecord(value)) fail(`${description} must be an object`);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) fail(`${description} has unsupported symbol properties`);
  const keys = ownKeys.sort();
  const want = [...expected].sort();
  if (keys.length !== want.length || keys.some((key, index) => key !== want[index])) {
    fail(`${description} must contain exactly ${want.join(", ")}`);
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || "get" in descriptor || "set" in descriptor) {
      fail(`${description}.${key} must be an own data property`);
    }
  }
}

function roleMetadataMatches(component, generated) {
  exactKeys(generated, ["id", "packagePath", "stateType", "messageType", "init", "update", "view", "capabilities"], "generated component");
  for (const role of ["id", "packagePath", "stateType", "messageType", "init", "update", "view"]) {
    if (generated[role] !== component[role]) fail(`generated component role ${role} disagrees with AppIR for ${JSON.stringify(component.id)}`);
  }
  if (!Array.isArray(generated.capabilities) || generated.capabilities.length !== component.capabilities.length ||
      generated.capabilities.some((capability, index) => capability !== component.capabilities[index])) {
    fail(`generated component capabilities disagree with AppIR for ${JSON.stringify(component.id)}`);
  }
}

/** Resolve one AppIR component's actual generated functions by its recorded symbol IDs. */
export function bindCompiledComponent(compiled, componentID, expectedComponents = null) {
  exactKeys(compiled, ["schema", "appIR", "symbols"], "compiled module");
  if (compiled.schema !== MODULE_SCHEMA) fail(`unsupported compiled module schema ${JSON.stringify(compiled.schema)}`);
  exactKeys(compiled.appIR, ["schema", "packagePath", "components", "symbols", "types"], "AppIR");
  if (compiled.appIR.schema !== APP_IR_SCHEMA || typeof compiled.appIR.packagePath !== "string" ||
      !Array.isArray(compiled.appIR.components) || !Array.isArray(compiled.appIR.symbols) || !Array.isArray(compiled.appIR.types)) {
    fail("compiled module must contain a closed gobi.app-ir/v1 AppIR");
  }
  if (!isRecord(compiled.symbols)) fail("compiled module symbols must be an object");
  if (typeof componentID !== "string" || componentID === "") fail("componentID must be a non-empty string");

  for (const candidate of compiled.appIR.components) {
    exactKeys(candidate, ["id", "packagePath", "stateType", "messageType", "init", "update", "view", "capabilities"], "AppIR component");
    if (![candidate.id, candidate.packagePath, candidate.stateType, candidate.messageType, candidate.init, candidate.update, candidate.view]
      .every((field) => typeof field === "string" && field !== "") || !Array.isArray(candidate.capabilities) ||
      candidate.capabilities.some((capability) => typeof capability !== "string" || !SUPPORTED_CAPABILITIES.has(capability)) ||
      new Set(candidate.capabilities).size !== candidate.capabilities.length) {
      fail(`AppIR component ${JSON.stringify(candidate.id)} has invalid identity, roles, or capabilities`);
    }
  }
  for (const symbol of compiled.appIR.symbols) {
    exactKeys(symbol, ["id", "packagePath", "name", "signature", "span", "calls"], "AppIR symbol");
    if (![symbol.id, symbol.packagePath, symbol.name].every((field) => typeof field === "string" && field !== "") ||
      !Array.isArray(symbol.calls) || symbol.calls.some((call) => typeof call !== "string")) {
      fail("AppIR symbol has invalid identity or calls");
    }
    exactKeys(symbol.signature, ["params", "results"], "AppIR symbol signature");
    if (!Array.isArray(symbol.signature.params) || !Array.isArray(symbol.signature.results) ||
      symbol.signature.params.some((type) => typeof type !== "string") || symbol.signature.results.some((type) => typeof type !== "string")) {
      fail(`AppIR symbol ${JSON.stringify(symbol.id)} has an invalid signature`);
    }
    exactKeys(symbol.span, ["file", "startByte", "endByte"], "AppIR symbol span");
    if (typeof symbol.span.file !== "string" || !Number.isSafeInteger(symbol.span.startByte) || symbol.span.startByte < 0 ||
      !Number.isSafeInteger(symbol.span.endByte) || symbol.span.endByte < symbol.span.startByte) {
      fail(`AppIR symbol ${JSON.stringify(symbol.id)} has an invalid source span`);
    }
  }

  const matches = compiled.appIR.components.filter((component) => component?.id === componentID);
  if (matches.length !== 1) fail(`expected exactly one AppIR component ${JSON.stringify(componentID)}`);
  const component = matches[0];
  exactKeys(component, ["id", "packagePath", "stateType", "messageType", "init", "update", "view", "capabilities"], "AppIR component");
  if (![component.id, component.packagePath, component.stateType, component.messageType].every((field) => typeof field === "string" && field !== "") ||
      !Array.isArray(component.capabilities)) {
    fail(`component ${JSON.stringify(componentID)} has invalid identity or capabilities`);
  }
  if (![component.init, component.update, component.view].every((id) => typeof id === "string" && id !== "")) {
    fail(`component ${JSON.stringify(componentID)} has invalid role symbol IDs`);
  }
  if (new Set([component.init, component.update, component.view]).size !== 3) {
    fail(`component ${JSON.stringify(componentID)} reuses a symbol ID for multiple roles`);
  }

  if (expectedComponents !== null) {
    if (!Array.isArray(expectedComponents)) fail("expectedComponents must be an array when supplied");
    if (expectedComponents.length !== compiled.appIR.components.length) fail("generated component table length disagrees with AppIR");
    compiled.appIR.components.forEach((candidate, index) => roleMetadataMatches(candidate, expectedComponents[index]));
    if (expectedComponents.filter((candidate) => candidate?.id === componentID).length !== 1) {
      fail(`generated component table does not contain exactly one ${JSON.stringify(componentID)}`);
    }
  }

  const expectedSymbols = new Set();
  for (const candidate of compiled.appIR.components) {
    for (const role of ["init", "update", "view"]) {
      if (typeof candidate?.[role] !== "string" || candidate[role] === "" || expectedSymbols.has(candidate[role])) {
        fail(`AppIR component roles contain an invalid or duplicate ${role} symbol ID`);
      }
      expectedSymbols.add(candidate[role]);
    }
  }
  const exportedKeys = Reflect.ownKeys(compiled.symbols);
  if (exportedKeys.some((key) => typeof key !== "string")) fail("compiled module symbols have unsupported symbol properties");
  const sortedExports = [...exportedKeys].sort();
  const sortedExpected = [...expectedSymbols].sort();
  if (sortedExports.length !== sortedExpected.length || sortedExports.some((id, index) => id !== sortedExpected[index])) {
    fail("compiled module symbols must exactly match AppIR component role IDs");
  }

  for (const [role, id] of [["Init", component.init], ["Update", component.update], ["View", component.view]]) {
    const declarations = compiled.appIR.symbols.filter((symbol) => symbol?.id === id);
    if (declarations.length !== 1) {
      fail(`AppIR ${role} role ${JSON.stringify(id)} is not declared by the component package`);
    }
    exactKeys(declarations[0], ["id", "packagePath", "name", "signature", "span", "calls"], `AppIR ${role} symbol`);
    if (declarations[0].packagePath !== component.packagePath || declarations[0].name !== role) {
      fail(`AppIR ${role} role ${JSON.stringify(id)} is not declared by the component package`);
    }
  }

  const symbolValue = (id) => {
    const descriptor = Object.getOwnPropertyDescriptor(compiled.symbols, id);
    if (!descriptor || !descriptor.enumerable || "get" in descriptor || "set" in descriptor) {
      fail(`compiled symbol ${JSON.stringify(id)} must be an own data property`);
    }
    return descriptor.value;
  };
  const Init = symbolValue(component.init);
  const Update = symbolValue(component.update);
  const View = symbolValue(component.view);
  for (const [role, fn] of [["Init", Init], ["Update", Update], ["View", View]]) {
    if (typeof fn !== "function") fail(`compiled ${role} symbol ${JSON.stringify(component[role.toLowerCase()])} is missing or not callable`);
  }
  return { compiled, component, Init, Update, View };
}

