// Main menu (title screen) + pause menu. The current world renders live behind it.
import { BIOMES, biomeName } from './biomes.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const swatch = (id) => { const b = BIOMES.find((x) => x.id === id); return b ? `linear-gradient(180deg, ${b.swatch[0]} 0 55%, ${b.swatch[1]} 55%)` : '#333'; };
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' days ago';
}
const CONTROLS = [
  ['Move', 'WASD · Shift sprint · Space jump · (flying: Space up, C / Ctrl / X down)'], ['Fly / walk', 'F (turn Fly mode on in Settings first)'], ['Build menu', 'Tab or B'], ['Hotbar', '1 – 0 · hover a piece in the menu + number to assign'],
  ['Place / zoop', 'Click · hold and drag to repeat'], ['Remove', 'Right-click'], ['Rotate', 'Wheel or R · Shift + wheel = 15°'], ['Snap to edges', 'G toggles'], ['Auto-level ground', 'N: foundations flatten the land under them'],
  ['Level up / down', 'Q / E'], ['Nudge', 'Arrows · , and . change the step'], ['Material', 'M · Shift + M for roofs'], ['Customize', 'U panel · + / − size · PgUp / PgDn lift · Backspace reset'],
  ['Free placement', 'H (clip pieces anywhere) · [ ] grid'], ['Sample a piece', 'Middle-click or I'], ['Repaint / swap / open', 'V / Z / O while aiming at a piece'], ['Undo / redo', 'Ctrl + Z / Ctrl + Y'],
  ['Copy / paste', 'Y twice to select · P to paste'], ['Physics view', 'J structural ↔ creative · K stress colours'], ['Day / night', 'L'], ['All controls on screen', '/'],
];

export function createTitle(api) {
  const root = document.getElementById('title');
  let base = 'home', screen = 'home', fresh = false;
  const draft = { biome: 'desert', start: 'platform', mode: 'creative' };

  function sideHTML() {
    const cur = api.current();
    if (base === 'pause') return `<h1>peace</h1><p class="t-tag">${cur ? esc(cur.name) + ' · ' + biomeName(cur.biome) : 'Paused'}</p>
      <nav><button class="t-primary" data-act="resume">${fresh ? 'Enter world' : 'Resume'}<small>click, then build · Esc pauses</small></button>
      <button data-act="settings">Settings</button><button data-act="controls">Controls</button><button data-act="menu">Save &amp; main menu</button></nav>`;
    const n = api.saves().length;
    return `<h1>peace</h1><p class="t-tag">a quiet place to build anything</p>
      <nav>${cur ? `<button class="t-primary" data-act="continue">Continue<small>${esc(cur.name)} · ${biomeName(cur.biome)}</small></button>` : ''}
      <button ${cur ? '' : 'class="t-primary"'} data-act="new">New world</button>
      <button data-act="load"${n ? '' : ' disabled'}>Load world<span>${n}</span></button>
      <button data-act="settings">Settings</button><button data-act="controls">Controls</button></nav>
      <footer><button class="t-link" data-act="import">Import a world file…</button></footer>`;
  }

  function panelHTML() {
    const card = (title, body, foot = '') => `<section class="t-card"><header><h2>${title}</h2><button class="t-x" data-act="back" aria-label="Back">×</button></header><div class="t-body">${body}</div>${foot ? `<footer>${foot}</footer>` : ''}</section>`;
    if (screen === 'new') {
      const seg = (key, opts) => `<div class="t-seg">${opts.map(([v, l]) => `<button data-set="${key}" data-val="${v}" aria-pressed="${draft[key] === v}">${l}</button>`).join('')}</div>`;
      return card('New world', `
        <label class="t-field"><span>Name</span><input id="t-name" maxlength="40" value="${esc(draft.name || 'World ' + (api.saves().length + 1))}"></label>
        <h3>Biome</h3><div class="t-biomes">${BIOMES.map((b) => `<button class="t-biome" data-set="biome" data-val="${b.id}" aria-pressed="${draft.biome === b.id}"><i style="background:${swatch(b.id)}"></i><strong>${b.name}</strong><small>${b.blurb}</small></button>`).join('')}</div>
        <div class="t-opts"><div><h3>Physics</h3>${seg('mode', [['creative', 'Creative'], ['structural', 'Structural']])}</div></div>
        <p class="t-hint">${draft.mode === 'structural' ? 'Structural: walls, floors and roofs need posts and beams, and weak builds collapse. Press J in game to switch.' : 'Creative: place anything anywhere, nothing ever collapses. Press J in game to switch.'}</p>`,
      `<button data-act="back">Back</button><button class="t-primary" data-act="create">Create world</button>`);
    }
    if (screen === 'load') {
      const cur = api.current()?.id, list = api.saves();
      return card('Your worlds', list.length ? `<div class="t-saves">${list.map((s) => `<article class="t-save${s.id === cur ? ' on' : ''}">
          <div class="t-thumb" style="background:${s.thumb ? `url(${s.thumb}) center/cover` : swatch(s.biome)}"></div>
          <div class="t-info"><strong>${esc(s.name)}</strong><small>${biomeName(s.biome)} · ${s.count || 0} pieces · ${s.mode === 'structural' ? 'structural' : 'creative'} · ${ago(s.updated)}</small>
          <div class="t-acts"><button data-act="rename" data-id="${s.id}">Rename</button><button data-act="dup" data-id="${s.id}">Duplicate</button><button data-act="export" data-id="${s.id}">Export</button><button class="t-danger" data-act="delete" data-id="${s.id}">Delete</button></div></div>
          <button class="t-primary t-play" data-act="play" data-id="${s.id}">${s.id === cur ? 'Continue' : 'Play'}</button></article>`).join('')}</div>` : '<p class="t-hint">No worlds yet.</p>',
      `<button data-act="import">Import file…</button><button class="t-primary" data-act="new">New world</button>`);
    }
    if (screen === 'settings') {
      const s = api.getSettings(), tog = (k, l) => `<label class="t-toggle"><input type="checkbox" data-setting="${k}"${s[k] ? ' checked' : ''}><span>${l}</span></label>`;
      const range = (k, l, min, max, st) => `<label class="t-range"><span>${l}</span><input type="range" data-setting="${k}" min="${min}" max="${max}" step="${st}" value="${s[k]}"><output>${s[k]}</output></label>`;
      return card('Settings', `${range('sens', 'Mouse sensitivity', 0.3, 3, 0.05)}${range('fov', 'Field of view', 50, 100, 1)}
        <div class="t-row"><span>Graphics</span><div class="t-seg">${['low', 'medium', 'high'].map((q) => `<button data-quality="${q}" aria-pressed="${s.quality === q}">${q}</button>`).join('')}</div></div>
        ${tog('flyMode', 'Allow fly mode (press F in game)')}${tog('shadows', 'Shadows')}${tog('invertY', 'Invert mouse Y')}${tog('help', 'Show all controls on screen')}`);
    }
    if (screen === 'controls') return card('Controls', `<dl class="t-keys">${CONTROLS.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>`);
    return '';
  }

  function render() {
    root.innerHTML = `<div class="t-side">${sideHTML()}</div><div class="t-main">${panelHTML()}</div>`;
  }
  const go = (s) => { if (s === 'new') draft.name = ''; screen = s; render(); };

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    if (b.dataset.set) { if (draft.biome && document.getElementById('t-name')) draft.name = document.getElementById('t-name').value; draft[b.dataset.set] = b.dataset.val; render(); return; }
    if (b.dataset.quality) { api.setSettings({ ...api.getSettings(), quality: b.dataset.quality }); render(); return; }
    switch (act) {
      case 'continue': case 'resume': api.onResume(); break;
      case 'new': case 'load': case 'settings': case 'controls': go(act); break;
      case 'back': go(base); break;
      case 'menu': api.onSaveQuit(); base = 'home'; fresh = false; go('home'); break;
      case 'create': api.onCreate({ name: document.getElementById('t-name').value.trim() || 'New World', biome: draft.biome, start: draft.start, mode: draft.mode }); break;
      case 'play': api.onPlay(id); break;
      case 'rename': { const s = api.saves().find((x) => x.id === id); const n = prompt('Rename world:', s?.name || ''); if (n && n.trim()) { api.onRename(id, n.trim()); render(); } break; }
      case 'dup': api.onDuplicate(id); render(); break;
      case 'export': api.onExport(id); break;
      case 'delete': { const s = api.saves().find((x) => x.id === id); if (confirm(`Delete "${s?.name}"? This cannot be undone.`)) { api.onDelete(id); render(); } break; }
      case 'import': api.onImport(); break;
    }
  });
  root.addEventListener('input', (e) => {
    const k = e.target.dataset.setting; if (!k) return;
    const s = api.getSettings(), v = e.target.type === 'checkbox' ? e.target.checked : +e.target.value;
    api.setSettings({ ...s, [k]: v });
    const out = e.target.parentElement.querySelector('output'); if (out) out.textContent = e.target.value;
  });
  addEventListener('keydown', (e) => {
    if (!ui.open || e.code !== 'Escape' || e.target instanceof HTMLInputElement) return;
    if (screen !== base) go(base);   // (resuming needs a click: browsers only grant mouse lock from one)
  });

  const ui = {
    open: false,
    get mode() { return screen; },
    get base() { return base; },
    show(mode = 'home', opts = {}) {
      base = mode === 'pause' ? 'pause' : 'home'; screen = mode === 'pause' ? 'pause' : mode; fresh = !!opts.fresh;
      ui.open = true; root.classList.add('open'); document.body.classList.add('title'); document.body.classList.toggle('paused', base === 'pause');
      render();
    },
    hide() { ui.open = false; root.classList.remove('open'); document.body.classList.remove('title', 'paused'); fresh = false; },
    refresh: render,
  };
  return ui;
}
