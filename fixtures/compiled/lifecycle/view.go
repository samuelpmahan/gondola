package lifecycle

import (
	"strconv"

	"github.com/samuelpmahan/gondola/gobi"
)

func InitViewStateLabel(node NodeState, label string) string {
	count := strconv.FormatFloat(node.Counter.Count, 'f', -1, 64)
	status := "idle"
	if node.Pending {
		status = "pending " + node.Token
	}
	if node.Reply != "" {
		status = "complete " + node.Reply
	}
	return label + ": live; count=" + count + "; " + status
}

func nodeView(node NodeState, label, addMessage, requestMessage string, children ...gobi.Node) gobi.Node {
	status := gobi.El("p", gobi.Txt(InitViewStateLabel(node, label))).Keyed(node.ID + "-status")
	add := gobi.El("button", gobi.Txt(label+" +")).Set("class", "lifecycle-add").Keyed(node.ID+"-add").Handle("click", addMessage, "")
	request := gobi.El("button", gobi.Txt("Request "+lowerLabel(label))).Set("class", "lifecycle-request").Keyed(node.ID+"-request").Handle("click", requestMessage, "")
	if node.Requested {
		request = request.Flag("disabled")
	}
	kids := []gobi.Node{status, add, request}
	for _, child := range children {
		kids = append(kids, child)
	}
	return gobi.El("section", kids...).Set("class", "lifecycle-node lifecycle-"+node.ID).Keyed(node.ID)
}

func lowerLabel(label string) string {
	switch label {
	case "Parent":
		return "parent"
	case "Child":
		return "child"
	case "Grandchild":
		return "grandchild"
	case "Sibling":
		return "sibling"
	}
	return "node"
}

func View(state State) gobi.Node {
	parent := gobi.Node{}
	if state.Parent.Alive {
		grandchild := gobi.El("p", gobi.Txt("Grandchild: removed")).Set("class", "lifecycle-removed").Keyed("grandchild-removed")
		if state.Grandchild.Alive {
			grandchild = nodeView(state.Grandchild, "Grandchild", "addGrandchild", "requestGrandchild")
		}
		child := gobi.El("p", gobi.Txt("Child: removed")).Set("class", "lifecycle-removed").Keyed("child-removed")
		if state.Child.Alive {
			child = nodeView(state.Child, "Child", "addChild", "requestChild", grandchild)
		}
		parent = nodeView(state.Parent, "Parent", "addParent", "requestParent", child)
	} else {
		parent = gobi.El("p", gobi.Txt("Parent: removed")).Set("class", "lifecycle-removed").Keyed("parent-removed")
	}
	sibling := nodeView(state.Sibling, "Sibling", "addSibling", "requestSibling")
	remove := gobi.El("button", gobi.Txt("Remove parent")).Set("class", "lifecycle-remove").Keyed("parent-remove").Handle("click", "removeParent", "")
	if !state.Parent.Alive {
		remove = remove.Flag("disabled")
	}
	remount := gobi.El("button", gobi.Txt("Remount parent")).Set("class", "lifecycle-remount").Keyed("parent-remount").Handle("click", "remountParent", "")
	if state.Parent.Alive {
		remount = remount.Flag("disabled")
	}
	controls := gobi.El("aside", remove, remount).Set("class", "lifecycle-controls").Keyed("lifecycle-controls")
	return gobi.El("main", parent, sibling, controls).Set("class", "lifecycle").Keyed("lifecycle")
}
