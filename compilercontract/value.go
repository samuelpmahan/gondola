package compilercontract

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"reflect"
	"strconv"
	"strings"
	"unicode/utf8"
)

const maxValueDepth = 256
const maxSafeNumberInteger int64 = 9007199254740991

type Value struct {
	TypeID      TypeID        `json:"typeId"`
	Kind        TypeKind      `json:"kind"`
	Bool        *bool         `json:"bool,omitempty"`
	String      *string       `json:"string,omitempty"`
	Integer     *string       `json:"integer,omitempty"`
	Float64Bits *string       `json:"float64Bits,omitempty"`
	IsNil       *bool         `json:"isNil,omitempty"`
	Items       *[]Value      `json:"items,omitempty"`
	Fields      *[]FieldValue `json:"fields,omitempty"`
}

type FieldValue struct {
	Name  string `json:"name"`
	Value Value  `json:"value"`
}

func EncodeValue(value any, typeID TypeID, types []TypeInfo) (Value, error) {
	typeMap, err := indexTypes(types)
	if err != nil {
		return Value{}, err
	}
	result, err := encodeReflect(reflect.ValueOf(value), typeID, typeMap, 0)
	if err != nil {
		return Value{}, err
	}
	if err := ValidateValue(result, types); err != nil {
		return Value{}, err
	}
	return result, nil
}

func encodeReflect(value reflect.Value, typeID TypeID, types map[TypeID]TypeInfo, depth int) (Value, error) {
	if depth > maxValueDepth {
		return Value{}, fmt.Errorf("value nesting exceeds %d", maxValueDepth)
	}
	info, ok := types[typeID]
	if !ok {
		return Value{}, fmt.Errorf("unknown typeId %q", typeID)
	}
	if !value.IsValid() {
		return Value{}, fmt.Errorf("invalid Go value for type %q", typeID)
	}
	out := Value{TypeID: typeID, Kind: info.Kind}
	switch info.Kind {
	case KindBool:
		if value.Kind() != reflect.Bool {
			return Value{}, typeMismatch(typeID, value)
		}
		v := value.Bool()
		out.Bool = &v
	case KindString:
		if value.Kind() != reflect.String {
			return Value{}, typeMismatch(typeID, value)
		}
		v := value.String()
		if !utf8.ValidString(v) {
			return Value{}, fmt.Errorf("string value for type %q is not valid UTF-8", typeID)
		}
		out.String = &v
	case KindInt:
		if value.Kind() < reflect.Int || value.Kind() > reflect.Int64 || uint8(value.Type().Bits()) != info.Bits {
			return Value{}, typeMismatch(typeID, value)
		}
		n := value.Int()
		v := strconv.FormatInt(n, 10)
		out.Integer = &v
	case KindUint:
		if value.Kind() < reflect.Uint || value.Kind() > reflect.Uint64 || uint8(value.Type().Bits()) != info.Bits {
			return Value{}, typeMismatch(typeID, value)
		}
		n := value.Uint()
		v := strconv.FormatUint(n, 10)
		out.Integer = &v
	case KindFloat64:
		if value.Kind() != reflect.Float64 {
			return Value{}, typeMismatch(typeID, value)
		}
		f := value.Float()
		if math.IsNaN(f) || math.IsInf(f, 0) {
			return Value{}, fmt.Errorf("non-finite float64 value is unsupported")
		}
		v := fmt.Sprintf("%016x", math.Float64bits(f))
		out.Float64Bits = &v
	case KindSlice, KindArray:
		if info.Kind == KindSlice && value.Kind() != reflect.Slice {
			return Value{}, typeMismatch(typeID, value)
		}
		if info.Kind == KindArray && value.Kind() != reflect.Array {
			return Value{}, typeMismatch(typeID, value)
		}
		if info.Kind == KindArray && (info.Length == nil || value.Len() != *info.Length) {
			return Value{}, fmt.Errorf("array length does not match type %q", typeID)
		}
		isNil := false
		if info.Kind == KindSlice {
			isNil = value.IsNil()
			out.IsNil = &isNil
		}
		items := make([]Value, value.Len())
		for i := 0; i < value.Len(); i++ {
			item, err := encodeReflect(value.Index(i), info.ElemType, types, depth+1)
			if err != nil {
				return Value{}, fmt.Errorf("%s[%d]: %w", typeID, i, err)
			}
			items[i] = item
		}
		out.Items = &items
	case KindStruct:
		if value.Kind() != reflect.Struct {
			return Value{}, typeMismatch(typeID, value)
		}
		if len(info.Fields) == 0 {
			return Value{}, fmt.Errorf("empty structs are unsupported for type %q", typeID)
		}
		if value.NumField() != len(info.Fields) {
			return Value{}, fmt.Errorf("struct %q has %d Go fields, type metadata declares %d", typeID, value.NumField(), len(info.Fields))
		}
		fields := make([]FieldValue, len(info.Fields))
		for i, field := range info.Fields {
			goField := value.Type().Field(i)
			if goField.Name != field.Name {
				return Value{}, fmt.Errorf("struct %q field %d is %q, metadata declares %q", typeID, i, goField.Name, field.Name)
			}
			if !value.Field(i).CanInterface() {
				return Value{}, fmt.Errorf("struct %q field %q is not exported", typeID, field.Name)
			}
			encoded, err := encodeReflect(value.Field(i), field.Type, types, depth+1)
			if err != nil {
				return Value{}, fmt.Errorf("%s.%s: %w", typeID, field.Name, err)
			}
			fields[i] = FieldValue{Name: field.Name, Value: encoded}
		}
		out.Fields = &fields
	default:
		return Value{}, fmt.Errorf("unsupported kind %q for type %q", info.Kind, typeID)
	}
	return out, nil
}

func typeMismatch(typeID TypeID, value reflect.Value) error {
	return fmt.Errorf("Go value %s does not match type %q", value.Type(), typeID)
}

func DecodeValueJSON(data []byte, types []TypeInfo) (Value, error) {
	if err := validateJSONUnicode(data); err != nil {
		return Value{}, err
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var value Value
	if err := decoder.Decode(&value); err != nil {
		return Value{}, err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return Value{}, fmt.Errorf("trailing JSON value")
		}
		return Value{}, err
	}
	if err := ValidateValue(value, types); err != nil {
		return Value{}, err
	}
	return value, nil
}

func ValidateValue(value Value, types []TypeInfo) error {
	typeMap, err := indexTypes(types)
	if err != nil {
		return err
	}
	return validateValue(value, typeMap, 0)
}

func validateValue(value Value, types map[TypeID]TypeInfo, depth int) error {
	if depth > maxValueDepth {
		return fmt.Errorf("value nesting exceeds %d", maxValueDepth)
	}
	info, ok := types[value.TypeID]
	if !ok {
		return fmt.Errorf("unknown typeId %q", value.TypeID)
	}
	if value.Kind != info.Kind {
		return fmt.Errorf("value kind %q does not match type %q kind %q", value.Kind, value.TypeID, info.Kind)
	}
	payloads := 0
	if value.Bool != nil {
		payloads++
	}
	if value.String != nil {
		payloads++
	}
	if value.Integer != nil {
		payloads++
	}
	if value.Float64Bits != nil {
		payloads++
	}
	if value.Items != nil {
		payloads++
	}
	if value.Fields != nil {
		payloads++
	}
	if value.IsNil != nil && info.Kind != KindSlice {
		return fmt.Errorf("isNil is only valid for slices")
	}
	switch info.Kind {
	case KindBool:
		if payloads != 1 || value.Bool == nil {
			return fmt.Errorf("bool value must contain only bool payload")
		}
	case KindString:
		if payloads != 1 || value.String == nil {
			return fmt.Errorf("string value must contain only string payload")
		}
		if !utf8.ValidString(*value.String) {
			return fmt.Errorf("string payload is not valid UTF-8")
		}
	case KindInt, KindUint:
		if payloads != 1 || value.Integer == nil {
			return fmt.Errorf("integer value must contain only integer payload")
		}
		if err := validateInteger(*value.Integer, info); err != nil {
			return err
		}
	case KindFloat64:
		if payloads != 1 || value.Float64Bits == nil {
			return fmt.Errorf("float64 value must contain only float64Bits payload")
		}
		if err := validateFloatBits(*value.Float64Bits); err != nil {
			return err
		}
	case KindSlice, KindArray:
		if payloads != 1 || value.Items == nil {
			return fmt.Errorf("slice or array value must contain only items payload")
		}
		if info.Kind == KindSlice && value.IsNil == nil {
			return fmt.Errorf("slice value must include isNil")
		}
		if info.Kind == KindArray && value.IsNil != nil {
			return fmt.Errorf("array value cannot include isNil")
		}
		if info.Kind == KindSlice && *value.IsNil && len(*value.Items) != 0 {
			return fmt.Errorf("nil slice must have no items")
		}
		if info.Kind == KindArray && (info.Length == nil || len(*value.Items) != *info.Length) {
			return fmt.Errorf("array length does not match type %q", value.TypeID)
		}
		for i, item := range *value.Items {
			if err := validateValue(item, types, depth+1); err != nil {
				return fmt.Errorf("%s[%d]: %w", value.TypeID, i, err)
			}
			if item.TypeID != info.ElemType {
				return fmt.Errorf("%s[%d] has type %q, want %q", value.TypeID, i, item.TypeID, info.ElemType)
			}
		}
	case KindStruct:
		if payloads != 1 || value.Fields == nil {
			return fmt.Errorf("struct value must contain only fields payload")
		}
		if len(*value.Fields) != len(info.Fields) {
			return fmt.Errorf("struct %q has %d values, want %d", value.TypeID, len(*value.Fields), len(info.Fields))
		}
		for i, field := range info.Fields {
			got := (*value.Fields)[i]
			if got.Name != field.Name {
				return fmt.Errorf("struct %q field %d is %q, want %q", value.TypeID, i, got.Name, field.Name)
			}
			if err := validateValue(got.Value, types, depth+1); err != nil {
				return fmt.Errorf("%s.%s: %w", value.TypeID, field.Name, err)
			}
			if got.Value.TypeID != field.Type {
				return fmt.Errorf("%s.%s has type %q, want %q", value.TypeID, field.Name, got.Value.TypeID, field.Type)
			}
		}
	default:
		return fmt.Errorf("unsupported type kind %q", info.Kind)
	}
	return nil
}

func validateInteger(text string, info TypeInfo) error {
	if info.Bits != 8 && info.Bits != 16 && info.Bits != 32 && info.Bits != 64 {
		return fmt.Errorf("invalid integer bit width %d", info.Bits)
	}
	if info.Kind == KindInt {
		n, err := strconv.ParseInt(text, 10, int(info.Bits))
		if err != nil {
			return fmt.Errorf("invalid %d-bit integer %q: %w", info.Bits, text, err)
		}
		if strconv.FormatInt(n, 10) != text {
			return fmt.Errorf("integer %q is not canonical decimal", text)
		}
		if info.JSRepresentation == JSNumber && (n > maxSafeNumberInteger || n < -maxSafeNumberInteger) {
			return fmt.Errorf("integer %q is outside the safe Number range for type %q", text, info.ID)
		}
	} else {
		n, err := strconv.ParseUint(text, 10, int(info.Bits))
		if err != nil {
			return fmt.Errorf("invalid %d-bit unsigned integer %q: %w", info.Bits, text, err)
		}
		if strconv.FormatUint(n, 10) != text {
			return fmt.Errorf("integer %q is not canonical decimal", text)
		}
		if info.JSRepresentation == JSNumber && n > uint64(maxSafeNumberInteger) {
			return fmt.Errorf("integer %q is outside the safe Number range for type %q", text, info.ID)
		}
	}
	if info.JSRepresentation != JSNumber && info.JSRepresentation != JSBigInt {
		return fmt.Errorf("integer type %q has unsupported JavaScript representation %q", info.ID, info.JSRepresentation)
	}
	return nil
}

func validateFloatBits(text string) error {
	if len(text) != 16 || strings.ToLower(text) != text {
		return fmt.Errorf("float64Bits must be 16 lowercase hexadecimal digits")
	}
	raw, err := hex.DecodeString(text)
	if err != nil {
		return fmt.Errorf("invalid float64Bits: %w", err)
	}
	var bits uint64
	for _, b := range raw {
		bits = (bits << 8) | uint64(b)
	}
	f := math.Float64frombits(bits)
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return fmt.Errorf("non-finite float64 is unsupported")
	}
	return nil
}

func indexTypes(types []TypeInfo) (map[TypeID]TypeInfo, error) {
	index := make(map[TypeID]TypeInfo, len(types))
	for _, info := range types {
		if info.ID == "" {
			return nil, fmt.Errorf("typeId is empty")
		}
		if _, exists := index[info.ID]; exists {
			return nil, fmt.Errorf("duplicate typeId %q", info.ID)
		}
		index[info.ID] = info
	}
	for _, info := range types {
		switch info.Kind {
		case KindBool, KindString, KindFloat64:
			if info.Bits != 0 || info.ElemType != "" || info.Length != nil || len(info.Fields) != 0 {
				return nil, fmt.Errorf("type %q has fields unused by kind %q", info.ID, info.Kind)
			}
		case KindInt, KindUint:
			if info.Bits != 8 && info.Bits != 16 && info.Bits != 32 && info.Bits != 64 {
				return nil, fmt.Errorf("type %q has invalid integer bits %d", info.ID, info.Bits)
			}
			if info.ElemType != "" || info.Length != nil || len(info.Fields) != 0 {
				return nil, fmt.Errorf("integer type %q has unrelated metadata", info.ID)
			}
		case KindSlice, KindArray:
			if info.ElemType == "" {
				return nil, fmt.Errorf("type %q is missing elemType", info.ID)
			}
			if _, ok := index[info.ElemType]; !ok {
				return nil, fmt.Errorf("type %q refers to unknown element type %q", info.ID, info.ElemType)
			}
			if info.Kind == KindArray && (info.Length == nil || *info.Length < 0) {
				return nil, fmt.Errorf("array type %q has invalid length", info.ID)
			}
			if info.Kind == KindSlice && info.Length != nil {
				return nil, fmt.Errorf("slice type %q cannot declare length", info.ID)
			}
			if info.Bits != 0 || len(info.Fields) != 0 {
				return nil, fmt.Errorf("sequence type %q has unrelated metadata", info.ID)
			}
		case KindStruct:
			if info.Bits != 0 || info.ElemType != "" || info.Length != nil {
				return nil, fmt.Errorf("struct type %q has unrelated metadata", info.ID)
			}
			if len(info.Fields) == 0 {
				return nil, fmt.Errorf("empty structs are unsupported for type %q", info.ID)
			}
			seen := map[string]bool{}
			for _, field := range info.Fields {
				if field.Name == "" || seen[field.Name] {
					return nil, fmt.Errorf("struct type %q has empty or duplicate field %q", info.ID, field.Name)
				}
				seen[field.Name] = true
				if _, ok := index[field.Type]; !ok {
					return nil, fmt.Errorf("struct type %q field %q refers to unknown type %q", info.ID, field.Name, field.Type)
				}
			}
		default:
			return nil, fmt.Errorf("unsupported type kind %q for %q", info.Kind, info.ID)
		}
	}
	return index, nil
}
