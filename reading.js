// Lectura del partido: 2–3 líneas automáticas con el posible ganador y por qué
// (probabilidades del modelo + forma reciente + entre ellos + qué se juega + cambios de forma).
// No cambia ningún número del modelo; solo lo explica en palabras.
(function (root) {
  const pct = x => Math.round(x * 100) + '%';
  const count = f => {
    const r = { W: 0, D: 0, L: 0 };
    for (const x of f || []) if (r[x] != null) r[x]++;
    r.n = r.W + r.D + r.L; r.pts = r.W * 3 + r.D;
    return r;
  };
  const formTxt = c => `${c.W}G ${c.D}E ${c.L}P`;

  // o = { h, a, p1, px, p2, lh, la, formH, formA, motH, motA, h2h, brkH, brkA }
  function text(o) {
    const { h, a, p1, px, p2 } = o;
    if (p1 == null || p2 == null) return null;
    const favH = p1 >= p2, fav = favH ? h : a, pf = Math.max(p1, p2), po = Math.min(p1, p2), gap = pf - po;
    let winner, tag, head;
    if (gap < 0.12 || px >= pf) {
      winner = 'x'; tag = 'vol';
      head = `Partido parejo: ${h} ${pct(p1)}, empate ${pct(px)}, ${a} ${pct(p2)}. Mejor no ir por ganador; si entras, que sea con doble resultado.`;
    } else if (pf >= 0.55 && gap >= 0.25) {
      winner = favH ? 'h' : 'a'; tag = 'ok';
      head = `Posible ganador: ${fav} (${pct(pf)}). Favorito claro.`;
    } else {
      winner = favH ? 'h' : 'a'; tag = 'lean';
      head = `Posible ganador: ${fav} (${pct(pf)} contra ${pct(po)}), con ventaja ligera; el empate tiene ${pct(px)}.`;
    }
    const why = [];
    const cH = count(o.formH), cA = count(o.formA);
    if (cH.n >= 3 && cA.n >= 3) {
      let s = `${h} viene de ${formTxt(cH)} y ${a} de ${formTxt(cA)}`;
      const favC = favH ? cH : cA, othC = favH ? cA : cH;
      if (winner !== 'x' && othC.pts - favC.pts >= 4) s += `; ojo, ${favH ? a : h} llega en mejor forma`;
      else if (winner !== 'x' && favC.pts - othC.pts >= 4) s += `; la forma también lo respalda`;
      else if (winner === 'x' && Math.abs(cH.pts - cA.pts) >= 4) s += `; llega mejor ${cH.pts > cA.pts ? h : a}`;
      why.push(s + '.');
    }
    const H = o.h2h;
    if (H && H.n >= 3) {
      const lead = H.w > H.l ? `${h} ganó ${H.w}` : H.l > H.w ? `${a} ganó ${H.l}` : `quedaron parejos (${H.w}-${H.d}-${H.l})`;
      why.push(`Entre ellos, en los últimos ${H.n}: ${lead}${H.w !== H.l ? ` de ${H.n}` : ''}.`);
    }
    for (const [n, b] of [[h, o.brkH], [a, o.brkA]]) if (b) why.push(`${n} ${b.diff > 0 ? 'mejoró' : 'empeoró'} claramente en sus últimos ${b.n} partidos.`);
    const ctx = [[h, o.motH], [a, o.motA]].filter(([, m]) => m && m.tag && m.tag !== 'normal').map(([n, m]) => `${n}: ${m.label}`);
    const tot = (o.lh || 0) + (o.la || 0);
    let style = '';
    if (o.lh != null && o.la != null) style = tot >= 2.9 ? `Se ve abierto: ${tot.toFixed(1)} goles esperados.` : tot <= 2.2 ? `Se ve cerrado: ${tot.toFixed(1)} goles esperados.` : `Goles esperados: ${tot.toFixed(1)}.`;
    if (ctx.length) style += ` Qué se juegan: ${ctx.join(' · ')}.`;
    const lines = [head, why.slice(0, 2).join(' '), style.trim()].filter(Boolean);
    return { winner, tag, lines };
  }

  // ¿Acertó la lectura? Parejo = acierta si no gana nadie por 2 o más (el doble resultado del favorito pasa).
  function hit(r, hs, as) {
    if (!r || hs == null || as == null) return null;
    if (r.winner === 'h') return hs > as;
    if (r.winner === 'a') return as > hs;
    return Math.abs(hs - as) <= 1;
  }

  const api = { text, hit };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadarReading = api;
})(typeof window !== 'undefined' ? window : globalThis);
