# R-T4B — Single-line input normalization witnesses

## Result

Updated only `scripts.mjs` and `scripts.test.mjs`. Generated text-input dispatch
steps now carry the value that can reach the application through a mounted
single-line HTML text input: carriage returns and line feeds are removed. The
independent manager reference remains unchanged and continues to accept raw
strings when called directly.

Each script exposes `inputWitnesses` metadata with `actionIndex`, `requested`,
`effective`, and `key`. The closed native input remains `{actions: [...]}`;
witness metadata is kept outside the action list. The fixed publication trace
retains its action indexes and effective values while adding one CRLF and one
LF requested-value witness. Seeded edit generation records each requested
value that is normalized and updates its generated state using the effective
value.

## Verification

    cd gondola
    node --test typed-composition/reference.test.mjs typed-composition/scripts.test.mjs
    # passed: 19 tests, 0 failures

This is focused independent-model/script verification. It does not claim a
fresh browser/native replay or full inherited runner result.
