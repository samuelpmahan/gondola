import { lowerView } from "../../../frontend/react/renderer.mjs";

const goStruct = (value) => ({ ...value, __goStructValue: true });
const backing = [goStruct({ Event: "click", Message: "save", Arg: "" })];
const slice = new Proxy({ backing, offset: 0, length: 1, capacity: 1, target: {} }, {
  get(target, key, receiver) {
    if (key === "target") return undefined;
    return Reflect.get(target, key, receiver);
  },
});
const tree = goStruct({
  Kind: 1, Tag: "button", Key: "save", Attrs: null, On: slice, Kids: null, Text: "",
});
const view = goStruct({ Tree: tree, Bindings: [] });
const result = lowerView(view, {
  dispatch() {},
  onStaleAction() {},
  isCurrent() { return true; },
  refFor() { return null; },
});
process.stdout.write(JSON.stringify({ accepted: typeof result.element.props.onClick === "function" }));
