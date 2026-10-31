package moduleabi

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
)

const (
	testParentPackage = "github.com/samuelpmahan/gondola/fixtures/compiled/moduleparent"
	testChildPackage  = "github.com/samuelpmahan/gondola/fixtures/compiled/modulechild"
	testMessageID     = compilercontract.TypeID("github.com/samuelpmahan/gondola/gobi.Message")
	testEffectID      = compilercontract.TypeID("github.com/samuelpmahan/gondola/gobi.Effect")
	testEffectsID     = compilercontract.TypeID("[]github.com/samuelpmahan/gondola/gobi.Effect")
	testNodeID        = compilercontract.TypeID("github.com/samuelpmahan/gondola/gobi.Node")
)

func TestDescribeAndValidateIndependentPair(t *testing.T) {
	parentIR := testAppIR(testParentPackage, true)
	childIR := testAppIR(testChildPackage, false)
	parent, err := Describe(parentIR, testArtifacts(t, parentIR, "moduleparent"))
	if err != nil {
		t.Fatal(err)
	}
	child, err := Describe(childIR, testArtifacts(t, childIR, "modulechild"))
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidatePair(parent, child); err != nil {
		t.Fatalf("valid pair rejected: %v", err)
	}
	encoded, err := MarshalDescriptor(parent)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := DecodeDescriptorJSON(encoded)
	if err != nil {
		t.Fatalf("round-tripped descriptor rejected: %v", err)
	}
	if decoded.ABISHA256 != parent.ABISHA256 || decoded.ArtifactSHA256 != parent.ArtifactSHA256 {
		t.Fatalf("descriptor digests changed on round trip: %#v", decoded)
	}
}

func TestDescribeBindsSourceAppIRAndExactArtifactInventory(t *testing.T) {
	ir := testAppIR(testParentPackage, true)
	files := testArtifacts(t, ir, "moduleparent")
	if _, err := Describe(ir, files); err != nil {
		t.Fatal(err)
	}
	mutatedAppIR := cloneAppIR(t, ir)
	mutatedAppIR.Components[0].Capabilities = []compilercontract.Capability{compilercontract.CapabilityViewNode, compilercontract.CapabilityFloat64}
	if _, err := Describe(mutatedAppIR, files); err == nil || !strings.Contains(err.Error(), "app-ir.json bytes") {
		t.Fatalf("AppIR/file mismatch was not rejected: %v", err)
	}
	missing := cloneFiles(files)
	delete(missing, "apps/moduleparent/encoder.mjs")
	if _, err := Describe(ir, missing); err == nil || !strings.Contains(err.Error(), "exactly four") {
		t.Fatalf("missing artifact was not rejected: %v", err)
	}
	extra := cloneFiles(files)
	extra["apps/moduleparent/extra.mjs"] = []byte("extra")
	if _, err := Describe(ir, extra); err == nil || !strings.Contains(err.Error(), "exactly four") {
		t.Fatalf("extra artifact was not rejected: %v", err)
	}
	descriptor, err := Describe(ir, files)
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateArtifactBytes(descriptor, files); err != nil {
		t.Fatal(err)
	}
	changed := cloneFiles(files)
	changed["apps/moduleparent/gobi-compiled.mjs"] = []byte("different compiled module")
	if err := ValidateArtifactBytes(descriptor, changed); err == nil {
		t.Fatal("changed module artifact was accepted")
	}
}

func TestPairRejectsNominalFieldOrderAndRoleMismatches(t *testing.T) {
	parent, child := testPair(t)

	changedOrder := cloneDescriptor(t, child)
	publication := findType(&changedOrder, PublicationID)
	publication.Fields[0], publication.Fields[1] = publication.Fields[1], publication.Fields[0]
	rehash(&changedOrder)
	if err := ValidatePair(parent, changedOrder); err == nil {
		t.Fatal("reordered Publication fields were accepted")
	}

	changedName := cloneDescriptor(t, child)
	input := findType(&changedName, InputTypeID)
	input.Fields[0].Name = "Amount"
	rehash(&changedName)
	if err := ValidatePair(parent, changedName); err == nil {
		t.Fatal("renamed Input field was accepted")
	}

	changedType := cloneDescriptor(t, child)
	input = findType(&changedType, InputTypeID)
	input.Fields[0].Type = "float64"
	rehash(&changedType)
	if err := ValidatePair(parent, changedType); err == nil {
		t.Fatal("Input int/float64 substitution was accepted")
	}

	wrongPort := cloneDescriptor(t, child)
	for index := range wrongPort.Roles {
		if wrongPort.Roles[index].Name == "Publication" {
			wrongPort.Roles[index].Signature.Results[0] = InputTypeID
		}
	}
	rehash(&wrongPort)
	if err := ValidatePair(parent, wrongPort); err == nil {
		t.Fatal("reversed Publication/Input bridge type was accepted")
	}
	if err := ValidatePair(child, parent); err == nil {
		t.Fatal("reversed parent/child pair was accepted")
	}
}

func TestDescriptorRejectsUnsupportedCapabilitiesAndStaleDigest(t *testing.T) {
	parent, _ := testPair(t)
	unknownCapability := cloneDescriptor(t, parent)
	unknownCapability.Capabilities = append(unknownCapability.Capabilities, "capability.unknown")
	sortCapabilities(unknownCapability.Capabilities)
	rehash(&unknownCapability)
	if err := ValidateDescriptor(unknownCapability); err == nil {
		t.Fatal("unknown capability was accepted")
	}
	effectCapability := cloneDescriptor(t, parent)
	effectCapability.Capabilities = append(effectCapability.Capabilities, compilercontract.CapabilityEffectRequest)
	sortCapabilities(effectCapability.Capabilities)
	rehash(&effectCapability)
	if err := ValidateDescriptor(effectCapability); err == nil {
		t.Fatal("effectful module capability was accepted")
	}
	stale := cloneDescriptor(t, parent)
	stale.Roles[0].Symbol += ".tampered"
	if err := ValidateDescriptor(stale); err == nil {
		t.Fatal("descriptor with stale ABI digest was accepted")
	}
}

func TestDescriptorRejectsUnsafeJSONIntegerMetadataAfterRehash(t *testing.T) {
	parent, _ := testPair(t)
	unsafeSize := cloneDescriptor(t, parent)
	unsafeSize.Artifacts[0].Bytes = maxSafeJSONInteger + 1
	rehash(&unsafeSize)
	if err := ValidateDescriptor(unsafeSize); err == nil {
		t.Fatal("fully rehashed artifact byte count above JavaScript's safe integer range was accepted")
	}
}

func TestDecodeDescriptorRejectsMalformedClosedJSON(t *testing.T) {
	parent, _ := testPair(t)
	encoded, err := MarshalDescriptor(parent)
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name string
		data []byte
	}{
		{name: "duplicate key", data: bytes.Replace(encoded, []byte(`"schema":"gobi.module-abi/v1"`), []byte(`"schema":"gobi.module-abi/v1","schema":"gobi.module-abi/v1"`), 1)},
		{name: "trailing value", data: append(append([]byte(nil), encoded...), []byte(` {}`)...)},
		{name: "invalid JSON", data: []byte(`{"schema":`)},
		{name: "invalid UTF-8", data: append(append([]byte(nil), encoded...), 0xff)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := DecodeDescriptorJSON(test.data); err == nil {
				t.Fatal("malformed descriptor was accepted")
			}
		})
	}
	for _, alias := range []string{"Schema", "ArtifactSHA256"} {
		t.Run("rehashed alias "+alias, func(t *testing.T) {
			aliased := rehashedAliasJSON(t, encoded, alias)
			if _, err := DecodeDescriptorJSON(aliased); err == nil {
				t.Fatalf("case alias %q was accepted after digest recomputation", alias)
			}
		})
	}
	for _, missing := range []string{"roles", "types", "artifacts", "capabilities"} {
		t.Run("missing "+missing, func(t *testing.T) {
			missingJSON := rehashedFieldChange(t, encoded, func(value map[string]any) { delete(value, missing) })
			if _, err := DecodeDescriptorJSON(missingJSON); err == nil {
				t.Fatalf("missing required field %q was accepted", missing)
			}
		})
	}
	unknown := rehashedFieldChange(t, encoded, func(value map[string]any) { value["opaque"] = "ignored?" })
	if _, err := DecodeDescriptorJSON(unknown); err == nil {
		t.Fatal("unknown descriptor property was accepted")
	}
}

func testPair(t *testing.T) (Descriptor, Descriptor) {
	t.Helper()
	parentIR := testAppIR(testParentPackage, true)
	childIR := testAppIR(testChildPackage, false)
	parent, err := Describe(parentIR, testArtifacts(t, parentIR, "moduleparent"))
	if err != nil {
		t.Fatal(err)
	}
	child, err := Describe(childIR, testArtifacts(t, childIR, "modulechild"))
	if err != nil {
		t.Fatal(err)
	}
	return parent, child
}

func testAppIR(packagePath string, parent bool) compilercontract.AppIR {
	stateID := compilercontract.TypeID(packagePath + ".State")
	stateFields := []compilercontract.TypeField{{Name: "Revision", Type: "int"}, {Name: "Locked", Type: "bool"}, {Name: "Count", Type: "float64"}}
	if parent {
		stateFields = append(stateFields, compilercontract.TypeField{Name: "PublishedRevision", Type: "int"})
	}
	types := []compilercontract.TypeInfo{
		{ID: "bool", Kind: compilercontract.KindBool, JSRepresentation: compilercontract.JSDirect},
		{ID: "float64", Kind: compilercontract.KindFloat64, JSRepresentation: compilercontract.JSNumber},
		{ID: "int", Kind: compilercontract.KindInt, Bits: 64, JSRepresentation: compilercontract.JSNumber},
		{ID: "string", Kind: compilercontract.KindString, JSRepresentation: compilercontract.JSDirect},
		{ID: stateID, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: stateFields},
		{ID: testMessageID, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Name", Type: "string"}, {Name: "Arg", Type: "string"}}},
		{ID: testEffectID, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Kind", Type: "string"}, {Name: "Name", Type: "string"}, {Name: "Arg", Type: "string"}, {Name: "Reply", Type: "string"}}},
		{ID: testEffectsID, Kind: compilercontract.KindSlice, ElemType: testEffectID, JSRepresentation: compilercontract.JSArrayOrSlice},
		{ID: testNodeID, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Tag", Type: "string"}}},
		{ID: InputTypeID, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Step", Type: "int"}, {Name: "Locked", Type: "bool"}, {Name: "Revision", Type: "int"}}},
		{ID: PublicationID, Kind: compilercontract.KindStruct, JSRepresentation: compilercontract.JSClass, Fields: []compilercontract.TypeField{{Name: "Count", Type: "float64"}, {Name: "Revision", Type: "int"}}},
	}
	roleSpecs := []struct {
		name string
		sig  compilercontract.Signature
	}{
		{name: "Init", sig: compilercontract.Signature{Params: []compilercontract.TypeID{}, Results: []compilercontract.TypeID{stateID}}},
		{name: "Update", sig: compilercontract.Signature{Params: []compilercontract.TypeID{stateID, testMessageID}, Results: []compilercontract.TypeID{stateID, testEffectsID}}},
		{name: "View", sig: compilercontract.Signature{Params: []compilercontract.TypeID{stateID}, Results: []compilercontract.TypeID{testNodeID}}},
	}
	if parent {
		roleSpecs = append(roleSpecs,
			struct {
				name string
				sig  compilercontract.Signature
			}{name: "Output", sig: compilercontract.Signature{Params: []compilercontract.TypeID{stateID}, Results: []compilercontract.TypeID{InputTypeID}}},
			struct {
				name string
				sig  compilercontract.Signature
			}{name: "Receive", sig: compilercontract.Signature{Params: []compilercontract.TypeID{stateID, PublicationID}, Results: []compilercontract.TypeID{stateID}}},
		)
	} else {
		roleSpecs = append(roleSpecs,
			struct {
				name string
				sig  compilercontract.Signature
			}{name: "Input", sig: compilercontract.Signature{Params: []compilercontract.TypeID{stateID, InputTypeID}, Results: []compilercontract.TypeID{stateID}}},
			struct {
				name string
				sig  compilercontract.Signature
			}{name: "Publication", sig: compilercontract.Signature{Params: []compilercontract.TypeID{stateID}, Results: []compilercontract.TypeID{PublicationID}}},
		)
	}
	roles := make([]compilercontract.Symbol, 0, len(roleSpecs))
	for _, spec := range roleSpecs {
		roles = append(roles, compilercontract.Symbol{
			ID: compilercontract.SymbolID(packagePath + "." + spec.name), PackagePath: packagePath,
			Name: spec.name, Signature: spec.sig, Span: compilercontract.Span{File: "app.go"}, Calls: []compilercontract.SymbolID{},
		})
	}
	component := compilercontract.Component{
		ID: packagePath, PackagePath: packagePath, StateType: stateID, MessageType: testMessageID,
		Init: compilercontract.SymbolID(packagePath + ".Init"), Update: compilercontract.SymbolID(packagePath + ".Update"), View: compilercontract.SymbolID(packagePath + ".View"),
		Capabilities: []compilercontract.Capability{compilercontract.CapabilityViewNode},
	}
	return compilercontract.AppIR{Schema: compilercontract.AppIRSchema, PackagePath: packagePath, Components: []compilercontract.Component{component}, Symbols: roles, Types: types}
}

func testArtifacts(t *testing.T, appIR compilercontract.AppIR, appDir string) map[string][]byte {
	t.Helper()
	appIRBytes, err := json.Marshal(appIR)
	if err != nil {
		t.Fatal(err)
	}
	return map[string][]byte{
		"apps/" + appDir + "/app-ir.json":        appIRBytes,
		"apps/" + appDir + "/gobi-compiled.mjs":  []byte("export const gobiCompiled = {}"),
		"apps/" + appDir + "/encoder.mjs":        []byte("export const encoder = {}"),
		"apps/" + appDir + "/components.gen.mjs": []byte("export const components = {}"),
	}
}

func cloneAppIR(t *testing.T, appIR compilercontract.AppIR) compilercontract.AppIR {
	t.Helper()
	data, err := json.Marshal(appIR)
	if err != nil {
		t.Fatal(err)
	}
	var out compilercontract.AppIR
	if err := json.Unmarshal(data, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func cloneFiles(files map[string][]byte) map[string][]byte {
	out := make(map[string][]byte, len(files))
	for name, content := range files {
		out[name] = append([]byte(nil), content...)
	}
	return out
}

func cloneDescriptor(t *testing.T, descriptor Descriptor) Descriptor {
	t.Helper()
	data, err := json.Marshal(descriptor)
	if err != nil {
		t.Fatal(err)
	}
	var out Descriptor
	if err := json.Unmarshal(data, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func findType(descriptor *Descriptor, id compilercontract.TypeID) *compilercontract.TypeInfo {
	for index := range descriptor.Types {
		if descriptor.Types[index].ID == id {
			return &descriptor.Types[index]
		}
	}
	panic("test type not found: " + id)
}

func rehash(descriptor *Descriptor) {
	artifactHash, err := digestJSON(descriptor.Artifacts)
	if err != nil {
		panic(err)
	}
	descriptor.ArtifactSHA256 = artifactHash
	descriptor.ABISHA256, err = descriptorDigest(*descriptor)
	if err != nil {
		panic(err)
	}
}

func sortCapabilities(values []compilercontract.Capability) {
	for i := 0; i < len(values); i++ {
		for j := i + 1; j < len(values); j++ {
			if values[j] < values[i] {
				values[i], values[j] = values[j], values[i]
			}
		}
	}
}

func rehashedAliasJSON(t *testing.T, original []byte, alias string) []byte {
	return rehashedFieldChange(t, original, func(value map[string]any) {
		lowerCamel := strings.ToLower(alias[:1]) + alias[1:]
		value[alias] = value[lowerCamel]
	})
}

func rehashedFieldChange(t *testing.T, original []byte, change func(map[string]any)) []byte {
	t.Helper()
	var value map[string]any
	decoder := json.NewDecoder(bytes.NewReader(original))
	decoder.UseNumber()
	if err := decoder.Decode(&value); err != nil {
		t.Fatal(err)
	}
	delete(value, "abiSHA256")
	change(value)
	canonical, err := canonicalJSON(value)
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(canonical)
	value["abiSHA256"] = hex.EncodeToString(hash[:])
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}
