import { EChartsOption } from 'echarts';
import {
  getDescribeDatasetLabels,
  getFeaturewiseDescribeRows,
  resolveDatasetDisplayLabel,
} from '../../../../../core/describe-result.utils';

const PRIMARY = '#2b33e9';
const PRIMARY_DARK = '#1b21a3';
const BOX_FILL = 'rgba(43, 51, 233, 0.12)';
const ACCENT = '#ffba08';
const AXIS = '#475569';
const SPLIT = '#e2e8f0';
const LABEL = '#334155';
const TEXT = '#0f172a';
const LABEL_FONT = '600 11px sans-serif';

const BOX_SERIES = 'Q1–Q3 box · min–max whiskers';
const MEDIAN_SERIES = 'Median';
const MEAN_SERIES = 'Mean ± SD';
const POOLED_SERIES = 'All datasets · Q1–Q3';
const POOLED_FILL = 'rgba(43, 51, 233, 0.06)';
const POOLED_LINE = 'rgba(43, 51, 233, 0.55)';

interface BoxStats {
  label: string;
  min: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
  max: number | null;
  mean: number | null;
  std: number | null;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const fmt = (v: number | null): string =>
  v === null ? 'N/A' : Number.isInteger(v) ? String(v) : v.toFixed(2);

type LabelMode = 'full' | 'short' | 'none';

// Direct labels need room on both sides of the box: named labels on wide bands,
// bare values on medium ones, tooltip only below that.
function geometry(api: any): { half: number; labels: LabelMode } {
  const band = api.size([1, 0])[0] as number;
  const labels: LabelMode = band >= 250 ? 'full' : band >= 150 ? 'short' : 'none';
  return { half: Math.max(12, Math.min(32, band * 0.15)), labels };
}

// Opacity of the other datasets while one is hovered (ECharts defaults to 0.1).
const BLUR = { style: { opacity: 0.25 } };
// Highlighting a dataset blurs every series in the coordinate system; keep the
// pooled band fully visible as the reference.
const KEEP = { style: { opacity: 1 } };

const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, lineWidth: number) => ({
  type: 'line',
  shape: { x1, y1, x2, y2 },
  style: { stroke, lineWidth },
  blur: BLUR,
});

const label = (x: number, y: number, text: string, align: 'left' | 'right') => ({
  type: 'text',
  x,
  y,
  style: { text, fill: LABEL, font: LABEL_FONT, align, verticalAlign: 'middle', lineHeight: 15 },
  blur: BLUR,
});

// Legend-only entry: the dataset series draws every layer, so hovering one
// dataset can fade the others as a whole.
const legendKey = (name: string) => ({ name, type: 'custom' as const, data: [], renderItem: () => null });

const pooledBand = (s: BoxStats) => {
  const q1 = s.q1 as number;
  const q3 = s.q3 as number;
  return {
    name: POOLED_SERIES,
    type: 'custom' as const,
    z: 1,
    encode: { x: 0, y: [1, 2, 3] },
    data: [[0, q1, s.median, q3]],
    renderItem: (params: any, api: any) => {
      const cs = params.coordSys as { x: number; width: number };
      const yOf = (v: number) => api.coord([0, v])[1] as number;
      const yQ1 = yOf(q1);
      const yQ3 = yOf(q3);
      const x1 = cs.x;
      const x2 = cs.x + cs.width;
      const edge = (y: number) => ({
        type: 'line' as const,
        shape: { x1, y1: y, x2, y2: y },
        style: { stroke: POOLED_LINE, lineWidth: 1, lineDash: [6, 4] },
        blur: KEEP,
      });
      const children: any[] = [
        {
          type: 'rect',
          shape: { x: x1, y: yQ3, width: cs.width, height: Math.max(1, yQ1 - yQ3) },
          style: { fill: POOLED_FILL },
          blur: KEEP,
        },
        edge(yQ3),
        edge(yQ1),
      ];
      const median = s.median;
      const hasMedian = median !== null;
      const yLabel = hasMedian ? yOf(median) : (yQ1 + yQ3) / 2;
      if (hasMedian) {
        children.push({
          type: 'line',
          shape: { x1, y1: yLabel, x2, y2: yLabel },
          style: { stroke: PRIMARY, lineWidth: 1.5, lineDash: [6, 4] },
          blur: KEEP,
        });
      }
      children.push({
        type: 'text',
        x: x2 + 8,
        y: yLabel,
        style: {
          text: hasMedian ? `All datasets\nmedian ${fmt(median)}` : 'All datasets',
          fill: PRIMARY_DARK,
          font: LABEL_FONT,
          align: 'left',
          verticalAlign: 'middle',
          lineHeight: 15,
        },
        blur: KEEP,
      });
      return { type: 'group' as const, children };
    },
  };
};

// Builds a Box Plot chart (Q1–Q3 boxes, min/max whiskers, labelled median,
// mean ± SD bar) for descriptive statistics results.
export function buildBoxPlotChart(result: any): EChartsOption[] {
  const featurewise = getFeaturewiseDescribeRows(result);
  if (featurewise.length === 0) return [];

  const firstVariable = featurewise[0]?.variable ?? 'Variable';
  const rows = featurewise.filter(v => v.variable === firstVariable);
  const isPooled = (v: { dataset: string }) => String(v.dataset).toLowerCase() === 'all datasets';

  const datasetLabels = getDescribeDatasetLabels(result);
  const toStats = (v: (typeof rows)[number]): BoxStats => {
    const d = (v.data ?? {}) as Record<string, unknown>;
    return {
      label: resolveDatasetDisplayLabel(String(v.dataset || 'Dataset'), datasetLabels),
      min: num(d['min']),
      q1: num(d['q1']),
      median: num(d['q2']) ?? num(d['median']),
      q3: num(d['q3']),
      max: num(d['max']),
      mean: num(d['mean']),
      std: num(d['std']),
    };
  };
  const hasBox = (s: BoxStats) => s.q1 !== null && s.q3 !== null;
  const stats = rows.filter(v => !isPooled(v)).map(toStats).filter(hasBox);
  if (stats.length === 0) return [];
  const pooledRow = rows.find(isPooled);
  const pooled = pooledRow ? toStats(pooledRow) : null;
  const showPooled = !!pooled && hasBox(pooled);

  const tooltipRow = (name: string, value: number | null) =>
    `<div style="display:flex;justify-content:space-between;gap:20px">` +
    `<span style="color:${AXIS}">${name}</span><b>${fmt(value)}</b></div>`;
  const tooltipFor = (s: BoxStats, title: string, quartileNote = '') =>
    `<div style="font-weight:700;margin-bottom:6px">${title}</div>` +
    tooltipRow('Max', s.max) +
    tooltipRow(`Q3${quartileNote}`, s.q3) +
    tooltipRow(`Median${quartileNote}`, s.median) +
    tooltipRow(`Q1${quartileNote}`, s.q1) +
    tooltipRow('Min', s.min) +
    `<div style="border-top:1px solid ${SPLIT};margin:6px 0"></div>` +
    tooltipRow('Mean', s.mean) +
    tooltipRow('Std. deviation', s.std);

  const chart: EChartsOption = {
    title: {
      text: `Distribution for ${firstVariable}`,
      left: 'center',
      textStyle: { color: TEXT, fontSize: 14, fontWeight: 700 },
    },
    legend: {
      top: 36,
      left: 'center',
      itemGap: 20,
      itemWidth: 16,
      itemHeight: 10,
      selectedMode: false,
      textStyle: { color: AXIS, fontSize: 12, fontWeight: 600 },
      data: [
        { name: BOX_SERIES, icon: 'roundRect', itemStyle: { color: BOX_FILL, borderColor: PRIMARY, borderWidth: 1.5 } },
        { name: MEDIAN_SERIES, icon: 'path://M0,0H24V4H0Z', itemStyle: { color: PRIMARY_DARK } },
        { name: MEAN_SERIES, icon: 'diamond', itemStyle: { color: ACCENT, borderColor: AXIS, borderWidth: 1 } },
        ...(showPooled
          ? [{ name: POOLED_SERIES, icon: 'rect', itemStyle: { color: POOLED_FILL, borderColor: POOLED_LINE, borderWidth: 1, borderType: 'dashed' as const } }]
          : []),
      ],
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255, 255, 255, 0.96)',
      borderColor: 'rgba(43, 51, 233, 0.16)',
      borderWidth: 1,
      padding: [10, 12],
      textStyle: { color: TEXT, fontSize: 12 },
      formatter: (p: any) => {
        if (p.seriesName === POOLED_SERIES) {
          return pooled ? tooltipFor(pooled, 'All datasets (pooled)', ' (est.)') : '';
        }
        const s = stats[p.dataIndex];
        return s ? tooltipFor(s, s.label) : '';
      },
    },
    // The pooled band's label sits past the plot's right edge.
    grid: { top: 88, right: showPooled ? 92 : 40, bottom: 60, left: 72 },
    xAxis: {
      type: 'category',
      data: stats.map(s => s.label),
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { show: false },
      // Two wrapped lines per dataset name; the width assumes the narrowest
      // workspace plot (~520px) because the real band is unknown until render.
      axisLabel: {
        color: AXIS,
        fontWeight: 600,
        interval: 0,
        margin: 12,
        width: Math.max(72, 520 / Math.max(1, stats.length) - 16),
        overflow: 'break',
        lineHeight: 15,
        height: 30,
        lineOverflow: 'truncate',
      },
    },
    yAxis: {
      type: 'value',
      name: firstVariable,
      nameLocation: 'middle',
      nameGap: 48,
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: AXIS },
      splitLine: { lineStyle: { color: SPLIT, type: 'dashed' } },
      nameTextStyle: { color: AXIS, fontWeight: 700 },
    },
    series: [
      {
        name: BOX_SERIES,
        type: 'custom',
        z: 2,
        // [i, min, q1, median, q3, max, mean, std, mean - std, mean + std]
        encode: { x: 0, y: [1, 2, 3, 4, 5, 6, 8, 9] },
        data: stats.map(({ min, q1, median, q3, max, mean, std }, i) =>
          mean !== null && std !== null
            ? [i, min, q1, median, q3, max, mean, std, mean - std, mean + std]
            : [i, min, q1, median, q3, max, mean, std, mean, mean]
        ),
        renderItem: (_params: any, api: any) => {
          const [min, q1, median, q3, max, mean, std] = [1, 2, 3, 4, 5, 6, 7].map(d => api.value(d) as number);
          const { half, labels } = geometry(api);
          const cap = half * 0.5;
          const y = (v: number) => api.coord([api.value(0), v])[1] as number;
          const x = api.coord([api.value(0), q1])[0] as number;
          const yQ1 = y(q1);
          const yQ3 = y(q3);
          const children: any[] = [];

          for (const [end, boxEdge] of [[min, yQ1], [max, yQ3]]) {
            if (Number.isFinite(end)) {
              children.push(line(x, boxEdge, x, y(end), PRIMARY, 1.5), line(x - cap, y(end), x + cap, y(end), PRIMARY, 1.5));
            }
          }
          children.push({
            type: 'rect',
            shape: { x: x - half, y: yQ3, width: half * 2, height: Math.max(1, yQ1 - yQ3), r: 4 },
            style: { fill: BOX_FILL, stroke: PRIMARY, lineWidth: 1.5 },
            blur: BLUR,
          });

          if (Number.isFinite(median)) {
            const yMedian = y(median);
            children.push(line(x - half, yMedian, x + half, yMedian, PRIMARY_DARK, 3));
            if (labels !== 'none') {
              const text = labels === 'full' ? `Median ${fmt(median)}` : fmt(median);
              children.push(label(x - half - 8, yMedian, text, 'right'));
            }
          }

          if (Number.isFinite(mean)) {
            const sx = x + half + 16;
            const yMean = y(mean);
            if (Number.isFinite(std)) {
              const yLo = y(mean - std);
              const yHi = y(mean + std);
              children.push(
                line(sx, yLo, sx, yHi, AXIS, 1.5),
                line(sx - 5, yLo, sx + 5, yLo, AXIS, 1.5),
                line(sx - 5, yHi, sx + 5, yHi, AXIS, 1.5),
              );
            }
            children.push({
              type: 'polygon',
              shape: { points: [[sx, yMean - 6], [sx + 6, yMean], [sx, yMean + 6], [sx - 6, yMean]] },
              style: { fill: ACCENT, stroke: AXIS, lineWidth: 1 },
              blur: BLUR,
            });
            if (labels !== 'none') {
              const [meanPrefix, sdPrefix] = labels === 'full' ? ['Mean ', 'SD '] : ['', ''];
              const text = Number.isFinite(std)
                ? `${meanPrefix}${fmt(mean)}\n${sdPrefix}±${fmt(std)}`
                : `${meanPrefix}${fmt(mean)}`;
              children.push(label(sx + 12, yMean, text, 'left'));
            }
          }
          return { type: 'group', focus: 'self', children };
        },
      },
      legendKey(MEDIAN_SERIES),
      legendKey(MEAN_SERIES),
      ...(showPooled && pooled ? [pooledBand(pooled)] : []),
    ],
  };

  return [chart];
}
