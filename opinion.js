// Opinión ("feeling") por partido: va al lado del modelo, sin tocarlo.
// Se guarda cada opinión con la probabilidad que daba el modelo en ese momento; cuando el partido termina
// se califica, y así se mide si la intuición acierta más de lo que el modelo esperaba.
(function (root) {
  'use strict';
  const KEY = 'radar.opinions';
  const PICKS = [
    { id: '1', label: h => `Gana ${h}`, fn: (h, a) => h > a },
    { id: '1X', label: h => `${h} gana o empata`, fn: (h, a) => h >= a },
    { id: 'X', label: () => 'Empate', fn: (h, a) => h === a },
    { id: 'X2', label: (h, v) => `${v} gana o empata`, fn: (h, a) => a >= h },
    { id: '2', label: (h, v) => `Gana ${v}`, fn: (h, a) => a > h },
    { id: '12', label: () => 'No empate', fn: (h, a) => h !== a },
  ];
  const fnOf = id => (PICKS.find(p => p.id === id) || {}).fn;

  let store = null; // para pruebas en Node
  function load() {
    if (store) return store;
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save(all) {
    if (store) { store = all; return; }
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* nada */ }
  }

  function get(key) { return load()[key] || null; }
  // rec: {pick, pModel, match, date}
  function set(key, rec) {
    const all = load();
    if (!rec || !rec.pick) delete all[key];
    else all[key] = { ...(all[key] || {}), ...rec, hit: undefined, result: undefined, at: Date.now() };
    save(all);
  }
  // Califica la opinión con el marcador final (una sola vez).
  function resolve(key, hs, as) {
    const all = load(), r = all[key];
    if (!r || r.hit != null || hs == null || as == null) return r || null;
    const fn = fnOf(r.pick);
    if (!fn) return r;
    r.hit = !!fn(hs, as); r.result = `${hs}-${as}`;
    save(all);
    return r;
  }

  // ¿Coincide con el modelo? Según la probabilidad que el modelo le da a lo mismo que dice la opinión.
  function agreement(pModel) {
    if (pModel == null) return null;
    if (pModel >= 0.6) return { tag: 'ok', text: 'el modelo coincide' };
    if (pModel >= 0.4) return { tag: 'vol', text: 'el modelo lo ve parejo' };
    return { tag: 'bad', text: 'el modelo no coincide' };
  }

  // Registro: cuántas acertó la opinión vs cuántas esperaba el modelo para esas mismas selecciones.
  // Si la opinión acierta más de lo esperado, la intuición le agrega algo al modelo.
  function stats() {
    const done = Object.values(load()).filter(r => r.hit != null && r.pModel != null);
    const n = done.length;
    if (!n) return { n: 0, pending: Object.values(load()).filter(r => r.hit == null).length };
    const hits = done.filter(r => r.hit).length;
    const expected = done.reduce((a, r) => a + r.pModel, 0);
    const brier = done.reduce((a, r) => a + (r.pModel - (r.hit ? 1 : 0)) ** 2, 0) / n;
    const agreeN = done.filter(r => r.pModel >= 0.6), disN = done.filter(r => r.pModel < 0.4);
    return {
      n, hits, expected, brier,
      agree: { n: agreeN.length, hits: agreeN.filter(r => r.hit).length },
      disagree: { n: disN.length, hits: disN.filter(r => r.hit).length },
      pending: Object.values(load()).filter(r => r.hit == null).length,
    };
  }

  const api = { PICKS, get, set, resolve, agreement, stats, _useMemory: s => { store = s || {}; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadarOpinion = api;
})(typeof window !== 'undefined' ? window : globalThis);
