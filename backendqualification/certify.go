package backendqualification

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
)

const (
	runSchema         = "gobi.backend-qualification-run/v1"
	evidenceSchema    = "gobi.backend-qualification-case-evidence/v1"
	certificateSchema = "gobi.backend-qualification-certificate/v1"
)

var commitPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)
var hashPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

// Certificate is emitted only after every registry case and its referenced
// evidence have passed validation. No status is accepted from the input run.
type Certificate struct {
	Schema       string              `json:"schema"`
	SourceCommit string              `json:"sourceCommit"`
	Qualified    bool                `json:"qualified"`
	Results      []CertificateResult `json:"results"`
}

// CertificateResult contains the measured raw result plus Go-derived policy.
type CertificateResult struct {
	ID                   string          `json:"id"`
	Backend              string          `json:"backend"`
	Fault                string          `json:"fault"`
	ExpectedChannels     []string        `json:"expectedChannels"`
	AllowedChannels      []string        `json:"allowedChannels"`
	ChannelRule          string          `json:"channelRule"`
	ObservedChannels     []string        `json:"observedChannels"`
	Activated            bool            `json:"activated"`
	ActivationCount      int             `json:"activationCount"`
	ActivationEventIndex *int            `json:"activationEventIndex"`
	ActivationTargetPath *string         `json:"activationTargetPath"`
	ProbeException       json.RawMessage `json:"probeException"`
	InfrastructureErrors []string        `json:"infrastructureErrors"`
	PageErrors           []string        `json:"pageErrors"`
	EventsObserved       int             `json:"eventsObserved"`
	TraceTicks           int             `json:"traceTicks"`
	EvidencePath         string          `json:"evidencePath"`
	EvidenceSHA256       string          `json:"evidenceSHA256"`
	Passed               bool            `json:"passed"`
}

type inputRun struct {
	Schema       *string        `json:"schema"`
	SourceCommit *string        `json:"sourceCommit"`
	Results      *[]inputResult `json:"results"`
}

type inputResult struct {
	ID                   *string         `json:"id"`
	Backend              *string         `json:"backend"`
	Fault                *string         `json:"fault"`
	Activated            *bool           `json:"activated"`
	ActivationCount      *int            `json:"activationCount"`
	ObservedChannels     *[]string       `json:"observedChannels"`
	ProbeException       json.RawMessage `json:"probeException"`
	InfrastructureErrors *[]string       `json:"infrastructureErrors"`
	PageErrors           *[]string       `json:"pageErrors"`
	EventsObserved       *int            `json:"eventsObserved"`
	TraceTicks           *int            `json:"traceTicks"`
	EvidencePath         *string         `json:"evidencePath"`
	EvidenceSHA256       *string         `json:"evidenceSHA256"`
}

type caseEvidence struct {
	Schema               *string               `json:"schema"`
	ID                   *string               `json:"id"`
	Backend              *string               `json:"backend"`
	Fault                *string               `json:"fault"`
	Activated            *bool                 `json:"activated"`
	ActivationCount      *int                  `json:"activationCount"`
	Activation           json.RawMessage       `json:"activation"`
	Expected             *expectedEvidence     `json:"expected"`
	Observed             *observedEvidence     `json:"observed"`
	ChannelComparisons   map[string]comparison `json:"channelComparisons"`
	ObservedChannels     *[]string             `json:"observedChannels"`
	DerivedChannels      *[]string             `json:"derivedChannels"`
	ProbeException       json.RawMessage       `json:"probeException"`
	InfrastructureErrors *[]string             `json:"infrastructureErrors"`
	PageErrors           *[]string             `json:"pageErrors"`
	EventsObserved       *int                  `json:"eventsObserved"`
	TraceTicks           *int                  `json:"traceTicks"`
	Baseline             json.RawMessage       `json:"baseline"`
	PolicyPassed         json.RawMessage       `json:"policyPassed"`
	BaselineCheck        json.RawMessage       `json:"baselineCheck"`
	BrowserVersion       json.RawMessage       `json:"browserVersion"`
	Profile              json.RawMessage       `json:"profile"`
}

type activationEvidence struct {
	Activated           *bool              `json:"activated"`
	ActivationCount     *int               `json:"activationCount"`
	EventIndex          json.RawMessage    `json:"eventIndex"`
	TargetPath          json.RawMessage    `json:"targetPath"`
	Records             *[]json.RawMessage `json:"records"`
	CallbackInvocations json.RawMessage    `json:"callbackInvocations"`
}

type activationRecord struct {
	Fault                     *string           `json:"fault"`
	Backend                   *string           `json:"backend"`
	EventIndex                json.RawMessage   `json:"eventIndex"`
	Target                    *activationTarget `json:"target"`
	CallbackInvocationsBefore json.RawMessage   `json:"callbackInvocationsBefore"`
	CallbackInvocationsAfter  json.RawMessage   `json:"callbackInvocationsAfter"`
}

type activationTarget struct {
	Path      *string         `json:"path"`
	Tag       json.RawMessage `json:"tag"`
	Connected json.RawMessage `json:"connected"`
	Disabled  json.RawMessage `json:"disabled"`
	Text      json.RawMessage `json:"text"`
	OuterHTML json.RawMessage `json:"outerHTML"`
	Before    json.RawMessage `json:"before"`
	After     json.RawMessage `json:"after"`
}

type expectedEvidence struct {
	StateIndex         *int            `json:"stateIndex"`
	State              json.RawMessage `json:"state"`
	DOM                json.RawMessage `json:"dom"`
	Disabled           *disabledValue  `json:"disabled"`
	DispatchCount      *int            `json:"dispatchCount"`
	DispatchCountDelta *int            `json:"dispatchCountDelta"`
	TraceTicks         *int            `json:"traceTicks"`
	EventsObserved     *int            `json:"eventsObserved"`
}

type disabledValue struct {
	Path  *string `json:"path"`
	Value *bool   `json:"value"`
}

type observedEvidence struct {
	State               json.RawMessage `json:"state"`
	DOM                 json.RawMessage `json:"dom"`
	CallbackCounts      *callbackCounts `json:"callbackCounts"`
	EventsObserved      *int            `json:"eventsObserved"`
	TraceTicks          *int            `json:"traceTicks"`
	View                json.RawMessage `json:"view"`
	Trace               json.RawMessage `json:"trace"`
	RendererDOM         json.RawMessage `json:"rendererDOM"`
	CallbackInvocations json.RawMessage `json:"callbackInvocations"`
	Effects             json.RawMessage `json:"effects"`
}

type callbackCounts struct {
	Dispatch *int            `json:"dispatch"`
	Stale    json.RawMessage `json:"stale"`
}

type domSnapshot struct {
	Normalization json.RawMessage `json:"normalization"`
	HTML          *string         `json:"html"`
	Controls      []domControl    `json:"controls"`
}

type domControl struct {
	Path      *string         `json:"path"`
	Key       json.RawMessage `json:"key"`
	Tag       json.RawMessage `json:"tag"`
	Type      json.RawMessage `json:"type"`
	Value     json.RawMessage `json:"value"`
	Checked   json.RawMessage `json:"checked"`
	Disabled  *bool           `json:"disabled"`
	Text      json.RawMessage `json:"text"`
	OuterHTML json.RawMessage `json:"outerHTML"`
}

type comparison struct {
	Expected json.RawMessage `json:"expected"`
	Observed json.RawMessage `json:"observed"`
}

type disabledProjection struct {
	Path     string `json:"path"`
	Disabled bool   `json:"disabled"`
}

// CertifyFile validates a raw run and every byte-hashed case evidence file.
// It returns no certificate unless all 13 cases meet the Go-owned registry.
func CertifyFile(inputPath string) (Certificate, error) {
	if strings.TrimSpace(inputPath) == "" {
		return Certificate{}, errors.New("input path is required")
	}
	absoluteInput, err := filepath.Abs(inputPath)
	if err != nil {
		return Certificate{}, fmt.Errorf("resolve input path: %w", err)
	}
	inputBytes, err := os.ReadFile(absoluteInput)
	if err != nil {
		return Certificate{}, fmt.Errorf("read run report: %w", err)
	}
	var run inputRun
	if err := decodeStrict(inputBytes, &run); err != nil {
		return Certificate{}, fmt.Errorf("decode run report: %w", err)
	}
	if run.Schema == nil || *run.Schema != runSchema {
		return Certificate{}, fmt.Errorf("run schema must be %q", runSchema)
	}
	if run.SourceCommit == nil || !commitPattern.MatchString(*run.SourceCommit) {
		return Certificate{}, errors.New("sourceCommit must be a 40-character lowercase hexadecimal commit")
	}
	if run.Results == nil || len(*run.Results) != len(qualificationRegistry()) {
		return Certificate{}, fmt.Errorf("run must contain exactly %d registry cases", len(qualificationRegistry()))
	}

	registry := qualificationRegistry()
	known := make(map[string]registryCase, len(registry))
	for _, spec := range registry {
		known[spec.id] = spec
	}
	rows := make(map[string]inputResult, len(registry))
	for index, row := range *run.Results {
		label := fmt.Sprintf("results[%d]", index)
		if err := validateInputRowRequired(row); err != nil {
			return Certificate{}, fmt.Errorf("%s: %w", label, err)
		}
		if _, exists := known[*row.ID]; !exists {
			return Certificate{}, fmt.Errorf("%s has unknown case ID %q", label, *row.ID)
		}
		if _, exists := rows[*row.ID]; exists {
			return Certificate{}, fmt.Errorf("case %q is duplicated", *row.ID)
		}
		rows[*row.ID] = row
	}
	if len(rows) != len(registry) {
		return Certificate{}, errors.New("run is missing one or more registry cases")
	}

	certificate := Certificate{
		Schema:       certificateSchema,
		SourceCommit: *run.SourceCommit,
		Qualified:    true,
		Results:      make([]CertificateResult, 0, len(registry)),
	}
	evidenceRoot := filepath.Dir(absoluteInput)
	for _, spec := range registry {
		row := rows[spec.id]
		result, err := certifyCase(evidenceRoot, spec, row)
		if err != nil {
			return Certificate{}, fmt.Errorf("case %s: %w", spec.id, err)
		}
		certificate.Results = append(certificate.Results, result)
	}
	return certificate, nil
}

// WriteCertificate atomically writes a validated certificate as JSON.
func WriteCertificate(outputPath string, certificate Certificate) error {
	if strings.TrimSpace(outputPath) == "" {
		return errors.New("output path is required")
	}
	if certificate.Schema != certificateSchema || !certificate.Qualified || len(certificate.Results) != 13 {
		return errors.New("refusing to write an incomplete backend qualification certificate")
	}
	data, err := json.MarshalIndent(certificate, "", "  ")
	if err != nil {
		return fmt.Errorf("encode certificate: %w", err)
	}
	data = append(data, '\n')
	absoluteOutput, err := filepath.Abs(outputPath)
	if err != nil {
		return fmt.Errorf("resolve output path: %w", err)
	}
	dir := filepath.Dir(absoluteOutput)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create output directory: %w", err)
	}
	tmp, err := os.CreateTemp(dir, ".backend-qualification-*.tmp")
	if err != nil {
		return fmt.Errorf("create certificate temp file: %w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("write certificate temp file: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("sync certificate temp file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close certificate temp file: %w", err)
	}
	if err := os.Rename(tmpName, absoluteOutput); err != nil {
		return fmt.Errorf("publish certificate: %w", err)
	}
	return nil
}

func certifyCase(evidenceRoot string, spec registryCase, row inputResult) (CertificateResult, error) {
	if *row.Backend != spec.backend || *row.Fault != spec.fault {
		return CertificateResult{}, fmt.Errorf("backend/fault pair %q/%q does not match registry %q/%q", *row.Backend, *row.Fault, spec.backend, spec.fault)
	}
	if len(row.ProbeException) == 0 {
		return CertificateResult{}, errors.New("probeException field is required (use null when absent)")
	}
	if row.InfrastructureErrors == nil || row.PageErrors == nil || row.ObservedChannels == nil {
		return CertificateResult{}, errors.New("infrastructureErrors, pageErrors, and observedChannels are required")
	}
	if len(*row.InfrastructureErrors) != 0 {
		return CertificateResult{}, fmt.Errorf("infrastructureErrors disqualify case: %s", strings.Join(*row.InfrastructureErrors, "; "))
	}
	if len(*row.PageErrors) != 0 {
		return CertificateResult{}, fmt.Errorf("pageErrors disqualify case: %s", strings.Join(*row.PageErrors, "; "))
	}
	if *row.EventsObserved < 0 || *row.EventsObserved > 50 {
		return CertificateResult{}, errors.New("eventsObserved must be between 0 and 50")
	}
	if *row.TraceTicks < 1 || *row.TraceTicks > 46 {
		return CertificateResult{}, errors.New("traceTicks must be between 1 and 46, including the initial checkpoint")
	}
	if spec.fault == "none" {
		if *row.Activated || *row.ActivationCount != 0 {
			return CertificateResult{}, errors.New("healthy case must remain unactivated with activationCount 0")
		}
		if *row.EventsObserved != 50 || *row.TraceTicks != 46 {
			return CertificateResult{}, errors.New("healthy case requires 50 eventsObserved and 46 traceTicks")
		}
		if !isNull(row.ProbeException) {
			return CertificateResult{}, errors.New("healthy case cannot have a probeException")
		}
	} else {
		if !*row.Activated || *row.ActivationCount != 1 {
			return CertificateResult{}, errors.New("fault case must activate exactly once")
		}
		if spec.activationEvent != nil && *row.EventsObserved < *spec.activationEvent+1 {
			return CertificateResult{}, errors.New("click fault must observe its activation event")
		}
	}
	if *row.EvidencePath == "" || !hashPattern.MatchString(*row.EvidenceSHA256) {
		return CertificateResult{}, errors.New("evidencePath and lowercase 64-character evidenceSHA256 are required")
	}
	evidencePath, err := resolveEvidencePath(evidenceRoot, *row.EvidencePath)
	if err != nil {
		return CertificateResult{}, err
	}
	evidenceBytes, err := os.ReadFile(evidencePath)
	if err != nil {
		return CertificateResult{}, fmt.Errorf("read evidence file: %w", err)
	}
	digest := sha256.Sum256(evidenceBytes)
	actualHash := hex.EncodeToString(digest[:])
	if actualHash != *row.EvidenceSHA256 {
		return CertificateResult{}, fmt.Errorf("evidence SHA-256 mismatch: report has %s, file has %s", *row.EvidenceSHA256, actualHash)
	}
	var evidence caseEvidence
	if err := decodeStrict(evidenceBytes, &evidence); err != nil {
		return CertificateResult{}, fmt.Errorf("decode evidence file: %w", err)
	}
	channels, activation, err := validateEvidence(spec, row, evidence)
	if err != nil {
		return CertificateResult{}, err
	}

	if err := validateChannelList(*row.ObservedChannels, channels); err != nil {
		return CertificateResult{}, fmt.Errorf("raw observedChannels: %w", err)
	}
	if spec.fault == "none" {
		if len(channels) != 0 {
			return CertificateResult{}, fmt.Errorf("healthy case has unexpected semantic channels %v", channels)
		}
	} else {
		for _, channel := range channels {
			if !contains(spec.allowedChannels, channel) {
				return CertificateResult{}, fmt.Errorf("observed channel %q is not allowed for %s", channel, spec.id)
			}
		}
		if !satisfiesRequired(spec.channelRule, spec.requiredChannels, channels) {
			return CertificateResult{}, fmt.Errorf("observed channels %v do not satisfy required %s rule %v", channels, spec.channelRule, spec.requiredChannels)
		}
	}

	resultChannels := append([]string{}, channels...)
	return CertificateResult{
		ID:                   spec.id,
		Backend:              spec.backend,
		Fault:                spec.fault,
		ExpectedChannels:     append([]string{}, spec.requiredChannels...),
		AllowedChannels:      append([]string{}, spec.allowedChannels...),
		ChannelRule:          spec.channelRule,
		ObservedChannels:     resultChannels,
		Activated:            *row.Activated,
		ActivationCount:      *row.ActivationCount,
		ActivationEventIndex: activation.eventIndex,
		ActivationTargetPath: activation.targetPath,
		ProbeException:       append(json.RawMessage{}, row.ProbeException...),
		InfrastructureErrors: append([]string{}, (*row.InfrastructureErrors)...),
		PageErrors:           append([]string{}, (*row.PageErrors)...),
		EventsObserved:       *row.EventsObserved,
		TraceTicks:           *row.TraceTicks,
		EvidencePath:         *row.EvidencePath,
		EvidenceSHA256:       *row.EvidenceSHA256,
		Passed:               true,
	}, nil
}

type activationSummary struct {
	eventIndex *int
	targetPath *string
}

func validateEvidence(spec registryCase, row inputResult, evidence caseEvidence) ([]string, activationSummary, error) {
	if evidence.Schema == nil || *evidence.Schema != evidenceSchema {
		return nil, activationSummary{}, fmt.Errorf("evidence schema must be %q", evidenceSchema)
	}
	if evidence.ID == nil || *evidence.ID != spec.id || evidence.Backend == nil || *evidence.Backend != spec.backend || evidence.Fault == nil || *evidence.Fault != spec.fault {
		return nil, activationSummary{}, errors.New("evidence case identity does not match registry")
	}
	if evidence.Expected == nil || evidence.Observed == nil || evidence.ObservedChannels == nil || evidence.InfrastructureErrors == nil || evidence.PageErrors == nil || len(evidence.ProbeException) == 0 || evidence.EventsObserved == nil || evidence.TraceTicks == nil {
		return nil, activationSummary{}, errors.New("evidence is missing required observations or error fields")
	}
	if evidence.Activated != nil && *evidence.Activated != *row.Activated {
		return nil, activationSummary{}, errors.New("evidence activation flag differs from run row")
	}
	if evidence.ActivationCount != nil && *evidence.ActivationCount != *row.ActivationCount {
		return nil, activationSummary{}, errors.New("evidence activation count differs from run row")
	}
	if !equalJSON(evidence.ProbeException, row.ProbeException) {
		return nil, activationSummary{}, errors.New("evidence probeException differs from run row")
	}
	if !reflect.DeepEqual(*evidence.InfrastructureErrors, *row.InfrastructureErrors) || !reflect.DeepEqual(*evidence.PageErrors, *row.PageErrors) {
		return nil, activationSummary{}, errors.New("evidence error arrays differ from run row")
	}
	if *evidence.EventsObserved != *row.EventsObserved || *evidence.TraceTicks != *row.TraceTicks || evidence.Observed.EventsObserved == nil || evidence.Observed.TraceTicks == nil || *evidence.Observed.EventsObserved != *row.EventsObserved || *evidence.Observed.TraceTicks != *row.TraceTicks {
		return nil, activationSummary{}, errors.New("run event/tick counts differ from live evidence")
	}
	if evidence.Expected.StateIndex == nil || *evidence.Expected.StateIndex != spec.expectedStateIndex || len(evidence.Expected.State) == 0 || len(evidence.Expected.DOM) == 0 || evidence.Expected.Disabled == nil || evidence.Expected.Disabled.Path == nil || evidence.Expected.Disabled.Value == nil || evidence.Expected.TraceTicks == nil || evidence.Expected.EventsObserved == nil {
		return nil, activationSummary{}, errors.New("evidence expected checkpoint is incomplete or has the wrong state index")
	}
	if *evidence.Expected.EventsObserved != spec.expectedEvents || *evidence.Expected.TraceTicks != spec.expectedTicks {
		return nil, activationSummary{}, errors.New("evidence expected event/tick checkpoint differs from registry")
	}
	if evidence.Observed.CallbackCounts == nil || evidence.Observed.CallbackCounts.Dispatch == nil || len(evidence.Observed.State) == 0 || len(evidence.Observed.DOM) == 0 {
		return nil, activationSummary{}, errors.New("evidence actual state, DOM, or callback count is missing")
	}
	if spec.fault == "none" {
		if evidence.Expected.DispatchCount == nil || evidence.Expected.DispatchCountDelta != nil || *evidence.Expected.DispatchCount != 34 {
			return nil, activationSummary{}, errors.New("healthy evidence must expect 34 full-profile dispatches")
		}
	} else {
		if evidence.Expected.DispatchCountDelta == nil || evidence.Expected.DispatchCount != nil {
			return nil, activationSummary{}, errors.New("fault evidence must include one dispatchCountDelta and no full-run dispatchCount")
		}
		expectedDispatch := spec.expectedEvents
		if *evidence.Expected.DispatchCountDelta != expectedDispatch {
			return nil, activationSummary{}, errors.New("expected dispatchCountDelta differs from fault checkpoint")
		}
	}
	if err := validateActivation(spec, row, evidence); err != nil {
		return nil, activationSummary{}, err
	}
	if err := validateChannelPairs(spec, evidence); err != nil {
		return nil, activationSummary{}, err
	}
	derived, err := deriveChannels(evidence.ChannelComparisons)
	if err != nil {
		return nil, activationSummary{}, err
	}
	if err := validateChannelList(*evidence.ObservedChannels, derived); err != nil {
		return nil, activationSummary{}, fmt.Errorf("evidence observedChannels: %w", err)
	}
	if evidence.DerivedChannels != nil {
		if err := validateChannelList(*evidence.DerivedChannels, derived); err != nil {
			return nil, activationSummary{}, fmt.Errorf("evidence derivedChannels: %w", err)
		}
	}
	return derived, activationSummaryFor(spec), nil
}

func validateActivation(spec registryCase, row inputResult, evidence caseEvidence) error {
	if spec.fault == "none" {
		if len(evidence.Activation) != 0 && !isNull(evidence.Activation) {
			var activation activationEvidence
			if err := decodeStrict(evidence.Activation, &activation); err != nil {
				return fmt.Errorf("decode healthy activation: %w", err)
			}
			if activation.Activated == nil || *activation.Activated || activation.ActivationCount == nil || *activation.ActivationCount != 0 {
				return errors.New("healthy evidence activation must be false with count 0")
			}
			if activation.Records != nil && len(*activation.Records) != 0 {
				return errors.New("healthy evidence contains fault activation records")
			}
		}
		return nil
	}
	if len(evidence.Activation) == 0 || isNull(evidence.Activation) {
		return errors.New("fault evidence has no activation record")
	}
	var activation activationEvidence
	if err := decodeStrict(evidence.Activation, &activation); err != nil {
		return fmt.Errorf("decode activation evidence: %w", err)
	}
	if activation.Activated == nil || !*activation.Activated || activation.ActivationCount == nil || *activation.ActivationCount != 1 || activation.Records == nil || len(*activation.Records) != 1 || len(activation.CallbackInvocations) == 0 {
		return errors.New("fault evidence must contain exactly one activation and its callback record")
	}
	gotIndex, err := nullableInt(activation.EventIndex)
	if err != nil {
		return fmt.Errorf("activation eventIndex: %w", err)
	}
	if !equalOptionalInt(gotIndex, spec.activationEvent) {
		return errors.New("fault activated at an unexpected source event")
	}
	gotTarget, err := nullableString(activation.TargetPath)
	if err != nil {
		return fmt.Errorf("activation targetPath: %w", err)
	}
	if spec.activationTarget == nil || gotTarget == nil || *gotTarget != *spec.activationTarget {
		return errors.New("fault activation target path differs from registry")
	}
	var record activationRecord
	if err := decodeStrict((*activation.Records)[0], &record); err != nil {
		return fmt.Errorf("decode activation record: %w", err)
	}
	if record.Fault == nil || *record.Fault != spec.fault || record.Backend == nil || *record.Backend != spec.backend || record.Target == nil || record.Target.Path == nil || *record.Target.Path != *spec.activationTarget {
		return errors.New("activation record identity or target differs from registry")
	}
	recordIndex, err := nullableInt(record.EventIndex)
	if err != nil {
		return fmt.Errorf("activation record eventIndex: %w", err)
	}
	if !equalOptionalInt(recordIndex, spec.activationEvent) {
		return errors.New("activation record eventIndex differs from registry")
	}
	return nil
}

func validateChannelPairs(spec registryCase, evidence caseEvidence) error {
	if len(evidence.ChannelComparisons) != len(channelOrder()) {
		return fmt.Errorf("channelComparisons must contain exactly %d known channels", len(channelOrder()))
	}
	for _, channel := range channelOrder() {
		if _, ok := evidence.ChannelComparisons[channel]; !ok {
			return fmt.Errorf("channelComparisons is missing %q", channel)
		}
	}
	for channel := range evidence.ChannelComparisons {
		if !contains(channelOrder(), channel) {
			return fmt.Errorf("channelComparisons contains unknown channel %q", channel)
		}
	}
	var expectedDOM, observedDOM domSnapshot
	if err := decodeStrict(evidence.Expected.DOM, &expectedDOM); err != nil {
		return fmt.Errorf("decode expected DOM projection: %w", err)
	}
	if err := decodeStrict(evidence.Observed.DOM, &observedDOM); err != nil {
		return fmt.Errorf("decode observed DOM projection: %w", err)
	}
	if expectedDOM.HTML == nil || observedDOM.HTML == nil {
		return errors.New("expected or observed DOM projection has no HTML")
	}
	if err := requirePairEqual("dom", evidence.ChannelComparisons["dom"], *expectedDOM.HTML, *observedDOM.HTML); err != nil {
		return err
	}
	if err := requirePairEqual("state", evidence.ChannelComparisons["state"], evidence.Expected.State, evidence.Observed.State); err != nil {
		return err
	}
	if err := requirePairEqual("dispatch-count", evidence.ChannelComparisons["dispatch-count"], expectedDispatchCount(spec, evidence.Expected), *evidence.Observed.CallbackCounts.Dispatch); err != nil {
		return err
	}
	if err := requirePairEqual("trace-count", evidence.ChannelComparisons["trace-count"], *evidence.Expected.TraceTicks, *evidence.Observed.TraceTicks); err != nil {
		return err
	}
	expectedDisabled := []disabledProjection{{Path: *evidence.Expected.Disabled.Path, Disabled: *evidence.Expected.Disabled.Value}}
	observedDisabled, found := disabledAtPath(observedDOM.Controls, *evidence.Expected.Disabled.Path)
	if !found {
		return errors.New("observed DOM does not contain the expected disabled-control path")
	}
	if err := requirePairEqual("disabled", evidence.ChannelComparisons["disabled"], expectedDisabled, []disabledProjection{{Path: *evidence.Expected.Disabled.Path, Disabled: *observedDisabled}}); err != nil {
		return err
	}
	if expectedDisabledControl, ok := disabledAtPath(expectedDOM.Controls, *evidence.Expected.Disabled.Path); !ok || *expectedDisabledControl != *evidence.Expected.Disabled.Value {
		return errors.New("expected disabled-control value does not match expected DOM projection")
	}
	return nil
}

func expectedDispatchCount(spec registryCase, expected *expectedEvidence) int {
	if spec.fault == "none" {
		return *expected.DispatchCount
	}
	return *expected.DispatchCountDelta
}

func disabledAtPath(controls []domControl, path string) (*bool, bool) {
	for _, control := range controls {
		if control.Path != nil && *control.Path == path && control.Disabled != nil {
			value := *control.Disabled
			return &value, true
		}
	}
	return nil, false
}

func requirePairEqual(channel string, pair comparison, expected any, observed any) error {
	if len(pair.Expected) == 0 || len(pair.Observed) == 0 {
		return fmt.Errorf("channel comparison %q is missing expected or observed value", channel)
	}
	wantBytes, err := json.Marshal(expected)
	if err != nil {
		return err
	}
	gotBytes, err := json.Marshal(observed)
	if err != nil {
		return err
	}
	if !equalJSON(pair.Expected, wantBytes) || !equalJSON(pair.Observed, gotBytes) {
		return fmt.Errorf("channel comparison %q differs from the raw expected/observed checkpoint fields", channel)
	}
	return nil
}

func deriveChannels(comparisons map[string]comparison) ([]string, error) {
	changed := make(map[string]bool, len(comparisons))
	for channel, pair := range comparisons {
		if len(pair.Expected) == 0 || len(pair.Observed) == 0 {
			return nil, fmt.Errorf("channel comparison %q has an empty side", channel)
		}
		if !json.Valid(pair.Expected) || !json.Valid(pair.Observed) {
			return nil, fmt.Errorf("channel comparison %q contains invalid JSON", channel)
		}
		if !equalJSON(pair.Expected, pair.Observed) {
			changed[channel] = true
		}
	}
	result := make([]string, 0, len(changed))
	for _, channel := range channelOrder() {
		if changed[channel] {
			result = append(result, channel)
		}
	}
	return result, nil
}

func validateInputRowRequired(row inputResult) error {
	if row.ID == nil || row.Backend == nil || row.Fault == nil || row.Activated == nil || row.ActivationCount == nil || row.ObservedChannels == nil || len(row.ProbeException) == 0 || row.InfrastructureErrors == nil || row.PageErrors == nil || row.EventsObserved == nil || row.TraceTicks == nil || row.EvidencePath == nil || row.EvidenceSHA256 == nil {
		return errors.New("required result field is missing")
	}
	if *row.ID == "" || *row.Backend == "" || *row.Fault == "" {
		return errors.New("id, backend, and fault must be non-empty")
	}
	if *row.ActivationCount < 0 {
		return errors.New("activationCount cannot be negative")
	}
	return nil
}

func resolveEvidencePath(root, value string) (string, error) {
	if strings.TrimSpace(value) == "" || filepath.IsAbs(value) || strings.Contains(value, `\`) {
		return "", errors.New("evidencePath must be a non-empty relative slash path")
	}
	clean := filepath.Clean(filepath.FromSlash(value))
	if clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", errors.New("evidencePath escapes the raw report directory")
	}
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	path := filepath.Join(rootAbs, clean)
	resolvedRoot, err := filepath.EvalSymlinks(rootAbs)
	if err != nil {
		return "", fmt.Errorf("resolve report directory: %w", err)
	}
	resolvedPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", err
	}
	relative, err := filepath.Rel(resolvedRoot, resolvedPath)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", errors.New("evidencePath resolves outside the raw report directory")
	}
	return resolvedPath, nil
}

func decodeStrict(data []byte, target any) error {
	if err := rejectDuplicateJSONKeys(data); err != nil {
		return err
	}
	if err := rejectNoncanonicalStructFieldNames(data, target); err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("multiple JSON values are not allowed")
		}
		return err
	}
	return nil
}

func rejectDuplicateJSONKeys(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := consumeJSONValue(decoder); err != nil {
		return err
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("multiple JSON values are not allowed")
		}
		return err
	}
	return nil
}

func consumeJSONValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delim, isDelim := token.(json.Delim)
	if !isDelim {
		return nil
	}
	switch delim {
	case '{':
		seen := make(map[string]struct{})
		for decoder.More() {
			keyToken, err := decoder.Token()
			if err != nil {
				return err
			}
			key, ok := keyToken.(string)
			if !ok {
				return errors.New("JSON object key is not a string")
			}
			if _, duplicate := seen[key]; duplicate {
				return fmt.Errorf("duplicate JSON object key %q", key)
			}
			seen[key] = struct{}{}
			if err := consumeJSONValue(decoder); err != nil {
				return err
			}
		}
		end, err := decoder.Token()
		if err != nil || end != json.Delim('}') {
			return errors.New("unterminated JSON object")
		}
	case '[':
		for decoder.More() {
			if err := consumeJSONValue(decoder); err != nil {
				return err
			}
		}
		end, err := decoder.Token()
		if err != nil || end != json.Delim(']') {
			return errors.New("unterminated JSON array")
		}
	default:
		return errors.New("unexpected JSON delimiter")
	}
	return nil
}

var rawMessageType = reflect.TypeOf(json.RawMessage{})

func rejectNoncanonicalStructFieldNames(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return err
	}
	return checkCanonicalStructFieldNames(value, reflect.TypeOf(target))
}

func checkCanonicalStructFieldNames(value any, typ reflect.Type) error {
	for typ != nil && typ.Kind() == reflect.Pointer {
		typ = typ.Elem()
	}
	if typ == nil || typ == rawMessageType || value == nil {
		return nil
	}
	switch typ.Kind() {
	case reflect.Struct:
		object, ok := value.(map[string]any)
		if !ok {
			return nil
		}
		fields := make(map[string]reflect.Type)
		for i := 0; i < typ.NumField(); i++ {
			field := typ.Field(i)
			if field.PkgPath != "" {
				continue
			}
			tag := field.Tag.Get("json")
			name := strings.Split(tag, ",")[0]
			if name == "-" {
				continue
			}
			if name == "" {
				name = field.Name
			}
			fields[name] = field.Type
		}
		for key, child := range object {
			fieldType, found := fields[key]
			if !found {
				for canonical := range fields {
					if strings.EqualFold(key, canonical) {
						return fmt.Errorf("noncanonical JSON field spelling %q; use %q", key, canonical)
					}
				}
				continue
			}
			if err := checkCanonicalStructFieldNames(child, fieldType); err != nil {
				return err
			}
		}
	case reflect.Slice, reflect.Array:
		if typ.Elem() == reflect.TypeOf(byte(0)) {
			return nil
		}
		if values, ok := value.([]any); ok {
			for _, child := range values {
				if err := checkCanonicalStructFieldNames(child, typ.Elem()); err != nil {
					return err
				}
			}
		}
	case reflect.Map:
		if object, ok := value.(map[string]any); ok {
			for _, child := range object {
				if err := checkCanonicalStructFieldNames(child, typ.Elem()); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func canonicalChannels(values []string) []string {
	set := make(map[string]bool, len(values))
	for _, value := range values {
		set[value] = true
	}
	result := make([]string, 0, len(set))
	for _, channel := range channelOrder() {
		if set[channel] {
			result = append(result, channel)
		}
	}
	return result
}

func validateChannelList(actual, derived []string) error {
	seen := make(map[string]bool, len(actual))
	for _, channel := range actual {
		if !contains(channelOrder(), channel) {
			return fmt.Errorf("unknown channel %q", channel)
		}
		if seen[channel] {
			return fmt.Errorf("duplicate channel %q", channel)
		}
		seen[channel] = true
	}
	if !equalStrings(canonicalChannels(actual), derived) {
		return fmt.Errorf("channels %v do not equal derived channels %v", actual, derived)
	}
	return nil
}

func satisfiesRequired(rule string, required, actual []string) bool {
	if len(required) == 0 {
		return len(actual) == 0
	}
	switch rule {
	case "all":
		for _, channel := range required {
			if !contains(actual, channel) {
				return false
			}
		}
		return true
	case "any":
		for _, channel := range required {
			if contains(actual, channel) {
				return true
			}
		}
		return false
	default:
		return false
	}
}

func contains(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}

func equalStrings(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func equalOptionalInt(left, right *int) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func nullableInt(raw json.RawMessage) (*int, error) {
	if len(raw) == 0 {
		return nil, errors.New("field is missing")
	}
	if isNull(raw) {
		return nil, nil
	}
	var value int
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, errors.New("field must be an integer or null")
	}
	return &value, nil
}

func nullableString(raw json.RawMessage) (*string, error) {
	if len(raw) == 0 {
		return nil, errors.New("field is missing")
	}
	if isNull(raw) {
		return nil, nil
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, errors.New("field must be a string or null")
	}
	return &value, nil
}

func isNull(raw json.RawMessage) bool {
	return bytes.Equal(bytes.TrimSpace(raw), []byte("null"))
}

func equalJSON(left, right []byte) bool {
	var leftValue any
	var rightValue any
	leftDecoder := json.NewDecoder(bytes.NewReader(left))
	leftDecoder.UseNumber()
	rightDecoder := json.NewDecoder(bytes.NewReader(right))
	rightDecoder.UseNumber()
	if leftDecoder.Decode(&leftValue) != nil || rightDecoder.Decode(&rightValue) != nil {
		return false
	}
	return reflect.DeepEqual(leftValue, rightValue)
}

func activationSummaryFor(spec registryCase) activationSummary {
	return activationSummary{eventIndex: spec.activationEvent, targetPath: spec.activationTarget}
}
