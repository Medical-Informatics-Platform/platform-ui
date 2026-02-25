import { EChartsOption } from 'echarts';

export function buildForestPlotChart(result: any): EChartsOption[] {
    // Supports Linear Regression and Logistic Regression
    // Needs: variables (names), coefficients (values), lower_ci, upper_ci

    let variables: string[] = [];
    let coefficients: number[] = [];
    let lowerCi: number[] = [];
    let upperCi: number[] = [];
    let title = 'Forest Plot';

    // Linear Regression
    if (result.indep_vars && result.coefficients && result.lower_ci && result.upper_ci) {
        variables = result.indep_vars;
        coefficients = result.coefficients;
        lowerCi = result.lower_ci;
        upperCi = result.upper_ci;
        title = 'Linear Regression Coefficients (95% CI)';
    }
    // Logistic Regression
    else if (result.summary && result.indep_vars) {
        const s = result.summary;
        variables = result.indep_vars;
        coefficients = s.coefficients;
        lowerCi = s.lower_ci;
        upperCi = s.upper_ci;
        title = 'Logistic Regression Coefficients (95% CI)';
    } else {
        return [];
    }

    if (!variables.length || variables.length !== coefficients.length) return [];

    const data = variables.map((v, i) => ({
        name: v,
        value: coefficients[i],
        low: lowerCi[i],
        high: upperCi[i]
    })).reverse(); // Reverse to have first variable at top of Y axis

    const option: EChartsOption = {
        title: {
            text: title,
            left: 'center'
        },
        tooltip: {
            trigger: 'item',
            formatter: (params: any) => {
                const item = data[params.dataIndex];
                if (!item) return '';
                return `<b>${item.name}</b><br/>
                    Coef: ${item.value.toFixed(4)}<br/>
                    95% CI: [${item.low.toFixed(4)}, ${item.high.toFixed(4)}]`;
            }
        },
        grid: {
            top: 60,
            left: 20,
            right: 40,
            bottom: 20,
            containLabel: true
        },
        yAxis: {
            type: 'category',
            data: data.map(d => d.name),
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { show: true, lineStyle: { type: 'dashed' } }
        },
        xAxis: {
            type: 'value',
            scale: true,
            axisLabel: {
                formatter: (val: number) => val.toFixed(2)
            },
            splitLine: { show: true }
        },
        series: [
            {
                type: 'custom',
                name: 'Forest Plot',
                renderItem: (params: any, api: any) => {
                    const index = params.dataIndex; // maps to category index in reversed data
                    const item = data[index]; // Use closure for simplicity as logic is coupled to 'data' order

                    // Validations
                    if (item.value === undefined || item.low === undefined || item.high === undefined) return;

                    const y = api.coord([0, index])[1]; // Y position for category

                    // Coordinates using values from closure (which matches data passed below)
                    const xVal = api.coord([item.value, 0])[0];
                    const xLow = api.coord([item.low, 0])[0];
                    const xHigh = api.coord([item.high, 0])[0];

                    const height = api.size([0, 1])[1];
                    const boxHeight = Math.min(height * 0.6, 20);

                    return {
                        type: 'group',
                        children: [
                            // Line for CI
                            {
                                type: 'line',
                                shape: {
                                    x1: xLow, y1: y,
                                    x2: xHigh, y2: y
                                },
                                style: {
                                    stroke: '#333',
                                    lineWidth: 2
                                }
                            },
                            // Cap at Low
                            {
                                type: 'line',
                                shape: {
                                    x1: xLow, y1: y - boxHeight / 2,
                                    x2: xLow, y2: y + boxHeight / 2
                                },
                                style: {
                                    stroke: '#333',
                                    lineWidth: 2
                                }
                            },
                            // Cap at High
                            {
                                type: 'line',
                                shape: {
                                    x1: xHigh, y1: y - boxHeight / 2,
                                    x2: xHigh, y2: y + boxHeight / 2
                                },
                                style: {
                                    stroke: '#333',
                                    lineWidth: 2
                                }
                            },
                            // Point for Coef
                            {
                                type: 'circle',
                                shape: {
                                    cx: xVal, cy: y, r: 5
                                },
                                style: {
                                    fill: '#5470c6',
                                    stroke: '#333'
                                }
                            }
                        ]
                    };
                },
                // Pass full data for auto-scaling
                data: data.map((d, i) => [d.value, d.low, d.high, i]),
                encode: {
                    x: [0, 1, 2], // Value, Low, High map to X axis
                    y: 3          // Index maps to Y axis
                }
            }
        ]
    };

    // Add a vertical line at x=0
    (option.series as any[]).push({
        type: 'line',
        markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#ccc', type: 'solid' },
            data: [{ xAxis: 0 }]
        }
    });

    return [option];
}
