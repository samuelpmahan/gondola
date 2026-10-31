// Generated file based on html.go
// Updated when compliance tests are re-run, DO NOT EDIT!

import * as $ from "@goscript/builtin/index.js"
import * as __goscript_names from "./names.gs.ts"
import * as __goscript_node from "./node.gs.ts"
import "@goscript/fmt/index.js"
import "./node.gs.ts"

$.registerTypePackagePath("github.com/samuelpmahan/gondola/gobi", ["gobi.htmlState", "gobi.selectScope", "gobi.written"])

export class htmlState {
	public declare out: string

	public declare preloads: string

	public declare seen: $.Slice<string>

	constructor(__goscriptValue?: boolean, out$?: string, preloads$?: string, seen$?: $.Slice<string>) {
		this.out = out$ ?? ""
		this.preloads = preloads$ ?? ""
		this.seen = seen$ ?? (null! as $.Slice<string>)
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): htmlState {
		return new htmlState(true, this.out, this.preloads, this.seen)
	}

	public __goscriptAssign(source: htmlState): this {
		this.out = source.out
		this.preloads = source.preloads
		this.seen = source.seen
		return this
	}

	public attributes(n: __goscript_node.Node, scope: selectScope): [$.Slice<written>, string, boolean] {
		const s: htmlState | $.VarRef<htmlState> | null = this;
		let list: $.Slice<written> = null! as $.Slice<written>
		let textareaValue = ""
		let hasTextareaValue = false
		let flagSelected = false
		for (let __goscriptRangeTarget0 = n.Attrs, __goscriptRangeWindow0 = $.sliceRange(__goscriptRangeTarget0), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow0.length; __rangeIndex++) {
			let a = ((__goscriptRangeWindow0.backing[__goscriptRangeWindow0.offset + __rangeIndex] as __goscript_node.Attr)).clone()
			switch ((true as boolean)) {
				case a.Flag:
				{
					switch ((true as boolean)) {
						case $.stringEqual(a.Name, "selected"):
						{
							flagSelected = $.stringEqual(n.Tag, "option")
							break
						}
						case $.stringEqual(a.Name, "checked"):
						{
							if ($.stringEqual(n.Tag, "input")) {
								list = $.appendOne(list, new written(true, "checked", " checked=\"\""))
							}
							break
						}
						case __goscript_names.isBoolean(a.Name):
						{
							let name = __goscript_names.outputName(a.Name)
							list = $.appendOne(list, new written(true, name, " " + name + "=\"\""))
							break
						}
						case hasPrefix(a.Name, "data-") || hasPrefix(a.Name, "aria-"):
						{
							list = $.appendOne(list, new written(true, a.Name, " " + a.Name + "=\"true\""))
							break
						}
					}
					break
				}
				case $.stringEqual(a.Name, "style"):
				{
					let css = styleText(a.Style)
					if (!$.stringEqual(css, "")) {
						list = $.appendOne(list, (() => { const __goscriptLiteralField0 = " style=\"" + escape(css) + "\""; return new written(true, "style", __goscriptLiteralField0) })())
					}
					break
				}
				case ($.stringEqual(a.Name, "value")) && ($.stringEqual(n.Tag, "textarea")):
				{
					let __goscriptAssign0_0: string = a.Value
					let __goscriptAssign0_1: boolean = true
					textareaValue = __goscriptAssign0_0
					hasTextareaValue = __goscriptAssign0_1
					break
				}
				case ($.stringEqual(a.Name, "value")) && ($.stringEqual(n.Tag, "select")):
				{
					break
				}
				case ($.stringEqual(a.Name, "src")) && ($.stringEqual(a.Value, "")):
				case (($.stringEqual(a.Name, "href")) && ($.stringEqual(a.Value, ""))) && (!$.stringEqual(n.Tag, "a")):
				{
					break
				}
				case ($.stringEqual(a.Name, "rowspan")) && numberIsNaN(a.Value):
				{
					break
				}
				default:
				{
					let name = __goscript_names.outputName(a.Name)
					let value = a.Value
					if ((($.stringEqual(a.Name, "href")) || ($.stringEqual(a.Name, "src"))) && isJavascriptURL(value)) {
						value = "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')"
					}
					list = $.appendOne(list, (() => { const __goscriptLiteralField1 = " " + name + "=\"" + escape(value) + "\""; return new written(true, name, __goscriptLiteralField1) })())
					break
				}
			}
		}
		if ($.stringEqual(n.Tag, "input")) {
			list = inputOrder(list)
		}
		if ($.stringEqual(n.Tag, "button")) {
			list = nameLast(list)
		}
		if ($.stringEqual(n.Tag, "option")) {
			let selected = flagSelected
			if (scope.has) {
				selected = optionMatches(n, scope.value)
			}
			if (selected) {
				list = $.appendOne(list, new written(true, "selected", " selected=\"\""))
			}
		}
		if ($.stringEqual(n.Tag, "img")) {
			void (s !== null && (s as any).__isVarRef !== true && (s as any).__goValue === undefined ? ((s as any) as htmlState).preloadImage(n) : htmlState.prototype.preloadImage.call(s, n))
		}
		return [list, textareaValue, hasTextareaValue]
	}

	public element(n: __goscript_node.Node, scope: selectScope): void {
		const s: htmlState | $.VarRef<htmlState> | null = this;
		const s$: htmlState = s == null ? $.pointerTarget<htmlState>(s) : (s as any).__isVarRef === true ? (s as any).value : (s as any).__goValue === undefined ? (s as any) : $.pointerTarget<htmlState>(s)
		let __goscriptTuple0: any = (s !== null && (s as any).__isVarRef !== true && (s as any).__goValue === undefined ? ((s as any) as htmlState).attributes(n, scope) : htmlState.prototype.attributes.call(s, n, scope))
		let attrs: $.Slice<written> = __goscriptTuple0[0]
		let textareaValue: string = __goscriptTuple0[1]
		let hasTextareaValue: boolean = __goscriptTuple0[2];
		;(s$ as htmlState).out += "<" + n.Tag
		for (let __goscriptRangeTarget1 = attrs, __goscriptRangeWindow1 = $.sliceRange(__goscriptRangeTarget1), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow1.length; __rangeIndex++) {
			let a = ((__goscriptRangeWindow1.backing[__goscriptRangeWindow1.offset + __rangeIndex] as written)).clone();
			;(s$ as htmlState).out += a.text
		}
		if ($.mapGet<string, boolean, boolean>(_void, n.Tag, false)[0]) {
			;(s$ as htmlState).out += "/>"
			return
		}
		;(s$ as htmlState).out += ">"
		switch (n.Tag) {
			case "textarea":
			{
				let content = textareaValue
				if ((!hasTextareaValue && ($.sliceLen(n.Kids) == 1)) && ($.plainSliceIndex(n.Kids!, 0).Kind == 2)) {
					content = $.plainSliceIndex(n.Kids!, 0).Text
				}
				if (($.stringLen(content) > 0) && ($.indexString(content, 0) == 10)) {
					;(s$ as htmlState).out += "\n"
				}
				;(s$ as htmlState).out += escape(content)
				break
			}
			case "select":
			{
				let inner = new selectScope(true)
				for (let __goscriptRangeTarget2 = n.Attrs, __goscriptRangeWindow2 = $.sliceRange(__goscriptRangeTarget2), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow2.length; __rangeIndex++) {
					let a = ((__goscriptRangeWindow2.backing[__goscriptRangeWindow2.offset + __rangeIndex] as __goscript_node.Attr)).clone()
					if (($.stringEqual(a.Name, "value")) && !a.Flag) {
						inner = inner.__goscriptAssign(new selectScope(true, true, a.Value))
					}
				}
				for (let __goscriptRangeTarget3 = n.Kids, __goscriptRangeWindow3 = $.sliceRange(__goscriptRangeTarget3), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow3.length; __rangeIndex++) {
					let k = ((__goscriptRangeWindow3.backing[__goscriptRangeWindow3.offset + __rangeIndex] as __goscript_node.Node)).clone()
					void (s !== null && (s as any).__isVarRef !== true && (s as any).__goValue === undefined ? ((s as any) as htmlState).write((k).clone(), inner) : htmlState.prototype.write.call(s, (k).clone(), inner))
				}
				break
			}
			default:
			{
				for (let __goscriptRangeTarget4 = n.Kids, __goscriptRangeWindow4 = $.sliceRange(__goscriptRangeTarget4), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow4.length; __rangeIndex++) {
					let k = ((__goscriptRangeWindow4.backing[__goscriptRangeWindow4.offset + __rangeIndex] as __goscript_node.Node)).clone()
					void (s !== null && (s as any).__isVarRef !== true && (s as any).__goValue === undefined ? ((s as any) as htmlState).write((k).clone(), scope) : htmlState.prototype.write.call(s, (k).clone(), scope))
				}
				break
			}
		}
		;(s$ as htmlState).out += "</" + n.Tag + ">"
	}

	public preloadImage(n: __goscript_node.Node): void {
		const s: htmlState | $.VarRef<htmlState> | null = this;
		const s$: htmlState = s == null ? $.pointerTarget<htmlState>(s) : (s as any).__isVarRef === true ? (s as any).value : (s as any).__goValue === undefined ? (s as any) : $.pointerTarget<htmlState>(s)
		let src = ""
		let hasSrc = false
		let typeValue = ""
		let hasType = false
		for (let __goscriptRangeTarget5 = n.Attrs, __goscriptRangeWindow5 = $.sliceRange(__goscriptRangeTarget5), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow5.length; __rangeIndex++) {
			let a = (__goscriptRangeWindow5.backing[__goscriptRangeWindow5.offset + __rangeIndex] as __goscript_node.Attr)
			if (($.stringEqual(a.Name, "src")) && !a.Flag) {
				let __goscriptAssign1_0: string = a.Value
				let __goscriptAssign1_1: boolean = true
				src = __goscriptAssign1_0
				hasSrc = __goscriptAssign1_1
			}
			if (($.stringEqual(a.Name, "type")) && !a.Flag) {
				let __goscriptAssign2_0: string = a.Value
				let __goscriptAssign2_1: boolean = true
				typeValue = __goscriptAssign2_0
				hasType = __goscriptAssign2_1
			}
		}
		if ((!hasSrc || ($.stringEqual(src, ""))) || hasPrefixFold(src, "data:")) {
			return
		}
		for (let __goscriptRangeTarget6 = (s$ as htmlState).seen, __goscriptRangeWindow6 = $.sliceRange(__goscriptRangeTarget6), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow6.length; __rangeIndex++) {
			let __goscriptRangeShadow0 = (__goscriptRangeWindow6.backing[__goscriptRangeWindow6.offset + __rangeIndex] as string)
			if ($.stringEqual(__goscriptRangeShadow0, src)) {
				return
			}
		}
		;(s$ as htmlState).seen = $.appendOne((s$ as htmlState).seen, src)
		if (isJavascriptURL(src)) {
			src = "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')"
		}
		let link = "<link rel=\"preload\" as=\"image\" href=\"" + escape(src) + "\""
		if (hasType) {
			link += " type=\"" + escape(typeValue) + "\""
		}
		;(s$ as htmlState).preloads += link + "/>"
	}

	public write(n: __goscript_node.Node, scope: selectScope): void {
		const s: htmlState | $.VarRef<htmlState> | null = this;
		const s$: htmlState = s == null ? $.pointerTarget<htmlState>(s) : (s as any).__isVarRef === true ? (s as any).value : (s as any).__goValue === undefined ? (s as any) : $.pointerTarget<htmlState>(s)
		switch (n.Kind) {
			case 2:
			{
				;(s$ as htmlState).out += escape(n.Text)
				break
			}
			case 3:
			{
				for (let __goscriptRangeTarget7 = n.Kids, __goscriptRangeWindow7 = $.sliceRange(__goscriptRangeTarget7), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow7.length; __rangeIndex++) {
					let k = ((__goscriptRangeWindow7.backing[__goscriptRangeWindow7.offset + __rangeIndex] as __goscript_node.Node)).clone()
					void (s !== null && (s as any).__isVarRef !== true && (s as any).__goValue === undefined ? ((s as any) as htmlState).write((k).clone(), scope) : htmlState.prototype.write.call(s, (k).clone(), scope))
				}
				break
			}
			case 1:
			{
				void (s !== null && (s as any).__isVarRef !== true && (s as any).__goValue === undefined ? ((s as any) as htmlState).element(n, scope) : htmlState.prototype.element.call(s, n, scope))
				break
			}
		}
	}

	static __typeInfo = $.registerStructType(
		"gobi.htmlState",
		() => new htmlState(),
		() => [{ name: "attributes", args: [{ type: { kind: $.TypeKind.Basic, name: "unknown" } }, { type: { kind: $.TypeKind.Basic, name: "unknown" } }], returns: [{ type: /* @__PURE__ */ $.sliceType("gobi.written") }, { type: /* @__PURE__ */ $.basicType("string") }, { type: /* @__PURE__ */ $.basicType("bool") }], pointerReceiver: true }, { name: "element", args: [{ type: { kind: $.TypeKind.Basic, name: "unknown" } }, { type: { kind: $.TypeKind.Basic, name: "unknown" } }], returns: [], pointerReceiver: true }, { name: "preloadImage", args: [{ type: { kind: $.TypeKind.Basic, name: "unknown" } }], returns: [], pointerReceiver: true }, { name: "write", args: [{ type: { kind: $.TypeKind.Basic, name: "unknown" } }, { type: { kind: $.TypeKind.Basic, name: "unknown" } }], returns: [], pointerReceiver: true }],
		htmlState,
		() => [{ name: "out", key: "out", type: /* @__PURE__ */ $.basicType("string") }, { name: "preloads", key: "preloads", type: /* @__PURE__ */ $.basicType("string") }, { name: "seen", key: "seen", type: /* @__PURE__ */ $.sliceType(/* @__PURE__ */ $.basicType("string")) }]
	)
}

export class selectScope {
	public declare has: boolean

	public declare value: string

	constructor(__goscriptValue?: boolean, has$?: boolean, value$?: string) {
		this.has = has$ ?? false
		this.value = value$ ?? ""
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): selectScope {
		return new selectScope(true, this.has, this.value)
	}

	public __goscriptAssign(source: selectScope): this {
		this.has = source.has
		this.value = source.value
		return this
	}

	static __typeInfo = $.registerStructType(
		"gobi.selectScope",
		() => new selectScope(),
		() => [],
		selectScope,
		() => [{ name: "has", key: "has", type: /* @__PURE__ */ $.basicType("bool") }, { name: "value", key: "value", type: /* @__PURE__ */ $.basicType("string") }]
	)
}

export class written {
	public declare name: string

	public declare text: string

	constructor(__goscriptValue?: boolean, name$?: string, text$?: string) {
		this.name = name$ ?? ""
		this.text = text$ ?? ""
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): written {
		return new written(true, this.name, this.text)
	}

	public __goscriptAssign(source: written): this {
		this.name = source.name
		this.text = source.text
		return this
	}

	static __typeInfo = $.registerStructType(
		"gobi.written",
		() => new written(),
		() => [],
		written,
		() => [{ name: "name", key: "name", type: /* @__PURE__ */ $.basicType("string") }, { name: "text", key: "text", type: /* @__PURE__ */ $.basicType("string") }]
	)
}

export const blockedURL: string = "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')"

export function HTML(n: __goscript_node.Node): string {
	let s = $.varRef(new htmlState(true))
	s.value.write(n, new selectScope(true))
	return joinSurrogates(s.value.preloads + s.value.out)
}

export let _void: globalThis.Map<string, boolean> | null = $.makeMap<string, boolean>([["area", true], ["base", true], ["br", true], ["col", true], ["embed", true], ["hr", true], ["img", true], ["input", true], ["link", true], ["meta", true], ["source", true], ["track", true], ["wbr", true]])

export function __goscript_set__void(__goscriptValue: globalThis.Map<string, boolean> | null): void {
	_void = __goscriptValue
}

export function inputOrder(list: $.Slice<written>): $.Slice<written> {
	let out: $.Slice<written> = null! as $.Slice<written>
	for (let __goscriptRangeTarget8 = list, __goscriptRangeWindow8 = $.sliceRange(__goscriptRangeTarget8), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow8.length; __rangeIndex++) {
		let a = ((__goscriptRangeWindow8.backing[__goscriptRangeWindow8.offset + __rangeIndex] as written)).clone()
		if (((!$.stringEqual(a.name, "name")) && (!$.stringEqual(a.name, "checked"))) && (!$.stringEqual(a.name, "value"))) {
			out = $.appendOne(out, (a).clone())
		}
	}
	for (let __goscriptRangeTarget10 = $.arrayToSlice<string>(["name", "checked", "value"]), __goscriptRangeWindow9 = $.sliceRange(__goscriptRangeTarget10), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow9.length; __rangeIndex++) {
		let last = (__goscriptRangeWindow9.backing[__goscriptRangeWindow9.offset + __rangeIndex] as string)
		for (let __goscriptRangeTarget9 = list, __goscriptRangeWindow10 = $.sliceRange(__goscriptRangeTarget9), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow10.length; __rangeIndex++) {
			let a = ((__goscriptRangeWindow10.backing[__goscriptRangeWindow10.offset + __rangeIndex] as written)).clone()
			if ($.stringEqual(a.name, last)) {
				out = $.appendOne(out, (a).clone())
			}
		}
	}
	return out
}

export function nameLast(list: $.Slice<written>): $.Slice<written> {
	let out: $.Slice<written> = null! as $.Slice<written>
	for (let __goscriptRangeTarget11 = list, __goscriptRangeWindow11 = $.sliceRange(__goscriptRangeTarget11), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow11.length; __rangeIndex++) {
		let a = ((__goscriptRangeWindow11.backing[__goscriptRangeWindow11.offset + __rangeIndex] as written)).clone()
		if (!$.stringEqual(a.name, "name")) {
			out = $.appendOne(out, (a).clone())
		}
	}
	for (let __goscriptRangeTarget12 = list, __goscriptRangeWindow12 = $.sliceRange(__goscriptRangeTarget12), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow12.length; __rangeIndex++) {
		let a = ((__goscriptRangeWindow12.backing[__goscriptRangeWindow12.offset + __rangeIndex] as written)).clone()
		if ($.stringEqual(a.name, "name")) {
			out = $.appendOne(out, (a).clone())
		}
	}
	return out
}

export function optionMatches(n: __goscript_node.Node, value: string): boolean {
	for (let __goscriptRangeTarget13 = n.Attrs, __goscriptRangeWindow13 = $.sliceRange(__goscriptRangeTarget13), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow13.length; __rangeIndex++) {
		let a = (__goscriptRangeWindow13.backing[__goscriptRangeWindow13.offset + __rangeIndex] as __goscript_node.Attr)
		if (($.stringEqual(a.Name, "value")) && !a.Flag) {
			return $.stringEqual(a.Value, value)
		}
	}
	let text = ""
	for (let __goscriptRangeTarget14 = n.Kids, __goscriptRangeWindow14 = $.sliceRange(__goscriptRangeTarget14), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow14.length; __rangeIndex++) {
		let k = (__goscriptRangeWindow14.backing[__goscriptRangeWindow14.offset + __rangeIndex] as __goscript_node.Node)
		if (k.Kind != 2) {
			return false
		}
		text += k.Text
	}
	return $.stringEqual(joinSurrogates(text), joinSurrogates(value))
}

export function isJavascriptURL(url: string): boolean {
	let i = 0
	while ((i < $.stringLen(url)) && (($.indexString(url, i) <= 0x1F) || ($.indexString(url, i) == 32))) {
		i++
	}
	let word = "javascript"
	for (let w = 0; w < $.stringLen(word); w++) {
		while (((i < $.stringLen(url)) && ((($.indexString(url, i) == 9) || ($.indexString(url, i) == 10)) || ($.indexString(url, i) == 13))) && (w > 0)) {
			i++
		}
		if (i >= $.stringLen(url)) {
			return false
		}
		let c = $.indexString(url, i)
		if ((c >= 65) && (c <= 90)) {
			c = $.uint((((((c - 65) & 0xff)) + 97) & 0xff), 8)
		}
		if (c != $.indexString(word, w)) {
			return false
		}
		i++
	}
	while ((i < $.stringLen(url)) && ((($.indexString(url, i) == 9) || ($.indexString(url, i) == 10)) || ($.indexString(url, i) == 13))) {
		i++
	}
	return (i < $.stringLen(url)) && ($.indexString(url, i) == 58)
}

export function joinSurrogates(s: string): string {
	let found = false
	for (let i = 0; (i + 5) < $.stringLen(s); i++) {
		if (((((($.indexString(s, i) == 0xED) && ($.indexString(s, i + 1) >= 0xA0)) && ($.indexString(s, i + 1) <= 0xAF)) && ($.indexString(s, i + 3) == 0xED)) && ($.indexString(s, i + 4) >= 0xB0)) && ($.indexString(s, i + 4) <= 0xBF)) {
			found = true
		}
	}
	if (!found) {
		return s
	}
	let out = ""
	for (let i = 0; i < $.stringLen(s); i++) {
		if ((((((($.indexString(s, i) == 0xED) && ((i + 5) < $.stringLen(s))) && ($.indexString(s, i + 1) >= 0xA0)) && ($.indexString(s, i + 1) <= 0xAF)) && ($.indexString(s, i + 3) == 0xED)) && ($.indexString(s, i + 4) >= 0xB0)) && ($.indexString(s, i + 4) <= 0xBF)) {
			let high = (0xD000 + ($.intShl(($.indexString(s, i + 1) & 0x3F), 6))) + ($.indexString(s, i + 2) & 0x3F)
			let low = (0xD000 + ($.intShl(($.indexString(s, i + 4) & 0x3F), 6))) + ($.indexString(s, i + 5) & 0x3F)
			let r = (0x10000 + ($.intShl((high - 0xD800), 10))) + (low - 0xDC00)
			out += $.bytesToString(new Uint8Array([$.uint($.intOr(0xF0, ($.intShr(r, 18))), 8), $.uint($.intOr(0x80, (($.intShr(r, 12)) & 0x3F)), 8), $.uint($.intOr(0x80, (($.intShr(r, 6)) & 0x3F)), 8), $.uint($.intOr(0x80, (r & 0x3F)), 8)]) as $.Slice<number>)
			i += 5
			continue
		}
		out += $.sliceStringOrBytes(s, i, i + 1)
	}
	return out
}

export function styleText(styles: $.Slice<__goscript_node.Style>): string {
	let keys: $.Slice<string> = null! as $.Slice<string>
	let values: $.Slice<string> = null! as $.Slice<string>
	for (let __goscriptRangeTarget16 = styles, __goscriptRangeWindow15 = $.sliceRange(__goscriptRangeTarget16), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow15.length; __rangeIndex++) {
		let st = ((__goscriptRangeWindow15.backing[__goscriptRangeWindow15.offset + __rangeIndex] as __goscript_node.Style)).clone()
		let key = __goscript_names.StyleKey(st.Property)
		let found = false
		for (let __goscriptRangeTarget15 = keys, __goscriptRangeWindow16 = $.sliceRange(__goscriptRangeTarget15), __goscriptSliceWindow0 = $.sliceRange(values), i = 0; i < __goscriptRangeWindow16.length; i++) {
			if ($.stringEqual(((__goscriptRangeWindow16.backing as any[])[__goscriptRangeWindow16.offset + i] as string), key)) {
				;(__goscriptSliceWindow0.backing as any[])[$.windowSlot(__goscriptSliceWindow0, i)] = st.Value
				found = true
			}
		}
		if (!found) {
			keys = $.appendOne(keys, key)
			values = $.appendOne(values, st.Value)
		}
	}
	let css = ""
	for (let __goscriptRangeTarget17 = keys, __goscriptRangeWindow17 = $.sliceRange(__goscriptRangeTarget17), __goscriptSliceWindow1 = $.sliceRange(values), i = 0; i < __goscriptRangeWindow17.length; i++) {
		if ($.stringEqual(((__goscriptSliceWindow1.backing as any[])[$.windowSlot(__goscriptSliceWindow1, i)] as string), "")) {
			continue
		}
		if (!$.stringEqual(css, "")) {
			css += ";"
		}
		css += hyphenate(((__goscriptRangeWindow17.backing as any[])[__goscriptRangeWindow17.offset + i] as string)) + ":" + trimJS(((__goscriptSliceWindow1.backing as any[])[$.windowSlot(__goscriptSliceWindow1, i)] as string))
	}
	return css
}

export function hyphenate(key: string): string {
	if ((($.stringLen(key) >= 2) && ($.indexString(key, 0) == 45)) && ($.indexString(key, 1) == 45)) {
		return key
	}
	if (((($.stringLen(key) > 2) && ($.sliceStringEqual(key, undefined, 2, "ms"))) && ($.indexString(key, 2) >= 65)) && ($.indexString(key, 2) <= 90)) {
		key = "-" + key
	}
	let out = ""
	for (let i = 0; i < $.stringLen(key); i++) {
		let c = $.indexString(key, i)
		if ((c >= 65) && (c <= 90)) {
			out += "-" + $.runeToString(($.uint((((((c - 65) & 0xff)) + 97) & 0xff), 8)))
		} else {
			out += $.sliceStringOrBytes(key, i, i + 1)
		}
	}
	return out
}

export function hasPrefix(s: string, prefix: string): boolean {
	return ($.stringLen(s) >= $.stringLen(prefix)) && ($.sliceStringEqual(s, undefined, $.stringLen(prefix), prefix))
}

export function hasPrefixFold(s: string, prefix: string): boolean {
	if ($.stringLen(s) < $.stringLen(prefix)) {
		return false
	}
	for (let i = 0; i < $.stringLen(prefix); i++) {
		let c = $.indexString(s, i)
		if ((c >= 65) && (c <= 90)) {
			c = $.uint((((((c - 65) & 0xff)) + 97) & 0xff), 8)
		}
		if (c != $.indexString(prefix, i)) {
			return false
		}
	}
	return true
}

export function isJSSpace(r: number): boolean {
	switch (r) {
		case 9:
		case 10:
		case 11:
		case 12:
		case 13:
		case 32:
		case 0xA0:
		case 0x1680:
		case 0x2028:
		case 0x2029:
		case 0x202F:
		case 0x205F:
		case 0x3000:
		case 0xFEFF:
		{
			return true
			break
		}
	}
	return (r >= 0x2000) && (r <= 0x200A)
}

export function trimJS(s: string): string {
	let start = $.stringLen(s)
	let end = $.stringLen(s)
	let lastWasText = false
	for (let __goscriptRunes0 = $.stringRunes(s); __goscriptRunes0.next(); ) {
		const i = __goscriptRunes0.index
		const r = __goscriptRunes0.rune
		if (isJSSpace(r)) {
			if (lastWasText) {
				end = i
			}
			lastWasText = false
			continue
		}
		if (start == $.stringLen(s)) {
			start = i
		}
		lastWasText = true
		end = $.stringLen(s)
	}
	if (start == $.stringLen(s)) {
		return ""
	}
	return $.sliceStringOrBytes(s, start, end)
}

export function numberIsNaN(s: string): boolean {
	s = trimJS(s)
	if ($.stringEqual(s, "")) {
		return false
	}
	if (($.stringLen(s) > 2) && ($.indexString(s, 0) == 48)) {
		let base = 0
		switch ($.indexString(s, 1)) {
			case 120:
			case 88:
			{
				base = 16
				break
			}
			case 111:
			case 79:
			{
				base = 8
				break
			}
			case 98:
			case 66:
			{
				base = 2
				break
			}
		}
		if (base != 0) {
			for (let i = 2; i < $.stringLen(s); i++) {
				if (digitValue($.indexString(s, i)) >= base) {
					return true
				}
			}
			return false
		}
	}
	let i = 0
	if (($.indexString(s, i) == 43) || ($.indexString(s, i) == 45)) {
		i++
	}
	if ($.sliceStringEqual(s, i, undefined, "Infinity")) {
		return false
	}
	let digits = 0
	while (((i < $.stringLen(s)) && ($.indexString(s, i) >= 48)) && ($.indexString(s, i) <= 57)) {
		i++
		digits++
	}
	if ((i < $.stringLen(s)) && ($.indexString(s, i) == 46)) {
		i++
		while (((i < $.stringLen(s)) && ($.indexString(s, i) >= 48)) && ($.indexString(s, i) <= 57)) {
			i++
			digits++
		}
	}
	if (digits == 0) {
		return true
	}
	if ((i < $.stringLen(s)) && (($.indexString(s, i) == 101) || ($.indexString(s, i) == 69))) {
		i++
		if ((i < $.stringLen(s)) && (($.indexString(s, i) == 43) || ($.indexString(s, i) == 45))) {
			i++
		}
		let exponent = 0
		while (((i < $.stringLen(s)) && ($.indexString(s, i) >= 48)) && ($.indexString(s, i) <= 57)) {
			i++
			exponent++
		}
		if (exponent == 0) {
			return true
		}
	}
	return i != $.stringLen(s)
}

export function digitValue(c: number): number {
	switch ((true as boolean)) {
		case (c >= 48) && (c <= 57):
		{
			return ($.uint(((c - 48) & 0xff), 8))
			break
		}
		case (c >= 97) && (c <= 102):
		{
			return ($.uint(((c - 97) & 0xff), 8)) + 10
			break
		}
		case (c >= 65) && (c <= 70):
		{
			return ($.uint(((c - 65) & 0xff), 8)) + 10
			break
		}
	}
	return 99
}

export function escape(s: string): string {
	let out = ""
	for (let i = 0; i < $.stringLen(s); i++) {
		switch ($.indexString(s, i)) {
			case 38:
			{
				out += "&amp;"
				break
			}
			case 60:
			{
				out += "&lt;"
				break
			}
			case 62:
			{
				out += "&gt;"
				break
			}
			case 34:
			{
				out += "&quot;"
				break
			}
			case 39:
			{
				out += "&#x27;"
				break
			}
			default:
			{
				out += $.sliceStringOrBytes(s, i, i + 1)
				break
			}
		}
	}
	return out
}
