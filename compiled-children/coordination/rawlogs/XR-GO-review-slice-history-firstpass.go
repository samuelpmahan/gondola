package main

import (
	"fmt"
	"reflect"

	"github.com/samuelpmahan/gondola/fixtures/compiled/children"
	"github.com/samuelpmahan/gondola/gobi"
)

const reviewMaxSafeID uint64 = 9007199254740991

func main() {
	initial := children.Init()
	added, _ := children.Update(initial, gobi.Message{Name: "child.add", Arg: "ash"})
	countered, _ := children.Update(added, gobi.Message{Name: "counter.add", Arg: "oak"})
	reordered, _ := children.Update(countered, gobi.Message{Name: "children.swap", Arg: "oak:ash"})
	removed, _ := children.Update(reordered, gobi.Message{Name: "child.remove", Arg: "elm"})
	reused, _ := children.Update(removed, gobi.Message{Name: "child.add", Arg: "elm"})

	if len(initial.Children) != 2 || initial.Children[0].Key != "oak" || initial.Children[1].Key != "elm" {
		panic(fmt.Sprintf("initial value changed: %#v", initial.Children))
	}
	if len(added.Children) != 3 || added.Children[0].Key != "oak" || added.Children[1].Key != "elm" || added.Children[2].Key != "ash" {
		panic(fmt.Sprintf("append history changed: %#v", added.Children))
	}
	if added.Children[0].Counter.Count != 0 || initial.Children[0].Counter.Count != 0 || countered.Children[0].Counter.Count != 1 {
		panic("counter update aliased an earlier value slice")
	}
	if reordered.Children[0].Key != "ash" || reordered.Children[1].Key != "elm" || reordered.Children[2].Key != "oak" {
		panic(fmt.Sprintf("reorder result = %#v", reordered.Children))
	}
	if countered.Children[0].Key != "oak" || countered.Children[2].Key != "ash" {
		panic(fmt.Sprintf("reorder mutated prior order: %#v", countered.Children))
	}
	if removed.Children[0].Key != "ash" || removed.Children[1].Key != "oak" || len(removed.Children) != 2 {
		panic(fmt.Sprintf("remove result = %#v", removed.Children))
	}
	if len(reordered.Children) != 3 || reordered.Children[1].Key != "elm" {
		panic(fmt.Sprintf("remove mutated prior order: %#v", reordered.Children))
	}
	if len(reused.Children) != 3 || reused.Children[0].Generation != 4 || reused.Children[1].Generation != 5 || reused.NextGeneration != 5 {
		panic(fmt.Sprintf("generation history = %#v", reused))
	}

	limitState := children.Init()
	limitState.NextGeneration = reviewMaxSafeID - 1
	atGenerationLimit, _ := children.Update(limitState, gobi.Message{Name: "child.add", Arg: "abcdefghijklmnop"})
	if atGenerationLimit.NextGeneration != reviewMaxSafeID || atGenerationLimit.Children[2].Generation != reviewMaxSafeID {
		panic(fmt.Sprintf("maximum safe child generation not admitted: %#v", atGenerationLimit))
	}
	blockedAdd, effects := children.Update(atGenerationLimit, gobi.Message{Name: "child.add", Arg: "last"})
	if len(effects) != 0 || !reflect.DeepEqual(blockedAdd, atGenerationLimit) {
		panic("child generation advanced beyond the safe ceiling")
	}

	blockedRemountInput := children.Init()
	blockedRemountInput.Parent.Alive = false
	blockedRemountInput.NextGeneration = reviewMaxSafeID
	blockedRemount, effects := children.Update(blockedRemountInput, gobi.Message{Name: "parent.remount"})
	if len(effects) != 0 || !reflect.DeepEqual(blockedRemount, blockedRemountInput) {
		panic("parent remount advanced beyond the safe ceiling")
	}

	childRequestState := children.Init()
	childRequestState.Children[0].RequestSeq = reviewMaxSafeID - 1
	childAtLimit, childEffects := children.Update(childRequestState, gobi.Message{Name: "child.request", Arg: "oak"})
	if len(childEffects) != 1 || childAtLimit.Children[0].Token != "child:oak:g2:r9007199254740991" {
		panic(fmt.Sprintf("maximum safe child request sequence not admitted: %#v / %#v", childAtLimit.Children[0], childEffects))
	}
	childAtLimit, _ = children.Update(childAtLimit, gobi.Message{Name: "complete", Arg: childAtLimit.Children[0].Token})
	blockedChildRequest, effects := children.Update(childAtLimit, gobi.Message{Name: "child.request", Arg: "oak"})
	if len(effects) != 0 || !reflect.DeepEqual(blockedChildRequest, childAtLimit) {
		panic("child request sequence advanced beyond the safe ceiling")
	}

	parentRequestState := children.Init()
	parentRequestState.Parent.RequestSeq = reviewMaxSafeID - 1
	parentAtLimit, parentEffects := children.Update(parentRequestState, gobi.Message{Name: "parent.request"})
	if len(parentEffects) != 1 || parentAtLimit.Parent.Token != "parent:g1:r9007199254740991" {
		panic(fmt.Sprintf("maximum safe parent request sequence not admitted: %#v / %#v", parentAtLimit.Parent, parentEffects))
	}
	parentAtLimit, _ = children.Update(parentAtLimit, gobi.Message{Name: "complete", Arg: parentAtLimit.Parent.Token})
	blockedParentRequest, effects := children.Update(parentAtLimit, gobi.Message{Name: "parent.request"})
	if len(effects) != 0 || !reflect.DeepEqual(blockedParentRequest, parentAtLimit) {
		panic("parent request sequence advanced beyond the safe ceiling")
	}
	fmt.Println("slice snapshots stayed value-isolated across append/counter/reorder/remove/reuse; max-safe IDs were admitted once and parent remount/request counters did not advance past the ceiling")
}
