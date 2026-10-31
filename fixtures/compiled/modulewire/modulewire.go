// Package modulewire contains the primitive-field values shared by the
// independently compiled parent and child module fixtures.
package modulewire

type Input struct {
	Step     int
	Locked   bool
	Revision int
}

type Publication struct {
	Count    float64
	Revision int
}
