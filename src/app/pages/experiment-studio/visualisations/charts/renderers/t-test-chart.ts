import { EChartsOption } from 'echarts';

export function buildTTestChart(result: any): EChartsOption[] {
    // Visualizes Mean Difference with 95% CI
    const meanDiff = Number(result?.mean_diff);
    const lower = Number(result?.ci_lower);
    const upper = Number(result?.ci_upper);
    const pValue = Number(result?.p);

    if (!Number.isFinite(meanDiff) || !Number.isFinite(lower) || !Number.isFinite(upper)) return [];

    const title = `Mean Difference (95% CI)\np-value: ${Number.isFinite(pValue) ? pValue.toExponential(3) : 'N/A'}`;

    const option: EChartsOption = {
        title: {
            text: title,
            left: 'center',
            textStyle: { fontSize: 14 }
        },
        tooltip: {
            show: true,
            formatter: () => {
                return `<b>Mean Difference</b>: ${meanDiff.toFixed(4)}<br/>` +
                    `<b>95% CI</b>: [${lower.toFixed(4)}, ${upper.toFixed(4)}]`;
            }
        },
        grid: {
            top: 80,
            bottom: 50,
            left: 100,
            right: 50
        },
        yAxis: {
            type: 'category',
            data: ['Diff'],
            axisLine: { show: false },
            axisTick: { show: false }
        },
        xAxis: {
            type: 'value',
            scale: true,
            axisLabel: {
                formatter: (val: number) => val.toFixed(2)
            }
        },
        series: [
            {
                type: 'custom',
                renderItem: (params: any, api: any) => {
                    const y = api.coord([0, 0])[1]; // y index 0

                    const val = api.value(0);
                    const low = api.value(1);
                    const high = api.value(2);

                    const xVal = api.coord([val, 0])[0];
                    const xLow = api.coord([low, 0])[0];
                    const xHigh = api.coord([high, 0])[0];

                    return {
                        type: 'group',
                        children: [
                            {
                                type: 'line',
                                shape: { x1: xLow, y1: y, x2: xHigh, y2: y },
                                style: { stroke: '#333', lineWidth: 2 }
                            },
                            {
                                type: 'line',
                                shape: { x1: xLow, y1: y - 5, x2: xLow, y2: y + 5 },
                                style: { stroke: '#333', lineWidth: 2 }
                            },
                            {
                                type: 'line',
                                shape: { x1: xHigh, y1: y - 5, x2: xHigh, y2: y + 5 },
                                style: { stroke: '#333', lineWidth: 2 }
                            },
                            {
                                type: 'circle',
                                shape: { cx: xVal, cy: y, r: 6 },
                                style: { fill: '#5470c6', stroke: '#333' }
                            }
                        ]
                    };
                },
                // Pass data so axis scales correctly
                data: [[meanDiff, lower, upper]],
                // Map all dimensions to X axis for scaling
                encode: {
                    x: [0, 1, 2],
                    y: -1
                }
            },
            // Markline at 0
            {
                type: 'line',
                markLine: {
                    silent: true,
                    symbol: 'none',
                    data: [{ xAxis: 0 }],
                    lineStyle: { color: '#999', type: 'dashed' }
                }
            }
        ]
    };

    return [option];
}
