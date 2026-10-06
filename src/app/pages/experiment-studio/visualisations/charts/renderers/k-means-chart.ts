import { EChartsOption } from 'echarts';

export function buildKMeansChart(output: any): EChartsOption[] {
  const clusters = output?.clusters;
  const title = 'K-Means Centers';

  if (!Array.isArray(clusters) || clusters.length === 0) return [];

  const variables: string[] = output.variables ?? [];
  const names: string[] = clusters.map((c: any) => c.label);
  const centers: number[][] = clusters.map((c: any) => variables.map((v: string) => c.center[v]));

  const sizes: (number | null)[] = clusters.map((c: any) => intervalMidpoint(c.size_interval));
  // Legend entries carry each cluster's size, so the centres table is not needed on screen.
  const legendNames = names.map((name, i) => (sizes[i] === null ? name : `${name} · ~${Math.round(sizes[i]!).toLocaleString('en-US')}`));
  const charts = variables.length === 2
    ? buildKMeans2DChart(centers as [number, number][], names, legendNames, variables, sizes)
    : buildKMeansParallelCoordinatesChart(centers, legendNames, variables, title);

  if (output.elbow) {
    charts.push(buildKMeansElbowChart(output.elbow));
  }

  return charts;
}

/** Cluster sizes arrive as privacy-safe intervals ("87520-87529"); the midpoint is close enough to scale a bubble. */
function intervalMidpoint(interval: unknown): number | null {
  const match = String(interval ?? '').match(/^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*$/);
  if (match) return (Number(match[1]) + Number(match[2])) / 2;
  const single = Number(interval);
  return Number.isFinite(single) ? single : null;
}

/** Two variables: one bubble per centre, its area proportional to the cluster's size. */
function buildKMeans2DChart(
  centers: [number, number][],
  names: string[],
  legendNames: string[],
  variables: string[],
  sizes: (number | null)[]
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
          const size = sizes[p.seriesIndex];
          return `${names[p.seriesIndex]}<br/>${variables[0]}: <b>${p.value[0].toFixed(2)}</b><br/>${variables[1]}: <b>${p.value[1].toFixed(2)}</b>` +
            (size === null ? '' : `<br/>~${Math.round(size).toLocaleString('en-US')} rows`);
        },
      },
      grid: { top: 64, left: 24, right: 32, bottom: 48, containLabel: true },
      xAxis: axis(variables[0]),
      yAxis: { ...axis(variables[1]), nameLocation: 'end', nameGap: 14, nameTextStyle: { color: '#475569', fontWeight: 600, align: 'left' } },
      series: centers.map(([x, y], i) => ({
        name: legendNames[i],
        type: 'scatter',
        data: [[x, y]],
        symbolSize: radius(sizes[i]),
        itemStyle: { opacity: 0.85, borderColor: '#ffffff', borderWidth: 2 },
        label: { show: true, position: 'top', color: '#0f172a', formatter: names[i] },
      })) as any,
    },
  ];
}

function buildKMeansParallelCoordinatesChart(
  centers: number[][],
  names: string[],
  variables: string[],
  title: string
): EChartsOption[] {
  if (!centers.length || !Array.isArray(centers[0])) return [];

  const dims = centers[0].length;
  const parallelAxis = Array.from({ length: dims }, (_, i) => ({
    dim: i,
    name: variables[i],
  }));

  return [
    {
      // Each axis keeps its own scale, so variables in different units share one profile line per cluster.
      mipChartHeight: 380,
      title: {
        text: `${title} (Parallel Coordinates)`,
        show: false,
      },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => `${p.seriesName}<br/>` +
          variables.map((variable, d) => `${variable}: <b>${Number(p.value?.[d]).toFixed(2)}</b>`).join('<br/>'),
      },
      legend: {
        top: 0,
        type: 'scroll',
      },
      parallel: {
        top: 64,
        left: 70,
        right: 70,
        bottom: 60,
      },
      parallelAxis,
      series: centers.map((center, i) => ({
        type: 'parallel',
        name: names[i],
        data: [center],
        lineStyle: {
          width: 2,
          opacity: 0.85,
        },
      })),
    },
  ];
}

function buildKMeansElbowChart(elbow: any): EChartsOption {
  const sortedKs = Object.keys(elbow.inertia_by_k).sort((a, b) => Number(a) - Number(b));
  const selected = String(elbow.selected_k);

  return {
    mipChartHeight: 340,
    title: {
      text: 'Elbow Curve',
      left: 'center',
      textStyle: { fontSize: 13, fontWeight: 600, color: '#0f172a' },
    },
    tooltip: {
      trigger: 'axis',
    },
    grid: { top: 56, right: 32, bottom: 48, left: 88 },
    xAxis: {
      type: 'category',
      name: 'k',
      data: sortedKs,
    },
    yAxis: {
      type: 'value',
      name: 'Within-cluster sum of squares',
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
