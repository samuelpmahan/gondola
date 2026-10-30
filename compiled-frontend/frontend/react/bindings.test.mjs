import assert from "node:assert/strict";
import test from "node:test";
import { bindCompiledComponent } from "./bindings.mjs";

const appIR = {
  schema: "gobi.app-ir/v1",
  packagePath: "example/app",
  components: [{
    id: "example/app.Counter",
    packagePath: "example/app",
    stateType: "example/app.State",
    messageType: "example/app.Message",
    init: "example/app.Init",
    update: "example/app.Update",
    view: "example/app.View",
    capabilities: ["view.node"],
  }],
  symbols: [
    { id: "example/app.Init", packagePath: "example/app", name: "Init", signature: { params: [], results: [] }, span: { file: "app.go", startByte: 0, endByte: 0 }, calls: [] },
    { id: "example/app.Update", packagePath: "example/app", name: "Update", signature: { params: [], results: [] }, span: { file: "app.go", startByte: 0, endByte: 0 }, calls: [] },
    { id: "example/app.View", packagePath: "example/app", name: "View", signature: { params: [], results: [] }, span: { file: "app.go", startByte: 0, endByte: 0 }, calls: [] },
  ],
  types: [],
};

function compiled(overrides = {}) {
  const Init = () => ({ Count: 0 });
  const Update = (state, message) => [state, []];
  const View = () => ({ Kind: 1, Tag: "div", Key: "root", Attrs: null, On: null, Kids: null, Text: "" });
  return {
    schema: "gobi.compiled-module/v1",
    appIR,
    symbols: {
      "example/app.Init": Init,
      "example/app.Update": Update,
      "example/app.View": View,
    },
    ...overrides,
  };
}

test("binds the actual callable exports selected by the AppIR role IDs", () => {
  const module = compiled();
  const bound = bindCompiledComponent(module, "example/app.Counter");

  assert.equal(bound.compiled, module);
  assert.equal(bound.component, appIR.components[0]);
  assert.equal(bound.Init, module.symbols["example/app.Init"]);
  assert.equal(bound.Update, module.symbols["example/app.Update"]);
  assert.equal(bound.View, module.symbols["example/app.View"]);
});

test("checks generated role metadata against the module before binding", () => {
  const module = compiled();
  const generated = Object.freeze([Object.freeze({
    ...appIR.components[0],
    capabilities: Object.freeze([...appIR.components[0].capabilities]),
  })]);
  assert.equal(bindCompiledComponent(module, "example/app.Counter", generated).Update, module.symbols["example/app.Update"]);
  const mismatched = [{ ...appIR.components[0], view: "example/app.OtherView" }];
  assert.throws(() => bindCompiledComponent(module, "example/app.Counter", mismatched), /disagrees with AppIR/);
});

test("rejects wrong module schema, missing app roles, duplicate IDs, and non-callable exports", () => {
  assert.throws(() => bindCompiledComponent(compiled({ schema: "other" }), "example/app.Counter"), /unsupported compiled module schema/);
  const notCallable = compiled();
  notCallable.symbols["example/app.Update"] = null;
  assert.throws(() => bindCompiledComponent(notCallable, "example/app.Counter"), /missing or not callable/);
  assert.throws(() => bindCompiledComponent(compiled(), "missing"), /exactly one AppIR component/);
  assert.throws(() => bindCompiledComponent(compiled({ extra: true }), "example/app.Counter"), /exactly appIR, schema, symbols/);
  const duplicated = compiled();
  duplicated.appIR = { ...appIR, components: [...appIR.components, appIR.components[0]] };
  assert.throws(() => bindCompiledComponent(duplicated, "example/app.Counter"), /exactly one AppIR component/);
  const extraExport = compiled();
  extraExport.symbols.unused = () => {};
  assert.throws(() => bindCompiledComponent(extraExport, "example/app.Counter"), /exactly match AppIR component role IDs/);
});

