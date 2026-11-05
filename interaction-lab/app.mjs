import { experiments, experiment, parameters, candidate } from './registry.mjs';
import { mountMotion } from './motion-view.mjs';
import { createShelf } from './variants.mjs';
import { makeVariant, parseVariant, firstDifference } from './journal.mjs';
import { mountGoExperiment, plainGo } from './go-host.mjs';
import { compiled } from './.compiled/fixtures.mjs';
import { createDOMRenderer } from '../compiled-frontend/frontend/dom/renderer.mjs';
import { createReactRenderer } from '../compiled-frontend/frontend/react/renderer.mjs';

const main = document.querySelector('#main'), $ = s => document.querySelector(s);
$('.skip').addEventListener('click', event => { event.preventDefault(); main.focus(); main.scrollIntoView(); });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let storage = null;
try { storage = localStorage; } catch { /* export works without storage */ }
const shelf = createShelf(storage), disposables = [];
const renderers = { dom: createDOMRenderer, react: createReactRenderer };
let pendingVariant = null, current = null, currentID = null, currentSeed = 42, inspectorTab = 'state', toastTimer, selectedFilter = 'All', loadedReceipt = null;
fetch('./build-receipt.json').then(r => r.json()).then(r => { loadedReceipt = r; }).catch(() => {});
function toast(text) {
  $('#toast').textContent = text; $('#toast').classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4200);
}
function counts() { $('#saved-count').textContent = shelf.list().length; }
function dispose() {
  for (const d of disposables.splice(0)) d.destroy();
  current = null; currentID = null;
}
function download(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function importFile() { $('#import-file').click(); }
$('#import-file').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try { if (file.size > 1000000) throw Error('Variant exceeds 1 MB'); const value = parseVariant(await file.text()); openVariant(value); }
  catch (error) { toast('Import rejected: ' + error.message); }
});
function openVariant(value) {
  pendingVariant = value;
  const hash = '#/' + value.experiment;
  if (location.hash === hash) route(); else location.hash = hash;
}
function miniGo(id) {
  if (id === 'form') return '<div class="mini-go"><div class="mini-pills"><span>DOM</span><span>REACT</span></div><div class="mini-input">keep the good bits</div><span class="mini-button">Save thought ↗</span></div>';
  if (id === 'list') return '<div class="mini-go">' + ['A good starting point', 'A small surprise', 'Something worth keeping'].map((text, i) => '<div class="mini-row"><span class="mini-check">' + (i === 1 ? '✓' : '') + '</span><span>' + text + '</span><span>↕</span></div>').join('') + '</div>';
  return '<div class="mini-go"><div class="mini-orbit"></div><div class="mini-input">something is on its way</div><span class="mini-button">Request → Reply</span><br><br><small>GO STATE · STILL HERE</small></div>';
}
function gallery() {
  dispose();
  main.innerHTML = '<section class="hero"><div><p class="eyebrow">AN OPEN-ENDED INTERACTION WORKSPACE</p><h1>Room to <em>play.</em></h1></div><div class="hero-copy"><p>Pull on an idea. Change how it feels.<br>Keep what clicks. See what happened.</p><span class="tiny-label">06 experiments · Plenty of possibilities</span></div></section><div class="gallery-toolbar"><div class="filters" aria-label="Filter experiments">' + ['All', 'Motion', 'Components'].map(f => '<button class="filter ' + (selectedFilter === f ? 'active' : '') + '" data-filter="' + f + '" aria-pressed="' + (selectedFilter === f) + '">' + f + (f === 'All' ? ' <small>06</small>' : '') + '</button>').join('') + '</div><button class="import" id="import-gallery">Import variant ↗</button></div><div class="gallery" id="gallery"></div><div class="gallery-note"><p>A collection, and a place to make it your own. Drag the motion studies right here, or open an experiment for the controls, a saved variant, and the story behind each event.</p><p>Inspired by <a href="https://aiforui.dev/lab" target="_blank" rel="noopener">Emil Kowalski’s Interaction Lab ↗</a><br>Original experiments. Built on Gondola’s Go components and renderers.</p></div>';
  for (const e of experiments.filter(e => selectedFilter === 'All' || e.category === selectedFilter)) {
    const card = document.createElement('article'); card.className = 'experiment-card'; card.dataset.experiment = e.id;
    card.innerHTML = '<div class="card-stage"><span class="stage-no">[' + e.number + ']</span><button class="stage-open" aria-label="Open ' + e.title + '">↗</button>' + (e.kind === 'motion' ? '<div class="mini-motion"></div>' : miniGo(e.id) + '<button class="cover-open" aria-label="Explore ' + e.title + '"></button>') + '</div><div class="card-caption"><div><button class="card-title"><h2>' + e.title + '</h2></button><p>' + e.subtitle + '</p></div><span class="badge">' + e.badge + '</span></div>';
    $('#gallery').append(card);
    for (const b of card.querySelectorAll('.stage-open,.cover-open,.card-title')) b.onclick = () => { location.hash = '#/' + e.id; };
    if (e.kind === 'motion') disposables.push(mountMotion({ container: card.querySelector('.mini-motion'), id: e.id, mini: true, onError: error => toast(error.message) }));
  }
  for (const b of main.querySelectorAll('[data-filter]')) b.onclick = () => { selectedFilter = b.dataset.filter; gallery(); };
  $('#import-gallery').onclick = importFile;
}
function controls(e, p) {
  return '<aside class="controls" aria-label="Experiment controls"><h2>Make it yours.</h2><p>Small changes. Different feelings.<br>Everything updates as you go.</p><div id="parameters">' + Object.entries(e.params).map(([key, spec]) => '<label class="parameter" for="param-' + key + '"><span class="parameter-top"><span>' + spec.label + '</span><output id="out-' + key + '">' + p[key] + '</output></span><input type="range" id="param-' + key + '" data-param="' + key + '" min="' + spec.min + '" max="' + spec.max + '" step="' + spec.step + '" value="' + p[key] + '"></label>').join('') + '</div><div class="control-separator"><div class="candidate-row"><span id="seed-label">SEED ' + currentSeed + '</span><button id="generate">Try a variation ↻</button></div><label class="save-label" for="variant-name">KEEP THIS ONE</label><input type="text" id="variant-name" maxlength="100" value="' + esc(e.title.replace(/\.$/, '') + ' / 01') + '"><button class="primary" id="save-variant">Save variant <span aria-hidden="true">＋</span></button><div class="transfer-row"><button class="secondary" id="export-variant">Export JSON ↗</button><button class="secondary" id="import-work">Import JSON ↙</button></div><p class="storage-note">Saved in this browser. Export to take a variant, its parameters, and its replay anywhere.</p></div></aside>';
}
function workbench(e, variant = null, override = null) {
  dispose();
  currentID = e.id; currentSeed = variant?.seed ?? override?.seed ?? 42;
  const p = parameters(e.id, variant?.params ?? override?.params ?? {}), startingBackend = variant?.backend ?? 'dom';
  main.innerHTML = '<section class="work-heading"><a class="back" href="#/">← Back to the collection</a><div class="work-title"><div><span class="tiny-label">EXPERIMENT ' + e.number + ' / ' + e.category.toUpperCase() + '</span><h1>' + e.title + '</h1></div><p>' + e.subtitle + '<br>' + (e.kind === 'go' ? 'Real compiled Go. Existing React and DOM backends.' : 'Direct manipulation. Fixed ticks. Reproducible events.') + '</p></div></section><div class="work-grid"><div><section class="play-panel" aria-label="' + e.title + ' playground"><div class="play-topline"><span>' + e.badge.toUpperCase() + '</span><button id="reset-study">Reset study ↺</button></div><div id="experiment-host"></div>' + (e.kind === 'go' ? '<div class="backend-bar"><div class="segmented" aria-label="Renderer"><button data-backend="dom" aria-pressed="true">DOM</button><button data-backend="react" aria-pressed="false">React</button></div><span id="backend-comparison">ONE GO STATE<br>TWO RENDERERS</span></div>' + (e.id === 'effect' ? '<div class="effect-host"><label><input type="checkbox" id="auto-reply" checked>Auto reply</label><button id="deliver-reply" disabled>Complete reply</button><button id="cancel-reply">Cancel & reset</button></div><div class="host-note">Timer echoes your input. No network request or persistent save. Cancel & reset disposes the host and its timer.</div>' : '') : '') + '</section><p class="work-instruction">' + e.instruction + '</p><details class="inspector"><summary>Under the surface <span class="tiny-label"> / State, events & replay</span></summary><div class="inspection-head"><div class="inspector-tabs" role="group" aria-label="Inspector view">' + ['state', 'events', 'trace', 'source'].map(t => '<button data-inspect="' + t + '" class="' + (t === inspectorTab ? 'active' : '') + '">' + t[0].toUpperCase() + t.slice(1) + '</button>').join('') + '</div><button id="replay">Replay & compare ↻</button></div><p id="replay-result" role="status"></p><pre id="inspection-output"></pre><div class="inspection-head"><span class="tiny-label" id="event-count"></span><button class="import" id="export-evidence">Export evidence ↗</button></div></details></div>' + controls(e, p) + '</div>';
  const host = $('#experiment-host');
  if (e.kind === 'go') {
    host.className = 'component-host';
    current = mountGoExperiment({ id: e.id, container: host, compiled, renderers, backend: startingBackend, params: p, auto: true, onChange: refresh, onFailure: error => toast(error.message ?? JSON.stringify(error)) });
  } else current = mountMotion({ container: host, id: e.id, params: p, onChange: refresh, onError: error => toast(error.message) });
  disposables.push(current);
  if (variant) {
    try {
      const actual = current.replay(variant.events), diff = firstDifference(variant.final, actual);
      result(diff ? 'Saved evidence differs at ' + diff.path + '. Inspect the imported expected state and current replay.' : 'Saved variant restored. Replay matches its recorded final state.', !!diff);
      $('#variant-name').value = variant.name;
      if (e.kind === 'go') current.setAuto(false);
      if ($('#auto-reply')) $('#auto-reply').checked = false;
    } catch (error) { result('Replay rejected: ' + error.message, true); }
  }
  for (const input of main.querySelectorAll('[data-param]')) input.addEventListener('input', () => {
    try { current.param(input.dataset.param, Number(input.value)); refresh(); }
    catch (error) { toast(error.message); }
  });
  $('#generate').onclick = () => {
    const nextSeed = (currentSeed + 1) >>> 0;
    workbench(e, null, { seed: nextSeed, params: candidate(e.id, nextSeed) });
    toast('Seed ' + nextSeed + ' · A new place to start.');
  };
  $('#reset-study').onclick = () => workbench(e, null, { seed: currentSeed, params: current.params() });
  $('#save-variant').onclick = () => {
    try { const value = capture(), r = shelf.save(value); counts(); toast(r.ok ? 'Kept “' + value.name + '” in your collection.' : 'Could not save: ' + r.error + '. Export JSON to keep it.'); }
    catch (error) { toast(error.message); }
  };
  $('#export-variant').onclick = () => { try { download('gondola-' + e.id + '-variant.json', capture()); } catch (error) { toast(error.message); } };
  $('#export-evidence').onclick = () => {
    try { download('gondola-' + e.id + '-evidence.json', { schema: 'gondola.interaction-evidence/v1', recording: { name: $('#variant-name').value, experiment: e.id, params: current.initialParams, backend: current.initialBackend ?? 'dom', events: current.events(), final: current.snapshot(), seed: currentSeed }, execution: e.kind === 'go' ? { trace: current.trace(), diagnostics: current.diagnostics() } : { fixedDT: 1 / 120, final: current.snapshot() }, build: loadedReceipt }); }
    catch (error) { toast(error.message); }
  };
  $('#import-work').onclick = importFile;
  for (const b of main.querySelectorAll('[data-inspect]')) b.onclick = () => { inspectorTab = b.dataset.inspect; for (const x of main.querySelectorAll('[data-inspect]')) x.classList.toggle('active', x === b); refresh(); };
  main.querySelector('.inspector').addEventListener('toggle', refresh);
  $('#replay').onclick = () => {
    try {
      const before = current.snapshot(), events = current.events();
      const after = current.replay(events), diff = firstDifference(before, after);
      if (e.kind === 'go') current.setAuto(false);
      if ($('#auto-reply')) $('#auto-reply').checked = false;
      result(diff ? 'Difference at ' + diff.path + ': ' + JSON.stringify(diff.expected) + ' → ' + JSON.stringify(diff.actual) : 'Match · ' + events.length + ' recorded events reproduced the same ' + (e.kind === 'go' ? 'Go state, Gobi view, and DOM snapshot.' : 'fixed-tick state. Motion is paused at the replay checkpoint.'), !!diff);
    } catch (error) { result('Replay rejected: ' + error.message, true); }
    refresh();
  };
  if (e.kind === 'go') for (const b of main.querySelectorAll('[data-backend]')) b.onclick = () => {
    try {
      const before = current.snapshot().state, swapped = current.swap(b.dataset.backend);
      const stateDiff = firstDifference(before, current.snapshot().state);
      $('#backend-comparison').textContent = stateDiff ? 'GO STATE DIFFERENCE AT ' + stateDiff.path : swapped?.difference ? 'STATE RETAINED · DOM DIFF AT ' + swapped.difference.path : 'GO STATE + VIEW + DOM MATCH';
      if (swapped?.difference) result('Renderer difference at ' + swapped.difference.path + '. The inspector retains the runtime diagnostics.', true);
      refresh();
    } catch (error) { toast('Renderer swap failed: ' + error.message); }
  };
  if (e.id === 'effect') {
    $('#auto-reply').onchange = () => current.setAuto($('#auto-reply').checked);
    $('#deliver-reply').onclick = () => { try { current.reply(); refresh(); } catch (error) { toast(error.message); } };
    $('#cancel-reply').onclick = () => { current.reset(); refresh(); toast('Host disposed; pending timer cancelled. A fresh Go session is ready.'); };
  }
  refresh();
}
function result(message, failed = false) {
  const el = $('#replay-result'); if (!el) return; el.textContent = message; el.dataset.state = failed ? 'failed' : 'passed';
}
function capture() {
  if (!current) throw Error('Open an experiment first');
  const e = experiment(currentID);
  return makeVariant({ name: $('#variant-name')?.value || e.title, experiment: e.id, params: current.initialParams, backend: current.initialBackend ?? 'dom', events: current.events(), final: current.snapshot(), seed: currentSeed });
}
function refresh() {
  if (!current || !currentID || !$('#parameters')) return;
  const e = experiment(currentID), p = current.params();
  for (const [key, value] of Object.entries(p)) { const input = $('#param-' + key); if (input) { input.value = value; $('#out-' + key).textContent = value; } }
  const host = $('#experiment-host');
  host.style.setProperty('--component-radius', (p.radius ?? 12) + 'px');
  host.style.setProperty('--component-duration', (p.duration ?? 250) + 'ms');
  if (e.kind === 'go') {
    for (const b of main.querySelectorAll('[data-backend]')) b.setAttribute('aria-pressed', String(current.backend() === b.dataset.backend));
    if ($('#deliver-reply')) $('#deliver-reply').disabled = current.pending() === 0;
  }
  const events = current.events();
  $('#event-count').textContent = events.length + ' EVENTS · V1 JOURNAL';
  if (!main.querySelector('.inspector')?.open) return;
  let data;
  if (inspectorTab === 'state') data = e.kind === 'go' ? { Go: plainGo(current.snapshot().state), exactEncodedState: current.snapshot().state } : current.snapshot();
  if (inspectorTab === 'events') data = { count: events.length, events: events.slice(-100), note: events.length > 100 ? 'Last 100 shown; export contains the full journal.' : 'Normalized input, parameters, and execution order.' };
  if (inspectorTab === 'trace') data = e.kind === 'go' ? { runtime: current.trace(), diagnostics: current.diagnostics() } : { fixedTick: '1/120 second', numericModel: 'Semi-implicit Euler plus analytic damped-spring reference; bezier solves x(t) by bisection.', final: current.snapshot(), eventCount: events.length, execution: events.slice(-20) };
  if (inspectorTab === 'source') data = { experiment: e.id, ownership: e.kind === 'go' ? 'Existing compiled Go Init / Update / View; existing Gobi runtime and renderer adapters. Lab host supplies recording, timers, and replacement controls.' : 'JavaScript exploration model; this is not a Go compilation.', implementation: e.kind === 'go' ? 'fixtures/compiled/' + e.id : 'interaction-lab/motion.mjs', parameters: p, initialParameters: current.initialParams, provenance: loadedReceipt, scope: 'Replay compares this exact journal in this implementation. Backend swaps compare the actual state/view/DOM at the swap; no universal equivalence or pixel proof.' };
  const text = JSON.stringify(data, null, 2);
  $('#inspection-output').textContent = text.length > 60000 ? text.slice(0, 60000) + '\n… display truncated; Export evidence contains the complete trace.' : text;
}
function saved() {
  dispose(); const items = shelf.list();
  main.innerHTML = '<section class="saved-heading"><div><p class="eyebrow">YOUR COLLECTION</p><h1>The ones you kept.</h1><p>A feeling, its settings, and the events that got you there.<br>Local to this browser. Portable as JSON.</p></div><button class="secondary" id="import-shelf">Import a variant ↙</button></section><div class="shelf-list">' + (!items.length ? '<div class="empty-shelf">Nothing kept yet. That’s what the room is for.<br><a class="primary" href="#/">Find a starting point ↗</a></div>' : '') + '</div>';
  $('#import-shelf').onclick = importFile;
  for (const v of items) {
    const item = document.createElement('article'); item.className = 'shelf-item';
    item.innerHTML = '<div><h2>' + esc(v.name) + '</h2><p>' + esc(experiment(v.experiment).title) + ' · SEED ' + v.seed + ' · ' + v.events.length + ' EVENTS</p></div><div class="shelf-actions"><button class="primary" data-action="open">Open & replay ↗</button><button class="secondary" data-action="export">Export JSON</button><button class="secondary" data-action="remove" aria-label="Remove ' + esc(v.name) + '">Remove</button></div>';
    item.querySelector('[data-action="open"]').onclick = () => openVariant(v);
    item.querySelector('[data-action="export"]').onclick = () => download('gondola-' + v.experiment + '-variant.json', v);
    item.querySelector('[data-action="remove"]').onclick = () => {
      const r = shelf.remove(v.id); if (!r.ok) return toast('Could not remove: ' + r.error); counts(); saved();
      const undo = document.createElement('button'); undo.className = 'secondary'; undo.textContent = 'Undo removal of “' + v.name + '”';
      undo.onclick = () => { const restored = shelf.save(v); if (restored.ok) { counts(); saved(); } else toast(restored.error); };
      main.querySelector('.shelf-list').prepend(undo);
    };
    main.querySelector('.shelf-list').append(item);
  }
  if (shelf.error()) toast('Browser storage: ' + shelf.error() + '. Export remains available.');
}
function route() {
  const id = location.hash.replace(/^#\/?/, '').split('/')[0];
  counts();
  $('#gallery-nav').setAttribute('aria-current', id !== 'saved' ? 'page' : 'false');
  $('#saved-nav').setAttribute('aria-current', id === 'saved' ? 'page' : 'false');
  if (id === 'saved') saved();
  else if (!id) gallery();
  else {
    try { const e = experiment(id), v = pendingVariant; pendingVariant = null; workbench(e, v?.experiment === id ? v : null); }
    catch (error) { gallery(); toast(error.message); }
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}
window.addEventListener('hashchange', route);
window.addEventListener('pagehide', dispose);
route();
