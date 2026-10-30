// Generated file based on semantics.go
// Updated when compliance tests are re-run, DO NOT EDIT!

import * as $ from "@goscript/builtin/index.js"
import * as math from "@goscript/math/index.js"
import * as strconv from "@goscript/strconv/index.js"

$.registerTypePackagePath("github.com/samuelpmahan/gondola/compiled-frontend/toolchain/probe_counter/semantics", ["semantics.Inner", "semantics.IntegerWidths", "semantics.Snapshot"])

export class Inner {
	public declare Count: number

	public declare Label: string

	constructor(__goscriptValue?: boolean, Count$?: number, Label$?: string) {
		this.Count = Count$ ?? 0
		this.Label = Label$ ?? ""
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): Inner {
		return new Inner(true, this.Count, this.Label)
	}

	public __goscriptAssign(source: Inner): this {
		this.Count = source.Count
		this.Label = source.Label
		return this
	}

	static __typeInfo = $.registerStructType(
		"semantics.Inner",
		() => new Inner(),
		() => [],
		Inner,
		() => [{ name: "Count", key: "Count", type: /* @__PURE__ */ $.basicType("int") }, { name: "Label", key: "Label", type: /* @__PURE__ */ $.basicType("string") }]
	)
}

export class IntegerWidths {
	public declare Int: number

	public declare Int8: number

	public declare Int16: number

	public declare Int32: number

	public declare Int64: bigint

	public declare Uint: number

	public declare Uint8: number

	public declare Uint16: number

	public declare Uint32: number

	public declare Uint64: bigint

	public declare Byte: number

	public declare Rune: number

	constructor(__goscriptValue?: boolean, Int$?: number, Int8$?: number, Int16$?: number, Int32$?: number, Int64$?: bigint, Uint$?: number, Uint8$?: number, Uint16$?: number, Uint32$?: number, Uint64$?: bigint, Byte$?: number, Rune$?: number) {
		this.Int = Int$ ?? 0
		this.Int8 = Int8$ ?? 0
		this.Int16 = Int16$ ?? 0
		this.Int32 = Int32$ ?? 0
		this.Int64 = Int64$ ?? 0n
		this.Uint = Uint$ ?? 0
		this.Uint8 = Uint8$ ?? 0
		this.Uint16 = Uint16$ ?? 0
		this.Uint32 = Uint32$ ?? 0
		this.Uint64 = Uint64$ ?? 0n
		this.Byte = Byte$ ?? 0
		this.Rune = Rune$ ?? 0
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): IntegerWidths {
		return new IntegerWidths(true, this.Int, this.Int8, this.Int16, this.Int32, this.Int64, this.Uint, this.Uint8, this.Uint16, this.Uint32, this.Uint64, this.Byte, this.Rune)
	}

	public __goscriptAssign(source: IntegerWidths): this {
		this.Int = source.Int
		this.Int8 = source.Int8
		this.Int16 = source.Int16
		this.Int32 = source.Int32
		this.Int64 = source.Int64
		this.Uint = source.Uint
		this.Uint8 = source.Uint8
		this.Uint16 = source.Uint16
		this.Uint32 = source.Uint32
		this.Uint64 = source.Uint64
		this.Byte = source.Byte
		this.Rune = source.Rune
		return this
	}

	static __typeInfo = $.registerStructType(
		"semantics.IntegerWidths",
		() => new IntegerWidths(),
		() => [],
		IntegerWidths,
		() => [{ name: "Int", key: "Int", type: /* @__PURE__ */ $.basicType("int") }, { name: "Int8", key: "Int8", type: /* @__PURE__ */ $.basicType("int8") }, { name: "Int16", key: "Int16", type: /* @__PURE__ */ $.basicType("int16") }, { name: "Int32", key: "Int32", type: /* @__PURE__ */ $.basicType("int32") }, { name: "Int64", key: "Int64", type: /* @__PURE__ */ $.basicType("int64") }, { name: "Uint", key: "Uint", type: /* @__PURE__ */ $.basicType("uint") }, { name: "Uint8", key: "Uint8", type: /* @__PURE__ */ $.basicType("uint8") }, { name: "Uint16", key: "Uint16", type: /* @__PURE__ */ $.basicType("uint16") }, { name: "Uint32", key: "Uint32", type: /* @__PURE__ */ $.basicType("uint32") }, { name: "Uint64", key: "Uint64", type: /* @__PURE__ */ $.basicType("uint64") }, { name: "Byte", key: "Byte", type: /* @__PURE__ */ $.basicType("uint8") }, { name: "Rune", key: "Rune", type: /* @__PURE__ */ $.basicType("int32") }]
	)
}

export class Snapshot {
	public declare Flag: boolean

	public declare Name: string

	public declare Signed: bigint

	public declare Unsigned: bigint

	public declare Scalar: number

	public declare Nested: Inner

	public declare Fixed: Inner[]

	public declare Values: $.Slice<number>

	public declare NilValues: $.Slice<number>

	public declare EmptyValues: $.Slice<number>

	public declare Ints: $.Slice<number>

	public declare NilInts: $.Slice<number>

	public declare EmptyInts: $.Slice<number>

	public declare Uints: $.Slice<bigint>

	public declare NilUints: $.Slice<bigint>

	public declare EmptyUints: $.Slice<bigint>

	public declare Strings: $.Slice<string>

	public declare NilStrings: $.Slice<string>

	public declare EmptyStrings: $.Slice<string>

	public declare Bools: $.Slice<boolean>

	public declare NilBools: $.Slice<boolean>

	public declare EmptyBools: $.Slice<boolean>

	public declare Structs: $.Slice<Inner>

	public declare NilStructs: $.Slice<Inner>

	public declare EmptyStructs: $.Slice<Inner>

	constructor(__goscriptValue?: boolean, Flag$?: boolean, Name$?: string, Signed$?: bigint, Unsigned$?: bigint, Scalar$?: number, Nested$?: Inner, Fixed$?: Inner[], Values$?: $.Slice<number>, NilValues$?: $.Slice<number>, EmptyValues$?: $.Slice<number>, Ints$?: $.Slice<number>, NilInts$?: $.Slice<number>, EmptyInts$?: $.Slice<number>, Uints$?: $.Slice<bigint>, NilUints$?: $.Slice<bigint>, EmptyUints$?: $.Slice<bigint>, Strings$?: $.Slice<string>, NilStrings$?: $.Slice<string>, EmptyStrings$?: $.Slice<string>, Bools$?: $.Slice<boolean>, NilBools$?: $.Slice<boolean>, EmptyBools$?: $.Slice<boolean>, Structs$?: $.Slice<Inner>, NilStructs$?: $.Slice<Inner>, EmptyStructs$?: $.Slice<Inner>) {
		this.Flag = Flag$ ?? false
		this.Name = Name$ ?? ""
		this.Signed = Signed$ ?? 0n
		this.Unsigned = Unsigned$ ?? 0n
		this.Scalar = Scalar$ ?? 0
		this.Nested = Nested$ ?? new Inner(true)
		this.Fixed = Fixed$ ?? $.arrayValue(globalThis.Array.from({ length: 2 }, () => new Inner(true)), /* @__PURE__ */ $.arrayType("semantics.Inner", 2))
		this.Values = Values$ ?? (null! as $.Slice<number>)
		this.NilValues = NilValues$ ?? (null! as $.Slice<number>)
		this.EmptyValues = EmptyValues$ ?? (null! as $.Slice<number>)
		this.Ints = Ints$ ?? (null! as $.Slice<number>)
		this.NilInts = NilInts$ ?? (null! as $.Slice<number>)
		this.EmptyInts = EmptyInts$ ?? (null! as $.Slice<number>)
		this.Uints = Uints$ ?? (null! as $.Slice<bigint>)
		this.NilUints = NilUints$ ?? (null! as $.Slice<bigint>)
		this.EmptyUints = EmptyUints$ ?? (null! as $.Slice<bigint>)
		this.Strings = Strings$ ?? (null! as $.Slice<string>)
		this.NilStrings = NilStrings$ ?? (null! as $.Slice<string>)
		this.EmptyStrings = EmptyStrings$ ?? (null! as $.Slice<string>)
		this.Bools = Bools$ ?? (null! as $.Slice<boolean>)
		this.NilBools = NilBools$ ?? (null! as $.Slice<boolean>)
		this.EmptyBools = EmptyBools$ ?? (null! as $.Slice<boolean>)
		this.Structs = Structs$ ?? (null! as $.Slice<Inner>)
		this.NilStructs = NilStructs$ ?? (null! as $.Slice<Inner>)
		this.EmptyStructs = EmptyStructs$ ?? (null! as $.Slice<Inner>)
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): Snapshot {
		return new Snapshot(true, this.Flag, this.Name, this.Signed, this.Unsigned, this.Scalar, this.Nested.clone(), $.cloneArrayValue(this.Fixed, __goscriptStatic0()), this.Values, this.NilValues, this.EmptyValues, this.Ints, this.NilInts, this.EmptyInts, this.Uints, this.NilUints, this.EmptyUints, this.Strings, this.NilStrings, this.EmptyStrings, this.Bools, this.NilBools, this.EmptyBools, this.Structs, this.NilStructs, this.EmptyStructs)
	}

	public __goscriptAssign(source: Snapshot): this {
		this.Flag = source.Flag
		this.Name = source.Name
		this.Signed = source.Signed
		this.Unsigned = source.Unsigned
		this.Scalar = source.Scalar
		this.Nested.__goscriptAssign(source.Nested)
		this.Fixed = $.assignFieldValue(this.Fixed, source.Fixed, __goscriptStatic0())
		this.Values = source.Values
		this.NilValues = source.NilValues
		this.EmptyValues = source.EmptyValues
		this.Ints = source.Ints
		this.NilInts = source.NilInts
		this.EmptyInts = source.EmptyInts
		this.Uints = source.Uints
		this.NilUints = source.NilUints
		this.EmptyUints = source.EmptyUints
		this.Strings = source.Strings
		this.NilStrings = source.NilStrings
		this.EmptyStrings = source.EmptyStrings
		this.Bools = source.Bools
		this.NilBools = source.NilBools
		this.EmptyBools = source.EmptyBools
		this.Structs = source.Structs
		this.NilStructs = source.NilStructs
		this.EmptyStructs = source.EmptyStructs
		return this
	}

	static __typeInfo = $.registerStructType(
		"semantics.Snapshot",
		() => new Snapshot(),
		() => [],
		Snapshot,
		() => [{ name: "Flag", key: "Flag", type: /* @__PURE__ */ $.basicType("bool") }, { name: "Name", key: "Name", type: /* @__PURE__ */ $.basicType("string") }, { name: "Signed", key: "Signed", type: /* @__PURE__ */ $.basicType("int64") }, { name: "Unsigned", key: "Unsigned", type: /* @__PURE__ */ $.basicType("uint64") }, { name: "Scalar", key: "Scalar", type: /* @__PURE__ */ $.basicType("float64") }, { name: "Nested", key: "Nested", type: "semantics.Inner" }, { name: "Fixed", key: "Fixed", type: /* @__PURE__ */ $.arrayType("semantics.Inner", 2) }, { name: "Values", key: "Values", type: /* @__PURE__ */ $.sliceType(/* @__PURE__ */ $.basicType("float64")) }, { name: "NilValues", key: "NilValues", type: /* @__PURE__ */ $.sliceType(/* @__PURE__ */ $.basicType("float64")) }, { name: "EmptyValues", key: "EmptyValues", type: /* @__PURE__ */ $.sliceType(/* @__PURE__ */ $.basicType("float64")) }, { name: "Ints", key: "Ints", type: /* @__PURE__ */ $.sliceType(/* @__PURE__ */ $.basicType("int")) }, { name: "NilInts", key: "NilInts", type: /* @__PURE__ */ $.sliceType(/* @__PURE__ */ $.basicType("int")) }, { name: "EmptyInts", key: "EmptyInts", type: /* @__PURE__ */ $.sliceType(/* @__PURE__ */ $.basicType("int")) }, { name: "Uints", key: "Uints", type: /* @__PURE__ */ $.sliceType(/* @__PURE__ */ $.basicType("uint64")) }, { name: "NilUints", key: "NilUints", type: /* @__PURE__ */ $.sliceType(/* @__PURE__ */ $.basicType("uint64")) }, { name: "EmptyUints", key: "EmptyUints", type: /* @__PURE__ */ $.sliceType(/* @__PURE__ */ $.basicType("uint64")) }, { name: "Strings", key: "Strings", type: /* @__PURE__ */ $.sliceType(/* @__PURE__ */ $.basicType("string")) }, { name: "NilStrings", key: "NilStrings", type: /* @__PURE__ */ $.sliceType(/* @__PURE__ */ $.basicType("string")) }, { name: "EmptyStrings", key: "EmptyStrings", type: /* @__PURE__ */ $.sliceType(/* @__PURE__ */ $.basicType("string")) }, { name: "Bools", key: "Bools", type: /* @__PURE__ */ $.sliceType(/* @__PURE__ */ $.basicType("bool")) }, { name: "NilBools", key: "NilBools", type: /* @__PURE__ */ $.sliceType(/* @__PURE__ */ $.basicType("bool")) }, { name: "EmptyBools", key: "EmptyBools", type: /* @__PURE__ */ $.sliceType(/* @__PURE__ */ $.basicType("bool")) }, { name: "Structs", key: "Structs", type: /* @__PURE__ */ $.sliceType("semantics.Inner") }, { name: "NilStructs", key: "NilStructs", type: /* @__PURE__ */ $.sliceType("semantics.Inner") }, { name: "EmptyStructs", key: "EmptyStructs", type: /* @__PURE__ */ $.sliceType("semantics.Inner") }]
	)
}

export function SnapshotValue(): Snapshot {
	let negativeZero = math.Copysign(0, -1)
	return new Snapshot(true, true, "probe", -9n, 42n, negativeZero, new Inner(true, 7, "nested"), $.arrayValue([new Inner(true, 11, "fixed-a"), new Inner(true, 12, "fixed-b")], __goscriptStatic0()), $.typedSliceOf(Float64Array, [negativeZero, 1.25, 1e21]) as $.Slice<number>, null, $.typedSliceOf(Float64Array, []) as $.Slice<number>, $.arrayToSlice<number>([-2, 3]), null, $.arrayToSlice<number>([]), $.arrayToSlice<bigint>([0n, 42n]), null, $.arrayToSlice<bigint>([]), $.arrayToSlice<string>(["", "g"]), null, $.arrayToSlice<string>([]), $.arrayToSlice<boolean>([true, false]), null, $.arrayToSlice<boolean>([]), $.arrayToSlice<Inner>([new Inner(true, 13, "slice")]), null, $.arrayToSlice<Inner>([]))
}

export function IntegerWidthsValue(): IntegerWidths {
	return new IntegerWidths(true, 1, 2, 3, 4, 5n, 6, 7, 8, 9, 10n, 11, 12)
}

export function IntegerWidthsAtMax(): IntegerWidths {
	return new IntegerWidths(true, 9007199254740991, 127, 32767, 2147483647, 9223372036854775807n, 9007199254740991, 255, 65535, 4294967295, 18446744073709551615n, 255, 2147483647)
}

export function IncrementIntegerWidths(value: IntegerWidths): IntegerWidths {
	value.Int++
	value.Int8 = ((value.Int8 + 1) << 24 >> 24)
	value.Int16 = ((value.Int16 + 1) << 16 >> 16)
	value.Int32 = ((value.Int32 + 1) | 0)
	value.Int64++
	value.Uint++
	value.Uint8 = ((value.Uint8 + 1) & 0xff)
	value.Uint16 = ((value.Uint16 + 1) & 0xffff)
	value.Uint32 = ((value.Uint32 + 1) >>> 0)
	value.Uint64++
	value.Byte = ((value.Byte + 1) & 0xff)
	value.Rune = ((value.Rune + 1) | 0)
	return value
}

export function FormatFloat(value: number, format: number, precision: number, bitSize: number): string {
	return strconv.FormatFloat(value, format, precision, bitSize)
}

export function FormatUint(value: bigint, base: number): string {
	return strconv.FormatUint(value, base)
}

export function FormatInt(value: bigint, base: number): string {
	return strconv.FormatInt(value, base)
}

export function Itoa(value: number): string {
	return strconv.Itoa(value)
}

export function Mutate(snapshot: Snapshot): Snapshot {
	snapshot.Scalar = 2.5
	$.sliceElems(snapshot.Values!)[$.sliceSlot(snapshot.Values!, 0)]++
	snapshot.Values = $.appendOne(snapshot.Values, 2.5, $.typedSliceHints.float64)
	snapshot.Nested.Count++
	snapshot.Fixed[0].Count++
	$.plainSliceIndex(snapshot.Structs!, 0).Count++
	return snapshot
}

export function AppendThenMutate(snapshot: Snapshot): Snapshot {
	snapshot.Structs = $.appendOne(snapshot.Structs, new Inner(true, 15, "append"))
	$.plainSliceIndex(snapshot.Structs!, 0).Count += 100
	return snapshot
}

var __goscriptStatic0$value: any
function __goscriptStatic0(): any {
	return __goscriptStatic0$value ??= (/* @__PURE__ */ $.arrayType("semantics.Inner", 2))
}
