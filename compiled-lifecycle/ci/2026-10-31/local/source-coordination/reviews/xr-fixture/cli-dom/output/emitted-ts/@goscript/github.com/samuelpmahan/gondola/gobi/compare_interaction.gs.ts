// Generated file based on compare_interaction.go
// Updated when compliance tests are re-run, DO NOT EDIT!

import * as $ from "@goscript/builtin/index.js"
import * as fmt from "@goscript/fmt/index.js"
import * as __goscript_build from "./build.gs.ts"

export function CompareInteraction(golden: __goscript_build.Trace, candidate: __goscript_build.Trace, level: __goscript_build.Level): __goscript_build.Diff {
	if ((level < 1) || (level > 3)) {
		return (() => { const __goscriptLiteralField0 = (fmt.Sprint($.namedValueInterfaceValue<any>(level, "gobi.Level", {}, /* @__PURE__ */ $.basicType("uint8", "gobi.Level"))) as string); return new __goscript_build.Diff(true, -1, "Level", "SameTree, SameDOM, or SamePixels", __goscriptLiteralField0, true) })()
	}
	if ($.sliceLen(golden.Ticks) != $.sliceLen(candidate.Ticks)) {
		return (() => { const __goscriptLiteralField1 = (fmt.Sprint($.basicInterfaceValue($.sliceLen(golden.Ticks), "int")) as string); const __goscriptLiteralField2 = (fmt.Sprint($.basicInterfaceValue($.sliceLen(candidate.Ticks), "int")) as string); return new __goscript_build.Diff(true, -1, "Ticks", __goscriptLiteralField1, __goscriptLiteralField2, true) })()
	}
	if ($.sliceLen(golden.Ticks) == 0) {
		return new __goscript_build.Diff(true, -1, "Ticks", "at least 1 (initial tick)", "0", true)
	}

	for (let __goscriptRangeTarget0 = golden.Ticks, __goscriptRangeWindow0 = $.sliceRange(__goscriptRangeTarget0), i = 0; i < __goscriptRangeWindow0.length; i++) {
		let g = ((__goscriptRangeWindow0.backing[__goscriptRangeWindow0.offset + i] as __goscript_build.Tick)).clone()
		let c = ($.plainSliceIndex(candidate.Ticks!, i)).clone()

		// An interaction trace is the initial render followed by one tick per action.
		// Check this shape as well as pairwise equality so identical malformed traces
		// cannot accidentally pass.
		if (g.Index != i) {
			return (() => { const __goscriptLiteralField3 = (fmt.Sprint($.basicInterfaceValue(i, "int")) as string); const __goscriptLiteralField4 = (fmt.Sprint($.basicInterfaceValue(g.Index, "int")) as string); return new __goscript_build.Diff(true, i, "Index", __goscriptLiteralField3, __goscriptLiteralField4, true) })()
		}
		if (c.Index != i) {
			return (() => { const __goscriptLiteralField5 = (fmt.Sprint($.basicInterfaceValue(i, "int")) as string); const __goscriptLiteralField6 = (fmt.Sprint($.basicInterfaceValue(c.Index, "int")) as string); return new __goscript_build.Diff(true, i, "Index", __goscriptLiteralField5, __goscriptLiteralField6, true) })()
		}
		if (i == 0) {
			if (!emptyStep(g.Step)) {
				return (() => { const __goscriptLiteralField7 = formatStep((g.Step).clone()); return new __goscript_build.Diff(true, i, "Step", "<initial>", __goscriptLiteralField7, true) })()
			}
			if (!emptyStep(c.Step)) {
				return (() => { const __goscriptLiteralField8 = formatStep(c.Step); return new __goscript_build.Diff(true, i, "Step", "<initial>", __goscriptLiteralField8, true) })()
			}
		} else {
			if (!(g.Step.Path === c.Step.Path && g.Step.Event === c.Step.Event && g.Step.Value === c.Step.Value)) {
				return (() => { const __goscriptLiteralField9 = formatStep((g.Step).clone()); const __goscriptLiteralField10 = formatStep(c.Step); return new __goscript_build.Diff(true, i, "Step", __goscriptLiteralField9, __goscriptLiteralField10, true) })()
			}
		}
		if (!$.stringEqual(g.State, c.State)) {
			return new __goscript_build.Diff(true, i, "State", g.State, c.State, true)
		}
		if (!$.stringEqual(g.Tree, c.Tree)) {
			return new __goscript_build.Diff(true, i, "Tree", g.Tree, c.Tree, true)
		}
		if ((level >= 2) && (!$.stringEqual(g.DOM, c.DOM))) {
			return new __goscript_build.Diff(true, i, "DOM", g.DOM, c.DOM, true)
		}
		if (level >= 3) {
			if (($.stringEqual(g.Pixels, "")) || ($.stringEqual(c.Pixels, ""))) {
				return (() => { const __goscriptLiteralField11 = pixelValue(g.Pixels); const __goscriptLiteralField12 = pixelValue(c.Pixels); return new __goscript_build.Diff(true, i, "Pixels", __goscriptLiteralField11, __goscriptLiteralField12, true) })()
			}
			if (!$.stringEqual(g.Pixels, c.Pixels)) {
				return new __goscript_build.Diff(true, i, "Pixels", g.Pixels, c.Pixels, true)
			}
		}
	}
	return new __goscript_build.Diff(true)
}

export function emptyStep(step: __goscript_build.Step): boolean {
	return (($.stringEqual(step.Path, "")) && ($.stringEqual(step.Event, ""))) && ($.stringEqual(step.Value, ""))
}

export function formatStep(step: __goscript_build.Step): string {
	return (fmt.Sprintf("Path=%q Event=%q Value=%q", step.Path, step.Event, step.Value) as string)
}

export function pixelValue(pixels: string): string {
	if ($.stringEqual(pixels, "")) {
		return "<missing>"
	}
	return pixels
}
