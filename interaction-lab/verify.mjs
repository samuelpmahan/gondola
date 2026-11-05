import { mountGoExperiment, plainGo } from './go-host.mjs';
import { compiled } from './.compiled/fixtures.mjs';
import { createDOMRenderer } from '../compiled-frontend/frontend/dom/renderer.mjs';
import { createReactRenderer } from '../compiled-frontend/frontend/react/renderer.mjs';
import { firstDifference, makeVariant, parseVariant } from './journal.mjs';
import { mountMotion } from './motion-view.mjs';
import { createShelf } from './variants.mjs';

const renderers = { dom: createDOMRenderer, react: createReactRenderer }, mount = document.querySelector('#verify-mount');
const assert = (v, message) => { if (!v) throw Error(message); };
const same = (a, b, message) => { const d = firstDifference(a, b); assert(!d, message + (d ? ' at ' + d.path + ': ' + JSON.stringify(d) : '')); };
const results = [], cases = [];
function textInput(root, selector, text) { const input = root.querySelector(selector); assert(input, selector + ' is present'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text); input.dispatchEvent(new Event('input', { bubbles: true })); }
function button(root, text) { const found = [...root.querySelectorAll('button')].find(b => b.textContent === text); assert(found, 'Button ' + text + ' is present'); found.click(); }
function host(id, backend, extra = {}) {
  const container = document.createElement('div'); mount.append(container);
  return { container, host: mountGoExperiment({ id, container, compiled, renderers, backend, auto: false, onFailure: e => { throw Error(e.message); }, ...extra }) };
}
for (const backend of ['dom', 'react']) {
  cases.push([backend + ': controlled input + renderer replacement + exact replay', () => {
    const { host: h, container } = host('form', backend);
    try {
      textInput(container, 'input[type=text]', 'a thought <&> 🪁');
      container.querySelector('input[type=checkbox]').click(); button(container, 'Save');
      const before = h.snapshot(); assert(plainGo(before.state).Saved === 'a thought <&> 🪁', 'Go saved the real input');
      const comparison = h.swap(backend === 'dom' ? 'react' : 'dom');
      same(before.state, h.snapshot().state, 'Go state survives swap');
      same(before.view, h.snapshot().view, 'Gobi tree survives swap');
      const end = h.snapshot(), journal = h.events();
      same(end, h.replay(journal), 'Action + renderer journal replays exactly');
      return { events: journal.length, swapDifference: comparison.difference, state: plainGo(end.state) };
    } finally { h.destroy(); container.remove(); }
  }]);
  cases.push([backend + ': keyed rows keep data through reorder and replacement', () => {
    const { host: h, container } = host('list', backend);
    try {
      button(container, 'Add'); button(container, 'Add');
      textInput(container, '[aria-label="Row 1"]', 'first'); textInput(container, '[aria-label="Row 2"]', 'second');
      container.querySelector('[aria-label="Done 2"]').click();
      const second = container.querySelector('[aria-label="Row 2"]');
      second.parentElement.querySelector('button').click();
      const state = plainGo(h.snapshot().state);
      assert(state.Rows[0].ID === '2' && state.Rows[0].Label === 'second' && state.Rows[0].Checked, 'Go row identity follows reordered data');
      assert(container.querySelector('.rows .row input').getAttribute('aria-label') === 'Row 2', 'Visible first row changed');
      h.swap(backend === 'dom' ? 'react' : 'dom');
      same(state, plainGo(h.snapshot().state), 'Rows survive renderer replacement');
      const before = h.snapshot(); same(before, h.replay(h.events()), 'Keyed journal replays');
      return { rows: state.Rows, events: h.events().length };
    } finally { h.destroy(); container.remove(); }
  }]);
  cases.push([backend + ': pending request survives renderer replacement and replays its reply', () => {
    const { host: h, container } = host('effect', backend);
    try {
      textInput(container, 'input', 'opaque reply'); button(container, 'Request');
      assert(h.pending() === 1 && plainGo(h.snapshot().state).Pending, 'Go pending before transport reply');
      h.swap(backend === 'dom' ? 'react' : 'dom');
      assert(h.pending() === 1, 'Pending transport preserved');
      h.reply();
      assert(plainGo(h.snapshot().state).Value === 'opaque reply', 'Go received exact payload');
      const before = h.snapshot(); same(before, h.replay(h.events()), 'Async journal matches');
      assert(h.diagnostics().renderer.replacements[0].outcome === 'committed', 'Existing runtime recorded replacement');
      return { state: plainGo(before.state), diagnostics: h.diagnostics(), events: h.events().length };
    } finally { h.destroy(); container.remove(); }
  }]);
}
cases.push(['real timer completes after Go pending commit', async () => {
  const { host: h, container } = host('effect', 'dom', { auto: true, params: { latency: 250 } });
  try {
    textInput(container, 'input', 'timer payload'); button(container, 'Request');
    assert(plainGo(h.snapshot().state).Pending, 'Pending is visible before timeout');
    await new Promise(resolve => setTimeout(resolve, 330));
    assert(plainGo(h.snapshot().state).Value === 'timer payload' && h.pending() === 0, 'Timer delivered once');
    return { state: plainGo(h.snapshot().state) };
  } finally { h.destroy(); container.remove(); }
}]);
cases.push(['reset cancels old timers and prevents late state changes', async () => {
  const { host: h, container } = host('effect', 'dom', { auto: true, params: { latency: 250 } });
  try {
    textInput(container, 'input', 'retired payload'); button(container, 'Request'); h.reset();
    await new Promise(resolve => setTimeout(resolve, 330));
    assert(plainGo(h.snapshot().state).Status === 'idle' && h.pending() === 0, 'Retired host cannot deliver');
    return { state: plainGo(h.snapshot().state), events: h.events() };
  } finally { h.destroy(); container.remove(); }
}]);
cases.push(['live motion parameters, keyboard input, exact replay and persisted shelf', () => {
  const container = document.createElement('div'); mount.append(container);
  const h = mountMotion({ container, id: 'spring' });
  try {
    h.pause(true); h.param('damping', 8);
    container.querySelector('.motion-dot').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    h.send({ type: 'tick', steps: 120 });
    const final = h.snapshot(); same(final, h.replay(h.events()), 'Motion replay matches');
    const value = makeVariant({ name: 'Verification fixture', experiment: 'spring', params: h.initialParams, events: h.events(), final });
    same(value, parseVariant(JSON.stringify(value)), 'Portable JSON round trip');
    const data = new Map(), storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
    assert(createShelf(storage).save(value).ok, 'Save returns success');
    assert(createShelf(storage).list()[0].name === 'Verification fixture', 'Shelf survives new instance');
    return { final, eventCount: h.events().length };
  } finally { h.destroy(); container.remove(); }
}]);
cases.push(['spring pointer cancellation releases the drag', () => {
  const container = document.createElement('div'); mount.append(container);
  const h = mountMotion({ container, id: 'spring' });
  try {
    // Browser PointerEvents cannot establish trusted pointer capture. Keyboard
    // release exercises the same normalized target event; manual pointer QA is separate.
    h.pause(true); h.send({ type: 'drag', value: .9 });
    container.querySelector('.motion-dot').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(!h.snapshot().dragging && h.snapshot().target === .5, 'Release returns to home target');
    return { scope: 'normalized cancellation path; trusted pointer capture checked manually' };
  } finally { h.destroy(); container.remove(); }
}]);
cases.push(['a replayed spring resumes when the user nudges it again', async () => {
  const container = document.createElement('div'); mount.append(container);
  const h = mountMotion({ container, id: 'spring' });
  try {
    h.replay([{ type: 'target', value: .85 }, { type: 'tick', steps: 120 }]);
    const before = h.snapshot().x;
    container.querySelector('[data-motion="impulse"]').click();
    assert(!h.isPaused(), 'Nudge releases the replay pause');
    if (!document.hidden) {
      await new Promise(resolve => setTimeout(resolve, 150));
      assert(Math.abs(h.snapshot().x - before) > .01, 'Visible nudge resumes the fixed tick loop after replay');
    }
    return { before, after: h.snapshot().x, continuousAnimationChecked: !document.hidden };
  } finally { h.destroy(); container.remove(); }
}]);
cases.push(['rejected large input restores the controlled field and retains replayable state', () => {
  const errors = [];
  const { host: h, container } = host('form', 'dom', { onFailure: e => errors.push(e.message) });
  try {
    textInput(container, 'input[type=text]', 'x'.repeat(4001));
    assert(errors.length === 1, 'Host reports the rejected input');
    assert(container.querySelector('input[type=text]').value === '', 'Controlled DOM returns to the accepted Go value');
    assert(h.events().length === 0, 'Rejected edit is not recorded');
    return { errors, state: plainGo(h.snapshot().state) };
  } finally { h.destroy(); container.remove(); }
}]);
cases.push(['390 px and 768 px: all routes fit without horizontal page overflow', async () => {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'width:390px;height:844px;border:0;display:block;';
  iframe.src = './index.html';
  const loaded = new Promise(resolve => { iframe.onload = resolve; });
  mount.append(iframe);
  const observations = [];
  try {
    await loaded;
    for (const width of [390, 768]) {
      iframe.style.width = width + 'px';
      for (const route of ['', 'spring', 'easing', 'dock', 'form', 'list', 'effect', 'saved']) {
        iframe.contentWindow.location.hash = '#/' + route;
        await new Promise(resolve => setTimeout(resolve, 40));
        const doc = iframe.contentDocument, actual = doc.documentElement.clientWidth, scroll = doc.documentElement.scrollWidth;
        observations.push({ width, route: route || 'gallery', clientWidth: actual, scrollWidth: scroll });
        assert(scroll <= actual + 1, route + ' overflows at ' + width + ' px: ' + scroll + ' > ' + actual);
      }
    }
    return observations;
  } finally { iframe.remove(); }
}]);
document.querySelector('#run-verification').onclick = async () => {
  const button = document.querySelector('#run-verification'); button.disabled = true;
  document.querySelector('#verify-status').textContent = 'Running ' + cases.length + ' checks…';
  results.length = 0; document.querySelector('#verify-cases').replaceChildren();
  for (const [name, run] of cases) {
    let record; try { record = { name, status: 'passed', evidence: await run() }; } catch (e) { record = { name, status: 'failed', error: e.message, stack: e.stack }; }
    results.push(record);
    const row = document.createElement('div'); row.className = 'verify-case verify-' + (record.status === 'passed' ? 'pass' : 'fail'); row.textContent = (record.status === 'passed' ? '✓ ' : '✕ ') + name + (record.error ? ': ' + record.error : ''); document.querySelector('#verify-cases').append(row);
  }
  const passed = results.filter(r => r.status === 'passed').length;
  document.querySelector('#verify-status').textContent = passed + ' / ' + cases.length + ' checks passed';
  document.querySelector('#verify-results').textContent = JSON.stringify({ schema: 'gondola.interaction-browser-check/v1', userAgent: navigator.userAgent, passed, total: cases.length, results }, null, 2);
  document.querySelector('#download-verification').disabled = false;
  button.disabled = false;
};
document.querySelector('#download-verification').onclick = () => {
  const url = URL.createObjectURL(new Blob([document.querySelector('#verify-results').textContent], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'gondola-interaction-browser-receipt.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
