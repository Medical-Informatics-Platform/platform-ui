import { EChartsOption } from 'echarts';

/**
 * Scientific SVM visualization:
 * - Histogram of support vector magnitudes
 * - Decision boundary (coeff)
 * - ±1 margins
 */
export function buildSVMChart(result: any): EChartsOption[] {
  const supportVectors: number[] = result?.weights ?? [];
  const coeff: number[] = typeof result?.intercept === 'number' ? [result.intercept] : [];

  if (!supportVectors.length) {
    console.warn('[SVM] No support vectors or weights provided.');
    return [];
  }

  const coeffValue = coeff.length ? coeff[0] : 0;

  // Histogram bins
  const numBins = 25;
  const min = Math.min(...supportVectors);
  const max = Math.max(...supportVectors);
  const span = max - min;
  const binSize = span === 0 ? 1 : span / numBins;

  const bins = Array(numBins).fill(0);
  for (const val of supportVectors) {
    const index = Math.min(Math.floor((val - min) / binSize), numBins - 1);
    bins[index]++;
  }

  const binCenters = bins.map((_, i) => min + (i + 0.5) * binSize);

  // Margin lines
  const marginPlus = coeffValue + 1;
  const marginMinus = coeffValue - 1;

  // Histogram chart
  const chart: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const p = params[0];
        return `
          <strong>Range:</strong> ${p.name}<br>
          <strong>Count:</strong> ${p.value}
        `;
      },
    },
    xAxis: {
      type: 'category',
      name: 'Weight Value',
      nameLocation: 'middle', // x label
      nameGap: 40,
      data: binCenters.map((x) => x.toFixed(2)),
      axisLabel: { rotate: 45, fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: 'Frequency',
      axisLabel: { fontSize: 12 },
    },
    title: {
      text: 'SVM Support Vector Distribution',
      subtext: coeff.length
        ? `Model Coefficient = ${coeffValue.toFixed(3)}`
        : '',
      left: 'center',
      textStyle: { fontSize: 18 },
      subtextStyle: { fontSize: 12 },
    },
    series: [
      {
        name: 'Support Vectors',
        type: 'bar',
        data: bins,
        itemStyle: { color: '#7f9ce8' },     // MIP light_blue
        barWidth: '75%',
      },
      {
        name: 'Decision Boundary',
        type: 'line',
        markLine: {
          symbol: 'none',
          data: [
            { xAxis: coeffValue, name: 'Margin (0)' },
            { xAxis: marginPlus, name: '+1 Margin' },
            { xAxis: marginMinus, name: '-1 Margin' },
          ],
          lineStyle: {
            color: '#ffba08',                  // MIP orange
            width: 2,
            type: 'solid',
          },
          label: {
            show: true,
            position: 'insideEndTop',
            formatter: '{b}',
            color: '#0f172a',                  // MIP text-main
          },
        },
      },
    ],
    grid: {
      left: 80,
      right: 40,
      top: 80,
      bottom: 100,
      containLabel: true,
    },
  };

  return [chart];
}
