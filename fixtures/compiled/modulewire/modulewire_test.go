package modulewire

import "testing"

func TestWireRecordsKeepOnlyTheFrozenTypedFields(t *testing.T) {
	input := Input{Step: 2, Locked: true, Revision: 7}
	publication := Publication{Count: 3, Revision: 7}
	if input.Step != 2 || !input.Locked || input.Revision != 7 {
		t.Fatalf("input = %#v", input)
	}
	if publication.Count != 3 || publication.Revision != 7 {
		t.Fatalf("publication = %#v", publication)
	}
}
