// Calculadora de ticket: monto + selecciones seleccionadas → momio total, pago, ganancia, probabilidad y valor esperado.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = x => '$' + (isFinite(x) ? x.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-');
  const pct = p => (p * 100 >= 1 ? (p * 100).toFixed(1) : (p * 100).toFixed(2)) + '%';
  const KEY = 'radar.slip';
  let S = load();
  // Mercados vistos en la página (análisis, pronóstico del día, panel de mercados): de aquí salen las alternativas del optimizador.
  const POOL = new Map(); // matchKey -> {match, items: Map key -> leg}
  let OPT = null;         // propuesta pendiente {after, changes}
  let allowAdd = false;
  function register(leg) {
    if (!leg || !leg.matchKey || !(leg.p > 0)) return;
    let g = POOL.get(leg.matchKey);
    if (!g) POOL.set(leg.matchKey, g = { match: leg.match, items: new Map() });
    g.items.set(leg.key, { key: leg.key, t: leg.t || null, label: leg.label, p: leg.p, prov: leg.prov ? +(+leg.prov).toFixed(2) : null, provSrc: leg.provSrc });
  }
  function poolView() { const m = new Map(); for (const [k, g] of POOL) m.set(k, { match: g.match, items: [...g.items.values()] }); return m; }

  // El ticket vive solo mientras la página está abierta: al recargar arranca vacío.
  function load() { try { localStorage.removeItem(KEY); } catch (e) { /* nada */ } return { stake: 10, legs: [] }; }
  function save() { /* sin guardado entre recargas */ }

  // leg: {key, matchKey, match, label, p, odd}
  function add(leg) {
    OPT = null; register(leg);
    if (S.legs.some(l => l.key === leg.key)) { remove(leg.key); return false; }
    S.legs.push({ ...leg, prov: leg.prov ? +(+leg.prov).toFixed(2) : null, dft: null });
    save(); render(); return true;
  }
  function remove(key) { OPT = null; S.legs = S.legs.filter(l => l.key !== key); save(); render(); }
  function has(key) { return S.legs.some(l => l.key === key); }

  const used = l => l.dft || l.prov;
  // Hora de México del partido, para ordenar como en Draftea.
  const hourMX = iso => { try { return iso ? new Date(iso).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false }) : ''; } catch (e) { return ''; } };
  const byTime = (a, b) => (a.t ? new Date(a.t).getTime() : Infinity) - (b.t ? new Date(b.t).getTime() : Infinity);

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
    S.legs.sort(byTime);
    const c = calc();
    const legsHtml = `<div class="slh"><span>Selección</span><span>Prov.</span><span>Draftea</span><span></span></div>` + S.legs.map(l => `
      <div class="sl">
        <span><b>${esc(l.label)}</b>${c.weakest && c.weakest.key === l.key ? ' <span class="st vol">la más débil</span>' : ''}<br><span class="m">${l.t ? `<span class="hr num">${hourMX(l.t)}</span> ` : ''}${esc(l.match)} · modelo ${pct(l.p)}</span></span>
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
      ${optHtml()}
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
    const clr = $('slipclear'); if (clr) clr.addEventListener('click', () => { S.legs = []; OPT = null; save(); render(); });
    const ob = $('optgo'); if (ob) ob.addEventListener('click', () => { OPT = window.RadarOptimize.optimize(S.legs, poolView(), { allowAdd }); setTimeout(render); });
    const oa = $('optadd'); if (oa) oa.addEventListener('change', () => { allowAdd = oa.checked; if (OPT) OPT = window.RadarOptimize.optimize(S.legs, poolView(), { allowAdd }); setTimeout(render); });
    const ok = $('optok'); if (ok) ok.addEventListener('click', () => { S.legs = OPT.after.map(l => ({ ...l })); OPT = null; save(); setTimeout(render); });
    const no = $('optno'); if (no) no.addEventListener('click', () => { OPT = null; setTimeout(render); });
    document.querySelectorAll('[data-slip]').forEach(b => { const on = has(b.dataset.slip); b.classList.toggle('on', on); b.textContent = on ? '✓' : '+'; b.setAttribute('aria-pressed', on); });
  }

  // Botón Optimizar ticket y su propuesta (antes vs después).
  function optHtml() {
    const O = window.RadarOptimize;
    if (!O) return '';
    const real = S.legs.filter(O.isReal).length;
    const head = `<div class="opt">
      <div class="opth"><button class="btn sm" id="optgo">Optimizar ticket</button>
      <label class="m"><input type="checkbox" id="optadd" ${allowAdd ? 'checked' : ''}> Permitir agregar selecciones de otros partidos</label></div>
      <p class="note">Busca en los mismos partidos un mercado con más valor (prob × momio), quita las que restan y respeta tus reglas: máx 10, momio ≥ 1.30, prob ≥ 60%, sin volados.</p>
      ${real < S.legs.length ? `<div class="warnbox"><b>Ojo:</b> ${S.legs.length - real} de ${S.legs.length} selecciones usan momio <b>estimado</b>. Con momio estimado el valor esperado positivo <b>no es real</b> (sale del mismo modelo). Escribe el momio de Draftea o usa mercados con momio ESPN/consenso para que el optimizador compare valor de verdad; si no, solo te cambia a opciones más seguras.</div>` : ''}`;
    if (!OPT) return head + '</div>';
    if (!OPT.changes.length) return head + '<p class="note good">No encontré cambios que suban el valor con lo que hay cargado. Abre "Mercados ▾" de tus partidos o analiza el partido para darle más opciones.</p></div>';
    const stake = Math.max(0, +S.stake || 0);
    const a = O.summary(S.legs, stake), b = O.summary(OPT.after, stake);
    const sign = x => (x >= 0 ? '+' : '') + money(x);
    const ch = OPT.changes.map(c => c.type === 'swap'
      ? `<li><b>Cambiar</b> ${esc(c.from.label)} → <b>${esc(c.to.label)}</b> <span class="m">(${esc(c.from.match)} · ${esc(c.why)})</span></li>`
      : c.type === 'remove' ? `<li><b>Quitar</b> ${esc(c.from.label)} <span class="m">(${esc(c.from.match)} · ${esc(c.why)})</span></li>`
      : `<li><b>Agregar</b> ${esc(c.to.label)} <span class="m">(${esc(c.to.match)} · ${esc(c.why)})</span></li>`).join('');
    return head + `<ul class="optl">${ch}</ul>
      <div class="sgrid">
        <span></span><span class="hd">Antes</span><span class="hd">Después</span>
        <span>Selecciones</span><b class="num">${a.n}</b><b class="num">${b.n}</b>
        <span>Prob. de acertar todo</span><b class="num">${pct(a.p)}</b><b class="num">${pct(b.p)}</b>
        <span>Momio total</span><b class="num">${a.odd.toFixed(2)}</b><b class="num">${b.odd.toFixed(2)}</b>
        <span>Valor esperado</span><b class="num ${a.ev >= 0 ? 'good' : 'bad'}">${sign(a.ev)}</b><b class="num ${b.ev >= 0 ? 'good' : 'bad'}">${sign(b.ev)}</b>
        <span>Con momio real</span><b class="num">${a.real} de ${a.n}</b><b class="num">${b.real} de ${b.n}</b>
      </div>
      <div class="opth"><button class="btn sm" id="optok">Aplicar cambios</button><button class="btn ghost sm" id="optno">Descartar</button></div></div>`;
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
  function loadTicket(t) { OPT = null; S = { stake: +t.stake || 10, legs: JSON.parse(JSON.stringify(t.legs || [])) }; render(); }
  window.RadarSlip = { register, add, remove, has, refresh: render, calc: () => calc(), snapshot, load: loadTicket };
  init();
})();
