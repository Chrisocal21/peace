// Save slots + settings, all in localStorage.
// Each world: an index entry (name, biome, seed, mode, thumbnail...) plus two data keys (pieces, terrain).
const INDEX = 'peace.saves.v1', CUR = 'peace.current', SETTINGS = 'peace.settings.v1';
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const del = (k) => { try { localStorage.removeItem(k); } catch {} };

export const worldKey = (id) => `peace.save.${id}.world`;
export const terrainKey = (id) => `peace.save.${id}.terrain`;

export function listSaves() {
  try { const a = JSON.parse(get(INDEX)); return Array.isArray(a) ? a : []; } catch { return []; }
}
export const writeSaves = (a) => set(INDEX, JSON.stringify(a));
export const getSave = (id) => listSaves().find((s) => s.id === id) || null;
export const currentId = () => get(CUR);
export const setCurrent = (id) => (id ? set(CUR, id) : del(CUR));

export function updateSave(id, patch) {
  const a = listSaves(), s = a.find((x) => x.id === id);
  if (!s) return null;
  Object.assign(s, patch);
  return writeSaves(a) ? s : null;
}

export function createSave({ name, biome, start = 'platform', mode = 'creative', seed, world = null, terrain = null, night = false }) {
  const id = 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const meta = { id, name: (name || 'New World').slice(0, 40), biome, seed: seed ?? Math.floor(Math.random() * 99999) + 1, start, mode, night, created: Date.now(), updated: Date.now(), count: 0, thumb: null };
  const a = listSaves(); a.unshift(meta);
  if (!writeSaves(a)) return null;
  if (world) set(worldKey(id), typeof world === 'string' ? world : JSON.stringify(world));
  if (terrain) set(terrainKey(id), terrain);
  return meta;
}

export function deleteSave(id) {
  del(worldKey(id)); del(terrainKey(id));
  writeSaves(listSaves().filter((s) => s.id !== id));
  if (currentId() === id) setCurrent(null);
}

export function duplicateSave(id) {
  const s = getSave(id); if (!s) return null;
  const copy = createSave({ ...s, name: (s.name + ' (copy)').slice(0, 40), world: get(worldKey(id)), terrain: get(terrainKey(id)) });
  if (copy) updateSave(copy.id, { thumb: s.thumb, count: s.count });
  return copy;
}

export function exportSave(id) {
  const s = getSave(id); if (!s) return null;
  let world = []; try { world = JSON.parse(get(worldKey(id))) || []; } catch {}
  return { app: 'peace', v: 2, name: s.name, biome: s.biome, seed: s.seed, mode: s.mode, night: s.night, world, terrain: get(terrainKey(id)) };
}

export const readWorld = (id) => { try { return JSON.parse(get(worldKey(id))); } catch { return null; } };
export const readTerrain = (id) => get(terrainKey(id));
export const writeWorld = (id, data) => set(worldKey(id), JSON.stringify(data));
export const writeTerrain = (id, b64) => set(terrainKey(id), b64);

// the single autosave from before save slots existed becomes "My First World"
export function migrateLegacy() {
  if (listSaves().length) return;
  const w = get('peace.world.v1'), t = get('peace.terrain.v1');
  if (!w && !t) return;
  const m = createSave({ name: 'My First World', biome: 'desert', seed: 1, mode: 'structural', world: w, terrain: t });
  if (m) setCurrent(m.id);
}

export const DEFAULT_SETTINGS = { sens: 1, invertY: false, fov: 63, quality: 'high', shadows: true, help: false, flyMode: false };
export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(get(SETTINGS)) || {}) }; } catch { return { ...DEFAULT_SETTINGS }; }
}
export const saveSettings = (s) => set(SETTINGS, JSON.stringify(s));
