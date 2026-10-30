package gobi

import "testing"

func TestCompareInteractionAcceptsValidSequence(t *testing.T) {
	want := interactionTrace()
	got := interactionTrace()
	for i := range got.Ticks {
		got.Ticks[i].Mutations = i + 10
	}

	if diff := CompareInteraction(want, got, SamePixels); diff.Found {
		t.Fatalf("CompareInteraction() = %+v, want no diff", diff)
	}
}

func TestCompareInteractionReportsFirstMismatch(t *testing.T) {
	tests := []struct {
		name   string
		level  Level
		mutate func(*Trace)
		part   string
		tick   int
	}{
		{
			name:  "state differs even when rendered output matches",
			level: SameDOM,
			mutate: func(trace *Trace) {
				trace.Ticks[1].State = "count=99"
			},
			part: "State",
			tick: 1,
		},
		{
			name:  "reordered steps",
			level: SameTree,
			mutate: func(trace *Trace) {
				trace.Ticks[1].Step, trace.Ticks[2].Step = trace.Ticks[2].Step, trace.Ticks[1].Step
			},
			part: "Step",
			tick: 1,
		},
		{
			name:  "index mismatch",
			level: SameTree,
			mutate: func(trace *Trace) {
				trace.Ticks[2].Index = 8
			},
			part: "Index",
			tick: 2,
		},
		{
			name:  "tree mismatch",
			level: SameTree,
			mutate: func(trace *Trace) {
				trace.Ticks[1].Tree = "candidate tree"
			},
			part: "Tree",
			tick: 1,
		},
		{
			name:  "DOM mismatch",
			level: SameDOM,
			mutate: func(trace *Trace) {
				trace.Ticks[1].DOM = "<candidate />"
			},
			part: "DOM",
			tick: 1,
		},
		{
			name:  "pixels are missing even from both traces",
			level: SamePixels,
			mutate: func(trace *Trace) {
				trace.Ticks[1].Pixels = ""
			},
			part: "Pixels",
			tick: 1,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			want := interactionTrace()
			got := interactionTrace()
			test.mutate(&got)

			diff := CompareInteraction(want, got, test.level)
			if !diff.Found || diff.Part != test.part || diff.Tick != test.tick {
				t.Fatalf("CompareInteraction() = %+v, want Part=%q Tick=%d", diff, test.part, test.tick)
			}
		})
	}
}

func TestCompareInteractionRejectsMalformedTraceShape(t *testing.T) {
	t.Run("missing initial tick", func(t *testing.T) {
		diff := CompareInteraction(Trace{}, Trace{}, SameTree)
		if !diff.Found || diff.Part != "Ticks" || diff.Tick != -1 {
			t.Fatalf("CompareInteraction() = %+v, want missing initial tick diff at -1", diff)
		}
	})

	t.Run("length mismatch", func(t *testing.T) {
		want := interactionTrace()
		got := interactionTrace()
		got.Ticks = got.Ticks[:2]

		diff := CompareInteraction(want, got, SameTree)
		if !diff.Found || diff.Part != "Ticks" || diff.Tick != -1 {
			t.Fatalf("CompareInteraction() = %+v, want Ticks diff at -1", diff)
		}
	})

	t.Run("matching but non-sequential indices", func(t *testing.T) {
		want := interactionTrace()
		got := interactionTrace()
		want.Ticks[1].Index = 7
		got.Ticks[1].Index = 7

		diff := CompareInteraction(want, got, SameTree)
		if !diff.Found || diff.Part != "Index" || diff.Tick != 1 {
			t.Fatalf("CompareInteraction() = %+v, want Index diff at 1", diff)
		}
	})

	t.Run("initial tick cannot carry an action", func(t *testing.T) {
		want := interactionTrace()
		got := interactionTrace()
		got.Ticks[0].Step = Step{Path: "button", Event: "click"}

		diff := CompareInteraction(want, got, SameTree)
		if !diff.Found || diff.Part != "Step" || diff.Tick != 0 {
			t.Fatalf("CompareInteraction() = %+v, want Step diff at 0", diff)
		}
	})
}

func TestCompareInteractionRejectsInvalidLevel(t *testing.T) {
	for _, level := range []Level{0, SamePixels + 1} {
		diff := CompareInteraction(interactionTrace(), interactionTrace(), level)
		if !diff.Found || diff.Part != "Level" || diff.Tick != -1 {
			t.Errorf("CompareInteraction(level=%d) = %+v, want Level diff at -1", level, diff)
		}
	}
}

func interactionTrace() Trace {
	return Trace{Ticks: []Tick{
		{Index: 0, State: "count=0", Tree: "tree 0", DOM: "<main>0</main>", Pixels: "pixels-0"},
		{Index: 1, Step: Step{Path: "increment", Event: "click"}, State: "count=1", Tree: "tree 1", DOM: "<main>1</main>", Pixels: "pixels-1"},
		{Index: 2, Step: Step{Path: "decrement", Event: "click"}, State: "count=0", Tree: "tree 0", DOM: "<main>0</main>", Pixels: "pixels-0"},
	}}
}
