package main

import (
	"fmt"
	"os"
	"sort"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/wire"
)

// huntHTML shrinks every failing case of `check html` to a small Node that still differs, and prints the distinct small
// ones. It is the rule hunter's tool: each printed line is a candidate row for gobi/rules_test.go.
func huntHTML(args []string) int {
	casesJSON, err := os.ReadFile("build/cases.json")
	if err != nil {
		return infrastructure(err)
	}
	inputs, err := wire.DecodeCases(casesJSON)
	if err != nil {
		return infrastructure(err)
	}
	current := map[string]gobi.Node{}
	var names []string
	failing, err := differing(inputs)
	if err != nil {
		return infrastructure(err)
	}
	for _, c := range failing {
		current[c.Name] = c.Node
		names = append(names, c.Name)
	}
	allNames := append([]string(nil), names...)
	for round := 0; round < 40; round++ {
		var candidates []wire.Case
		owner := map[string]string{}
		for _, name := range names {
			for i, smaller := range reductions(current[name]) {
				candidateName := fmt.Sprintf("%s#%d", name, i)
				candidates = append(candidates, wire.Case{Name: candidateName, Node: smaller})
				owner[candidateName] = name
			}
		}
		bad, err := differing(candidates)
		if err != nil {
			return infrastructure(err)
		}
		progressed := map[string]bool{}
		for _, c := range bad {
			name := owner[c.Name]
			if !progressed[name] {
				progressed[name] = true
				current[name] = c.Node
			}
		}
		if len(progressed) == 0 {
			break
		}
		names = names[:0]
		for name := range progressed {
			names = append(names, name)
		}
		sort.Strings(names)
	}
	names = allNames
	seen := map[string]gobi.Node{}
	for _, name := range names {
		seen[wire.Canonical(current[name])] = current[name]
	}
	groups := map[string][]string{}
	example := map[string]gobi.Node{}
	for _, n := range seen {
		generic := n
		generic.Tag = ""
		key := wire.Canonical(generic)
		groups[key] = append(groups[key], n.Tag)
		if old, ok := example[key]; !ok || n.Tag < old.Tag {
			example[key] = n
		}
	}
	var minimal []wire.Case
	for _, n := range example {
		minimal = append(minimal, wire.Case{Node: n})
	}
	sort.Slice(minimal, func(i, j int) bool {
		a, b := wire.Canonical(minimal[i].Node), wire.Canonical(minimal[j].Node)
		if len(a) != len(b) {
			return len(a) < len(b)
		}
		return a < b
	})
	fmt.Printf("%d failing cases shrink to %d distinct small ones\n", len(names), len(minimal))
	reportResults, err := render(minimal)
	if err != nil {
		return infrastructure(err)
	}
	for i, c := range minimal {
		if i == 40 {
			fmt.Printf("... %d more\n", len(minimal)-i)
			break
		}
		generic := c.Node
		generic.Tag = ""
		tags := groups[wire.Canonical(generic)]
		sort.Strings(tags)
		fmt.Printf("[%d tags: %v]\n", len(tags), tags)
		fmt.Println(wire.Canonical(c.Node))
		fmt.Println("   want", wire.Quote(reportResults[i].HTML), "got", wire.Quote(gobi.HTML(c.Node)))
	}
	return 0
}

// render asks React for the HTML of every case.
func render(cases []wire.Case) ([]wire.Result, error) {
	for i := range cases {
		cases[i].Name = fmt.Sprintf("hunt-%05d", i)
	}
	if err := os.WriteFile("build/hunt-cases.json", wire.EncodeCases(cases), 0o644); err != nil {
		return nil, err
	}
	if _, err := runNode("react-side.mjs", "build/hunt-cases.json", "build/hunt-react.json"); err != nil {
		return nil, err
	}
	data, err := os.ReadFile("build/hunt-react.json")
	if err != nil {
		return nil, err
	}
	return wire.DecodeResults(data)
}

// differing returns the cases where React's HTML and Go's HTML are not the same bytes.
func differing(cases []wire.Case) ([]wire.Case, error) {
	if len(cases) == 0 {
		return nil, nil
	}
	results, err := render(append([]wire.Case(nil), cases...))
	if err != nil {
		return nil, err
	}
	var bad []wire.Case
	for i, c := range cases {
		if results[i].Error != "" || results[i].HTML != gobi.HTML(c.Node) {
			bad = append(bad, c)
		}
	}
	return bad, nil
}

// reductions lists every Node one small step smaller than n: a kid on its own, one fewer kid, attribute, handler or
// style declaration, a shorter key or text, or the same shape with a reduced kid.
func reductions(n gobi.Node) []gobi.Node {
	var out []gobi.Node
	for _, k := range n.Kids {
		out = append(out, k)
	}
	for i := range n.Kids {
		smaller := n
		smaller.Kids = append(append([]gobi.Node(nil), n.Kids[:i]...), n.Kids[i+1:]...)
		out = append(out, smaller)
		for _, r := range reductions(n.Kids[i]) {
			deeper := n
			deeper.Kids = append([]gobi.Node(nil), n.Kids...)
			deeper.Kids[i] = r
			out = append(out, deeper)
		}
	}
	for i := range n.Attrs {
		smaller := n
		smaller.Attrs = append(append([]gobi.Attr(nil), n.Attrs[:i]...), n.Attrs[i+1:]...)
		out = append(out, smaller)
		for j := range n.Attrs[i].Style {
			if len(n.Attrs[i].Style) > 1 {
				fewer := n
				fewer.Attrs = append([]gobi.Attr(nil), n.Attrs...)
				fewer.Attrs[i].Style = append(append([]gobi.Style(nil), n.Attrs[i].Style[:j]...), n.Attrs[i].Style[j+1:]...)
				out = append(out, fewer)
			}
		}
		if n.Attrs[i].Value != "" {
			empty := n
			empty.Attrs = append([]gobi.Attr(nil), n.Attrs...)
			empty.Attrs[i].Value = ""
			out = append(out, empty)
		}
	}
	for i := range n.On {
		smaller := n
		smaller.On = append(append([]gobi.On(nil), n.On[:i]...), n.On[i+1:]...)
		out = append(out, smaller)
	}
	if n.Key != "" {
		unkeyed := n
		unkeyed.Key = ""
		out = append(out, unkeyed)
	}
	if units := wire.ToUnits(n.Text); n.Kind == gobi.Text && len(units) > 1 {
		for _, half := range []string{wire.FromUnits(units[:len(units)/2]), wire.FromUnits(units[len(units)/2:])} {
			shorter := n
			shorter.Text = half
			out = append(out, shorter)
		}
	}
	return out
}
