function escapeText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value) {
  return escapeText(value).replaceAll('"', "&quot;");
}

function control(path, key, tag, type, value, checked, disabled) {
  return { path, key, tag, type, value, checked, disabled };
}

function buttonHTML(label, disabled = false, attrs = "") {
  return `<button${attrs}${disabled ? ' disabled=""' : ""}>${escapeText(label)}</button>`;
}

function inputHTML({ type, value = null, aria }) {
  const valueAttr = value === null ? "" : ` value="${escapeAttribute(value)}"`;
  // React's HTML serializer emits aria-* before input type/value properties.
  // The checked property is captured separately in live DOM controls; changing
  // it on a mounted input does not rewrite outerHTML's checked attribute.
  return `<input aria-label="${escapeAttribute(aria)}" type="${type}"${valueAttr}>`;
}

function counterDOM(state) {
  const count = String(state.Count);
  const resetDisabled = state.Count === 0;
  return {
    normalization: "outerHTML-v1",
    html: `<div class="counter"><p>Count: ${escapeText(count)}</p>${buttonHTML("+", false, ' class="add"')}${buttonHTML("Reset", resetDisabled)}</div>`,
    controls: [
      control("1", "", "button", "submit", "", false, false),
      control("2", "", "button", "submit", "", false, resetDisabled),
    ],
  };
}

function formDOM(state) {
  const resetDisabled = state.Draft === "" && state.Checked === false && state.Saved === "" && state.Saves === 0 && state.Literal === "";
  const html = `<div class="compiled-form">${inputHTML({ type: "text", value: state.Draft, aria: "Draft" })}` +
    `${inputHTML({ type: "checkbox", aria: "Checked", checked: state.Checked })}` +
    `${buttonHTML("Literal argument")}<p>Saved: ${escapeText(state.Saved)}</p>` +
    `<p>Saves: ${state.Saves}</p><p>Literal: ${escapeText(state.Literal)}</p>` +
    `${buttonHTML("Save", state.Draft === "")}${buttonHTML("Reset", resetDisabled)}${buttonHTML("Boundary")}</div>`;
  return {
    normalization: "outerHTML-v1", html,
    controls: [
      control("0", "form-draft", "input", "text", state.Draft, false, false),
      control("1", "form-checked", "input", "checkbox", "on", state.Checked, false),
      control("2", "form-literal", "button", "submit", "", false, false),
      control("6", "form-save", "button", "submit", "", false, state.Draft === ""),
      control("7", "form-reset", "button", "submit", "", false, resetDisabled),
      control("8", "form-boundary", "button", "submit", "", false, false),
    ],
  };
}

function listDOM(state) {
  const rows = state.Rows ?? [];
  const rowHTML = rows.map((row, index) => `<div class="row">${inputHTML({ type: "text", value: row.Label, aria: `Row ${row.ID}` })}` +
    `${inputHTML({ type: "checkbox", aria: `Done ${row.ID}`, checked: row.Checked })}` +
    `${buttonHTML("Up", index === 0)}${buttonHTML("Remove")}</div>`).join("");
  const controls = [
    control("0", "list-add", "button", "submit", "", false, false),
    control("1", "list-reset", "button", "submit", "", false, rows.length === 0),
  ];
  for (const [index, row] of rows.entries()) {
    controls.push(
      control(`2/${index}/0`, `row-${row.ID}-label`, "input", "text", row.Label, false, false),
      control(`2/${index}/1`, `row-${row.ID}-checked`, "input", "checkbox", "on", row.Checked, false),
      control(`2/${index}/2`, `row-${row.ID}-up`, "button", "submit", "", false, index === 0),
      control(`2/${index}/3`, `row-${row.ID}-remove`, "button", "submit", "", false, false),
    );
  }
  return {
    normalization: "outerHTML-v1",
    html: `<div class="compiled-list">${buttonHTML("Add")}${buttonHTML("Reset", rows.length === 0)}<div class="rows">${rowHTML}</div></div>`,
    controls,
  };
}

function effectDOM(state) {
  const requestDisabled = state.Pending || state.Input === "";
  return {
    normalization: "outerHTML-v1",
    html: `<div class="compiled-effect">${inputHTML({ type: "text", value: state.Input, aria: "Request value" })}` +
      `${buttonHTML("Request", requestDisabled)}<p>Status: ${escapeText(state.Status)}</p>` +
      `<p>Value: ${escapeText(state.Value)}</p><p>Requests: ${state.Requests}</p>` +
      `<p>Completions: ${state.Completions}</p></div>`,
    controls: [
      control("0", "effect-input", "input", "text", state.Input, false, false),
      control("1", "effect-request", "button", "submit", "", false, requestDisabled),
    ],
  };
}

/** Hand-authored independent DOM projection from the fixture's expected Go states. */
export function expectedDOMForState(fixture, state) {
  const app = fixture.packagePath.split("/").at(-1);
  switch (app) {
    case "counter": return counterDOM(state);
    case "form": return formDOM(state);
    case "list": return listDOM(state);
    case "effect": return effectDOM(state);
    default: throw new TypeError(`no hand-authored DOM oracle for app ${JSON.stringify(app)}`);
  }
}

/** Produces DOM expectations in the same init/action/reply order as fixture expectations. */
export function expectedDOMSnapshots(fixture) {
  const states = [fixture.initialState, ...fixture.expectations.map((entry) => entry.state)];
  return states.map((state) => expectedDOMForState(fixture, state));
}
