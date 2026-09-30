import { EChartsOption } from 'echarts';
import { escapeHtml } from '../../../../core/html.utils';

/**
 * Shared look for algorithm result charts (design handoff "Result charts: proposals").
 * Builders return MipChart: a plain EChartsOption plus card chrome the renderer draws
 * around it (title, meta line, caption, height, variable switcher).
 */
export interface MipChart extends EChartsOption {
  /** Card header. Charts carry no ECharts `title`. */
  mipTitle?: string;
  /** Small context line above the chart (outcome, n, fit). */
  mipMeta?: string;
  /** Plain-language reading of the chart, at most three sentences. */
  mipCaption?: string;
  mipChartHeight?: number;
  /** Switcher label. Consecutive charts with a variant and the same title share one card. */
  mipVariant?: string;
}

/** Significance level for filled/hollow marks, grey cells and blue p-values. */
export const ALPHA = 0.05;

export const B = '#2B33E9';
export const LB = '#7F9CE8';
export const OR = '#FFBA08';
export const ORD = '#C77700';
export const GR = '#DFEFE4';
export const INK = '#0F172A';
export const SLATE7 = '#334155';
export const SLATE6 = '#475569';
export const MUT = '#64748B';
export const NS = '#94A3B8';
export const GRID = '#E2E8F0';
export const RULE = '#F1F5F9';
export const AXIS = '#CBD5E1';
export const NS_CELL = '#F8FAFC';
/** Categorical order for classes. */
export const CLS = [B, LB, OR, SLATE7];
/** Sequential ramp for ordinal categories. */
export const SEQ = ['#E4E8FB', '#B4C3F4', '#7F9CE8', '#4F5DE6', '#2B33E9'];

// Canvas cannot read CSS variables; these mirror --font-sans / --font-mono in styles.css.
export const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export const num = (v: unknown): number => (v === null || v === undefined || v === '' ? NaN : Number(v));
export const isNum = (v: unknown): boolean => Number.isFinite(num(v));
export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
export const esc = (v: unknown): string => escapeHtml(String(v ?? ''));

/** Smallest 1/1.5/2/2.5/3/4/5/6/8 × 10ⁿ at or above x, so symmetric axes end on a readable tick. */
export function niceCeil(x: number): number {
  if (!(x > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(x)));
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((f) => f * e >= x - 1e-12) ?? 10) * e;
}

export function fmtN(v: number, d = 2): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = a >= 1000 ? v.toFixed(0) : a >= 100 ? v.toFixed(1) : v.toFixed(d);
  return s.replace('-', '−');
}

/** p for columns: "<0.001" or "0.042". */
export const fp = (p: number): string => (!Number.isFinite(p) ? '—' : p < 0.001 ? '<0.001' : p.toFixed(3));
/** p for prose: "p < 0.001" or "p = 0.042". */
export const pText = (p: number): string =>
  !Number.isFinite(p) ? 'p not available' : p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`;
export const pct = (v: number, d = 0): string => `${(v * 100).toFixed(d)}%`;

/** "a", "a and b", "a, b and c". */
export function listText(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function mix(a: string, b: string, t: number): string {
  const A = hex(a);
  const C = hex(b);
  const k = Math.max(0, Math.min(1, t));
  return '#' + A.map((v, i) => Math.round(v + (C[i] - v) * k).toString(16).padStart(2, '0')).join('');
}
/** Diverging fill: orange ← white → blue, centred on 0. */
export const diverge = (v: number, m: number): string => (v >= 0 ? mix('#ffffff', B, v / m) : mix('#ffffff', OR, -v / m));
/** Label ink on a diverging cell. */
export const inkOn = (v: number, m: number): string => (v > 0 && Math.abs(v) / m > 0.55 ? '#fff' : INK);

/** Shortens region names for dense axes: "Left superior temporal gyrus" → "L sup. temporal g.". */
export const short = (s: string): string =>
  s.replace(/^Left /, 'L ').replace(/^Right /, 'R ').replace('superior', 'sup.').replace('posterior', 'post.')
    .replace('middle', 'mid.').replace(' gyrus', ' g.');

export const tip = {
  backgroundColor: '#fff',
  borderColor: 'rgba(148,163,184,.45)',
  borderWidth: 1,
  padding: [8, 10],
  textStyle: { color: INK, fontSize: 12, fontFamily: FONT },
  extraCssText: 'box-shadow:0 6px 20px rgba(15,23,42,.08);border-radius:8px;',
};

/** Value-axis defaults; `o` overrides. */
export const ax = (o: Record<string, unknown> = {}): any => ({
  axisLine: { lineStyle: { color: AXIS } },
  axisTick: { show: false },
  axisLabel: { color: MUT, fontSize: 11, fontFamily: FONT },
  splitLine: { lineStyle: { color: GRID, type: 'dashed' } },
  nameTextStyle: { color: MUT, fontSize: 11, fontFamily: FONT },
  ...o,
});

/** Category axis that only shows its labels. */
export const catAx = (data: string[], o: Record<string, unknown> = {}): any => ({
  type: 'category',
  data,
  inverse: true,
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: INK, fontSize: 12, fontFamily: FONT },
  ...o,
});

/**
 * ECharts' dev build refuses a heatmap without a visualMap. Cells carry their own colours,
 * so this one is hidden and only pins opacity.
 */
export const heatmapVisual = { show: false, seriesIndex: 0, dimension: 2, min: -1e9, max: 1e9, inRange: { opacity: 1 } };

export const base = (o: MipChart): MipChart => ({ textStyle: { fontFamily: FONT, color: INK }, animationDuration: 450, ...o });

const sigKey = (alpha: number) => ({
  type: 'text',
  left: 8,
  bottom: 6,
  style: { text: `■ p < ${alpha}     □ not significant`, fill: MUT, fontSize: 11, fontFamily: FONT },
});

export interface ForestRow {
  label: string;
  est: number;
  lo: number;
  hi: number;
  p: number;
}

export interface ForestOptions {
  rows: ForestRow[];
  /** Reference line: 0 for differences/coefficients, 1 for ratios. */
  ref?: number;
  /** log2 axis, symmetric in powers of 2 around 1. */
  log?: boolean;
  xName: string;
  alpha?: number;
  digits?: number;
  estHead?: string;
  leftW?: number;
  bottomExtra?: number;
}

export const forestHeight = (rows: number, extra = 0): number => rows * 40 + 90 + extra;

/** Drops the intercept and any row whose estimate or interval is not finite (or not positive on a log axis). */
export function forestRows(labels: string[], est: unknown[], lo: unknown[], hi: unknown[], p: unknown[], map = (v: number) => v, log = false): ForestRow[] {
  return labels
    .map((label, i) => ({ label: String(label), est: map(num(est[i])), lo: map(num(lo[i])), hi: map(num(hi[i])), p: num(p[i]) }))
    .filter((r) => r.label.trim().toLowerCase() !== 'intercept')
    .filter((r) => [r.est, r.lo, r.hi].every((v) => Number.isFinite(v) && (!log || v > 0)));
}

/** Shared forest plot for regression, mixed, Cox and pairwise-difference results. */
export function forest(o: ForestOptions): MipChart {
  const { rows, ref = 0, log = false, xName, alpha = ALPHA, digits = 2, estHead = 'β', leftW = 200, bottomExtra = 0 } = o;
  const f = (v: number) => fmtN(v, digits);
  let min: number;
  let max: number;
  if (log) {
    const m = Math.max(...rows.flatMap((r) => [r.hi, 1 / r.lo]));
    const e = Math.max(1, Math.ceil(Math.log2(m * 1.05)));
    min = Math.pow(2, -e);
    max = Math.pow(2, e);
  } else {
    const m = niceCeil(Math.max(...rows.flatMap((r) => [Math.abs(r.lo - ref), Math.abs(r.hi - ref)])) * 1.12);
    min = ref - m;
    max = ref + m;
  }
  const labels = rows.map((r) => r.label);
  const R = 230;
  const S0 = R - 12;
  const monoRich = (w: number, c: string, extra: Record<string, unknown> = {}) => ({ width: w, align: 'right', fontFamily: MONO, fontSize: 11.5, color: c, ...extra });
  const head = (text: string, right: number) => ({ type: 'text', right, top: 10, style: { text, fill: MUT, fontSize: 11, fontWeight: 600, fontFamily: FONT } });

  return base({
    tooltip: {
      ...tip,
      trigger: 'item',
      formatter: (p: any) => {
        const r = rows[p.dataIndex];
        return `<b>${esc(r.label)}</b><br/>${esc(estHead)} ${f(r.est)} &nbsp;(95% CI ${f(r.lo)} – ${f(r.hi)})<br/>p ${fp(r.p)}`;
      },
    } as any,
    grid: [{ left: leftW, right: R, top: 36, bottom: 50 + bottomExtra }],
    graphic: [head(estHead, S0 - 48), head('95% CI', S0 - 152), head('p', 8), sigKey(alpha)] as any,
    xAxis: [ax({
      type: log ? 'log' : 'value',
      logBase: 2,
      min,
      max,
      interval: log ? undefined : (max - min) / 4,
      name: xName,
      nameLocation: 'middle',
      nameGap: 28,
      axisLabel: {
        color: MUT,
        fontSize: 11,
        formatter: (v: number) => (log ? (v < 1 ? v.toFixed(v < 0.25 ? 3 : 2) : String(+v.toFixed(2))) : String(+v.toFixed(Math.abs(max) < 1 ? 3 : 2)).replace('-', '−')),
      },
    })],
    yAxis: [
      catAx(labels, {
        splitLine: { show: true, lineStyle: { color: RULE } },
        axisLabel: { color: INK, fontSize: 12, width: leftW - 16, overflow: 'truncate', fontFamily: FONT },
      }),
      catAx(labels, {
        position: 'right',
        axisLabel: {
          margin: 12,
          formatter: (_v: string, i: number) => {
            const r = rows[i];
            return `{e|${f(r.est)}}{c|${f(r.lo)} – ${f(r.hi)}}{${r.p < alpha ? 's' : 'p'}|${fp(r.p)}}`;
          },
          rich: { e: monoRich(48, INK), c: monoRich(104, MUT), p: monoRich(58, MUT), s: monoRich(58, B, { fontWeight: 600 }) },
        },
      }),
    ],
    series: [{
      type: 'custom',
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: rows.map((r, i) => [r.est, r.lo, r.hi, r.p, i]),
      encode: { x: [0, 1, 2], y: 4 },
      renderItem: (_params: any, api: any) => {
        const i = api.value(4);
        const [xe, y] = api.coord([api.value(0), i]);
        const xl = api.coord([api.value(1), i])[0];
        const xh = api.coord([api.value(2), i])[0];
        const sig = api.value(3) < alpha;
        const c = sig ? B : NS;
        return {
          type: 'group',
          children: [
            { type: 'line', shape: { x1: xl, y1: y, x2: xh, y2: y }, style: { stroke: c, lineWidth: 2 } },
            { type: 'rect', shape: { x: xe - 5, y: y - 5, width: 10, height: 10 }, style: { fill: sig ? B : '#fff', stroke: c, lineWidth: 2 } },
          ],
        };
      },
      markLine: { silent: true, symbol: 'none', data: [{ xAxis: ref }], lineStyle: { color: SLATE6, type: 'solid', width: 1 }, label: { show: false } },
    }] as any,
    mipChartHeight: forestHeight(rows.length, bottomExtra),
  });
}

/** Caption sentence for a forest: which rows are clearly associated, which cross the reference. */
export function forestCaption(rows: ForestRow[], alpha: number, outcome: string): string {
  const sig = rows.filter((r) => r.p < alpha);
  const ns = rows.filter((r) => !(r.p < alpha));
  const parts: string[] = [];
  if (sig.length) {
    const maxP = Math.max(...sig.map((r) => r.p));
    parts.push(`${listText(sig.map((r) => r.label))} ${sig.length > 1 ? 'are each' : 'is'} associated with ${outcome} (${maxP < 0.001 ? 'p < 0.001' : `p < ${alpha}`}).`);
  } else {
    parts.push(`No predictor is clearly associated with ${outcome} at p < ${alpha}.`);
  }
  if (ns.length && sig.length) {
    parts.push(ns.length === 1 ? `The interval for ${ns[0].label} crosses the no-effect line.` : `The other ${ns.length} predictors' intervals cross the no-effect line.`);
  }
  return parts.join(' ');
}
