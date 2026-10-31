import hashlib
import io
import json
import pathlib
import tarfile

PRIMARY = pathlib.Path('/workspace/scratch/39a56936f173/gondola-next')
ACTIVE = pathlib.Path('/workspace/scratch/39a56936f173/gondola-children-archive')
DELIVERY_PATH = PRIMARY / 'compiled-children/coordination/current-full-source-462/E-DELIVERY.json'
delivery = json.loads(DELIVERY_PATH.read_text())
archive_path = ACTIVE / delivery['archive']['path']


def pin_bytes(data):
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def pin_path(path):
    return pin_bytes(path.read_bytes())

assert delivery['status'] == 'passed' and delivery['failures'] == [] and delivery['mismatches'] == []
assert delivery['sourcePinsMatch'] is True and delivery['boundariesVerified'] is True

with tarfile.open(archive_path, 'r:gz') as archive:
    ebuild_path = 'inherited/compiled-capabilities/E-BUILD.json'
    ebuild_bytes = archive.extractfile(ebuild_path).read()
    ebuild_pin = pin_bytes(ebuild_bytes)
    ebuild = json.loads(ebuild_bytes)
    member = next(item for item in delivery['archive']['members'] if item['path'] == ebuild_path)
    assert ebuild_pin == {'bytes': member['bytes'], 'sha256': member['sha256']}
    assert ebuild_pin == delivery['inherited']['receipt'] | {'path': ebuild_path}
    m0 = ebuild['m0Preservation']

assert m0['status'] == 'passed'
assert m0['entryCount'] == len(m0['entries']) == 24
assert all(item['matches'] is True and item['sha256'] == item['expectedSha256'] for item in m0['entries'])

checksum_path = ACTIVE / 'SHA256SUMS'
checksum_bytes = checksum_path.read_bytes()
assert pin_bytes(checksum_bytes) == m0['checksumFile']
checksum_rows = []
for line in checksum_bytes.decode('utf-8').splitlines():
    digest, rel = line.split(maxsplit=1)
    checksum_rows.append({'path': rel.lstrip('*'), 'sha256': digest})
assert len(checksum_rows) == 24
assert checksum_rows == [{'path': item['path'], 'sha256': item['expectedSha256']} for item in m0['entries']]
actual_m0 = []
for item in m0['entries']:
    path = ACTIVE / item['path']
    actual = pin_path(path)
    expected = {'bytes': item['bytes'], 'sha256': item['expectedSha256']}
    assert actual == expected, item['path']
    actual_m0.append({'path': item['path'], **actual, 'matchesChecksum': True})

rules_path = ACTIVE / 'gobi/rules_test.go'
rules_text = rules_path.read_text()
start = rules_text.index('func rules() []rule {')
end = rules_text.index('\n}\n', start)
rules_count = sum(line.lstrip().startswith('{"') for line in rules_text[start:end].splitlines())
assert rules_count == 59
assert any(item['path'] == 'gobi/rules_test.go' for item in actual_m0)

# The Counter row is a historical baseline only; source462 did not rerun it.
legacy_path = ACTIVE / 'interaction/evidence/summary.json'
legacy = json.loads(legacy_path.read_text())
legacy_record = next(item for item in legacy if item.get('seed') == 20261030)
assert legacy_record['scripts'] == 107 and legacy_record['initial_and_action_ticks'] == 4473 and legacy_record['mismatches'] == 0
results_path = ACTIVE / 'typed-composition/RESULTS.md'
assert '| Counter | 107 scripts /4,473 ticks |' in results_path.read_text()

print(json.dumps({
    'schema': 'gobi.compiled-children-m0-and-history-independent-check/v1',
    'status': 'matched',
    'deliveryStatus': delivery['status'],
    'inheritedReceiptMember': {'path': ebuild_path, **ebuild_pin},
    'm0Preservation': {
        'status': m0['status'],
        'rulesTestRows': rules_count,
        'checksumEntryCount': len(checksum_rows),
        'checksumFile': {'path': 'SHA256SUMS', **pin_bytes(checksum_bytes)},
        'allActualFilesMatch': True,
        'actualEntries': actual_m0,
    },
    'historicalCounterBaseline': {
        'path': str(legacy_path.relative_to(ACTIVE)),
        **pin_path(legacy_path),
        'seed': legacy_record['seed'],
        'scripts': legacy_record['scripts'],
        'ticks': legacy_record['initial_and_action_ticks'],
        'mismatches': legacy_record['mismatches'],
        'status': 'historical prior-run evidence; not rerun in source462',
    },
}, indent=2))
