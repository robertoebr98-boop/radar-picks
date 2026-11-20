// Calculadora de ticket: monto + patas seleccionadas → momio total, pago, ganancia, probabilidad y valor esperado.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = x => '$' + (isFinite(x) ? x.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-');
  const pct = p => (p * 100 >= 1 ? (p * 100).toFixed(1) : (p * 100).toFixed(2)) + '%';
  const KEY = 'radar.slip';
  let S = load();

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { stake: 10, legs: [] }; } catch (e) { return { stake: 10, legs: [] }; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* sin almacenamiento */ } }

  // leg: {key, matchKey, match, label, p, odd}
  function add(leg) {
    if (S.legs.some(l => l.key === leg.key)) { remove(leg.key); return false; }
    S.legs.push({ ...leg, odd: leg.odd ? +(+leg.odd).toFixed(2) : null });
    save(); render(); return true;
  }
  function remove(key) { S.legs = S.legs.filter(l => l.key !== key); save(); render(); }
  function has(key) { return S.legs.some(l => l.key === key); }

  function calc() {
    const stake = Math.max(0, +S.stake || 0);
    const legs = S.legs;
    const ready = legs.length && legs.every(l => l.odd > 1);
    const odd = legs.reduce((a, l) => a * (l.odd || 1), 1);
    const p = legs.reduce((a, l) => a * (l.p || 0), 1);
    const payout = stake * odd;
    const sameMatch = legs.length !== new Set(legs.map(l => l.matchKey)).size;
    const low = legs.filter(l => l.odd && l.odd < 1.30);
    const volados = legs.filter(l => l.p >= 0.45 && l.p <= 0.55);
    return { stake, odd, p, payout, profit: payout - stake, ev: p * payout - stake, fair: p > 0 ? 1 / p : null, ready, sameMatch, low, volados };
  }

  function render() {
    const c = calc();
    const legsHtml = S.legs.map(l => `
      <div class="sl">
        <span><b>${esc(l.label)}</b><br><span class="m">${esc(l.match)} · modelo ${pct(l.p)}</span></span>
        <input class="odd" inputmode="decimal" data-k="${esc(l.key)}" value="${l.odd || ''}" placeholder="momio" aria-label="Momio de ${esc(l.label)}">
        <button class="x" data-rm="${esc(l.key)}" aria-label="Quitar ${esc(l.label)}">×</button>
      </div>`).join('');
    const warn = [];
    if (S.legs.length > 10) warn.push(`Tienes ${S.legs.length} patas; tu regla es máximo 10.`);
    if (c.low.length) warn.push(`${c.low.length} pata(s) con momio menor a 1.30.`);
    if (c.volados.length) warn.push(`${c.volados.length} volado(s) (45–55%): son los que tumban tickets.`);
    if (c.sameMatch) warn.push('Hay patas del mismo partido: se mueven juntas, la probabilidad real puede ser distinta.');
    if (S.legs.some(l => !l.odd)) warn.push('Escribe el momio de Draftea/Novibet en cada pata.');
    const evCls = c.ev >= 0 ? 'good' : 'bad';
    $('slipbody').innerHTML = S.legs.length ? `
      ${legsHtml}
      <div class="sgrid">
        <span>Momio total</span><b class="num">${c.ready ? c.odd.toFixed(2) : '-'}</b>
        <span>Pago si pega</span><b class="num">${c.ready ? money(c.payout) : '-'}</b>
        <span>Ganancia</span><b class="num good">${c.ready ? money(c.profit) : '-'}</b>
        <span>Prob. del modelo de acertar todo</span><b class="num">${pct(c.p)}</b>
        <span>Momio justo según el modelo</span><b class="num">${c.fair ? c.fair.toFixed(2) : '-'}</b>
        <span>Valor esperado</span><b class="num ${evCls}">${c.ready ? (c.ev >= 0 ? '+' : '') + money(c.ev) : '-'}</b>
      </div>
      <p class="note">${c.ready ? (c.ev >= 0 ? `Con estos momios, en promedio ganarías ${money(c.ev)} por ticket a la larga.` : `Con estos momios, en promedio pierdes ${money(-c.ev)} por ticket a la larga: la casa paga menos de lo que vale.`) : ''} Pega 1 de cada ${c.p > 0 ? Math.round(1 / c.p).toLocaleString('es-MX') : '∞'} veces.</p>
      ${warn.length ? `<div class="warnbox">${warn.map(esc).join('<br>')}</div>` : ''}
      <button class="btn ghost sm" id="slipclear">Vaciar ticket</button>`
      : '<p class="note">Toca <b>+</b> en cualquier mercado, en el ticket sugerido o en los picks con valor para armar tu ticket.</p>';
    $('slipstake').value = S.stake;
    $('slipbar').classList.toggle('hidden', !S.legs.length);
    $('slipbar').innerHTML = `<span><b>Ticket</b> · ${S.legs.length} pata${S.legs.length === 1 ? '' : 's'} · momio ${c.ready ? c.odd.toFixed(2) : '-'}</span><span>${c.ready ? `Ganas <b>${money(c.profit)}</b>` : 'faltan momios'} · prob ${pct(c.p)}</span>`;
    $('slipbody').querySelectorAll('input.odd').forEach(i => i.addEventListener('change', () => {
      const n = parseFloat(i.value.replace(',', '.'));
      const l = S.legs.find(x => x.key === i.dataset.k);
      if (l) { l.odd = isFinite(n) && n > 1 ? +n.toFixed(2) : null; save(); setTimeout(render); }
    }));
    $('slipbody').querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => remove(b.dataset.rm)));
    const clr = $('slipclear'); if (clr) clr.addEventListener('click', () => { S.legs = []; save(); render(); });
    document.querySelectorAll('[data-slip]').forEach(b => { const on = has(b.dataset.slip); b.classList.toggle('on', on); b.textContent = on ? '✓' : '+'; b.setAttribute('aria-pressed', on); });
  }

  function init() {
    $('slipstake').addEventListener('input', () => { S.stake = Math.max(0, parseFloat($('slipstake').value) || 0); save(); render(); });
    $('slipbar').addEventListener('click', () => $('slip').scrollIntoView({ behavior: 'smooth', block: 'start' }));
    // Botones "+" en cualquier parte de la página (se crean después, por eso se escucha en el documento).
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-slip]');
      if (!b) return;
      const leg = JSON.parse(b.dataset.leg);
      add(leg);
    });
    render();
  }

  window.RadarSlip = { add, remove, has, refresh: render, calc: () => calc() };
  init();
})();
