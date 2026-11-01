export const REQUIRED_CAPTURE_MUTATION_IDS = Object.freeze([
  "bypass-go-cancellation",
  "cancel-sibling-pending-request",
  "accept-duplicate-reply",
  "accept-wrong-correlation-tuple",
  "accept-old-generation-reply",
  "confuse-renderer-epoch-with-reply-correlation",
  "start-before-commit-render",
  "call-transport-cancel-before-retiring-correlation",
  "accept-reply-without-correlation",
  "accept-reply-with-wrong-state-event-index",
  "accept-reply-with-extra-correlation-field",
  "accept-reply-with-wrong-dispatch-correlation",
  "accept-reply-with-wrong-effect-correlation",
  "accept-duplicate-reply-with-wrong-state-event-index",
  "accept-cancelled-reply-without-correlation",
  "accept-cancelled-reply-with-wrong-state-event-index",
]);

export const REQUIRED_BUILD_MUTATION_IDS = Object.freeze([
  "remove-cancel-descriptor",
  "remove-cancel-capability",
  "unadmit-react-child",
  "wrong-dom-child-package",
  "remove-react-keyed-helper",
  "drop-source-pin",
  "replace-dom-child-uint64-with-number",
]);

export function validateMutationControlReport(report, {
  label = "mutation control report",
  requiredControlIds,
  allowAdditionalControls = false,
} = {}) {
  if (!Array.isArray(requiredControlIds) || requiredControlIds.length === 0 ||
      requiredControlIds.some((id) => typeof id !== "string" || id.length === 0) ||
      new Set(requiredControlIds).size !== requiredControlIds.length) {
    throw new TypeError(`${label}.requiredControlIds must be a nonempty unique string array`);
  }
  if (typeof allowAdditionalControls !== "boolean") {
    throw new TypeError(`${label}.allowAdditionalControls must be boolean`);
  }
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new TypeError(`${label} must be an object`);
  }
  if (report.status !== "detected") throw new Error(`${label}.status must be detected`);
  if (!Array.isArray(report.rejected) || report.rejected.length === 0) {
    throw new Error(`${label}.rejected must be a nonempty array`);
  }

  const seen = new Set();
  const controls = report.rejected.map((control, index) => {
    if (!control || typeof control !== "object" || Array.isArray(control)) {
      throw new TypeError(`${label}.rejected[${index}] must be an object`);
    }
    const id = control.id ?? control.name;
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(`${label}.rejected[${index}].id must be a nonempty string`);
    }
    if (control.id !== undefined && control.name !== undefined && control.id !== control.name) {
      throw new Error(`${label}.rejected[${index}].id must match name`);
    }
    if (seen.has(id)) throw new Error(`${label} contains duplicate control id ${id}`);
    seen.add(id);
    if (control.rejected !== true) throw new Error(`${label} control ${id} was not rejected`);
    if (typeof control.path !== "string" || control.path.length === 0) {
      throw new Error(`${label} control ${id} must include a failure path`);
    }
    return { ...control, id };
  });

  const derivedTotal = controls.length;
  if (!Number.isSafeInteger(report.total) || report.total !== derivedTotal) {
    throw new Error(`${label}.total must equal rejected.length (${derivedTotal})`);
  }

  const missing = requiredControlIds.filter((id) => !seen.has(id));
  if (missing.length !== 0) {
    throw new Error(`${label} is missing required controls: ${missing.join(", ")}`);
  }
  const requiredIds = new Set(requiredControlIds);
  const extra = controls.map(({ id }) => id).filter((id) => !requiredIds.has(id));
  if (extra.length !== 0 && !allowAdditionalControls) {
    throw new Error(`${label} contains additional controls without explicit policy: ${extra.join(", ")}`);
  }

  return {
    status: "detected",
    total: derivedTotal,
    requiredControlIds: [...requiredControlIds],
    allowAdditionalControls,
    rejected: controls,
  };
}

export function validateCaptureMutationReport(report, { allowAdditionalControls = false } = {}) {
  return validateMutationControlReport(report, {
    label: "capture mutation report",
    requiredControlIds: REQUIRED_CAPTURE_MUTATION_IDS,
    allowAdditionalControls,
  });
}

export function validateBuildMutationReport(report) {
  return validateMutationControlReport(report, {
    label: "build admission mutation report",
    requiredControlIds: REQUIRED_BUILD_MUTATION_IDS,
    allowAdditionalControls: false,
  });
}
