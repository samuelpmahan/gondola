# E-FIX-GO: cancellation descriptor Arg consistency

## Change

Removed the analyzer's nonempty-value check for cancellation `Arg`. Capability derivation now requires the `Arg` field to be present and typed as a string, while leaving payload validity to runtime policy. Direct `Arg: ""` and parenthesized `Arg: ("")` now both infer `effect.cancel`, eliminating a syntax-dependent result.

The existing exact typed descriptor checks remain: the composite must be the actual `gobi.Effect` type, occur in Update-reachable code, and use keyed literal `Kind: "lifecycle.cancel"`, `Name: "cancel"`, and `Reply: ""` fields.

## Evidence

- Repository root, Go 1.24.0: `PATH=/tmp/gondola-go/bin:$PATH go test -count=1 ./compilercontract` — passed.
- `compiled-frontend/`, Go 1.27.3: `PATH=/tmp/gondola-go/bin:$PATH GOTOOLCHAIN=go1.27.3 go test ./analyze` — passed.
- `compiled-frontend/`, Go 1.27.3: `PATH=/tmp/gondola-go/bin:$PATH GOTOOLCHAIN=go1.27.3 go test ./analyze -run 'TestEffectCancelCapabilityRequiresReachableTypedDescriptor|TestLoadAndAnalyzeCompiledFixtures' -v` — passed; both direct and parenthesized empty-Arg subtests passed, as did the compiled lifecycle fixture assertion and legacy fixture checks.
- `git diff --check` — passed.
- Source SHA-256: `analyze.go` `a637078d1b2ade9bf237ad015d53fff2191027fcd67f8956e55483cba8b48c2a`; `analyze_test.go` `1ff4aba8abba102b2d4399940586fb6c1f3f98a4842203be63474d887a87313b`.

No full milestone runner, commit, merge, or deploy was performed for this repair. Original E-GO and XR-GO reports and raw logs were left untouched.
