package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"strconv"

	"github.com/samuelpmahan/gondola/compiled-frontend/toolchain/probe_counter/semantics"
	"github.com/samuelpmahan/gondola/counter"
	"github.com/samuelpmahan/gondola/gobi"
)

type attr struct {
	Name  string `json:"name"`
	Value string `json:"value"`
	Flag  bool   `json:"flag"`
}

type result struct {
	Counter         map[string]any    `json:"counter"`
	Snapshot        map[string]any    `json:"snapshot"`
	Formats         map[string]string `json:"format"`
	NodeSetFork     map[string][]attr `json:"nodeSetFork"`
	IntegerOverflow map[string]string `json:"integerOverflow"`
}

func main() {
	state := counter.Init()
	updated, effects := counter.Update(state, gobi.Message{Name: "add"})
	initialView := counter.View(counter.Init())

	snapshot := semantics.SnapshotValue()
	mutated := semantics.Mutate(snapshot)
	cowInput := semantics.SnapshotValue()
	cowOutput := semantics.AppendThenMutate(cowInput)

	base := gobi.El("div").Set("class", "base")
	left := base.Set("id", "left")
	right := base.Set("id", "right")

	overflow := semantics.IncrementIntegerWidths(semantics.IntegerWidthsAtMax())
	out := result{
		Counter: map[string]any{
			"inputCountAfterUpdate": state.Count,
			"nextCount":             updated.Count,
			"effectsIsNil":          effects == nil,
			"initialResetDisabled":  resetDisabled(initialView),
		},
		Snapshot: map[string]any{
			"scalarBitsAfterCall":              fmt.Sprintf("%016x", math.Float64bits(snapshot.Scalar)),
			"mutatedScalar":                    mutated.Scalar,
			"nestedOriginal":                   snapshot.Nested.Count,
			"nestedReturned":                   mutated.Nested.Count,
			"fixedOriginal":                    snapshot.Fixed[0].Count,
			"fixedReturned":                    mutated.Fixed[0].Count,
			"structSliceOriginalAfterMutation": snapshot.Structs[0].Count,
			"structSliceReturnedAfterMutation": mutated.Structs[0].Count,
			"valuesOriginalLengthAfterAppend":  len(snapshot.Values),
			"valuesReturnedLengthAfterAppend":  len(mutated.Values),
			"valuesFirstAfterSharedWrite":      snapshot.Values[0],
			"structBeforeAppendCount":          cowInput.Structs[0].Count,
			"structAfterAppendFirstCount":      cowOutput.Structs[0].Count,
			"structInputLengthAfterAppend":     len(cowInput.Structs),
			"structOutputLengthAfterAppend":    len(cowOutput.Structs),
			"structOutputSecondCount":          cowOutput.Structs[1].Count,
			"nilFloatSlice":                    snapshot.NilValues == nil,
			"emptyFloatSliceIsNil":             snapshot.EmptyValues == nil,
			"emptyFloatSliceLength":            len(snapshot.EmptyValues),
		},
		Formats: map[string]string{
			"negativeZeroFixed":   strconv.FormatFloat(math.Copysign(0, -1), 'f', -1, 64),
			"negativeZeroGeneral": strconv.FormatFloat(math.Copysign(0, -1), 'g', -1, 64),
			"positiveFixed":       strconv.FormatFloat(1.25, 'f', -1, 64),
			"largeFixed":          strconv.FormatFloat(1e21, 'f', -1, 64),
			"uintSafeMax":         strconv.FormatUint(9007199254740991, 10),
			"int64SafeMin":        strconv.FormatInt(-9007199254740991, 10),
			"intNegative":         strconv.Itoa(-2147483648),
		},
		NodeSetFork: map[string][]attr{
			"base":  nodeAttrs(base),
			"left":  nodeAttrs(left),
			"right": nodeAttrs(right),
		},
		IntegerOverflow: map[string]string{
			"Int":    strconv.FormatInt(int64(overflow.Int), 10),
			"Int8":   strconv.FormatInt(int64(overflow.Int8), 10),
			"Int16":  strconv.FormatInt(int64(overflow.Int16), 10),
			"Int32":  strconv.FormatInt(int64(overflow.Int32), 10),
			"Int64":  strconv.FormatInt(overflow.Int64, 10),
			"Uint":   strconv.FormatUint(uint64(overflow.Uint), 10),
			"Uint8":  strconv.FormatUint(uint64(overflow.Uint8), 10),
			"Uint16": strconv.FormatUint(uint64(overflow.Uint16), 10),
			"Uint32": strconv.FormatUint(uint64(overflow.Uint32), 10),
			"Uint64": strconv.FormatUint(overflow.Uint64, 10),
			"Byte":   strconv.FormatUint(uint64(overflow.Byte), 10),
			"Rune":   strconv.FormatInt(int64(overflow.Rune), 10),
		},
	}
	if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func resetDisabled(node gobi.Node) bool {
	for _, child := range node.Kids {
		for _, handler := range child.On {
			if handler.Message == "reset" {
				for _, attr := range child.Attrs {
					if attr.Name == "disabled" && attr.Flag {
						return true
					}
				}
			}
		}
	}
	return false
}

func nodeAttrs(node gobi.Node) []attr {
	result := make([]attr, 0, len(node.Attrs))
	for _, item := range node.Attrs {
		result = append(result, attr{Name: item.Name, Value: item.Value, Flag: item.Flag})
	}
	return result
}
