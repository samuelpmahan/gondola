// Small, self-contained positive control for checker mutation tests and the
// offline O-PROBE. It builds expected manager frames from the independent JS
// model; it does not use ignored build artifacts or a live browser.
import { createCompositionReference } from "../reference.mjs";
import { runReferenceScript } from "../scripts.mjs";

const clone = (value) => value === undefined ? undefined : structuredClone(value);
const call = (method, ...args) => ({ method, args });
const step = (Path, Key, Event = "click", Value = "") => ({ Path, Event, Value, Key });

const actions = [
  call("create"),
  call("createChild", 1),
  call("dispatch", 2, step("0", "add")),
  call("dispatch", 2, step("0", "add")),
  call("dispatch", 2, step("2/0/0", "row-1-input", "input", "first draft")),
  call("dispatch", 2, step("2/1/0", "row-2-input", "input", "second draft")),
  call("dispatch", 2, step("2/0/5", "row-1-save", "click", "1")),
  call("effects", 2),
  call("dispatch", 2, step("2/1/5", "row-2-save", "click", "2")),
  call("effects", 2),
  call("setChildInputs", 1, 2, { Title: "Locked child", ReadOnly: true }),
  call("dispatch", 2, step("2/0/0", "row-1-input", "input", "blockedinput")),
  call("setChildInputs", 2, 2, { Title: "wrong parent", ReadOnly: false }),
  call("disposeTree", 2),
];

export const positiveScript = Object.freeze({
  name: "checker-positive-control",
  seed: null,
  actions: Object.freeze(actions),
  inputWitnesses: Object.freeze([
    Object.freeze({ actionIndex: 4, requested: "first\n draft", effective: "first draft", key: "row-1-input" }),
    Object.freeze({ actionIndex: 5, requested: "second draft", effective: "second draft", key: "row-2-input" }),
    Object.freeze({ actionIndex: 11, requested: "blocked\ninput", effective: "blockedinput", key: "row-1-input" }),
  ]),
});

function attribute(node, name) {
  return node?.Attrs?.find((entry) => entry.Name === name) ?? null;
}

function textContent(node) {
  if (!node || typeof node !== "object") return "";
  if (node.Kind === 2) return node.Text ?? "";
  return (node.Kids ?? []).map(textContent).join("");
}

function walkElements(tree, callback, path = "", rowLabel = null) {
  if (!tree || typeof tree !== "object") return;
  const row = /^row-([1-9][0-9]*)$/.exec(tree.Key ?? "");
  const currentRow = row ? `Row ${row[1]}` : rowLabel;
  if (tree.Kind === 1) callback(tree, path, currentRow);
  for (const [index, child] of (tree.Kids ?? []).entries()) {
    walkElements(child, callback, path === "" ? String(index) : `${path}/${index}`, currentRow);
  }
}

function inputPathAndValue(tree, rowID) {
  let found = null;
  walkElements(tree, (node, path) => {
    if (node.Key === `row-${rowID}-input`) found = { path, value: attribute(node, "value")?.Value ?? "" };
  });
  return found;
}

function treeElementCount(tree) {
  let count = 0;
  walkElements(tree, () => { count += 1; });
  return count;
}

function callRecord(method, args, result) {
  return { method, args: clone(args), result: clone(result) };
}

function commandForSave(rowID) {
  const value = rowID === 1 ? "first draft" : "second draft";
  return { Kind: "start", ID: rowID, Value: value };
}

function cancelCommands() {
  return [
    { Kind: "cancel", ID: 1, Value: "" },
    { Kind: "cancel", ID: 2, Value: "" },
  ];
}

function makeCallChannels(index, action, native, side, transportState) {
  const args = action.args;
  const managerCalls = [];
  const managerEffects = [];
  const transportCalls = [];
  const before = transportState.sequence;

  function addEmptyEffects(sessionID) {
    managerCalls.push(callRecord("effects", [sessionID], []));
    managerEffects.push({ sessionID, commands: [] });
  }
  function addChanges() {
    managerCalls.push(callRecord("changes", [], native.frame.changes));
  }
  function appendTransport(kind, command) {
    transportState.sequence += 1;
    const payload = kind === "start"
      ? { ID: command.ID, Value: command.Value, command: clone(command) }
      : { ID: command.ID, previousState: "held", ignored: false };
    transportCalls.push({
      side,
      sessionID: 2,
      hostGeneration: 1,
      sequence: transportState.sequence,
      kind,
      payload,
    });
  }

  switch (action.method) {
    case "create":
      managerCalls.push(callRecord("create", [], native.result));
      addChanges();
      addEmptyEffects(native.result);
      break;
    case "createChild":
      managerCalls.push(callRecord("createChild", args, native.result));
      addChanges();
      addEmptyEffects(native.result);
      break;
    case "dispatch": {
      managerCalls.push(callRecord("dispatch", args, native.result));
      if (index === 11) break;
      addChanges();
      const rowSave = index === 6 ? 1 : index === 8 ? 2 : 0;
      const commands = rowSave ? [commandForSave(rowSave)] : [];
      managerCalls.push(callRecord("effects", [args[0]], commands));
      managerEffects.push({ sessionID: args[0], commands: clone(commands) });
      for (const command of commands) appendTransport("start", command);
      break;
    }
    case "setChildInputs":
      managerCalls.push(callRecord("setChildInputs", args, native.result));
      if (index === 10) {
        addChanges();
        addEmptyEffects(args[1]);
      }
      break;
    case "disposeTree": {
      managerCalls.push(callRecord("disposeTree", args, native.result));
      const commands = cancelCommands();
      for (const command of commands) appendTransport("cancel", command);
      break;
    }
    default:
      // The script's public `effects` action consumes the command list the
      // browser already drained while handling its preceding save action.
      break;
  }

  const witness = positiveScript.inputWitnesses.find((entry) => entry.actionIndex === index) ?? null;
  let inputObservation = null;
  if ((index === 4 || index === 5) && witness) {
    inputObservation = {
      mode: "dispatched",
      requested: witness.requested,
      key: witness.key,
      beforeValue: "",
      afterValue: witness.effective,
      effective: witness.effective,
      eventValue: action.args[1].Value,
      eventStep: clone(action.args[1]),
      expectedEffective: witness.effective,
      nativeDispatches: 1,
      directGuard: null,
    };
  } else if (index === 11 && witness) {
    const beforeSnapshot = clone(native.frame.sessions.find(({ id }) => id === 2)?.snapshot);
    const afterSnapshot = clone(beforeSnapshot);
    const beforeValue = inputPathAndValue(beforeSnapshot?.tree, 1)?.value ?? "";
    inputObservation = {
      mode: "blocked-disabled",
      requested: witness.requested,
      key: witness.key,
      beforeValue,
      afterValue: beforeValue,
      nativeDispatches: 0,
      eventValue: null,
      eventStep: null,
      nativeClick: true,
      nativeClickEvents: 0,
      nativeInputEvents: 0,
      snapshotBefore: clone(beforeSnapshot),
      snapshotAfter: clone(afterSnapshot),
      nativeChangesBefore: [],
      nativeChangesAfter: [],
      directGuard: {
        mode: "direct-manager-guard",
        method: "dispatch",
        args: clone(args),
        dispatchCalls: 1,
        snapshotBefore: clone(beforeSnapshot),
        snapshotAfter: clone(afterSnapshot),
        changesBefore: [],
        changesAfter: [],
        result: clone(native.result),
      },
    };
  }

  return {
    managerCalls,
    managerEffects,
    transportCalls,
    transportClock: { before, after: transportState.sequence },
    inputObservation,
  };
}

function makeSession(sessionEntry, treeEntry, side, index, action) {
  const { id: sessionID, snapshot } = sessionEntry;
  const state = snapshot.state;
  const controls = [];
  const inputs = [];
  const disabledPaths = [];
  walkElements(snapshot.tree, (node, path, rowLabel) => {
    if (node.Tag !== "button" && node.Tag !== "input") return;
    const className = attribute(node, "class")?.Value ?? "";
    const label = attribute(node, "aria-label")?.Value ?? "";
    const disabled = node.Attrs?.some((entry) => entry.Name === "disabled" && entry.Flag === true) ?? false;
    if (disabled) disabledPaths.push(path);
    controls.push({
      tag: node.Tag,
      key: node.Key,
      path,
      className,
      label,
      rowLabel,
      text: textContent(node),
      value: node.Tag === "input" ? (attribute(node, "value")?.Value ?? "") : null,
      disabled,
      disabledAttribute: disabled,
      type: attribute(node, "type")?.Value ?? null,
    });
    if (node.Tag === "input") {
      inputs.push({
        key: node.Key,
        path,
        value: attribute(node, "value")?.Value ?? "",
        disabled,
        disabledAttribute: disabled,
        selectionStart: 0,
        selectionEnd: 0,
        selectionDirection: "none",
      });
    }
  });
  const focused = action.method === "dispatch" && action.args[1]?.Event === "input" &&
    Number(action.args[1]?.Key?.match(/^row-(\d+)-input$/)?.[1]) > 0 &&
    action.args[0] === sessionID && !state.Inputs.ReadOnly;
  if (focused) {
    const input = inputs.find((entry) => entry.key === action.args[1].Key);
    if (input) {
      input.selectionStart = 0;
      input.selectionEnd = Math.min(2, input.value.length);
      input.selectionDirection = "backward";
    }
  }
  const treeElementN = treeElementCount(snapshot.tree);
  const actualDisabled = controls.filter((entry) => entry.disabled).map((entry) => entry.path).sort();
  const titleNode = (() => {
    let result = null;
    walkElements(snapshot.tree, (node) => { if (node.Key === "composition-title") result = node; });
    return result;
  })();
  const inboxNode = (() => {
    let result = null;
    walkElements(snapshot.tree, (node) => { if (node.Key === "composition-inbox") result = node; });
    return result;
  })();
  const focusWitness = focused ? (() => {
    const input = inputs.find((entry) => entry.key === action.args[1].Key);
    return { active: true, key: input.key, path: input.path, selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd, selectionDirection: input.selectionDirection, value: input.value, disabled: input.disabled };
  })() : null;
  return {
    sessionID,
    parentID: treeEntry.ParentID,
    depth: treeEntry.Depth,
    generation: 1,
    backend: side === "candidate" && index >= 4 && sessionID === 2 ? "godom" : side === "reference" ? "react" : "dom",
    managerSnapshot: clone(snapshot),
    snapshot: clone(snapshot),
    hostSnapshot: clone(snapshot),
    audit: [],
    managerAudit: [],
    domSnapshot: { html: JSON.stringify(snapshot.tree), disabled: actualDisabled },
    actualDOM: JSON.stringify(snapshot.tree),
    actualDOMMatchesSnapshot: true,
    shellHTML: "",
    focus: null,
    focusWitness,
    lifecycle: "active",
    errors: [],
    inputs,
    controls,
    elementCountMatches: true,
    elementCounts: { tree: treeElementN, dom: treeElementN },
    disabledViolations: [],
    reportedDisabled: actualDisabled,
    actualDisabled,
    reportedDisabledMatches: true,
    visibleTitle: textContent(titleNode),
    expectedTitle: `Title: ${state.Inputs.Title}`,
    visibleInbox: textContent(inboxNode),
    expectedInbox: `Published: ${state.Inbox.length}`,
    transportLog: [],
    rowOrder: state.Rows.map((row) => `Row ${row.ID}`),
    inputOrder: inputs.map((input) => `Row ${/^row-([1-9][0-9]*)-input$/.exec(input.key)?.[1] ?? ""}`),
    inputValues: inputs.map((input) => input.value),
    shellOwnership: {
      shellChildren: ["session-tree-view", "session-tree-children"],
      viewContained: true,
      childrenContained: true,
        physicalParent: treeEntry.ParentID === 0 ? "root-slot" : "session-tree-children",
    },
  };
}

function makeFocusReplacement(action, native) {
  const witness = positiveScript.inputWitnesses[0];
  const afterValue = witness.effective;
  const focus = {
    active: true,
    key: witness.key,
    path: action.args[1].Path,
    selectionStart: 0,
    selectionEnd: 2,
    selectionDirection: "backward",
    value: afterValue,
    disabled: false,
  };
  return {
    sessionID: action.args[0],
    from: "react",
    to: "godom",
    result: true,
    expectedKey: witness.key,
    before: clone(focus),
    after: clone(focus),
    afterSettled: clone(focus),
    inputValue: afterValue,
    snapshotBefore: clone(native.frame.sessions.find(({ id }) => id === action.args[0])?.snapshot),
    snapshotAfter: clone(native.frame.sessions.find(({ id }) => id === action.args[0])?.snapshot),
    treeBefore: clone(native.frame.tree),
    treeAfter: clone(native.frame.tree),
  };
}

export function makePositiveScenario() {
  const frames = runReferenceScript(createCompositionReference(), positiveScript);
  const transportState = { candidate: { sequence: 0 }, reference: { sequence: 0 } };
  const browserFrames = frames.map((native, index) => {
    const action = positiveScript.actions[index];
    const candidateChannels = makeCallChannels(index, action, native, "candidate", transportState.candidate);
    const referenceChannels = makeCallChannels(index, action, native, "reference", transportState.reference);
    const makeActor = (side, channels) => {
      const tree = native.frame.tree;
      const sessionIDs = tree.map((entry) => entry.SessionID);
      const sessions = native.frame.sessions.map((entry) => makeSession(entry,
        tree.find((treeEntry) => treeEntry.SessionID === entry.id), side, index, action));
      const disposedIDs = index === 13 ? [2] : [];
      const lifecycle = [
        ...sessionIDs.map((sessionID) => {
          const treeEntry = tree.find((entry) => entry.SessionID === sessionID);
          return { sessionID, parentID: treeEntry.ParentID, depth: treeEntry.Depth,
            backend: side === "reference" ? "react" : sessionID === 1 ? "dom" : index >= 4 ? "godom" : "react",
            lifecycle: "active" };
        }),
        ...(disposedIDs.length ? [{ sessionID: 2, parentID: 1, depth: 2, backend: side === "reference" ? "react" : "godom", lifecycle: "disposed" }] : []),
      ];
      return {
        managerTree: clone(tree),
        hostTree: clone(tree),
        managerList: clone(sessionIDs),
        snapshotAllIDs: clone(sessionIDs),
        activeIDs: clone(sessionIDs),
        sessions,
        changes: clone(native.frame.changes),
        managerCalls: channels.managerCalls,
        managerEffects: channels.managerEffects,
        effectsPending: [],
        transportCalls: channels.transportCalls,
        transportClock: channels.transportClock,
        lifecycle,
        actionResult: clone(native.result),
        disposedIDs,
        settledError: null,
        disabledStepProbe: index === 11,
        inputObservation: clone(channels.inputObservation),
        inputWitnessObservation: channels.inputObservation ? {
          requested: channels.inputObservation.requested,
          effective: channels.inputObservation.effective ?? channels.inputObservation.expectedEffective,
          eventValue: channels.inputObservation.eventValue ?? positiveScript.inputWitnesses.find((entry) => entry.actionIndex === index)?.effective,
          expectedEffective: channels.inputObservation.expectedEffective ?? positiveScript.inputWitnesses.find((entry) => entry.actionIndex === index)?.effective,
          key: channels.inputObservation.key,
        } : null,
        focusReplacement: side === "candidate" && index === 4 ? makeFocusReplacement(action, native) : null,
      };
    };
    return {
      index,
      action: clone(action),
      operationResults: { candidate: clone(native.result), reference: clone(native.result) },
      candidate: makeActor("candidate", candidateChannels),
      reference: makeActor("reference", referenceChannels),
      captureOrder: ["candidate", "reference"],
      inputWitness: clone(positiveScript.inputWitnesses.find((entry) => entry.actionIndex === index) ?? null),
    };
  });
  return {
    name: positiveScript.name,
    seed: null,
    actions: clone(positiveScript.actions),
    inputWitnesses: clone(positiveScript.inputWitnesses),
    nativeFrames: clone(frames),
    modelFrames: clone(frames),
    browserFrames,
    browserErrors: [],
  };
}

export function positiveScenarioJSON() {
  return `${JSON.stringify(makePositiveScenario(), null, 2)}\n`;
}
