import { EChartsOption } from 'echarts';

export function buildCorrelationChart(result: any): EChartsOption[] {
  const correlations = result?.output?.correlations;
  if (!correlations || !Array.isArray(correlations)) return [];

  const variablesSet = new Set<string>();

  // Extract all variable names
  for (const entry of correlations) {
    entry.variables?.forEach((v: string) => variablesSet.add(v));
  }
  const variables = Array.from(variablesSet);

  // Create matrix of values
  const heatmapData = [];

  for (let i = 0; i < variables.length; i++) {
    for (let j = 0; j < variables.length; j++) {
      const var1 = variables[i];
      const var2 = variables[j];

      const value = correlations.find(c =>
        c.variables.includes(var1) && c.variables.includes(var2)
      )?.values?.[var1]?.[var2] ?? null;

      heatmapData.push([j, i, value]);
    }
  }

  return [
    {
      tooltip: {
        position: 'top',
      },
      grid: {
        height: '80%',
        top: '10%',
      },
      xAxis: {
        type: 'category',
        data: variables,
        splitArea: { show: true },
      },
      yAxis: {
        type: 'category',
        data: variables,
        splitArea: { show: true },
      },
      visualMap: {
        min: -1,
        max: 1,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '5%',
      },
      series: [
        {
          name: 'Correlation',
          type: 'heatmap',
          data: heatmapData,
          label: { show: true },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
    },
  ];
}
