import {
  AXIS, B, CLS, FONT, INK, LB, MONO, MUT, MipChart, NS, NS_CELL, OR, SEQ, SLATE6, ax, base, catAx, esc, fmtN, listText,
  mix, niceCeil, num, pct, sum, tip, heatmapVisual,
} from '../chart-theme';

/** naive_bayes_gaussian: class means standardised against the pooled mean and within-class SD. */
export function buildNaiveBayesGaussianChart(r: any): MipChart[] {
  const classes: string[] = (r?.classes ?? []).map(String);
  const F: string[] = (r?.feature_names ?? []).map(String);
  const n: number[] = (r?.class_count ?? []).map(num);
  if (!classes.length || !F.length || !Array.isArray(r?.theta) || !Array.isArray(r?.var)) return [];
  const N = sum(n);
  const z = F.map((_, f) => {
    const m = sum(r.theta.map((t: number[], k: number) => n[k] * num(t[f]))) / N;
    const sd = Math.sqrt(sum(r.var.map((v: number[], k: number) => n[k] * num(v[f]))) / N);
    return r.theta.map((t: number[]) => (num(t[f]) - m) / sd);
  });
  if (!z.flat().every(Number.isFinite)) return [];
  const lim = Math.max(0.5, Math.ceil(Math.max(...z.flat().map(Math.abs)) * 1.2 * 4) / 4);
  const K = classes.length;
  const gap = Math.min(8, 28 / Math.max(1, K - 1));

  const spread = z.map((row) => Math.max(...row) - Math.min(...row));
  const fBest = spread.indexOf(Math.max(...spread));
  const hiK = z[fBest].indexOf(Math.max(...z[fBest]));
  const loK = z[fBest].indexOf(Math.min(...z[fBest]));
  const caption = [
    Math.max(...spread) < 0.5
      ? `Class means sit within ${Math.max(...spread).toFixed(1)} SD of each other on every feature, so expect weak separation.`
      : `The clearest separation is on ${F[fBest]}: ${classes[hiK]} sits ${spread[fBest].toFixed(1)} SD above ${classes[loK]}.`,
    'Features whose dots overlap add little to the classifier.',
  ].join(' ');

  return [base({
    tooltip: { ...tip, trigger: 'item', formatter: (q: any) => { const k = q.seriesIndex; const f = q.dataIndex; return `<b>${esc(classes[k])}</b> · ${esc(F[f])}<br/>mean ${fmtN(num(r.theta[k][f]), 3)} (σ ${fmtN(Math.sqrt(num(r.var[k][f])), 3)})<br/>${q.value[0] >= 0 ? '+' : ''}${q.value[0].toFixed(2)} SD vs pooled`; } } as any,
    legend: { top: 0, left: 210, itemWidth: 10, itemHeight: 10, icon: 'circle', textStyle: { color: INK, fontSize: 11 } },
    grid: { left: 210, right: 30, top: 34, bottom: 44 },
    xAxis: ax({ type: 'value', min: -lim, max: lim, name: 'Class mean, SD from pooled mean', nameLocation: 'middle', nameGap: 28, axisLabel: { color: MUT, fontSize: 11, formatter: (v: number) => (v > 0 ? '+' : '') + v.toFixed(2) } }),
    yAxis: catAx(F, { splitLine: { show: true, lineStyle: { color: '#F1F5F9' } }, axisLabel: { color: INK, fontSize: 12, width: 196, overflow: 'truncate', fontFamily: FONT } }),
    series: classes.map((c, k) => ({
      name: `${c} (n=${n[k]})`, type: 'scatter', symbolSize: 9, symbolOffset: [0, (k - (K - 1) / 2) * gap], itemStyle: { color: CLS[k % CLS.length] },
      data: z.map((row, f) => [row[k], f]),
      markLine: k === 0 ? { silent: true, symbol: 'none', data: [{ xAxis: 0 }], lineStyle: { color: SLATE6, type: 'solid', width: 1 }, label: { show: false } } : undefined,
    })) as any,
    mipTitle: 'Standardised class means',
    mipCaption: caption,
    mipChartHeight: Math.max(220, F.length * 36 + 90),
  })];
}

/** naive_bayes_categorical: P(category | class) as 100% stacked bars, one small grid per feature. */
export function buildNaiveBayesCategoricalChart(r: any): MipChart[] {
  const classes: string[] = (r?.classes ?? []).map(String);
  const counts = r?.category_count ?? {};
  const feats: string[] = (r?.feature_names ?? Object.keys(counts)).map(String).filter((f: string) => Array.isArray(counts[f]));
  if (!classes.length || !feats.length) return [];
  const H = 118;
  const grids = feats.map((_, i) => ({ left: 130, right: 20, top: 30 + i * H, height: Math.max(40, classes.length * 26) }));
  const series: any[] = [];
  const legends: any[] = [];
  const titles: any[] = [];
  const tvd: number[] = [];

  feats.forEach((f, gi) => {
    const cats: string[] = (r?.categories?.[f] ?? counts[f][0].map((_: unknown, i: number) => `Category ${i + 1}`)).map(String);
    const share = classes.map((_, k) => { const row = (counts[f][k] ?? []).map(num); const t = sum(row) || 1; return row.map((x: number) => x / t * 100); });
    tvd.push(Math.max(...cats.map((_, ci) => Math.max(...share.map((s) => s[ci])) - Math.min(...share.map((s) => s[ci])))));
    const pal = cats.length <= CLS.length ? [B, AXIS, OR, SLATE6] : SEQ;
    titles.push({ type: 'text', left: 130, top: 8 + gi * H, style: { text: f, fontSize: 12, fontWeight: 600, fill: INK, fontFamily: FONT } });
    cats.forEach((cat, ci) => {
      const color = pal[ci % pal.length];
      series.push({
        name: cat, type: 'bar', stack: `g${gi}`, xAxisIndex: gi, yAxisIndex: gi, barWidth: 20,
        data: share.map((s) => +s[ci].toFixed(1)), itemStyle: { color },
        label: { show: true, position: 'inside', fontSize: 10.5, fontFamily: MONO, color: [B, SLATE6, '#4F5DE6'].includes(color) ? '#fff' : INK, formatter: (q: any) => (q.value >= 8 ? `${Math.round(q.value)}%` : '') },
      });
    });
    legends.push({ top: 8 + gi * H, right: 20, itemWidth: 10, itemHeight: 10, textStyle: { color: MUT, fontSize: 11 }, data: cats.filter((_, ci) => counts[f].some((row: number[]) => num(row?.[ci]) > 0)) });
  });

  const hi = tvd.indexOf(Math.max(...tvd));
  const lo = tvd.indexOf(Math.min(...tvd));
  const caption = [
    `${feats[hi]} differs most between classes (up to ${tvd[hi].toFixed(0)} points in a category's share).`,
    feats.length > 1 && tvd[lo] < 10 ? `${feats[lo]} barely differs by class, so it adds little to the classifier.` : '',
  ].filter(Boolean).join(' ');

  return [base({
    graphic: titles,
    legend: legends,
    tooltip: { ...tip, trigger: 'item', formatter: (q: any) => `${esc(classes[q.dataIndex])} · ${esc(q.seriesName)}<br/>P(category | class) = ${q.value}%` } as any,
    grid: grids,
    xAxis: grids.map((_, i) => ({ gridIndex: i, type: 'value', max: 100, show: i === grids.length - 1, axisLabel: { color: MUT, fontSize: 10, formatter: '{value}%' }, splitLine: { show: false }, axisLine: { show: false } })),
    yAxis: grids.map((_, i) => catAx(classes.map((c, k) => `${c}  n=${fmtN(num(r?.class_count?.[k]), 0)}`), { gridIndex: i })),
    series,
    mipTitle: 'Category mix per class',
    mipCaption: caption,
    mipChartHeight: 40 + feats.length * H,
  })];
}

/** linear_svm: weights sorted by magnitude. Names come from the selected covariates when the count matches. */
export function buildSVMChart(r: any): MipChart[] {
  const w: number[] = (r?.weights ?? []).map(num);
  if (!w.length || !w.every(Number.isFinite)) return [];
  const given: string[] = Array.isArray(r?.variable_names) ? r.variable_names.map(String) : [];
  const names = w.map((_, i) => (given.length === w.length ? given[i] : `Weight ${i + 1}`));
  const idx = w.map((_, i) => i).sort((a, b) => Math.abs(w[b]) - Math.abs(w[a]));
  const m = niceCeil(Math.max(...w.map(Math.abs)) * 1.3);
  const pos = idx.filter((i) => w[i] > 0).slice(0, 2).map((i) => names[i]);
  const neg = idx.filter((i) => w[i] < 0).slice(0, 2).map((i) => names[i]);
  const caption = [
    [pos.length ? `${listText(pos)} push predictions toward the positive class` : '', neg.length ? `${listText(neg)} toward the negative class` : ''].filter(Boolean).join('; ') + '.',
    'Weights compare only if the inputs share a scale (e.g. standardised).',
  ].join(' ');

  return [base({
    tooltip: { ...tip, trigger: 'item', formatter: (q: any) => `${esc(q.name)}<br/>weight ${fmtN(q.value, 3)}` } as any,
    grid: { left: 170, right: 50, top: 10, bottom: 44 },
    xAxis: ax({ type: 'value', min: -m, max: m, interval: m / 2, name: '← pushes toward negative class  ·  weight  ·  pushes toward positive class →', nameLocation: 'middle', nameGap: 28, axisLabel: { color: MUT, fontSize: 11, formatter: (v: number) => fmtN(v) } }),
    yAxis: catAx(idx.map((i) => names[i]), { axisLabel: { color: INK, fontSize: 12, width: 156, overflow: 'truncate', fontFamily: FONT } }),
    series: [{
      type: 'bar', barWidth: 16,
      data: idx.map((i) => ({ name: names[i], value: w[i], itemStyle: { color: w[i] >= 0 ? B : OR, borderRadius: w[i] >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] }, label: { position: w[i] >= 0 ? 'right' : 'left' } })),
      label: { show: true, fontFamily: MONO, fontSize: 11.5, color: INK, formatter: (q: any) => fmtN(q.value) },
      markLine: { silent: true, symbol: 'none', data: [{ xAxis: 0 }], lineStyle: { color: SLATE6, type: 'solid', width: 1 }, label: { show: false } },
    }] as any,
    mipTitle: 'Feature weights',
    mipMeta: [r?.n_obs != null ? `n = ${r.n_obs}` : '', Number.isFinite(num(r?.intercept)) ? `intercept ${fmtN(num(r.intercept), 3)}` : ''].filter(Boolean).join(' · ') || undefined,
    mipCaption: caption,
    mipChartHeight: Math.max(200, w.length * 30 + 70),
  })];
}

/** *_cv: confusion matrix as row % with recall and precision margins. Accepts {data, labels} or {tp, fp, fn, tn}. */
export function buildConfusionMatrixChart(r: any): MipChart[] {
  const cm = r?.confusion_matrix;
  let M: number[][] = [];
  let L: string[] = [];
  if (Array.isArray(cm?.data) && Array.isArray(cm?.labels)) {
    M = cm.data.map((row: unknown[]) => row.map(num));
    L = cm.labels.map(String);
  } else if (cm && ['tp', 'fp', 'fn', 'tn'].every((k) => Number.isFinite(num(cm[k])))) {
    // Rows = actual, columns = predicted.
    M = [[num(cm.tp), num(cm.fn)], [num(cm.fp), num(cm.tn)]];
    L = ['Positive', 'Negative'];
  }
  const n = L.length;
  if (!n || M.length !== n) return [];
  const rowT = M.map(sum);
  const colT = L.map((_, j) => sum(M.map((row) => row[j])));
  const data: any[] = [];
  M.forEach((row, i) => row.forEach((v, j) => {
    const p = rowT[i] ? v / rowT[i] : 0;
    const diag = i === j;
    data.push({ value: [j, i, p], n: v, itemStyle: { color: diag ? mix('#ffffff', B, p / 0.85) : mix('#ffffff', OR, p / 0.4), borderColor: '#fff', borderWidth: 3 }, label: { color: diag && p > 0.45 ? '#fff' : INK } });
  }));
  const recall = L.map((_, i) => (rowT[i] ? M[i][i] / rowT[i] : NaN));
  const precision = L.map((_, j) => (colT[j] ? M[j][j] / colT[j] : NaN));
  L.forEach((_, i) => data.push({ value: [n, i, recall[i]], meta: 'Recall', itemStyle: { color: NS_CELL, borderColor: '#fff', borderWidth: 3 } }));
  L.forEach((_, j) => data.push({ value: [j, n, precision[j]], meta: 'Precision', itemStyle: { color: NS_CELL, borderColor: '#fff', borderWidth: 3 } }));

  const best = recall.indexOf(Math.max(...recall.filter(Number.isFinite)));
  const worst = recall.indexOf(Math.min(...recall.filter(Number.isFinite)));
  const confusedWith = M[worst].map((v, j) => (j === worst ? -1 : v)).reduce((bi, v, j, a) => (v > a[bi] ? j : bi), 0);
  const caption = n < 2 || best === worst
    ? `${L[best]} is recognised with ${pct(recall[best])} recall.`
    : [
      `${L[best]} is recognised best (${pct(recall[best])} recall).`,
      `${L[worst]} is hardest: only ${pct(recall[worst])} of ${L[worst]} cases are classified correctly${M[worst][confusedWith] > M[worst][worst] ? `, most are predicted as ${L[confusedWith]}` : ''}, and ${pct(precision[worst])} of ${L[worst]} predictions are right.`,
    ].join(' ');

  return [base({
    tooltip: { ...tip, formatter: (q: any) => (q.data.meta ? `${q.data.meta} ${(q.value[2] * 100).toFixed(1)}%` : `Actual <b>${esc(L[q.value[1]])}</b> → predicted <b>${esc(L[q.value[0]])}</b><br/>${q.data.n} of ${rowT[q.value[1]]} (${(q.value[2] * 100).toFixed(1)}% of row)`) } as any,
    visualMap: heatmapVisual as any,
    grid: { left: 100, right: 20, top: 54, bottom: 30 },
    xAxis: { type: 'category', position: 'top', data: [...L, 'Recall'], name: 'Predicted', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: MUT, fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: INK, fontSize: 12, fontWeight: 600, interval: 0 } },
    yAxis: { type: 'category', inverse: true, data: [...L, 'Precision'], name: 'Actual', nameLocation: 'middle', nameGap: 80, nameTextStyle: { color: MUT, fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: INK, fontSize: 12, fontWeight: 600 } },
    series: [{
      type: 'heatmap', data,
      label: {
        show: true,
        formatter: (q: any) => (q.data.meta ? `{m|${Number.isFinite(q.value[2]) ? Math.round(q.value[2] * 100) + '%' : '—'}}` : `{p|${Math.round(q.value[2] * 100)}%}\n{n|n = ${q.data.n}}`),
        rich: { p: { fontSize: 15, fontWeight: 600, fontFamily: FONT, lineHeight: 20 }, n: { fontSize: 10.5, fontFamily: MONO, lineHeight: 14 }, m: { fontSize: 13, fontWeight: 600, fontFamily: MONO, color: B } },
      },
    }] as any,
    mipTitle: 'Confusion matrix',
    mipMeta: `Rows: actual · columns: predicted · n = ${sum(rowT)}`,
    mipCaption: caption,
    mipChartHeight: Math.max(260, (n + 1) * 60 + 90),
  })];
}

const meanSd = (xs: number[]) => {
  const m = sum(xs) / xs.length;
  return { m, sd: xs.length > 1 ? Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1)) : 0 };
};

/** Linear interpolation of a fold's TPR at `x`, with fpr sorted ascending. */
function tprAt(fpr: number[], tpr: number[], x: number): number {
  for (let i = 1; i < fpr.length; i++) {
    if (fpr[i] >= x) {
      const d = fpr[i] - fpr[i - 1];
      return d > 0 ? tpr[i - 1] + (tpr[i] - tpr[i - 1]) * (x - fpr[i - 1]) / d : tpr[i];
    }
  }
  return tpr[tpr.length - 1];
}

/** logistic_regression_cv: fold ROC curves with the mean curve on a shared FPR grid. */
export function buildRocCurveChart(r: any): MipChart[] {
  const folds = (Array.isArray(r?.roc_curves) ? r.roc_curves : [])
    .map((f: any) => {
      const pts = (f?.fpr ?? []).map((x: unknown, i: number) => [num(x), num(f?.tpr?.[i])]).filter((p: number[]) => p.every(Number.isFinite)).sort((a: number[], b: number[]) => a[0] - b[0]);
      return { name: String(f?.name ?? 'Fold'), auc: num(f?.auc), pts };
    })
    .filter((f: any) => f.pts.length > 1);
  if (!folds.length) return [];
  const grid = Array.from({ length: 51 }, (_, i) => i / 50);
  const mean = grid.map((x) => [x, sum(folds.map((f: any) => tprAt(f.pts.map((p: number[]) => p[0]), f.pts.map((p: number[]) => p[1]), x))) / folds.length]);
  const aucs = folds.map((f: any) => f.auc).filter(Number.isFinite);
  const { m, sd } = meanSd(aucs);
  const meanName = aucs.length ? `Mean ROC (AUC ${m.toFixed(2)} ± ${sd.toFixed(2)})` : 'Mean ROC';

  return [base({
    tooltip: { ...tip, trigger: 'axis', formatter: (ps: any) => { const q = ps.find((x: any) => x.seriesName === meanName); return q ? `FPR ${q.value[0].toFixed(2)} → mean TPR ${q.value[1].toFixed(2)}` : ''; } } as any,
    legend: { bottom: 0, left: 'center', itemWidth: 16, itemHeight: 3, textStyle: { color: INK, fontSize: 11 }, data: [meanName, 'Individual folds', 'Chance'] },
    grid: { left: 'center', top: 10, width: 300, height: 300 },
    xAxis: ax({ type: 'value', min: 0, max: 1, interval: 0.25, name: 'False positive rate (1 − specificity)', nameLocation: 'middle', nameGap: 26 }),
    yAxis: ax({ type: 'value', min: 0, max: 1, interval: 0.25, name: 'True positive rate', nameLocation: 'middle', nameGap: 34 }),
    series: [
      ...folds.map((f: any) => ({ name: 'Individual folds', type: 'line', showSymbol: false, silent: true, data: f.pts, lineStyle: { color: LB, width: 1, opacity: 0.8 }, itemStyle: { color: LB } })),
      { name: 'Chance', type: 'line', data: [[0, 0], [1, 1]], showSymbol: false, silent: true, lineStyle: { color: NS, type: 'dashed', width: 1 }, itemStyle: { color: NS } },
      { name: meanName, type: 'line', data: mean, showSymbol: false, lineStyle: { color: B, width: 3 }, itemStyle: { color: B }, areaStyle: { color: 'rgba(43,51,233,.07)' } },
    ] as any,
    mipTitle: 'ROC curves',
    mipCaption: aucs.length
      ? `Mean AUC is ${m.toFixed(2)} ± ${sd.toFixed(2)} across ${aucs.length} folds (${Math.min(...aucs).toFixed(2)}–${Math.max(...aucs).toFixed(2)}). ${sd < 0.03 ? 'The fold curves sit close together, so performance is stable across data splits.' : 'The folds differ noticeably, so performance depends on the data split.'}`
      : undefined,
    mipChartHeight: 370,
  })];
}

const CLASS_METRICS: [string, string][] = [['accuracy', 'Accuracy'], ['precision', 'Precision'], ['recall', 'Recall'], ['fscore', 'F1-score']];
const REG_METRICS: [string, string][] = [['r_squared', 'R²'], ['mean_sq_error', 'MSE'], ['mean_abs_error', 'MAE'], ['f_stat', 'F statistic']];

/** logistic_regression_cv summary: per-fold dots, mean ± SD band and mean tick on a shared 0.5–1 axis. */
function buildClassificationStrip(s: any): MipChart[] {
  const rowNames: string[] = (s?.row_names ?? []).map(String);
  const isFold = (i: number) => (rowNames.length ? /^fold/i.test(rowNames[i]) : true);
  const metrics = CLASS_METRICS
    .map(([k, label]) => ({ label, v: (Array.isArray(s?.[k]) ? s[k] : []).map(num).filter((x: number, i: number) => isFold(i) && Number.isFinite(x)) as number[] }))
    .filter((x) => x.v.length);
  if (!metrics.length) return [];
  const summ = metrics.map((x) => meanSd(x.v));
  const dots: any[] = [];
  metrics.forEach((x, i) => x.v.forEach((val, f) => dots.push([val, i + (x.v.length > 1 ? (f / (x.v.length - 1) - 0.5) * 0.28 : 0), `Fold ${f + 1}`, x.label])));
  const lo = Math.min(0.5, Math.floor(Math.min(...metrics.flatMap((x) => x.v)) * 10) / 10);
  const ranges = metrics.map((x) => Math.max(...x.v) - Math.min(...x.v));
  const iVar = ranges.indexOf(Math.max(...ranges));
  const rng = (i: number) => `${Math.min(...metrics[i].v).toFixed(2)}–${Math.max(...metrics[i].v).toFixed(2)}`;

  return [base({
    tooltip: { ...tip, trigger: 'item', formatter: (q: any) => (q.seriesIndex === 0 ? `${esc(q.value[3])} · ${q.value[2]}: ${q.value[0].toFixed(3)}` : `${esc(metrics[q.value[3]].label)}: mean ${q.value[0].toFixed(3)} ± ${q.value[4].toFixed(3)} SD`) } as any,
    grid: { left: 100, right: 120, top: 10, bottom: 44 },
    xAxis: ax({ type: 'value', min: lo, max: 1, interval: 0.1, axisLine: { onZero: false, lineStyle: { color: AXIS } }, name: `Score across ${metrics[0].v.length} folds (dots) · mean ± SD (bar)`, nameLocation: 'middle', nameGap: 28 }),
    yAxis: [
      { type: 'value', min: -0.5, max: metrics.length - 0.5, inverse: true, interval: 1, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { color: INK, fontSize: 12, customValues: metrics.map((_, i) => i), formatter: (v: number) => metrics[v]?.label ?? '' } },
      { type: 'value', min: -0.5, max: metrics.length - 0.5, inverse: true, interval: 1, position: 'right', axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { color: INK, fontFamily: MONO, fontSize: 11.5, customValues: metrics.map((_, i) => i), formatter: (v: number) => (summ[v] ? `${summ[v].m.toFixed(3)} ± ${summ[v].sd.toFixed(3)}` : '') } },
    ],
    series: [
      { type: 'scatter', data: dots, symbolSize: 8, itemStyle: { color: LB, opacity: 0.9 } },
      {
        type: 'custom', data: summ.map((x, i) => [x.m, x.m - x.sd, x.m + x.sd, i, x.sd]), encode: { x: [0, 1, 2], y: 3 },
        renderItem: (_p: any, api: any) => {
          const y = api.coord([0, api.value(3)])[1];
          const x = api.coord([api.value(0), 0])[0];
          const xl = api.coord([api.value(1), 0])[0];
          const xh = api.coord([api.value(2), 0])[0];
          return { type: 'group', children: [{ type: 'rect', shape: { x: xl, y: y - 13, width: xh - xl, height: 26 }, style: { fill: 'rgba(43,51,233,.10)' } }, { type: 'line', shape: { x1: x, y1: y - 15, x2: x, y2: y + 15 }, style: { stroke: B, lineWidth: 3 } }] };
        },
      },
    ] as any,
    mipTitle: 'Cross-validation metrics',
    mipCaption: `${metrics[0].label} ranges ${rng(0)} across folds.${iVar !== 0 ? ` ${metrics[iVar].label} varies most (${rng(iVar)}), so on some splits the model does noticeably worse on it.` : ''}`,
    mipChartHeight: Math.max(200, metrics.length * 44 + 64),
  })];
}

/** linear_regression_cv: mean ± SD per metric, each on its own small axis (the payload has no per-fold values). */
function buildRegressionStrip(s: any): MipChart[] {
  const stat = (v: any) => (Array.isArray(v) ? { m: num(v[0]), sd: num(v[1]) } : { m: num(v?.mean), sd: num(v?.std) });
  const metrics = REG_METRICS.map(([k, label]) => ({ label, ...stat(s?.[k]) })).filter((x) => Number.isFinite(x.m) && Number.isFinite(x.sd));
  if (!metrics.length) return [];
  const rowH = 48;
  const grids = metrics.map((_, i) => ({ left: 110, right: 140, top: 12 + i * rowH, height: 24 }));
  const r2 = metrics.find((x) => x.label === 'R²');

  return [base({
    tooltip: { ...tip, trigger: 'item', formatter: (q: any) => `${esc(metrics[q.seriesIndex].label)}: mean ${fmtN(metrics[q.seriesIndex].m, 3)} ± ${fmtN(metrics[q.seriesIndex].sd, 3)} SD` } as any,
    grid: grids,
    xAxis: metrics.map((x, i) => ax({ gridIndex: i, type: 'value', min: Math.max(0, x.m - 3 * x.sd), max: x.m + 3 * x.sd || 1, splitNumber: 3, splitLine: { show: false }, axisLabel: { color: MUT, fontSize: 10, showMinLabel: false, showMaxLabel: false, formatter: (v: number) => fmtN(v) } })),
    yAxis: metrics.flatMap((x, i) => [
      catAx([x.label], { gridIndex: i }),
      catAx([x.label], { gridIndex: i, position: 'right', axisLabel: { color: INK, fontFamily: MONO, fontSize: 11.5, formatter: () => `${fmtN(x.m, 3)} ± ${fmtN(x.sd, 3)}` } }),
    ]),
    series: metrics.map((x, i) => ({
      type: 'custom', xAxisIndex: i, yAxisIndex: i * 2, data: [[x.m, x.m - x.sd, x.m + x.sd]], encode: { x: [0, 1, 2], y: -1 },
      renderItem: (_p: any, api: any) => {
        const [xm, y] = api.coord([api.value(0), 0]);
        const xl = api.coord([api.value(1), 0])[0];
        const xh = api.coord([api.value(2), 0])[0];
        return { type: 'group', children: [{ type: 'rect', shape: { x: xl, y: y - 11, width: Math.max(2, xh - xl), height: 22 }, style: { fill: 'rgba(43,51,233,.10)' } }, { type: 'line', shape: { x1: xm, y1: y - 13, x2: xm, y2: y + 13 }, style: { stroke: B, lineWidth: 3 } }] };
      },
    })) as any,
    mipTitle: 'Cross-validation metrics',
    mipCaption: r2
      ? `Across folds the model explains ${pct(r2.m)} ± ${pct(r2.sd)} of the variance${r2.sd < 0.05 ? ', a stable fit' : ', so the fit depends on the split'}. Each metric has its own axis.`
      : 'Mean ± SD across folds. Each metric has its own axis.',
    mipChartHeight: 24 + metrics.length * rowH,
  })];
}

export function buildCVMetricsChart(r: any): MipChart[] {
  const s = r?.summary ?? r;
  return CLASS_METRICS.some(([k]) => Array.isArray(s?.[k])) ? buildClassificationStrip(s) : buildRegressionStrip(s);
}
