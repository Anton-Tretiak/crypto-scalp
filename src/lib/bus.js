/** Tiny event bus for cross-module communication. Events: see CLAUDE.md. */
const handlers = new Map();
export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, new Set());
  handlers.get(name).add(fn);
  return () => handlers.get(name).delete(fn);
}
export function emit(name, payload) {
  (handlers.get(name) || []).forEach(fn => { try { fn(payload); } catch (e) { console.error(name, e); } });
}
