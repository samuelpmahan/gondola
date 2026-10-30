//go:build ignore

package main

import (
	"fmt"
	"strings"
	"sync"

	"github.com/samuelpmahan/gondola/collection"
	"github.com/samuelpmahan/gondola/composition"
)

// This bounded independent probe races input revision increments against
// publications stamped with revision zero. At most the operations linearized
// before the first input update may publish; every later attempt must be stale.
func main() {
	m := composition.NewManager()
	parent, err := m.Create()
	must(err)
	child, err := m.CreateChild(parent)
	must(err)
	for _, step := range []collection.Step{
		{Path: "0", Event: "click", Key: "add"},
		{Path: "2/0/0", Event: "input", Key: "row-1-input", Value: "race value"},
		{Path: "2/0/5", Event: "click", Key: "row-1-save"},
	} {
		_, err = m.Dispatch(child, step)
		must(err)
	}
	commands, err := m.Effects(child)
	must(err)
	if len(commands) != 1 || commands[0].Kind != "start" || commands[0].ID != 1 {
		panic(fmt.Sprintf("unexpected save command: %#v", commands))
	}
	_, err = m.Complete(child, collection.Reply{ID: 1, Value: "captured"})
	must(err)
	m.Changes()

	const operations = 100
	var wg sync.WaitGroup
	var mu sync.Mutex
	acceptedPublishes := 0
	stalePublishes := 0
	unexpectedErrors := []string{}
	for i := 0; i < operations; i++ {
		wg.Add(2)
		go func(i int) {
			defer wg.Done()
			_, err := m.SetChildInputs(parent, child, composition.Inputs{Title: fmt.Sprintf("title-%d", i)})
			if err != nil {
				mu.Lock()
				unexpectedErrors = append(unexpectedErrors, err.Error())
				mu.Unlock()
			}
		}(i)
		go func() {
			defer wg.Done()
			_, err := m.Publish(child, 1, 0)
			mu.Lock()
			defer mu.Unlock()
			if err == nil {
				acceptedPublishes++
			} else if strings.Contains(err.Error(), "stale") {
				stalePublishes++
			} else {
				unexpectedErrors = append(unexpectedErrors, err.Error())
			}
		}()
	}
	wg.Wait()
	if len(unexpectedErrors) != 0 {
		panic(fmt.Sprintf("unexpected concurrent errors: %v", unexpectedErrors))
	}
	childSnapshot, err := m.Snapshot(child)
	must(err)
	parentSnapshot, err := m.Snapshot(parent)
	must(err)
	if childSnapshot.State.InputRevision != operations {
		panic(fmt.Sprintf("input revision = %d, want %d", childSnapshot.State.InputRevision, operations))
	}
	if len(parentSnapshot.State.Inbox) != acceptedPublishes {
		panic(fmt.Sprintf("inbox length = %d, accepted publishes = %d", len(parentSnapshot.State.Inbox), acceptedPublishes))
	}
	if len(childSnapshot.Messages) != 4+acceptedPublishes {
		panic(fmt.Sprintf("child messages = %d, accepted publishes = %d", len(childSnapshot.Messages), acceptedPublishes))
	}
	for i, receipt := range parentSnapshot.State.Inbox {
		if receipt.Sequence != uint64(i+1) || receipt.InputRevision != 0 || receipt.Saved != "captured" {
			panic(fmt.Sprintf("receipt[%d] = %#v", i, receipt))
		}
	}
	changes := m.Changes()
	wantChanges := []composition.SessionID{child}
	if acceptedPublishes > 0 {
		wantChanges = []composition.SessionID{parent, child}
	}
	if len(changes) != len(wantChanges) {
		panic(fmt.Sprintf("changes = %v, want %v", changes, wantChanges))
	}
	for i := range wantChanges {
		if changes[i] != wantChanges[i] {
			panic(fmt.Sprintf("changes = %v, want %v", changes, wantChanges))
		}
	}
	fmt.Printf("accepted=%d stale=%d revision=%d inbox=%d messages=%d changes=%v\n",
		acceptedPublishes, stalePublishes, childSnapshot.State.InputRevision,
		len(parentSnapshot.State.Inbox), len(childSnapshot.Messages), changes)
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
