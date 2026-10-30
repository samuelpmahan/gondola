package semantics

import (
	"math"
	"strconv"
)

type Inner struct {
	Count int
	Label string
}

type IntegerWidths struct {
	Int    int
	Int8   int8
	Int16  int16
	Int32  int32
	Int64  int64
	Uint   uint
	Uint8  uint8
	Uint16 uint16
	Uint32 uint32
	Uint64 uint64
	Byte   byte
	Rune   rune
}

type Snapshot struct {
	Flag         bool
	Name         string
	Signed       int64
	Unsigned     uint64
	Scalar       float64
	Nested       Inner
	Fixed        [2]Inner
	Values       []float64
	NilValues    []float64
	EmptyValues  []float64
	Ints         []int
	NilInts      []int
	EmptyInts    []int
	Uints        []uint64
	NilUints     []uint64
	EmptyUints   []uint64
	Strings      []string
	NilStrings   []string
	EmptyStrings []string
	Bools        []bool
	NilBools     []bool
	EmptyBools   []bool
	Structs      []Inner
	NilStructs   []Inner
	EmptyStructs []Inner
}

func SnapshotValue() Snapshot {
	negativeZero := math.Copysign(0, -1)
	return Snapshot{
		Flag:         true,
		Name:         "probe",
		Signed:       -9,
		Unsigned:     42,
		Scalar:       negativeZero,
		Nested:       Inner{Count: 7, Label: "nested"},
		Fixed:        [2]Inner{{Count: 11, Label: "fixed-a"}, {Count: 12, Label: "fixed-b"}},
		Values:       []float64{negativeZero, 1.25, 1e21},
		NilValues:    nil,
		EmptyValues:  []float64{},
		Ints:         []int{-2, 3},
		NilInts:      nil,
		EmptyInts:    []int{},
		Uints:        []uint64{0, 42},
		NilUints:     nil,
		EmptyUints:   []uint64{},
		Strings:      []string{"", "g"},
		NilStrings:   nil,
		EmptyStrings: []string{},
		Bools:        []bool{true, false},
		NilBools:     nil,
		EmptyBools:   []bool{},
		Structs:      []Inner{{Count: 13, Label: "slice"}},
		NilStructs:   nil,
		EmptyStructs: []Inner{},
	}
}

func IntegerWidthsValue() IntegerWidths {
	return IntegerWidths{
		Int: 1, Int8: 2, Int16: 3, Int32: 4, Int64: 5,
		Uint: 6, Uint8: 7, Uint16: 8, Uint32: 9, Uint64: 10,
		Byte: 11, Rune: 12,
	}
}

func IntegerWidthsAtMax() IntegerWidths {
	return IntegerWidths{
		Int: 9007199254740991, Int8: 127, Int16: 32767, Int32: 2147483647,
		Int64: 9223372036854775807, Uint: 9007199254740991, Uint8: 255,
		Uint16: 65535, Uint32: 4294967295, Uint64: 18446744073709551615,
		Byte: 255, Rune: 2147483647,
	}
}

func IncrementIntegerWidths(value IntegerWidths) IntegerWidths {
	value.Int++
	value.Int8++
	value.Int16++
	value.Int32++
	value.Int64++
	value.Uint++
	value.Uint8++
	value.Uint16++
	value.Uint32++
	value.Uint64++
	value.Byte++
	value.Rune++
	return value
}

func FormatFloat(value float64, format byte, precision, bitSize int) string {
	return strconv.FormatFloat(value, format, precision, bitSize)
}

func FormatUint(value uint64, base int) string {
	return strconv.FormatUint(value, base)
}

func FormatInt(value int64, base int) string {
	return strconv.FormatInt(value, base)
}

func Itoa(value int) string {
	return strconv.Itoa(value)
}

func Mutate(snapshot Snapshot) Snapshot {
	snapshot.Scalar = 2.5
	snapshot.Values[0]++
	snapshot.Values = append(snapshot.Values, 2.5)
	snapshot.Nested.Count++
	snapshot.Fixed[0].Count++
	snapshot.Structs[0].Count++
	return snapshot
}

func AppendThenMutate(snapshot Snapshot) Snapshot {
	snapshot.Structs = append(snapshot.Structs, Inner{Count: 15, Label: "append"})
	snapshot.Structs[0].Count += 100
	return snapshot
}
