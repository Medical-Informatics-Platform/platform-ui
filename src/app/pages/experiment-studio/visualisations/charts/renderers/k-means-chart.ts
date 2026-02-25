import { EChartsOption } from 'echarts';

export function buildKMeansChart(output: any): EChartsOption[] {
  const centers = output?.centers;
  const title = 'K-Means Centers';

  if (!Array.isArray(centers) || centers.length === 0) {
    console.warn('[KMeans] No centers provided.');
    return [];
  }

  const dims = centers[0].length;

  if (dims === 2) {
    return buildKMeans2DChart(centers, title);
  } else if (dims === 3) {
    return buildKMeans3DChart(centers, title);
  } else {
    return buildKMeansParallelCoordinatesChart(centers, title);
  }
}

function buildKMeans2DChart(centers: [number, number][], title: string): EChartsOption[] {
  const series = centers.map(([x, y]: [number, number], i: number) => ({
    name: `Cluster ${i + 1}`,
    type: 'scatter',
    data: [[x, y]],
    symbolSize: 20,
    label: {
      show: true,
      formatter: `Cluster ${i + 1}`,
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
        name: 'x',
      },
      yAxis: {
        type: 'value',
        name: 'y',
      },
      series: series as any,
    },
  ];
}

function buildKMeans3DChart(centers: [number, number, number][], title: string): EChartsOption[] {
  const series: any[] = [
    {
      type: 'scatter3D',
      data: centers,
      symbolSize: 20,
      label: {
        // show: true,
        // formatter: (_: any, i: number) => `Cluster ${i + 1}`,
      },
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
        name: 'x',
      },
      yAxis3D: {
        type: 'value',
        name: 'y',
      },
      zAxis3D: {
        type: 'value',
        name: 'z',
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
          return `x: ${x}<br>y: ${y}<br>z: ${z}`;
        },
      },
      series: series as any, // Type assertion to bypass TS type check
    },
  ];
}

function buildKMeansParallelCoordinatesChart(centers: number[][], title: string): EChartsOption[] {
  if (!centers.length || !Array.isArray(centers[0])) return [];

  const dims = centers[0].length;
  const parallelAxis = Array.from({ length: dims }, (_, i) => ({
    dim: i,
    name: `Dim ${i + 1}`,
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
        name: `Cluster ${i + 1}`,
        data: [center],
        lineStyle: {
          width: 2,
          opacity: 0.85,
        },
      })),
    },
  ];
}
