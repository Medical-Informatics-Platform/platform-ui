import {
  ALPHA, AXIS, B, FONT, INK, LB, MONO, MUT, MipChart, NS, OR, ORD, SLATE6, ax, base, catAx, esc, fmtN, fp, isNum,
  forest, listText, num, pText, pct, tip,
} from '../chart-theme';
import { qtukey } from '../studentized-range';

const dWord = (d: number) => (d < 0.2 ? 'negligible' : d < 0.5 ? 'small' : d < 0.8 ? 'medium' : 'large');

/** ttest_*: estimation plot (difference + CI band vs 0) over a Cohen's d magnitude strip. */
export function buildTTestChart(r: any, alpha = ALPHA): MipChart[] {
  const diff = num(r?.mean_diff);
  if (!Number.isFinite(diff)) return [];
  const p = isNum(r?.p_value) ? num(r.p_value) : num(r?.p);
  const lo = num(r?.ci_lower);
  const hi = num(r?.ci_upper);
  const d = num(r?.cohens_d);
  const df = num(r?.df);
  const t = [r?.statistic, r?.t_stat, r?.t_value].map(num).find(Number.isFinite) ?? NaN;
  const y = r?.y ? String(r.y) : '';

  // The axis always shows 0; a one-sided test has an open bound, drawn to the axis edge.
  const finite = [0, diff, lo, hi].filter(Number.isFinite);
  const span = Math.max(...finite) - Math.min(...finite) || Math.abs(diff) || 1;
  const xmin = Math.min(...finite) < 0 ? Math.min(...finite) - span * 0.15 : 0;
  const xmax = Math.max(...finite) > 0 ? Math.max(...finite) + span * 0.15 : 0;
  // Enough decimals that small differences don't round to repeated labels.
  const dg = Math.min(4, Math.max(2, Math.ceil(-Math.log10(span)) + 1));
  const f = (v: number) => fmtN(v, dg);
  const loDraw = Number.isFinite(lo) ? lo : xmin;
  const hiDraw = Number.isFinite(hi) ? hi : xmax;
  const ciText = `${Number.isFinite(lo) ? f(lo) : '−∞'} – ${Number.isFinite(hi) ? f(hi) : '∞'}`;
  const sig = p < alpha;
  const dAbs = Math.abs(d);

  const series: any[] = [{
    type: 'custom', xAxisIndex: 0, yAxisIndex: 0, data: [[diff, loDraw, hiDraw]], encode: { x: [0, 1, 2], y: -1 },
    tooltip: { formatter: () => `Mean difference <b>${fmtN(diff, 3)}</b><br/>95% CI ${ciText}<br/>${Number.isFinite(t) ? `t${Number.isFinite(df) ? `(${fmtN(df, 0)})` : ''} = ${fmtN(t)}, ` : ''}p ${fp(p)}` },
    renderItem: (_p: any, api: any) => {
      const [x, yy] = api.coord([api.value(0), 0]);
      const xl = api.coord([api.value(1), 0])[0];
      const xh = api.coord([api.value(2), 0])[0];
      return {
        type: 'group', children: [
          { type: 'rect', shape: { x: xl, y: yy - 9, width: Math.max(2, xh - xl), height: 18 }, style: { fill: 'rgba(43,51,233,.14)' } },
          { type: 'rect', shape: { x: x - 6, y: yy - 6, width: 12, height: 12 }, style: { fill: sig ? B : '#fff', stroke: sig ? B : NS, lineWidth: 2 } },
          { type: 'text', style: { text: `${f(diff)}  (p ${fp(p)})`, x: x + 12, y: yy - 22, fill: INK, font: `600 12px ${FONT}` } },
        ],
      };
    },
    markLine: { silent: true, symbol: 'none', data: [{ xAxis: 0 }], lineStyle: { color: SLATE6, width: 1, type: 'solid' }, label: { show: false } },
  }];
  if (Number.isFinite(d)) {
    series.push({
      type: 'scatter', xAxisIndex: 1, yAxisIndex: 1, data: [[Math.min(dAbs, 1.5), 0]], symbol: 'triangle', symbolRotate: 180, symbolSize: 14, symbolOffset: [0, -14], itemStyle: { color: B },
      tooltip: { formatter: () => `Cohen's d ${fmtN(d)} (${dWord(dAbs)})` },
      label: { show: true, position: 'top', distance: 4, formatter: `d = ${fmtN(d)}`, color: INK, fontWeight: 600, fontSize: 12 },
      markArea: {
        silent: true,
        data: ([[0, 0.2, 'negligible', '#F1F5F9'], [0.2, 0.5, 'small', '#DDE3FB'], [0.5, 0.8, 'medium', '#B4C3F4'], [0.8, 1.5, 'large', LB]] as const)
          .map(([a, b, n, c]) => [{ xAxis: a, name: n, itemStyle: { color: c } }, { xAxis: b }]),
        label: { show: true, position: 'inside', color: INK, fontSize: 11, fontFamily: FONT },
      },
    });
  }

  const caption = [
    `The mean${y ? ` ${y}` : ''} difference is ${f(diff)} (95% CI ${ciText}, ${pText(p)}).`,
    Number.isFinite(d) ? `Cohen's d = ${fmtN(d)} is a ${dWord(dAbs)} effect${dAbs > 1.5 ? ', beyond the end of the strip' : ''}.` : '',
    sig ? '' : 'The data are compatible with no difference.',
  ].filter(Boolean).join(' ');

  return [base({
    tooltip: { ...tip, trigger: 'item' } as any,
    grid: [{ left: 150, right: 40, top: 20, height: 56 }, { left: 150, right: 40, top: 150, height: 34 }],
    xAxis: [
      ax({ gridIndex: 0, type: 'value', min: xmin, max: xmax, name: `Mean difference (95% CI)${y ? ` — ${y}` : ''} · 0 = no difference`, nameLocation: 'middle', nameGap: 28, axisLabel: { color: MUT, fontSize: 11, formatter: f } }),
      ax({ gridIndex: 1, type: 'value', min: 0, max: 1.5, interval: 0.25, name: "Effect size (|Cohen's d|)", nameLocation: 'middle', nameGap: 28, splitLine: { show: false }, axisLabel: { color: MUT, fontSize: 11, formatter: (v: number) => v.toFixed(2) } }),
    ],
    yAxis: [catAx(['Difference'], { gridIndex: 0 }), catAx(['Magnitude'], { gridIndex: 1 })],
    series,
    mipTitle: 'Mean difference and effect size',
    mipCaption: caption,
    mipChartHeight: 230,
  })];
}

/** anova_oneway: group means with ± 1 SD whiskers (exaflow's ci_info is mean ∓ sample SD, not a CI). */
export function buildMeanPlotChart(r: any, alpha = ALPHA): MipChart[] {
  const ci = r?.ci_info;
  if (!ci?.means || !ci['m-s'] || !ci['m+s']) return [];
  const data = Object.keys(ci.means).map((g) => ({ g, mean: num(ci.means[g]), lo: num(ci['m-s'][g]), hi: num(ci['m+s'][g]) }))
    .filter((x) => [x.mean, x.lo, x.hi].every(Number.isFinite));
  if (!data.length) return [];
  const xLabel = r?.anova_table?.x_label ?? 'Group';
  const yLabel = r?.anova_table?.y_label ?? 'Mean';
  const p = isNum(r?.anova_table?.p_value) ? num(r.anova_table.p_value) : num(r?.p_value);
  const F = isNum(r?.anova_table?.f_stat) ? num(r.anova_table.f_stat) : num(r?.f_stat);
  const minY = Math.min(...data.map((x) => x.lo));
  const maxY = Math.max(...data.map((x) => x.hi));
  const m = Math.max(1e-6, maxY - minY) * 0.1;

  const sorted = [...data].sort((a, b) => b.mean - a.mean);
  const tukey: any[] = Array.isArray(r?.tuckey_test) ? r.tuckey_test : [];
  const tSig = tukey.filter((x) => num(x?.p_tuckey) < alpha);
  const caption = [
    `${p < alpha ? 'Group means differ' : 'Group means do not clearly differ'} (${Number.isFinite(F) ? `F = ${fmtN(F)}, ` : ''}${pText(p)}).`,
    `${sorted[0].g} has the highest mean ${yLabel} (${fmtN(sorted[0].mean)}) and ${sorted[sorted.length - 1].g} the lowest (${fmtN(sorted[sorted.length - 1].mean)}).`,
    tukey.length > 1 ? `${tSig.length} of ${tukey.length} Tukey pairwise comparisons are significant.` : '',
  ].filter(Boolean).join(' ');

  return [base({
    legend: { top: 0, left: 'center', itemWidth: 18, itemHeight: 10, textStyle: { color: MUT, fontSize: 11 }, data: ['Group mean', 'Mean ± 1 SD'] },
    grid: { top: 40, right: 32, bottom: 56, left: 80 },
    tooltip: {
      ...tip, trigger: 'item',
      formatter: (q: any) => {
        const x = data[q.dataIndex];
        return x ? `<b>${esc(x.g)}</b><br/>Mean ${fmtN(x.mean, 3)}<br/>± 1 SD ${fmtN(x.lo, 3)} – ${fmtN(x.hi, 3)}` : '';
      },
    } as any,
    xAxis: ax({ type: 'category', data: data.map((x) => x.g), name: xLabel, nameLocation: 'middle', nameGap: 32, splitLine: { show: false }, axisLabel: { color: INK, fontSize: 12 } }),
    yAxis: ax({ type: 'value', name: yLabel, nameLocation: 'middle', nameGap: 52, min: minY - m, max: maxY + m, axisLine: { show: false }, axisLabel: { color: MUT, fontSize: 11, showMinLabel: false, showMaxLabel: false, formatter: (v: number) => fmtN(v, 1) } }),
    series: [
      {
        name: 'Group mean', type: 'scatter', data: data.map((x) => [x.g, x.mean]), symbolSize: 12, itemStyle: { color: B, borderColor: '#fff', borderWidth: 2 }, z: 3,
        label: { show: true, position: 'right', distance: 10, color: INK, fontFamily: MONO, fontSize: 11.5, formatter: (q: any) => fmtN(q.value[1]) },
      },
      {
        name: 'Mean ± 1 SD', type: 'custom', encode: { x: 0, y: [1, 2] }, itemStyle: { color: LB },
        data: data.map((x, i) => [i, x.lo, x.hi]),
        renderItem: (_p: any, api: any) => {
          const i = api.value(0);
          const x = api.coord([i, api.value(1)])[0];
          const lo = api.coord([i, api.value(1)])[1];
          const hi = api.coord([i, api.value(2)])[1];
          const cw = Math.max(12, Math.min(30, api.size([1, 0])[0] * 0.36));
          const st = { stroke: LB, lineWidth: 3 };
          return {
            type: 'group', children: [
              { type: 'line', shape: { x1: x, y1: lo, x2: x, y2: hi }, style: st },
              { type: 'line', shape: { x1: x - cw / 2, y1: hi, x2: x + cw / 2, y2: hi }, style: st },
              { type: 'line', shape: { x1: x - cw / 2, y1: lo, x2: x + cw / 2, y2: lo }, style: st },
            ],
          };
        },
      },
    ] as any,
    mipTitle: 'Group means (± 1 SD)',
    mipCaption: caption,
    mipChartHeight: 320,
  })];
}

/**
 * anova_oneway: Tukey HSD pairwise differences with 95% simultaneous intervals,
 * diff ± q(0.95; k, df_residual) / √2 · se, where se is the SE of the difference.
 */
export function buildTukeyForest(r: any, alpha = ALPHA): MipChart[] {
  const pairs: any[] = Array.isArray(r?.tuckey_test) ? r.tuckey_test : [];
  const df = num(r?.anova_table?.df_residual ?? r?.df_residual);
  const groups = new Set(pairs.flatMap((x) => [String(x?.groupA), String(x?.groupB)]));
  if (!pairs.length || !Number.isFinite(df) || groups.size < 2) return [];
  const half = qtukey(0.95, groups.size, df) / Math.SQRT2;
  const rows = pairs
    .map((x) => {
      const d = num(x?.diff);
      const se = num(x?.se);
      return { label: `${x?.groupA} − ${x?.groupB}`, est: d, lo: d - half * se, hi: d + half * se, p: num(x?.p_tuckey) };
    })
    .filter((x) => [x.est, x.lo, x.hi].every(Number.isFinite));
  if (!rows.length) return [];
  const y = String(r?.anova_table?.y_label ?? 'outcome');
  const sig = rows.filter((x) => x.p < alpha);
  const top = [...rows].sort((a, b) => Math.abs(b.est) - Math.abs(a.est))[0];
  const caption = [
    sig.length === rows.length
      ? rows.length === 1 ? `The two groups differ (p < ${alpha}).` : `All ${rows.length} pairs differ (p < ${alpha}).`
      : sig.length ? `${listText(sig.map((x) => x.label))} differ${sig.length === 1 ? 's' : ''} (p < ${alpha}); the other pairs' intervals cross zero.` : `No pair differs at p < ${alpha}.`,
    `The largest gap is ${top.label}: ${fmtN(top.est)} ${y} (95% CI ${fmtN(top.lo)}–${fmtN(top.hi)}).`,
  ].join(' ');
  return [{
    ...forest({ rows, alpha, estHead: 'Δ', leftW: 180, xName: `Difference in group means, ${y} (Tukey 95% simultaneous CI)` }),
    mipTitle: 'Pairwise differences (Tukey HSD)',
    mipCaption: caption,
  }];
}

const etaText = (e: number) => e.toFixed(e < 0.01 ? 3 : 2);

/** anova_twoway: partial η² per term. Accepts list columns or dicts keyed by term. */
export function buildAnovaTwowayChart(r: any, alpha = ALPHA): MipChart[] {
  const col = (k: string, terms: string[]) => (Array.isArray(r?.[k]) ? r[k] : terms.map((t) => r?.[k]?.[t]));
  const allTerms: string[] = Array.isArray(r?.terms) ? r.terms : Object.keys(r?.sum_sq ?? {});
  const ss = col('sum_sq', allTerms).map(num);
  const iRes = allTerms.findIndex((t) => /^resid/i.test(t));
  if (iRes < 0 || !Number.isFinite(ss[iRes])) return [];
  const F = col('f_stat', allTerms).map(num);
  const P = col('f_pvalue', allTerms).map(num);
  const rows = allTerms
    .map((t, i) => ({ n: t.replace(/:/g, ' × '), eta: ss[i] / (ss[i] + ss[iRes]), F: F[i], p: P[i] }))
    .filter((_x, i) => i !== iRes && Number.isFinite(ss[i]));
  if (!rows.length) return [];
  const xmax = Math.max(0.2, Math.ceil(Math.max(...rows.map((x) => x.eta)) * 1.2 * 10) / 10);

  const bySize = [...rows].sort((a, b) => b.eta - a.eta);
  const sig = bySize.filter((x) => x.p < alpha);
  const ns = rows.filter((x) => !(x.p < alpha));
  const caption = [
    sig.length ? `${sig[0].n} explains the most variance (partial η² ${etaText(sig[0].eta)}, ${pText(sig[0].p)}).` : `No term is significant at p < ${alpha}.`,
    sig.length > 1 ? `${listText(sig.slice(1).map((x) => `${x.n} (${etaText(x.eta)})`))} ${sig.length > 2 ? 'are' : 'is'} also significant.` : '',
    ns.length && sig.length ? `${listText(ns.map((x) => x.n))} ${ns.length > 1 ? 'are' : 'is'} not significant.` : '',
  ].filter(Boolean).join(' ');

  return [base({
    tooltip: { ...tip, trigger: 'item', formatter: (q: any) => { const x = rows[q.dataIndex]; return `<b>${esc(x.n)}</b><br/>Partial η² ${x.eta.toFixed(3)}<br/>F = ${fmtN(x.F)}, p ${fp(x.p)}`; } } as any,
    grid: { left: 180, right: 200, top: 16, bottom: 44 },
    xAxis: ax({ type: 'value', min: 0, max: xmax, name: 'Partial η² (share of variance explained)', nameLocation: 'middle', nameGap: 28, axisLabel: { color: MUT, fontSize: 11, formatter: (v: number) => v.toFixed(2) } }),
    yAxis: [
      catAx(rows.map((x) => x.n), { axisLabel: { color: INK, fontSize: 12, width: 164, overflow: 'truncate', fontFamily: FONT } }),
      catAx(rows.map((x) => x.n), {
        position: 'right',
        axisLabel: {
          margin: 12,
          formatter: (_v: string, i: number) => `{a|F ${fmtN(rows[i].F)}}{${rows[i].p < alpha ? 's' : 'b'}|p ${fp(rows[i].p)}}`,
          rich: { a: { width: 72, fontFamily: MONO, fontSize: 11.5, color: MUT }, b: { width: 90, fontFamily: MONO, fontSize: 11.5, color: MUT }, s: { width: 90, fontFamily: MONO, fontSize: 11.5, color: B, fontWeight: 600 } },
        },
      }),
    ],
    series: [{
      type: 'bar', barWidth: 16, data: rows.map((x) => ({ value: x.eta, itemStyle: { color: x.p < alpha ? B : AXIS, borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', fontFamily: MONO, fontSize: 11.5, color: INK, formatter: (q: any) => q.value.toFixed(3) },
      markArea: {
        silent: true, itemStyle: { color: 'rgba(148,163,184,.08)' },
        data: [[{ xAxis: 0.01 }, { xAxis: 0.06, name: 'small' }], [{ xAxis: 0.06 }, { xAxis: 0.14, name: 'medium' }], [{ xAxis: 0.14 }, { xAxis: xmax, name: 'large' }]].filter((a) => (a[0].xAxis as number) < xmax),
        label: { position: 'insideTop', color: NS, fontSize: 10, distance: 0 },
      },
    }] as any,
    mipTitle: 'Effect size per term',
    mipCaption: caption,
    mipChartHeight: Math.max(180, rows.length * 40 + 60),
  })];
}

/** binned_mann_whitney_u_test: observed z on the standard normal null curve. */
export function buildMannWhitneyChart(r: any, alpha = ALPHA): MipChart[] {
  const z = num(r?.z_score);
  const p = num(r?.p_value);
  if (!Number.isFinite(z)) return [];
  const u = num(r?.u_stat);
  const n1 = num(r?.n1);
  const n2 = num(r?.n2);
  const zc = 1.959964;
  const lim = Math.max(4, Math.ceil(Math.abs(z) + 0.5));
  const pdf = (x: number) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  const xs = Array.from({ length: lim * 40 + 1 }, (_, i) => -lim + i * 0.05).map((x) => [x, pdf(x)]);
  const ps = u / (n1 * n2);

  const caption = [
    `The observed z = ${fmtN(z)} ${p < alpha ? 'falls in' : 'stays outside'} the shaded rejection region (${pText(p)}).`,
    Number.isFinite(ps) ? `A random value from group 1 is higher than one from group 2 ${pct(ps)} of the time; 50% would mean no difference.` : '',
  ].filter(Boolean).join(' ');

  return [base({
    grid: { left: 40, right: 40, top: 30, bottom: 44 },
    xAxis: ax({ type: 'value', min: -lim, max: lim, interval: 1, name: 'Standardised test statistic z', nameLocation: 'middle', nameGap: 28, splitLine: { show: false } }),
    yAxis: { type: 'value', show: false, max: 0.46 },
    series: [
      { type: 'line', data: xs, showSymbol: false, smooth: true, lineStyle: { color: SLATE6, width: 1.5 }, silent: true },
      { type: 'line', data: xs.filter((q) => q[0] <= -zc + 1e-9), showSymbol: false, lineStyle: { width: 0 }, areaStyle: { color: 'rgba(255,186,8,.45)' }, silent: true },
      { type: 'line', data: xs.filter((q) => q[0] >= zc - 1e-9), showSymbol: false, lineStyle: { width: 0 }, areaStyle: { color: 'rgba(255,186,8,.45)' }, silent: true },
      {
        type: 'scatter', data: [[z, pdf(z)]], symbolSize: 12, itemStyle: { color: p < alpha ? B : NS },
        label: { show: true, position: 'top', distance: 10, color: INK, fontWeight: 600, fontSize: 12, formatter: `z = ${fmtN(z)}  ·  p ${fp(p)}` },
        markLine: { silent: true, symbol: 'none', data: [{ xAxis: z }], lineStyle: { color: B, width: 2, type: 'solid' }, label: { show: false } },
      },
    ] as any,
    graphic: [{ type: 'text', left: 44, top: 32, style: { text: 'Shaded: two-sided 5% rejection region', fill: MUT, fontSize: 11, fontFamily: FONT } }] as any,
    mipTitle: 'Test statistic under the null',
    mipMeta: Number.isFinite(n1) && Number.isFinite(n2) ? `n₁ = ${n1} · n₂ = ${n2} · U = ${fmtN(u, 1)}` : undefined,
    mipCaption: caption,
    mipChartHeight: 200,
  })];
}

/** standardized_mean_difference: Love plot of |SMD| per comparison. */
export function buildSmdChart(r: any): MipChart[] {
  const rows = (Array.isArray(r?.comparisons) ? r.comparisons : [])
    .map((c: any) => ({ label: `${c?.group1} vs ${c?.group2}`, v: Math.abs(num(c?.smd)) }))
    .filter((x: { v: number }) => Number.isFinite(x.v));
  if (!rows.length) return [];
  const col = (v: number) => (v >= 0.2 ? ORD : v >= 0.1 ? OR : B);
  const xmax = Math.max(1, Math.ceil(Math.max(...rows.map((x: { v: number }) => x.v)) * 10) / 10);
  const bad = rows.filter((x: { v: number }) => x.v >= 0.2);
  const mid = rows.filter((x: { v: number }) => x.v >= 0.1 && x.v < 0.2);
  const ok = rows.length - bad.length - mid.length;
  const caption = [
    bad.length ? `${bad.length} of ${rows.length} comparisons are clearly imbalanced (|SMD| ≥ 0.2), largest ${bad.sort((a: any, b: any) => b.v - a.v)[0].label} (${bad[0].v.toFixed(2)}).` : `No comparison reaches |SMD| 0.2.`,
    mid.length ? `${mid.length} ${mid.length > 1 ? 'are' : 'is'} borderline (0.1–0.2).` : '',
    `${ok} ${ok === 1 ? 'is' : 'are'} balanced (below 0.1).`,
  ].filter(Boolean).join(' ');

  return [base({
    tooltip: { ...tip, trigger: 'item', formatter: (q: any) => `${esc(rows[q.dataIndex].label)}<br/>|SMD| ${rows[q.dataIndex].v.toFixed(2)}` } as any,
    grid: { left: 180, right: 50, top: 26, bottom: 44 },
    xAxis: ax({ type: 'value', min: 0, max: xmax, name: '|Standardised mean difference|', nameLocation: 'middle', nameGap: 28 }),
    yAxis: catAx(rows.map((x: { label: string }) => x.label), { splitLine: { show: true, lineStyle: { color: '#F1F5F9' } }, axisLabel: { color: INK, fontSize: 12, width: 164, overflow: 'truncate', fontFamily: FONT } }),
    series: [{
      type: 'scatter', symbolSize: 12, data: rows.map((x: { v: number; label: string }) => ({ value: [x.v, x.label], itemStyle: { color: col(x.v) } })),
      label: { show: true, position: 'right', fontFamily: MONO, fontSize: 11.5, color: INK, formatter: (q: any) => q.value[0].toFixed(2) },
      markArea: { silent: true, data: [[{ xAxis: 0, name: 'balanced', itemStyle: { color: 'rgba(223,239,228,.8)' } }, { xAxis: 0.1 }]], label: { position: 'insideBottom', color: '#166534', fontSize: 10 } },
      markLine: { silent: true, symbol: 'none', data: [{ xAxis: 0.1 }, { xAxis: 0.2 }], lineStyle: { color: SLATE6, type: 'dashed', width: 1 }, label: { position: 'start', formatter: (q: any) => String(q.value), color: MUT, fontSize: 10 } },
    }] as any,
    mipTitle: 'Balance across groups (Love plot)',
    mipCaption: caption,
    mipChartHeight: Math.max(200, rows.length * 30 + 80),
  })];
}
