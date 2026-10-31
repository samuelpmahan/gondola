// Generated file based on names.go
// Updated when compliance tests are re-run, DO NOT EDIT!

import * as $ from "@goscript/builtin/index.js"
import "@goscript/fmt/index.js"

$.registerTypePackagePath("github.com/samuelpmahan/gondola/gobi", ["gobi.AttributeName"])

export class AttributeName {
	public declare DOM: string

	public declare Prop: string

	public declare Output: string

	constructor(__goscriptValue?: boolean, DOM$?: string, Prop$?: string, Output$?: string) {
		this.DOM = DOM$ ?? ""
		this.Prop = Prop$ ?? ""
		this.Output = Output$ ?? ""
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): AttributeName {
		return new AttributeName(true, this.DOM, this.Prop, this.Output)
	}

	public __goscriptAssign(source: AttributeName): this {
		this.DOM = source.DOM
		this.Prop = source.Prop
		this.Output = source.Output
		return this
	}

	static __typeInfo = $.registerStructType(
		"gobi.AttributeName",
		() => new AttributeName(),
		() => [],
		AttributeName,
		() => [{ name: "DOM", key: "DOM", type: /* @__PURE__ */ $.basicType("string") }, { name: "Prop", key: "Prop", type: /* @__PURE__ */ $.basicType("string") }, { name: "Output", key: "Output", type: /* @__PURE__ */ $.basicType("string") }]
	)
}

export let AttributeNames: $.Slice<AttributeName> = $.arrayToSlice<AttributeName>([new AttributeName(true, "class", "className", "class"), new AttributeName(true, "for", "htmlFor", "for"), new AttributeName(true, "tabindex", "tabIndex", "tabindex"), new AttributeName(true, "readonly", "readOnly", "readOnly"), new AttributeName(true, "maxlength", "maxLength", "maxLength"), new AttributeName(true, "minlength", "minLength", "minLength"), new AttributeName(true, "colspan", "colSpan", "colSpan"), new AttributeName(true, "rowspan", "rowSpan", "rowSpan"), new AttributeName(true, "autofocus", "autoFocus", "autofocus"), new AttributeName(true, "autocomplete", "autoComplete", "autoComplete"), new AttributeName(true, "autoplay", "autoPlay", "autoPlay"), new AttributeName(true, "contenteditable", "contentEditable", "contentEditable"), new AttributeName(true, "crossorigin", "crossOrigin", "crossorigin"), new AttributeName(true, "enctype", "encType", "encType"), new AttributeName(true, "formaction", "formAction", "formAction"), new AttributeName(true, "accept-charset", "acceptCharset", "accept-charset"), new AttributeName(true, "http-equiv", "httpEquiv", "http-equiv"), new AttributeName(true, "novalidate", "noValidate", "noValidate"), new AttributeName(true, "spellcheck", "spellCheck", "spellCheck"), new AttributeName(true, "srcset", "srcSet", "srcSet"), new AttributeName(true, "usemap", "useMap", "useMap"), new AttributeName(true, "allowfullscreen", "allowFullScreen", "allowFullScreen"), new AttributeName(true, "formnovalidate", "formNoValidate", "formNoValidate"), new AttributeName(true, "playsinline", "playsInline", "playsInline"), new AttributeName(true, "nomodule", "noModule", "noModule"), new AttributeName(true, "itemscope", "itemScope", "itemScope"), new AttributeName(true, "stroke-width", "strokeWidth", "stroke-width"), new AttributeName(true, "stroke-linecap", "strokeLinecap", "stroke-linecap"), new AttributeName(true, "stroke-linejoin", "strokeLinejoin", "stroke-linejoin"), new AttributeName(true, "stroke-dasharray", "strokeDasharray", "stroke-dasharray"), new AttributeName(true, "stroke-dashoffset", "strokeDashoffset", "stroke-dashoffset"), new AttributeName(true, "stroke-opacity", "strokeOpacity", "stroke-opacity"), new AttributeName(true, "stroke-miterlimit", "strokeMiterlimit", "stroke-miterlimit"), new AttributeName(true, "fill-opacity", "fillOpacity", "fill-opacity"), new AttributeName(true, "fill-rule", "fillRule", "fill-rule"), new AttributeName(true, "clip-rule", "clipRule", "clip-rule"), new AttributeName(true, "clip-path", "clipPath", "clip-path"), new AttributeName(true, "font-size", "fontSize", "font-size"), new AttributeName(true, "font-family", "fontFamily", "font-family"), new AttributeName(true, "font-weight", "fontWeight", "font-weight"), new AttributeName(true, "text-anchor", "textAnchor", "text-anchor"), new AttributeName(true, "text-decoration", "textDecoration", "text-decoration"), new AttributeName(true, "stop-color", "stopColor", "stop-color"), new AttributeName(true, "stop-opacity", "stopOpacity", "stop-opacity"), new AttributeName(true, "shape-rendering", "shapeRendering", "shape-rendering"), new AttributeName(true, "marker-start", "markerStart", "marker-start"), new AttributeName(true, "marker-mid", "markerMid", "marker-mid"), new AttributeName(true, "marker-end", "markerEnd", "marker-end"), new AttributeName(true, "vector-effect", "vectorEffect", "vector-effect"), new AttributeName(true, "xlink:href", "xlinkHref", "xlink:href"), new AttributeName(true, "xml:lang", "xmlLang", "xml:lang"), new AttributeName(true, "xml:space", "xmlSpace", "xml:space")])

export function __goscript_set_AttributeNames(__goscriptValue: $.Slice<AttributeName>): void {
	AttributeNames = __goscriptValue
}

export let BooleanAttributes: $.Slice<string> = $.arrayToSlice<string>(["allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls", "default", "defer", "disabled", "formnovalidate", "hidden", "inert", "loop", "multiple", "muted", "nomodule", "novalidate", "open", "playsinline", "readonly", "required", "reversed", "selected", "itemscope"])

export function __goscript_set_BooleanAttributes(__goscriptValue: $.Slice<string>): void {
	BooleanAttributes = __goscriptValue
}

export function outputName(dom: string): string {
	for (let __goscriptRangeTarget0 = AttributeNames, __goscriptRangeWindow0 = $.sliceRange(__goscriptRangeTarget0), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow0.length; __rangeIndex++) {
		let a = (__goscriptRangeWindow0.backing[__goscriptRangeWindow0.offset + __rangeIndex] as AttributeName)
		if ($.stringEqual(a.DOM, dom)) {
			return a.Output
		}
	}
	return dom
}

export function isBoolean(dom: string): boolean {
	for (let __goscriptRangeTarget1 = BooleanAttributes, __goscriptRangeWindow1 = $.sliceRange(__goscriptRangeTarget1), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow1.length; __rangeIndex++) {
		let b = (__goscriptRangeWindow1.backing[__goscriptRangeWindow1.offset + __rangeIndex] as string)
		if ($.stringEqual(b, dom)) {
			return true
		}
	}
	return false
}

export function StyleKey(property: string): string {
	if ((($.stringLen(property) >= 2) && ($.indexString(property, 0) == 45)) && ($.indexString(property, 1) == 45)) {
		return property
	}
	if (($.stringLen(property) >= 4) && ($.sliceStringEqual(property, undefined, 4, "-ms-"))) {
		return "ms" + camelCase("-" + $.sliceStringOrBytes(property, 4, undefined))
	}
	return camelCase(property)
}

export function camelCase(s: string): string {
	let out = ""
	for (let i = 0; i < $.stringLen(s); i++) {
		if (((($.indexString(s, i) == 45) && ((i + 1) < $.stringLen(s))) && ($.indexString(s, i + 1) >= 97)) && ($.indexString(s, i + 1) <= 122)) {
			out += $.runeToString(($.uint(((((($.indexString(s, i + 1) - 97) & 0xff)) + 65) & 0xff), 8)))
			i++
			continue
		}
		out += $.sliceStringOrBytes(s, i, i + 1)
	}
	return out
}
