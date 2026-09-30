import { B, FONT, INK, LB, MONO, MUT, MipChart, SLATE6, ax, base, catAx, diverge, esc, fmtN, inkOn, listText, num, tip, heatmapVisual } from '../chart-theme';

/** "400-449" → 424.5, "<10" → 5, "0" → 0: a bar length for a privacy-rounded count. */
function intervalMid(s: string): number {
  const range = String(s).match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const below = String(s).match(/^<\s*(\d+)$/);
  return below ? Number(below[1]) / 2 : num(s);
}

/** kmeans: cluster profile heatmap with size bars, plus the elbow curve when k was chosen by elbow. */
export function buildKMeansChart(out: any): MipChart[] {
  const clusters: any[] = Array.isArray(out?.clusters) ? out.clusters : [];
  const vars: string[] = Array.isArray(out?.variables) ? out.variables.map(String) : [];
  if (!clusters.length || !vars.length) return [];

  const raw = clusters.map((c) => vars.map((v) => num(c?.center?.[v])));
  // (centre − overall mean) / overall SD when exaflow sends them; otherwise each centre is
  // standardised against the other centres (unweighted), which the caption says.
  const overall = vars.every((v) => Number.isFinite(num(out?.overall_mean?.[v])) && num(out?.overall_std?.[v]) > 0);
  const z = raw.map((row) => row.map((x, j) => {
    if (overall) return (x - num(out.overall_mean[vars[j]])) / num(out.overall_std[vars[j]]);
    const col = raw.map((r) => r[j]).filter(Number.isFinite);
    const m = col.reduce((a, b) => a + b, 0) / col.length;
    const sd = Math.sqrt(col.reduce((s, y) => s + (y - m) ** 2, 0) / col.length);
    return sd > 0 ? (x - m) / sd : 0;
  }));
  const versus = overall ? 'the overall mean' : 'the other centres';
  const labels = clusters.map((c, i) => String(c?.label ?? `Cluster ${i + 1}`));
  const sizes = clusters.map((c) => intervalMid(c?.size_interval));
  const N = sizes.filter(Number.isFinite).reduce((a, b) => a + b, 0);

  const data: any[] = [];
  z.forEach((row, i) => row.forEach((v, j) => data.push({
    value: [j, i, v], raw: raw[i][j],
    itemStyle: { color: diverge(v, 1.5), borderColor: '#fff', borderWidth: 2 }, label: { color: inkOn(v, 1.5) },
  })));

  const sentences = z.map((row, i) => {
    const hi = vars.filter((_, j) => row[j] >= 0.8);
    const lo = vars.filter((_, j) => row[j] <= -0.8);
    if (!hi.length && !lo.length) return `${labels[i]} is close to the middle on every variable.`;
    return `${labels[i]} is ${[hi.length ? `high on ${listText(hi)}` : '', lo.length ? `low on ${listText(lo)}` : ''].filter(Boolean).join(' and ')}.`;
  });

  const profile: MipChart = base({
    tooltip: {
      ...tip,
      formatter: (q: any) => q.seriesIndex === 0
        ? `${esc(labels[q.value[1]])} · ${esc(vars[q.value[0]])}<br/>centre ${fmtN(q.data.raw, 3)}<br/>${q.value[2] >= 0 ? '+' : ''}${q.value[2].toFixed(2)} SD vs ${versus}`
        : `${esc(q.name)}: n ${esc(clusters[q.dataIndex]?.size_interval)}`,
    } as any,
    visualMap: heatmapVisual as any,
    grid: [{ left: 90, right: '24%', top: 10, bottom: 70 }, { right: 60, width: '16%', top: 10, bottom: 70 }],
    xAxis: [
      { type: 'category', data: vars, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: INK, fontSize: 11, interval: 0, rotate: 25, width: 120, overflow: 'truncate' } },
      ax({ gridIndex: 1, type: 'value', max: (N || 1) * 0.6, axisLabel: { show: false }, splitLine: { show: false }, name: 'Cluster size', nameLocation: 'middle', nameGap: 16 }),
    ],
    yAxis: [
      catAx(labels, { axisLabel: { color: INK, fontSize: 12, fontWeight: 600, fontFamily: FONT } }),
      catAx(labels, { gridIndex: 1, show: false }),
    ],
    series: [
      { type: 'heatmap', data, label: { show: true, fontFamily: MONO, fontSize: 12, formatter: (q: any) => (q.value[2] > 0 ? '+' : '') + q.value[2].toFixed(2) } },
      {
        type: 'bar', xAxisIndex: 1, yAxisIndex: 1, barWidth: 18, data: labels.map((name, i) => ({ name, value: sizes[i] })), itemStyle: { color: LB, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', fontFamily: MONO, fontSize: 11.5, color: INK, formatter: (q: any) => `${clusters[q.dataIndex]?.size_interval ?? ''}${N ? ` (~${Math.round(q.value / N * 100)}%)` : ''}` },
      },
    ] as any,
    mipTitle: 'Cluster profiles',
    mipMeta: `${clusters.length} clusters · ${vars.length} variables${out?.n_obs_interval ? ` · n ${out.n_obs_interval}` : ''}`,
    mipCaption: [...sentences.slice(0, 2), `Cells compare each centre with ${versus}, in SD units.`].join(' '),
    mipChartHeight: Math.max(200, clusters.length * 48 + 110),
  });

  const inertia = out?.elbow?.inertia_by_k;
  if (!inertia || typeof inertia !== 'object') return [profile];
  const ks = Object.keys(inertia).sort((a, b) => Number(a) - Number(b));
  const sel = Number(out.elbow.selected_k);
  const drop = (i: number) => Math.round((1 - num(inertia[ks[i]]) / num(inertia[ks[i - 1]])) * 100);
  const iSel = ks.findIndex((k) => Number(k) === sel);

  const elbow: MipChart = base({
    tooltip: { ...tip, trigger: 'item', formatter: (q: any) => `k = ${esc(ks[q.dataIndex])}<br/>inertia ${fmtN(q.value, 1)}` } as any,
    grid: { left: 56, right: 20, top: 24, bottom: 36 },
    xAxis: ax({ type: 'category', data: ks, name: 'k', nameLocation: 'middle', nameGap: 22, splitLine: { show: false } }),
    yAxis: ax({ type: 'value', name: 'Inertia', axisLabel: { color: MUT, fontSize: 10, formatter: (v: number) => fmtN(v, 1) } }),
    series: [{
      type: 'line', symbol: 'circle', lineStyle: { color: SLATE6, width: 1.5 },
      data: ks.map((k) => ({ value: num(inertia[k]), symbolSize: Number(k) === sel ? 12 : 6, itemStyle: { color: Number(k) === sel ? B : SLATE6 } })),
      label: { show: true, position: 'top', fontSize: 10, color: MUT, formatter: (q: any) => (q.dataIndex === 0 ? '' : `−${drop(q.dataIndex)}%`) },
    }] as any,
    mipTitle: 'Elbow curve',
    mipCaption: iSel > 0
      ? `k = ${sel} was selected. Going from ${ks[iSel - 1]} to ${sel} clusters cuts inertia by ${drop(iSel)}%${iSel + 1 < ks.length ? `; the next step cuts only ${drop(iSel + 1)}%` : ''}.`
      : `k = ${sel} was selected.`,
    mipChartHeight: 170,
  });
  return [profile, elbow];
}
