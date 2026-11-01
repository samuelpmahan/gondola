const schema = 'gobi.module-abi/v1';
const appIRSchema = 'gobi.app-ir/v1';
const wirePackage = 'github.com/samuelpmahan/gondola/fixtures/compiled/modulewire';
const inputTypeID = `${wirePackage}.Input`;
const publicationTypeID = `${wirePackage}.Publication`;
const safeIntegerMax = Number.MAX_SAFE_INTEGER;

const descriptorRequired = [
  'schema', 'appIRSchema', 'componentID', 'packagePath', 'artifactSHA256',
  'artifacts', 'roles', 'types', 'capabilities', 'abiSHA256',
];
const artifactNames = ['app-ir.json', 'components.gen.mjs', 'encoder.mjs', 'gobi-compiled.mjs'];
const knownCapabilities = new Set([
  'view.node', 'binding.value', 'binding.checked', 'numeric.safe-integer', 'numeric.float64',
  'effect.request-reply', 'effect.cancel',
]);
const utf8Encoder = new TextEncoder();

const parentPackagePath = 'github.com/samuelpmahan/gondola/fixtures/compiled/keyedmoduleparent';
const childPackagePath = 'github.com/samuelpmahan/gondola/fixtures/compiled/effectmodulechild';
const admittedChildCapabilities = Object.freeze([
  'effect.cancel', 'effect.request-reply', 'numeric.float64', 'numeric.safe-integer', 'view.node',
]);
export const closedEffectDescriptors = Object.freeze([
  Object.freeze({ kind: 'fixture.request', name: 'save', argument: 'opaque active token: key:g<generation>:r<requestID>', reply: 'complete' }),
  Object.freeze({ kind: 'lifecycle.cancel', name: 'cancel', argument: 'opaque active token: key:g<generation>:r<requestID>', reply: '' }),
]);
export const pr22ParentPins = Object.freeze({
  react: Object.freeze({
    appIRSHA256: '70e17604359b90bc78e022f12b7faeeed3a7a80fac7ba63f79697085711c85af',
    normalizedModuleSHA256: '4f8066ef90393a8b76490a1532bcfc6f59d48bac6d9d7e57f02426e6d28ba1ce',
    normalizedHelperSHA256: '9bf860060df1e0463ab1074962dbaf87883d9125acb2e067248dfc6bda04ca3d',
    sourceSHA256: '610064486c28cb8a2abe1dc7094d8cf37312ea852e7ab83335b7239c1bb9c3b9',
  }),
  dom: Object.freeze({
    appIRSHA256: '70e17604359b90bc78e022f12b7faeeed3a7a80fac7ba63f79697085711c85af',
    normalizedModuleSHA256: '4f8066ef90393a8b76490a1532bcfc6f59d48bac6d9d7e57f02426e6d28ba1ce',
    normalizedHelperSHA256: '9bf860060df1e0463ab1074962dbaf87883d9125acb2e067248dfc6bda04ca3d',
    sourceSHA256: '610064486c28cb8a2abe1dc7094d8cf37312ea852e7ab83335b7239c1bb9c3b9',
  }),
});

export async function validateModuleABI(moduleInput) {
  const snapshot = snapshotModule(moduleInput);
  await validateModuleSnapshot(snapshot);
  return moduleResult(snapshot);
}

export async function validateModulePair(pairInput) {
  const pair = readOwnDataObject(pairInput, ['parent', 'child'], '$pair');
  // Snapshot both modules before the first asynchronous digest operation.
  const parent = snapshotModule(pair.parent);
  const child = snapshotModule(pair.child);
  await Promise.all([validateModuleSnapshot(parent), validateModuleSnapshot(child)]);
  validatePairShape(parent.descriptor, child.descriptor);
  return deepFreeze({ parent: moduleResult(parent), child: moduleResult(child) });
}

// This profile extension keeps the existing module-ABI checks intact and
// admits only the two effect capabilities and exact descriptor set exercised
// by the compiled effects fixture. It is not a generic effect certificate.
export async function validateModuleEffectsPair(pairInput) {
  const admitted = await validateModulePair(pairInput);
  const { parent, child } = admitted;
  if (parent.descriptor.packagePath !== parentPackagePath || child.descriptor.packagePath !== childPackagePath) {
    throw new TypeError('module-effects admission requires the frozen keyed parent and effect child packages');
  }
  if (!sameJSON(parent.descriptor.capabilities, ['numeric.float64', 'numeric.safe-integer', 'view.node'])) {
    throw new TypeError('keyed parent capabilities differ from the unchanged PR22 profile');
  }
  const appIRCapabilities = child.appIR.components[0].capabilities;
  if (!sameJSON(child.descriptor.capabilities, admittedChildCapabilities) ||
      !Array.isArray(appIRCapabilities) || new Set(appIRCapabilities).size !== appIRCapabilities.length ||
      !sameJSON([...appIRCapabilities].sort(), admittedChildCapabilities)) {
    throw new TypeError('effect child capabilities differ from the closed module-effects profile');
  }
  const childStateID = child.appIR.components[0].stateType;
  const childState = child.descriptor.types.find((info) => info.id === childStateID);
  const uint64 = child.descriptor.types.find((info) => info.id === 'uint64');
  const expectedStateFields = [
    { name: 'Core', type: 'github.com/samuelpmahan/gondola/fixtures/compiled/modulechild.State' },
    { name: 'Key', type: 'string' },
    { name: 'Generation', type: 'uint64' },
    { name: 'Mounted', type: 'bool' },
    { name: 'RequestID', type: 'uint64' },
    { name: 'Pending', type: 'bool' },
    { name: 'Token', type: 'string' },
    { name: 'Reply', type: 'string' },
  ];
  const uint64References = child.descriptor.types.flatMap((info) =>
    (info.fields ?? []).filter((field) => field.type === 'uint64').map((field) => `${info.id}.${field.name}`)).sort();
  if (!childState || childState.kind !== 'struct' || !sameJSON(childState.fields, expectedStateFields) ||
      !uint64 || uint64.kind !== 'uint' || uint64.bits !== 64 || uint64.jsRepresentation !== 'bigint' ||
      !sameJSON(uint64References, [`${childStateID}.Generation`, `${childStateID}.RequestID`].sort())) {
    throw new TypeError('effect child Go-owned state must use the exact uint64 BigInt generation and request-ID fields');
  }
  return deepFreeze({ ...admitted, closedEffectDescriptors });
}

export function assertInputRecord(record) {
  const value = snapshotRecord(record, ['Step', 'Locked', 'Revision'], 'Input');
  if (!Number.isSafeInteger(value.Step) || value.Step < 1 || value.Step > 3) {
    throw new TypeError('Input.Step must be a safe integer from 1 through 3');
  }
  if (typeof value.Locked !== 'boolean') throw new TypeError('Input.Locked must be boolean');
  if (!Number.isSafeInteger(value.Revision) || value.Revision < 1 || value.Revision > safeIntegerMax) {
    throw new TypeError('Input.Revision must be a positive safe integer');
  }
  return Object.freeze({ Step: value.Step, Locked: value.Locked, Revision: value.Revision });
}

export function assertPublicationRecord(record) {
  const value = snapshotRecord(record, ['Count', 'Revision'], 'Publication');
  if (typeof value.Count !== 'number' || !Number.isFinite(value.Count) || value.Count < 0 || value.Count > safeIntegerMax) {
    throw new TypeError('Publication.Count must be finite and in the range 0 through MAX_SAFE_INTEGER');
  }
  if (!Number.isSafeInteger(value.Revision) || value.Revision < 1 || value.Revision > safeIntegerMax) {
    throw new TypeError('Publication.Revision must be a positive safe integer');
  }
  return Object.freeze({ Count: value.Count, Revision: value.Revision });
}

function snapshotModule(input) {
  const module = readOwnDataObject(input, ['descriptor', 'descriptorBytes', 'appIR', 'artifactBytes'], '$module');
  const descriptor = cloneClosed(module.descriptor, '$module.descriptor');
  const descriptorBytes = copyBytes(module.descriptorBytes, '$module.descriptorBytes');
  const appIR = cloneClosed(module.appIR, '$module.appIR');
  const artifactBytes = copyArtifactBytes(module.artifactBytes);
  return { descriptor, descriptorBytes, appIR, artifactBytes };
}

function copyBytes(bytes, label) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError(`${label} must be a Uint8Array`);
  return new Uint8Array(bytes);
}

function moduleResult(snapshot) {
  return deepFreeze({
    descriptor: snapshot.descriptor,
    descriptorBytes: Object.freeze([...snapshot.descriptorBytes]),
    descriptorBytesSHA256: snapshot.descriptorBytesSHA256,
    appIR: snapshot.appIR,
    artifacts: snapshot.descriptor.artifacts,
    artifactSHA256: snapshot.descriptor.artifactSHA256,
    abiSHA256: snapshot.descriptor.abiSHA256,
  });
}

async function validateModuleSnapshot(snapshot) {
  const { descriptor, descriptorBytes, appIR, artifactBytes } = snapshot;
  const descriptorText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(descriptorBytes);
  assertNoDuplicateJSONKeys(descriptorText);
  const sidecarDescriptor = cloneClosed(JSON.parse(descriptorText), '$module.descriptorBytes');
  if (!sameJSON(sidecarDescriptor, descriptor)) throw new TypeError('module ABI descriptor object does not match module-abi.json bytes');
  validateDescriptorShape(descriptor);
  validateAppIRShape(appIR);
  const derived = deriveFromAppIR(appIR);
  if (descriptor.appIRSchema !== appIR.schema || descriptor.componentID !== derived.componentID || descriptor.packagePath !== derived.packagePath) {
    throw new TypeError('module ABI identity does not match source-derived AppIR');
  }
  if (!sameJSON(descriptor.roles, derived.roles)) throw new TypeError('module ABI roles do not match source-derived AppIR');
  if (!sameJSON(descriptor.types, derived.types)) throw new TypeError('module ABI type closure does not match source-derived AppIR');
  if (!sameJSON(descriptor.capabilities, derived.capabilities)) throw new TypeError('module ABI capabilities do not match source-derived AppIR');

  validateRoleSet(descriptor.roles, descriptor.types, descriptor.packagePath);
  validateTypeRecords(descriptor.types, { allowChildUint64BigInt: descriptor.packagePath === childPackagePath });
  validateCapabilities(descriptor.capabilities);
  validateWireTypes(descriptor.types);
  const inventory = validateArtifactInventory(descriptor.artifacts);
  const supplied = [...artifactBytes.keys()].sort(compareGoStrings);
  const listed = descriptor.artifacts.map((item) => item.path);
  if (!sameJSON(supplied, listed)) throw new TypeError('artifact byte map must exactly match descriptor inventory');

  const appIRPath = inventory.directory + '/app-ir.json';
  const appIRBytes = artifactBytes.get(appIRPath);
  const appIRText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(appIRBytes);
  assertNoDuplicateJSONKeys(appIRText);
  const fileAppIR = cloneClosed(JSON.parse(appIRText), '$module.app-ir.json');
  if (!sameJSON(fileAppIR, appIR)) throw new TypeError('app-ir.json bytes do not match the supplied AppIR');

  const actualArtifacts = [];
  for (const record of descriptor.artifacts) {
    const bytes = artifactBytes.get(record.path);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new TypeError(`artifact ${record.path} must contain nonempty Uint8Array bytes`);
    const sha256 = await sha256Hex(bytes);
    if (bytes.byteLength !== record.bytes || sha256 !== record.sha256) throw new TypeError(`artifact bytes mismatch for ${record.path}`);
    actualArtifacts.push({ path: record.path, bytes: bytes.byteLength, sha256 });
  }
  if (await digestCanonical(actualArtifacts) !== descriptor.artifactSHA256) throw new TypeError('artifact inventory digest mismatch');

  const { abiSHA256, ...body } = descriptor;
  if (await digestCanonical(body) !== abiSHA256) throw new TypeError('ABI digest mismatch');
  snapshot.descriptorBytesSHA256 = await sha256Hex(descriptorBytes);
}

function validateDescriptorShape(value) {
  requireExactKeys(value, descriptorRequired, '$descriptor');
  if (value.schema !== schema || value.appIRSchema !== appIRSchema) throw new TypeError('unsupported module ABI schema');
  if (!validIdentifier(value.componentID) || !validPackagePath(value.packagePath)) throw new TypeError('invalid module component or package identity');
  if (!isSHA256(value.artifactSHA256) || !isSHA256(value.abiSHA256)) throw new TypeError('module ABI digests must be lowercase SHA-256 hex');
  if (!Array.isArray(value.artifacts) || value.artifacts.length === 0) throw new TypeError('artifacts must be a nonempty array');
  if (!Array.isArray(value.roles) || value.roles.length !== 5) throw new TypeError('roles must be three conventional roles and one bridge pair');
  if (!Array.isArray(value.types) || value.types.length === 0) throw new TypeError('types must be a nonempty array');
  if (!Array.isArray(value.capabilities)) throw new TypeError('capabilities must be an array');
  for (const [index, artifact] of value.artifacts.entries()) {
    requireExactKeys(artifact, ['path', 'bytes', 'sha256'], `$descriptor.artifacts[${index}]`);
  }
  for (const [index, role] of value.roles.entries()) {
    requireExactKeys(role, ['name', 'symbol', 'signature'], `$descriptor.roles[${index}]`);
    requireExactKeys(role.signature, ['params', 'results'], `$descriptor.roles[${index}].signature`);
    if (!Array.isArray(role.signature.params) || !Array.isArray(role.signature.results)) throw new TypeError('role signature params/results must be arrays');
  }
  for (const [index, type] of value.types.entries()) {
    requireExactKeys(type, ['id', 'kind'], `$descriptor.types[${index}]`, ['bits', 'elemType', 'length', 'fields', 'jsRepresentation']);
    if (Object.hasOwn(type, 'fields')) {
      if (!Array.isArray(type.fields)) throw new TypeError('TypeInfo.fields must be an array');
      for (const [fieldIndex, field] of type.fields.entries()) {
        requireExactKeys(field, ['name', 'type'], `$descriptor.types[${index}].fields[${fieldIndex}]`);
      }
    }
  }
}

function validateAppIRShape(appIR) {
  requireExactKeys(appIR, ['schema', 'packagePath', 'components', 'symbols', 'types'], '$appIR');
  if (appIR.schema !== appIRSchema || !validPackagePath(appIR.packagePath)) throw new TypeError('invalid AppIR schema or package path');
  if (!Array.isArray(appIR.components) || appIR.components.length !== 1 || !Array.isArray(appIR.symbols) || !Array.isArray(appIR.types)) {
    throw new TypeError('AppIR must have one component and non-null symbol/type arrays');
  }
  const component = appIR.components[0];
  requireExactKeys(component, ['id', 'packagePath', 'stateType', 'messageType', 'init', 'update', 'view', 'capabilities']);
  for (const symbol of appIR.symbols) {
    requireExactKeys(symbol, ['id', 'packagePath', 'name', 'signature', 'span', 'calls']);
    requireExactKeys(symbol.signature, ['params', 'results']);
    requireExactKeys(symbol.span, ['file', 'startByte', 'endByte']);
    if (!Array.isArray(symbol.signature.params) || !Array.isArray(symbol.signature.results) || !Array.isArray(symbol.calls)) throw new TypeError('AppIR symbol arrays are required');
  }
  for (const type of appIR.types) {
    requireExactKeys(type, ['id', 'kind'], '$appIR.types[]', ['bits', 'elemType', 'length', 'fields', 'jsRepresentation']);
    if (Object.hasOwn(type, 'fields')) {
      if (!Array.isArray(type.fields)) throw new TypeError('AppIR TypeInfo.fields must be an array');
      for (const field of type.fields) requireExactKeys(field, ['name', 'type']);
    }
  }
}

function deriveFromAppIR(appIR) {
  const component = appIR.components[0];
  if (!validIdentifier(component.id) || component.packagePath !== appIR.packagePath) throw new TypeError('AppIR component identity mismatch');
  const symbols = new Map();
  for (const symbol of appIR.symbols) {
    if (symbols.has(symbol.id)) throw new TypeError(`duplicate AppIR symbol ${symbol.id}`);
    symbols.set(symbol.id, symbol);
  }
  const roleIDs = new Map([
    ['Init', component.init], ['Update', component.update], ['View', component.view],
  ]);
  const bridgeNames = new Set(['Output', 'Receive', 'Input', 'Publication']);
  for (const symbol of appIR.symbols) {
    if (symbol.packagePath !== component.packagePath || !bridgeNames.has(symbol.name)) continue;
    if (roleIDs.has(symbol.name)) throw new TypeError(`duplicate AppIR bridge role ${symbol.name}`);
    if (symbol.id !== `${component.packagePath}.${symbol.name}`) throw new TypeError(`noncanonical AppIR bridge symbol ${symbol.id}`);
    roleIDs.set(symbol.name, symbol.id);
  }
  const parent = roleIDs.has('Output') && roleIDs.has('Receive');
  const child = roleIDs.has('Input') && roleIDs.has('Publication');
  if (parent === child || (parent && (roleIDs.has('Input') || roleIDs.has('Publication'))) || (child && (roleIDs.has('Output') || roleIDs.has('Receive')))) {
    throw new TypeError('AppIR must declare exactly one complete parent or child bridge pair');
  }
  const roleNames = [...roleIDs.keys()].sort();
  const roles = roleNames.map((name) => {
    const symbol = symbols.get(roleIDs.get(name));
    if (!symbol || symbol.packagePath !== component.packagePath || symbol.name !== name) throw new TypeError(`invalid AppIR role ${name}`);
    if (symbol.id !== `${component.packagePath}.${name}`) throw new TypeError(`noncanonical AppIR role symbol ${symbol.id}`);
    return { name, symbol: symbol.id, signature: { params: [...symbol.signature.params], results: [...symbol.signature.results] } };
  });
  const roots = [component.stateType, component.messageType];
  for (const role of roles) roots.push(...role.signature.params, ...role.signature.results);
  const types = typeClosure(appIR.types, roots);
  const capabilities = [...component.capabilities].sort();
  return { componentID: component.id, packagePath: component.packagePath, roles, types, capabilities };
}

function typeClosure(allTypes, roots) {
  const byID = new Map();
  for (const info of allTypes) {
    if (typeof info.id !== 'string' || byID.has(info.id)) throw new TypeError(`duplicate or invalid AppIR TypeID ${info.id}`);
    byID.set(info.id, info);
  }
  const visited = new Set();
  const visit = (id) => {
    if (visited.has(id)) return;
    const info = byID.get(id);
    if (!info) throw new TypeError(`AppIR role refers to missing TypeID ${id}`);
    visited.add(id);
    for (const field of info.fields ?? []) visit(field.type);
    if (info.elemType) visit(info.elemType);
  };
  for (const id of roots) visit(id);
  return [...visited].sort(compareGoStrings).map((id) => cloneClosed(byID.get(id), `$type:${id}`));
}

function validateRoleSet(roles, types, packagePath = '') {
  const names = roles.map((role) => role.name);
  if (new Set(names).size !== names.length || names.some((name, index) => index > 0 && names[index - 1] >= name)) {
    throw new TypeError('role names must be unique and sorted');
  }
  const parent = sameSet(names, ['Init', 'Update', 'View', 'Output', 'Receive']);
  const child = sameSet(names, ['Init', 'Update', 'View', 'Input', 'Publication']);
  if (!parent && !child) throw new TypeError('module must expose exactly one complete bridge role pair');
  const map = new Map(roles.map((role) => [role.name, role]));
  for (const role of roles) {
    if (!validIdentifier(role.name) || role.symbol !== `${packagePath}.${role.name}`) throw new TypeError(`noncanonical role symbol ${role.symbol}`);
  }
  const typeMap = new Map(types.map((info) => [info.id, info]));
  const stateType = map.get('Init').signature.results;
  if (map.get('Init').signature.params.length !== 0 || stateType.length !== 1) throw new TypeError('Init must return exactly one state and take no args');
  const stateID = stateType[0];
  if (typeMap.get(stateID)?.kind !== 'struct') throw new TypeError('Init state must be a declared struct type');
  const update = map.get('Update').signature;
  if (update.params.length !== 2 || update.params[0] !== stateID || update.results.length !== 2 || update.results[0] !== stateID) {
    throw new TypeError('Update signature is incompatible');
  }
  const message = typeMap.get(update.params[1]);
  if (message?.kind !== 'struct' || !sameJSON(message.fields?.filter((field) => ['Name', 'Arg'].includes(field.name)).sort((a, b) => a.name.localeCompare(b.name)), [
    { name: 'Arg', type: 'string' }, { name: 'Name', type: 'string' },
  ])) throw new TypeError('Update message must contain string Name and Arg fields');
  const effects = typeMap.get(update.results[1]);
  const effect = typeMap.get(effects?.elemType);
  if (effects?.kind !== 'slice' || effect?.kind !== 'struct' || !effect.id.endsWith('.Effect') || !['Kind', 'Name', 'Arg', 'Reply'].every((name) => effect.fields?.some((field) => field.name === name && field.type === 'string'))) {
    throw new TypeError('Update must return a slice of gobi.Effect-shaped values');
  }
  const view = map.get('View').signature;
  if (view.params.length !== 1 || view.params[0] !== stateID || view.results.length !== 1) throw new TypeError('View signature is incompatible');
  const viewType = typeMap.get(view.results[0]);
  if (viewType?.kind !== 'struct' || !(viewType.id.endsWith('.Node') || viewType.id === 'github.com/samuelpmahan/gondola/compilercontract.View')) {
    throw new TypeError('View must return a supported Node or compilercontract.View type');
  }
  if (parent) {
    const output = map.get('Output').signature;
    const receive = map.get('Receive').signature;
    if (!sameArray(output.params, [stateID]) || !sameArray(output.results, [inputTypeID])) throw new TypeError('Output signature is incompatible');
    if (!sameArray(receive.params, [stateID, publicationTypeID]) || !sameArray(receive.results, [stateID])) throw new TypeError('Receive signature is incompatible');
  } else {
    const input = map.get('Input').signature;
    const publication = map.get('Publication').signature;
    if (!sameArray(input.params, [stateID, inputTypeID]) || !sameArray(input.results, [stateID])) throw new TypeError('Input signature is incompatible');
    if (!sameArray(publication.params, [stateID]) || !sameArray(publication.results, [publicationTypeID])) throw new TypeError('Publication signature is incompatible');
  }
  return { parent, child, map };
}

function validateTypeRecords(types, { allowChildUint64BigInt = false } = {}) {
  if (types.some((info, index) => typeof info.id !== 'string' || (index > 0 && compareGoStrings(types[index - 1].id, info.id) >= 0))) {
    throw new TypeError('TypeInfo closure must be unique and sorted by ID');
  }
  const byID = new Map(types.map((info) => [info.id, info]));
  for (const info of types) {
    const fields = info.fields;
    if (info.kind === 'struct') {
      if (!Array.isArray(fields) || fields.length === 0 || info.elemType !== undefined || info.length !== undefined) throw new TypeError(`invalid struct TypeInfo ${info.id}`);
      const fieldNames = new Set();
      for (const field of fields) {
        if (fieldNames.has(field.name) || !byID.has(field.type)) throw new TypeError(`invalid field in ${info.id}`);
        fieldNames.add(field.name);
      }
    } else if (['bool', 'string', 'int', 'uint', 'float64'].includes(info.kind)) {
      if (fields !== undefined || info.elemType !== undefined || info.length !== undefined) throw new TypeError(`invalid scalar TypeInfo ${info.id}`);
    } else if (info.kind === 'slice') {
      if (typeof info.elemType !== 'string' || !byID.has(info.elemType) || fields !== undefined || info.length !== undefined) throw new TypeError(`invalid slice TypeInfo ${info.id}`);
    } else if (info.kind === 'array') {
      if (typeof info.elemType !== 'string' || !byID.has(info.elemType) || !Number.isSafeInteger(info.length) || info.length < 0 || fields !== undefined) throw new TypeError(`invalid array TypeInfo ${info.id}`);
    } else {
      throw new TypeError(`unsupported TypeInfo kind ${info.kind}`);
    }
    if ((info.kind === 'int' || info.kind === 'uint') ? ![8, 16, 32, 64].includes(info.bits) : info.bits !== undefined) {
      throw new TypeError(`invalid integer width in ${info.id}`);
    }
    const representation = info.jsRepresentation;
    const childUint64BigInt = allowChildUint64BigInt && info.id === 'uint64' && info.kind === 'uint' &&
      info.bits === 64 && representation === 'bigint';
    const validRepresentation = (
      (['bool', 'string'].includes(info.kind) && representation === 'direct') ||
      (['int', 'uint'].includes(info.kind) && representation === 'number') ||
      childUint64BigInt ||
      (info.kind === 'float64' && representation === 'number') ||
      (info.kind === 'struct' && representation === 'class') ||
      (info.kind === 'slice' && ['goscript-slice', 'array-or-goscript-slice', 'float64-array-or-goscript-slice', 'array', 'float64-array'].includes(representation)) ||
      (info.kind === 'array' && ['array', 'float64-array'].includes(representation))
    );
    if (!validRepresentation) throw new TypeError(`incompatible JS representation in ${info.id}`);
  }
}

function validateWireTypes(types) {
  const input = types.find((info) => info.id === inputTypeID);
  const publication = types.find((info) => info.id === publicationTypeID);
  if (!input || input.kind !== 'struct' || input.jsRepresentation !== 'class' || !sameJSON(input.fields, [
    { name: 'Step', type: 'int' }, { name: 'Locked', type: 'bool' }, { name: 'Revision', type: 'int' },
  ])) throw new TypeError('modulewire.Input type or field order differs from the frozen ABI');
  if (!publication || publication.kind !== 'struct' || publication.jsRepresentation !== 'class' || !sameJSON(publication.fields, [
    { name: 'Count', type: 'float64' }, { name: 'Revision', type: 'int' },
  ])) throw new TypeError('modulewire.Publication type or field order differs from the frozen ABI');
  const intType = types.find((info) => info.id === 'int');
  const boolType = types.find((info) => info.id === 'bool');
  const floatType = types.find((info) => info.id === 'float64');
  if (!intType || intType.kind !== 'int' || intType.bits !== 64 || intType.jsRepresentation !== 'number') throw new TypeError('wire int must be 64-bit Go int/JS number');
  if (!boolType || boolType.kind !== 'bool' || boolType.jsRepresentation !== 'direct') throw new TypeError('wire bool must be direct');
  if (!floatType || floatType.kind !== 'float64' || floatType.jsRepresentation !== 'number') throw new TypeError('wire float64 must be a JS number');
}

function validateCapabilities(capabilities) {
  if (capabilities.some((capability, index) => !knownCapabilities.has(capability) || (index > 0 && capabilities[index - 1] >= capability))) {
    throw new TypeError('capabilities must be known, unique, and sorted');
  }
  if (!capabilities.includes('view.node')) throw new TypeError('view.node capability is required');
}

function validateArtifactInventory(artifacts) {
  if (artifacts.length !== artifactNames.length) throw new TypeError('module artifact inventory must contain exactly four generated files');
  let directory;
  const paths = new Set();
  const names = new Set();
  for (const record of artifacts) {
    if (typeof record.path !== 'string' || !safeRelativePath(record.path) || !Number.isSafeInteger(record.bytes) || record.bytes <= 0 || !isSHA256(record.sha256)) {
      throw new TypeError('invalid artifact record');
    }
    if (paths.has(record.path)) throw new TypeError('duplicate artifact path');
    paths.add(record.path);
    const pieces = record.path.split('/');
    if (pieces.length !== 3 || pieces[0] !== 'apps') throw new TypeError('artifact must be directly under apps/<appDir>');
    if (directory === undefined) directory = `${pieces[0]}/${pieces[1]}`;
    if (directory !== `${pieces[0]}/${pieces[1]}`) throw new TypeError('artifacts must belong to one apps/<appDir>');
    if (!artifactNames.includes(pieces[2]) || names.has(pieces[2])) throw new TypeError(`unexpected or repeated artifact ${pieces[2]}`);
    names.add(pieces[2]);
  }
  for (let index = 1; index < artifacts.length; index++) {
    if (compareGoStrings(artifacts[index - 1].path, artifacts[index].path) >= 0) throw new TypeError('artifact paths must be sorted and unique');
  }
  for (const name of artifactNames) if (!names.has(name)) throw new TypeError(`missing module artifact ${name}`);
  return { directory };
}

function validatePairShape(parentDescriptor, childDescriptor) {
  if (parentDescriptor.componentID === childDescriptor.componentID || parentDescriptor.packagePath === childDescriptor.packagePath) {
    throw new TypeError('parent and child must be independently identified modules');
  }
  const parent = validateRoleSet(parentDescriptor.roles, parentDescriptor.types, parentDescriptor.packagePath);
  const child = validateRoleSet(childDescriptor.roles, childDescriptor.types, childDescriptor.packagePath);
  if (!parent.parent || !child.child) throw new TypeError('module pair roles are reversed or incomplete');
  for (const typeID of [inputTypeID, publicationTypeID]) {
    const parentType = parentDescriptor.types.find((info) => info.id === typeID);
    const childType = childDescriptor.types.find((info) => info.id === typeID);
    if (!parentType || !childType || !sameJSON(parentType, childType)) throw new TypeError(`nominal shared type ${typeID} differs between modules`);
  }
}

function copyArtifactBytes(input) {
  const entries = [];
  if (input instanceof Map && Object.getPrototypeOf(input) === Map.prototype) {
    for (const [name, bytes] of input.entries()) entries.push([name, bytes]);
  } else {
    const object = readOwnDataEntries(input, '$module.artifactBytes');
    for (const name of Object.keys(object)) entries.push([name, object[name]]);
  }
  const result = new Map();
  for (const [name, bytes] of entries) {
    if (typeof name !== 'string' || result.has(name) || !(bytes instanceof Uint8Array)) throw new TypeError('artifact bytes must map unique string paths to Uint8Array values');
    assertWellFormedUnicode(name, '$module.artifactBytes path');
    result.set(name, new Uint8Array(bytes));
  }
  return result;
}

function snapshotRecord(record, keys, label) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) throw new TypeError(`${label} must be a plain record`);
  const prototype = Object.getPrototypeOf(record);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must not be a cross-module class instance`);
  requireExactOwnKeys(record, keys, label);
  const result = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError(`${label}.${key} must be an enumerable data property`);
    result[key] = descriptor.value;
  }
  return result;
}

function cloneClosed(value, label) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    assertWellFormedUnicode(value, label);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Array.prototype) throw new TypeError(`${label} must use a plain Array`);
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== 'string' || (key !== 'length' && !/^(0|[1-9][0-9]*)$/.test(key)))) throw new TypeError(`${label} has unexpected array properties`);
    const copied = [];
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) throw new TypeError(`${label} has a sparse array`);
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError(`${label} array items must be data properties`);
      copied.push(cloneClosed(descriptor.value, `${label}[${index}]`));
    }
    return copied;
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be plain data`);
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== 'string')) throw new TypeError(`${label} cannot contain symbol keys`);
    const copied = Object.create(null);
    for (const key of ownKeys) {
      assertWellFormedUnicode(key, `${label} property name`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError(`${label}.${key} must be an enumerable data property`);
      copied[key] = cloneClosed(descriptor.value, `${label}.${key}`);
    }
    return copied;
  }
  throw new TypeError(`${label} contains unsupported ${typeof value}`);
}

function readOwnDataEntries(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be a plain object or Map`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object or Map`);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) throw new TypeError(`${label} cannot contain symbol keys`);
  const result = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError(`${label}.${key} must be an enumerable data property`);
    result[key] = descriptor.value;
  }
  return result;
}

function readOwnDataObject(value, expectedKeys, label) {
  const result = readOwnDataEntries(value, label);
  requireExactOwnKeys(result, expectedKeys, label);
  return result;
}

function requireExactKeys(value, required, label, optional = []) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  requireExactOwnKeys(value, [...required, ...optional].filter((key) => Object.hasOwn(value, key)), label);
  for (const key of required) if (!Object.hasOwn(value, key)) throw new TypeError(`${label} is missing required property ${key}`);
}

function requireExactOwnKeys(value, expected, label) {
  const actual = Reflect.ownKeys(value);
  if (actual.length !== expected.length || actual.some((key) => typeof key !== 'string') || expected.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError(`${label} has missing, extra, or symbol properties`);
  }
}

async function sha256Hex(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== 'function') throw new Error('WebCrypto SHA-256 is required for module ABI admission');
  const digest = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function digestCanonical(value) {
  return sha256Hex(new TextEncoder().encode(canonicalJSON(value)));
}

function canonicalJSON(value) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    assertWellFormedUnicode(value, 'canonical JSON string');
    return goJSONString(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON cannot contain non-finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJSON(item)).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort(compareGoStrings);
    for (const key of keys) assertWellFormedUnicode(key, 'canonical JSON property name');
    return `{${keys.map((key) => `${goJSONString(key)}:${canonicalJSON(value[key])}`).join(',')}}`;
  }
  throw new TypeError(`cannot canonicalize ${typeof value}`);
}

function goJSONString(value) {
  assertWellFormedUnicode(value, 'JSON string');
  return JSON.stringify(value).replace(/[\u003c\u003e&\u2028\u2029]/g, (character) =>
    `\\u${character.codePointAt(0).toString(16).padStart(4, '0')}`);
}

function assertWellFormedUnicode(value, label) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) throw new TypeError(`${label} must contain well-formed Unicode`);
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new TypeError(`${label} must contain well-formed Unicode`);
    }
  }
}

// Go sorts strings by their UTF-8 bytes; JS's default sort compares UTF-16
// code units. Valid Unicode scalar values have the same order as UTF-8 bytes.
function compareGoStrings(left, right) {
  const leftBytes = utf8Encoder.encode(left);
  const rightBytes = utf8Encoder.encode(right);
  const commonLength = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < commonLength; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return leftBytes[index] - rightBytes[index];
  }
  return leftBytes.length - rightBytes.length;
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function sameJSON(left, right) {
  return canonicalJSON(left) === canonicalJSON(right);
}

function sameArray(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameSet(left, right) {
  const sortedLeft = [...left].sort(compareGoStrings);
  const sortedRight = [...right].sort(compareGoStrings);
  return sortedLeft.length === sortedRight.length && sortedLeft.every((value, index) => value === sortedRight[index]);
}

function validIdentifier(value) {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_.:/-]*$/.test(value);
}

function validPackagePath(value) {
  return typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.endsWith('/') && !value.includes('\\') &&
    value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..' && /^[A-Za-z0-9_.-]+$/.test(segment));
}

function safeRelativePath(value) {
  return typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('\\') && !value.includes('\0') &&
    value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function isSHA256(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function assertNoDuplicateJSONKeys(text) {
  let index = 0;
  const skipSpace = () => { while (/\s/.test(text[index] ?? '')) index++; };
  const parseString = () => {
    const start = index;
    if (text[index] !== '"') throw new TypeError('expected JSON string');
    index++;
    while (index < text.length) {
      const char = text[index++];
      if (char === '"') {
        const value = JSON.parse(text.slice(start, index));
        assertWellFormedUnicode(value, 'JSON string');
        return value;
      }
      if (char === '\\') index++;
      if (index > text.length) throw new TypeError('truncated JSON string');
    }
    throw new TypeError('unterminated JSON string');
  };
  const parseValue = () => {
    skipSpace();
    if (text[index] === '{') {
      index++;
      skipSpace();
      const keys = new Set();
      if (text[index] === '}') { index++; return; }
      while (index < text.length) {
        skipSpace();
        const key = parseString();
        if (keys.has(key)) throw new TypeError(`duplicate JSON property ${key}`);
        keys.add(key);
        skipSpace();
        if (text[index++] !== ':') throw new TypeError('expected colon in JSON object');
        parseValue();
        skipSpace();
        const separator = text[index++];
        if (separator === '}') return;
        if (separator !== ',') throw new TypeError('expected comma in JSON object');
      }
      throw new TypeError('unterminated JSON object');
    }
    if (text[index] === '[') {
      index++;
      skipSpace();
      if (text[index] === ']') { index++; return; }
      while (index < text.length) {
        parseValue();
        skipSpace();
        const separator = text[index++];
        if (separator === ']') return;
        if (separator !== ',') throw new TypeError('expected comma in JSON array');
      }
      throw new TypeError('unterminated JSON array');
    }
    if (text[index] === '"') { parseString(); return; }
    const literal = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(index));
    if (!literal) throw new TypeError('invalid JSON value');
    index += literal[0].length;
  };
  parseValue();
  skipSpace();
  if (index !== text.length) throw new TypeError('trailing JSON data');
}
