import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("generated output directory argument is required");
const { build } = await import(pathToFileURL(join(here, "../../../interaction/node_modules/esbuild/lib/main.js")));
const temp = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "gondola-counter-node-"));
try {
  const entry = join(temp, "entry.mjs");
  const bundle = join(temp, "bundle.mjs");
  const source = `
import * as counter from "@goscript/github.com/samuelpmahan/gondola/counter/index.js";
import * as adapter from "@goscript/github.com/samuelpmahan/gondola/compiled-frontend/toolchain/probe_counter/adapter/index.js";
import * as semantics from "@goscript/github.com/samuelpmahan/gondola/compiled-frontend/toolchain/probe_counter/semantics/index.js";
const rawInitial = counter.Init();
const [rawNext, rawEffects] = counter.Update(rawInitial, {Name: "add", Arg: ""});
const initial = adapter.CounterInit();
const [next, effects] = adapter.CounterUpdate(initial, {Name: "add", Arg: ""});
const initialView = adapter.CounterView(adapter.CounterInit());
const resetView = initialView.Kids.find((child) => child.Tag === "button" && child.On !== null && child.On.backing?.[0]?.Message === "reset");
const resetAttrs = resetView?.Attrs === null ? [] : resetView?.Attrs?.backing ?? resetView?.Attrs ?? [];
const snapshot = semantics.SnapshotValue();
const values = snapshot.Values;
const empty = snapshot.EmptyValues;
const firstValueNegativeZeroBeforeMutation = Object.is(values[0], -0);
const mutatedSnapshot = adapter.SemanticMutate(snapshot);
const cowInput = semantics.SnapshotValue();
const cowOutput = adapter.SemanticAppendThenMutate(cowInput);
const [baseNode, leftNode, rightNode] = adapter.NodeSetFork();
const rawSliceItems = (slice) => {
  if (slice === null) return null;
  if (Array.isArray(slice) || ArrayBuffer.isView(slice)) return Array.from(slice);
  if (slice && slice.backing !== undefined) return Array.from(slice.backing).slice(slice.offset, slice.offset + slice.length);
  return {unsupportedShape: slice.constructor?.name ?? typeof slice};
};
const attrs = (node) => rawSliceItems(node.Attrs).map((attr) => ({name: attr.Name, value: attr.Value, flag: attr.Flag}));
const clean = (value) => typeof value === "bigint" ? value.toString() : value;
const cowInputStructs = rawSliceItems(cowInput.Structs);
const cowOutputStructs = rawSliceItems(cowOutput.Structs);
const sliceShape = (slice) => slice === null ? {isNil: true} : {
  isNil: false,
  constructor: slice.constructor?.name ?? typeof slice,
  isArray: Array.isArray(slice),
  isTypedArray: ArrayBuffer.isView(slice),
  ownKeys: Object.keys(slice),
  length: typeof slice.length === "number" ? slice.length : null,
  offset: typeof slice.offset === "number" ? slice.offset : null,
  capacity: typeof slice.capacity === "number" ? slice.capacity : null,
  backingConstructor: slice.backing?.constructor?.name ?? null,
  hasOwnTarget: Object.hasOwn(slice, "target"),
  targetType: typeof slice.target,
  targetConstructor: slice.target?.constructor?.name ?? null,
  targetIsBacking: slice.target === slice.backing,
  targetDescriptor: (() => { const d = Object.getOwnPropertyDescriptor(slice, "target"); return d ? {enumerable:d.enumerable,writable:d.writable,configurable:d.configurable,valueType:typeof d.value} : null; })(),
  hasMetaGetter: slice.__meta__ === slice,
  indexZeroType: typeof slice[0],
  indexZeroValue: clean(slice[0]),
  iteratorType: typeof slice[Symbol.iterator],
  windowType: typeof slice.window,
  iteratorItems: Array.from(slice).map(clean),
  ownDescriptors: Object.fromEntries(Object.keys(slice).map((key) => { const d = Object.getOwnPropertyDescriptor(slice, key); return [key, {enumerable:d.enumerable,writable:d.writable,configurable:d.configurable,valueType:typeof d.value,valueConstructor:d.value?.constructor?.name ?? null}]; })),
  metaPrototypeDescriptor: (() => { const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(slice), "__meta__"); return d ? {get:typeof d.get,set:typeof d.set,enumerable:d.enumerable,configurable:d.configurable} : null; })(),
  items: rawSliceItems(slice)?.map?.(clean) ?? rawSliceItems(slice),
};
const signedValue = snapshot.Signed;
const unsignedValue = snapshot.Unsigned;
const integerWidths = adapter.IntegerWidthsValue();
const integerOverflows = adapter.IntegerWidthsAfterOverflow();
const integerFields = Object.keys(integerWidths).filter((key) => key !== "__goStructValue");
const integerReps = Object.fromEntries(integerFields.map((key) => [key, {type: typeof integerWidths[key], value: clean(integerWidths[key])}]));
const overflowResults = Object.fromEntries(integerFields.map((key) => [key, {type: typeof integerOverflows[key], value: clean(integerOverflows[key])}]));
const bits = (value) => { const data = new DataView(new ArrayBuffer(8)); data.setFloat64(0, value, false); return data.getBigUint64(0, false).toString(16).padStart(16, "0"); };
const observed = {
  initCount: adapter.CounterInit().Count,
  nextCount: next.Count,
  inputCountAfterUpdate: initial.Count,
  sameInputAndNext: initial === next,
  rawInputCountAfterDirectUpdate: rawInitial.Count,
  rawSameInputAndNext: rawInitial === rawNext,
  effects,
  rawEffects,
  initialResetDisabled: resetAttrs.some((attr) => attr.Name === "disabled" && attr.Flag),
  stateShape: {
    constructor: snapshot.constructor?.name,
    ownKeys: Object.keys(snapshot),
    hasOwnStructMarker: Object.hasOwn(snapshot, "__goStructValue"),
    structMarkerValue: snapshot.__goStructValue,
    structMarkerDescriptor: Object.getOwnPropertyDescriptor(snapshot, "__goStructValue"),
    cloneMethodType: typeof snapshot.clone,
    cloneIsOwn: Object.hasOwn(snapshot, "clone"),
    signedType: typeof signedValue,
    signedValue: clean(signedValue),
    unsignedType: typeof unsignedValue,
    unsignedValue: clean(unsignedValue),
    nestedConstructor: snapshot.Nested.constructor?.name,
    nestedKeys: Object.keys(snapshot.Nested),
    fixedConstructor: snapshot.Fixed.constructor?.name,
    fixedKeys: Object.keys(snapshot.Fixed),
    fixedValues: Array.from(snapshot.Fixed, (item) => ({count: item.Count, label: item.Label, ownKeys: Object.keys(item)})),
    slices: {
      values: sliceShape(snapshot.Values), nilValues: sliceShape(snapshot.NilValues), emptyValues: sliceShape(snapshot.EmptyValues),
      ints: sliceShape(snapshot.Ints), nilInts: sliceShape(snapshot.NilInts), emptyInts: sliceShape(snapshot.EmptyInts),
      uints: sliceShape(snapshot.Uints), nilUints: sliceShape(snapshot.NilUints), emptyUints: sliceShape(snapshot.EmptyUints),
      strings: sliceShape(snapshot.Strings), nilStrings: sliceShape(snapshot.NilStrings), emptyStrings: sliceShape(snapshot.EmptyStrings),
      bools: sliceShape(snapshot.Bools), nilBools: sliceShape(snapshot.NilBools), emptyBools: sliceShape(snapshot.EmptyBools),
      structs: sliceShape(snapshot.Structs), nilStructs: sliceShape(snapshot.NilStructs), emptyStructs: sliceShape(snapshot.EmptyStructs),
    },
  },
  integerWidths: {ownKeys:Object.keys(integerWidths),representations:integerReps,overflowFromWidthMax:overflowResults},
  snapshot: {
    scalarNegativeZero: Object.is(snapshot.Scalar, -0),
    scalarBits: bits(snapshot.Scalar),
    values: rawSliceItems(values).map(clean),
    firstValueNegativeZeroBeforeMutation,
    firstValueAfterForwardedMutation: values[0],
    nilIsNull: snapshot.NilValues === null,
    emptyIsNull: snapshot.EmptyValues === null,
    emptyLength: empty === null ? null : empty.length,
    emptyValues: rawSliceItems(empty),
    nestedCountAfterMutation: mutatedSnapshot.Nested.Count,
    originalNestedCountAfterMutation: snapshot.Nested.Count,
    fixedFirstCountAfterMutation: mutatedSnapshot.Fixed[0].Count,
    originalFixedFirstCountAfterMutation: snapshot.Fixed[0].Count,
    structSliceFirstCountAfterMutation: mutatedSnapshot.Structs[0].Count,
    originalStructSliceFirstCountAfterMutation: snapshot.Structs[0].Count,
    structSliceBeforeAppendFirstCount: cowInputStructs[0].Count,
    structSliceAfterAppendFirstCount: cowOutputStructs[0].Count,
    structSliceInputLengthAfterAppend: cowInputStructs.length,
    structSliceOutputLengthAfterAppend: cowOutputStructs.length,
    structSliceOutputSecondCount: cowOutputStructs[1].Count,
    structSliceInputShape: sliceShape(cowInput.Structs),
    structSliceOutputShape: sliceShape(cowOutput.Structs),
    nodeSetForkAttrs: {base: attrs(baseNode), left: attrs(leftNode), right: attrs(rightNode)},
    nodeSetForkSliceShapes: {base: sliceShape(baseNode.Attrs), left: sliceShape(leftNode.Attrs), right: sliceShape(rightNode.Attrs)},
    updatedScalar: mutatedSnapshot.Scalar,
    originalLengthAfterAppend: values.length,
    updatedLengthAfterAppend: mutatedSnapshot.Values.length,
    updatedFloatSliceShape: sliceShape(mutatedSnapshot.Values),
    updatedValues: rawSliceItems(mutatedSnapshot.Values).map(clean),
  },
  format: {
    negativeZeroFixed: semantics.FormatFloat(-0, 102, -1, 64),
    negativeZeroGeneral: semantics.FormatFloat(-0, 103, -1, 64),
    positiveFixed: semantics.FormatFloat(1.25, 102, -1, 64),
    largeFixed: semantics.FormatFloat(1e21, 102, -1, 64),
    uintSafeMax: semantics.FormatUint(9007199254740991n, 10),
    int64SafeMin: semantics.FormatInt(-9007199254740991n, 10),
    intNegative: semantics.Itoa(-2147483648),
  },
  view: adapter.CounterView(next),
};
if (observed.initCount !== 0 || observed.nextCount !== 1 || observed.inputCountAfterUpdate !== 0 || observed.sameInputAndNext) throw new Error("forwarding facade did not preserve Go State value-copy semantics");
if (observed.rawInputCountAfterDirectUpdate !== 1 || !observed.rawSameInputAndNext) throw new Error("raw emitted counter mutation behavior changed; update the recorded ABI finding");
if (!observed.initialResetDisabled) throw new Error("counter initial disabled flag was not emitted");
if (!observed.snapshot.scalarNegativeZero || observed.snapshot.scalarBits !== "8000000000000000" || !observed.snapshot.firstValueNegativeZeroBeforeMutation) throw new Error("float64 negative-zero representation mismatch");
if (!observed.snapshot.nilIsNull || observed.snapshot.emptyIsNull || observed.snapshot.emptyLength !== 0) throw new Error("nil and empty slice representations collapsed");
if (observed.snapshot.firstValueAfterForwardedMutation !== 1 || observed.snapshot.updatedScalar !== 2.5 || observed.snapshot.originalLengthAfterAppend !== 3 || observed.snapshot.updatedLengthAfterAppend !== 4) throw new Error("struct-copy/slice-alias append semantics mismatch");
if (observed.snapshot.nestedCountAfterMutation !== 8 || observed.snapshot.originalNestedCountAfterMutation !== 7 || observed.snapshot.fixedFirstCountAfterMutation !== 12 || observed.snapshot.originalFixedFirstCountAfterMutation !== 11) throw new Error("nested struct or array value-copy semantics mismatch");
if (observed.snapshot.structSliceFirstCountAfterMutation !== 14 || observed.snapshot.originalStructSliceFirstCountAfterMutation !== 14) throw new Error("slice-of-struct alias semantics mismatch");
if (observed.snapshot.structSliceBeforeAppendFirstCount !== 13 || observed.snapshot.structSliceAfterAppendFirstCount !== 113 || observed.snapshot.structSliceInputLengthAfterAppend !== 1 || observed.snapshot.structSliceOutputLengthAfterAppend !== 2 || observed.snapshot.structSliceOutputSecondCount !== 15) throw new Error("append copy-on-write slice-of-struct semantics mismatch");
if (JSON.stringify(observed.snapshot.nodeSetForkAttrs) !== JSON.stringify({base:[{name:"class",value:"base",flag:false}],left:[{name:"class",value:"base",flag:false},{name:"id",value:"left",flag:false}],right:[{name:"class",value:"base",flag:false},{name:"id",value:"right",flag:false}]})) throw new Error("gobi.Node.Set full-slice copy-on-write semantics mismatch");
for (const [nil, empty, label] of [[snapshot.NilValues, snapshot.EmptyValues, "float64"], [snapshot.NilInts, snapshot.EmptyInts, "int"], [snapshot.NilUints, snapshot.EmptyUints, "uint64"], [snapshot.NilStrings, snapshot.EmptyStrings, "string"], [snapshot.NilBools, snapshot.EmptyBools, "bool"], [snapshot.NilStructs, snapshot.EmptyStructs, "struct"]]) {
  if (nil !== null || empty === null || empty.length !== 0) throw new Error(label + " nil/empty slice representation mismatch");
}
if (observed.stateShape.slices.values.constructor !== "Float64Array" || observed.stateShape.slices.ints.constructor !== "Array" || observed.stateShape.slices.uints.constructor !== "Array" || observed.stateShape.slices.strings.constructor !== "Array" || observed.stateShape.slices.bools.constructor !== "Array" || observed.stateShape.slices.structs.constructor !== "Array") throw new Error("slice runtime constructor representation changed; update ABI proof");
if (observed.stateShape.signedType !== "bigint" || observed.stateShape.unsignedType !== "bigint" || observed.stateShape.fixedConstructor !== "Array") throw new Error("integer or array runtime representation changed; update ABI proof");
if (!observed.stateShape.hasOwnStructMarker || observed.stateShape.structMarkerValue !== true || observed.stateShape.structMarkerDescriptor?.enumerable !== true || observed.stateShape.cloneMethodType !== "function" || observed.stateShape.cloneIsOwn) throw new Error("GoScript struct marker/clone runtime contract changed; update ABI proof");
if (Object.keys(observed.integerWidths.representations).length !== 12) throw new Error("integer width fixture did not expose all declared integer types");
if (observed.format.negativeZeroFixed !== "-0" || observed.format.negativeZeroGeneral !== "-0" || observed.format.positiveFixed !== "1.25" || observed.format.largeFixed !== "1000000000000000000000") throw new Error("strconv.FormatFloat parity mismatch");
if (observed.format.uintSafeMax !== "9007199254740991" || observed.format.int64SafeMin !== "-9007199254740991" || observed.format.intNegative !== "-2147483648") throw new Error("strconv integer formatter parity mismatch");
globalThis.__gobiProbe = observed;
`;
  const { writeFile } = await import("node:fs/promises");
  await writeFile(entry, source, "utf8");
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    alias: { "@goscript": join(output, "@goscript") },
    outfile: bundle,
    logLevel: "silent",
  });
  await import(pathToFileURL(bundle).href);
  const observed = globalThis.__gobiProbe;
  const native = JSON.parse(await readFile(join(here, "results/native.json"), "utf8"));
  const nativeComparable = {
    counter: {
      inputCountAfterUpdate: observed.inputCountAfterUpdate,
      nextCount: observed.nextCount,
      effectsIsNil: observed.effects === null,
      initialResetDisabled: observed.initialResetDisabled,
    },
    snapshot: {
      scalarBitsAfterCall: observed.snapshot.scalarBits,
      mutatedScalar: observed.snapshot.updatedScalar,
      nestedOriginal: observed.snapshot.originalNestedCountAfterMutation,
      nestedReturned: observed.snapshot.nestedCountAfterMutation,
      fixedOriginal: observed.snapshot.originalFixedFirstCountAfterMutation,
      fixedReturned: observed.snapshot.fixedFirstCountAfterMutation,
      structSliceOriginalAfterMutation: observed.snapshot.originalStructSliceFirstCountAfterMutation,
      structSliceReturnedAfterMutation: observed.snapshot.structSliceFirstCountAfterMutation,
      valuesOriginalLengthAfterAppend: observed.snapshot.originalLengthAfterAppend,
      valuesReturnedLengthAfterAppend: observed.snapshot.updatedLengthAfterAppend,
      valuesFirstAfterSharedWrite: observed.snapshot.firstValueAfterForwardedMutation,
      structBeforeAppendCount: observed.snapshot.structSliceBeforeAppendFirstCount,
      structAfterAppendFirstCount: observed.snapshot.structSliceAfterAppendFirstCount,
      structInputLengthAfterAppend: observed.snapshot.structSliceInputLengthAfterAppend,
      structOutputLengthAfterAppend: observed.snapshot.structSliceOutputLengthAfterAppend,
      structOutputSecondCount: observed.snapshot.structSliceOutputSecondCount,
      nilFloatSlice: observed.snapshot.nilIsNull,
      emptyFloatSliceIsNil: observed.snapshot.emptyIsNull,
      emptyFloatSliceLength: observed.snapshot.emptyLength,
    },
    format: observed.format,
    nodeSetFork: observed.snapshot.nodeSetForkAttrs,
  };
  const { integerOverflow: nativeIntegerOverflow, ...nativeValues } = native;
  assert.deepStrictEqual(nativeComparable, nativeValues, "emitted Node values differ from native Go calls");
  const overflowMismatches = Object.keys(nativeIntegerOverflow).filter((name) => String(observed.integerWidths.overflowFromWidthMax[name].value) !== nativeIntegerOverflow[name]);
  assert.deepStrictEqual(overflowMismatches, ["Int64", "Uint64"], "recorded integer overflow behavior changed");
  observed.nativeGoParity = true;
  observed.integerOverflowMismatches = overflowMismatches;
  console.log(JSON.stringify(observed));
} finally {
  await rm(temp, { recursive: true, force: true });
}
