#!/usr/bin/env python3
"""Validate the real backend encoder snapshots against the native Go trace."""
import hashlib
import json
from pathlib import Path

ROOT = Path.cwd()
BUILD = ROOT / 'compiled-publications/compiler/build'
TRACE_PATH = ROOT / 'compiled-publications/coordination/rawlogs/E-GO/native-trace.json'

def load(path):
    return json.loads(path.read_text())

def pin(path):
    data = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

trace = load(TRACE_PATH)
assert trace['schema'] == 'gobi.compiled-publications-native/v1'
assert len(trace['events']) == 50 and len(trace['steps']) == 45
probes = {backend: load(BUILD / f'{backend}-proof-encoder-probe.json') for backend in ('react', 'dom')}
shape_counts = {}
for backend, probe in probes.items():
    assert probe['schema'] == 'gobi.compiled-publications-encoder-probe/v1'
    assert probe['backend'] == backend
    assert probe['packagePath'] == 'github.com/samuelpmahan/gondola/fixtures/compiled/publications'
    assert len(probe['snapshots']) == 46 == len(trace['steps']) + 1
    shape_counts[backend] = {}
    for field_name in ('Children', 'Publications'):
        counts = {}
        for index, snapshot in enumerate(probe['snapshots']):
            expected = trace['initialState'] if index == 0 else trace['steps'][index - 1]['state']
            assert snapshot['plainState'] == expected, (backend, index, 'native Go state mismatch')
            representation = snapshot['actualSlices'][field_name]['representation']
            assert representation in ('array', 'goscript-slice')
            counts[representation] = counts.get(representation, 0) + 1
        shape_counts[backend][field_name] = counts
assert probes['react']['snapshots'] == probes['dom']['snapshots']

def field(value, name):
    assert value['kind'] == 'struct'
    return next(item['value'] for item in value['fields'] if item['name'] == name)

initial = probes['react']['snapshots'][0]['encodedState']
children = field(initial, 'Children')
publications = field(initial, 'Publications')
assert children['kind'] == 'slice' and publications['kind'] == 'slice'
assert [item['kind'] for item in children['items']] == ['struct', 'struct']
assert publications['items'] == []

resolved = load(BUILD / 'resolved-builds-proof.json')
for backend in ('react', 'dom'):
    app_ir = load(BUILD / (backend + '-proof') / resolved['backends'][backend]['app']['appIR'])
    capabilities = set(app_ir['components'][0]['capabilities'])
    assert {'effect.cancel', 'effect.request-reply', 'numeric.safe-integer', 'numeric.float64'} <= capabilities

summary = {
    'schema': 'gobi.publications-encoder-comparison/v1',
    'nativeTrace': pin(TRACE_PATH),
    'nativeEvents': len(trace['events']),
    'nativeSteps': len(trace['steps']),
    'encoderStateCheckpoints': len(probes['react']['snapshots']),
    'reactProbe': pin(BUILD / 'react-proof-encoder-probe.json'),
    'domProbe': pin(BUILD / 'dom-proof-encoder-probe.json'),
    'backendSnapshotsIdentical': True,
    'allSnapshotsMatchNativeGoState': True,
    'sliceRuntimeRepresentationsPerField': shape_counts['react'],
    'initialTypedSlices': {
        'Children': {'encodedValueKind': 'slice', 'initialItems': len(children['items'])},
        'Publications': {'encodedValueKind': 'slice', 'initialItems': len(publications['items'])},
    },
}
output = BUILD / 'encoder-comparison-proof.json'
output.write_text(json.dumps(summary, indent=2) + '\n')
print(f"React and DOM match native Go across {summary['encoderStateCheckpoints']} checkpoints; slices={shape_counts['react']}")
