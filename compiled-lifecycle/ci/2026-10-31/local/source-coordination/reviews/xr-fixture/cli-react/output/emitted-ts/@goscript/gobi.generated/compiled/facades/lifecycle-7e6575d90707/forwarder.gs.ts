// Generated file based on forwarder.go
// Updated when compliance tests are re-run, DO NOT EDIT!

import * as $ from "@goscript/builtin/index.js"
import * as gobiApp from "@goscript/github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle/index.js"
import * as gobiType0 from "@goscript/github.com/samuelpmahan/gondola/gobi/index.js"
import "@goscript/github.com/samuelpmahan/gondola/gobi/index.js"

export function GobiCompiledInit(): gobiApp.State {
	return gobiApp.Init()
}

export function GobiCompiledUpdate(state: gobiApp.State, message: gobiType0.Message): [gobiApp.State, $.Slice<gobiType0.Effect>] {
	return gobiApp.Update((state).clone(), message)
}

export function GobiCompiledView(state: gobiApp.State): gobiType0.Node {
	return gobiApp.View(state)
}
