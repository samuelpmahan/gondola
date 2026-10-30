package gobi

// AttributeName is one row of the attribute table: the DOM name a Node uses, the prop name the React backend passes, and
// the name react-dom/server wrote for it (observed with the oracle, see rules_test.go). Most rows write the DOM name;
// the rows where Output keeps React's camelCase are a quirk of the oracle that Go's HTML copies on purpose.
type AttributeName struct{ DOM, Prop, Output string }

// AttributeNames lists every DOM attribute name whose React prop differs. Names not listed pass through unchanged.
var AttributeNames = []AttributeName{
	{"class", "className", "class"}, {"for", "htmlFor", "for"}, {"tabindex", "tabIndex", "tabindex"},
	{"readonly", "readOnly", "readOnly"}, {"maxlength", "maxLength", "maxLength"}, {"minlength", "minLength", "minLength"},
	{"colspan", "colSpan", "colSpan"}, {"rowspan", "rowSpan", "rowSpan"}, {"autofocus", "autoFocus", "autofocus"},
	{"autocomplete", "autoComplete", "autoComplete"}, {"autoplay", "autoPlay", "autoPlay"},
	{"contenteditable", "contentEditable", "contentEditable"}, {"crossorigin", "crossOrigin", "crossorigin"},
	{"enctype", "encType", "encType"}, {"formaction", "formAction", "formAction"},
	{"accept-charset", "acceptCharset", "accept-charset"}, {"http-equiv", "httpEquiv", "http-equiv"},
	{"novalidate", "noValidate", "noValidate"}, {"spellcheck", "spellCheck", "spellCheck"}, {"srcset", "srcSet", "srcSet"},
	{"usemap", "useMap", "useMap"}, {"allowfullscreen", "allowFullScreen", "allowFullScreen"},
	{"formnovalidate", "formNoValidate", "formNoValidate"}, {"playsinline", "playsInline", "playsInline"},
	{"nomodule", "noModule", "noModule"}, {"itemscope", "itemScope", "itemScope"},
	{"stroke-width", "strokeWidth", "stroke-width"}, {"stroke-linecap", "strokeLinecap", "stroke-linecap"},
	{"stroke-linejoin", "strokeLinejoin", "stroke-linejoin"}, {"stroke-dasharray", "strokeDasharray", "stroke-dasharray"},
	{"stroke-dashoffset", "strokeDashoffset", "stroke-dashoffset"}, {"stroke-opacity", "strokeOpacity", "stroke-opacity"},
	{"stroke-miterlimit", "strokeMiterlimit", "stroke-miterlimit"}, {"fill-opacity", "fillOpacity", "fill-opacity"},
	{"fill-rule", "fillRule", "fill-rule"}, {"clip-rule", "clipRule", "clip-rule"}, {"clip-path", "clipPath", "clip-path"},
	{"font-size", "fontSize", "font-size"}, {"font-family", "fontFamily", "font-family"},
	{"font-weight", "fontWeight", "font-weight"}, {"text-anchor", "textAnchor", "text-anchor"},
	{"text-decoration", "textDecoration", "text-decoration"}, {"stop-color", "stopColor", "stop-color"},
	{"stop-opacity", "stopOpacity", "stop-opacity"}, {"shape-rendering", "shapeRendering", "shape-rendering"},
	{"marker-start", "markerStart", "marker-start"}, {"marker-mid", "markerMid", "marker-mid"},
	{"marker-end", "markerEnd", "marker-end"}, {"vector-effect", "vectorEffect", "vector-effect"},
	{"xlink:href", "xlinkHref", "xlink:href"}, {"xml:lang", "xmlLang", "xml:lang"}, {"xml:space", "xmlSpace", "xml:space"},
}

// BooleanAttributes lists the DOM names of attributes that are present or absent: a Flag attribute becomes prop=true.
var BooleanAttributes = []string{"allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls", "default",
	"defer", "disabled", "formnovalidate", "hidden", "inert", "loop", "multiple", "muted", "nomodule", "novalidate", "open",
	"playsinline", "readonly", "required", "reversed", "selected", "itemscope"}

// outputName is the name react-dom/server writes for a DOM attribute name.
func outputName(dom string) string {
	for _, a := range AttributeNames {
		if a.DOM == dom {
			return a.Output
		}
	}
	return dom
}

func isBoolean(dom string) bool {
	for _, b := range BooleanAttributes {
		if b == dom {
			return true
		}
	}
	return false
}

// StyleKey turns a CSS property into the key of React's style object: --custom stays as written, -ms-x becomes msX, a
// leading vendor dash capitalises the next letter and the rest is camelCased (-webkit-line-clamp becomes
// WebkitLineClamp). React hyphenates the key again when it writes the property, so two properties with the same key are
// one declaration.
func StyleKey(property string) string {
	if len(property) >= 2 && property[0] == '-' && property[1] == '-' {
		return property
	}
	if len(property) >= 4 && property[:4] == "-ms-" {
		return "ms" + camelCase("-"+property[4:])
	}
	return camelCase(property)
}

// camelCase upper-cases each ASCII letter that follows a hyphen and drops the hyphen.
func camelCase(s string) string {
	out := ""
	for i := 0; i < len(s); i++ {
		if s[i] == '-' && i+1 < len(s) && s[i+1] >= 'a' && s[i+1] <= 'z' {
			out += string(rune(s[i+1] - 'a' + 'A'))
			i++
			continue
		}
		out += s[i : i+1]
	}
	return out
}
