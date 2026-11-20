# Backtest del modelo (20-nov-2026)

7,994 partidos de Premier, LaLiga, Serie A, Bundesliga y Ligue 1 (temporadas 2020-21 a 2024-25).
Cada partido se predijo solo con los partidos anteriores (sin ver el futuro). Mide el 1X2 del modelo solo, sin mezclar con la casa.

Menos es mejor en ambas métricas.

```
Siempre 46/26/28 (referencia tonta)        Brier 0.6531  log-loss 1.0785  n=7982
v2: tabla + local/visita + forma           Brier 0.6030  log-loss 1.0095  n=7994
v3: + ajuste por rival y recencia          Brier 0.5972  log-loss 1.0009  n=7994
v4: + remates a puerta + pesos del backtest Brier 0.5904  log-loss 0.9908  n=7994

Calibración de patas (último modelo): prob. que dijo el modelo vs. lo que pasó
  0.60-0.70  dijo 65.1%  pasó 64.7%  (12960 patas)
  0.70-0.80  dijo 74.7%  pasó 74.6%  (16698 patas)
  0.80-0.90  dijo 83.8%  pasó 83.6%  (6669 patas)
  0.90+      dijo 92.0%  pasó 88.2%  (561 patas)
```

- **Brier** pasó de 0.6030 (v2) a 0.5904 (v4): 2.1% menos error. Contra la referencia tonta, el modelo quita 9.6% del error.
- **Calibración:** cuando el modelo dice 70–80%, pasa 74.6% de las veces. En 90%+ exagera unos 4 puntos (dice 92%, pasa 88%).
- **Qué se cambió con esto:** remates a puerta pesan 80% del ajuste por rival, la forma ya no se suma aparte, la memoria es más larga (vida media 30 partidos), 75% fuerza ajustada por rival + 25% tabla.
- **No se midió:** la mezcla 50/50 con la casa (estos datos no traen momios). Las casas suelen andar en Brier ~0.575, por eso la mitad del peso es suya.

Repetir: `sh backtest/descargar.sh && node backtest/backtest.js`

## Córners, remates y tarjetas (props-backtest.js)

Cada partido se predijo con las 5 semanas anteriores de su liga (3,800 partidos, 2023-2025).

```
Córners
  0.60-0.70  dijo 64.7%  pasó 66.0%  (9278)
  0.70-0.80  dijo 74.1%  pasó 74.5%  (4661)
  0.80+      dijo 82.9%  pasó 81.2%  (674)
Remates
  0.60-0.70  dijo 64.8%  pasó 64.2%  (3815)
  0.70-0.80  dijo 74.8%  pasó 74.9%  (3096)
  0.80+      dijo 85.3%  pasó 84.6%  (2088)
Remates a puerta
  0.60-0.70  dijo 64.9%  pasó 64.5%  (7898)
  0.70-0.80  dijo 74.8%  pasó 74.9%  (6829)
  0.80+      dijo 84.8%  pasó 85.3%  (4324)
Tarjetas
  0.60-0.70  dijo 64.7%  pasó 64.1%  (3721)
  0.70-0.80  dijo 75.0%  pasó 75.9%  (4339)
  0.80+      dijo 82.9%  pasó 82.4%  (1293)
```

Córners necesitó más dispersión (1.8) porque varían mucho de partido a partido. Tarjetas usa el promedio de la liga ajustado por faltas: ESPN no da tarjetas por partido.

## Contexto de tabla (motivación)

2,357 partidos del último cuarto de temporada donde al menos un equipo ya estaba clasificado, sin nada en juego o peleando una línea (Champions, Europa, descenso).

```
sin ajuste                          Brier 0.5927
"relajado" ataca 5% menos           Brier 0.5929  (empeora)
"relajado" ataca 10% menos          Brier 0.5933  (empeora)
quien se juega algo ataca 8% más    Brier 0.5921  (mejora poco)
```

- Los equipos ya clasificados o sin nada en juego **no** meten menos goles; sus partidos tienden a ser más abiertos. Por eso no se les baja el ataque.
- A quien se juega algo se le sube 8% el ataque. Mejora poco (0.1%); la etiqueta sirve más como aviso (posibles rotaciones) que como ajuste.
- Liga MX no está en estos datos: sus reglas (6 directos, 7-10 play-in) se aplican igual.
