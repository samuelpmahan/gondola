# Native asynchronous module qualification implementation plan

Goal: accept prior real mounted keyed-effect evidence with Go contracts.

Architecture: extract the existing Go replay, validate capture semantics against it, compose independent ordering and source/build admission, expose a Go-only CLI and explicit reproduction runner. Tech: Go1.24 standard library and current fixtures. Spec: effects-qualification-coordination/CONTRACT.md (published with assignment receipts).

Alternatives considered: more JS controls would retain JS acceptance authority; new network features would expand transport scope before qualifying present contracts. Native acceptance is selected by lead under user authorization.

Constraints: preserve M0, no main merge/deploy, no Node semantic delegation. Review focus: duplicate/aliased JSON keys; missing or modified source/artifacts; reordered canceled/duplicate/old-generation replies; browser renderer epochs; fully rehashed semantic mutations.

Six disjoint tasks and interfaces follow CONTRACT.md. For each lane: [ ] demonstrate a failing boundary test; [ ] implement scoped code; [ ] run focused tests and real fixture; [ ] freeze exact report/receipt/source; [ ] independent cross-review. Integration gates replay→capture, capture+order→directory, directory→CLI, all→real negative controls. Root validates assembled CLI directory/archive and static+interaction regressions, records versions/seeds/traces, publishes feature PR with scoped evidence and no merge.
