package gobi

// The interfaces below run at generate time and check time, in native Go, never in the browser, so they may be Go
// interfaces: goscript never sees them.

// App is what the generator reads from Go source by convention: every package with Init, Update and View is a component.
type App struct {
	Module     string
	Root       string
	Components []Component
}

// Component is one package that follows the convention.
type Component struct {
	Package  string
	State    string   // the Go type name of its state
	Messages []string // every Message.Name its Update switches on
	Uses     []string // child components its View places
}

// File is one generated source file.
type File struct {
	Path  string
	Bytes []byte
}

// Backend turns an App into a framework's source: React (.tsx), the Gobi DOM runtime, Svelte, a static HTML server.
type Backend interface {
	Name() string
	Emit(app App) ([]File, error)
}

// Step is one user action in a Script: an event on the node found by its key path ("list/b/input").
type Step struct{ Path, Event, Value string }

// Script is a seeded sequence of steps that every backend and every golden reference plays.
type Script struct {
	Seed  uint64
	Steps []Step
}

// Tick is what one step leaves behind, each part as a canonical text or its SHA-256.
type Tick struct {
	Index     int
	Step      Step
	State     string // canonical state after Update
	Tree      string // canonical Node after View
	DOM       string // canonical outerHTML of the mounted root
	Pixels    string // SHA-256 of the screenshot, empty when the oracle has no screen
	Mutations int    // DOM mutations the backend made (measured, never required to match)
}

// Trace is one play of a Script on one implementation.
type Trace struct {
	Implementation string
	Ticks          []Tick
}

// Oracle plays a Script on one implementation (a golden reference or a candidate) and records every Tick.
type Oracle interface {
	Name() string
	Play(app App, script Script) (Trace, error)
}

// Level is how strictly two traces must agree.
type Level uint8

const (
	SameTree   Level = iota + 1 // the Node values agree
	SameDOM                     // and the mounted DOM agrees byte for byte
	SamePixels                  // and the screenshots agree pixel for pixel
)

// Diff is the first disagreement between a golden trace and a candidate, or the zero Diff when they agree.
type Diff struct {
	Tick  int
	Part  string // "State", "Tree", "DOM" or "Pixels"
	Want  string
	Got   string
	Found bool
}

// Compare walks two traces tick by tick and stops at the first part that differs at the requested level.
func Compare(golden, candidate Trace, level Level) Diff {
	if len(golden.Ticks) != len(candidate.Ticks) {
		return Diff{Tick: -1, Part: "Ticks", Found: true}
	}
	for i, g := range golden.Ticks {
		c := candidate.Ticks[i]
		parts := [][3]string{{"Tree", g.Tree, c.Tree}}
		if level >= SameDOM {
			parts = append(parts, [3]string{"DOM", g.DOM, c.DOM})
		}
		if level >= SamePixels {
			parts = append(parts, [3]string{"Pixels", g.Pixels, c.Pixels})
		}
		for _, p := range parts {
			if p[1] != p[2] {
				return Diff{Tick: i, Part: p[0], Want: p[1], Got: p[2], Found: true}
			}
		}
	}
	return Diff{}
}
