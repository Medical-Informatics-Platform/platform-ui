import { EChartsOption } from "echarts";

export function buildPCAHeatmapChart(result: any): EChartsOption[] {
  const matrix = result?.eigenvectors;

  if (!matrix || !Array.isArray(matrix)) {
    console.warn('[PCAHeatmap] Eigenvectors missing or invalid');
    return [];
  }

  const nComponents = matrix.length;
  const nVariables = matrix[0]?.length ?? 0;

  if (!nComponents || !nVariables) {
    console.warn('[PCAHeatmap] Invalid shape');
    return [];
  }

  let variableNames = result?.variable_names;
  if (!Array.isArray(variableNames) || variableNames.length === 0) {
    variableNames = Array.from({ length: nVariables }, (_, i) => `Var${i + 1}`);
  } else if (variableNames.length !== nVariables) {
    console.warn(`[PCAHeatmap] Label count mismatch: expected ${nVariables}, got ${variableNames.length}`);
    // If we have more labels than variables, truncate. If less, pad.
    if (variableNames.length > nVariables) {
      variableNames = variableNames.slice(0, nVariables);
    } else {
      const padding = Array.from({ length: nVariables - variableNames.length }, (_, i) => `Var${variableNames.length + i + 1}`);
      variableNames = [...variableNames, ...padding];
    }
  }
  const componentNames = Array.from({ length: nComponents }, (_, i) => `PC${i + 1}`);

  const heatmapData: [number, number, number][] = [];

  for (let i = 0; i < nComponents; i++) {
    for (let j = 0; j < nVariables; j++) {
      const value = matrix[i][j];
      heatmapData.push([j, i, value]);
    }
  }

  const charts: EChartsOption[] = [];
  // 1. Loadings Heatmap
  charts.push({
    title: {
      text: 'Eigenvectors',
      left: 'center'
    },
    tooltip: {
      position: 'top',
      formatter: (params: any) => {
        const [x, y, val] = params.value;
        return `PC: ${componentNames[y]}<br/>Var: ${variableNames[x]}<br/>Weight: ${val.toFixed(3)}`;
      },
    },
    grid: {
      height: '65%',
      top: '15%',
      left: '10%',
      right: '10%',
      bottom: '25%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: variableNames,
      splitArea: { show: true },
      axisLabel: {
        fontSize: 12,
        rotate: 45,
        interval: 0,
        width: 100,
        overflow: 'break'
      },
    },
    yAxis: {
      type: 'category',
      data: componentNames,
      splitArea: { show: true },
      axisLabel: {
        fontSize: 12, // Consistent font size
        interval: 0
      }
    },
    visualMap: {
      min: -1,
      max: 1,
      calculable: true,
      orient: 'vertical',
      left: '95%',
      top: 'center',
    },
    series: [
      {
        name: 'Eigenvector weights',
        type: 'heatmap',
        data: heatmapData,
        label: {
          show: true,
          fontSize: 14,
          formatter: (params: any) => params.value[2]?.toFixed(2),
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      },
    ],
  });

  // 2. Scree Plot (Eigenvalues)
  const eigenvalues = result?.eigenvalues;
  if (Array.isArray(eigenvalues) && eigenvalues.length > 0) {
    charts.push({
      title: {
        text: 'Scree Plot (Eigenvalues)',
        left: 'center'
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' }
      },
      grid: {
        height: '65%',
        top: '15%',
        left: '10%',
        right: '10%',
        bottom: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: componentNames,
        axisLabel: { interval: 0, rotate: 30 }
      },
      yAxis: {
        type: 'value',
        name: 'Eigenvalue',
        nameLocation: 'middle',
        nameGap: 50
      },
      series: [
        {
          name: 'Eigenvalue',
          type: 'bar',
          data: eigenvalues.map((v: number) => parseFloat(v.toFixed(3))),
          itemStyle: { color: '#5470c6' },
          label: {
            show: true,
            position: 'top'
          }
        },
        {
          name: 'Eigenvalue (Line)',
          type: 'line',
          data: eigenvalues.map((v: number) => parseFloat(v.toFixed(3))),
          itemStyle: { color: '#ee6666' },
          symbol: 'circle',
          symbolSize: 8
        }
      ]
    });
  }

  return charts;
}
