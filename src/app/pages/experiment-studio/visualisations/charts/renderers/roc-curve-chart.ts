import { EChartsOption } from "echarts";
import type { LineSeriesOption } from 'echarts';


export function buildRocCurveChart(result: any): EChartsOption[] {
  const rocCurves: any[] = result?.roc_curves;
  if (!rocCurves || !Array.isArray(rocCurves)) {
    console.warn('[ROC Chart] Invalid or missing roc_curves');
    return [];
  }

  const series: LineSeriesOption[] = [];

  for (const fold of rocCurves) {
    const fpr = fold.fpr;
    const tpr = fold.tpr;
    const auc = fold.auc;
    const name = fold.name || `Fold`;
    const label = (typeof auc === 'number' && !isNaN(auc)) ? `${name} (AUC: ${auc.toFixed(3)})` : name;

    if (!Array.isArray(fpr) || !Array.isArray(tpr) || fpr.length !== tpr.length) {
      console.warn(`[ROC Chart] Invalid data for ${name}`);
      continue;
    }

    const points = fpr.map((x, i) => [x, tpr[i]]);

    series.push({
      name: label,
      type: 'line' as const,
      data: points,
      smooth: true,
      showSymbol: false,
      emphasis: {
        focus: 'series',
      },
    });
  }

  return [
    {
      title: {
        text: 'ROC Curve',
        left: 'center',
      },
      grid: {
        containLabel: true,
        bottom: '20%',
      },
      xAxis: {
        type: 'value',
        name: 'False Positive Rate',
        nameLocation: 'middle',
        nameGap: 30,
        min: 0,
        max: 1,
      },
      yAxis: {
        type: 'value',
        name: 'True Positive Rate',
        nameLocation: 'middle',
        nameGap: 40,
        min: 0,
        max: 1,
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          const { seriesName, value } = p;
          return `${seriesName}<br/>FPR: ${value[0].toFixed(2)}<br/>TPR: ${value[1].toFixed(2)}`;
        },
      },
      legend: {
        top: 'bottom',
      },
      series,
    },
  ];
}
