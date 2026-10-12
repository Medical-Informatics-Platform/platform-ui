import { EChartsOption } from "echarts";
import type { LineSeriesOption } from 'echarts';
import { escapeHtml } from '../../../../../core/html.utils';


export function buildRocCurveChart(result: any): EChartsOption[] {
  const rocCurves: any[] = result?.roc_curves;
  if (!rocCurves || !Array.isArray(rocCurves)) {
    console.warn('[ROC Chart] Invalid or missing roc_curves');
    return [];
  }

  const series: LineSeriesOption[] = [];
  // Short legend entries ("Fold 1 · 0.864", the AUC after the dot) so five folds fit one row.
  const aucByName: Record<string, string> = {};

  for (const fold of rocCurves) {
    const fpr = fold.fpr;
    const tpr = fold.tpr;
    const auc = fold.auc;
    const name = String(fold.name || 'Fold').replace(/^fold_?(\d+)$/i, 'Fold $1');
    if (typeof auc === 'number' && !isNaN(auc)) aucByName[name] = auc.toFixed(3);

    if (!Array.isArray(fpr) || !Array.isArray(tpr) || fpr.length !== tpr.length) {
      console.warn(`[ROC Chart] Invalid data for ${name}`);
      continue;
    }

    const points = fpr.map((x, i) => [x, tpr[i]]);

    series.push({
      name,
      type: 'line' as const,
      data: points,
      showSymbol: false,
      emphasis: {
        focus: 'series',
      },
    });
  }

  // Chance line: a classifier that guesses sits on the diagonal (AUC 0.5).
  series.push({
    name: 'Chance',
    type: 'line' as const,
    data: [[0, 0], [1, 1]],
    showSymbol: false,
    silent: true,
    lineStyle: { color: '#94a3b8', type: 'dashed', width: 1 },
    itemStyle: { color: '#94a3b8' },
    tooltip: { show: false },
  });

  return [
    {
      mipChartHeight: 440,
      title: {
        text: 'ROC Curve',
        left: 'center',
      },
      grid: {
        containLabel: true,
        top: 76,
        left: 40,
        right: 24,
        bottom: 32,
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
        // Every fold's nearest point, not only the first fold's.
        formatter: (params: any) => (Array.isArray(params) ? params : [params])
          .filter((p: any) => p.seriesName !== 'Chance')
          .map((p: any) => `${p.marker}${escapeHtml(p.seriesName)}: FPR ${p.value[0].toFixed(2)}, TPR ${p.value[1].toFixed(2)}`)
          .join('<br/>'),
      },
      legend: {
        top: 32,
        type: 'scroll',
        textStyle: { color: '#475569' },
        formatter: (name: string) => (aucByName[name] ? `${name} · ${aucByName[name]}` : name),
      },
      series,
    },
  ];
}
