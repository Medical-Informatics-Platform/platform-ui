import {
  ALPHA, B, FONT, INK, LB, MONO, MUT, MipChart, ax, base, catAx, diverge, esc, fmtN, heatmapVisual, inkOn, num, pText, pct,
  sum, tip,
} from '../chart-theme';

/**
 * Observed table, rows = x_labels, columns = y_labels (the orientation of `expected`).
 * exaflow does not send it yet; until it does, these charts return nothing and the tables stand alone.
 */
function observed(r: any, rows: number, cols: number): number[][] | null {
  const o = r?.observed;
  if (!Array.isArray(o) || o.length !== rows) return null;
  const m = o.map((row: unknown[]) => (Array.isArray(row) ? row.map(num) : []));
  return m.every((row: number[]) => row.length === cols && row.every(Number.isFinite)) ? m : null;
}

/** chi_squared: standardised residual (O − E) / √E per cell. */
export function buildChiSquaredChart(r: any, alpha = ALPHA): MipChart[] {
  const xs: string[] = (r?.x_labels ?? []).map(String);
  const ys: string[] = (r?.y_labels ?? []).map(String);
  const E: number[][] = Array.isArray(r?.expected) ? r.expected.map((row: unknown[]) => row.map(num)) : [];
  const O = observed(r, xs.length, ys.length);
  if (!O || E.length !== xs.length) return [];
  const data: any[] = [];
  O.forEach((row, i) => row.forEach((o, j) => {
    const e = E[i][j];
    const res = e > 0 ? (o - e) / Math.sqrt(e) : 0;
    data.push({ value: [j, i, res], o, e, itemStyle: { color: diverge(res, 6), borderColor: '#fff', borderWidth: 3 }, label: { color: inkOn(res, 6) } });
  }));
  const top = [...data].sort((a, b) => Math.abs(b.value[2]) - Math.abs(a.value[2]))[0];
  const p = num(r?.p_value);
  const caption = [
    `The association is ${p < alpha ? '' : 'not '}significant (χ² = ${fmtN(num(r?.chi2))}, df = ${r?.dof ?? '—'}, ${pText(p)}).`,
    `The biggest departure is ${xs[top.value[1]]} · ${ys[top.value[0]]}: ${top.o} observed vs ${Math.round(top.e)} expected (${top.value[2] > 0 ? 'more' : 'fewer'} than chance).`,
  ].join(' ');

  return [base({
    tooltip: { ...tip, formatter: (q: any) => `${esc(xs[q.value[1]])} · ${esc(ys[q.value[0]])}<br/>observed ${q.data.o} · expected ${fmtN(q.data.e, 1)}<br/>standardised residual ${q.value[2] >= 0 ? '+' : ''}${q.value[2].toFixed(2)}` } as any,
    visualMap: heatmapVisual as any,
    grid: { left: 150, right: 20, top: 30, bottom: 44 },
    xAxis: { type: 'category', position: 'top', data: ys, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: INK, fontSize: 12, fontWeight: 600, interval: 0 } },
    yAxis: catAx(xs, { axisLabel: { color: INK, fontSize: 12, width: 136, overflow: 'truncate', fontFamily: FONT } }),
    graphic: [{ type: 'text', left: 150, bottom: 14, style: { text: 'Blue = more than expected · Orange = fewer · |residual| > 2 is notable', fill: MUT, fontSize: 11, fontFamily: FONT } }] as any,
    series: [{
      type: 'heatmap', data,
      label: {
        show: true,
        formatter: (q: any) => `{a|${q.data.o}}\n{b|exp ${Math.round(q.data.e)} · ${q.value[2] >= 0 ? '+' : ''}${q.value[2].toFixed(1)}}`,
        rich: { a: { fontSize: 15, fontWeight: 600, fontFamily: FONT, lineHeight: 20 }, b: { fontSize: 10.5, fontFamily: MONO, lineHeight: 14 } },
      },
    }] as any,
    mipTitle: 'Observed vs expected',
    mipMeta: `n = ${sum(O.flat())}`,
    mipCaption: caption,
    mipChartHeight: Math.max(200, xs.length * 60 + 90),
  })];
}

/** fisher_exact: share of the first y level within each x level, with the odds ratio. */
export function buildFisherExactChart(r: any, alpha = ALPHA): MipChart[] {
  const xs: string[] = (r?.x_labels ?? []).map(String);
  const ys: string[] = (r?.y_labels ?? []).map(String);
  const O = xs.length === 2 && ys.length === 2 ? observed(r, 2, 2) : null;
  if (!O) return [];
  const share = O.map((row) => row[0] / (sum(row) || 1));
  const or = num(r?.odds_ratio);
  const p = num(r?.p_value);
  const caption = `${pct(share[0])} of ${xs[0]} have ${ys[0]}, compared with ${pct(share[1])} of ${xs[1]} (odds ratio ${fmtN(or)}, ${pText(p)}).`;

  return [base({
    tooltip: { ...tip, trigger: 'item', formatter: (q: any) => `${esc(xs[q.dataIndex])}<br/>${esc(ys[0])}: ${O[q.dataIndex][0]} of ${sum(O[q.dataIndex])} (${(q.value * 100).toFixed(1)}%)` } as any,
    grid: { left: 170, right: 60, top: 10, bottom: 70 },
    xAxis: ax({ type: 'value', min: 0, max: 1, name: `Share with ${ys[0]}`, nameLocation: 'middle', nameGap: 26, axisLabel: { color: MUT, fontSize: 11, formatter: (v: number) => `${Math.round(v * 100)}%` } }),
    yAxis: catAx(xs.map((x, i) => `${x}  n=${sum(O[i])}`), { axisLabel: { color: INK, fontSize: 12, width: 156, overflow: 'truncate', fontFamily: FONT } }),
    graphic: [{ type: 'text', left: 170, bottom: 8, style: { text: `Odds ratio ${fmtN(or)} · Fisher's exact p ${p < 0.001 ? '<0.001' : p.toFixed(3)}`, fill: p < alpha ? B : MUT, fontSize: 12.5, fontWeight: 600, fontFamily: FONT } }] as any,
    series: [{
      type: 'bar', barWidth: 22, data: share.map((v, i) => ({ value: v, itemStyle: { color: i === 0 ? B : LB } })),
      itemStyle: { borderRadius: [0, 4, 4, 0] }, showBackground: true, backgroundStyle: { color: '#F1F5F9', borderRadius: 4 },
      label: { show: true, position: 'right', fontFamily: MONO, fontSize: 12, color: INK, formatter: (q: any) => pct(q.value) },
    }] as any,
    mipTitle: 'Outcome share per group',
    mipCaption: caption,
    mipChartHeight: 170,
  })];
}
