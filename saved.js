// Mis tickets: guarda tickets de la calculadora en este navegador (gratis), con resultado ganado/perdido.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = x => '$' + (isFinite(x) ? x.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-');
  const KEY = 'radar.saved';
  const DK = 'radar.saved.del', SK = 'radar.synckey';
  let list = load();
  let tomb = (() => { try { return JSON.parse(localStorage.getItem(DK)) || {}; } catch (e) { return {}; } })();
  let armed = null; // id con "borrar" pendiente de confirmar
  let openId = null;

  function load() { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(list)); localStorage.setItem(DK, JSON.stringify(tomb)); scheduleSync(); return true; }
    catch (e) { $('savedmsg').innerHTML = '<div class="err">Este navegador no permite guardar (modo privado). Usa "Exportar" para no perderlos.</div>'; return false; }
  }

  function fmt(ts) { try { return new Date(ts).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }

  window.RadarSaved = { setKind: k => { const e = document.getElementById('savekind'); if (e) e.value = k; } };

  function saveCurrent() {
    const snap = window.RadarSlip.snapshot();
    if (!snap.legs.length) { $('savedmsg').innerHTML = '<p class="note">El ticket está vacío: agrega selecciones con +.</p>'; return; }
    const name = ($('savename').value || '').trim() || `Ticket ${fmt(Date.now())}`;
    const c = window.RadarSlip.calc();
    list.unshift({
      id: String(Date.now()), name, createdAt: Date.now(), updatedAt: Date.now(), stake: snap.stake, legs: snap.legs,
      odd: c.real.odd, payout: c.real.payout, p: c.p, withDft: c.withDft, status: 'pendiente', kind: $('savekind').value || (c.real.odd >= 100 ? 'sonador' : 'regular'),
    });
    if (persist()) {
      $('savename').value = ''; $('savekind').value = 'regular';
      $('savedmsg').innerHTML = `<p class="note good">Guardado: ${esc(name)}. Ya puedes vaciar el ticket y armar otro.</p>`;
    }
    render();
  }

  function setStatus(id, status) { const t = list.find(x => x.id === id); if (t) { t.status = status; t.updatedAt = Date.now(); persist(); render(); } }
  function del(id) {
    if (armed !== id) { armed = id; render(); return; }
    list = list.filter(x => x.id !== id); tomb[id] = Date.now(); armed = null; persist(); render();
  }
  function openInCalc(id) {
    const t = list.find(x => x.id === id);
    if (!t) return;
    window.RadarSlip.load({ stake: t.stake, legs: t.legs });
    $('slip').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function summary(kind) {
    const L = kind ? list.filter(t => (t.kind || 'regular') === kind) : list;
    const done = L.filter(t => t.status !== 'pendiente');
    const staked = done.reduce((a, t) => a + (+t.stake || 0), 0);
    const won = done.filter(t => t.status === 'ganado').reduce((a, t) => a + (+t.payout || 0), 0);
    const hits = done.filter(t => t.status === 'ganado').length;
    const pend = L.filter(t => t.status === 'pendiente');
    return { n: done.length, hits, staked, won, balance: won - staked, pendStake: pend.reduce((a, t) => a + (+t.stake || 0), 0), pend: pend.length };
  }

  function render() {
    const s = summary();
    let html = '';
    if (list.length) {
      html += `<div class="sgrid one">
        <span>Tickets cerrados</span><b class="num">${s.n} (${s.hits} ganados)</b>
        <span>Apostado en cerrados</span><b class="num">${money(s.staked)}</b>
        <span>Cobrado</span><b class="num">${money(s.won)}</b>
        <span>Balance</span><b class="num ${s.balance >= 0 ? 'good' : 'bad'}">${(s.balance >= 0 ? '+' : '') + money(s.balance)}</b>
        <span>Pendientes</span><b class="num">${s.pend} · ${money(s.pendStake)}</b>
      </div>`;
      const r = summary('regular'), d = summary('sonador');
      if (d.n + d.pend) html += `<div class="sgrid"><span></span><span class="hd">Regulares</span><span class="hd">Soñadores</span>
        <span>Cerrados (ganados)</span><b class="num">${r.n} (${r.hits})</b><b class="num">${d.n} (${d.hits})</b>
        <span>Balance</span><b class="num ${r.balance >= 0 ? 'good' : 'bad'}">${(r.balance >= 0 ? '+' : '') + money(r.balance)}</b><b class="num ${d.balance >= 0 ? 'good' : 'bad'}">${(d.balance >= 0 ? '+' : '') + money(d.balance)}</b></div>`;
    }
    html += list.map(t => {
      const cls = { ganado: 'ok', perdido: 'bad', pendiente: 'no' }[t.status] || 'no';
      const open = openId === t.id;
      const legs = open ? `<div class="svlegs">${[...t.legs].sort((a, b) => (a.t ? new Date(a.t).getTime() : Infinity) - (b.t ? new Date(b.t).getTime() : Infinity)).map(l => `<div class="svleg"><span>${esc(l.label)}<br><span class="m">${l.t ? `<span class="hr num">${new Date(l.t).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}</span> ` : ''}${esc(l.match)}${l.p ? ` · modelo ${Math.round(l.p * 100)}%` : ''}${l.hit === true ? ' ✓' : l.hit === false ? ' ✗' : ''}</span></span><span class="num">${l.dft ? 'Draftea ' + (+l.dft).toFixed(2) : 'prov. ' + (l.prov ? (+l.prov).toFixed(2) : '-')}</span></div>`).join('')}</div>` : '';
      return `<div class="sv">
        <button class="svh" data-toggle="${t.id}" aria-expanded="${open}">
          <span><b>${esc(t.name)}</b><br><span class="m">${fmt(t.createdAt)} · ${t.legs.length} selecciones · momio ${(+t.odd || 0).toFixed(2)} · ${money(+t.stake)} → ${money(+t.payout)}</span></span>
          <span>${t.kind === 'sonador' ? '<span class="st lean">soñador</span> ' : ''}<span class="st ${cls}">${esc(t.status)}</span></span>
        </button>
        ${legs}
        <div class="svact">
          <button class="btn ghost sm" data-open="${t.id}">Abrir en calculadora</button>
          <button class="btn ghost sm" data-st="${t.id}:ganado">Ganado</button>
          <button class="btn ghost sm" data-st="${t.id}:perdido">Perdido</button>
          ${t.status !== 'pendiente' ? `<button class="btn ghost sm" data-st="${t.id}:pendiente">Pendiente</button>` : ''}
          <button class="btn ghost sm ${armed === t.id ? 'danger' : ''}" data-del="${t.id}">${armed === t.id ? '¿Seguro? Toca otra vez' : 'Borrar'}</button>
        </div>
      </div>`;
    }).join('') || '<p class="note">Aún no guardas tickets. Arma uno en la calculadora y dale "Guardar ticket".</p>';
    $('savedlist').innerHTML = html;
    $('savedlist').querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => { openId = openId === b.dataset.toggle ? null : b.dataset.toggle; render(); }));
    $('savedlist').querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openInCalc(b.dataset.open)));
    $('savedlist').querySelectorAll('[data-st]').forEach(b => b.addEventListener('click', () => { const [id, st] = b.dataset.st.split(':'); setStatus(id, st); }));
    $('savedlist').querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => del(b.dataset.del)));
  }

  // Pasar tickets entre celular y PC sin costo: archivo exportado / importado.
  function exportFile() {
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mis-tickets-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importFile(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const inc = JSON.parse(r.result);
        if (!Array.isArray(inc)) throw new Error('formato');
        const ids = new Set(list.map(t => t.id));
        const added = inc.filter(t => t && t.id && Array.isArray(t.legs) && !ids.has(t.id));
        list = [...added, ...list].sort((a, b) => b.createdAt - a.createdAt);
        persist(); render();
        $('savedmsg').innerHTML = `<p class="note good">Importados ${added.length} ticket(s).</p>`;
      } catch (e) { $('savedmsg').innerHTML = '<div class="err">Ese archivo no es de Mis tickets.</div>'; }
    };
    r.readAsText(file);
  }

  // ---- Nube: los mismos tickets en todos tus dispositivos (protegido con tu código) ----
  const ts = t => +t.updatedAt || +t.createdAt || 0;
  function merge(a, b) {
    const del = { ...a.del };
    for (const [k, v] of Object.entries(b.del || {})) del[k] = Math.max(del[k] || 0, +v || 0);
    const by = new Map();
    for (const t of [...a.tickets, ...(b.tickets || [])]) if (t && t.id && Array.isArray(t.legs)) { const o = by.get(t.id); if (!o || ts(t) > ts(o)) by.set(t.id, t); }
    const tickets = [...by.values()].filter(t => !(del[t.id] >= ts(t))).sort((x, y) => y.createdAt - x.createdAt);
    return { tickets, del };
  }
  const syncKey = () => { try { return localStorage.getItem(SK) || ''; } catch (e) { return ''; } };
  let syncT = null, syncing = false, again = false;
  function scheduleSync() { if (!syncKey()) return; clearTimeout(syncT); syncT = setTimeout(sync, 600); }
  function syncMsg(txt, cls = '') { const e = $('syncst'); if (e) { e.textContent = txt; e.className = 'm ' + cls; } }
  async function sync() {
    const key = syncKey(); if (!key) { syncMsg('apagado'); return; }
    if (syncing) { again = true; return; }
    syncing = true; syncMsg('sincronizando…');
    try {
      const h = { 'x-key': key, 'content-type': 'application/json' };
      const r = await fetch('/api/tickets', { headers: h, cache: 'no-store' });
      if (r.status === 401) { syncMsg('código incorrecto', 'bad'); return; }
      if (r.status === 503) { syncMsg('falta activar la nube en Vercel', 'bad'); return; }
      if (!r.ok) throw new Error(r.status);
      const m = merge({ tickets: list, del: tomb }, await r.json());
      list = m.tickets; tomb = m.del;
      localStorage.setItem(KEY, JSON.stringify(list)); localStorage.setItem(DK, JSON.stringify(tomb));
      const w = await fetch('/api/tickets', { method: 'PUT', headers: h, body: JSON.stringify({ tickets: list, del: tomb }) });
      if (!w.ok) throw new Error(w.status);
      syncMsg(`al día · ${list.length} ticket(s) · ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`, 'good');
      render();
    } catch (e) { syncMsg('sin conexión con la nube; se guardó en este dispositivo', 'bad'); }
    finally { syncing = false; if (again) { again = false; scheduleSync(); } }
  }
  function syncUi() {
    const on = !!syncKey();
    $('synckey').value = ''; $('synckey').classList.toggle('hidden', on); $('syncgo').classList.toggle('hidden', on); $('syncoff').classList.toggle('hidden', !on);
    if (!on) syncMsg('apagado');
  }
  window.RadarSaved.merge = merge;

  function init() {
    $('syncgo').addEventListener('click', () => { const k = $('synckey').value.trim(); if (!k) return; try { localStorage.setItem(SK, k); } catch (e) {} syncUi(); sync(); });
    $('synckey').addEventListener('keydown', e => { if (e.key === 'Enter') $('syncgo').click(); });
    $('syncoff').addEventListener('click', () => { try { localStorage.removeItem(SK); } catch (e) {} syncUi(); });
    syncUi(); sync();
    window.addEventListener('focus', () => scheduleSync());
    $('savebtn').addEventListener('click', saveCurrent);
    $('savename').addEventListener('keydown', e => { if (e.key === 'Enter') saveCurrent(); });
    $('exportbtn').addEventListener('click', exportFile);
    $('importbtn').addEventListener('click', () => $('importfile').click());
    $('importfile').addEventListener('change', e => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; });
    render();
  }
  init();
})();
