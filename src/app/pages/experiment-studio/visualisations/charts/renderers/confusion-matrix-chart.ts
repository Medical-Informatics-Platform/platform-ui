import { EChartsOption } from 'echarts';
import { cellLabelColor } from '../chart-palette';
import { escapeHtml } from '../../../../../core/html.utils';

export interface ConfusionMatrix {
  labels: string[];
  /** rows = actual class, columns = predicted class */
  matrix: number[][];
}

/**
 * Reads both Exaflow shapes — `{ data, labels }` and the binary `{ tp, fp, fn, tn }` — and drops
 * classes that never occur on either side (an enumeration like "unknown" with an all-zero row
 * and column says nothing about the model).
 */
export function readConfusionMatrix(cm: any): ConfusionMatrix | null {
  let matrix: number[][] = [];
  let labels: string[] = [];

  if (Array.isArray(cm?.data) && Array.isArray(cm?.labels)) {
    matrix = cm.data.map((row: unknown[]) => (Array.isArray(row) ? row.map((value) => Number(value) || 0) : []));
    labels = cm.labels.map((label: unknown) => String(label));
  } else if (cm && cm.tp !== undefined && cm.fp !== undefined && cm.fn !== undefined && cm.tn !== undefined) {
    matrix = [
      [Number(cm.tp) || 0, Number(cm.fn) || 0],
      [Number(cm.fp) || 0, Number(cm.tn) || 0],
    ];
    const positive = typeof cm.positive_label === 'string' && cm.positive_label ? cm.positive_label : null;
    labels = positive ? [positive, `not ${positive}`] : ['Positive', 'Negative'];
  }

  if (!matrix.length || matrix.length !== labels.length) return null;

  const keep = labels
    .map((_, i) => i)
    .filter((i) => matrix[i].some((value) => value !== 0) || matrix.some((row) => (row[i] ?? 0) !== 0));
  if (!keep.length) return null;

  return {
    labels: keep.map((i) => labels[i]),
    matrix: keep.map((i) => keep.map((j) => matrix[i][j] ?? 0)),
  };
}

export function buildConfusionMatrixChart(result: any): EChartsOption[] {
  const confusion = readConfusionMatrix(result?.confusion_matrix);
  if (!confusion) return [];
  const { labels, matrix } = confusion;

  // Shade by share of the actual class, so a large majority class does not wash out the rest.
  const heatmapData = matrix.flatMap((row, i) => {
    const total = row.reduce((sum, value) => sum + value, 0);
    return row.map((count, j) => {
      const share = total > 0 ? count / total : 0;
      return {
        value: [j, i, share],
        count,
        label: { color: cellLabelColor(share) },
      };
    });
  });

  return [
    {
      mipChartHeight: 156 + 56 * labels.length,
      title: {
        text: 'Confusion Matrix',
        // Two short lines, so the caption fits a 360px compare column.
        subtext: 'Rows: actual · columns: predicted\nShading: share of the actual class',
        left: 'center',
      },
      tooltip: {
        position: 'top',
        formatter: (params: any) => {
          const [predictedIdx, actualIdx, share] = params.value;
          const actual = escapeHtml(labels[actualIdx]);
          return `Actual: ${actual}<br/>Predicted: ${escapeHtml(labels[predictedIdx])}<br/>Count: <b>${params.data.count.toLocaleString('en-US')}</b> (${(share * 100).toFixed(1)}% of actual ${actual})`;
        },
      },
      grid: { top: 80, left: 28, right: 16, bottom: 40, containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
        name: 'Predicted',
        nameLocation: 'middle',
        nameGap: 28,
        nameTextStyle: { color: '#475569', fontWeight: 600 },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#475569', interval: 0 },
      },
      yAxis: {
        type: 'category',
        data: labels,
        inverse: true,
        name: 'Actual',
        nameLocation: 'middle',
        nameGap: 56,
        nameTextStyle: { color: '#475569', fontWeight: 600 },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#475569', interval: 0 },
      },
      visualMap: {
        show: false,
        min: 0,
        max: 1,
        inRange: { color: ['#f1f5f9', '#2b33e9'] },
      },
      series: [
        {
          name: 'Confusion Matrix',
          type: 'heatmap',
          data: heatmapData,
          itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
          label: {
            show: true,
            fontSize: 13,
            // ECharts' default line height sets the count and its share line on top of each other.
            lineHeight: 18,
            formatter: (params: any) => `${params.data.count.toLocaleString('en-US')}\n${(params.value[2] * 100).toFixed(1)}%`,
          },
        },
      ],
    } as EChartsOption,
  ];
}
