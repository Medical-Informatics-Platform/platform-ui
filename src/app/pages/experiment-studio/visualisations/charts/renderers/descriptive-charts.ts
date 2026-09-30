import {
  B, CLS, FONT, INK, LB, MONO, MUT, MipChart, NS, OR, ORD, ax, base, catAx, esc, fmtN, listText, mix, num, pct, sum, tip,
} from '../chart-theme';
import {
  getDescribeDatasetLabels,
  getFeaturewiseDescribeRows,
  resolveDatasetDisplayLabel,
} from '../../../../../core/describe-result.utils';

const FAMILY_COLORS = [B, LB, NS, OR, CLS[3]];
/** Cohort family of a dataset code: "edsd3" → "edsd", "desd-synthdata2" → "desd-synthdata". */
const family = (code: string) => code.replace(/\d+$/, '') || code;

/** describe: one horizontal box plot per numeric variable, rows = datasets; the card switches between variables. */
export function buildBoxPlotChart(result: any): MipChart[] {
  const rows = getFeaturewiseDescribeRows(result).filter((r) => r.dataset !== 'all datasets');
  const labels = getDescribeDatasetLabels(result);
  const vars = [...new Set(rows.map((r) => String(r.variable)))];

  return vars.flatMap((v) => {
    const vr = rows
      .filter((r) => r.variable === v)
      .map((r) => ({ code: String(r.dataset ?? ''), d: (r.data ?? {}) as Record<string, unknown> }))
      .filter((r) => ['min', 'q1', 'q2', 'q3', 'max'].every((k) => Number.isFinite(num(r.d[k]))));
    if (!vr.length) return [];
    const fams = [...new Set(vr.map((r) => family(r.code)))];
    const colorOf = (code: string) => FAMILY_COLORS[fams.indexOf(family(code)) % FAMILY_COLORS.length];
    const n = (r: { d: Record<string, unknown> }) => num(r.d['num_dtps']);
    const N = sum(vr.map(n).filter(Number.isFinite));
    const pooled = N ? sum(vr.map((r) => num(r.d['mean']) * n(r)).filter(Number.isFinite)) / N : NaN;
    const name = (code: string) => resolveDatasetDisplayLabel(code, labels);

    const byMedian = [...vr].sort((a, b) => num(b.d['q2']) - num(a.d['q2']));
    const iqr = vr.map((r) => num(r.d['q3']) - num(r.d['q1'])).sort((a, b) => a - b)[Math.floor(vr.length / 2)];
    const medRange = num(byMedian[0].d['q2']) - num(byMedian[byMedian.length - 1].d['q2']);
    const caption = vr.length < 2
      ? `Median ${fmtN(num(vr[0].d['q2']))}, IQR ${fmtN(num(vr[0].d['q1']))}–${fmtN(num(vr[0].d['q3']))}.`
      : [
        `Medians range from ${fmtN(num(byMedian[byMedian.length - 1].d['q2']))} (${name(byMedian[byMedian.length - 1].code)}) to ${fmtN(num(byMedian[0].d['q2']))} (${name(byMedian[0].code)}).`,
        Number.isFinite(pooled) ? `The pooled mean, weighted by n, is ${fmtN(pooled)}.` : '',
        medRange > iqr / 2 ? 'The medians differ by more than half a typical IQR, which could be a site or cohort effect, so check before pooling.' : '',
      ].filter(Boolean).join(' ');

    const chart: MipChart = base({
      tooltip: {
        ...tip, trigger: 'item',
        formatter: (q: any) => {
          if (q.seriesType !== 'boxplot') return '';
          const r = vr[q.dataIndex];
          const d = r.d;
          const f = (k: string) => fmtN(num(d[k]), 3);
          return `<b>${esc(name(r.code))}</b> · n = ${esc(d['num_dtps'])}${num(d['num_na']) ? ` (${esc(d['num_na'])} missing)` : ''}<br/>median ${f('q2')} · IQR ${f('q1')} – ${f('q3')}<br/>range ${f('min')} – ${f('max')} · mean ${f('mean')}`;
        },
      } as any,
      legend: { top: 0, left: 150, itemWidth: 12, itemHeight: 8, textStyle: { color: INK, fontSize: 11 }, data: [...fams, 'Mean'] },
      grid: { left: 150, right: 30, top: 30, bottom: 40 },
      xAxis: ax({ type: 'value', scale: true, name: v, nameLocation: 'middle', nameGap: 26 }),
      yAxis: catAx(vr.map((r) => `${name(r.code)}  {n|n=${r.d['num_dtps'] ?? '—'}}`), { axisLabel: { color: INK, fontSize: 11.5, rich: { n: { color: MUT, fontFamily: MONO, fontSize: 10.5 } } } }),
      series: [
        {
          type: 'boxplot', boxWidth: [8, 12],
          data: vr.map((r) => ({ value: ['min', 'q1', 'q2', 'q3', 'max'].map((k) => num(r.d[k])), itemStyle: { color: mix('#ffffff', colorOf(r.code), 0.35), borderColor: colorOf(r.code), borderWidth: 1.5 } })),
          markLine: Number.isFinite(pooled)
            ? { silent: true, symbol: 'none', data: [{ xAxis: pooled }], lineStyle: { color: ORD, type: 'dashed', width: 1.5 }, label: { formatter: `pooled mean ${fmtN(pooled)}`, position: 'start', color: ORD, fontSize: 10.5 } }
            : undefined,
        },
        { name: 'Mean', type: 'scatter', symbol: 'diamond', symbolSize: 7, itemStyle: { color: ORD }, data: vr.map((r, i) => [num(r.d['mean']), i]).filter((p) => Number.isFinite(p[0])), z: 5 },
        // Empty series give the cohort families a legend entry.
        ...fams.map((f, i) => ({ name: f, type: 'scatter', data: [], itemStyle: { color: FAMILY_COLORS[i % FAMILY_COLORS.length] } })),
      ] as any,
      mipTitle: 'Distribution by dataset',
      mipVariant: v,
      mipCaption: caption,
      mipChartHeight: Math.max(200, vr.length * 26 + 90),
    });
    return [chart];
  });
}

interface HistItem { var: string; grouping_var: string | null; grouping_enum: string | null; bins: number[]; counts: (number | null)[] }

const binMean = (e: number[], c: number[]) => sum(c.map((x, i) => x * (e[i] + e[i + 1]) / 2)) / (sum(c) || 1);

function trueScaleHistogram(h: HistItem): MipChart | null {
  const e = h.bins.map(num);
  const c = e.slice(0, -1).map((_, i) => num(h.counts[i]) || 0);
  const tot = sum(c);
  if (e.length < 2 || !tot) return null;
  const mean = binMean(e, c);
  let cum = 0;
  let med = e[0];
  for (let i = 0; i < c.length; i++) {
    if (cum + c[i] >= tot / 2) { med = e[i] + (tot / 2 - cum) / c[i] * (e[i + 1] - e[i]); break; }
    cum += c[i];
  }
  const nz = c.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
  const peak = c.indexOf(Math.max(...c));
  const skew = mean - med;
  const width = e[e.length - 1] - e[0];
  return base({
    tooltip: { ...tip, trigger: 'item', formatter: (q: any) => `${fmtN(q.value[0])} – ${fmtN(q.value[1])}<br/><b>${q.value[2]}</b> (${(q.value[2] / tot * 100).toFixed(1)}%)` } as any,
    grid: { left: 50, right: 30, top: 30, bottom: 44 },
    xAxis: ax({ type: 'value', min: e[0], max: e[e.length - 1], name: `${h.var} · n = ${tot}`, nameLocation: 'middle', nameGap: 26, splitLine: { show: false }, axisLabel: { color: MUT, fontSize: 11, formatter: (v: number) => fmtN(v, 1) } }),
    yAxis: ax({ type: 'value', name: 'Count', nameTextStyle: { color: MUT, fontSize: 11, align: 'right' } }),
    series: [{
      type: 'custom', data: c.map((x, i) => [e[i], e[i + 1], x]), encode: { x: [0, 1], y: 2 },
      renderItem: (_p: any, api: any) => {
        const a = api.coord([api.value(0), api.value(2)]);
        const b = api.coord([api.value(1), 0]);
        return { type: 'rect', shape: { x: a[0] + 0.5, y: a[1], width: Math.max(0, b[0] - a[0] - 1), height: b[1] - a[1] }, style: { fill: B } };
      },
      markLine: { silent: true, symbol: 'none', data: [{ xAxis: mean }, { xAxis: med }], lineStyle: { color: ORD, width: 1.5, type: 'dashed' }, label: { show: false } },
    }] as any,
    graphic: [{ type: 'text', right: 30, top: 6, style: { text: `┆ mean ${fmtN(mean)}  ·  median ${fmtN(med)}`, fill: ORD, fontSize: 11, fontFamily: FONT } }] as any,
    mipTitle: `Histogram · ${h.var}`,
    mipCaption: [
      `Values run from ${fmtN(e[nz[0]])} to ${fmtN(e[nz[nz.length - 1] + 1])} and peak around ${fmtN((e[peak] + e[peak + 1]) / 2)}.`,
      Math.abs(skew) > width * 0.02 ? `The distribution is ${skew > 0 ? 'right' : 'left'}-skewed, which pulls the mean ${skew > 0 ? 'above' : 'below'} the median.` : 'Mean and median are close, so the distribution is roughly symmetric.',
    ].join(' '),
    mipChartHeight: 250,
  });
}

function ridgeline(items: HistItem[]): MipChart | null {
  const e = items[0].bins.map(num);
  const withData = items.filter((h) => h.counts.some((x) => num(x) > 0));
  const empty = items.filter((h) => !withData.includes(h)).map((h) => String(h.grouping_enum));
  if (!withData.length || e.length < 2) return null;
  const stats = withData.map((h) => {
    const c = e.slice(0, -1).map((_, i) => num(h.counts[i]) || 0);
    const tot = sum(c);
    return { g: String(h.grouping_enum), c: c.map((x) => x / tot), tot, mean: binMean(e, c) };
  }).sort((a, b) => a.mean - b.mean);
  const mx = Math.max(...stats.flatMap((s) => s.c));
  const L = stats.length;
  const hi = stats[L - 1];
  const lo = stats[0];
  return base({
    tooltip: { ...tip, trigger: 'item', formatter: (q: any) => { const s = stats[q.dataIndex]; return `<b>${esc(s.g)}</b> · n = ${s.tot}<br/>mean ≈ ${fmtN(s.mean)}`; } } as any,
    grid: { left: 90, right: 30, top: 10, bottom: 44 },
    xAxis: ax({ type: 'value', min: e[0], max: e[e.length - 1], name: `${items[0].var} (share of group per bin)`, nameLocation: 'middle', nameGap: 26, axisLabel: { color: MUT, fontSize: 11, formatter: (v: number) => fmtN(v, 1) } }),
    yAxis: { type: 'value', min: 0, max: L - 1 + 1.35, interval: 1, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: true, lineStyle: { color: '#E2E8F0' } }, axisLabel: { color: INK, fontSize: 12, fontWeight: 600, formatter: (v: number) => stats[L - 1 - v]?.g ?? '' } },
    series: [{
      type: 'custom', data: stats.map((s, i) => [i, s.mean]), encode: { x: 1, y: 0 },
      renderItem: (params: any, api: any) => {
        const i = params.dataIndex;
        const s = stats[i];
        const b0 = L - 1 - i;
        const pts = [api.coord([e[0], b0])];
        s.c.forEach((v, k) => { const y = b0 + v / mx * 1.25; pts.push(api.coord([e[k], y]), api.coord([e[k + 1], y])); });
        pts.push(api.coord([e[e.length - 1], b0]));
        const m0 = api.coord([s.mean, b0]);
        return {
          type: 'group', children: [
            { type: 'polygon', shape: { points: pts }, style: { fill: 'rgba(127,156,232,.45)', stroke: B, lineWidth: 1.2 } },
            { type: 'line', shape: { x1: m0[0], y1: m0[1], x2: m0[0], y2: m0[1] - 10 }, style: { stroke: ORD, lineWidth: 2.5 } },
          ],
        };
      },
    }] as any,
    mipTitle: `Distribution by ${items[0].grouping_var}`,
    mipCaption: [
      L > 1 ? `${hi.g} sits highest (mean ≈ ${fmtN(hi.mean)}) and ${lo.g} lowest (≈ ${fmtN(lo.mean)}).` : `${hi.g} has mean ≈ ${fmtN(hi.mean)}.`,
      'Each group is scaled to its own n, so compare shapes, not heights.',
      empty.length ? `${listText(empty)} ${empty.length > 1 ? 'have' : 'has'} no data in this selection.` : '',
    ].filter(Boolean).join(' '),
    mipChartHeight: Math.max(200, L * 44 + 90),
  });
}

/** Nominal variables arrive with one count per category label instead of numeric bin edges. */
const isCategorical = (h: HistItem) => h.bins.length === h.counts.length || h.bins.some((b) => !Number.isFinite(num(b)));

/** Counts per category; with groups, one 100% stacked row per group. */
function categoryChart(items: HistItem[]): MipChart | null {
  const cats = items[0].bins.map(String);
  const rows = items
    .map((h) => ({ g: h.grouping_enum ? String(h.grouping_enum) : 'All', c: cats.map((_, i) => num(h.counts[i]) || 0) }))
    .filter((r) => sum(r.c) > 0);
  if (!rows.length) return null;
  const grouped = !!items[0].grouping_enum;
  const tot = cats.map((_, i) => sum(rows.map((r) => r.c[i])));
  const N = sum(tot);
  const order = cats.map((_, i) => i).sort((a, b) => tot[b] - tot[a]);
  const empty = cats.filter((_, i) => !tot[i]);
  const caption = [
    `${cats[order[0]]} is the most common category (${pct(tot[order[0]] / N)})${order.length > 1 && tot[order[1]] ? `, then ${cats[order[1]]} (${pct(tot[order[1]] / N)})` : ''}.`,
    empty.length ? `${listText(empty)} ${empty.length > 1 ? 'have' : 'has'} no data in this selection.` : '',
    grouped ? 'Each row is scaled to its own group, so compare shares, not sizes.' : '',
  ].filter(Boolean).join(' ');

  if (!grouped) {
    const shown = order.filter((i) => tot[i] > 0);
    return base({
      tooltip: { ...tip, trigger: 'item', formatter: (q: any) => `<b>${esc(q.name)}</b><br/>n = ${fmtN(q.value, 0)} (${pct(q.value / N, 1)})` } as any,
      grid: { left: 170, right: 90, top: 10, bottom: 40 },
      xAxis: ax({ type: 'value', name: `Count · n = ${fmtN(N, 0)}`, nameLocation: 'middle', nameGap: 26 }),
      yAxis: catAx(shown.map((i) => cats[i]), { axisLabel: { color: INK, fontSize: 12, width: 156, overflow: 'truncate', fontFamily: FONT } }),
      series: [{
        type: 'bar', barWidth: 18, data: shown.map((i) => ({ name: cats[i], value: tot[i] })), itemStyle: { color: B, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', fontFamily: MONO, fontSize: 11.5, color: INK, formatter: (q: any) => `${fmtN(q.value, 0)} (${pct(q.value / N)})` },
      }] as any,
      mipTitle: `Counts · ${items[0].var}`,
      mipCaption: caption,
      mipChartHeight: Math.max(160, shown.length * 32 + 70),
    });
  }
  return base({
    tooltip: { ...tip, trigger: 'item', formatter: (q: any) => `${esc(rows[q.dataIndex].g)} · ${esc(q.seriesName)}<br/>${q.value}% (n = ${rows[q.dataIndex].c[cats.indexOf(q.seriesName)]})` } as any,
    legend: { top: 0, left: 140, itemWidth: 10, itemHeight: 10, textStyle: { color: MUT, fontSize: 11 }, data: cats.filter((_, i) => tot[i] > 0) },
    grid: { left: 140, right: 30, top: 30, bottom: 40 },
    xAxis: ax({ type: 'value', max: 100, name: 'Share of group', nameLocation: 'middle', nameGap: 26, axisLabel: { color: MUT, fontSize: 11, formatter: '{value}%' } }),
    yAxis: catAx(rows.map((r) => `${r.g}  n=${fmtN(sum(r.c), 0)}`), { axisLabel: { color: INK, fontSize: 12, width: 126, overflow: 'truncate', fontFamily: FONT } }),
    series: cats.map((cat, ci) => ({
      name: cat, type: 'bar', stack: 's', barWidth: 18,
      data: rows.map((r) => +(r.c[ci] / (sum(r.c) || 1) * 100).toFixed(1)), itemStyle: { color: FAMILY_COLORS[ci % FAMILY_COLORS.length] },
      label: { show: true, position: 'inside', fontFamily: MONO, fontSize: 10.5, color: ci % FAMILY_COLORS.length === 0 || ci % FAMILY_COLORS.length === 4 ? '#fff' : INK, formatter: (q: any) => (q.value >= 8 ? `${Math.round(q.value)}%` : '') },
    })) as any,
    mipTitle: `${items[0].var} by ${items[0].grouping_var}`,
    mipCaption: caption,
    mipChartHeight: Math.max(160, rows.length * 32 + 80),
  });
}

/** histogram: a true-scale histogram (or category counts) per variable and a ridgeline per grouping. */
export function buildHistogramChart(result: any): MipChart[] {
  const items: HistItem[] = (Array.isArray(result?.histogram) ? result.histogram : []).filter((h: any) => Array.isArray(h?.bins) && Array.isArray(h?.counts));
  const charts: MipChart[] = [];
  items.filter((h) => !h.grouping_enum).forEach((h) => { const c = isCategorical(h) ? categoryChart([h]) : trueScaleHistogram(h); if (c) charts.push(c); });
  const groups = new Map<string, HistItem[]>();
  items.filter((h) => h.grouping_enum).forEach((h) => { const k = `${h.var}|${h.grouping_var}`; groups.set(k, [...(groups.get(k) ?? []), h]); });
  groups.forEach((g) => { const c = isCategorical(g[0]) ? categoryChart(g) : ridgeline(g); if (c) charts.push(c); });
  return charts;
}

/** outlier_report: low outliers left (orange), high outliers right (blue), one chart per variable. */
export function buildOutlierReportChart(result: any): MipChart[] {
  const recs: any[] = Array.isArray(result?.featurewise) ? result.featurewise : Array.isArray(result?.records) ? result.records : [];
  const vars = [...new Set(recs.map((r) => String(r?.variable)))];
  return vars.flatMap((v) => {
    const rows = recs.filter((r) => String(r?.variable) === v)
      .map((r) => { const d = r?.data ?? r; return { ds: String(r?.dataset), lo: num(d?.lower_outlier_count) || 0, hi: num(d?.upper_outlier_count) || 0, pct: num(d?.total_outlier_percentage) }; })
      .filter((r) => r.lo || r.hi || Number.isFinite(r.pct));
    if (!rows.length) return [];
    const m = Math.max(1, ...rows.flatMap((r) => [r.lo, r.hi])) * 1.2;
    const byPct = [...rows].filter((r) => Number.isFinite(r.pct)).sort((a, b) => b.pct - a.pct);
    const pctText = (r: { pct: number }) => (Number.isFinite(r.pct) ? `${r.pct.toFixed(1)}%` : '—');
    const hiTot = sum(rows.map((r) => r.hi));
    const loTot = sum(rows.map((r) => r.lo));
    const caption = [
      byPct.length ? `${listText(byPct.slice(0, 2).map((r) => `${r.ds} (${pctText(r)})`))} flag the most values${hiTot !== loTot ? `, mostly ${hiTot > loTot ? 'above the upper' : 'below the lower'} bound` : ''}.` : '',
      byPct.length > 2 ? `${byPct[byPct.length - 1].ds} is the cleanest (${pctText(byPct[byPct.length - 1])}).` : '',
    ].filter(Boolean).join(' ');

    return [base({
      tooltip: { ...tip, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps: any) => { const r = rows[ps[0].dataIndex]; return `<b>${esc(r.ds)}</b><br/>${r.lo} below / ${r.hi} above bounds<br/>${pctText(r)} flagged`; } } as any,
      legend: { top: 0, left: 150, itemWidth: 12, itemHeight: 8, textStyle: { color: INK, fontSize: 11 } },
      grid: { left: 150, right: 70, top: 30, bottom: 40 },
      xAxis: ax({ type: 'value', min: -m, max: m, name: '← below lower bound  ·  outlier count  ·  above upper bound →', nameLocation: 'middle', nameGap: 26, axisLabel: { color: MUT, fontSize: 11, formatter: (x: number) => fmtN(Math.abs(x), 0) } }),
      yAxis: [
        catAx(rows.map((r) => r.ds), { axisLabel: { color: INK, fontSize: 12, width: 136, overflow: 'truncate' } }),
        catAx(rows.map((r) => r.ds), { position: 'right', axisLabel: { fontFamily: MONO, fontSize: 11.5, color: INK, formatter: (_x: string, i: number) => pctText(rows[i]) } }),
      ],
      series: [
        { name: 'Low outliers', type: 'bar', stack: 'o', barWidth: 14, data: rows.map((r) => -r.lo), itemStyle: { color: OR, borderRadius: [4, 0, 0, 4] }, label: { show: true, position: 'left', fontFamily: MONO, fontSize: 11, color: INK, formatter: (q: any) => (q.value ? Math.abs(q.value) : '') } },
        { name: 'High outliers', type: 'bar', stack: 'o', barWidth: 14, data: rows.map((r) => r.hi), itemStyle: { color: B, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', fontFamily: MONO, fontSize: 11, color: INK, formatter: (q: any) => q.value || '' } },
      ] as any,
      mipTitle: 'Outliers by dataset',
      mipVariant: v,
      mipCaption: caption || undefined,
      mipChartHeight: Math.max(200, rows.length * 30 + 80),
    })];
  });
}
