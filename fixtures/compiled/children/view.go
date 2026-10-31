package children

import (
	"strconv"

	"github.com/samuelpmahan/gondola/gobi"
)

func View(state State) gobi.Node {
	addKeys := []string{"oak", "elm", "ash", "pine"}
	parentStatus := "Parent removed"
	if state.Parent.Alive {
		parentStatus = "Parent generation " + strconv.FormatUint(state.Parent.Generation, 10) + "; " + requestStatus(state.Parent.Pending, state.Parent.Token, state.Parent.Reply)
	}
	parentRequest := button("parent-request", "Request parent", "parent.request", "", !state.Parent.Alive || state.Parent.Pending)
	parentRemove := button("parent-remove", "Remove parent", "parent.remove", "", !state.Parent.Alive)
	parentRemount := button("parent-remount", "Remount parent", "parent.remount", "", state.Parent.Alive)
	parent := gobi.El("section",
		gobi.El("p", gobi.Txt(parentStatus)).Keyed("parent-status"),
		parentRequest,
		parentRemove,
		parentRemount,
	).Keyed("parent")

	rows := make([]gobi.Node, len(state.Children))
	for index, child := range state.Children {
		key := child.Key
		status := "Child " + key + " generation " + strconv.FormatUint(child.Generation, 10) + "; count=" + strconv.FormatFloat(child.Counter.Count, 'f', -1, 64) + "; " + requestStatus(child.Pending, child.Token, child.Reply)
		rowKids := []gobi.Node{
			gobi.El("p", gobi.Txt(status)).Keyed("child-" + key + "-status"),
			button("child-"+key+"-count", "Add to "+key, "counter.add", key, !state.Parent.Alive),
			button("child-"+key+"-request", "Request "+key, "child.request", key, !state.Parent.Alive || child.Pending),
			button("child-"+key+"-remove", "Remove "+key, "child.remove", key, !state.Parent.Alive),
		}
		if index > 0 {
			rowKids = append(rowKids, button("child-"+key+"-move-up", "Move "+key+" up", "children.swap", state.Children[index-1].Key+":"+key, false))
		}
		rows[index] = gobi.El("section", rowKids...).Set("class", "child").Keyed("child-" + key)
	}
	childList := gobi.El("div", rows...).Set("class", "children").Keyed("children")

	controls := make([]gobi.Node, 0, 5)
	for _, key := range addKeys {
		controls = append(controls, button("child-add-"+key, "Add "+key, "child.add", key, !state.Parent.Alive || childIndex(state.Children, key) >= 0))
	}
	controls = append(controls, button("children-clear", "Clear children", "children.clear", "", !state.Parent.Alive || len(state.Children) == 0))
	collectionControls := gobi.El("aside", controls...).Keyed("children-controls")

	return gobi.El("main", parent, childList, collectionControls).Set("class", "compiled-children").Keyed("compiled-children")
}

func requestStatus(pending bool, token, reply string) string {
	if pending {
		return "pending " + token
	}
	if reply != "" {
		return "complete " + reply
	}
	return "idle"
}

func button(key, label, message, arg string, disabled bool) gobi.Node {
	result := gobi.El("button", gobi.Txt(label)).Keyed(key).Handle("click", message, arg)
	if disabled {
		result = result.Flag("disabled")
	}
	return result
}
