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
  let optMode = 'keep';
  let optOpen = false; // incluir partidos de tickets abiertos
  const openMatches = () => optOpen ? new Set() : (window.RadarSaved && window.RadarSaved.openMatchKeys ? window.RadarSaved.openMatchKeys() : new Set());
  const runOpt = () => window.RadarOptimize.optimize(S.legs, poolView(), { mode: optMode, exclude: openMatches() });
  function register(leg) {
    if (!leg || !leg.matchKey || !(leg.p > 0)) return;
    let g = POOL.get(leg.matchKey);
    if (!g) POOL.set(leg.matchKey, g = { match: leg.match, items: new Map() });
    g.items.set(leg.key, { key: leg.key, lam: leg.lam || null, t: leg.t || null, label: leg.label, p: leg.p, prov: leg.prov ? +(+leg.prov).toFixed(2) : null, provSrc: leg.provSrc });
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

  // ---- Selecciones correlacionadas (mismo partido) ----
  // Con los goles esperados del partido se arma la matriz de marcadores y se mide la prob. de que pasen TODAS
  // a la vez. Ej.: si hay más de 2.5 goles, ambos anotan pasa ~80% de las veces, no 55%.
  const MM = () => window.RadarModel;
  const DEFS = () => { const d = {}; for (const x of MM().marketDefs('L', 'V')) d[x.id] = x.fn; return d; };
  const idOf = l => l.key.slice(l.matchKey.length + 1);
  function groupInfo(legs) {
    const M = MM(); if (!M) return null;
    const lam = (legs.find(l => l.lam) || {}).lam;
    const defs = DEFS();
    const known = legs.filter(l => defs[idOf(l)]), other = legs.filter(l => !defs[idOf(l)]);
    if (!lam || known.length < 1) return null;
    const mat = M.scoreMatrix(lam[0], lam[1]);
    const P = fns => M.sumWhere(mat, (h, a) => fns.every(f => f(h, a)));
    // Orden en que las agregaste: cada una agrega un factor condicional sobre las anteriores.
    const ord = known;
    const steps = [];
    let p = ord[0].p, fns = [defs[idOf(ord[0])]];
    steps.push({ leg: ord[0], factor: ord[0].p });
    for (const l of ord.slice(1)) {
      const prev = fns, before = P(fns); fns = [...fns, defs[idOf(l)]];
      const f = before > 0 ? P(fns) / before : 0;
      // Marcadores que cumplen lo anterior pero tumban esta selección (los que la hacen riesgosa).
      const fn = defs[idOf(l)], kill = [];
      for (let h = 0; h < mat.length; h++) for (let a = 0; a < mat[h].length; a++) if (prev.every(g => g(h, a)) && !fn(h, a)) kill.push({ h, a, p: before > 0 ? mat[h][a] / before : 0 });
      kill.sort((x, y) => y.p - x.p);
      p *= f; steps.push({ leg: l, factor: f, kill: kill.slice(0, 3) });
    }
    for (const l of other) p *= l.p || 0; // córners, tarjetas…: sin modelo conjunto, se multiplican
    return { p, steps, other, fns, mat, P, lam };
  }
  function jointP(legs) {
    const by = new Map();
    for (const l of legs) { if (!by.has(l.matchKey)) by.set(l.matchKey, []); by.get(l.matchKey).push(l); }
    let p = 1;
    for (const g of by.values()) {
      if (g.length > 1) { const gi = groupInfo(g); p *= gi ? gi.p : g.reduce((a, l) => a * (l.p || 0), 1); }
      else p *= g[0].p || 0;
    }
    return p;
  }

  function totals(stake, legs, oddOf) {
    const ready = legs.length && legs.every(l => oddOf(l) > 1);
    const odd = legs.reduce((a, l) => a * (oddOf(l) || 1), 1);
    const p = jointP(legs);
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
    if (c.volados.length) warn.push(`${c.volados.length} volado(s) (45–55%).`);

    // Colchón de sorpresas: los favoritos también pierden.
    const favs = S.legs.filter(l => l.p >= 0.6 && l.p < 0.8);
    if (favs.length >= 2) warn.push(`Sorpresas: lo normal es que falle ${(favs.reduce((a, l) => a + 1 - l.p, 0)).toFixed(1)} de ${favs.length} favoritas (60–80%).`);
    for (const l of S.legs) {
      const id = l.key.split(':').pop();
      if ((id === '1' || id === '2') && l.p < 0.75) {
        const g = POOL.get(l.matchKey), dc = g && g.items.get(`${l.matchKey}:${id === '1' ? '1X' : 'X2'}`);
        if (dc && dc.p - l.p >= 0.1) warn.push(`${l.label} → "${dc.label}": ${pct(l.p)} a ${pct(dc.p)}${dc.prov ? ` (~${dc.prov.toFixed(2)})` : ''}.`);
      }
    }
    if (c.withDft < S.legs.length) warn.push(`${S.legs.length - c.withDft} sin momio de Draftea (usa el provisional).`);
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
      <details class="fold" ${window.__slipMore ? 'open' : ''} ontoggle="window.__slipMore=this.open"><summary>Más números <span class="m">prob ${pct(c.p)} · pega 1 de cada ${c.p > 0 ? Math.round(1 / c.p).toLocaleString('es-MX') : '∞'}</span></summary>
      <div class="sgrid one">
        <span>Prob. del modelo de acertar todo</span><b class="num">${pct(c.p)}</b>
        <span>Prob. promedio por selección</span><b class="num">${pct(c.avgP)}</b>
        <span>Selecciones que se esperan acertar</span><b class="num">${c.expHits.toFixed(1)} de ${S.legs.length}</b>
        <span>Prob. de fallar solo 1</span><b class="num">${pct(c.missOne)}</b>
        ${c.weakest ? `<span>Sin la más débil (${esc(c.weakest.label)})</span><b class="num">${pct(c.pNoWeak)}</b>` : ''}
        <span>Momio justo según el modelo</span><b class="num">${c.fair ? c.fair.toFixed(2) : '-'}</b>
      </div>
      <p class="note">${c.withDft} de ${S.legs.length} con momio de Draftea; el resto usa el provisional.</p></details>
      ${sgpHtml()}
      ${warn.length ? `<details class="wmini"><summary>⚠ ${warn.length} ${warn.length === 1 ? 'aviso' : 'avisos'} <span class="m">${esc(warn[0])}</span></summary><ul>${warn.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
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
    const ob = $('optgo'); if (ob) ob.addEventListener('click', () => { OPT = runOpt(); setTimeout(render); });
    const oo = $('optopen'); if (oo) oo.addEventListener('change', () => { optOpen = oo.checked; if (OPT) OPT = runOpt(); setTimeout(render); });
    const oa = $('optmode'); if (oa) oa.addEventListener('change', () => { optMode = oa.value; if (OPT) OPT = runOpt(); setTimeout(render); });
    const ok = $('optok'); if (ok) ok.addEventListener('click', () => { S.legs = OPT.after.map(l => ({ ...l })); OPT = null; save(); setTimeout(render); });
    const no = $('optno'); if (no) no.addEventListener('click', () => { OPT = null; setTimeout(render); });
    document.querySelectorAll('[data-slip]').forEach(b => { const on = has(b.dataset.slip); b.classList.toggle('on', on); b.textContent = on ? '✓' : '+'; b.setAttribute('aria-pressed', on); });
  }

  // Mismo partido (SGP): cuánto riesgo agrega cada selección y qué se puede sumar casi gratis.
  function sgpHtml() {
    const by = new Map();
    for (const l of S.legs) { if (!by.has(l.matchKey)) by.set(l.matchKey, []); by.get(l.matchKey).push(l); }
    let html = '';
    for (const [mk, g] of by) {
      const gi = groupInfo(g);
      if (!gi) continue;
      const indep = g.reduce((a, l) => a * (l.p || 0), 1);
      const rows = gi.steps.slice(1).map(s => {
        const need = s.factor > 0 ? 1 / s.factor : Infinity;
        const tag = s.factor >= 0.97 ? '<span class="st ok">no agrega riesgo</span>' : s.factor >= 0.85 ? '<span class="st lean">poco riesgo</span>' : '<span class="st vol">riesgo real</span>';
        const kill = s.kill && s.kill.length && s.factor < 0.97 ? ` La tumban: ${s.kill.map(k => `${k.h}-${k.a} (${pct(k.p)})`).join(', ')}.` : '';
        return s.factor >= 0.97
          ? `<li><b>${esc(s.leg.label)}</b>: ${tag} (se cumple ${pct(s.factor)} de las veces si pasa lo anterior). Lo que Draftea le sume al momio es ganancia.</li>`
          : `<li><b>${esc(s.leg.label)}</b>: si pasa lo anterior, se cumple ${pct(s.factor)} de las veces ${tag}.${kill} Conviene solo si Draftea sube el momio del SGP al menos <b>×${need.toFixed(2)}</b> al agregarla.</li>`;
      }).join('');
      // Agregados casi gratis: mercados del mismo partido que pasan ≥ 95% de las veces dado lo que ya llevas.
      const pool = POOL.get(mk), defs = DEFS(), have = new Set(g.map(l => l.key));
      const base = gi.P(gi.fns);
      const free = pool ? [...pool.items.values()].filter(x => !have.has(x.key) && defs[x.key.slice(mk.length + 1)])
        .map(x => ({ x, f: base > 0 ? gi.P([...gi.fns, defs[x.key.slice(mk.length + 1)]]) / base : 0 }))
        .filter(o => o.f >= 0.95 && o.x.p < 0.97).sort((a, b) => a.x.p - b.x.p).slice(0, 3) : [];
      const freeHtml = free.length ? `<p class="m" title="Pasan 95% o más de las veces si se cumple lo que ya llevas">Casi gratis ⓘ: ${free.map(o => `${esc(o.x.label)} (×${o.f.toFixed(2)}) ${window.RadarSlipBtn ? window.RadarSlipBtn({ ...o.x, matchKey: mk, match: g[0].match }) : ''}`).join(' · ')}</p>` : '';
      if (g.length === 1) { if (freeHtml) html += `<div class="sgp"><b>${esc(g[0].match)}</b>${freeHtml}</div>`; continue; }
      html += `<div class="sgp"><b>Mismo partido: ${esc(g[0].match)}</b>
        <p class="m">Goles esperados: ${esc(String(g[0].match).split(' vs ')[0] || 'local')} ${gi.lam[0].toFixed(2)} · ${esc(String(g[0].match).split(' vs ')[1] || 'visita')} ${gi.lam[1].toFixed(2)}. Juntas: <b>${pct(gi.p)}</b> <span title="Si fueran independientes">(sueltas ${pct(indep)})</span></p>
        ${rows ? `<ul>${rows}</ul>` : ''}${gi.other.length ? `<p class="m">${gi.other.length} selección(es) de córners/tarjetas se calculan aparte.</p>` : ''}${freeHtml}</div>`;
    }
    return html;
  }

  // Botón Optimizar ticket y su propuesta (antes vs después).
  function optHtml() {
    const O = window.RadarOptimize;
    if (!O) return '';
    const real = S.legs.filter(O.isReal).length;
    const head = `<div class="opt">
      <div class="opth"><button class="btn sm" id="optgo">Optimizar ticket</button>
      <select class="in sm" id="optmode" aria-label="Modo del optimizador">${[['keep', 'Mismo número de selecciones'], ['grow', 'Puede alargar el ticket'], ['cut', 'Puede acortar (solo quitar)']].map(([v, l]) => `<option value="${v}" ${optMode === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label class="m"><input type="checkbox" id="optopen" ${optOpen ? 'checked' : ''}> Incluir partidos de mis tickets abiertos</label></div>
      <p class="note" title="Reglas: momio ≥ 1.30, prob ≥ 60%, sin volados. Para sumar de otros partidos necesita momio real con valor ≥ 1.05.">Cambia por mercados con más valor respetando tus reglas. ⓘ</p>
      ${real < S.legs.length ? `<p class="note" title="Con momio estimado el valor esperado sale del mismo modelo, no es real. Escribe el momio de Draftea para comparar de verdad.">${S.legs.length - real} de ${S.legs.length} con momio estimado: solo cambia a opciones más seguras. ⓘ</p>` : ''}`;
    if (!OPT) return head + '</div>';
    if (!OPT.changes.length && OPT.info && !OPT.info.cands && OPT.info.excluded && optMode !== 'cut') return head + `<p class="note">No encontré qué sumar: descarté ${OPT.info.excluded} partido(s) porque ya están en tus tickets abiertos. Marca "Incluir partidos de mis tickets abiertos" si quieres usarlos.</p></div>`;
    if (!OPT.changes.length) return head + '<p class="note good">No encontré cambios que suban el valor con lo que hay cargado. Abre "Mercados ▾" de tus partidos o analiza el partido para darle más opciones.</p></div>';
    const I = OPT.info || {};
    const why = optMode === 'cut' ? '' : !I.cands
      ? `<p class="note">No encontré selecciones de otros partidos con momio real y valor ≥ 1.05${I.excluded ? ` (descarté ${I.excluded} partido(s) que ya están en tus tickets abiertos; marca "Incluir partidos de mis tickets abiertos" para usarlos)` : ''}. Abre "Mercados ▾" de más partidos en el Pronóstico del día para darle opciones.</p>`
      : I.excluded ? `<p class="note">Descarté ${I.excluded} partido(s) que ya están en tus tickets abiertos.</p>` : '';
    const stake = Math.max(0, +S.stake || 0);
    const a = O.summary(S.legs, stake), b = O.summary(OPT.after, stake);
    const sign = x => (x >= 0 ? '+' : '') + money(x);
    // Menú tipo RPG: cada cambio como "sale / entra" y las estadísticas actual → propuesta con flechas.
    const lg = l => `${esc(l.label)} <span class="m">${esc(l.match)} · ${pct(l.p)}${O.oddOf(l) ? ' · ' + O.oddOf(l).toFixed(2) : ''}</span>`;
    const ch = OPT.changes.map(c => {
      const out = c.from && c.type !== 'note' ? `<div class="ox out"><span class="oxk">sale</span><span>${lg(c.from)}</span></div>` : '';
      const inn = c.to ? `<div class="ox in"><span class="oxk">entra</span><span>${lg(c.to)}</span></div>` : '';
      const keep = c.type === 'note' ? `<div class="ox keep"><span class="oxk">se queda</span><span>${lg(c.from)}</span></div>` : '';
      return `<div class="oc">${out}${inn}${keep}<div class="m">${esc(c.why)}</div></div>`;
    }).join('');
    const row = (name, va, vb, fa, better) => {
      const d = vb - va, eq = Math.abs(d) < 1e-9;
      const good = better === 0 ? null : (d > 0) === (better > 0);
      const cls = eq || good === null ? 'eq' : good ? 'up' : 'down';
      const arrow = eq ? '=' : d > 0 ? '▲' : '▼';
      return `<span>${name}</span><b class="num">${fa(va)}</b><b class="num ${cls}">${fa(vb)} <i>${arrow}</i></b>`;
    };
    const verdict = b.ev > a.ev + 0.005 && b.p >= a.p - 0.02 ? ['up', 'Mejor: sube el valor sin perder probabilidad']
      : b.ev > a.ev + 0.005 ? ['lean', 'Más valor, pero baja la probabilidad de acertar']
      : b.ev < a.ev - 0.005 ? ['down', 'Empeora el valor esperado: mejor mantener']
      : ['eq', 'Casi igual'];
    return head + `<div class="rpg">
      <div class="oclist">${ch}</div>${why}
      <div class="rpgs"><span></span><span class="hd">Actual</span><span class="hd">Propuesta</span>
        ${row('Selecciones', a.n, b.n, x => String(x), 0)}
        ${row('Prob. de acertar', a.p, b.p, pct, 1)}
        ${row('Momio total', a.odd, b.odd, x => x.toFixed(2), 1)}
        ${row('Valor esperado', a.ev, b.ev, sign, 1)}
        ${row('Con momio real', a.real, b.real, x => `${x}`, 1)}
      </div>
      <div class="rpgv ${verdict[0]}">${verdict[1]}</div>
      <div class="rpgb"><button class="btn" id="optok">Aplicar cambio</button><button class="btn ghost" id="optno">Mantener configuración actual</button></div></div></div>`;
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
  window.RadarSlip = { setStake: v => { S.stake = +v || S.stake; render(); }, jointP, register, add, remove, has, refresh: render, calc: () => calc(), snapshot, load: loadTicket };
  init();
})();
