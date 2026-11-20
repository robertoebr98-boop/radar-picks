// Calculadora de ticket: monto + selecciones seleccionadas → momio total, pago, ganancia, probabilidad y valor esperado.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = x => '$' + (isFinite(x) ? x.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-');
  const pct = p => (p * 100 >= 1 ? (p * 100).toFixed(1) : (p * 100).toFixed(2)) + '%';
  const KEY = 'radar.slip';
  let S = load();

  // El ticket vive solo mientras la página está abierta: al recargar arranca vacío.
  function load() { try { localStorage.removeItem(KEY); } catch (e) { /* nada */ } return { stake: 10, legs: [] }; }
  function save() { /* sin guardado entre recargas */ }

  // leg: {key, matchKey, match, label, p, odd}
  function add(leg) {
    if (S.legs.some(l => l.key === leg.key)) { remove(leg.key); return false; }
    S.legs.push({ ...leg, prov: leg.prov ? +(+leg.prov).toFixed(2) : null, dft: null });
    save(); render(); return true;
  }
  function remove(key) { S.legs = S.legs.filter(l => l.key !== key); save(); render(); }
  function has(key) { return S.legs.some(l => l.key === key); }

  const used = l => l.dft || l.prov;

  function totals(stake, legs, oddOf) {
    const ready = legs.length && legs.every(l => oddOf(l) > 1);
    const odd = legs.reduce((a, l) => a * (oddOf(l) || 1), 1);
    const p = legs.reduce((a, l) => a * (l.p || 0), 1);
    const payout = stake * odd;
    return { ready, odd, p, payout, profit: payout - stake, ev: p * payout - stake };
  }

  function calc() {
    const stake = Math.max(0, +S.stake || 0);
    const legs = S.legs;
    const prov = totals(stake, legs, l => l.prov);
    const real = totals(stake, legs, used);
    const withDft = legs.filter(l => l.dft).length;
    const sameMatch = legs.length !== new Set(legs.map(l => l.matchKey)).size;
    const low = legs.filter(l => used(l) && used(l) < 1.30);
    const volados = legs.filter(l => l.p >= 0.45 && l.p <= 0.55);
    // Lectura del ticket por selección.
    const ps = legs.map(l => l.p || 0);
    const avgP = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0;
    const expHits = ps.reduce((a, b) => a + b, 0);
    let missOne = 0; // prob. de fallar exactamente 1
    ps.forEach((pi, i) => { missOne += (1 - pi) * ps.reduce((a, pj, j) => j === i ? a : a * pj, 1); });
    const weakest = legs.length > 1 ? legs.reduce((w, l) => (l.p || 0) < (w.p || 0) ? l : w, legs[0]) : null;
    const pNoWeak = weakest ? ps.reduce((a, b) => a * b, 1) / Math.max(weakest.p, 1e-9) : null;
    return { stake, prov, real, withDft, p: real.p, fair: real.p > 0 ? 1 / real.p : null, sameMatch, low, volados, avgP, expHits, missOne, weakest, pNoWeak };
  }

  function render() {
    const c = calc();
    const legsHtml = `<div class="slh"><span>Selección</span><span>Prov.</span><span>Draftea</span><span></span></div>` + S.legs.map(l => `
      <div class="sl">
        <span><b>${esc(l.label)}</b>${c.weakest && c.weakest.key === l.key ? ' <span class="st vol">la más débil</span>' : ''}<br><span class="m">${esc(l.match)} · modelo ${pct(l.p)}</span></span>
        <span class="pv"><b class="num">${l.prov ? l.prov.toFixed(2) : '-'}</b><br><span class="m">${esc(l.provSrc || '')}</span></span>
        <input class="odd" inputmode="decimal" data-k="${esc(l.key)}" value="${l.dft || ''}" placeholder="—" aria-label="Momio Draftea de ${esc(l.label)}">
        <button class="x" data-rm="${esc(l.key)}" aria-label="Quitar ${esc(l.label)}">×</button>
      </div>`).join('');
    const warn = [];
    if (S.legs.length > 10) warn.push(`Tienes ${S.legs.length} selecciones; tu regla es máximo 10.`);
    if (c.low.length) warn.push(`${c.low.length} selección(es) con momio menor a 1.30.`);
    if (c.volados.length) warn.push(`${c.volados.length} volado(s) (45–55%): son los que tumban tickets.`);
    if (c.sameMatch) warn.push('Hay selecciones del mismo partido: se mueven juntas, la probabilidad real puede ser distinta.');
    if (c.withDft < S.legs.length) warn.push(`${S.legs.length - c.withDft} selección(es) sin momio de Draftea: se calcula con el provisional.`);
    const P = c.prov, R = c.real;
    const evCls = R.ev >= 0 ? 'good' : 'bad';
    const sign = x => (x >= 0 ? '+' : '') + money(x);
    $('slipbody').innerHTML = S.legs.length ? `
      ${legsHtml}
      <div class="sgrid">
        <span></span><span class="hd">Provisional</span><span class="hd">Con Draftea</span>
        <span>Momio total</span><b class="num">${P.ready ? P.odd.toFixed(2) : '-'}</b><b class="num">${R.ready ? R.odd.toFixed(2) : '-'}</b>
        <span>Pago si pega</span><b class="num">${P.ready ? money(P.payout) : '-'}</b><b class="num">${R.ready ? money(R.payout) : '-'}</b>
        <span>Ganancia</span><b class="num good">${P.ready ? money(P.profit) : '-'}</b><b class="num good">${R.ready ? money(R.profit) : '-'}</b>
        <span>Valor esperado</span><b class="num ${P.ev >= 0 ? 'good' : 'bad'}">${P.ready ? sign(P.ev) : '-'}</b><b class="num ${evCls}">${R.ready ? sign(R.ev) : '-'}</b>
      </div>
      <div class="evbig ${R.ready ? evCls : ''}"><span>Valor esperado (con Draftea)</span><b class="num">${R.ready ? sign(R.ev) : '-'}</b><span class="m">${R.ready ? (R.ev >= 0 ? 'a la larga este ticket gana dinero' : 'a la larga este ticket pierde dinero') : 'faltan momios'}</span></div>
      <div class="sgrid one">
        <span>Prob. del modelo de acertar todo</span><b class="num">${pct(c.p)}</b>
        <span>Prob. promedio por selección</span><b class="num">${pct(c.avgP)}</b>
        <span>Selecciones que se esperan acertar</span><b class="num">${c.expHits.toFixed(1)} de ${S.legs.length}</b>
        <span>Prob. de fallar solo 1</span><b class="num">${pct(c.missOne)}</b>
        ${c.weakest ? `<span>Sin la más débil (${esc(c.weakest.label)})</span><b class="num">${pct(c.pNoWeak)}</b>` : ''}
        <span>Momio justo según el modelo</span><b class="num">${c.fair ? c.fair.toFixed(2) : '-'}</b>
      </div>
      <p class="note">"Con Draftea" usa tu momio donde lo escribiste y el provisional en el resto (${c.withDft} de ${S.legs.length} con Draftea). ${R.ready ? (R.ev >= 0 ? `En promedio ganarías ${money(R.ev)} por ticket a la larga.` : `En promedio pierdes ${money(-R.ev)} por ticket a la larga: la casa paga menos de lo que vale.`) : ''} Pega 1 de cada ${c.p > 0 ? Math.round(1 / c.p).toLocaleString('es-MX') : '∞'} veces.</p>
      ${warn.length ? `<div class="warnbox">${warn.map(esc).join('<br>')}</div>` : ''}
      <button class="btn ghost sm" id="slipclear">Vaciar ticket</button>`
      : '<p class="note">Toca <b>+</b> en cualquier mercado, en el ticket sugerido o en los picks con valor para armar tu ticket.</p>';
    $('slipstake').value = S.stake;
    $('slipbar').classList.toggle('hidden', !S.legs.length);
    $('slipbar').innerHTML = `<span><b>Ticket</b> · ${S.legs.length} ${S.legs.length === 1 ? "selección" : "selecciones"} · momio ${R.ready ? R.odd.toFixed(2) : '-'}</span><span>${R.ready ? `Ganas <b>${money(R.profit)}</b>` : 'faltan momios'} · prob ${pct(c.p)}</span>`;
    $('slipbody').querySelectorAll('input.odd').forEach(i => i.addEventListener('change', () => {
      const n = parseFloat(i.value.replace(',', '.'));
      const l = S.legs.find(x => x.key === i.dataset.k);
      if (l) { l.dft = isFinite(n) && n > 1 ? +n.toFixed(2) : null; save(); setTimeout(render); }
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

  function snapshot() { return JSON.parse(JSON.stringify({ stake: S.stake, legs: S.legs })); }
  function loadTicket(t) { S = { stake: +t.stake || 10, legs: JSON.parse(JSON.stringify(t.legs || [])) }; render(); }
  window.RadarSlip = { add, remove, has, refresh: render, calc: () => calc(), snapshot, load: loadTicket };
  init();
})();
