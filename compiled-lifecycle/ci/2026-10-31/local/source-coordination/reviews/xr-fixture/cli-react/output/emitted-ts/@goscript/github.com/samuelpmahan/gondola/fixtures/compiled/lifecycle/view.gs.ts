// Generated file based on view.go
// Updated when compliance tests are re-run, DO NOT EDIT!

import * as $ from "@goscript/builtin/index.js"
import * as strconv from "@goscript/strconv/index.js"
import * as gobi from "@goscript/github.com/samuelpmahan/gondola/gobi/index.js"
import * as counter from "@goscript/github.com/samuelpmahan/gondola/counter/index.js"
import * as __goscript_app from "./app.gs.ts"
import "@goscript/github.com/samuelpmahan/gondola/counter/index.js"
import "./app.gs.ts"

export function InitViewStateLabel(node: __goscript_app.NodeState, label: string): string {
	let count = strconv.FormatFloat(node.Counter.Count, 102, -1, 64)
	let status = "idle"
	if (node.Pending) {
		status = "pending " + node.Token
	}
	if (!$.stringEqual(node.Reply, "")) {
		status = "complete " + node.Reply
	}
	return label + ": live; count=" + count + "; " + status
}

export function nodeView(node: __goscript_app.NodeState, label: string, addMessage: string, requestMessage: string, children: $.Slice<gobi.Node>): gobi.Node {
	let status = $.markAsStructValue($.cloneStructValue(gobi.El("p", $.arrayToSlice<gobi.Node>([gobi.Txt(InitViewStateLabel(node, label))])))).Keyed(node.ID + "-status")
	let add = $.markAsStructValue($.cloneStructValue($.markAsStructValue($.cloneStructValue($.markAsStructValue($.cloneStructValue(gobi.El("button", $.arrayToSlice<gobi.Node>([gobi.Txt(label + " +")])))).Set("class", "lifecycle-add"))).Keyed(node.ID + "-add"))).Handle("click", addMessage, "")
	let request = $.markAsStructValue($.cloneStructValue($.markAsStructValue($.cloneStructValue($.markAsStructValue($.cloneStructValue(gobi.El("button", $.arrayToSlice<gobi.Node>([gobi.Txt("Request " + lowerLabel(label))])))).Set("class", "lifecycle-request"))).Keyed(node.ID + "-request"))).Handle("click", requestMessage, "")
	if (node.Requested) {
		request = request.__goscriptAssign($.markAsStructValue($.cloneStructValue(request)).Flag("disabled"))
	}
	let kids: $.Slice<gobi.Node> = $.arrayToSlice<gobi.Node>([status, add, request])
	for (let __goscriptRangeTarget0 = children, __goscriptRangeWindow0 = $.sliceRange(__goscriptRangeTarget0), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow0.length; __rangeIndex++) {
		let child = ((__goscriptRangeWindow0.backing[__goscriptRangeWindow0.offset + __rangeIndex] as gobi.Node)).clone()
		kids = $.appendOne(kids, (child).clone())
	}
	return $.markAsStructValue($.cloneStructValue($.markAsStructValue($.cloneStructValue(gobi.El("section", kids))).Set("class", "lifecycle-node lifecycle-" + node.ID))).Keyed(node.ID)
}

export function lowerLabel(label: string): string {
	switch (label) {
		case "Parent":
		{
			return "parent"
			break
		}
		case "Child":
		{
			return "child"
			break
		}
		case "Grandchild":
		{
			return "grandchild"
			break
		}
		case "Sibling":
		{
			return "sibling"
			break
		}
	}
	return "node"
}

export function View(state: __goscript_app.State): gobi.Node {
	let parent = new gobi.Node(true)
	if (state.Parent.Alive) {
		let grandchild = $.markAsStructValue($.cloneStructValue($.markAsStructValue($.cloneStructValue(gobi.El("p", $.arrayToSlice<gobi.Node>([gobi.Txt("Grandchild: removed")])))).Set("class", "lifecycle-removed"))).Keyed("grandchild-removed")
		if (state.Grandchild.Alive) {
			grandchild = grandchild.__goscriptAssign(nodeView((state.Grandchild).clone(), "Grandchild", "addGrandchild", "requestGrandchild", null))
		}
		let child = $.markAsStructValue($.cloneStructValue($.markAsStructValue($.cloneStructValue(gobi.El("p", $.arrayToSlice<gobi.Node>([gobi.Txt("Child: removed")])))).Set("class", "lifecycle-removed"))).Keyed("child-removed")
		if (state.Child.Alive) {
			child = child.__goscriptAssign(nodeView((state.Child).clone(), "Child", "addChild", "requestChild", $.arrayToSlice<gobi.Node>([grandchild])))
		}
		parent = parent.__goscriptAssign(nodeView((state.Parent).clone(), "Parent", "addParent", "requestParent", $.arrayToSlice<gobi.Node>([child])))
	} else {
		parent = parent.__goscriptAssign($.markAsStructValue($.cloneStructValue($.markAsStructValue($.cloneStructValue(gobi.El("p", $.arrayToSlice<gobi.Node>([gobi.Txt("Parent: removed")])))).Set("class", "lifecycle-removed"))).Keyed("parent-removed"))
	}
	let sibling = nodeView((state.Sibling).clone(), "Sibling", "addSibling", "requestSibling", null)
	let remove = $.markAsStructValue($.cloneStructValue($.markAsStructValue($.cloneStructValue($.markAsStructValue($.cloneStructValue(gobi.El("button", $.arrayToSlice<gobi.Node>([gobi.Txt("Remove parent")])))).Set("class", "lifecycle-remove"))).Keyed("parent-remove"))).Handle("click", "removeParent", "")
	if (!state.Parent.Alive) {
		remove = remove.__goscriptAssign($.markAsStructValue($.cloneStructValue(remove)).Flag("disabled"))
	}
	let remount = $.markAsStructValue($.cloneStructValue($.markAsStructValue($.cloneStructValue($.markAsStructValue($.cloneStructValue(gobi.El("button", $.arrayToSlice<gobi.Node>([gobi.Txt("Remount parent")])))).Set("class", "lifecycle-remount"))).Keyed("parent-remount"))).Handle("click", "remountParent", "")
	if (state.Parent.Alive) {
		remount = remount.__goscriptAssign($.markAsStructValue($.cloneStructValue(remount)).Flag("disabled"))
	}
	let controls = $.markAsStructValue($.cloneStructValue($.markAsStructValue($.cloneStructValue(gobi.El("aside", $.arrayToSlice<gobi.Node>([remove, remount])))).Set("class", "lifecycle-controls"))).Keyed("lifecycle-controls")
	return $.markAsStructValue($.cloneStructValue($.markAsStructValue($.cloneStructValue(gobi.El("main", $.arrayToSlice<gobi.Node>([parent, sibling, controls])))).Set("class", "lifecycle"))).Keyed("lifecycle")
}
