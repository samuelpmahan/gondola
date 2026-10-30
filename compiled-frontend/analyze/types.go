package analyze

import (
	"fmt"
	"go/types"
	"strconv"

	"github.com/samuelpmahan/gondola/compilercontract"
)

type typeCollector struct {
	sizes types.Sizes
	infos map[compilercontract.TypeID]compilercontract.TypeInfo
	order []compilercontract.TypeID
}

func newTypeCollector() *typeCollector {
	return &typeCollector{sizes: types.SizesFor("gc", "amd64"), infos: make(map[compilercontract.TypeID]compilercontract.TypeInfo)}
}

func (c *typeCollector) id(t types.Type) (compilercontract.TypeID, error) {
	t = types.Unalias(t)
	switch typed := t.(type) {
	case *types.Basic:
		name := typed.Name()
		kind, bits, rep, ok := basicDescription(typed, c.sizes)
		if !ok {
			return "", fmt.Errorf("unsupported basic type %s", name)
		}
		id := compilercontract.TypeID(name)
		c.ensure(id, compilercontract.TypeInfo{ID: id, Kind: kind, Bits: bits, JSRepresentation: rep})
		return id, nil
	case *types.Named:
		object := typed.Obj()
		if object.Pkg() == nil {
			return c.id(typed.Underlying())
		}
		id := compilercontract.TypeID(object.Pkg().Path() + "." + object.Name())
		if _, exists := c.infos[id]; exists {
			return id, nil
		}
		c.ensure(id, compilercontract.TypeInfo{ID: id})
		kind, bits, rep, fields, elem, length, err := c.describe(typed.Underlying())
		if err != nil {
			delete(c.infos, id)
			if len(c.order) > 0 && c.order[len(c.order)-1] == id {
				c.order = c.order[:len(c.order)-1]
			}
			return "", fmt.Errorf("%s: %w", id, err)
		}
		info := compilercontract.TypeInfo{ID: id, Kind: kind, Bits: bits, JSRepresentation: rep, Fields: fields, ElemType: elem, Length: length}
		c.infos[id] = info
		return id, nil
	default:
		id, err := c.typeID(t)
		if err != nil {
			return "", err
		}
		if _, exists := c.infos[id]; exists {
			return id, nil
		}
		kind, bits, rep, fields, elem, length, err := c.describe(t)
		if err != nil {
			return "", err
		}
		c.ensure(id, compilercontract.TypeInfo{ID: id, Kind: kind, Bits: bits, JSRepresentation: rep, Fields: fields, ElemType: elem, Length: length})
		return id, nil
	}
}

func (c *typeCollector) ensure(id compilercontract.TypeID, info compilercontract.TypeInfo) {
	if _, exists := c.infos[id]; exists {
		return
	}
	c.infos[id] = info
	c.order = append(c.order, id)
}

func (c *typeCollector) typeID(t types.Type) (compilercontract.TypeID, error) {
	t = types.Unalias(t)
	switch typed := t.(type) {
	case *types.Basic:
		name := typed.Name()
		if name == "byte" {
			name = "uint8"
		}
		if name == "rune" {
			name = "int32"
		}
		return compilercontract.TypeID(name), nil
	case *types.Named:
		if typed.Obj().Pkg() == nil {
			return c.typeID(typed.Underlying())
		}
		return compilercontract.TypeID(typed.Obj().Pkg().Path() + "." + typed.Obj().Name()), nil
	case *types.Slice:
		elem, err := c.typeID(typed.Elem())
		return compilercontract.TypeID("[]" + string(elem)), err
	case *types.Array:
		elem, err := c.typeID(typed.Elem())
		return compilercontract.TypeID("[" + strconv.FormatInt(typed.Len(), 10) + "]" + string(elem)), err
	case *types.Struct:
		return "", fmt.Errorf("unnamed struct type is unsupported")
	case *types.Pointer:
		return "", fmt.Errorf("pointer type is unsupported")
	case *types.Map:
		return "", fmt.Errorf("map type is unsupported")
	case *types.Interface:
		return "", fmt.Errorf("interface type is unsupported")
	case *types.Signature:
		return "", fmt.Errorf("function value type is unsupported")
	case *types.Chan:
		return "", fmt.Errorf("channel type is unsupported")
	case *types.Tuple:
		return "", fmt.Errorf("tuple type is unsupported")
	default:
		return "", fmt.Errorf("unsupported Go type %T", t)
	}
}

func (c *typeCollector) describe(t types.Type) (compilercontract.TypeKind, uint8, compilercontract.JSRepresentation, []compilercontract.TypeField, compilercontract.TypeID, *int, error) {
	t = types.Unalias(t)
	switch typed := t.(type) {
	case *types.Basic:
		kind, bits, rep, ok := basicDescription(typed, c.sizes)
		if !ok {
			return "", 0, "", nil, "", nil, fmt.Errorf("unsupported basic type %s", typed.Name())
		}
		return kind, bits, rep, nil, "", nil, nil
	case *types.Struct:
		fields := make([]compilercontract.TypeField, 0, typed.NumFields())
		for i := 0; i < typed.NumFields(); i++ {
			field := typed.Field(i)
			if !field.Exported() {
				return "", 0, "", nil, "", nil, fmt.Errorf("unexported struct field %q is unsupported", field.Name())
			}
			fieldType, err := c.id(field.Type())
			if err != nil {
				return "", 0, "", nil, "", nil, fmt.Errorf("field %s: %w", field.Name(), err)
			}
			fields = append(fields, compilercontract.TypeField{Name: field.Name(), Type: fieldType})
		}
		return compilercontract.KindStruct, 0, compilercontract.JSClass, fields, "", nil, nil
	case *types.Slice:
		elem, err := c.id(typed.Elem())
		if err != nil {
			return "", 0, "", nil, "", nil, err
		}
		elemInfo := c.infos[elem]
		rep := compilercontract.JSArrayOrSlice
		if elemInfo.Kind == compilercontract.KindFloat64 {
			rep = compilercontract.JSFloat64ArrayOrSlice
		}
		if elem == compilercontract.TypeID("github.com/samuelpmahan/gondola/gobi.Attr") || elem == compilercontract.TypeID("github.com/samuelpmahan/gondola/gobi.On") {
			rep = compilercontract.JSSliceWrapper
		}
		return compilercontract.KindSlice, 0, rep, nil, elem, nil, nil
	case *types.Array:
		elem, err := c.id(typed.Elem())
		if err != nil {
			return "", 0, "", nil, "", nil, err
		}
		length := int(typed.Len())
		if int64(length) != typed.Len() {
			return "", 0, "", nil, "", nil, fmt.Errorf("array length exceeds host int range")
		}
		return compilercontract.KindArray, 0, compilercontract.JSArray, nil, elem, &length, nil
	default:
		return "", 0, "", nil, "", nil, fmt.Errorf("unsupported Go type %T", t)
	}
}

func basicDescription(value *types.Basic, sizes types.Sizes) (compilercontract.TypeKind, uint8, compilercontract.JSRepresentation, bool) {
	switch value.Kind() {
	case types.Bool:
		return compilercontract.KindBool, 0, compilercontract.JSDirect, true
	case types.String:
		return compilercontract.KindString, 0, compilercontract.JSDirect, true
	case types.Int, types.Int8, types.Int16, types.Int32, types.Int64:
		bits := uint8(sizes.Sizeof(value) * 8)
		rep := compilercontract.JSNumber
		if value.Kind() == types.Int64 {
			rep = compilercontract.JSBigInt
		}
		return compilercontract.KindInt, bits, rep, true
	case types.Uint, types.Uint8, types.Uint16, types.Uint32, types.Uint64:
		bits := uint8(sizes.Sizeof(value) * 8)
		rep := compilercontract.JSNumber
		if value.Kind() == types.Uint64 {
			rep = compilercontract.JSBigInt
		}
		return compilercontract.KindUint, bits, rep, true
	case types.Float64:
		return compilercontract.KindFloat64, 0, compilercontract.JSNumber, true
	default:
		return "", 0, "", false
	}
}

func (c *typeCollector) list() []compilercontract.TypeInfo {
	result := make([]compilercontract.TypeInfo, 0, len(c.order))
	for _, id := range c.order {
		result = append(result, c.infos[id])
	}
	return result
}
