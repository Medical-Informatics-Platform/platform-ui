import { EChartsOption } from 'echarts';

export function buildTwoWayAnovaChart(result: any): EChartsOption[] {
    // Visualizes Sum of Squares and Mean Squares for Two-Way ANOVA terms

    const terms = result.terms || [];
    const sumSq = result.sum_sq || [];
    const meanSq = result.mean_sq || []; // Optional, might not be present or computed

    if (!terms.length || !sumSq.length) return [];

    // If sumSq is object (term -> value)
    let dataSS: { name: string, value: number }[] = [];

    if (!Array.isArray(sumSq) && typeof sumSq === 'object') {
        dataSS = terms.map((t: string) => ({ name: t, value: sumSq[t] }));
    } else if (Array.isArray(sumSq)) {
        dataSS = terms.map((t: string, i: number) => ({ name: t, value: sumSq[i] }));
    }

    // Filter out invalid values
    dataSS = dataSS.filter(d => typeof d.value === 'number');

    if (dataSS.length === 0) return [];

    const chartSS: EChartsOption = {
        title: {
            text: 'Two-Way ANOVA: Sum of Squares',
            left: 'center'
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' }
        },
        grid: {
            bottom: '15%'
        },
        xAxis: {
            type: 'category',
            data: dataSS.map(d => d.name),
            axisLabel: { rotate: 30, interval: 0 }
        },
        yAxis: {
            type: 'value',
            name: 'Sum of Squares'
        },
        series: [
            {
                type: 'bar',
                data: dataSS.map(d => d.value),
                itemStyle: { color: '#5470c6' },
                label: { show: true, position: 'top', formatter: (p: any) => p.value.toFixed(2) }
            }
        ]
    };

    return [chartSS];
}
