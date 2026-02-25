import { EChartsOption } from 'echarts';

export function buildMatrixChart(result: any): EChartsOption[] {
  const charts: EChartsOption[] = [];

  const pickMatrix = (...keys: string[]): any => {
    for (const key of keys) {
      const candidate = result?.[key];
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        return candidate;
      }
    }
    return null;
  };

  const generateChart = (matrix: any, title: string, min: number, max: number, colors?: string[]) => {
    const cols: string[] = matrix?.variables ?? [];
    const rows: string[] = Object.keys(matrix).filter(k => k !== 'variables');

    if (!cols.length || !rows.length) return;

    const heatmapData: [number, number, number][] = [];

    for (let i = 0; i < rows.length; i++) {
      const rowVar = rows[i];
      const values = matrix[rowVar];

      if (!Array.isArray(values)) continue;

      for (let j = 0; j < cols.length; j++) {
        const value = values[j];
        if (value !== null && value !== undefined) {
          heatmapData.push([j, i, value]);
        }
      }
    }

    charts.push({
      title: {
        text: title,
        left: 'center'
      },
      tooltip: { position: 'top' },
      grid: { height: '65%', top: '15%', left: '30%', right: '10%', bottom: '25%' },
      xAxis: {
        type: 'category',
        data: cols,
        splitArea: { show: true },
        nameLocation: 'middle',
        nameGap: 50,
        axisLabel: {
          fontSize: 12,
          rotate: 45,
          interval: 0,
          width: 100,
          overflow: 'break'
        }
      },
      yAxis: {
        type: 'category',
        data: rows,
        splitArea: { show: true },
        nameLocation: 'middle',
        nameGap: 80,
        axisLabel: {
          fontSize: 12,
          interval: 0,
          width: 100,
          overflow: 'break'
        }
      },
      visualMap: {
        min,
        max,
        calculable: true,
        orient: 'vertical',
        left: '90%',
        top: 'center',
        inRange: colors ? { color: colors } : undefined
      },
      series: [
        {
          name: title,
          type: 'heatmap',
          data: heatmapData,
          label: {
            show: true,
            fontSize: 14,
            formatter: (params: any) => params.value[2]?.toFixed(2)
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }
      ]
    });
  };

  // 1. Correlation Matrix
  const correlations = pickMatrix('correlations');
  if (correlations) {
    generateChart(correlations, 'Correlation Matrix', -1, 1);
  }

  // 2. P-Values Matrix
  const pValues = pickMatrix('p_values', 'p-values', 'pvalues');
  if (pValues) {
    generateChart(pValues, 'P-Values', 0, 1, ['#d73027', '#fee090', '#ffffbf']);
  }

  // 3. Confidence Intervals
  const ciLower = pickMatrix('ci_lo', 'low_confidence_intervals');
  if (ciLower) {
    generateChart(ciLower, 'Confidence Interval (Lower 95%)', -1, 1);
  }
  const ciUpper = pickMatrix('ci_hi', 'high_confidence_intervals');
  if (ciUpper) {
    generateChart(ciUpper, 'Confidence Interval (Upper 95%)', -1, 1);
  }

  return charts;
}
