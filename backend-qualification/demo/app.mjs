const casesBody = document.querySelector("#cases");
const verdict = document.querySelector("#verdict");
const summary = document.querySelector("#summary");
const verdictPanel = document.querySelector(".verdict");
const sourceCommit = document.querySelector("#source-commit");

function textCell(value, className) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = value == null ? "—" : String(value);
  return cell;
}

function channelCell(channels) {
  const cell = document.createElement("td");
  const list = document.createElement("div");
  list.className = "channels";
  for (const channel of channels ?? []) {
    const item = document.createElement("span");
    item.className = "channel";
    item.textContent = channel;
    list.append(item);
  }
  if (!list.childElementCount) list.textContent = "none";
  cell.append(list);
  return cell;
}

function verdictPill(passed, fault) {
  const cell = document.createElement("td");
  const pill = document.createElement("span");
  pill.className = `pill${passed ? "" : " bad"}`;
  pill.textContent = fault === "none"
    ? passed ? "Baseline matched" : "Baseline failed"
    : passed ? "Fault detected" : "Fault escaped";
  cell.append(pill);
  return cell;
}

function activationCell(rawCase) {
  const activation = evidenceActivation(rawCase);
  const cell = document.createElement("td");
  if (rawCase.fault === "none") {
    cell.textContent = "inactive; none configured";
    return cell;
  }
  const event = activation && Object.hasOwn(activation, "eventIndex")
    ? activation.eventIndex == null ? "init" : `event ${activation.eventIndex}`
    : "see capture";
  const target = activation?.targetPath ? `; ${activation.targetPath}` : "";
  cell.textContent = `${rawCase.activated ? "active" : "inactive"} × ${rawCase.activationCount}; ${event}${target}`;
  return cell;
}

function evidenceActivation(rawCase) {
  return rawCase.evidence?.activation ?? null;
}

function evidenceCell(evidence) {
  const cell = document.createElement("td");
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Inspect raw evidence";
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(evidence, null, 2);
  details.append(summary, pre);
  cell.append(details);
  return cell;
}

function addMetric(label, value) {
  const block = document.createElement("div");
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = String(value);
  block.append(dt, dd);
  summary.append(block);
}

async function render() {
  try {
    const response = await fetch("/viewer-data.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`viewer data returned HTTP ${response.status}`);
    const data = await response.json();
    const certificate = data.certificate;
    if (data.schema !== "gobi.backend-qualification-viewer-data/v1" || certificate?.schema !== "gobi.backend-qualification-certificate/v1") {
      throw new Error("qualification viewer data schema is invalid");
    }
    const rows = data.cases;
    if (!Array.isArray(rows) || rows.length !== 13) throw new Error("qualification viewer does not contain all 13 cases");
    const qualified = certificate.qualified === true;
    verdictPanel.dataset.qualified = String(qualified);
    verdict.textContent = qualified ? "QUALIFIED" : "NOT QUALIFIED";
    sourceCommit.textContent = `source ${certificate.sourceCommit}`;
    summary.replaceChildren();
    addMetric("Cases", rows.length);
    addMetric("Baselines matched", rows.filter((row) => row.raw.fault === "none" && row.certificate.passed === true).length);
    addMetric("Faults detected", rows.filter((row) => row.raw.fault !== "none" && row.certificate.passed === true).length);
    addMetric("Source events", 50);
    casesBody.replaceChildren();
    for (const row of rows) {
      const raw = row.raw;
      const certified = row.certificate;
      const element = document.createElement("tr");
      element.className = "case-row";
      element.dataset.caseId = raw.id;
      element.append(
        textCell(raw.id, "case-id"),
        textCell(raw.backend),
        textCell(raw.fault),
        activationCell({ ...raw, evidence: row.evidence }),
        textCell(`${raw.eventsObserved}/${raw.traceTicks}`),
        channelCell(raw.observedChannels),
        channelCell(certified.expectedChannels),
        verdictPill(certified.passed === true, raw.fault),
        evidenceCell(row.evidence),
      );
      casesBody.append(element);
    }
  } catch (error) {
    verdictPanel.dataset.qualified = "false";
    verdict.id = "load-error";
    verdict.textContent = `Qualification report unavailable: ${error?.message ?? error}`;
    casesBody.replaceChildren();
  }
}

render();
