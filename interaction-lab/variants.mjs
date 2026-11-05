import { parseVariant } from './journal.mjs';
const KEY = 'gondola.interaction-lab.variants.v1';
export function createShelf(storage) {
  let items = [], error = null;
  try { const raw = storage?.getItem(KEY); if (raw) { const data = JSON.parse(raw); if (!Array.isArray(data) || data.length > 60) throw Error('Invalid shelf'); items = data.map(v => parseVariant(JSON.stringify(v))); } } catch (e) { error = e.message; }
  function commit(next) {
    try { if (!storage) throw Error('Browser storage is unavailable'); storage.setItem(KEY, JSON.stringify(next)); items = next; error = null; return { ok: true }; }
    catch (e) { error = e.message; return { ok: false, error }; }
  }
  return {
    list: () => structuredClone(items), error: () => error,
    save(variant) { const v = parseVariant(JSON.stringify(variant)); const next = items.filter(i => i.id !== v.id); if (next.length >= 60) return { ok: false, error: 'Shelf is full (60 variants). Export a backup and remove a variant.' }; return commit([...next, v]); },
    remove(id) { return commit(items.filter(i => i.id !== id)); },
  };
}
