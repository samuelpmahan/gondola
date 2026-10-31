# Initial source8ed CI failure, retained

This is failure history, not final conformance acceptance. Source `8ed5b66a223de1992756516f8d3895c6e096f842` completed 26 workflows: 24 succeeded, and the push/PR compiled-methods workflows failed at the same missing provenance path. The final repair source is recorded separately in `../publication-current.json`.

Primary retained run41167228825/job124437302522 produced artifact13029828865. Its exact provider ZIP is 10,841,763 bytes, SHA-256 `56ad778c1e76803734ae9b38620ae0afe57220273be4143ecc59a48525d3424a`, with 957 files and 76,593,442 uncompressed bytes. Root and an independent auditor verified ZIP CRCs and every retained member hash. The initial download was incomplete; a resumed transfer was accepted only after its size, digest and ZIP validation matched the provider.

The method runner completed its inherited gates and produced native, direct and browser data. Its final checker withheld acceptance because `builds/request.json` and `builds/result.json` did not exist. The producer had placed separate `react-request.json`/`react-build-result.json` and `dom-*` files at the attempt root. No accepted `methods.check.json` was produced.

The inherited compiled-backends record passed in full mode with18 commands, and the compiler regression record passed33 commands. Those are observations on source8ed; full final-head acceptance requires the new source's own run.

All original ZIP bytes are retained as three chunks. From this directory:

```sh
cat artifact.zip.part-* > /tmp/gobi-methods-source8ed-failure.zip
sha256sum /tmp/gobi-methods-source8ed-failure.zip
```

`artifact-retention.json` records each chunk and ZIP member. Extract the reconstructed ZIP to inspect the failed attempt, both build trees, raw state/DOM traces, command logs and inherited records. Its expanded files and duplicate local ZIP are excluded from Git; the complete original bytes remain in the chunks.
