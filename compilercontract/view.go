package compilercontract

import (
	"encoding/json"
	"fmt"
)

// MarshalJSON is deliberately separate from the Gobi Node model: bindings are
// a typed sidecar and the DOM tree remains an unchanged Node value.
func (view View) MarshalJSON() ([]byte, error) {
	return json.Marshal(ViewRecordFromView(view))
}

// UnmarshalJSON accepts the exact lowerCamel wire shape. Both fields are
// required and bindings must be a non-null array, including when empty.
func (view *View) UnmarshalJSON(data []byte) error {
	if view == nil {
		return fmt.Errorf("cannot unmarshal View into nil receiver")
	}
	var raw struct {
		Tree     NodeRecord `json:"tree"`
		Bindings []Binding  `json:"bindings"`
	}
	if err := decodeClosed(data, &raw); err != nil {
		return err
	}
	if raw.Bindings == nil {
		return fmt.Errorf("view.bindings is required and must be an array")
	}
	*view = View{Tree: raw.Tree.GobiNode(), Bindings: raw.Bindings}
	return nil
}
