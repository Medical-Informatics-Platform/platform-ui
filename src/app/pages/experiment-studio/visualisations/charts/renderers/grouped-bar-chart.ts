import { CLS, FONT, INK, MUT, MipChart, ax, base, esc, tip } from '../chart-theme';

/**
 * Builds a grouped bar chart for nominal variable distributions.
 * X-axis: datasets (one group per dataset)
 * Bars within each group: category levels (enumerations)
 * Bar height: percentage of rows in that dataset for that category
 */
export function buildGroupedBarChart(
    variableData: any[],
    variableLabel: string,
    enumMap?: Map<string, string>
): MipChart[] {
    if (!Array.isArray(variableData) || variableData.length === 0) return [];

    // Get all unique category keys across all datasets
    const allCategories = new Set<string>();
    const datasets: string[] = [];

    for (const entry of variableData) {
        const ds = entry.dataset ?? 'all datasets';
        datasets.push(ds);
        const counts = entry.data?.counts ?? {};
        Object.keys(counts).forEach(key => allCategories.add(key));
    }

    if (allCategories.size === 0) return [];

    // Order categories by enumeration order if available, then remaining keys
    const orderedCategories = enumMap
        ? [...enumMap.keys()].filter(k => allCategories.has(k))
        : [];
    const remainingCategories = [...allCategories].filter(k => !orderedCategories.includes(k));
    const categoryOrder = [...orderedCategories, ...remainingCategories];

    // Pre-calculate totals for each dataset
    const datasetTotals: Record<string, number> = {};
    for (const entry of variableData) {
        const ds = entry.dataset ?? 'all datasets';
        const counts = entry.data?.counts ?? {};
        datasetTotals[ds] = Object.values(counts).reduce((sum: number, val: any) => sum + (val || 0), 0);
    }

    // Build series data for each category (one series per category level, stacked)
    const series: any[] = categoryOrder.map((cat, catIdx) => {
        const catLabel = enumMap?.get(cat) ?? cat;

        return {
            name: catLabel,
            type: 'bar',
            stack: 'total',
            data: datasets.map(ds => {
                const entry = variableData.find(e => (e.dataset ?? 'all datasets') === ds);
                const counts = entry?.data?.counts ?? {};
                const count = counts[cat] ?? 0;
                const total = datasetTotals[ds] || 0;
                const percentage = total > 0 ? (count / total) * 100 : 0;
                return { value: parseFloat(percentage.toFixed(1)), count, total };
            }),
            itemStyle: {
                color: CLS[catIdx % CLS.length],
            },
            label: {
                show: true,
                position: 'inside',
                formatter: (params: any) => {
                    const pct = params.data?.value ?? params.value;
                    return pct >= 5 ? `${pct}%` : '';
                },
                fontSize: 10,
                color: catIdx % CLS.length === 0 || catIdx % CLS.length === 3 ? '#fff' : INK,
            },
            emphasis: {
                itemStyle: {
                    shadowBlur: 10,
                    shadowColor: 'rgba(0, 0, 0, 0.3)',
                },
            },
        };
    });

    const chart: MipChart = base({
        tooltip: {
            ...tip,
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: (params: any) => {
                const dataset = params[0]?.axisValue ?? '';
                let html = `<b>${esc(dataset)}</b><br/>`;
                for (const p of params) {
                    const pct = p.data?.value ?? p.value;
                    const cnt = p.data?.count ?? 0;
                    html += `${p.marker} ${esc(p.seriesName)}: ${pct}% (n=${cnt})<br/>`;
                }
                return html;
            },
        } as any,
        legend: { bottom: 0, type: 'scroll', itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 11, color: INK } },
        grid: { left: 64, right: 24, top: 16, bottom: 72 },
        xAxis: ax({
            type: 'category',
            data: datasets,
            splitLine: { show: false },
            axisLabel: { rotate: datasets.length > 4 ? 20 : 0, fontSize: 11, color: INK, fontFamily: FONT },
            name: 'Dataset',
            nameLocation: 'middle',
            nameGap: datasets.length > 4 ? 44 : 30,
        }),
        yAxis: ax({
            type: 'value',
            name: 'Percentage (%)',
            nameLocation: 'middle',
            nameGap: 44,
            max: 100,
            axisLabel: { formatter: '{value}%', color: MUT, fontSize: 11, fontFamily: FONT },
        }),
        series,
        mipTitle: variableLabel,
        mipChartHeight: 360,
    });

    return [chart];
}
