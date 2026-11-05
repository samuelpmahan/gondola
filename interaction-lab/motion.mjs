import { parameters } from './registry.mjs';
export const DT = 1 / 120;
export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export function initialMotion(id, params = {}) {
  parameters(id, params);
  return { x: .5, v: 0, referenceX: .5, referenceV: 0, target: .5, time: 0, elapsed: 0, from: .5, dragging: false };
}
export function exactSpring(state, p, dt) {
  const w = Math.sqrt(p.stiffness / p.mass), a = p.damping / (2 * p.mass), y = state.x - state.target;
  let displacement, velocity;
  if (Math.abs(a - w) < 1e-8) {
    const b = state.v + a * y, e = Math.exp(-a * dt);
    displacement = (y + b * dt) * e;
    velocity = (state.v - a * b * dt) * e;
  } else if (a < w) {
    const d = Math.sqrt(w * w - a * a), b = (state.v + a * y) / d;
    const c = Math.cos(d * dt), sn = Math.sin(d * dt), e = Math.exp(-a * dt);
    displacement = e * (y * c + b * sn);
    velocity = e * ((b * d - a * y) * c + (-y * d - a * b) * sn);
  } else {
    const d = Math.sqrt(a * a - w * w), r1 = -a + d, r2 = -a - d;
    const c1 = (state.v - r2 * y) / (r1 - r2), c2 = y - c1;
    displacement = c1 * Math.exp(r1 * dt) + c2 * Math.exp(r2 * dt);
    velocity = r1 * c1 * Math.exp(r1 * dt) + r2 * c2 * Math.exp(r2 * dt);
  }
  return { x: state.target + displacement, v: velocity };
}
const bez = (t, p1, p2) => 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3;
export function cubicBezier(time, [x1, y1, x2, y2]) {
  if (time <= 0) return 0;
  if (time >= 1) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (bez(mid, x1, x2) < time) lo = mid; else hi = mid; }
  return bez((lo + hi) / 2, y1, y2);
}
export function motionEvent(id, rawParams, state, event) {
  const p = parameters(id, rawParams), s = { ...state };
  if (!event || typeof event !== 'object') throw new TypeError('Missing motion event');
  if (event.type === 'target' || event.type === 'drag') {
    if (!Number.isFinite(event.value) || event.value < 0 || event.value > 1) throw new TypeError('Target must be between zero and one');
    s.target = event.value; s.from = s.x; s.elapsed = 0;
    s.dragging = event.type === 'drag';
    if (s.dragging) { s.x = event.value; s.referenceX = event.value; s.v = 0; s.referenceV = 0; }
    return s;
  }
  if (event.type !== 'tick' || !Number.isInteger(event.steps) || event.steps < 1 || event.steps > 1200) throw new TypeError('Invalid fixed tick');
  for (let i = 0; i < event.steps; i++) {
    s.time += DT; s.elapsed += DT;
    if (s.dragging) continue;
    if (id === 'easing') {
      const t = clamp(s.elapsed / (p.duration / 1000));
      s.x = s.from + (s.target - s.from) * cubicBezier(t, [p.x1, p.y1, p.x2, p.y2]);
      s.referenceX = s.from + (s.target - s.from) * t;
      s.v = 0; s.referenceV = 0;
    } else {
      s.v += (-p.stiffness * (s.x - s.target) - p.damping * s.v) / p.mass * DT;
      s.x += s.v * DT;
      const reference = exactSpring({ x: s.referenceX, v: s.referenceV, target: s.target }, p, DT);
      s.referenceX = reference.x; s.referenceV = reference.v;
    }
  }
  return s;
}
