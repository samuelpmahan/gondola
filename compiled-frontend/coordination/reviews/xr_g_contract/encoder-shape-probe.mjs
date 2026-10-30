import { gobiEncodeState } from "file:///tmp/gondola-compiled-atomic/apps/form-a3fe6b48b000/encoder.mjs";

const stateType = "github.com/samuelpmahan/gondola/fixtures/compiled/form.State";
const fields = {
  Draft: "",
  Checked: false,
  Saved: "",
  Saves: 0,
  Literal: "",
  __goStructValue: true,
};

function result(run) {
  try {
    const value = run();
    return { accepted: true, value };
  } catch (error) {
    return { accepted: false, error: String(error?.message ?? error) };
  }
}

const valid = result(() => gobiEncodeState({ ...fields }, stateType));
const unknownField = result(() => gobiEncodeState({ ...fields, hiddenExtra: true }, stateType));
const symbolField = result(() => {
  const value = { ...fields };
  value[Symbol("unapproved")] = "x";
  return gobiEncodeState(value, stateType);
});

let getterCalls = 0;
const accessorField = result(() => {
  const value = {};
  Object.defineProperty(value, "Draft", {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      throw new Error("accessor ran");
    },
  });
  value.Checked = fields.Checked;
  value.Saved = fields.Saved;
  value.Saves = fields.Saves;
  value.Literal = fields.Literal;
  value.__goStructValue = fields.__goStructValue;
  return gobiEncodeState(value, stateType);
});

const noCloneMethod = result(() => gobiEncodeState({ ...fields }, stateType));
const output = {
  stateType,
  valid,
  unknownField,
  symbolField,
  accessorField,
  getterCalls,
  noCloneMethod,
};
process.stdout.write(`${JSON.stringify(output)}\n`);
