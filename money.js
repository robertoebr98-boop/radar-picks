// Medir y controlar el dinero: tabla de calibración de tus selecciones y monto sugerido (¼ Kelly con topes).
(function (root) {
  'use strict';
  const BUCKETS = [[0.8, '80%+'], [0.7, '70–80%'], [0.6, '60–70%'], [0, '< 60%']];
  const bucketOf = p => BUCKETS.find(([lo]) => p >= lo)[1];

  // Tipo de mercado a partir del id de la selección.
  function typeOf(leg) {
    const mk = String(leg.matchKey || ''), id = String(leg.key || '').slice(mk.length + 1);
    const lg = mk.split(':')[0];
    if (lg === 'nba' || lg === 'nfl') return lg.toUpperCase();
    const M = root.RadarModel, d = M && M.marketDefs('L', 'V').find(x => x.id === id);
    if (d) return d.group === 'Goles por equipo' ? 'Goles' : d.group;
    if (/^C[HA]?[<>]/.test(id)) return 'Córners';
    if (/^K[<>]/.test(id)) return 'Tarjetas';
    if (/^[ST][HA]?[<>]/.test(id)) return 'Remates';
    if (['1', 'X', '2'].includes(id)) return 'Resultado';
    if (['1X', 'X2', '12'].includes(id)) return 'Doble oportunidad';
    if (/^(O|U)\d|BTTS|NBTTS|^[HA](O|U)?\d|anota/i.test(id)) return 'Goles';
    if (/córner/i.test(leg.label || '')) return 'Córners';
    if (/tarjeta/i.test(leg.label || '')) return 'Tarjetas';
    if (/gol|anota/i.test(leg.label || '')) return 'Goles';
    if (/gana|empate/i.test(leg.label || '')) return 'Resultado';
    return 'Otros';
  }

  // Resultado de cada selección: el marcado en la selección (en vivo o a mano) o, si el ticket se ganó, todas ✓.
  function legHit(t, l) {
    if (l.hit === true || l.hit === false) return l.hit;
    if (t.status === 'ganado') return true;
    return null;
  }

  // tickets → { rows: [{type, bucket, n, said, hit}], total, pending } (solo regulares; los soñadores aparte).
  // Safe: el modelo le da 70%+ al ticket completo (momio justo ≤ 1.43). Tope de monto 10% en vez de 5%.
  const SAFE_P = 0.70, SAFE_CAP = 0.10;
  const isSafe = p => p >= SAFE_P;
  function calibration(tickets, kind = 'regular') {
    const kinds = Array.isArray(kind) ? kind : [kind];
    const B = new Map(); let total = { n: 0, said: 0, hit: 0 }, unknown = 0;
    for (const t of tickets) {
      if (!kinds.includes(t.kind || 'regular') || t.status === 'pendiente') continue;
      for (const l of t.legs || []) {
        if (!(l.p > 0)) continue;
        const h = legHit(t, l);
        if (h == null) { unknown++; continue; }
        const k = typeOf(l) + '|' + bucketOf(l.p);
        const r = B.get(k) || { type: typeOf(l), bucket: bucketOf(l.p), n: 0, said: 0, hit: 0 };
        r.n++; r.said += l.p; r.hit += h ? 1 : 0; B.set(k, r);
        total.n++; total.said += l.p; total.hit += h ? 1 : 0;
      }
    }
    const order = BUCKETS.map(b => b[1]);
    const rows = [...B.values()].map(r => ({ ...r, said: r.said / r.n, hit: r.hit / r.n }))
      .sort((a, b) => b.n - a.n || order.indexOf(a.bucket) - order.indexOf(b.bucket));
    return { rows, total: total.n ? { n: total.n, said: total.said / total.n, hit: total.hit / total.n } : null, unknown };
  }

  // Monto sugerido: ¼ Kelly sobre el saldo, tope 5% en regulares; soñador = 0.5% fijo (dinero de entretenimiento).
  // Si el valor esperado es negativo (regular), $0. Si algún partido ya está en un ticket abierto, la mitad.
  function suggestStake({ bank, p, odd, kind = 'regular', overlap = false }) {
    if (!(bank > 0) || !(p > 0) || !(odd > 1)) return { amount: 0, why: 'falta saldo o momio' };
    if (kind === 'sonador') {
      const a = Math.max(1, Math.round(bank * 0.005));
      return { amount: a, why: 'soñador: 0.5% del saldo' };
    }
    const edge = p * odd - 1;
    if (edge <= 0) return { amount: 0, why: 'valor esperado negativo' };
    const kelly = edge / (odd - 1), safe = isSafe(p), cap = safe ? SAFE_CAP : 0.05;
    let f = Math.min(kelly / 4, cap);
    const capped = kelly / 4 > cap;
    if (overlap) f /= 2;
    const a = Math.round(bank * f);
    return { amount: a, why: `¼ Kelly${capped ? ` (tope ${Math.round(cap * 100)}%${safe ? ', safe' : ''})` : ''}${overlap ? ', mitad: partido repetido en otro ticket' : ''}`, f };
  }

  // Lectura del partido: registro de aciertos (lo guarda el Pronóstico del día al ver partidos jugados).
  const RK = 'radar.readlog';
  function logReading(key, hit) {
    try { const m = JSON.parse(localStorage.getItem(RK)) || {}; m[key] = hit ? 1 : 0; localStorage.setItem(RK, JSON.stringify(m)); } catch (e) { /* nada */ }
  }
  function readingStats() {
    try { const v = Object.values(JSON.parse(localStorage.getItem(RK)) || {}); return { n: v.length, hits: v.filter(Boolean).length }; } catch (e) { return { n: 0, hits: 0 }; }
  }

  const api = { typeOf, legHit, calibration, suggestStake, logReading, readingStats, bucketOf, SAFE_P, SAFE_CAP, isSafe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadarMoney = api;
})(typeof window !== 'undefined' ? window : globalThis);
