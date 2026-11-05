const number = (label, min, max, step, value) => ({ label, min, max, step, value });
const spring = { stiffness: number('Stiffness', 40, 400, 5, 170), damping: number('Damping', 2, 45, 1, 14), mass: number('Mass', .3, 3, .1, 1) };
export const experiments = [
  { id: 'spring', number: '01', title: 'A little give.', category: 'Motion', kind: 'motion', subtitle: 'Pull, release, find the feeling.', instruction: 'Drag the coral handle. Release to spring home. Compare a fixed-step spring with its analytic solution.', params: spring, badge: 'Spring / analytic' },
  { id: 'easing', number: '02', title: 'Time, reshaped.', category: 'Motion', kind: 'motion', subtitle: 'A curve you can feel.', instruction: 'Drag either curve handle, or tune the values. Play the transition to compare your curve with linear time.', params: { x1: number('Handle 1 · time', 0, 1, .01, .25), y1: number('Handle 1 · progress', -.5, 1.5, .01, .1), x2: number('Handle 2 · time', 0, 1, .01, .25), y2: number('Handle 2 · progress', -.5, 1.5, .01, 1), duration: number('Duration · ms', 150, 1800, 25, 650) }, badge: 'Bezier / linear' },
  { id: 'dock', number: '03', title: 'Drawn to you.', category: 'Motion', kind: 'motion', subtitle: 'A magnetic little workspace.', instruction: 'Move across the dock or tap a tool. Adjust reach and strength while it follows you. Arrow keys select tools.', params: { ...spring, reach: number('Reach', .08, .45, .01, .22), strength: number('Magnification', .1, 1, .05, .55) }, badge: 'Pointer + touch' },
  { id: 'form', number: '04', title: 'State stays.', category: 'Components', kind: 'go', subtitle: 'New renderer. Same thought.', instruction: 'Type a thought and save it. Switch between DOM and React; the compiled Go state survives the replacement.', params: { duration: number('Transition · ms', 0, 800, 25, 250), radius: number('Corner radius', 0, 32, 1, 12) }, badge: 'Compiled Go' },
  { id: 'list', number: '05', title: 'Identity in motion.', category: 'Components', kind: 'go', subtitle: 'Move the row. Keep the meaning.', instruction: 'Add rows, edit their labels, mark one done, then move it up. Keys keep state with the item in both renderers.', params: { duration: number('Transition · ms', 0, 800, 25, 300), radius: number('Corner radius', 0, 32, 1, 12) }, badge: 'Keyed Go nodes' },
  { id: 'effect', number: '06', title: 'While you wait.', category: 'Components', kind: 'go', subtitle: 'A request outlives its renderer.', instruction: 'Enter a value and Request. Swap the renderer while it is pending. Complete the reply yourself, or let the timer deliver it. Cancel & reset disposes the host.', params: { latency: number('Reply delay · ms', 250, 5000, 50, 1500), duration: number('Transition · ms', 0, 800, 25, 250), radius: number('Corner radius', 0, 32, 1, 12) }, badge: 'Request / reply' },
];
export function experiment(id) {
  const found = experiments.find(e => e.id === id);
  if (!found) throw new TypeError('Unknown experiment: ' + id);
  return found;
}
export function parameters(id, input = {}) {
  const schema = experiment(id).params;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Parameters must be an object');
  for (const key of Object.keys(input)) if (!Object.hasOwn(schema, key)) throw new TypeError('Unknown parameter: ' + key);
  const result = {};
  for (const [key, spec] of Object.entries(schema)) {
    const v = input[key] ?? spec.value;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < spec.min || v > spec.max) throw new TypeError('Parameter out of range: ' + key);
    result[key] = v;
  }
  return result;
}
export function candidate(id, seed) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TypeError('Seed must be a uint32');
  let s = seed >>> 0;
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  return Object.fromEntries(Object.entries(experiment(id).params).map(([k, p]) => {
    const steps = Math.floor((p.max - p.min) / p.step);
    return [k, Math.min(p.max, Number((p.min + Math.floor(next() * (steps + 1)) * p.step).toFixed(4)))];
  }));
}
