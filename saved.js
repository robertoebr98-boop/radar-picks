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
  const LIVE = new Map(); // id de ticket → estados por selección (marcador en vivo)

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
      odd: c.real.odd, payout: c.real.payout, p: c.p, withDft: c.withDft, status: 'pendiente', kind: (() => { const k = $('savekind').value || (c.real.odd >= 100 ? 'sonador' : 'regular'); return k === 'regular' && window.RadarMoney && window.RadarMoney.isSafe(c.p) ? 'safe' : k; })(),
    });
    if (persist()) {
      $('savename').value = ''; $('savekind').value = 'regular';
      $('savedmsg').innerHTML = `<p class="note good">Guardado: ${esc(name)}. Ya puedes vaciar el ticket y armar otro.</p>`;
    }
    render();
  }

  // Guardar un ticket armado fuera de la calculadora (ej. Pronóstico soñador).
  window.RadarSaved.saveTicket = o => {
    if (!o || !o.legs || !o.legs.length) return false;
    list.unshift({ id: String(Date.now()), name: o.name || `Ticket ${fmt(Date.now())}`, createdAt: Date.now(), updatedAt: Date.now(), stake: o.stake, legs: o.legs,
      odd: o.odd, payout: o.stake * o.odd, p: o.p, withDft: 0, status: 'pendiente', kind: o.kind || 'regular' });
    const ok = persist(); render(); return ok;
  };

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
    let html = '';
    // Regulares y soñadores llevan su propia estadística (un soñador casi siempre pierde: no debe ensuciar el récord).
    const line = (lab, x) => `<div class="svsum"><b>${lab}</b><span>${x.hits}/${x.n} ganados</span><span class="num ${x.balance >= 0 ? 'good' : 'bad'}">${(x.balance >= 0 ? '+' : '') + money(x.balance)}</span><span class="m">${x.pend} pend. · ${money(x.pendStake)}</span></div>`;
    if (list.length) {
      const r = summary('regular'), d = summary('sonador'), sf = summary('safe');
      if (sf.n + sf.pend) html += line('Safe', sf);
      html += line('Regulares', r);
      if (d.n + d.pend) html += line('Soñadores', d);
    }
    html += list.map(t => {
      const cls = { ganado: 'ok', perdido: 'bad', pendiente: 'no' }[t.status] || 'no';
      const open = openId === t.id;
      const legs = open ? `<div class="svlegs">${[...t.legs].sort((a, b) => (a.t ? new Date(a.t).getTime() : Infinity) - (b.t ? new Date(b.t).getTime() : Infinity)).map(l => `<div class="svleg"><span>${esc(l.label)}<br><span class="m">${l.t ? `<span class="hr num">${new Date(l.t).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}</span> ` : ''}${esc(l.match)}${l.p ? ` · modelo ${Math.round(l.p * 100)}%` : ''}</span></span><span class="num">${l.dft ? 'Draftea ' + (+l.dft).toFixed(2) : 'prov. ' + (l.prov ? (+l.prov).toFixed(2) : '-')}</span><button class="lh ${l.hit === true ? 'ok' : l.hit === false ? 'bad' : ''}" data-lh="${esc(t.id)}|${esc(l.key)}" title="Marcar si esta selección pegó" aria-label="Resultado de ${esc(l.label)}">${l.hit === true ? '✓' : l.hit === false ? '✗' : '?'}</button></div>`).join('')}</div>` : '';
      return `<div class="sv${open ? ' open' : ''}">
        <button class="svh" data-toggle="${t.id}" aria-expanded="${open}">
          <span><b>${esc(t.name)}</b><br><span class="m num">${(+t.odd || 0).toFixed(2)}x · ${money(+t.stake)} → ${money(+t.payout)}</span></span>
          <span>${t.kind === 'sonador' ? '<span class="st lean">soñador</span> ' : t.kind === 'safe' ? '<span class="st ok">safe</span> ' : ''}<span class="st ${cls}">${esc(t.status)}${t.auto ? ' (auto)' : ''}</span></span>
        </button>
        ${liveHtml(t)}${open ? `<p class="m svmeta">${fmt(t.createdAt)} · ${t.legs.length} selecciones${t.p ? ` · prob ${Math.round(t.p * 100)}%` : ''}</p>` : ''}${legs}
        ${open ? `<div class="svact">
          <button class="btn ghost sm" data-open="${t.id}">Abrir en calculadora</button>
          <button class="btn ghost sm" data-st="${t.id}:ganado">Ganado</button>
          <button class="btn ghost sm" data-st="${t.id}:perdido">Perdido</button>
          ${t.status !== 'pendiente' ? `<button class="btn ghost sm" data-st="${t.id}:pendiente">Pendiente</button>` : ''}
          <button class="btn ghost sm" data-kind="${t.id}:${t.kind === 'safe' ? 'regular' : 'safe'}">${t.kind === 'safe' ? 'Quitar safe' : 'Marcar safe'}</button>
          <button class="btn ghost sm ${armed === t.id ? 'danger' : ''}" data-del="${t.id}">${armed === t.id ? '¿Seguro? Toca otra vez' : 'Borrar'}</button>
        </div>` : ''}
      </div>`;
    }).join('') || '<p class="note">Aún no guardas tickets. Arma uno en la calculadora y dale "Guardar ticket".</p>';
    html += calibHtml();
    $('savedlist').innerHTML = html;
    $('savedlist').querySelectorAll('[data-lh]').forEach(b => b.addEventListener('click', () => {
      const [id, key] = b.dataset.lh.split('|'); const t = list.find(x => x.id === id); if (!t) return;
      const l = t.legs.find(x => x.key === key); if (!l) return;
      l.hit = l.hit === undefined || l.hit === null ? true : l.hit === true ? false : null;
      t.updatedAt = Date.now(); persist(); render();
    }));
    $('savedlist').querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => { openId = openId === b.dataset.toggle ? null : b.dataset.toggle; render(); }));
    $('savedlist').querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openInCalc(b.dataset.open)));
    $('savedlist').querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => { const [id, k] = b.dataset.kind.split(':'); const t = list.find(x => x.id === id); if (t) { t.kind = k; t.updatedAt = Date.now(); persist(); render(); } }));
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

  // ---- Calibración: lo que dijo el modelo vs lo que pegó (solo regulares) ----
  function calibHtml() {
    const MO = window.RadarMoney; if (!MO) return '';
    const c = MO.calibration(list, ['regular', 'safe']), rd = MO.readingStats();
    if (!c.total && !rd.n) return '';
    const pc = x => Math.round(x * 100) + '%';
    const cls = r => r.n < 5 ? 'eq' : r.hit >= r.said - 0.05 ? 'up' : 'down';
    const rows = c.rows.map(r => `<span>${esc(r.type)} <span class="m">${r.bucket}</span></span><b class="num">${pc(r.said)}</b><b class="num ${cls(r)}">${pc(r.hit)}</b><span class="num m">${r.n}</span>`).join('');
    const tot = c.total ? `<span><b>Total</b></span><b class="num">${pc(c.total.said)}</b><b class="num ${cls(c.total)}">${pc(c.total.hit)}</b><span class="num m">${c.total.n}</span>` : '';
    const rdRow = rd.n ? `<span>Lectura del partido</span><span></span><b class="num">${pc(rd.hits / rd.n)}</b><span class="num m">${rd.n}</span>` : '';
    const small = !c.total || c.total.n < 20 ? `<p class="note">Muestra chica (${c.total ? c.total.n : 0} selecciones): con menos de 20 todavía no dice mucho.</p>` : '';
    return `<details class="fold"><summary>Calibración <span class="m">${c.total ? `dijo ${pc(c.total.said)} · pegó ${pc(c.total.hit)} · ${c.total.n} selecciones` : 'sin datos'}</span></summary>
      <div class="cal"><span class="hd">Tipo</span><span class="hd">Dijo</span><span class="hd">Pegó</span><span class="hd">Casos</span>${tot}${rows}${rdRow}</div>
      ${small}<p class="note">Solo regulares. Toca ? en cada selección de un ticket perdido para marcar cuál pegó; los ganados cuentan todas ✓.${c.unknown ? ` Faltan ${c.unknown} por marcar.` : ''}</p></details>`;
  }

  // ---- Marcador en vivo de los tickets pendientes ----
  const hm = iso => new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  const CHIP = {
    'lock-ok': ['ok', '✓ asegurada'], won: ['ok', '✓'], ok: ['lean', 'va ✓'], risk: ['vol', 'en riesgo'],
    'lock-bad': ['bad', '✗ ya no se da'], lost: ['bad', '✗'], 'in-na': ['no', 'en juego'], 'post-na': ['no', 'revisa a mano'], nodata: ['no', 'sin datos'],
  };
  function liveHtml(t) {
    const S = LIVE.get(t.id);
    if (!S || t.status !== 'pendiente' || !S.some(s => s.st !== 'pre' && s.st !== 'nodata')) return '';
    const n = k => S.filter(s => k.includes(s.st)).length;
    const head = `<div class="lvh"><span class="live" aria-hidden="true"></span> En vivo: <b>${n(['won', 'lock-ok', 'ok'])}</b> van bien · <b>${n(['risk'])}</b> en riesgo · <b>${n(['lost', 'lock-bad'])}</b> fallaron · ${n(['pre'])} por empezar</div>`;
    const rows = t.legs.map((l, i) => {
      const s = S[i] || { st: 'nodata' };
      const [cls, txt] = s.st === 'pre' ? ['no', s.date ? 'empieza ' + hm(s.date) : 'por empezar'] : (CHIP[s.st] || ['no', s.st]);
      return `<div class="lvr"><span><b>${esc(l.label)}</b> <span class="m">${esc(l.match)}</span></span><span class="num">${esc(s.score || '')}${s.detail && s.st !== 'pre' ? ` <span class="m">${esc(s.detail)}</span>` : ''}</span><span class="st ${cls}">${esc(txt)}</span></div>`;
    }).join('');
    return `<div class="lv">${head}${rows}</div>`;
  }
  let liveBusy = false;
  async function refreshLive() {
    if (liveBusy || !window.RadarLive || !window.RadarData) return;
    const pend = list.filter(t => t.status === 'pendiente');
    if (!pend.length) return;
    liveBusy = true;
    try {
      const evs = await window.RadarLive.fetchEvents(pend.flatMap(t => t.legs));
      let changed = false;
      for (const t of pend) {
        const S = t.legs.map(l => window.RadarLive.legState(l, evs.get(l.matchKey)));
        LIVE.set(t.id, S);
        t.legs.forEach((l, i) => { const st = S[i].st; const h = st === 'won' ? true : st === 'lost' ? false : undefined; if (h !== undefined && l.hit !== h) { l.hit = h; changed = true; } });
        const g = window.RadarLive.grade(S);
        if (g) { t.status = g; t.auto = true; t.updatedAt = Date.now(); changed = true; }
      }
      if (changed) persist();
      render();
    } finally { liveBusy = false; }
  }
  // Solo consulta mientras haya partidos cerca o en juego (cada minuto), y con la página a la vista.
  function liveDue() {
    const now = Date.now();
    return list.some(t => t.status === 'pendiente' && t.legs.some(l => l.t && now >= new Date(l.t).getTime() - 15 * 60e3 && now <= new Date(l.t).getTime() + 4 * 3600e3));
  }
  setInterval(() => { if (document.visibilityState === 'visible' && liveDue()) refreshLive(); }, 60e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshLive(); });

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
  // Partidos que ya están en tickets abiertos (para no apilar riesgo en el mismo partido).
  // partido → nombres de tickets pendientes donde ya está.
  window.RadarSaved.openByMatch = () => { const m = new Map(); for (const t of list) if (t.status === 'pendiente') for (const l of t.legs || []) if (l.matchKey) { const a = m.get(l.matchKey) || []; if (!a.includes(t.name)) a.push(t.name); m.set(l.matchKey, a); } return m; };
  window.RadarSaved.openCount = () => list.filter(t => t.status === 'pendiente').length;
  window.RadarSaved.openMatchKeys = () => new Set(list.filter(t => t.status === 'pendiente').flatMap(t => t.legs.map(l => l.matchKey)).filter(Boolean));

  function init() {
    $('syncgo').addEventListener('click', () => { const k = $('synckey').value.trim(); if (!k) return; try { localStorage.setItem(SK, k); } catch (e) {} syncUi(); sync(); });
    $('synckey').addEventListener('keydown', e => { if (e.key === 'Enter') $('syncgo').click(); });
    $('syncoff').addEventListener('click', () => { try { localStorage.removeItem(SK); } catch (e) {} syncUi(); });
    syncUi(); sync(); refreshLive();
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
