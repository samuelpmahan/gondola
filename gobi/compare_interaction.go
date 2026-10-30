package gobi

import (
	"fmt"
)

// CompareInteraction compares complete interaction traces. Every trace begins with
// an initial tick at index 0 whose Step is empty; subsequent ticks are indexed
// from 1 and record the action that produced them. State, index, and action must
// agree at every tick. The requested Level controls whether Tree, DOM, and Pixels
// are also compared. Mutations are deliberately ignored because they are a
// backend measurement, not part of the interaction's observable result.
func CompareInteraction(golden, candidate Trace, level Level) Diff {
	if level < SameTree || level > SamePixels {
		return Diff{Tick: -1, Part: "Level", Want: "SameTree, SameDOM, or SamePixels", Got: fmt.Sprint(level), Found: true}
	}
	if len(golden.Ticks) != len(candidate.Ticks) {
		return Diff{Tick: -1, Part: "Ticks", Want: fmt.Sprint(len(golden.Ticks)), Got: fmt.Sprint(len(candidate.Ticks)), Found: true}
	}
	if len(golden.Ticks) == 0 {
		return Diff{Tick: -1, Part: "Ticks", Want: "at least 1 (initial tick)", Got: "0", Found: true}
	}

	for i, g := range golden.Ticks {
		c := candidate.Ticks[i]

		// An interaction trace is the initial render followed by one tick per action.
		// Check this shape as well as pairwise equality so identical malformed traces
		// cannot accidentally pass.
		if g.Index != i {
			return Diff{Tick: i, Part: "Index", Want: fmt.Sprint(i), Got: fmt.Sprint(g.Index), Found: true}
		}
		if c.Index != i {
			return Diff{Tick: i, Part: "Index", Want: fmt.Sprint(i), Got: fmt.Sprint(c.Index), Found: true}
		}
		if i == 0 {
			if !emptyStep(g.Step) {
				return Diff{Tick: i, Part: "Step", Want: "<initial>", Got: formatStep(g.Step), Found: true}
			}
			if !emptyStep(c.Step) {
				return Diff{Tick: i, Part: "Step", Want: "<initial>", Got: formatStep(c.Step), Found: true}
			}
		} else if g.Step != c.Step {
			return Diff{Tick: i, Part: "Step", Want: formatStep(g.Step), Got: formatStep(c.Step), Found: true}
		}
		if g.State != c.State {
			return Diff{Tick: i, Part: "State", Want: g.State, Got: c.State, Found: true}
		}
		if g.Tree != c.Tree {
			return Diff{Tick: i, Part: "Tree", Want: g.Tree, Got: c.Tree, Found: true}
		}
		if level >= SameDOM && g.DOM != c.DOM {
			return Diff{Tick: i, Part: "DOM", Want: g.DOM, Got: c.DOM, Found: true}
		}
		if level >= SamePixels {
			if g.Pixels == "" || c.Pixels == "" {
				return Diff{Tick: i, Part: "Pixels", Want: pixelValue(g.Pixels), Got: pixelValue(c.Pixels), Found: true}
			}
			if g.Pixels != c.Pixels {
				return Diff{Tick: i, Part: "Pixels", Want: g.Pixels, Got: c.Pixels, Found: true}
			}
		}
	}
	return Diff{}
}

func emptyStep(step Step) bool {
	return step.Path == "" && step.Event == "" && step.Value == ""
}

func formatStep(step Step) string {
	return fmt.Sprintf("Path=%q Event=%q Value=%q", step.Path, step.Event, step.Value)
}

func pixelValue(pixels string) string {
	if pixels == "" {
		return "<missing>"
	}
	return pixels
}
