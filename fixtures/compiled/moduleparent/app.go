// Package moduleparent is the Go-owned controller for the compiled module
// pair. It never imports the child implementation.
package moduleparent

import (
	"strconv"

	"github.com/samuelpmahan/gondola/fixtures/compiled/modulewire"
	"github.com/samuelpmahan/gondola/gobi"
)

const maxSafeRevision = 9007199254740991

type State struct {
	Step              int
	Locked            bool
	Revision          int
	PublishedCount    float64
	PublishedRevision int
}

func Init() State {
	return State{Step: 1, Revision: 1}
}

func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	switch message.Name {
	case "step.up":
		if message.Arg == "" && state.Step < 3 && state.Revision < maxSafeRevision {
			state.Step++
			state.Revision++
		}
	case "step.down":
		if message.Arg == "" && state.Step > 1 && state.Revision < maxSafeRevision {
			state.Step--
			state.Revision++
		}
	case "lock.toggle":
		if message.Arg == "" && state.Revision < maxSafeRevision {
			state.Locked = !state.Locked
			state.Revision++
		}
	case "input.reset":
		if message.Arg == "" && state.Revision < maxSafeRevision {
			state.Step = 1
			state.Locked = false
			state.Revision++
		}
	}
	return state, []gobi.Effect{}
}

// Output projects the parent's current typed input for the child bridge.
func Output(state State) modulewire.Input {
	return modulewire.Input{Step: state.Step, Locked: state.Locked, Revision: state.Revision}
}

// Receive accepts only a publication for the current input revision and a
// finite, nonnegative count in the compiled numeric profile.
func Receive(state State, publication modulewire.Publication) State {
	if publication.Revision != state.Revision || publication.Count < 0 ||
		publication.Count > float64(maxSafeRevision) || publication.Count != publication.Count {
		return state
	}
	state.PublishedCount = publication.Count
	state.PublishedRevision = publication.Revision
	return state
}

func View(state State) gobi.Node {
	lockLabel := "Unlocked"
	if state.Locked {
		lockLabel = "Locked"
	}
	stepDown := gobi.El("button", gobi.Txt("Step −")).Set("class", "module-step-down").Handle("click", "step.down", "")
	if state.Step <= 1 {
		stepDown = stepDown.Flag("disabled")
	}
	stepUp := gobi.El("button", gobi.Txt("Step +")).Set("class", "module-step-up").Handle("click", "step.up", "")
	if state.Step >= 3 {
		stepUp = stepUp.Flag("disabled")
	}
	lock := gobi.El("button", gobi.Txt(lockLabel)).Set("class", "module-lock-toggle").Handle("click", "lock.toggle", "")
	reset := gobi.El("button", gobi.Txt("Reset input")).Set("class", "module-input-reset").Handle("click", "input.reset", "")
	published := "No publication"
	if state.PublishedRevision > 0 {
		published = "Published count " + strconv.FormatFloat(state.PublishedCount, 'f', -1, 64) + " at revision " + strconv.Itoa(state.PublishedRevision)
	}
	return gobi.El("main",
		gobi.El("p", gobi.Txt("Step: "), gobi.Txt(strconv.Itoa(state.Step))).Set("class", "module-parent-step"),
		stepDown,
		stepUp,
		lock,
		reset,
		gobi.El("p", gobi.Txt(published)).Set("class", "module-parent-publication"),
	).Set("class", "compiled-module-parent").Keyed("module-parent")
}
