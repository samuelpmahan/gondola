// Package emit emits backend-neutral schema and binding metadata for compiled
// Gobi applications. It never contains application transitions.
package emit

import (
	"bytes"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"

	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/reactmap"
)

const (
	ReactMapFile   = "react-map.gen.mjs"
	ComponentsFile = "components.gen.mjs"
)

// Backend is the compilercontract.AppIR React emitter used by the nested
// compiler build. The emitted module contains only checked AppIR/role data.
type Backend struct{}

// AppIREmitter emits metadata derived from an already analyzed AppIR.
type AppIREmitter interface {
	Name() string
	Emit(compilercontract.AppIR) ([]gobi.File, error)
}

// DOMBackend shares the canonical Gobi node mapping and AppIR component role
// metadata with React. The selected runtime renderer is supplied by the host.
type DOMBackend struct{}

// NewBackend returns the AppIR emitter expected by the compiled frontend CLI.
func NewBackend() Backend { return Backend{} }

// NewDOMBackend returns the AppIR emitter used with the native DOM renderer.
func NewDOMBackend() DOMBackend { return DOMBackend{} }

// NewBackendFor selects a supported AppIR emitter without changing AppIR or
// compiled application symbols.
func NewBackendFor(name string) (AppIREmitter, error) {
	switch name {
	case "react":
		return NewBackend(), nil
	case "dom":
		return NewDOMBackend(), nil
	default:
		return nil, fmt.Errorf("unsupported backend %q", name)
	}
}

func (Backend) Name() string    { return "react" }
func (DOMBackend) Name() string { return "dom" }

// Emit returns the canonical React name map and the AppIR component role table.
func (Backend) Emit(app compilercontract.AppIR) ([]gobi.File, error) {
	if diagnostics := compilercontract.ValidateAppIR(app); len(diagnostics) != 0 {
		return nil, fmt.Errorf("invalid AppIR for React emission: %s", diagnostics[0].Message)
	}
	return emitAppIR(app)
}

// Emit returns the same validated, backend-neutral AppIR metadata as React.
// The DOM renderer is selected by the runtime host, so this emitter does not
// generate framework code or application transitions.
func (DOMBackend) Emit(app compilercontract.AppIR) ([]gobi.File, error) {
	if diagnostics := compilercontract.ValidateAppIR(app); len(diagnostics) != 0 {
		return nil, fmt.Errorf("invalid AppIR for DOM emission: %s", diagnostics[0].Message)
	}
	return emitAppIR(app)
}

func emitAppIR(app compilercontract.AppIR) ([]gobi.File, error) {
	appJSON, err := json.Marshal(app)
	if err != nil {
		return nil, fmt.Errorf("marshal AppIR for backend emission: %w", err)
	}
	components := emitComponents(appJSON)
	return []gobi.File{
		{Path: ReactMapFile, Bytes: []byte(reactmap.Generate())},
		{Path: ComponentsFile, Bytes: components},
	}, nil
}

func emitComponents(appJSON []byte) []byte {
	var out bytes.Buffer
	out.WriteString("// Generated from validated compilercontract.AppIR. Do not edit.\n")
	out.WriteString("export const appIR = Object.freeze(")
	out.Write(appJSON)
	out.WriteString(`);

export const componentRoles = Object.freeze(appIR.components.map((component) => Object.freeze({
  id: component.id,
  packagePath: component.packagePath,
  stateType: component.stateType,
  messageType: component.messageType,
  init: component.init,
  update: component.update,
  view: component.view,
  capabilities: Object.freeze([...component.capabilities]),
})));
`)
	return out.Bytes()
}

// GobiBackend adapts the existing gobi.Backend interface for callers that
// already possess both a validated AppIR and the corresponding legacy App
// identity. The identity is captured at construction and must match exactly at
// Emit time; no AppIR or source data is synthesized from gobi.App.
type GobiBackend struct {
	emitter AppIREmitter
	appIR   compilercontract.AppIR
	legacy  gobi.App
}

// NewGobiBackend configures the legacy Backend interface with an already
// analyzed AppIR and its source-derived gobi.App identity.
func NewGobiBackend(app compilercontract.AppIR, identity gobi.App) (gobi.Backend, error) {
	return NewGobiBackendFor("react", app, identity)
}

// NewGobiBackendFor configures the legacy gobi.Backend interface with an
// already analyzed AppIR and its source-derived gobi.App identity.
func NewGobiBackendFor(name string, app compilercontract.AppIR, identity gobi.App) (gobi.Backend, error) {
	emitter, err := NewBackendFor(name)
	if err != nil {
		return nil, err
	}
	if diagnostics := compilercontract.ValidateAppIR(app); len(diagnostics) != 0 {
		return nil, fmt.Errorf("invalid AppIR for legacy %s adapter: %s", name, diagnostics[0].Message)
	}
	if err := validateLegacyIdentity(app, identity); err != nil {
		return nil, err
	}
	appCopy, err := cloneAppIR(app)
	if err != nil {
		return nil, fmt.Errorf("copy verified AppIR: %w", err)
	}
	return &GobiBackend{emitter: emitter, appIR: appCopy, legacy: cloneLegacyApp(identity)}, nil
}

// Name implements gobi.Backend.
func (backend *GobiBackend) Name() string {
	if backend == nil || backend.emitter == nil {
		return ""
	}
	return backend.emitter.Name()
}

// Emit implements gobi.Backend and rejects any identity drift from the
// source-derived gobi.App captured by NewGobiBackendFor.
func (backend *GobiBackend) Emit(app gobi.App) ([]gobi.File, error) {
	if backend == nil {
		return nil, fmt.Errorf("nil configured Gobi backend")
	}
	if !reflect.DeepEqual(app, backend.legacy) {
		return nil, fmt.Errorf("gobi.App identity changed after %s backend configuration", backend.Name())
	}
	if backend.emitter == nil {
		// Before the adapter retained a configured emitter, its zero value
		// delegated to the default React AppIR emitter. Preserve that error path.
		return Backend{}.Emit(backend.appIR)
	}
	return backend.emitter.Emit(backend.appIR)
}

func validateLegacyIdentity(app compilercontract.AppIR, identity gobi.App) error {
	if identity.Module == "" || identity.Root == "" {
		return fmt.Errorf("gobi.App Module and Root must identify the source entry")
	}
	if identity.Root != app.PackagePath {
		return fmt.Errorf("gobi.App Root %q does not match verified AppIR packagePath %q", identity.Root, app.PackagePath)
	}
	if !strings.HasPrefix(app.PackagePath, identity.Module) ||
		(app.PackagePath != identity.Module && !strings.HasPrefix(strings.TrimPrefix(app.PackagePath, identity.Module), "/")) {
		return fmt.Errorf("gobi.App Module %q is not the module path for AppIR packagePath %q", identity.Module, app.PackagePath)
	}
	if len(identity.Components) != len(app.Components) {
		return fmt.Errorf("gobi.App component count %d does not match AppIR component count %d", len(identity.Components), len(app.Components))
	}
	seen := make(map[string]bool, len(identity.Components))
	for index, component := range identity.Components {
		verified := app.Components[index]
		if component.Package == "" || component.State == "" {
			return fmt.Errorf("gobi.App component %d requires Package and State identity", index)
		}
		if component.Package != verified.PackagePath {
			return fmt.Errorf("gobi.App component %d package %q does not match AppIR package %q", index, component.Package, verified.PackagePath)
		}
		stateType := string(verified.StateType)
		if stateType != component.State && !strings.HasSuffix(stateType, "."+component.State) && !strings.HasSuffix(stateType, "/"+component.State) {
			return fmt.Errorf("gobi.App component %d state %q does not match AppIR state type %q", index, component.State, stateType)
		}
		if seen[component.Package] {
			return fmt.Errorf("gobi.App repeats component package %q", component.Package)
		}
		seen[component.Package] = true
	}
	return nil
}

func cloneAppIR(app compilercontract.AppIR) (compilercontract.AppIR, error) {
	data, err := json.Marshal(app)
	if err != nil {
		return compilercontract.AppIR{}, err
	}
	var cloned compilercontract.AppIR
	if err := json.Unmarshal(data, &cloned); err != nil {
		return compilercontract.AppIR{}, err
	}
	return cloned, nil
}

func cloneLegacyApp(app gobi.App) gobi.App {
	cloned := app
	if app.Components == nil {
		return cloned
	}
	cloned.Components = make([]gobi.Component, len(app.Components))
	for index, component := range app.Components {
		cloned.Components[index] = component
		if component.Messages != nil {
			cloned.Components[index].Messages = append(make([]string, 0, len(component.Messages)), component.Messages...)
		}
		if component.Uses != nil {
			cloned.Components[index].Uses = append(make([]string, 0, len(component.Uses)), component.Uses...)
		}
	}
	return cloned
}
