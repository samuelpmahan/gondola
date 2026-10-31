const FAULTS = new Set([
  "text-corruption",
  "key-order",
  "enabled-control",
  "drop-click",
  "duplicate-click",
]);

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function callbackCountsSnapshot(counts) {
  return { ...counts };
}

function pathFromRoot(root, target) {
  if (!root || !target) return null;
  if (root === target) return "";
  const indexes = [];
  let node = target;
  while (node && node !== root) {
    const parent = node.parentNode;
    if (!parent) return null;
    const index = Array.prototype.indexOf.call(parent.childNodes, node);
    if (index < 0) return null;
    indexes.unshift(index);
    node = parent;
  }
  return node === root ? indexes.join("/") : null;
}

function targetSnapshot(root, target) {
  const textNode = target?.nodeType === 3;
  return {
    path: pathFromRoot(root, target),
    tag: textNode ? "#text" : String(target?.localName ?? target?.nodeName ?? "").toLowerCase(),
    connected: typeof target?.isConnected === "boolean" ? target.isConnected : null,
    disabled: typeof target?.disabled === "boolean" ? target.disabled : null,
    text: String(target?.textContent ?? ""),
    outerHTML: typeof target?.outerHTML === "string" ? target.outerHTML : null,
  };
}

function firstTextNode(root) {
  for (const child of root?.childNodes ?? []) {
    if (child.nodeType === 3) return child;
    const nested = firstTextNode(child);
    if (nested) return nested;
  }
  return null;
}

function rowOrder(container) {
  return [...container.children].map((row) => String(row.textContent ?? ""));
}

/**
 * Create a fault decorator for the actual React/DOM renderer boundary.
 * Fault injection stays off unless the caller explicitly passes one of the
 * five named families. It changes rendered DOM or callbacks, never Go state,
 * expected values, or captured trace data.
 */
export function createQualificationDecorator({ fault = null, onActivation } = {}) {
  if (fault !== null && fault !== undefined && fault !== "none" && !FAULTS.has(fault)) {
    throw new TypeError(`unknown qualification fault ${JSON.stringify(fault)}`);
  }
  if (onActivation !== undefined && typeof onActivation !== "function") {
    throw new TypeError("onActivation must be a function when provided");
  }

  const family = fault === "none" ? null : fault;
  const activations = [];
  const counts = { rendererDispatch: 0, rendererStale: 0, forwardedDispatch: 0, forwardedStale: 0 };
  let faultActivated = false;
  let disposed = false;
  let captureContainer = null;
  let captureListener = null;
  let clickActivation = null;

  function publishActivation(record) {
    activations.push(record);
    if (onActivation) onActivation(clone(record));
  }

  function finishClickActivation() {
    if (!clickActivation || clickActivation.record.callbackInvocationsAfter !== null) return;
    const { record, target, container } = clickActivation;
    record.target.after = targetSnapshot(container.firstElementChild, target);
    record.callbackInvocationsAfter = callbackCountsSnapshot(counts);
  }

  function observePhysicalClick({ backend, container, getActiveEventIndex }) {
    if (captureListener) return;
    captureContainer = container;
    captureListener = (event) => {
      if (disposed || faultActivated || !["drop-click", "duplicate-click"].includes(family)) return;
      const eventIndex = getActiveEventIndex();
      if (eventIndex !== 0) return;
      const target = event.target;
      if (!target) return;
      faultActivated = true;
      const record = {
        fault: family,
        backend,
        eventIndex,
        target: {
          path: pathFromRoot(container.firstElementChild, target),
          tag: String(target.localName ?? target.nodeName ?? "").toLowerCase(),
          before: targetSnapshot(container.firstElementChild, target),
          after: null,
        },
        callbackInvocationsBefore: callbackCountsSnapshot(counts),
        callbackInvocationsAfter: null,
      };
      clickActivation = { record, target, container };
      publishActivation(record);
    };
    container.addEventListener("click", captureListener, true);
  }

  function activateInitialFault({ backend, container, updateIndex, eventIndex }) {
    if (disposed || faultActivated || updateIndex !== 0 || eventIndex !== null) return;
    if (!["react", "dom"].includes(backend)) return;

    const root = container.firstElementChild;
    if (!root) throw new Error(`${family} did not find a rendered root element`);
    let target;
    let targetDetails;

    if (family === "text-corruption") {
      target = firstTextNode(root);
      if (!target) throw new Error("text-corruption did not find an actual DOM text node");
      const before = targetSnapshot(root, target);
      target.textContent = `${target.textContent} [qualification text fault]`;
      targetDetails = { ...before, before, after: targetSnapshot(root, target) };
    } else if (family === "key-order") {
      target = container.querySelector(".children");
      const rows = target ? [...target.children] : [];
      if (!target || rows.length < 2) throw new Error("key-order did not find two rendered keyed child rows");
      const before = {
        path: pathFromRoot(root, target),
        tag: String(target.localName ?? target.nodeName ?? "").toLowerCase(),
        outerHTML: target.outerHTML,
        childOrder: rowOrder(target),
      };
      target.insertBefore(rows[1], rows[0]);
      targetDetails = {
        path: before.path,
        tag: before.tag,
        before,
        after: {
          path: pathFromRoot(root, target),
          tag: String(target.localName ?? target.nodeName ?? "").toLowerCase(),
          outerHTML: target.outerHTML,
          childOrder: rowOrder(target),
        },
      };
    } else if (family === "enabled-control") {
      target = [...container.querySelectorAll("button")].find((button) => button.disabled === true);
      if (!target) throw new Error("enabled-control did not find an initially disabled rendered button");
      const before = targetSnapshot(root, target);
      target.disabled = false;
      target.removeAttribute("disabled");
      targetDetails = { ...before, before, after: targetSnapshot(root, target) };
    } else {
      return;
    }

    faultActivated = true;
    publishActivation({
      fault: family,
      backend,
      eventIndex: null,
      target: targetDetails,
      callbackInvocationsBefore: callbackCountsSnapshot(counts),
      callbackInvocationsAfter: callbackCountsSnapshot(counts),
    });
  }

  const rendererDecorator = {
    wrapCallbacks({ backend, callbacks, getActiveEventIndex, container }) {
      const invoke = (name, counterName, forwardedName, args) => {
        counts[counterName] += 1;
        const eventIndex = getActiveEventIndex();
        const isFaultClick = eventIndex === 0 && clickActivation?.record.fault === family;
        if (isFaultClick && family === "drop-click" && name === "dispatch") {
          finishClickActivation();
          return undefined;
        }

        counts[forwardedName] += 1;
        let result;
        try {
          result = callbacks[name](...args);
          if (isFaultClick && family === "duplicate-click" && name === "dispatch" && !clickActivation.duplicateApplied) {
            clickActivation.duplicateApplied = true;
            counts[forwardedName] += 1;
            callbacks[name](...args);
          }
          return result;
        } finally {
          if (isFaultClick) finishClickActivation();
        }
      };

      return {
        ...callbacks,
        dispatch(...args) {
          return invoke("dispatch", "rendererDispatch", "forwardedDispatch", args);
        },
        onStaleAction(...args) {
          return invoke("onStaleAction", "rendererStale", "forwardedStale", args);
        },
      };
    },

    afterUpdate({ backend, updateIndex, container, getActiveEventIndex }) {
      if (["drop-click", "duplicate-click"].includes(family)) {
        observePhysicalClick({ backend, container, getActiveEventIndex });
      } else {
        activateInitialFault({ backend, container, updateIndex, eventIndex: getActiveEventIndex() });
      }
    },

    dispose() {
      if (disposed) return { disposed: true, listenerRemoved: captureListener === null };
      disposed = true;
      if (captureContainer && captureListener) captureContainer.removeEventListener("click", captureListener, true);
      captureContainer = null;
      captureListener = null;
      clickActivation = null;
      return { disposed: true, listenerRemoved: true };
    },
  };

  return {
    rendererDecorator,
    activationRecords() { return clone(activations); },
    callbackInvocations() { return callbackCountsSnapshot(counts); },
    dispose() { return rendererDecorator.dispose(); },
  };
}
