import { EChartsOption } from 'echarts';
import { formatInteger, formatSummaryNumber, toFiniteNumber } from '../../result-format';
import { DIVERGING_COLORS, cellLabelColor } from '../chart-palette';
import { escapeHtml } from '../../../../../core/html.utils';

const AXIS_COLOR = '#475569';

export function buildKMeansChart(output: any): EChartsOption[] {
  const clusters = output?.clusters;

  if (!Array.isArray(clusters) || clusters.length === 0) return [];

  const variables: string[] = output.variables ?? [];
  const names: string[] = clusters.map((c: any) => c.label);
  // A centre value the engine did not send (or sent as null) stays null: drawn as missing, never NaN.
  const centers: (number | null)[][] = clusters.map((c: any) => variables.map((v: string) => toFiniteNumber(c?.center?.[v])));

  const sizes: (number | null)[] = clusters.map((c: any) => intervalMidpoint(c.size_interval));
  // A range prints as its midpoint ("~66 245"); "<10" and an empty cluster's "0" print as sent.
  const sizeTexts: (string | null)[] = clusters.map((c: any, i: number) => {
    const interval = String(c.size_interval ?? '').trim();
    if (sizes[i] === null) return null;
    return interval.includes('-') ? `~${formatInteger(Math.round(sizes[i]!))}` : interval;
  });
  // Each cluster's name carries its size, so the centres table is not needed on screen.
  const sizedNames = names.map((name, i) => (sizeTexts[i] === null ? name : `${name} · ${sizeTexts[i]}`));
  const charts = variables.length === 2
    ? buildKMeans2DChart(centers as [number | null, number | null][], names, sizedNames, variables, sizes, sizeTexts)
    : buildKMeansCentresHeatmap(centers, sizedNames, variables, sizes);

  if (output.elbow) {
    charts.push(buildKMeansElbowChart(output.elbow));
  }

  return charts;
}

/** Cluster sizes arrive as privacy-safe intervals ("87520-87529", "<10"); the midpoint is close
 *  enough to scale a bubble or weight a mean. */
function intervalMidpoint(interval: unknown): number | null {
  const match = String(interval ?? '').match(/^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*$/);
  if (match) return (Number(match[1]) + Number(match[2])) / 2;
  const below = String(interval ?? '').match(/^\s*<\s*(\d+(?:\.\d+)?)\s*$/);
  if (below) return Number(below[1]) / 2;
  const single = Number(interval);
  return Number.isFinite(single) ? single : null;
}

/** Two variables: one bubble per centre, its area proportional to the cluster's size. */
function buildKMeans2DChart(
  centers: [number | null, number | null][],
  names: string[],
  legendNames: string[],
  variables: string[],
  sizes: (number | null)[],
  sizeTexts: (string | null)[]
): EChartsOption[] {
  const largest = Math.max(1, ...sizes.map((size) => size ?? 0));
  const radius = (size: number | null) => (size === null ? 18 : 12 + 36 * Math.sqrt(size / largest));
  const axis = (name: string) => ({
    type: 'value' as const,
    name,
    nameLocation: 'middle' as const,
    nameGap: 32,
    scale: true,
    // Room around the extreme centres so their bubbles do not sit on the axes.
    boundaryGap: ['15%', '15%'] as [string, string],
    nameTextStyle: { color: '#475569', fontWeight: 600 },
    axisLabel: { color: '#475569' },
    splitLine: { lineStyle: { color: '#e2e8f0' } },
  });

  return [
    {
      mipChartHeight: 380,
      title: { text: 'K-Means Centers', show: false },
      legend: { top: 0, textStyle: { color: '#475569' } },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const size = sizeTexts[p.seriesIndex];
          return `${escapeHtml(names[p.seriesIndex])}<br/>${escapeHtml(variables[0])}: <b>${p.value[0].toFixed(2)}</b><br/>${escapeHtml(variables[1])}: <b>${p.value[1].toFixed(2)}</b>` +
            (size === null ? '' : `<br/>${escapeHtml(size)} rows`);
        },
      },
      grid: { top: 64, left: 24, right: 32, bottom: 48, containLabel: true },
      xAxis: axis(variables[0]),
      yAxis: { ...axis(variables[1]), nameLocation: 'end', nameGap: 14, nameTextStyle: { color: '#475569', fontWeight: 600, align: 'left' } },
      series: centers.map(([x, y], i) => ({
        name: legendNames[i],
        type: 'scatter',
        // A centre missing either coordinate has no place on the plot; its legend entry stays.
        data: x === null || y === null ? [] : [[x, y]],
        symbolSize: radius(sizes[i]),
        itemStyle: { opacity: 0.85, borderColor: '#ffffff', borderWidth: 2 },
        label: { show: true, position: 'top', color: '#0f172a', formatter: names[i] },
      })) as any,
    },
  ];
}

/**
 * Three or more variables: one row per cluster, one column per variable, each cell the centre's
 * value. Rows name the clusters, so no colour has to tell five or more lines apart (no categorical
 * palette stays distinct across every pair at that count). Shading compares each centre with the
 * variable's overall mean (centres weighted by cluster size), scaled per column because units differ.
 */
function buildKMeansCentresHeatmap(
  centers: (number | null)[][],
  names: string[],
  variables: string[],
  sizes: (number | null)[]
): EChartsOption[] {
  if (!centers.length || !variables.length) return [];

  // An empty cluster ("0") weighs nothing; an unreadable size drops the weighting for every cluster.
  const sized = sizes.every((size) => size !== null) && sizes.some((size) => size! > 0);
  const weights = sized ? (sizes as number[]) : centers.map(() => 1);
  // Each variable's mean over the clusters that report it; a missing centre shades neutral.
  const deviations = variables.map((_, v) => {
    const reported = centers.map((_center, c) => c).filter((c) => centers[c][v] !== null);
    const totalWeight = reported.reduce((sum, c) => sum + weights[c], 0);
    const mean = totalWeight > 0 ? reported.reduce((sum, c) => sum + weights[c] * centers[c][v]!, 0) / totalWeight : null;
    const raw = centers.map((center) => (center[v] === null || mean === null ? null : center[v]! - mean));
    const largest = Math.max(0, ...raw.map((value) => Math.abs(value ?? 0)));
    return raw.map((value) => (value !== null && largest > 0 ? value / largest : 0));
  });

  const data = centers.flatMap((center, c) =>
    variables.map((_, v) => {
      const shade = deviations[v][c];
      return {
        value: [v, c, shade, center[v]],
        label: { color: cellLabelColor(shade) },
      };
    })
  );

  return [
    {
      mipChartHeight: 110 + 44 * centers.length,
      // The section heading names the chart and the colour bar under it says what the shading means.
      title: { text: 'Cluster centres', show: false },
      tooltip: {
        position: 'top',
        formatter: (p: any) => {
          const [v, c, shade, value] = p.value;
          if (value === null) return `${escapeHtml(names[c])}<br/>${escapeHtml(variables[v])}: not reported`;
          const side = shade > 0 ? 'above' : shade < 0 ? 'below' : 'at';
          return `${escapeHtml(names[c])}<br/>${escapeHtml(variables[v])}: <b>${formatSummaryNumber(value)}</b><br/>${side} the overall mean`;
        },
      },
      grid: { top: 8, left: 8, right: 16, bottom: 48, containLabel: true },
      xAxis: {
        type: 'category',
        data: variables,
        position: 'top',
        axisLine: { show: false },
        axisTick: { show: false },
        // Narrow enough to wrap two-word names before they meet in a 360px compare column.
        axisLabel: { color: AXIS_COLOR, interval: 0, width: 72, overflow: 'break', lineHeight: 15 },
      },
      yAxis: {
        type: 'category',
        data: names,
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        // Name over size ("Cluster 0" / "~66 245"): one long line got clipped at the chart's left edge.
        axisLabel: { color: AXIS_COLOR, interval: 0, lineHeight: 16, formatter: (name: string) => name.replace(' · ', '\n') },
      },
      visualMap: {
        dimension: 2,
        min: -1,
        max: 1,
        orient: 'horizontal',
        left: 'center',
        bottom: 4,
        itemWidth: 12,
        itemHeight: 160,
        text: ['Above mean', 'Below mean'],
        textStyle: { color: AXIS_COLOR },
        inRange: { color: DIVERGING_COLORS },
      },
      series: [
        {
          name: 'Cluster centres',
          type: 'heatmap',
          data,
          itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
          label: { show: true, fontSize: 12, formatter: (p: any) => (p.value[3] === null ? '—' : formatSummaryNumber(p.value[3])) },
        },
      ],
    } as EChartsOption,
  ];
}

function buildKMeansElbowChart(elbow: any): EChartsOption {
  const sortedKs = Object.keys(elbow.inertia_by_k).sort((a, b) => Number(a) - Number(b));
  const selected = String(elbow.selected_k);

  return {
    mipChartHeight: 340,
    // The y-axis measure is the subtitle: as an axis name it ran into the title in a 360px column.
    title: {
      text: 'Elbow Curve',
      subtext: 'Within-cluster sum of squares for each k',
      left: 'center',
    },
    tooltip: {
      trigger: 'axis',
    },
    grid: { top: 64, right: 32, bottom: 48, left: 88 },
    xAxis: {
      type: 'category',
      name: 'k',
      data: sortedKs,
    },
    yAxis: {
      type: 'value',
    },
    series: [
      {
        type: 'line',
        name: 'Within-cluster sum of squares',
        data: sortedKs.map(k => elbow.inertia_by_k[k]),
        symbolSize: 6,
        markPoint: {
          symbol: 'circle',
          symbolSize: 12,
          itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
          label: { show: true, position: 'top', distance: 8, color: '#0f172a', fontWeight: 600, formatter: `k = ${selected}` },
          data: [{ coord: [selected, elbow.inertia_by_k[selected]], name: 'Selected k' }],
        },
      },
    ],
  } as EChartsOption;
}
