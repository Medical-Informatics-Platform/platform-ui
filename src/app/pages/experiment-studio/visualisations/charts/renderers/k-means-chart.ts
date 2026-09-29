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
    : variables.length === 3
      ? buildKMeans3DChart(centers as [number, number, number][], variables, title)
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

function buildKMeans3DChart(
  centers: [number, number, number][],
  variables: string[],
  title: string
): EChartsOption[] {
  const series: any[] = [
    {
      type: 'scatter3D',
      data: centers,
      symbolSize: 20,
    },
  ];

  return [
    {
      title: {
        text: `${title} (3D)`,
        left: 'center',
      },
      xAxis3D: {
        type: 'value',
        name: variables[0],
      },
      yAxis3D: {
        type: 'value',
        name: variables[1],
      },
      zAxis3D: {
        type: 'value',
        name: variables[2],
      },
      grid3D: {
        boxWidth: 100,
        boxDepth: 100,
        light: {
          main: {
            intensity: 1.2,
          },
          ambient: {
            intensity: 0.3,
          },
        },
      },
      tooltip: {
        formatter: (params: any) => {
          const [x, y, z] = params.value;
          return `${variables[0]}: ${x}<br>${variables[1]}: ${y}<br>${variables[2]}: ${z}`;
        },
      },
      series: series as any, // Type assertion to bypass TS type check
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
      title: {
        text: `${title} (Parallel Coordinates)`,
        left: 'center',
      },
      tooltip: {
        trigger: 'item',
      },
      legend: {
        top: 30,
        type: 'scroll',
      },
      parallel: {
        top: 90,
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

  return {
    title: {
      text: 'Elbow Curve',
      left: 'center',
    },
    tooltip: {
      trigger: 'axis',
    },
    xAxis: {
      type: 'category',
      name: 'k',
      data: sortedKs,
    },
    yAxis: {
      type: 'value',
      name: 'Inertia',
    },
    series: [
      {
        type: 'line',
        name: 'Inertia',
        data: sortedKs.map(k => elbow.inertia_by_k[k]),
        markPoint: {
          data: [
            {
              coord: [String(elbow.selected_k), elbow.inertia_by_k[String(elbow.selected_k)]],
              name: 'Selected k',
            },
          ],
        },
      },
    ],
  } as EChartsOption;
}
