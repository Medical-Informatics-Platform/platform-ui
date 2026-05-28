import { EChartsOption } from 'echarts';
import { clipHistogramNullEdges } from '../../histogram/histogram-chart';

export function buildHistogramChart(result: any): EChartsOption[] {
    const histogramData = result?.histogram;
    if (!Array.isArray(histogramData) || histogramData.length === 0) return [];

    return histogramData.flatMap((item: any) => {
        const clipped = clipHistogramNullEdges(item.bins || [], item.counts || []);
        const bins = clipped.bins;
        const counts = clipped.counts;
        if (!bins.length || !counts.length) {
            return [];
        }
        const variable = item.var || 'Variable';
        const group = item.grouping_enum ? ` (${item.grouping_enum})` : '';
        const title = `Histogram: ${variable}${group}`;
        const categories = bins.map(String);

        return [{
            title: {
                text: title,
                left: 'center'
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' }
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: categories,
                axisTick: { alignWithLabel: true },
                axisLabel: {
                    rotate: 45,
                    interval: 0
                }
            },
            yAxis: {
                type: 'value',
                name: 'Frequency'
            },
            series: [
                {
                    name: 'Count',
                    type: 'bar',
                    barWidth: '90%',
                    data: counts.map((count) => count ?? null),
                    itemStyle: {
                        borderRadius: [5, 5, 0, 0],
                        color: '#2B33E9',
                    },
                    label: {
                        show: true,
                        position: 'top',
                        formatter: (params: { value: number | null }) =>
                            params.value === null ? '' : String(params.value),
                    }
                }
            ]
        } as EChartsOption];
    });
}
