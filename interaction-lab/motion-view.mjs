import { parameters } from './registry.mjs';
import { initialMotion, motionEvent, clamp, DT } from './motion.mjs';
import { replayMotion, appendMotionRecord } from './journal.mjs';

export function mountMotion({ container, id, params = {}, mini = false, onChange = () => {}, onError = () => {} }) {
  let p = parameters(id, params), state = initialMotion(id, p), active = true, paused = false, frame = 0, lastTime = 0, accumulator = 0, ticks = 0;
  const initialParams = { ...p }, events = [], history = [], cleanups = [];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = selector => container.querySelector(selector);
  const listen = (el, name, fn) => { el.addEventListener(name, fn); cleanups.push(() => el.removeEventListener(name, fn)); };
  const label = id === 'dock' ? 'A workspace with a little gravity.' : '120 fixed ticks / second. No hidden physics engine.';
  if (id === 'spring') {
    container.innerHTML = '<div class="motion-stage spring"><div class="spring-label"><span>SEMI-IMPLICIT EULER</span><span>DIRECT MANIPULATION</span></div><div class="spring-track"><button class="motion-dot" aria-label="Drag spring handle, or use arrow keys"></button></div><div class="spring-label"><span>ANALYTIC REFERENCE</span><span>SAME PARAMETERS</span></div><div class="spring-track reference"><span class="motion-dot"></span></div><svg class="plot" viewBox="0 0 300 70" preserveAspectRatio="none" aria-label="Recent spring positions"><path class="plot-baseline" d="M0 35 H300"/><path class="plot-ref"/><path class="plot-actual"/></svg><div class="stage-readout"><span data-readout="x"></span><span data-readout="difference"></span></div><div class="motion-actions"><button data-motion="impulse">Give it a nudge ↗</button><span>← / → to move · Esc to release</span></div><p class="stage-caption">' + label + '</p></div>';
  } else if (id === 'easing') {
    container.innerHTML = '<div class="motion-stage easing"><svg class="curve-area" viewBox="0 0 220 200" aria-label="Editable easing curve"><path class="curve-grid" d="M30 15 V175 H190 M30 95 H190 M110 15 V175"/><path class="curve-control" data-control="one"/><path class="curve-control" data-control="two"/><path class="curve-path"/><circle class="curve-handle" data-handle="one" r="7" tabindex="0" role="slider" aria-label="Bezier handle one" aria-valuemin="0" aria-valuemax="1"/><circle class="curve-handle" data-handle="two" r="7" tabindex="0" role="slider" aria-label="Bezier handle two" aria-valuemin="0" aria-valuemax="1"/></svg><div class="ease-lane"><span class="ease-marker"></span></div><div class="ease-lane"><span class="ease-marker linear"></span></div><div class="stage-readout"><span>BEZIER · CORAL</span><span>LINEAR · GREEN</span></div><div class="motion-actions"><button data-motion="impulse">Play transition ↗</button><span data-readout="duration"></span></div><p class="stage-caption">Time on the horizontal. Progress on the vertical.</p></div>';
  } else {
    container.innerHTML = '<div class="motion-stage magnetic"><div class="dock-wrap"><div class="dock" role="group" aria-label="Magnetic tools">' + ['↗', '▧', '✳', '⌘', '▷'].map((glyph, i) => '<button class="dock-tool" data-tool="' + i + '" aria-label="' + ['Pointer', 'Layers', 'Explore', 'Compose', 'Preview'][i] + '" aria-pressed="false">' + glyph + '</button>').join('') + '</div></div><div class="dock-label">MOVE CLOSER. IT WILL FOLLOW.</div><div class="stage-readout"><span data-readout="x"></span><span>FIVE LITTLE POSSIBILITIES</span></div><div class="motion-actions"><button data-motion="impulse">Visit another tool ↗</button><span>Arrow keys work here, too.</span></div><p class="stage-caption">' + label + '</p></div>';
  }
  if (mini) container.classList.add('mini-motion');
  function append(event) {
    try { ticks = appendMotionRecord(events, event, ticks); }
    catch (error) { paused = true; throw error; }
  }
  function render() {
    if (id === 'spring') {
      $('.spring-track:not(.reference) .motion-dot').style.left = (state.x * 100) + '%';
      $('.reference .motion-dot').style.left = (state.referenceX * 100) + '%';
      $('[data-readout="x"]').textContent = 'x ' + state.x.toFixed(4) + ' · v ' + state.v.toFixed(3);
      $('[data-readout="difference"]').textContent = 'Δ ' + Math.abs(state.x - state.referenceX).toFixed(6);
      const points = key => history.map((v, i) => (i ? 'L' : 'M') + (i / Math.max(1, history.length - 1) * 300).toFixed(2) + ',' + (65 - clamp(v[key], -.5, 1.5) * 50).toFixed(2)).join(' ');
      $('.plot-actual').setAttribute('d', points('x'));
      $('.plot-ref').setAttribute('d', points('referenceX'));
    } else if (id === 'easing') {
      const x1 = 30 + p.x1 * 160, y1 = 175 - p.y1 * 160, x2 = 30 + p.x2 * 160, y2 = 175 - p.y2 * 160;
      $('.curve-path').setAttribute('d', 'M30 175 C' + x1 + ' ' + y1 + ' ' + x2 + ' ' + y2 + ' 190 15');
      $('[data-control="one"]').setAttribute('d', 'M30 175 L' + x1 + ' ' + y1);
      $('[data-control="two"]').setAttribute('d', 'M190 15 L' + x2 + ' ' + y2);
      for (const [which, x, y, value] of [['one', x1, y1, p.x1], ['two', x2, y2, p.x2]]) {
        const handle = $('[data-handle="' + which + '"]');
        handle.setAttribute('cx', x); handle.setAttribute('cy', y);
        handle.setAttribute('aria-valuenow', value.toFixed(2));
      }
      $('.ease-marker:not(.linear)').style.left = state.x * 100 + '%';
      $('.ease-marker.linear').style.left = state.referenceX * 100 + '%';
      $('[data-readout="duration"]').textContent = p.duration + ' ms · Δ ' + Math.abs(state.x - state.referenceX).toFixed(3);
    } else {
      for (const [i, tool] of [...container.querySelectorAll('[data-tool]')].entries()) {
        const x = i / 4, distance = (x - state.x) / p.reach;
        const scale = 1 + p.strength * Math.exp(-distance * distance * 1.8);
        tool.style.transform = 'translateY(' + (-18 * (scale - 1)).toFixed(2) + 'px) scale(' + scale.toFixed(4) + ')';
        tool.setAttribute('aria-pressed', String(Math.round(state.target * 4) === i));
      }
      $('[data-readout="x"]').textContent = 'FOLLOW ' + state.x.toFixed(3);
    }
  }
  function settled() {
    return !state.dragging && Math.abs(state.x - state.target) < .00005 && Math.abs(state.v) < .0001 && Math.abs(state.referenceX - state.target) < .00005;
  }
  function advance(steps) {
    append({ type: 'tick', steps });
    state = motionEvent(id, p, state, { type: 'tick', steps });
    history.push({ ...state }); if (history.length > 100) history.shift();
    render(); if (!mini) onChange();
  }
  function loop(now) {
    frame = 0;
    if (!active || paused || document.hidden) { lastTime = 0; return; }
    const delta = lastTime ? Math.min((now - lastTime) / 1000, .05) : DT;
    lastTime = now; accumulator += delta;
    const steps = Math.min(6, Math.floor(accumulator / DT));
    if (steps) { accumulator -= steps * DT; try { advance(steps); } catch (e) { onError(e); return; } }
    if (!settled() && !state.dragging) frame = requestAnimationFrame(loop);
    else { lastTime = 0; accumulator = 0; }
  }
  function animate() {
    if (!active || paused || state.dragging) return;
    if (reduced) { try { advance(600); } catch (e) { onError(e); } return; }
    if (!frame) { lastTime = 0; frame = requestAnimationFrame(loop); }
  }
  function send(event) {
    try { append(event); state = motionEvent(id, p, state, event); if (event.type !== 'tick') paused = false; render(); if (!mini) onChange(); animate(); }
    catch (e) { onError(e); }
  }
  function param(key, value) {
    const next = parameters(id, { ...p, [key]: value });
    append({ type: 'parameter', key, value }); p = next; render(); onChange(); animate();
  }
  const impulse = () => send({ type: 'target', value: state.target < .6 ? .85 : .15 });
  const impulseButton = $('[data-motion="impulse"]');
  listen(impulseButton, 'click', impulse);
  if (id === 'spring') {
    const handle = $('.spring-track:not(.reference) .motion-dot'), track = $('.spring-track:not(.reference)');
    let pointer = null;
    const value = e => { const r = track.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width); };
    listen(handle, 'pointerdown', e => { pointer = e.pointerId; handle.setPointerCapture(pointer); send({ type: 'drag', value: value(e) }); });
    listen(handle, 'pointermove', e => { if (pointer === e.pointerId) send({ type: 'drag', value: value(e) }); });
    const release = e => { if (pointer !== e.pointerId) return; pointer = null; send({ type: 'target', value: .5 }); };
    listen(handle, 'pointerup', release); listen(handle, 'pointercancel', release); listen(handle, 'lostpointercapture', release);
    listen(handle, 'keydown', e => { if (['ArrowLeft', 'ArrowRight', 'Escape'].includes(e.key)) { e.preventDefault(); send({ type: 'target', value: e.key === 'Escape' ? .5 : clamp(state.target + (e.key === 'ArrowRight' ? .1 : -.1)) }); } });
  } else if (id === 'easing') {
    for (const [name, xKey, yKey] of [['one', 'x1', 'y1'], ['two', 'x2', 'y2']]) {
      const handle = $('[data-handle="' + name + '"]');
      let pointer = null;
      listen(handle, 'pointerdown', e => { pointer = e.pointerId; handle.setPointerCapture(pointer); });
      listen(handle, 'pointermove', e => {
        if (pointer !== e.pointerId) return;
        const r = $('.curve-area').getBoundingClientRect();
        const x = clamp(((e.clientX - r.left) / r.width * 220 - 30) / 160);
        const y = clamp((175 - (e.clientY - r.top) / r.height * 200) / 160, -.5, 1.5);
        param(xKey, Number(x.toFixed(2))); param(yKey, Number(y.toFixed(2)));
      });
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(handle, name, () => { pointer = null; });
      listen(handle, 'keydown', e => {
        const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
        if (!keys.includes(e.key)) return;
        e.preventDefault();
        const horizontal = ['ArrowLeft', 'ArrowRight'].includes(e.key), key = horizontal ? xKey : yKey;
        const direction = ['ArrowRight', 'ArrowUp'].includes(e.key) ? 1 : -1;
        param(key, Number(clamp(p[key] + direction * .02, horizontal ? 0 : -.5, horizontal ? 1 : 1.5).toFixed(2)));
      });
    }
  } else {
    const dock = $('.dock');
    listen(dock, 'pointermove', e => { if (e.pointerType === 'touch') return; const r = dock.getBoundingClientRect(); send({ type: 'target', value: clamp((e.clientX - r.left) / r.width) }); });
    listen(dock, 'pointerleave', () => send({ type: 'target', value: .5 }));
    for (const [i, button] of [...container.querySelectorAll('[data-tool]')].entries()) {
      listen(button, 'click', () => send({ type: 'target', value: i / 4 }));
      listen(button, 'keydown', e => { if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault(); const n = (i + (e.key === 'ArrowRight' ? 1 : 4)) % 5; container.querySelectorAll('[data-tool]')[n].focus(); send({ type: 'target', value: n / 4 }); });
    }
  }
  const visibility = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; lastTime = 0; } else animate(); };
  listen(document, 'visibilitychange', visibility);
  render();
  return {
    snapshot: () => ({ ...state }), events: () => events.map(e => ({ ...e })), params: () => ({ ...p }), initialParams,
    param, send, impulse,
    isPaused: () => paused,
    pause(value = true) { paused = value; if (paused) { cancelAnimationFrame(frame); frame = 0; } else animate(); return paused; },
    replay(journal) {
      cancelAnimationFrame(frame); frame = 0; paused = true;
      const result = replayMotion(id, initialParams, journal);
      state = result.state; p = result.params;
      events.splice(0, events.length, ...journal.map(e => ({ ...e })));
      history.splice(0, history.length, ...result.trace.slice(-100).map(t => t.state)); ticks = journal.reduce((n, e) => n + (e.type === 'tick' ? e.steps : 0), 0);
      render(); onChange(); return { ...state };
    },
    destroy() { active = false; cancelAnimationFrame(frame); cleanups.forEach(fn => fn()); },
  };
}
