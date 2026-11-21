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

## Enfrentamientos directos (H2H), 20-nov-2026
Últimos 5 enfrentamientos (cualquier sede, temporadas anteriores incluidas), mezclados con los goles esperados: λ = (1−w)·λ + w·goles H2H, con w escalado por n/5 y solo si hay ≥ 3 enfrentamientos. Medido en los 5,621 partidos que tenían ≥ 3 H2H.

| peso H2H | Brier 1X2 | log-loss | Brier O2.5 |
|---|---|---|---|
| 0% (v4) | 0.5871 | 0.9855 | 0.2438 |
| 5% | 0.5868 | 0.9850 | 0.2435 |
| **10%** | **0.5867** | **0.9848** | 0.2433 |
| 15% | 0.5869 | 0.9851 | 0.2432 |
| 20% | 0.5874 | 0.9858 | — |
| 30% | 0.5892 | 0.9884 | — |
| 10%, mínimo 5 H2H | 0.5870 | 0.9852 | 0.2435 |

Conclusión: el H2H aporta poco una vez que hay fuerza por rival y remates (mejora 0.0004 de Brier con 10%); más de 15% empeora. Se usa 10% (CFG.H2H_WEIGHT). Ambos anotan no cambia (0.2459).

## Forma reciente y "quiebres" de rendimiento, 20-nov-2026
Pregunta (aficionado de Pumas): ¿pesan más los goles de las últimas jornadas? ¿Hay que dar más peso a lo posterior a un cambio (alineación, refuerzo)? 7,994 partidos.

| variante | Brier 1X2 |
|---|---|
| actual (vida media 30 partidos) | 0.5901 |
| vida media 6 / 10 / 15 / 50 | 0.5917 / 0.5906 / 0.5902 / 0.5902 |
| quiebre (últimos 6 vs 12 anteriores, ≥0.8 goles netos) ×2 | 0.5900 |
| solo partidos con quiebre ≥1.5 (980): sin peso extra / ×2 / ×3 | 0.5920 / 0.5921 / 0.5923 |
| solo partidos con quiebre ≥2.0 (206): sin peso extra / ×2 / ×3 | 0.5617 / 0.5608 / 0.5604 |

Conclusión: dar más peso a lo reciente empeora; los quiebres moderados son ruido y solo los extremos (206 de 7,994) mejoran algo, con muestra chica. No se cambia el cálculo: se avisa en el análisis cuando hay quiebre (≥1.5) y hay un ajuste manual "en racha / en crisis" (±8% ataque) marcado como opinión.
Además: Liga MX Apertura 2026 no tiene play-in (año de Mundial): los 8 primeros van a cuartos; context.js actualizado.

## Ambos anotan (BTTS), 21-nov-2026
Calibración del modelo (7,994 partidos): el Poisson exagera los extremos. Decía 46% → pasó 51%; decía 72% → pasó 65.5%. Promedio real de ambos anotan: 54.7% (11,467 partidos).
Ajuste: p' = 0.54 + 0.6·(p − 0.54). Brier de ambos anotan 0.2465 → 0.2456 (k 0.8: 0.2459, k 0.5: 0.2459, k 0.4: 0.2462). Después del ajuste: dijo 47.5% → pasó 49.4%; 54.6% → 55.0%; 61.9% → 66.0%.
Lectura práctica: ambos anotan rara vez pasa de 65% en el modelo; es un mercado de momio ~1.70–1.90 que solo conviene cuando la casa paga más que el justo.

## Selecciones correlacionadas del mismo partido, 21-nov-2026
Datos reales (11,467 partidos): P(más de 2.5) 53.6% · P(ambos anotan) 54.7% · P(local anota) 77.5% · P(visita anota) 71.0%.
Dado más de 2.5: ambos anotan 79.5% · local anota 92.6% · visita anota 86.9%. P(más de 2.5 y ambos anotan) = 42.6% (no 29% como si fueran independientes).
"Equipo anota" con ambos anotan ya incluido es 100% redundante. El modelo (matriz de marcadores) reproduce el 0.80 de ambos anotan | más de 2.5.
Regla en la calculadora: una selección del mismo partido conviene solo si Draftea sube el momio del SGP al menos ×(1/factor condicional).
Datos reales: P(visita anota | más de 2.5 y local anota) = 85.8% (5,695 partidos). Lo que la tumba: 3-0 (7.8%), 4-0 (4.0%), 5-0 (1.5%). Modelo con goles esperados 1.4–1.6: 93.6%; 1.3–1.0: 86%.

## Combinaciones del mismo partido más "ligadas" (11,467 partidos), 21-nov-2026
| base | + agregar | P(sola) | P(dado la base) | juntas | momio justo SGP vs. si fueran independientes |
|---|---|---|---|---|---|
| Gana visita | Visita 2+ goles | 36.2% | 78.0% | 24.8% | 4.04 vs 8.69 |
| Gana local | Local 2+ goles | 44.5% | 79.2% | 34.2% | 2.92 vs 5.20 |
| Ambos no anotan | Menos de 2.5 | 46.4% | 75.7% | 34.3% | 2.92 vs 4.76 |
| Local 2+ goles | Más de 2.5 | 53.6% | 84.7% | 37.7% | 2.65 vs 4.19 |
| Más de 2.5 | Ambos anotan | 54.7% | 79.5% | 42.6% | 2.35 vs 3.41 |
| Local 2+ goles | Local o empate | 68.2% | 91.9% | 40.9% | 2.44 vs 3.29 |
| Ambos no anotan | Menos de 3.5 | 68.4% | 89.7% | 40.6% | 2.46 vs 3.23 |
Lectura: la correlación NO da valor por sí sola; Draftea ya la descuenta en el SGP. Conviene cuando el SGP paga más que el "momio justo SGP" de la tabla (la calculadora lo calcula por partido con sus goles esperados).

## Parlay soñador
$5 → $30,000 = momio 6,000: probabilidad justa 0.017% (1 de cada ~6,000); con el margen de la casa (~6% por selección, 10–12 selecciones) la real ronda 0.009%. Momio ~20x ≈ 5%.
