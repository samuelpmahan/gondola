package main

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"unicode"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inputbinding"
	"github.com/samuelpmahan/gondola/rendercontract"
)

const base = `{"state":{"ready":true},"tree":{"Kind":1,"Tag":"div","Key":"root","Attrs":[],"On":[],"Kids":[{"Kind":1,"Tag":"input","Key":"name","Attrs":[{"Name":"type","Value":"text","Flag":false,"Style":null},{"Name":"value","Value":"initial","Flag":false,"Style":[]}],"On":[],"Kids":null,"Text":""}],"Text":""},"bindings":[{"Path":"0","Event":"input","Message":"change","Source":"target.value"}],"messages":[]}`

type result struct {
	ManifestBlankRunes int      `json:"manifestBlankRunes"`
	BlankRuneMatrix    int      `json:"blankRuneMatrix"`
	AcceptedStateKinds []string `json:"acceptedStateKinds"`
	RejectedCases      int      `json:"rejectedCases"`
	Passed             bool     `json:"passed"`
}

func main() {
	manifest := rendercontract.DefaultManifest()
	issues := make([]string, 0)
	check := func(name string, condition bool) {
		if !condition {
			issues = append(issues, name)
		}
	}

	expectedSpace := make([]rune, 0, 26)
	for r := rune(0); r <= unicode.MaxRune; r++ {
		if unicode.IsSpace(r) || r == '\ufeff' {
			expectedSpace = append(expectedSpace, r)
		}
	}
	check("manifest messageBlankRunes must be every Go IsSpace rune plus FEFF in code-point order",
		string(expectedSpace) == manifest.MessageBlankRunes)

	blankRuneMatrix := 0
	baseSnapshot, err := rendercontract.ParseSnapshot([]byte(base))
	check("valid base snapshot parses", err == nil)
	if err == nil {
		for _, r := range manifest.MessageBlankRunes {
			for _, target := range []string{"handler", "binding"} {
				snapshot := cloneSnapshot(baseSnapshot)
				if target == "handler" {
					snapshot.Tree.On = []gobi.On{{Event: "click", Message: string(r)}}
				} else {
					snapshot.Bindings[0].Message = string(r)
				}
				blankRuneMatrix++
				check(fmt.Sprintf("blank %s U+%04X rejected", target, r), rendercontract.ValidateSnapshot(snapshot) != nil)
			}
		}
		for _, target := range []string{"handler", "binding"} {
			snapshot := cloneSnapshot(baseSnapshot)
			if target == "handler" {
				snapshot.Tree.On = []gobi.On{{Event: "click", Message: "\u200b"}}
			} else {
				snapshot.Bindings[0].Message = "\u200b"
			}
			blankErr := rendercontract.ValidateSnapshot(snapshot)
			check("U+200B remains nonblank in "+target+fmt.Sprintf(" (%v)", blankErr), blankErr == nil)
		}
	}

	rejected := 0
	stateWitness := `{"nested":[null,true,false,0,-2.5e+8,"opaque"],"object":{"extension":{"x":1}}}`
	stateRaw := strings.Replace(base, `{"ready":true}`, stateWitness, 1)
	stateAccepted := make([]string, 0, 5)
	stateWitnesses := []struct{ name, raw string }{
		{"nested object/array/scalars", stateRaw},
		{"empty object", strings.Replace(base, `{"ready":true}`, `{}`, 1)},
	}
	for _, witness := range stateWitnesses {
		snapshot, parseErr := rendercontract.ParseSnapshot([]byte(witness.raw))
		check("opaque state accepted: "+witness.name, parseErr == nil)
		if parseErr == nil {
			stateAccepted = append(stateAccepted, witness.name)
			if witness.name == "nested object/array/scalars" {
				check("opaque state bytes preserved", string(snapshot.State) == stateWitness)
			}
		}
	}
	for _, primitive := range []string{"null", `[]`, `"s"`, `true`, `1`} {
		raw := strings.Replace(base, `{"ready":true}`, primitive, 1)
		_, parseErr := rendercontract.ParseSnapshot([]byte(raw))
		check("non-object state rejected: "+primitive, parseErr != nil)
	}
	if err == nil {
		for _, whitespace := range []string{"\v", "\f", "\u0085", "\u00a0", "\u2000"} {
			codePoint := []rune(whitespace)[0]
			for _, position := range []string{"prefix", "suffix"} {
				snapshot := cloneSnapshot(baseSnapshot)
				stateRaw := `{"opaque":true}`
				if position == "prefix" {
					stateRaw = whitespace + stateRaw
				} else {
					stateRaw += whitespace
				}
				snapshot.State = json.RawMessage(stateRaw)
				check("ValidateSnapshot rejects non-JSON "+position+" state whitespace U+"+
					fmt.Sprintf("%04X", codePoint), rendercontract.ValidateSnapshot(snapshot) != nil)
				rawSnapshot := strings.Replace(base, `{"ready":true}`, stateRaw, 1)
				_, parseErr := rendercontract.ParseSnapshot([]byte(rawSnapshot))
				check("ParseSnapshot rejects non-JSON "+position+" state whitespace U+"+
					fmt.Sprintf("%04X", codePoint), parseErr != nil)
				rejected += 2
			}
		}
		validWhitespace := cloneSnapshot(baseSnapshot)
		validWhitespace.State = json.RawMessage(" \t{\"opaque\":true}\r\n")
		check("ValidateSnapshot accepts RFC JSON whitespace around state", rendercontract.ValidateSnapshot(validWhitespace) == nil)
	}

	badRaw := map[string]string{
		"duplicate envelope member":         strings.Replace(base, `"state":{"ready":true}`, `"state":{"ready":true},"state":{"ready":false}`, 1),
		"escaped duplicate envelope member": strings.Replace(base, `"state":{"ready":true}`, `"state":{"ready":true},"\u0073tate":{"ready":false}`, 1),
		"duplicate nested state member":     strings.Replace(base, `"ready":true`, `"ready":true,"ready":false`, 1),
		"trailing JSON":                     base + `{}`,
		"wrong tree kind primitive":         strings.Replace(base, `"Kind":1`, `"Kind":1.0`, 1),
		"wrong tag primitive":               strings.Replace(base, `"Tag":"div"`, `"Tag":null`, 1),
		"wrong binding primitive":           strings.Replace(base, `"Path":"0"`, `"Path":0`, 1),
		"null message array":                strings.Replace(base, `"messages":[]`, `"messages":null`, 1),
		"null binding array":                strings.Replace(base, `"bindings":[`, `"bindings":null`, 1),
	}
	for name, raw := range badRaw {
		_, parseErr := rendercontract.ParseSnapshot([]byte(raw))
		check("strict parser rejects "+name, parseErr != nil)
		rejected++
	}

	if err == nil {
		for _, path := range []string{"00", "-1", "+0", "0/", "0//1", "1", "0/0"} {
			snapshot := cloneSnapshot(baseSnapshot)
			snapshot.Bindings[0].Path = path
			check("invalid binding path rejected: "+path, rendercontract.ValidateSnapshot(snapshot) != nil)
			rejected++
		}
		for _, key := range []string{"", "1start", "bad_key", strings.Repeat("a", 65), "é"} {
			snapshot := cloneSnapshot(baseSnapshot)
			snapshot.Tree.Key = key
			check("invalid element key rejected: "+key, rendercontract.ValidateSnapshot(snapshot) != nil)
			rejected++
		}
		maxDepth := rendercontract.MaxDepth
		check("depth 64 accepted", rendercontract.ValidateSnapshot(withDepth(maxDepth)) == nil)
		check("depth 65 rejected", rendercontract.ValidateSnapshot(withDepth(maxDepth+1)) != nil)
		check("4096 nodes accepted", rendercontract.ValidateSnapshot(withNodes(rendercontract.MaxNodes)) == nil)
		check("4097 nodes rejected", rendercontract.ValidateSnapshot(withNodes(rendercontract.MaxNodes+1)) != nil)
		rejected += 2
		before := cloneSnapshot(baseSnapshot)
		_ = rendercontract.ValidateSnapshot(baseSnapshot)
		check("validation leaves snapshot unchanged", reflect.DeepEqual(baseSnapshot, before))
	}

	manifestA := rendercontract.DefaultManifest()
	manifestBefore := rendercontract.DefaultManifest()
	manifestA.Capabilities[0] = "mutated"
	manifestA.Methods[0] = "mutated"
	manifestA.Tags[0] = "mutated"
	manifestA.Attributes[0] = "mutated"
	manifestA.Events[0] = "mutated"
	manifestA.NodeKinds[0] = 255
	check("manifest slices do not alias a later return", reflect.DeepEqual(rendercontract.DefaultManifest(), manifestBefore))
	manifestB := rendercontract.DefaultManifest()
	manifestA = rendercontract.DefaultManifest()
	manifestA.Capabilities[0] = "mutated"
	check("manifest calls do not share slices", manifestB.Capabilities[0] != "mutated")

	encoded, _ := json.Marshal(result{
		ManifestBlankRunes: len([]rune(manifest.MessageBlankRunes)),
		BlankRuneMatrix:    blankRuneMatrix,
		AcceptedStateKinds: stateAccepted,
		RejectedCases:      rejected,
		Passed:             len(issues) == 0,
	})
	fmt.Println(string(encoded))
	for _, issue := range issues {
		fmt.Println("FAIL:", issue)
	}
	if len(issues) > 0 {
		panic("XR-E1 probe found contract counterexamples")
	}
}

func cloneSnapshot(source rendercontract.Snapshot) rendercontract.Snapshot {
	clone := source
	if source.State != nil {
		clone.State = append(json.RawMessage{}, source.State...)
	}
	if source.Bindings != nil {
		clone.Bindings = append([]inputbinding.Binding{}, source.Bindings...)
	}
	if source.Messages != nil {
		clone.Messages = append([]gobi.Message{}, source.Messages...)
	}
	clone.Tree = cloneNode(source.Tree)
	return clone
}

func cloneNode(source gobi.Node) gobi.Node {
	clone := source
	if source.Attrs != nil {
		clone.Attrs = append([]gobi.Attr{}, source.Attrs...)
	}
	if source.On != nil {
		clone.On = append([]gobi.On{}, source.On...)
	}
	if source.Kids != nil {
		clone.Kids = make([]gobi.Node, len(source.Kids))
	}
	for index, child := range source.Kids {
		clone.Kids[index] = cloneNode(child)
	}
	return clone
}

func withDepth(depth int) rendercontract.Snapshot {
	node := gobi.Node{Kind: gobi.Element, Tag: "div", Key: fmt.Sprintf("k%d", depth)}
	for index := depth - 1; index >= 0; index-- {
		node = gobi.Node{Kind: gobi.Element, Tag: "div", Key: fmt.Sprintf("k%d", index), Kids: []gobi.Node{node}}
	}
	return rendercontract.Snapshot{State: json.RawMessage(`{}`), Tree: node, Bindings: []inputbinding.Binding{}, Messages: []gobi.Message{}}
}

func withNodes(total int) rendercontract.Snapshot {
	kids := make([]gobi.Node, total-1)
	for index := range kids {
		kids[index] = gobi.Node{Kind: gobi.Text, Text: "x"}
	}
	return rendercontract.Snapshot{
		State:    json.RawMessage(`{}`),
		Tree:     gobi.Node{Kind: gobi.Element, Tag: "div", Key: "root", Kids: kids},
		Bindings: []inputbinding.Binding{}, Messages: []gobi.Message{},
	}
}
