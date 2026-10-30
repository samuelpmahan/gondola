// Independent JavaScript model and Go-shaped projection for the keyed
// collection experiment. This module deliberately does not import Go code or a
// candidate renderer.

import { encodeHTTP, decodeHTTP } from "../http-effects/reference.mjs";

export const MAX_COLLECTION_ID = Number.MAX_SAFE_INTEGER;
export const MAX_ROWS = 4;

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const copy = {};
    for (const [key, item] of Object.entries(value)) copy[key] = clone(item);
    return copy;
  }
  return value;
}

function exactFields(value, expected, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${description} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${description} must contain exactly ${wanted.join(", ")}`);
  }
}

function validateStep(raw) {
  exactFields(raw, ["Path", "Event", "Value", "Key"], "dispatch step");
  if (typeof raw.Path !== "string" || typeof raw.Event !== "string" ||
      typeof raw.Value !== "string" || typeof raw.Key !== "string") {
    throw new TypeError("dispatch step Path, Event, Value, and Key must be strings");
  }
  return { Path: raw.Path, Event: raw.Event, Value: raw.Value, Key: raw.Key };
}

function validateReply(raw) {
  exactFields(raw, ["ID", "Value", "Error"], "reply");
  if (!Number.isSafeInteger(raw.ID) || raw.ID < 1 || raw.ID > MAX_COLLECTION_ID) {
    throw new RangeError("reply ID must be a positive JavaScript-safe integer");
  }
  if (typeof raw.Value !== "string" || typeof raw.Error !== "string") {
    throw new TypeError("reply Value and Error must be primitive strings");
  }
  return { ID: raw.ID, Value: raw.Value, Error: raw.Error };
}

const attr = (Name, Value = "", Flag = false) => ({ Name, Value, Flag, Style: null });
const text = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
const element = (Tag, Key, Attrs, On, Kids) => ({ Kind: 1, Tag, Key, Attrs, On, Kids, Text: "" });
const literal = (Event, Message, Arg = "") => ({ Event, Message, Arg });
const rowKey = (id, suffix = "") => `row-${id}${suffix ? `-${suffix}` : ""}`;

function initialState() {
  return { Rows: [], NextID: 0, NextRequestID: 0 };
}

function rowCopy(row) {
  return {
    ID: row.ID,
    Draft: row.Draft,
    Saved: row.Saved,
    Saves: row.Saves,
    PendingID: row.PendingID,
    Status: row.Status,
  };
}

function rowNode(row, index) {
  const id = row.ID;
  const rowID = String(id);
  const saveAttrs = [attr("class", "save")];
  if (row.Draft === "") saveAttrs.push(attr("disabled", "", true));
  const upAttrs = [attr("class", "up")];
  if (index === 0) upAttrs.push(attr("disabled", "", true));
  const cancelAttrs = [attr("class", "cancel")];
  if (row.PendingID === 0) cancelAttrs.push(attr("disabled", "", true));

  return element("div", rowKey(id), [attr("class", "row")], null, [
    element("input", rowKey(id, "input"), [
      attr("type", "text"),
      attr("value", row.Draft),
      attr("aria-label", `Row ${rowID}`),
    ], null, null),
    element("p", rowKey(id, "saved"), null, null, [text("Saved: "), text(row.Saved)]),
    element("p", rowKey(id, "saves"), null, null, [text("Saves: "), text(String(row.Saves))]),
    element("p", rowKey(id, "status"), null, null, [text(`Status: ${row.Status}`)]),
    element("p", rowKey(id, "pending"), null, null, [text(`Pending: ${String(row.PendingID)}`)]),
    element("button", rowKey(id, "save"), saveAttrs, [literal("click", "save", rowID)], [text("Save")]),
    element("button", rowKey(id, "remove"), [attr("class", "remove")],
      [literal("click", "remove", rowID)], [text("Remove")]),
    element("button", rowKey(id, "up"), upAttrs, [literal("click", "up", rowID)], [text("Up")]),
    element("button", rowKey(id, "cancel"), cancelAttrs, [literal("click", "cancel", rowID)], [text("Cancel")]),
  ]);
}

function treeFor(state) {
  const addAttrs = [attr("class", "add")];
  if (state.Rows.length >= MAX_ROWS) addAttrs.push(attr("disabled", "", true));
  const resetAttrs = [attr("class", "reset")];
  if (state.Rows.length === 0) resetAttrs.push(attr("disabled", "", true));
  return element("div", "collection", [attr("class", "collection")], null, [
    element("button", "add", addAttrs, [literal("click", "add")], [text("Add row")]),
    element("button", "reset", resetAttrs, [literal("click", "reset")], [text("Reset")]),
    element("div", "rows", [attr("class", "rows")], null,
      state.Rows.length === 0 ? null : state.Rows.map(rowNode)),
  ]);
}

function bindingsFor(state) {
  return state.Rows.map((row, index) => ({
    Path: `2/${index}/0`,
    Event: "input",
    Message: `edit/${row.ID}`,
    Source: "target.value",
  }));
}

function project(state, messages) {
  return {
    state: {
      Rows: state.Rows.map(rowCopy),
      NextID: state.NextID,
      NextRequestID: state.NextRequestID,
    },
    tree: treeFor(state),
    bindings: bindingsFor(state),
    messages: messages.map(({ Name, Arg }) => ({ Name, Arg })),
  };
}

function parsePath(path) {
  if (path === "") return [];
  if (!/^(?:0|[1-9]\d*)(?:\/(?:0|[1-9]\d*))*$/.test(path)) {
    throw new Error(`invalid child path ${JSON.stringify(path)}`);
  }
  const result = path.split("/").map(Number);
  if (result.some((index) => !Number.isSafeInteger(index))) {
    throw new Error(`invalid child index in path ${JSON.stringify(path)}`);
  }
  return result;
}

function nodeAtPath(root, path) {
  let node = root;
  for (const index of parsePath(path)) {
    if (!Array.isArray(node.Kids) || index >= node.Kids.length) {
      throw new Error(`child index ${index} out of range in path ${JSON.stringify(path)}`);
    }
    node = node.Kids[index];
  }
  return node;
}

function isDisabled(node) {
  return (node.Attrs ?? []).some((item) => item.Name === "disabled" && item.Flag);
}

function sameTargetBinding(bindings, step) {
  return bindings.find((binding) => binding.Path === step.Path && binding.Event === step.Event);
}

function sameTargetHandler(target, event) {
  const handlers = (target.On ?? []).filter((handler) => handler.Event === event);
  if (handlers.length > 1) throw new Error(`ambiguous literal ${JSON.stringify(event)} handler`);
  return handlers[0] ?? null;
}

function locateStep(state, step) {
  const tree = treeFor(state);
  const target = nodeAtPath(tree, step.Path);
  // Identity is checked before disabled suppression and before handler lookup.
  if (target.Key !== step.Key) {
    throw new Error(`dispatch key ${JSON.stringify(step.Key)} does not match target key ${JSON.stringify(target.Key)}`);
  }
  return { tree, target, indexes: parsePath(step.Path) };
}

function cloneCommands(commands) {
  return commands.map(({ Kind, ID, Value }) => ({ Kind, ID, Value }));
}

/** Create a fully independent collection model with a Go-shaped public API. */
export function createCollectionReference() {
  let state = initialState();
  let messages = [];
  let outbox = [];
  let audit = [];
  let requestRows = new Map();

  const snapshot = () => project(state, messages);

  function init() {
    state = initialState();
    messages = [];
    outbox = [];
    audit = [];
    requestRows = new Map();
    return snapshot();
  }

  function dispatch(rawStep) {
    const step = validateStep(rawStep);
    const { tree, target, indexes } = locateStep(state, step);
    if (isDisabled(target)) return snapshot();

    let message = null;
    let row = null;
    const binding = sameTargetBinding(bindingsFor(state), step);
    if (binding) {
      if (binding.Source !== "target.value") throw new Error(`unsupported binding source ${binding.Source}`);
      const rowID = Number(binding.Message.slice("edit/".length));
      row = state.Rows.find((candidate) => candidate.ID === rowID);
      if (!row) throw new Error(`edit binding refers to missing row ${rowID}`);
      message = { Name: binding.Message, Arg: step.Value };
    } else {
      const handler = sameTargetHandler(target, step.Event);
      if (!handler) throw new Error(`no ${JSON.stringify(step.Event)} handler or binding at path ${JSON.stringify(step.Path)}`);
      message = { Name: handler.Message, Arg: handler.Arg };
      if (handler.Arg !== "") {
        const rowID = Number(handler.Arg);
        row = state.Rows.find((candidate) => candidate.ID === rowID) ?? null;
        if (!row) throw new Error(`handler refers to missing row ${rowID}`);
      }
    }

    // Stage all mutable values so overflow or malformed input leaves every
    // visible value, message, and effect untouched.
    const next = {
      Rows: state.Rows.map(rowCopy),
      NextID: state.NextID,
      NextRequestID: state.NextRequestID,
    };
    const commands = [];
    const stagedMappings = [];
    const id = row?.ID ?? 0;

    switch (message.Name) {
      case "add":
        if (next.Rows.length >= MAX_ROWS) break;
        if (next.NextID >= MAX_COLLECTION_ID) throw new RangeError("row ID allocation exceeds the JavaScript-safe integer limit");
        next.NextID += 1;
        next.Rows.push({ ID: next.NextID, Draft: "", Saved: "", Saves: 0, PendingID: 0, Status: "idle" });
        break;
      case "edit/" + id:
        row = next.Rows.find((candidate) => candidate.ID === id);
        row.Draft = message.Arg;
        break;
      case "save": {
        row = next.Rows.find((candidate) => candidate.ID === id);
        if (!row || row.Draft === "") break;
        if (next.NextRequestID >= MAX_COLLECTION_ID) {
          throw new RangeError("request ID allocation exceeds the JavaScript-safe integer limit");
        }
        if (row.PendingID !== 0) commands.push({ Kind: "cancel", ID: row.PendingID, Value: "" });
        next.NextRequestID += 1;
        row.PendingID = next.NextRequestID;
        row.Status = "pending";
        stagedMappings.push([row.PendingID, row.ID]);
        commands.push({ Kind: "start", ID: row.PendingID, Value: row.Draft });
        break;
      }
      case "cancel":
        row = next.Rows.find((candidate) => candidate.ID === id);
        if (row?.PendingID) {
          commands.push({ Kind: "cancel", ID: row.PendingID, Value: "" });
          row.PendingID = 0;
          row.Status = "cancelled";
        }
        break;
      case "remove": {
        const rowIndex = next.Rows.findIndex((candidate) => candidate.ID === id);
        if (rowIndex < 0) throw new Error(`remove handler refers to missing row ${id}`);
        const removing = next.Rows[rowIndex];
        if (removing.PendingID !== 0) commands.push({ Kind: "cancel", ID: removing.PendingID, Value: "" });
        next.Rows.splice(rowIndex, 1);
        break;
      }
      case "up": {
        const rowIndex = next.Rows.findIndex((candidate) => candidate.ID === id);
        if (rowIndex > 0) [next.Rows[rowIndex - 1], next.Rows[rowIndex]] = [next.Rows[rowIndex], next.Rows[rowIndex - 1]];
        break;
      }
      case "reset":
        for (const item of next.Rows) {
          if (item.PendingID !== 0) commands.push({ Kind: "cancel", ID: item.PendingID, Value: "" });
        }
        next.Rows = [];
        break;
      default:
        throw new Error(`unsupported collection message ${JSON.stringify(message.Name)}`);
    }

    // Ensure dispatch resolution was against the exact current target tree.
    // (The local is intentionally kept live until all checks finish.)
    void tree;
    void indexes;
    state = next;
    messages = messages.concat(message);
    outbox = outbox.concat(commands);
    for (const [requestID, rowID] of stagedMappings) requestRows.set(requestID, rowID);
    return snapshot();
  }

  function complete(rawReply) {
    const reply = validateReply(rawReply);
    const rowID = requestRows.get(reply.ID) ?? 0;
    const next = {
      Rows: state.Rows.map(rowCopy),
      NextID: state.NextID,
      NextRequestID: state.NextRequestID,
    };
    const row = next.Rows.find((candidate) => candidate.ID === rowID);
    const accepted = Boolean(row && row.PendingID === reply.ID);
    let reason = "stale";
    if (accepted) {
      row.PendingID = 0;
      if (reply.Error !== "") {
        row.Status = `error: ${reply.Error}`;
        reason = "error";
      } else {
        row.Saved = reply.Value;
        row.Saves += 1;
        row.Status = "saved";
        reason = "saved";
      }
    }
    state = next;
    messages = messages.concat({ Name: "reply", Arg: String(reply.ID) });
    audit = audit.concat({
      ID: reply.ID,
      RowID: rowID,
      Value: reply.Value,
      Error: reply.Error,
      Accepted: accepted,
      Reason: reason,
    });
    return snapshot();
  }

  return {
    init,
    snapshot() { return clone(snapshot()); },
    dispatch,
    complete,
    effects() {
      const drained = cloneCommands(outbox);
      outbox = [];
      return drained;
    },
    audit() { return clone(audit); },
    encodeHTTP,
    decodeHTTP,
  };
}

export const createCollectionReferenceRuntime = createCollectionReference;

