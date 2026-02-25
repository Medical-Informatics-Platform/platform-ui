import { EChartsOption } from 'echarts';

export function buildBarChart(result: any): EChartsOption[] {
  const table = result?.anova_table;
  if (!table) return [];

  const explained = Number(table?.ss_explained);
  const residual = Number(table?.ss_residual);
  if (!Number.isFinite(explained) && !Number.isFinite(residual)) return [];

  return [
    {
      title: {
        text: 'ANOVA Sum of Squares',
        left: 'center',
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
      },
      grid: {
        top: 56,
        right: 24,
        bottom: 56,
        left: 64,
      },
      xAxis: {
        type: 'category',
        data: ['Explained', 'Residual'],
        axisLabel: {
          interval: 0,
        },
      },
      yAxis: {
        type: 'value',
        name: 'Sum of Squares',
      },
      series: [
        {
          type: 'bar',
          data: [Number.isFinite(explained) ? explained : 0, Number.isFinite(residual) ? residual : 0],
          itemStyle: {
            color: (params: any) => params?.dataIndex === 0 ? '#2b33e9' : '#7f9ce8',
          },
          label: {
            show: true,
            position: 'top',
            formatter: (params: any) => {
              const val = Number(params?.value);
              return Number.isFinite(val) ? val.toFixed(3).replace(/\.?0+$/, '') : '';
            },
          },
        },
      ],
    },
  ];
}
