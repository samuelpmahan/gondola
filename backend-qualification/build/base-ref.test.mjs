import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { contractBaseCommitRef, validateContractBaseCommitRef } from "./build.mjs";

const contractText = await readFile(new URL("../CONTRACT.md", import.meta.url), "utf8");
const contractHeaderRef = contractText.match(/^Base([0-9a-f]+)\(PR17\)/m)?.[1];

test("builder base reference is a full 40-character match for the contract", () => {
  assert.equal(contractBaseCommitRef.length, 40);
  assert.equal(contractBaseCommitRef, "5662efcd7feb7920e4690d38cc76a297fed69d5a");
  assert.equal(contractHeaderRef, contractBaseCommitRef);
  assert.equal(validateContractBaseCommitRef(contractBaseCommitRef, contractText), contractBaseCommitRef);
});

test("rejects a truncated 39-character base reference", () => {
  const truncated = "5662efcd7feb7920e4690d38cc76a297fed69d5";
  assert.equal(truncated.length, 39);
  assert.throws(
    () => validateContractBaseCommitRef(truncated, contractText),
    /exactly 40 lowercase hexadecimal characters/,
  );
});

test("rejects a different but valid-length commit reference", () => {
  assert.throws(
    () => validateContractBaseCommitRef("0".repeat(40), contractText),
    /does not match backend-qualification\/CONTRACT\.md/,
  );
});

test("rejects a contract without a full PR17 base line", () => {
  assert.throws(
    () => validateContractBaseCommitRef(contractBaseCommitRef, "Base5662efcd7feb7920e4690d38cc76a297fed69d5(PR17)."),
    /must declare a 40-character PR17 base commit/,
  );
});
