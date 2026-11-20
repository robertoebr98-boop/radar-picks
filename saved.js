// Mis tickets: guarda tickets de la calculadora en este navegador (gratis), con resultado ganado/perdido.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = x => '$' + (isFinite(x) ? x.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-');
  const KEY = 'radar.saved';
  let list = load();
  let armed = null; // id con "borrar" pendiente de confirmar
  let openId = null;

  function load() { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
    catch (e) { $('savedmsg').innerHTML = '<div class="err">Este navegador no permite guardar (modo privado). Usa "Exportar" para no perderlos.</div>'; return false; }
  }

  function fmt(ts) { try { return new Date(ts).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }

  function saveCurrent() {
    const snap = window.RadarSlip.snapshot();
    if (!snap.legs.length) { $('savedmsg').innerHTML = '<p class="note">El ticket está vacío: agrega patas con +.</p>'; return; }
    const name = ($('savename').value || '').trim() || `Ticket ${fmt(Date.now())}`;
    const c = window.RadarSlip.calc();
    list.unshift({
      id: String(Date.now()), name, createdAt: Date.now(), stake: snap.stake, legs: snap.legs,
      odd: c.real.odd, payout: c.real.payout, p: c.p, withDft: c.withDft, status: 'pendiente',
    });
    if (persist()) {
      $('savename').value = '';
      $('savedmsg').innerHTML = `<p class="note good">Guardado: ${esc(name)}. Ya puedes vaciar el ticket y armar otro.</p>`;
    }
    render();
  }

  function setStatus(id, status) { const t = list.find(x => x.id === id); if (t) { t.status = status; persist(); render(); } }
  function del(id) {
    if (armed !== id) { armed = id; render(); return; }
    list = list.filter(x => x.id !== id); armed = null; persist(); render();
  }
  function openInCalc(id) {
    const t = list.find(x => x.id === id);
    if (!t) return;
    window.RadarSlip.load({ stake: t.stake, legs: t.legs });
    $('slip').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function summary() {
    const done = list.filter(t => t.status !== 'pendiente');
    const staked = done.reduce((a, t) => a + (+t.stake || 0), 0);
    const won = done.filter(t => t.status === 'ganado').reduce((a, t) => a + (+t.payout || 0), 0);
    const hits = done.filter(t => t.status === 'ganado').length;
    const pend = list.filter(t => t.status === 'pendiente');
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
    }
    html += list.map(t => {
      const cls = { ganado: 'ok', perdido: 'bad', pendiente: 'no' }[t.status] || 'no';
      const open = openId === t.id;
      const legs = open ? `<div class="svlegs">${t.legs.map(l => `<div class="svleg"><span>${esc(l.label)}<br><span class="m">${esc(l.match)} · modelo ${Math.round((l.p || 0) * 100)}%</span></span><span class="num">${l.dft ? 'Draftea ' + (+l.dft).toFixed(2) : 'prov. ' + (l.prov ? (+l.prov).toFixed(2) : '-')}</span></div>`).join('')}</div>` : '';
      return `<div class="sv">
        <button class="svh" data-toggle="${t.id}" aria-expanded="${open}">
          <span><b>${esc(t.name)}</b><br><span class="m">${fmt(t.createdAt)} · ${t.legs.length} patas · momio ${(+t.odd || 0).toFixed(2)} · ${money(+t.stake)} → ${money(+t.payout)}</span></span>
          <span class="st ${cls}">${esc(t.status)}</span>
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

  function init() {
    $('savebtn').addEventListener('click', saveCurrent);
    $('savename').addEventListener('keydown', e => { if (e.key === 'Enter') saveCurrent(); });
    $('exportbtn').addEventListener('click', exportFile);
    $('importbtn').addEventListener('click', () => $('importfile').click());
    $('importfile').addEventListener('change', e => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; });
    render();
  }
  init();
})();
