package publications

import (
	"strconv"

	"github.com/samuelpmahan/gondola/gobi"
)

func View(state State) gobi.Node {
	parentStatus := "Parent removed"
	if state.Parent.Alive {
		parentStatus = "Parent generation " + strconv.FormatUint(state.Parent.Generation, 10) +
			"; input step=" + strconv.Itoa(state.Input.Step) +
			" locked=" + boolText(state.Input.Locked) +
			" revision=" + strconv.FormatUint(state.Input.Revision, 10) +
			"; " + requestStatus(state.Parent.Pending, state.Parent.Token, state.Parent.Reply)
	}
	publicationStatus := "No accepted publication"
	if state.Parent.PublishedKey != "" {
		publicationStatus = "Published " + state.Parent.PublishedKey + " value=" + strconv.FormatFloat(state.Parent.PublishedValue, 'f', -1, 64)
	}
	parent := gobi.El("section",
		gobi.El("p", gobi.Txt(parentStatus)).Keyed("parent-status"),
		button("input-step-1", "Set input step 1", "input.step", "1", !state.Parent.Alive || state.Input.Step == 1),
		button("input-step-2", "Set input step 2", "input.step", "2", !state.Parent.Alive || state.Input.Step == 2),
		button("input-step-3", "Set input step 3", "input.step", "3", !state.Parent.Alive || state.Input.Step == 3),
		button("input-toggle-lock", inputLockLabel(state.Input.Locked), "input.toggleLock", "", !state.Parent.Alive),
		button("parent-request", "Request parent", "parent.request", "", !state.Parent.Alive || state.Parent.Pending),
		button("parent-remove", "Remove parent", "parent.remove", "", !state.Parent.Alive),
		button("parent-remount", "Remount parent", "parent.remount", "", state.Parent.Alive),
		gobi.El("p", gobi.Txt(publicationStatus)).Keyed("parent-publication-status"),
		gobi.El("p", gobi.Txt("Accepted="+strconv.FormatUint(state.Parent.Accepted, 10)+" Rejected="+strconv.FormatUint(state.Parent.Rejected, 10))).Keyed("parent-publication-counts"),
		gobi.El("p", gobi.Txt("Last decision: "+state.LastDecision)).Keyed("last-decision"),
	).Keyed("parent")

	rows := make([]gobi.Node, len(state.Children))
	for index, child := range state.Children {
		key := child.Key
		status := "Child " + key + " generation " + strconv.FormatUint(child.Generation, 10) +
			"; count=" + strconv.FormatFloat(child.Counter.Count, 'f', -1, 64) +
			"; last publication=" + strconv.FormatUint(child.LastAcceptedPublication, 10) +
			"; " + requestStatus(child.Pending, child.Token, child.Reply)
		rowKids := []gobi.Node{
			gobi.El("p", gobi.Txt(status)).Keyed("child-" + key + "-status"),
			button("child-"+key+"-count", "Add to "+key, "counter.add", key, !state.Parent.Alive || state.Input.Locked),
			button("child-"+key+"-request", "Request "+key, "child.request", key, !state.Parent.Alive || child.Pending),
			button("child-"+key+"-capture", "Capture "+key, "child.capture", key, !state.Parent.Alive || state.Input.Locked),
			button("child-"+key+"-remove", "Remove "+key, "child.remove", key, !state.Parent.Alive),
		}
		if index > 0 {
			rowKids = append(rowKids, button("child-"+key+"-move-up", "Move "+key+" up", "children.swap", state.Children[index-1].Key+":"+key, false))
		}
		rows[index] = gobi.El("section", rowKids...).Set("class", "child").Keyed("child-" + key)
	}
	childList := gobi.El("div", rows...).Set("class", "children").Keyed("children")

	addKeys := []string{"oak", "elm", "ash", "pine"}
	controls := make([]gobi.Node, 0, 5)
	for _, key := range addKeys {
		controls = append(controls, button("child-add-"+key, "Add "+key, "child.add", key, !state.Parent.Alive || childIndex(state.Children, key) >= 0))
	}
	controls = append(controls, button("children-clear", "Clear children", "children.clear", "", !state.Parent.Alive || len(state.Children) == 0))
	collectionControls := gobi.El("aside", controls...).Keyed("children-controls")

	queued := make([]gobi.Node, len(state.Publications))
	for index, publication := range state.Publications {
		id := strconv.FormatUint(publication.ID, 10)
		label := "Deliver #" + id + " " + publication.Key + " value=" + strconv.FormatFloat(publication.Value, 'f', -1, 64)
		queued[index] = gobi.El("section",
			button("publication-deliver-"+id, label, "publication.deliver", id, false),
			gobi.El("p", gobi.Txt("parent="+strconv.FormatUint(publication.ParentGeneration, 10)+
				" child="+strconv.FormatUint(publication.ChildGeneration, 10)+
				" input="+strconv.FormatUint(publication.InputRevision, 10))).Keyed("publication-"+id+"-metadata"),
		).Keyed("publication-" + id)
	}
	publicationQueue := gobi.El("section", queued...).Set("class", "publications").Keyed("publications")

	return gobi.El("main", parent, childList, collectionControls, publicationQueue).Set("class", "compiled-publications").Keyed("compiled-publications")
}

func inputLockLabel(locked bool) string {
	if locked {
		return "Unlock input"
	}
	return "Lock input"
}

func boolText(value bool) string {
	if value {
		return "true"
	}
	return "false"
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
