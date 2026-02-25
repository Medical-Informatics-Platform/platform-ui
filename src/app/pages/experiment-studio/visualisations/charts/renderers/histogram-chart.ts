import { EChartsOption } from 'echarts';

export function buildHistogramChart(result: any): EChartsOption[] {
    const histogramData = result?.histogram;
    if (!Array.isArray(histogramData) || histogramData.length === 0) return [];

    return histogramData.map((item: any) => {
        const bins = item.bins || [];
        const counts = item.counts || [];
        const variable = item.var || 'Variable';
        const group = item.grouping_enum ? ` (${item.grouping_enum})` : '';
        const title = `Histogram: ${variable}${group}`;

        // data for bar chart
        // bins are edges? or centers? Usually bins are edges [0, 10, 20...] and counts are 1 less.
        // Or bins are labels.
        // If bins.length == counts.length + 1, they are edges.
        // We can label bars with intervals.

        let categories: string[] = [];
        if (bins.length === counts.length + 1) {
            // Edges
            categories = counts.map((_: any, i: number) => {
                const start = typeof bins[i] === 'number' ? Number(bins[i]).toFixed(2) : bins[i];
                const end = typeof bins[i + 1] === 'number' ? Number(bins[i + 1]).toFixed(2) : bins[i + 1];
                return `[${start}, ${end})`;
            });
        } else {
            // Categories
            categories = bins.map(String);
        }

        return {
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
                    interval: 0 // Show all labels if possible, or 'auto'
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
                    barWidth: '90%', // Reduce gap
                    data: counts,
                    label: {
                        show: true,
                        position: 'top'
                    }
                }
            ]
        };
    });
}
