import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const sourcePath = process.argv[2];
assert(sourcePath, 'source path is required');
const source = await readFile(sourcePath, 'utf8');
const functionStart = source.indexOf('async function runArchiveHelperTests() {');
assert(functionStart >= 0, 'runArchiveHelperTests function is missing');
const guardStart = source.indexOf('if (tap.tests', functionStart);
assert(guardStart >= 0, 'archive helper TAP admission guard is missing');
const open = source.indexOf('(', guardStart);
let depth = 0;
let close = -1;
for (let i = open; i < source.length; i += 1) {
  if (source[i] === '(') depth += 1;
  if (source[i] === ')') {
    depth -= 1;
    if (depth === 0) { close = i; break; }
  }
}
assert(close > open, 'could not extract the complete admission predicate');
const expression = source.slice(open + 1, close).trim();
assert(source.slice(close + 1).startsWith(' {'), 'extracted predicate is not the current if guard');
const rejects = new Function('tap', `return Boolean(${expression});`);
const cases = [
  { name: 'minimum-five-clean', tap: { tests: 5, pass: 5, fail: 0, cancelled: 0, skipped: 0, todo: 0 }, expectedReject: false },
  { name: 'six-clean', tap: { tests: 6, pass: 6, fail: 0, cancelled: 0, skipped: 0, todo: 0 }, expectedReject: false },
  { name: 'too-few-four-clean', tap: { tests: 4, pass: 4, fail: 0, cancelled: 0, skipped: 0, todo: 0 }, expectedReject: true },
  { name: 'failing-test', tap: { tests: 5, pass: 4, fail: 1, cancelled: 0, skipped: 0, todo: 0 }, expectedReject: true },
  { name: 'pass-count-mismatch', tap: { tests: 6, pass: 5, fail: 0, cancelled: 0, skipped: 0, todo: 0 }, expectedReject: true },
  { name: 'cancelled-test', tap: { tests: 5, pass: 5, fail: 0, cancelled: 1, skipped: 0, todo: 0 }, expectedReject: true },
  { name: 'skipped-test', tap: { tests: 5, pass: 5, fail: 0, cancelled: 0, skipped: 1, todo: 0 }, expectedReject: true },
  { name: 'todo-test', tap: { tests: 5, pass: 5, fail: 0, cancelled: 0, skipped: 0, todo: 1 }, expectedReject: true },
  { name: 'missing-counts', tap: { tests: null, pass: null, fail: null, cancelled: null, skipped: null, todo: null }, expectedReject: true },
];
for (const item of cases) assert.equal(rejects(item.tap), item.expectedReject, item.name);
const output = {
  status: 'passed',
  method: 'extract and evaluate the exact if predicate from runArchiveHelperTests in the supplied source file',
  sourcePath,
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  guardExpression: expression,
  cases: cases.map(({ name, expectedReject }) => ({ name, expected: expectedReject ? 'reject' : 'accept' })),
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
