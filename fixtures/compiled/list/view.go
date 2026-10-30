package list

import (
	"strconv"

	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/gobi"
)

func View(state State) compilercontract.View {
	bindings := make([]compilercontract.Binding, 0, len(state.Rows)*2)
	rows := make([]gobi.Node, len(state.Rows))
	for index, row := range state.Rows {
		id := strconv.FormatUint(row.ID, 10)
		input := gobi.El("input").Keyed("row-"+id+"-label").
			Set("type", "text").Set("value", row.Label).Set("aria-label", "Row "+id)
		checked := gobi.El("input").Keyed("row-"+id+"-checked").
			Set("type", "checkbox").Set("aria-label", "Done "+id)
		if row.Checked {
			checked = checked.Flag("checked")
		}
		moveUp := button("row-"+id+"-up", "Up", "move-up/"+id, index == 0)
		remove := button("row-"+id+"-remove", "Remove", "remove/"+id, false)
		rows[index] = gobi.El("div", input, checked, moveUp, remove).
			Keyed("row-"+id).Set("class", "row")
		bindings = append(bindings,
			compilercontract.Binding{Path: "2/" + strconv.Itoa(index) + "/0", Event: "input", Message: "edit/" + id, Source: compilercontract.TargetValue},
			compilercontract.Binding{Path: "2/" + strconv.Itoa(index) + "/1", Event: "change", Message: "check/" + id, Source: compilercontract.TargetChecked},
		)
	}
	add := button("list-add", "Add", "add", false)
	reset := button("list-reset", "Reset", "reset", len(state.Rows) == 0)
	rowList := gobi.El("div", rows...).Keyed("rows").Set("class", "rows")
	tree := gobi.El("div", add, reset, rowList).Keyed("list").Set("class", "compiled-list")
	return compilercontract.NewView(tree, bindings...)
}

func button(key, label, message string, disabled bool) gobi.Node {
	result := gobi.El("button", gobi.Txt(label)).Keyed(key).Handle("click", message, "")
	if disabled {
		result = result.Flag("disabled")
	}
	return result
}
