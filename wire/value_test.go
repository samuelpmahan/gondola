package wire

import "testing"

func TestDecodeValueKeepsText(t *testing.T) {
	got, err := DecodeValue([]byte(`{"a":[1.5,true,null,"x\ud800y"],"b":{"c":-0.25e1}}`))
	if err != nil {
		t.Fatal(err)
	}
	m := got.(map[string]any)
	list := m["a"].([]any)
	if list[0] != 1.5 || list[1] != true || list[2] != nil || list[3] != "x\xed\xa0\x80y" {
		t.Errorf("list %q", list)
	}
	if m["b"].(map[string]any)["c"] != -2.5 {
		t.Errorf("number %v", m["b"])
	}
}
