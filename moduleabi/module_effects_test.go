package moduleabi

import (
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
)

const effectsChildPackage = "github.com/samuelpmahan/gondola/fixtures/compiled/effectmodulechild"

func TestDescribeAcceptsDeclaredChildEffectsAndPreservesCanonicalChecks(t *testing.T) {
	appIR := testAppIR(effectsChildPackage, false)
	appIR.Components[0].Capabilities = append(appIR.Components[0].Capabilities,
		compilercontract.CapabilityEffectRequest,
		compilercontract.CapabilityEffectCancel,
	)
	descriptor, err := Describe(appIR, testArtifacts(t, appIR, "effectmodulechild"))
	if err != nil {
		t.Fatalf("closed effect capability pair rejected: %v", err)
	}
	want := []compilercontract.Capability{
		compilercontract.CapabilityEffectCancel,
		compilercontract.CapabilityEffectRequest,
		compilercontract.CapabilityViewNode,
	}
	if len(descriptor.Capabilities) != len(want) {
		t.Fatalf("capabilities = %v, want %v", descriptor.Capabilities, want)
	}
	for index := range want {
		if descriptor.Capabilities[index] != want[index] {
			t.Fatalf("capabilities = %v, want %v", descriptor.Capabilities, want)
		}
	}
	if err := ValidateDescriptor(descriptor); err != nil {
		t.Fatalf("closed effect descriptor rejected after validation: %v", err)
	}

	alternateIR := testAppIR("example.test/alternate/effect-child", false)
	alternateIR.Components[0].Capabilities = append(alternateIR.Components[0].Capabilities,
		compilercontract.CapabilityEffectRequest,
		compilercontract.CapabilityEffectCancel,
	)
	if _, err := Describe(alternateIR, testArtifacts(t, alternateIR, "alternateeffectchild")); err != nil {
		t.Fatalf("known effect capabilities rejected on a different typed child package: %v", err)
	}

	unknown := cloneAppIR(t, appIR)
	unknown.Components[0].Capabilities = append(unknown.Components[0].Capabilities, "capability.unknown")
	if _, err := Describe(unknown, testArtifacts(t, unknown, "effectmodulechild")); err == nil {
		t.Fatal("unknown capability was accepted")
	}

	duplicate := cloneDescriptor(t, descriptor)
	duplicate.Capabilities = append(duplicate.Capabilities, compilercontract.CapabilityEffectRequest)
	sortCapabilities(duplicate.Capabilities)
	rehash(&duplicate)
	if err := ValidateDescriptor(duplicate); err == nil || !strings.Contains(err.Error(), "duplicate capability") {
		t.Fatalf("duplicate effect capability was not rejected precisely: %v", err)
	}

	unsorted := cloneDescriptor(t, descriptor)
	unsorted.Capabilities[0], unsorted.Capabilities[1] = unsorted.Capabilities[1], unsorted.Capabilities[0]
	rehash(&unsorted)
	if err := ValidateDescriptor(unsorted); err == nil || !strings.Contains(err.Error(), "unique and sorted") {
		t.Fatalf("unsorted effect capabilities were not rejected: %v", err)
	}
}
