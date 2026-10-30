package main

import (
	"encoding/json"
	"testing"

	"github.com/samuelpmahan/gondola/collection"
	"github.com/samuelpmahan/gondola/multisession"
)

// These native tests pin the Go-to-JavaScript JSON shape used by toJS without
// requiring a browser or a WASM runtime.
func TestSessionTreeBridgeJSONShape(t *testing.T) {
	got, err := json.Marshal([]multisession.SessionInfo{
		{SessionID: 3, ParentID: 0, Depth: 1},
		{SessionID: 4, ParentID: 3, Depth: 2},
	})
	if err != nil {
		t.Fatalf("marshal tree: %v", err)
	}
	want := `[{"SessionID":3,"ParentID":0,"Depth":1},{"SessionID":4,"ParentID":3,"Depth":2}]`
	if string(got) != want {
		t.Fatalf("tree JSON = %s; want %s", got, want)
	}

	got, err = json.Marshal([]multisession.SessionInfo{})
	if err != nil || string(got) != `[]` {
		t.Fatalf("empty tree JSON = %s, %v; want []", got, err)
	}
}

func TestSubtreeDisposalBridgeJSONShape(t *testing.T) {
	got, err := json.Marshal([]multisession.Disposal{{
		SessionID: 4,
		Commands:  []collection.Command{{Kind: "cancel", ID: 1}},
	}})
	if err != nil {
		t.Fatalf("marshal subtree disposal: %v", err)
	}
	want := `[{"SessionID":4,"Commands":[{"Kind":"cancel","ID":1,"Value":""}]}]`
	if string(got) != want {
		t.Fatalf("subtree disposal JSON = %s; want %s", got, want)
	}

	got, err = json.Marshal([]multisession.Disposal{})
	if err != nil || string(got) != `[]` {
		t.Fatalf("empty disposal JSON = %s, %v; want []", got, err)
	}
}
