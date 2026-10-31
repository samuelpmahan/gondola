# Generated module comparison audit

The initial cross-build comparison idea used a whole-line regular expression to replace temporary esbuild source-label comments. I rejected that comparison rule after checking its boundaries: a label-looking line can occur as literal text inside a multiline JavaScript template string, so a line regex can erase a real module difference. The adversarial vectors are preserved in [module-normalization-vectors.json](module-normalization-vectors.json).

Acceptance therefore retains raw hashes for both backend bundles and does not assert their normalized byte identity. It proves backend parity by mounting the same concrete compiled module object through React and DOM in the same runtime, and by comparing the stable AppIR, state encoder, generated forwarding Go, TypeScript, component mapping, and role bindings from separate build requests exactly. The vectors document the rejected comparator and are not a gate or acceptance claim.
