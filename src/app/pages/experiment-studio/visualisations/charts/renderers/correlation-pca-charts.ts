import {
  ALPHA, AXIS, B, FONT, INK, LB, MONO, MUT, MipChart, NS, NS_CELL, OR, ORD, ax, base, diverge, esc, fp, inkOn, num, short, tip, heatmapVisual,
} from '../chart-theme';

function pickMatrix(r: any, ...keys: string[]): any {
  for (const k of keys) {
    const m = r?.[k];
    if (m && typeof m === 'object' && !Array.isArray(m)) return m;
  }
  return null;
}

/** pearson_correlation: one lower-triangle heatmap; non-significant cells are greyed. */
export function buildCorrelationChart(r: any, alpha = ALPHA): MipChart[] {
  const c = pickMatrix(r, 'correlations');
  const v: string[] = Array.isArray(c?.variables) ? c.variables.map(String) : [];
  const n = v.length;
  if (n < 2) return [];
  // Backwards compatibility: saved Pearson results may use historical p-value and CI aliases.
  const pv = pickMatrix(r, 'p_values', 'p-values', 'pvalues');
  const lo = pickMatrix(r, 'ci_lo', 'low_confidence_intervals');
  const hi = pickMatrix(r, 'ci_hi', 'high_confidence_intervals');
  const at = (m: any, i: number, j: number) => num(m?.[v[i]]?.[j]);

  const cells: { i: number; j: number; r: number; p: number; lo: number; hi: number }[] = [];
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < i; j++) {
      const x = at(c, i, j);
      if (Number.isFinite(x)) cells.push({ i, j, r: x, p: at(pv, i, j), lo: at(lo, i, j), hi: at(hi, i, j) });
    }
  }
  if (!cells.length) return [];
  // Without p-values every cell is treated as significant rather than greyed.
  const isSig = (x: { p: number }) => !Number.isFinite(x.p) || x.p < alpha;
  const data = cells.map((x) => ({
    value: [x.j, x.i - 1, x.r], cell: x,
    itemStyle: { color: isSig(x) ? diverge(x.r, 1) : NS_CELL, borderColor: '#fff', borderWidth: 2 },
    label: { color: isSig(x) ? inkOn(x.r, 1) : NS },
  }));

  const sig = cells.filter(isSig);
  const top = [...cells].sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
  const allPos = sig.length === cells.length && cells.every((x) => x.r > 0);
  const maxP = Math.max(...sig.map((x) => (Number.isFinite(x.p) ? x.p : 0)));
  const caption = [
    allPos
      ? `All ${cells.length} pairs are positively correlated and significant (${maxP < 0.001 ? 'p < 0.001' : `p < ${alpha}`}).`
      : `${sig.length} of ${cells.length} pairs are significantly correlated (p < ${alpha}).`,
    `${v[top.i]} and ${v[top.j]} are the most strongly related (r = ${top.r.toFixed(2)})${Math.abs(top.r) >= 0.9 ? ', nearly redundant, so avoid putting both in one model' : ''}.`,
  ].join(' ');

  const nObs = r?.n_obs;
  return [base({
    tooltip: {
      ...tip,
      formatter: (q: any) => {
        const x = q.data.cell;
        const ci = Number.isFinite(x.lo) ? ` (95% CI ${x.lo.toFixed(2)} – ${x.hi.toFixed(2)})` : '';
        return `${esc(v[x.i])}<br/>× ${esc(v[x.j])}<br/>r = <b>${x.r.toFixed(3)}</b>${ci}<br/>p ${fp(x.p)}${nObs != null ? ` · n = ${esc(nObs)}` : ''}`;
      },
    } as any,
    visualMap: heatmapVisual as any,
    grid: { left: 170, right: 30, top: 50, bottom: 110 },
    xAxis: { type: 'category', data: v.slice(0, n - 1).map(short), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: INK, fontSize: 11, rotate: 35, interval: 0, width: 140, overflow: 'truncate' } },
    yAxis: { type: 'category', data: v.slice(1).map(short), inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: INK, fontSize: 11, interval: 0, width: 156, overflow: 'truncate' } },
    graphic: [
      { type: 'rect', right: 50, top: 12, shape: { width: 140, height: 10, r: 2 }, style: { fill: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: OR }, { offset: 0.5, color: '#ffffff' }, { offset: 1, color: B }] }, stroke: '#E2E8F0' } },
      { type: 'text', right: 196, top: 11, style: { text: '−1', fill: MUT, fontSize: 10, fontFamily: FONT } },
      { type: 'text', right: 30, top: 11, style: { text: '+1', fill: MUT, fontSize: 10, fontFamily: FONT } },
      { type: 'text', right: 50, top: 28, style: { text: `grey = p ≥ ${alpha}`, fill: MUT, fontSize: 10, fontFamily: FONT } },
    ] as any,
    series: [{ type: 'heatmap', data, label: { show: true, fontFamily: MONO, fontSize: 12, formatter: (q: any) => q.value[2].toFixed(2) }, emphasis: { itemStyle: { borderColor: INK, borderWidth: 1 } } }] as any,
    mipTitle: 'Correlation matrix',
    mipMeta: nObs != null ? `Pearson r · n = ${nObs}` : undefined,
    mipCaption: caption,
    mipChartHeight: Math.max(260, (n - 1) * 44 + 160),
  })];
}

/** pca / pca_with_transformation: scree plot and, with two or more components, a correlation circle. */
export function buildPcaCharts(r: any): MipChart[] {
  const ev: number[] = (r?.eigenvalues ?? r?.eigen_vals ?? []).map(num);
  const V: number[][] = r?.eigenvectors ?? r?.eigen_vecs ?? [];
  if (!ev.length || !ev.every(Number.isFinite)) return [];
  const tot = ev.reduce((a, b) => a + b, 0);
  let cum = 0;
  const cumP = ev.map((x) => (cum += x) / tot * 100);
  const kaiser = ev.filter((x) => x >= 1).length;
  const share = (i: number) => (ev[i] / tot * 100).toFixed(1);

  const scree: MipChart = base({
    tooltip: { ...tip, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps: any) => { const i = ps[0].dataIndex; return `<b>PC${i + 1}</b><br/>Eigenvalue ${ev[i].toFixed(2)}<br/>Explains ${share(i)}%<br/>Cumulative ${cumP[i].toFixed(1)}%`; } } as any,
    legend: { top: 0, left: 'center', itemWidth: 12, itemHeight: 8, textStyle: { color: MUT, fontSize: 11 }, data: ['Eigenvalue', 'Cumulative % variance'] },
    grid: { left: 50, right: 50, top: 36, bottom: 36 },
    xAxis: ax({ type: 'category', data: ev.map((_, i) => `PC${i + 1}`), splitLine: { show: false }, axisLabel: { color: INK, fontSize: 11 } }),
    yAxis: [
      ax({ type: 'value', name: 'Eigenvalue', nameTextStyle: { color: MUT, fontSize: 11, align: 'left' } }),
      ax({ type: 'value', min: 0, max: 100, name: 'Cumulative %', splitLine: { show: false }, axisLabel: { color: MUT, fontSize: 11, formatter: '{value}%' }, nameTextStyle: { color: MUT, fontSize: 11, align: 'right' } }),
    ],
    series: [
      {
        name: 'Eigenvalue', type: 'bar', barWidth: '46%', itemStyle: { color: B },
        data: ev.map((x) => ({ value: x, itemStyle: { color: x >= 1 ? B : LB, borderRadius: [4, 4, 0, 0] } })),
        label: { show: ev.length <= 12, position: 'top', color: INK, fontFamily: MONO, fontSize: 11, formatter: (q: any) => `${(q.value / tot * 100).toFixed(1)}%` },
        markLine: { silent: true, symbol: 'none', data: [{ yAxis: 1 }], lineStyle: { color: ORD, type: 'dashed' }, label: { formatter: 'Kaiser λ = 1', position: 'insideEndTop', color: ORD, fontSize: 11 } },
      },
      { name: 'Cumulative % variance', type: 'line', yAxisIndex: 1, data: cumP, symbol: 'circle', symbolSize: 6, lineStyle: { color: INK, width: 1.5 }, itemStyle: { color: INK } },
    ] as any,
    mipTitle: 'Scree plot',
    mipMeta: r?.n_obs != null ? `n = ${r.n_obs}` : undefined,
    mipCaption: [
      `PC1 explains ${share(0)}% of the variance${kaiser === 1 ? ' and is the only component with an eigenvalue above 1' : `; ${kaiser} components have an eigenvalue above 1`}.`,
      ev.length > 1 ? `PC1 and PC2 together reach ${cumP[1].toFixed(1)}%.` : '',
    ].filter(Boolean).join(' '),
    mipChartHeight: 260,
  });

  const nv = V[0]?.length ?? 0;
  if (V.length < 2 || !nv) return [scree];
  const given: string[] = Array.isArray(r?.variable_names) ? r.variable_names.map(String) : [];
  const names = Array.from({ length: nv }, (_, j) => given[j] ?? `Var${j + 1}`);
  const pts = names.map((name, j) => [num(V[0][j]) * Math.sqrt(ev[0]), num(V[1][j]) * Math.sqrt(ev[1]), short(name)] as [number, number, string]);
  const order = pts.map((_, i) => i).sort((a, b) => pts[b][1] - pts[a][1]);
  const circ = Array.from({ length: 121 }, (_, i) => [Math.cos(i / 120 * 2 * Math.PI), Math.sin(i / 120 * 2 * Math.PI)]);

  const pc1 = pts.filter((p) => Math.abs(p[0]) >= 0.5);
  const pc2Top = [...pts].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  const sameSign = pc1.length > 1 && pc1.every((p) => Math.sign(p[0]) === Math.sign(pc1[0][0]));

  const circle: MipChart = base({
    tooltip: { ...tip, trigger: 'item', formatter: (q: any) => (q.seriesIndex === 2 ? `<b>${esc(q.value[2])}</b><br/>PC1 loading ${q.value[0].toFixed(2)}<br/>PC2 loading ${q.value[1].toFixed(2)}` : '') } as any,
    grid: { left: 190, top: 16, width: 300, height: 300 },
    xAxis: ax({ type: 'value', min: -1.1, max: 1.1, interval: 0.5, name: `PC1 (${share(0)}%)`, nameLocation: 'middle', nameGap: 26, axisLabel: { show: false } }),
    yAxis: ax({ type: 'value', min: -1.1, max: 1.1, interval: 0.5, name: `PC2 (${share(1)}%)`, nameLocation: 'middle', nameGap: 26, axisLabel: { show: false } }),
    series: [
      { type: 'line', data: circ, showSymbol: false, silent: true, lineStyle: { color: AXIS, type: 'dashed', width: 1 } },
      {
        type: 'custom', data: pts, silent: true, encode: { x: 0, y: 1 },
        renderItem: (_p: any, api: any) => {
          const o = api.coord([0, 0]);
          const e = api.coord([api.value(0), api.value(1)]);
          return { type: 'line', shape: { x1: o[0], y1: o[1], x2: e[0], y2: e[1] }, style: { stroke: B, lineWidth: 2 } };
        },
      },
      {
        type: 'scatter', data: pts, symbolSize: 7, itemStyle: { color: B },
        label: { show: true, formatter: (q: any) => q.value[2], color: INK, fontSize: 11, fontFamily: FONT, width: 140, overflow: 'truncate' },
        labelLine: { show: true, lineStyle: { color: AXIS, width: 1 } },
        labelLayout: (q: any) => ({ x: 150, y: 36 + order.indexOf(q.dataIndex) * (270 / Math.max(1, order.length - 1)), align: 'right', verticalAlign: 'middle' }),
      },
    ] as any,
    mipTitle: 'Correlation circle (PC1 × PC2)',
    mipCaption: [
      pc1.length ? `${pc1.length} of ${nv} variables load strongly on PC1${sameSign ? ', all in the same direction, so PC1 reads as their common level' : ''}.` : 'No variable loads strongly (|loading| ≥ 0.5) on PC1.',
      `PC2 is driven most by ${pc2Top[2]} (loading ${pc2Top[1].toFixed(2)}).`,
    ].join(' '),
    mipChartHeight: 360,
  });

  return [scree, circle];
}
