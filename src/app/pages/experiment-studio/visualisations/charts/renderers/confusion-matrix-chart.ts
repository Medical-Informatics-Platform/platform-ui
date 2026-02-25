import { EChartsOption } from 'echarts';

export function buildConfusionMatrixChart(result: any): EChartsOption[] {
  let matrix: number[][] = [];
  let classNames: string[] = [];

  const cm = result?.confusion_matrix;
  if (!cm) return [];

  // Format 1: { data: number[][], labels: string[] }
  if (Array.isArray(cm.data) && Array.isArray(cm.labels)) {
    matrix = cm.data;
    classNames = cm.labels;
  }
  // Format 2: { tp, fp, fn, tn }
  else if (cm.tp !== undefined && cm.fp !== undefined && cm.fn !== undefined && cm.tn !== undefined) {
    // Rows = Actual [Positive, Negative], Columns = Predicted [Positive, Negative]
    matrix = [
      [cm.tp, cm.fn],
      [cm.fp, cm.tn]
    ];
    classNames = ['Positive', 'Negative'];
  }

  if (matrix.length === 0 || classNames.length === 0) {
    console.warn('[ConfusionMatrix] Empty matrix or labels');
    return [];
  }

  // Dimension Sanity Check
  if (matrix.length !== classNames.length) {
    console.warn(`[ConfusionMatrix] Dimension mismatch: ${matrix.length} rows vs ${classNames.length} labels`);
  }

  const heatmapData: [number, number, number][] = [];
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i]; // row index i = Actual category index
    if (!Array.isArray(row)) continue;
    for (let j = 0; j < row.length; j++) {
      // j = Predicted category index
      heatmapData.push([j, i, row[j]]); // [col, row, value] -> [Predicted, Actual, Value]
    }
  }

  return [
    {
      title: {
        text: 'Confusion Matrix',
        subtext: 'Rows: Actual (True) | Columns: Predicted',
        left: 'center',
        top: 0,
        subtextStyle: {
          color: '#666',
          fontSize: 12,
        },
      },
      tooltip: {
        position: 'top',
        formatter: (params: any) => {
          const [predictedIdx, actualIdx, val] = params.value;
          return `Actual (True): ${classNames[actualIdx]}<br/>Predicted: ${classNames[predictedIdx]}<br/>Count: ${val}`;
        },
      },
      grid: {
        height: '60%', // Slightly smaller to ensure title + legend fit well
        top: 60,       // More top room for title/subtitle
        left: 40,      // Safe left buffer
        right: 80,
        bottom: 110,    // Ample room for 45 deg rotated labels
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: classNames,
        nameGap: 55,
        splitArea: { show: true },
        axisLabel: {
          fontSize: 12,
          rotate: 45,
          interval: 0
        },
      },
      yAxis: {
        type: 'category',
        data: classNames,
        nameGap: 100,
        splitArea: { show: true },
        axisLabel: {
          fontSize: 12,
          rotate: 0,
          interval: 0
        }
      },
      visualMap: {
        min: 0,
        max: (() => {
          const flat = matrix.flat().filter(v => typeof v === 'number' && !isNaN(v));
          return flat.length > 0 ? Math.max(...flat) : 1;
        })(),
        calculable: true,
        orient: 'vertical',
        right: 0,
        top: 'center',
      },
      series: [
        {
          name: 'Confusion Matrix',
          type: 'heatmap',
          data: heatmapData,
          label: {
            show: true,
            formatter: (params: any) => `${params.value[2]}`,
            color: '#000',
            fontSize: 14,
          },
          emphasis: {
            itemStyle: {
              borderColor: '#333',
              borderWidth: 1,
            },
          },
        },
      ],
    },
  ];
}


