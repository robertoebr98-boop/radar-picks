// Contexto de tabla: qué se juega cada equipo (clasificación, descenso o nada) según la tabla y los partidos que faltan.
(function (root) {
  'use strict';

  // Reglas por liga: partidos por equipo, líneas de corte (posición máxima que entra) y zona de descenso.
  const RULES = {
    // J1 2026-27: otoño-primavera, 20 equipos, 38 jornadas.
    'jpn.1': { games: 38, lines: [{ pos: 1, name: 'título' }], releg: 3 },
    'mex.w.1': { games: 17, lines: [{ pos: 8, name: 'liguilla' }], releg: 0 },
    // Apertura 2026 (año de Mundial): sin play-in, los 8 primeros van directo a cuartos.
    'mex.1': { games: 17, lines: [{ pos: 8, name: 'cuartos de final' }], releg: 0 },
    'eng.1': { games: 38, lines: [{ pos: 4, name: 'Champions' }, { pos: 6, name: 'Europa' }], releg: 3 },
    'esp.1': { games: 38, lines: [{ pos: 4, name: 'Champions' }, { pos: 6, name: 'Europa' }], releg: 3 },
    'ita.1': { games: 38, lines: [{ pos: 4, name: 'Champions' }, { pos: 6, name: 'Europa' }], releg: 3 },
    'ger.1': { games: 34, lines: [{ pos: 4, name: 'Champions' }, { pos: 6, name: 'Europa' }], releg: 3 },
    'fra.1': { games: 34, lines: [{ pos: 4, name: 'Champions' }, { pos: 6, name: 'Europa' }], releg: 3 },
    'ned.1': { games: 34, lines: [{ pos: 2, name: 'Champions' }, { pos: 5, name: 'Europa' }], releg: 3 },
    'por.1': { games: 34, lines: [{ pos: 2, name: 'Champions' }, { pos: 5, name: 'Europa' }], releg: 3 },
    'uefa.champions': { games: 8, lines: [{ pos: 8, name: 'octavos directo' }, { pos: 24, name: 'playoff' }], releg: 0 },
    'uefa.europa': { games: 8, lines: [{ pos: 8, name: 'octavos directo' }, { pos: 24, name: 'playoff' }], releg: 0 },
  };
  // Multiplicador de ataque por estado, probado con 2,357 partidos de final de temporada (backtest/RESULTADOS.md):
  // quien se juega algo ataca ~8% más; "relajado" no baja los goles (si acaso, partidos más abiertos).
  const EFFECT = { relajado: 1, normal: 1, presion: 1.08 };

  // table: [{teamId, gp, pts}] de una liga (un grupo). Devuelve Map teamId -> {tag, label, detail, motivation}
  function classify(table, lg, rulesOverride) {
    const R = rulesOverride || RULES[lg];
    const out = new Map();
    if (!R || !table.length) return out;
    const t = [...table].sort((a, b) => b.pts - a.pts || (b.gd || 0) - (a.gd || 0));
    const n = t.length;
    const left = x => Math.max(0, R.games - x.gp);
    const maxLeft = Math.max(...t.map(left));
    const late = maxLeft <= Math.max(3, Math.round(R.games * 0.25)); // último cuarto de la temporada
    const lines = [...R.lines.map(l => ({ ...l, kind: 'up' })), ...(R.releg ? [{ pos: n - R.releg, name: 'salvación', kind: 'down' }] : [])];
    t.forEach((x, i) => {
      const pos = i + 1, rem = left(x) * 3;
      if (!late) { out.set(String(x.teamId), { tag: 'normal', label: 'Todo en juego', detail: `${pos}º · faltan ${left(x)} partidos`, motivation: 'normal', pos }); return; }
      let tag = null, detail = '';
      // ¿Qué línea tiene a su alcance (arriba o abajo)?
      for (const L of lines) {
        const atLine = t[L.pos - 1], below = t[L.pos];
        if (!below) { if (L.kind === 'up' && pos <= L.pos) { tag = tag || 'asegurado'; detail = detail || `ya asegura ${L.name}`; } continue; }
        if (!atLine) continue;
        if (pos <= L.pos) {
          const chaser = below, chaserMax = chaser.pts + left(chaser) * 3;
          if (x.pts > chaserMax) { tag = tag || (L.kind === 'down' ? null : 'asegurado'); detail = detail || `ya asegura ${L.name}`; continue; }
          tag = 'presion'; detail = L.kind === 'down' ? `se juega la ${L.name}` : `defiende ${L.name} (${x.pts - chaser.pts} pts de ventaja)`; break;
        } else {
          if (x.pts + rem < atLine.pts) { if (L.kind === 'down') { tag = 'presion'; detail = 'descendido o casi'; break; } continue; }
          tag = 'presion'; detail = L.kind === 'down' ? `pelea la ${L.name} (${atLine.pts - x.pts} pts abajo)` : `busca ${L.name} (a ${atLine.pts - x.pts} pts)`; break;
        }
      }
      let motivation;
      if (tag === 'presion') motivation = 'presion';
      else if (tag === 'asegurado') {
        // Asegurado arriba: si aún puede mejorar a una línea superior, sigue en juego.
        motivation = 'relajado';
      } else { tag = 'sin-nada'; detail = 'sin nada en juego'; motivation = 'relajado'; }
      const label = { presion: 'Se juega algo', asegurado: 'Ya clasificado', 'sin-nada': 'Nada en juego' }[tag];
      out.set(String(x.teamId), { tag, label, detail: `${pos}º · ${detail} · faltan ${left(x)}`, motivation, pos });
    });
    return out;
  }

  function factor(ctx) { return ctx ? (EFFECT[ctx.motivation] || 1) : 1; }

  const api = { RULES, EFFECT, classify, factor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadarContext = api;
})(typeof window !== 'undefined' ? window : globalThis);
