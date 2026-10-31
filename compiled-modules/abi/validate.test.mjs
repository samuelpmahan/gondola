import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assertInputRecord,
  assertPublicationRecord,
  validateModuleABI,
  validateModulePair,
} from './validate.mjs';
import { goCanonicalDigestVectors, makeValidTestPair, rehashTestDescriptor } from './test-fixtures.mjs';

test('valid independently described modules admit and return frozen snapshots', async () => {
  const pair = await makeValidTestPair();
  const admitted = await validateModulePair(pair);

  assert.equal(admitted.parent.descriptor.componentID, pair.parent.descriptor.componentID);
  assert.equal(admitted.child.descriptor.componentID, pair.child.descriptor.componentID);
  assert.equal(admitted.parent.artifacts.length, 4);
  assert(Object.isFrozen(admitted));
  assert(Object.isFrozen(admitted.parent));
  assert(Object.isFrozen(admitted.parent.descriptor));
  assert(Object.isFrozen(admitted.parent.appIR));
  assert(Object.isFrozen(admitted.parent.artifacts[0]));
  assert.notStrictEqual(admitted.parent.descriptor, pair.parent.descriptor);
  assert.equal(await validateModuleABI(pair.parent).then((snapshot) => snapshot.abiSHA256), pair.parent.descriptor.abiSHA256);
});

test('pair admission snapshots both descriptors, AppIRs, and artifact bytes before WebCrypto awaits', async () => {
  const pair = await makeValidTestPair();
  const originalParentID = pair.parent.descriptor.componentID;
  const originalChildID = pair.child.descriptor.componentID;
  const originalParentAppIR = pair.parent.appIR.components[0].id;
  const descriptorBytes = pair.parent.descriptorBytes;
  const originalDescriptorByte = descriptorBytes[0];
  const moduleBytes = pair.parent.artifactBytes.get('apps/moduleparent/gobi-compiled.mjs');
  const originalByte = moduleBytes[0];
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const realCrypto = globalThis.crypto;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  try {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { subtle: { digest: async (algorithm, bytes) => {
        await gate;
        return realCrypto.subtle.digest(algorithm, bytes);
      } } },
    });
    const pending = validateModulePair(pair);
    pair.parent.descriptor.componentID = 'mutated.parent';
    pair.child.descriptor.componentID = 'mutated.child';
    pair.parent.appIR.components[0].id = 'mutated.parent';
    descriptorBytes[0] ^= 0xff;
    moduleBytes[0] ^= 0xff;
    release();

    const admitted = await pending;
    assert.equal(admitted.parent.descriptor.componentID, originalParentID);
    assert.equal(admitted.child.descriptor.componentID, originalChildID);
    assert.equal(admitted.parent.appIR.components[0].id, originalParentAppIR);
    assert.equal(admitted.parent.descriptorBytes[0], originalDescriptorByte);
    assert(Object.isFrozen(admitted.parent.descriptorBytes));
    assert.equal(admitted.parent.artifacts.find((item) => item.path.endsWith('/gobi-compiled.mjs')).bytes, moduleBytes.length);
    assert.notEqual(moduleBytes[0], originalByte);
  } finally {
    if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
    else delete globalThis.crypto;
  }
});

test('descriptor field aliases and rehashed malformed artifacts fail closed', async () => {
  const pair = await makeValidTestPair();
  pair.parent.descriptor.Schema = pair.parent.descriptor.schema;
  await rehashTestDescriptor(pair.parent.descriptor);
  pair.parent.descriptorBytes = new TextEncoder().encode(`${JSON.stringify(pair.parent.descriptor, null, 2)}\n`);
  await assert.rejects(validateModulePair(pair), /extra|properties/);

  const substitutedSidecar = await makeValidTestPair();
  substitutedSidecar.parent.descriptorBytes[0] ^= 0xff;
  await assert.rejects(validateModulePair(substitutedSidecar), /encoded data|UTF-8|descriptor object/);

  const duplicateSidecar = await makeValidTestPair();
  const sidecarText = new TextDecoder().decode(duplicateSidecar.parent.descriptorBytes);
  duplicateSidecar.parent.descriptorBytes = new TextEncoder().encode(sidecarText.replace(
    '"schema": "gobi.module-abi/v1"',
    '"schema": "gobi.module-abi/v1",\n  "schema": "gobi.module-abi/v1"',
  ));
  await assert.rejects(validateModulePair(duplicateSidecar), /duplicate JSON property/);

  const bomSidecar = await makeValidTestPair();
  bomSidecar.parent.descriptorBytes = new Uint8Array([
    0xef, 0xbb, 0xbf, ...bomSidecar.parent.descriptorBytes,
  ]);
  await assert.rejects(validateModulePair(bomSidecar), /invalid JSON|JSON string|expected/);

  const duplicatePair = await makeValidTestPair();
  const appIRPath = 'apps/moduleparent/app-ir.json';
  const appIRBytes = duplicatePair.parent.artifactBytes.get(appIRPath);
  const text = new TextDecoder().decode(appIRBytes);
  const duplicated = text.replace('"schema":"gobi.app-ir/v1"', '"schema":"gobi.app-ir/v1","schema":"gobi.app-ir/v1"');
  const mutatedBytes = new TextEncoder().encode(duplicated);
  duplicatePair.parent.artifactBytes.set(appIRPath, mutatedBytes);
  const artifact = duplicatePair.parent.descriptor.artifacts.find((item) => item.path === appIRPath);
  artifact.bytes = mutatedBytes.byteLength;
  artifact.sha256 = await sha256Hex(mutatedBytes);
  await rehashTestDescriptor(duplicatePair.parent.descriptor);
  syncSidecar(duplicatePair.parent);
  await assert.rejects(validateModulePair(duplicatePair), /duplicate JSON property/);

  const changedArtifact = await makeValidTestPair();
  const moduleBytes = changedArtifact.parent.artifactBytes.get('apps/moduleparent/gobi-compiled.mjs');
  moduleBytes[0] ^= 0xff;
  await assert.rejects(validateModulePair(changedArtifact), /artifact bytes mismatch/);
});

test('canonical descriptor digests match Go-generated path escaping vectors', async () => {
  for (const vector of goCanonicalDigestVectors) {
    const pair = await makeValidTestPair();
    const parent = pair.parent;
    const appDir = `module${String.fromCodePoint(vector.codePoint)}parent`;
    const prefix = 'apps/moduleparent/';
    parent.artifactBytes = new Map([...parent.artifactBytes].map(([path, bytes]) => [
      path.startsWith(prefix) ? `apps/${appDir}/${path.slice(prefix.length)}` : path,
      bytes,
    ]));
    for (const artifact of parent.descriptor.artifacts) {
      artifact.path = `apps/${appDir}/${artifact.path.split('/').at(-1)}`;
    }
    await rehashTestDescriptor(parent.descriptor);
    assert.equal(parent.descriptor.artifactSHA256, vector.artifactSHA256, `${vector.name} fixture artifact digest`);
    assert.equal(parent.descriptor.abiSHA256, vector.abiSHA256, `${vector.name} fixture ABI digest`);
    parent.descriptorBytes = new TextEncoder().encode(JSON.stringify(parent.descriptor));

    const admitted = await validateModuleABI(parent);
    assert.equal(admitted.artifactSHA256, vector.artifactSHA256, vector.name);
    assert.equal(admitted.abiSHA256, vector.abiSHA256, vector.name);
  }
});

test('rehashed role, nominal wire, and field-order mismatches do not match AppIR', async () => {
  const changedSignature = await makeValidTestPair();
  const inputRole = changedSignature.child.descriptor.roles.find((role) => role.name === 'Input');
  inputRole.signature.params[1] = 'github.com/other/modulewire.Input';
  await rehashTestDescriptor(changedSignature.child.descriptor);
  syncSidecar(changedSignature.child);
  await assert.rejects(validateModulePair(changedSignature), /roles do not match source-derived AppIR/);

  const changedField = await makeValidTestPair();
  const inputType = changedField.child.descriptor.types.find((type) => type.id.endsWith('/modulewire.Input'));
  inputType.fields.reverse();
  await rehashTestDescriptor(changedField.child.descriptor);
  syncSidecar(changedField.child);
  await assert.rejects(validateModulePair(changedField), /type closure does not match source-derived AppIR/);

  const changedNominalID = await makeValidTestPair({ childWirePackage: 'github.com/other/modulewire' });
  await assert.rejects(validateModulePair(changedNominalID), /modulewire.Input|Input signature/);
});

test('Input primitive records enforce own fields, prototype, field types, and safe integers', () => {
  const valid = assertInputRecord({ Step: 3, Locked: true, Revision: Number.MAX_SAFE_INTEGER });
  assert.deepEqual({ ...valid }, { Step: 3, Locked: true, Revision: Number.MAX_SAFE_INTEGER });
  assert(Object.isFrozen(valid));
  assert.throws(() => assertInputRecord({ Step: 1, Locked: false, Revision: 1, Extra: 0 }), /extra/);
  assert.throws(() => assertInputRecord(Object.assign(Object.create({ inherited: true }), { Step: 1, Locked: false, Revision: 1 })), /plain record|cross-module/);
  assert.throws(() => assertInputRecord({ Step: 0, Locked: false, Revision: 1 }), /Step/);
  assert.throws(() => assertInputRecord({ Step: 4, Locked: false, Revision: 1 }), /Step/);
  assert.throws(() => assertInputRecord({ Step: 1.5, Locked: false, Revision: 1 }), /Step/);
  assert.throws(() => assertInputRecord({ Step: 1, Locked: 0, Revision: 1 }), /Locked/);
  assert.throws(() => assertInputRecord({ Step: 1, Locked: false, Revision: Number.MAX_SAFE_INTEGER + 1 }), /Revision/);
  const accessor = { Step: 1, Locked: false };
  Object.defineProperty(accessor, 'Revision', { enumerable: true, get() { return 1; } });
  assert.throws(() => assertInputRecord(accessor), /data property/);
});

test('Publication primitive records accept finite fractions but reject invalid bounds', () => {
  const valid = assertPublicationRecord({ Count: 2.5, Revision: 7 });
  assert.deepEqual({ ...valid }, { Count: 2.5, Revision: 7 });
  assert(Object.isFrozen(valid));
  for (const Count of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => assertPublicationRecord({ Count, Revision: 1 }), /Count/);
  }
  assert.throws(() => assertPublicationRecord({ Count: 0, Revision: 0 }), /Revision/);
  assert.throws(() => assertPublicationRecord({ Count: 0, Revision: 1, goScriptObject: true }), /extra/);
});

async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function syncSidecar(module) {
  module.descriptorBytes = new TextEncoder().encode(`${JSON.stringify(module.descriptor, null, 2)}\n`);
}
