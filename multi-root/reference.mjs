// The reference owns a separate JavaScript collection model for every root.
// It never reads candidate snapshots, session IDs, or renderer callbacks.
import { createCollectionReference } from "../keyed-editor/model.mjs";
import { mountReference } from "../keyed-editor/reference.mjs";

function fail(message) {
  throw new Error(`multi-root reference: ${message}`);
}

/** A host-manager-shaped facade backed only by independent JavaScript models. */
export function createMultiRootReference() {
  let nextSessionID = 0;
  const sessions = new Map();
  const disposed = new Set();

  function requireSession(sessionID) {
    if (!Number.isSafeInteger(sessionID) || sessionID <= 0) fail("session ID must be a positive safe integer");
    const session = sessions.get(sessionID);
    if (!session || session.disposed) fail(`unknown or disposed session ${sessionID}`);
    return session;
  }

  function applyCommands(session, commands) {
    for (const command of commands) {
      if (command.Kind === "start") session.pending.set(command.ID, command.Value);
      else if (command.Kind === "cancel") session.pending.delete(command.ID);
    }
    return commands;
  }

  return {
    create() {
      if (nextSessionID >= Number.MAX_SAFE_INTEGER) fail("session ID allocation exceeds the JavaScript-safe integer limit");
      nextSessionID += 1;
      const model = createCollectionReference();
      model.init();
      sessions.set(nextSessionID, { model, pending: new Map(), disposed: false });
      return nextSessionID;
    },
    snapshot(sessionID) {
      return requireSession(sessionID).model.snapshot();
    },
    dispatch(sessionID, step) {
      return requireSession(sessionID).model.dispatch(step);
    },
    effects(sessionID) {
      const session = requireSession(sessionID);
      return applyCommands(session, session.model.effects());
    },
    complete(sessionID, reply) {
      const session = requireSession(sessionID);
      session.pending.delete(reply?.ID);
      return session.model.complete(reply);
    },
    audit(sessionID) {
      return requireSession(sessionID).model.audit();
    },
    dispose(sessionID) {
      const session = requireSession(sessionID);
      applyCommands(session, session.model.effects());
      const cancels = [...session.pending.keys()].map((ID) => ({ Kind: "cancel", ID, Value: "" }));
      session.pending.clear();
      session.disposed = true;
      sessions.delete(sessionID);
      disposed.add(sessionID);
      return cancels;
    },
    list() {
      return [...sessions.keys()].sort((left, right) => left - right);
    },
    wasDisposed(sessionID) {
      return disposed.has(sessionID);
    },
  };
}

function rowInput(api, container, rowID) {
  const input = api.inputForKey(`row-${rowID}-input`);
  if (!input || !container.contains(input)) fail(`row ${rowID} has no mounted input`);
  return input;
}

/** Mount one independent React 19 collection reference in a root element. */
export function mountMultiRootReference(container) {
  const api = mountReference(container);
  let mounted = true;

  function requireMounted() {
    if (!mounted) fail("reference root has been unmounted");
  }

  function rowIndex(rowID) {
    const index = api.snapshot().state.Rows.findIndex((row) => row.ID === rowID);
    if (index < 0) fail(`unknown row ${rowID}`);
    return index;
  }

  return {
    init: () => { requireMounted(); return api.init(); },
    snapshot: () => { requireMounted(); return api.snapshot(); },
    dispatch: (step) => { requireMounted(); return api.dispatch(step); },
    complete: (reply) => { requireMounted(); return api.complete(reply); },
    effects: () => { requireMounted(); return api.effects(); },
    audit: () => { requireMounted(); return api.audit(); },
    domSnapshot: () => { requireMounted(); return api.domSnapshot(); },
    focusState: () => { requireMounted(); return api.focusState(); },
    click(path) { requireMounted(); return api.click(path); },
    clickAction(action, rowID = undefined) {
      requireMounted();
      const index = rowID === undefined ? -1 : rowIndex(rowID);
      const paths = {
        add: "0", reset: "1", save: `2/${index}/5`, remove: `2/${index}/6`,
        up: `2/${index}/7`, cancel: `2/${index}/8`,
      };
      if (!Object.hasOwn(paths, action) || (action !== "add" && action !== "reset" && index < 0)) {
        fail(`unsupported click action ${JSON.stringify(action)}`);
      }
      return api.click(paths[action]);
    },
    fill(rowID, value) {
      requireMounted();
      const input = rowInput(api, container, rowID);
      input.value = String(value);
      input.dispatchEvent(new container.ownerDocument.defaultView.InputEvent("input", { bubbles: true }));
      return api.snapshot();
    },
    focusRow(rowID, start, end, direction = "none") {
      requireMounted();
      const input = rowInput(api, container, rowID);
      input.focus();
      input.setSelectionRange(start, end, direction);
      return api.focusState();
    },
    unmount() {
      if (!mounted) return false;
      mounted = false;
      api.unmount();
      return true;
    },
  };
}

export { createCollectionReference } from "../keyed-editor/model.mjs";
