import { EChartsOption } from 'echarts';

export function buildKMeansChart(output: any): EChartsOption[] {
  const clusters = output?.clusters;
  const title = 'K-Means Centers';

  if (!Array.isArray(clusters) || clusters.length === 0) return [];

  const variables: string[] = output.variables ?? [];
  const names: string[] = clusters.map((c: any) => c.label);
  const centers: number[][] = clusters.map((c: any) => variables.map((v: string) => c.center[v]));

  const charts = variables.length === 2
    ? buildKMeans2DChart(centers as [number, number][], names, variables, title)
    : buildKMeansParallelCoordinatesChart(centers, names, variables, title);

  if (output.elbow) {
    charts.push(buildKMeansElbowChart(output.elbow));
  }

  return charts;
}

function buildKMeans2DChart(
  centers: [number, number][],
  names: string[],
  variables: string[],
  title: string
): EChartsOption[] {
  const series = centers.map(([x, y]: [number, number], i: number) => ({
    name: names[i],
    type: 'scatter',
    data: [[x, y]],
    symbolSize: 20,
    label: {
      show: true,
      formatter: names[i],
      position: 'top',
    },
  }));

  return [
    {
      title: {
        text: title,
        left: 'center',
      },
      xAxis: {
        type: 'value',
        name: variables[0],
      },
      yAxis: {
        type: 'value',
        name: variables[1],
      },
      series: series as any,
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
