import { isAbsolute, relative, resolve, sep } from "node:path";

const sourceCommentPolicySchema = 'gobi.generated-source-comments/v1';
const goScriptPathTail = /^@goscript\/(?:[A-Za-z0-9_.@-]+\/)*[A-Za-z0-9_.@-]+\.ts$/;
const emittedPathTail = /^@goscript\/(?:[A-Za-z0-9_.@-]+\/)*[A-Za-z0-9_.@-]+\.ts$/;
const stagePathTail = /^(?:components\.gen\.mjs|\.gobi-compiled\.entry\.mjs)$/;

function slash(value) {
  return value.split(sep).join('/');
}

function within(root, value) {
  const rel = relative(root, value);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function safeRelativePath(value, label) {
  if (typeof value !== 'string' || value === '' || value.includes('\\') || value.startsWith('/') ||
      value.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new TypeError(`${label} is not a safe generated source path`);
  }
  return value;
}

function safeGeneratedCommentPath(value, label) {
  if (typeof value !== 'string' || value === '' || value.includes('\\') || value.startsWith('/')) {
    throw new TypeError(`${label} is not a relative generated source comment`);
  }
  const parts = value.replace(/\/$/, '').split('/');
  let index = 0;
  while (parts[index] === '..') index++;
  if (index === parts.length || parts.slice(index).some((part) => part === '' || part === '.' || part === '..' || /[\0-\x1f\x7f\\]/.test(part))) {
    throw new TypeError(`${label} is not a canonical generated source comment`);
  }
  return value;
}

function validatePolicy(policy, expected = null) {
  if (!policy || policy.schema !== sourceCommentPolicySchema ||
      !['module', 'helper'].includes(policy.artifactKind) || !['react', 'dom'].includes(policy.backend) ||
      !isAbsolute(policy.commentBase) || !isAbsolute(policy.outputRoot) || !isAbsolute(policy.goScriptTempRoot) ||
      !policy.roots || typeof policy.roots !== 'object' || !Array.isArray(policy.comments)) {
    throw new TypeError('generated source-comment policy is malformed');
  }
  const rootArrays = ['goScript', 'emitted', 'staged', 'helperEntry'];
  for (const name of rootArrays) {
    if (!Array.isArray(policy.roots[name])) {
      throw new TypeError(`generated source-comment policy ${name} roots are malformed`);
    }
    for (const item of policy.roots[name]) safeGeneratedCommentPath(item, `generated source-comment policy ${name} root`);
  }
  if (new Set(policy.roots.goScript).size !== policy.roots.goScript.length ||
      new Set(policy.roots.emitted).size !== policy.roots.emitted.length ||
      new Set(policy.roots.staged).size !== policy.roots.staged.length ||
      new Set(policy.roots.helperEntry).size !== policy.roots.helperEntry.length) {
    throw new TypeError('generated source-comment policy repeats a root');
  }
  for (const comment of policy.comments) {
    safeGeneratedCommentPath(comment, 'recorded generated source comment');
    if (!commentMatchesPolicy(comment, policy)) throw new TypeError('recorded generated source comment is outside its authorized roots');
  }
  const outputRelative = (root) => slash(relative(policy.outputRoot, resolve(policy.commentBase, root)));
  for (const root of policy.roots.goScript) {
    const value = slash(relative(policy.goScriptTempRoot, resolve(policy.commentBase, root)));
    if (!/^gobi-goscript-[0-9]+\/@goscript$/.test(value)) {
      throw new TypeError('GoScript source-comment root does not resolve to its recorded temp output');
    }
  }
  for (const root of policy.roots.emitted) {
    if (outputRelative(root) !== `${policy.backend}-parent/emitted-ts/@goscript`) {
      throw new TypeError('emitted source-comment root does not resolve under the declared build output');
    }
  }
  for (const root of policy.roots.staged) {
    if (!/^\.gobi-stage-[0-9]+\/apps\/keyedmoduleparent-[a-f0-9]+$/.test(outputRelative(root))) {
      throw new TypeError('staged source-comment root does not resolve under the declared build output');
    }
  }
  for (const item of policy.roots.helperEntry) {
    safeGeneratedCommentPath(item, 'keyed-helper entry comment');
    if (outputRelative(item) !== `adapters/${policy.backend}-parent/.gobi-keyed-helpers.entry.mjs`) {
      throw new TypeError('helper entry comment does not resolve under the declared build output');
    }
  }
  if (policy.artifactKind === 'module' &&
      (policy.roots.goScript.length === 0 || policy.roots.staged.length === 0 ||
       policy.roots.emitted.length !== 0 || policy.roots.helperEntry.length !== 0)) {
    throw new TypeError('compiled-module source-comment policy has the wrong root kinds');
  }
  if (policy.artifactKind === 'helper' &&
      (policy.roots.emitted.length === 0 || policy.roots.helperEntry.length !== 1 ||
       policy.roots.goScript.length !== 0 || policy.roots.staged.length !== 0)) {
    throw new TypeError('keyed-helper source-comment policy has the wrong root kinds');
  }
  if (expected) {
    for (const key of ['artifactKind', 'backend', 'commentBase', 'outputRoot', 'goScriptTempRoot']) {
      if (expected[key] !== undefined && resolve(policy[key]) !== resolve(expected[key])) {
        throw new TypeError(`generated source-comment policy ${key} differs from the declared build context`);
      }
    }
  }
  return policy;
}

function commentRoot(raw, marker) {
  const index = raw.indexOf(marker);
  if (index < 0) return null;
  return raw.slice(0, index + marker.length);
}

// Discover only comments whose resolved path is under this build's declared
// GoScript temp tree or its exact output, emitted, helper-entry, and stage
// locations. The resulting roots are recorded in build-index.json so a
// relocated loader can revalidate comment syntax without reading the old tree.
export function createGeneratedSourceCommentPolicy(text, options) {
  if (typeof text !== 'string') throw new TypeError('generated artifact must be text');
  const { artifactKind, backend, commentBase, outputRoot, goScriptTempRoot } = options ?? {};
  const policy = {
    schema: sourceCommentPolicySchema,
    artifactKind,
    backend,
    commentBase: resolve(commentBase),
    outputRoot: resolve(outputRoot),
    goScriptTempRoot: resolve(goScriptTempRoot),
    roots: { goScript: [], emitted: [], staged: [], helperEntry: [] },
    comments: [],
  };
  const add = (name, value) => { if (!policy.roots[name].includes(value)) policy.roots[name].push(value); };
  const comments = text.split(/\r?\n/).filter((line) => line.startsWith('//'));
  for (const line of comments) {
    if (!line.startsWith('// ')) throw new TypeError(`unexpected generated artifact comment ${JSON.stringify(line)}`);
    const raw = line.slice(3);
    safeGeneratedCommentPath(raw, 'generated source comment');
    policy.comments.push(raw);
    const resolved = resolve(policy.commentBase, raw);
    const outputPath = slash(relative(policy.outputRoot, resolved));
    if (artifactKind === 'module') {
      const tempPath = slash(relative(policy.goScriptTempRoot, resolved));
      const gs = /^(gobi-goscript-[0-9]+)\/(.*)$/.exec(tempPath);
      if (gs && goScriptPathTail.test(gs[2])) {
        const root = commentRoot(raw, '/@goscript/');
        if (!root) throw new TypeError(`malformed GoScript source comment ${JSON.stringify(line)}`);
        add('goScript', root);
        continue;
      }
      const stage = /^(\.gobi-stage-[0-9]+\/apps\/keyedmoduleparent-[a-f0-9]+)\/(.+)$/.exec(outputPath);
      if (stage && stagePathTail.test(stage[2])) {
        const root = commentRoot(raw, `/${stage[1]}/`);
        if (!root) throw new TypeError(`malformed staged source comment ${JSON.stringify(line)}`);
        add('staged', root);
        continue;
      }
    } else if (artifactKind === 'helper') {
      const emitted = new RegExp(`^${backend}-parent/emitted-ts/(@goscript/(?:[A-Za-z0-9_.@-]+/)*[A-Za-z0-9_.@-]+\\.ts)$`).exec(outputPath);
      if (emitted && emittedPathTail.test(emitted[1])) {
        const root = commentRoot(raw, '/@goscript/');
        if (!root) throw new TypeError(`malformed emitted TypeScript source comment ${JSON.stringify(line)}`);
        add('emitted', root);
        continue;
      }
      if (outputPath === `adapters/${backend}-parent/.gobi-keyed-helpers.entry.mjs`) {
        add('helperEntry', raw);
        continue;
      }
    }
    throw new TypeError(`generated artifact comment is outside its declared source roots ${JSON.stringify(line)}`);
  }
  for (const values of Object.values(policy.roots)) values.sort();
  validatePolicy(policy, { artifactKind, backend, commentBase, outputRoot, goScriptTempRoot });
  return Object.freeze({ ...policy, roots: Object.freeze(Object.fromEntries(
    Object.entries(policy.roots).map(([key, values]) => [key, Object.freeze([...values])]),
  )), comments: Object.freeze([...policy.comments]) });
}

function commentMatchesPolicy(raw, policy) {
  const rootMatch = (roots, suffixPattern) => roots.some((root) => {
    if (!raw.startsWith(root)) return false;
    const suffix = raw.slice(root.length);
    try { safeRelativePath(suffix, 'generated source comment suffix'); } catch { return false; }
    return suffixPattern.test(suffix);
  });
  if (policy.artifactKind === 'module') {
    if (rootMatch(policy.roots.goScript, /^(?:[A-Za-z0-9_.@-]+\/)*[A-Za-z0-9_.@-]+\.ts$/)) return true;
    return rootMatch(policy.roots.staged, stagePathTail);
  }
  if (rootMatch(policy.roots.emitted, /^(?:[A-Za-z0-9_.@-]+\/)*[A-Za-z0-9_.@-]+\.ts$/)) return true;
  return policy.roots.helperEntry.includes(raw);
}

// Remove only anchored source comments authorized by roots recorded for the
// exact generated build. All code bytes and all unrecorded comments remain in
// the executable digest or cause admission to fail.
export function normalizeGeneratedArtifactText(text, sourceCommentPolicy) {
  if (typeof text !== 'string') throw new TypeError('generated artifact must be text');
  const policy = validatePolicy(sourceCommentPolicy);
  const lines = text.split(/\r?\n/);
  const kept = [];
  let removed = 0;
  const seenComments = [];
  for (const line of lines) {
    if (line.startsWith('//')) {
      if (!line.startsWith('// ') || !commentMatchesPolicy(line.slice(3), policy)) {
        throw new TypeError(`unexpected generated artifact comment ${JSON.stringify(line)}`);
      }
      removed += 1;
      seenComments.push(line.slice(3));
      continue;
    }
    kept.push(line);
  }
  if (removed === 0) throw new TypeError('generated artifact contains no recognized source-location comments');
  if (JSON.stringify(seenComments) !== JSON.stringify(policy.comments)) {
    throw new TypeError('generated artifact source comments differ from the exact recorded path inventory');
  }
  return kept.join('\n');
}

export function verifyGeneratedArtifactNormalization(text, label, sourceCommentPolicy, expectedContext = null) {
  const policy = validatePolicy(sourceCommentPolicy, expectedContext);
  const normalized = normalizeGeneratedArtifactText(text, policy);
  const originalDigest = new TextEncoder().encode(normalized);
  const codeLines = text.split(/\r?\n/).filter((line) => !line.startsWith('//'));
  const stringLiteral = /"(?:[^"\\]|\\.)*"/.exec(codeLines.join('\n'))?.[0];
  if (!stringLiteral) throw new TypeError(`${label} does not contain a testable code string literal`);
  const changedLiteral = stringLiteral.replace('"', '"_');
  const changedCode = text.replace(stringLiteral, changedLiteral);
  if (changedCode === text || normalizeGeneratedArtifactText(changedCode, policy) === normalized) {
    throw new TypeError(`${label} normalization failed to detect an executable string mutation`);
  }
  const codeToken = /\b[A-Za-z_$][A-Za-z0-9_$]*\b/.exec(codeLines.join('\n'))?.[0];
  if (!codeToken) throw new TypeError(`${label} does not contain a testable executable token`);
  const changedToken = `${codeToken[0] === 'X' ? 'Y' : 'X'}${codeToken.slice(1)}`;
  const changedExecutable = text.replace(codeToken, changedToken);
  if (changedExecutable === text || normalizeGeneratedArtifactText(changedExecutable, policy) === normalized) {
    throw new TypeError(`${label} normalization failed to detect an executable token mutation`);
  }
  let unexpectedCommentRejected = false;
  try { normalizeGeneratedArtifactText(`${text}\n// unexpected generated comment`, policy); }
  catch { unexpectedCommentRejected = true; }
  if (!unexpectedCommentRejected) throw new TypeError(`${label} normalization accepted an unexpected comment`);
  const pathComments = text.split(/\r?\n/).filter((line) =>
    line.startsWith('// ') && commentMatchesPolicy(line.slice(3), policy));
  if (pathComments.length === 0) throw new TypeError(`${label} is missing exact generated source-path comment syntax`);
  for (const pathComment of pathComments) {
    let alteredCommentRejected = false;
    try { normalizeGeneratedArtifactText(text.replace(pathComment, `${pathComment} * altered`), policy); }
    catch { alteredCommentRejected = true; }
    if (!alteredCommentRejected) throw new TypeError(`${label} normalization accepted an unexpected generated comment mutation`);
  }
  const alteredPath = `${pathComments[0]}/unrecorded-source.ts`;
  let unrecordedRootRejected = false;
  try { normalizeGeneratedArtifactText(text.replace(pathComments[0], alteredPath), policy); }
  catch { unrecordedRootRejected = true; }
  if (!unrecordedRootRejected) throw new TypeError(`${label} normalization accepted an unrecorded source-root mutation`);
  return Object.freeze({
    normalizedBytes: originalDigest.byteLength,
    executableMutationRejected: true,
    executableTokenMutationRejected: true,
    unexpectedCommentRejected: true,
    unrecordedSourceRootRejected: unrecordedRootRejected,
    recognizedCommentCount: pathComments.length,
    sourceCommentPolicy: policy,
  });
}

