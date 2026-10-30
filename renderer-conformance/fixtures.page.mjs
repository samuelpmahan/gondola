import { mountKeyedDOM } from "/keyed-editor/dom.mjs";
import { mountKeyedReact } from "/keyed-editor/build/react.bundle.mjs";
import { loadGoDOM, mountGoDOM } from "/renderer-conformance/adapter.mjs";
import { validateSnapshotAgainstManifest } from "/renderer-conformance/protocol.mjs";

const BACKENDS = Object.freeze({ dom: mountKeyedDOM, react: mountKeyedReact, godom: mountGoDOM });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sameJSON(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function htmlNormalizedByTemplate(markup) {
  const template = document.createElement("template");
  template.innerHTML = markup;
  return template.innerHTML;
}

function elementAtPath(root, path) {
  let node = root.firstChild;
  if (path === "") return node;
  for (const component of path.split("/")) {
    const index = Number(component);
    assert(Number.isSafeInteger(index) && index >= 0 && node?.childNodes?.[index],
      `DOM path ${JSON.stringify(path)} is missing child ${component}`);
    node = node.childNodes[index];
  }
  return node;
}

function walkNodes(node, path = "", result = []) {
  result.push({ node, path });
  for (let index = 0; index < (node.Kids ?? []).length; index += 1) {
    walkNodes(node.Kids[index], path === "" ? String(index) : `${path}/${index}`, result);
  }
  return result;
}

function fixtureSnapshotFacade(snapshot) {
  // This is a static snapshot source for renderer contract fixtures, not the
  // Go collection application runtime used by the conformance replay.
  return {
    fixtureOnly: true,
    init() { return structuredClone(snapshot); },
    dispatch() { throw new Error("static fixture facade has no application transition model"); },
  };
}

function assertLiveProperties(root, snapshot, domSnapshot, label) {
  const nodes = walkNodes(snapshot.tree);
  const expectedDisabled = [];
  for (const { node, path } of nodes) {
    if (node.Kind !== 1) continue;
    const attributes = node.Attrs ?? [];
    const disabled = attributes.some((attr) => attr.Name === "disabled" && attr.Flag);
    const element = elementAtPath(root, path);
    assert(element?.localName === node.Tag, `${label} ${path || "<root>"} tag does not match its snapshot`);
    if (node.Tag === "input") {
      const value = attributes.find((attr) => attr.Name === "value");
      assert(value && !value.Flag, `${label} input ${node.Key} has no controlled value`);
      assert(element.value === value.Value,
        `${label} input ${node.Key} property ${JSON.stringify(element.value)} differs from ${JSON.stringify(value.Value)}`);
      assert(element.type === "text", `${label} input ${node.Key} did not retain type=text`);
    }
    if (node.Tag === "button" || node.Tag === "input") {
      assert(element.disabled === disabled, `${label} ${node.Tag} ${node.Key} disabled property differs from its flag`);
    }
    if (disabled) expectedDisabled.push(path);
  }
  assert(sameJSON(domSnapshot.disabled, expectedDisabled), `${label} disabled path list differs from snapshot flags`);
}

function assertValidRender(rendererName, root, renderer, fixture, snapshot) {
  const label = `${rendererName}/${fixture.name}`;
  const actualSnapshot = renderer.snapshot();
  assert(sameJSON(actualSnapshot, snapshot), `${label} snapshot changed while mounting`);
  const rendered = renderer.domSnapshot();
  assert(rendered && typeof rendered.html === "string", `${label} domSnapshot() omitted HTML`);
  assert(rendered.html === root.innerHTML, `${label} reported HTML differs from the live DOM`);
  const expected = htmlNormalizedByTemplate(fixture.expectedHTML);
  assert(root.innerHTML === expected,
    `${label} HTML differs from Go gobi.HTML reference\nexpected: ${expected}\nactual: ${root.innerHTML}`);
  assertLiveProperties(root, snapshot, rendered, label);
}

function rejectBeforeUpdate(rendererName, root, renderer, fixture, manifest, snapshot) {
  const label = `${rendererName}/${fixture.name}`;
  const beforeHTML = root.innerHTML;
  const beforeSnapshot = renderer.snapshot();
  let rejected = false;
  try {
    validateSnapshotAgainstManifest(snapshot, manifest);
    renderer.update(snapshot);
  } catch {
    rejected = true;
  }
  assert(rejected, `${label} invalid snapshot passed renderer admission`);
  assert(root.innerHTML === beforeHTML, `${label} invalid snapshot changed live HTML before admission`);
  assert(sameJSON(renderer.snapshot(), beforeSnapshot), `${label} invalid snapshot changed renderer state before admission`);
}

async function run() {
  const response = await fetch("/renderer-conformance/build/fixtures.json", { cache: "no-store" });
  assert(response.ok, `could not load generated fixture pack (${response.status})`);
  const bundle = await response.json();
  assert(bundle && bundle.manifest && Array.isArray(bundle.fixtures), "fixture pack must contain manifest and fixtures");
  const manifest = bundle.manifest;
  await loadGoDOM({ wasmURL: "/renderer-conformance/build/godom.wasm" });

  const positive = bundle.fixtures.filter((fixture) => fixture.expectedValid);
  const objectNegatives = bundle.fixtures.filter((fixture) => !fixture.expectedValid && fixture.admission === "snapshot");
  const rawOnly = bundle.fixtures.filter((fixture) => fixture.admission === "raw-json-only");
  const rendered = {};
  let atomicityChecks = 0;

  for (const [rendererName, mount] of Object.entries(BACKENDS)) {
    rendered[rendererName] = 0;
    let checkedAtomicity = false;
    for (const fixture of positive) {
      assert(typeof fixture.expectedHTML === "string", `valid fixture ${fixture.name} lacks Go HTML`);
      const snapshot = JSON.parse(fixture.raw);
      validateSnapshotAgainstManifest(snapshot, manifest);
      const root = document.createElement("div");
      root.dataset.fixtureRenderer = rendererName;
      document.getElementById("fixture-results").append(root);
      const renderer = mount(root, fixtureSnapshotFacade(snapshot));
      try {
        assertValidRender(rendererName, root, renderer, fixture, snapshot);
        rendered[rendererName] += 1;
        if (!checkedAtomicity) {
          for (const negative of objectNegatives) {
            rejectBeforeUpdate(rendererName, root, renderer, negative, manifest, JSON.parse(negative.raw));
            atomicityChecks += 1;
          }
          checkedAtomicity = true;
        }
      } finally {
        renderer.unmount();
        root.remove();
      }
    }
  }

  return {
    positiveFixtures: positive.length,
    objectNegativeFixtures: objectNegatives.length,
    rawJsonOnlyFixtures: rawOnly.length,
    renderedByBackend: rendered,
    backendRenderCount: Object.values(rendered).reduce((total, count) => total + count, 0),
    negativeAtomicityChecks: atomicityChecks,
    expectedHTMLSource: "Go gobi.HTML serialized through a browser template",
    fixtureRuntime: "static snapshot facade; no collection application state transitions",
  };
}

window.__fixtureCheckDone = false;
window.__fixtureCheckResult = null;
window.__fixtureCheckError = null;
window.__fixtureCheckPromise = run().then((result) => {
  window.__fixtureCheckResult = result;
}).catch((error) => {
  window.__fixtureCheckError = String(error?.stack ?? error);
}).finally(() => {
  window.__fixtureCheckDone = true;
});
