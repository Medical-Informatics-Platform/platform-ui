import { EChartsOption } from 'echarts';

// Color palette for bar chart segments - MIP brand colors
const BAR_COLORS = [
    '#2b33e9',  // MIP primary blue
    '#026d6d',  // MIP teal
    '#ffba08',  // MIP orange/yellow
    '#06d6a0',  // MIP green
    '#ef476f',  // accent pink
    '#118ab2',  // accent blue
    '#073b4c',  // dark teal
    '#ffd166',  // soft yellow
    '#8338ec',  // purple
    '#ff6b6b',  // coral
];

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
): EChartsOption[] {
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

    // Category labels for legend
    const categoryLabels = categoryOrder.map(k => enumMap?.get(k) ?? k);

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
                color: BAR_COLORS[catIdx % BAR_COLORS.length],
            },
            label: {
                show: true,
                position: 'inside',
                formatter: (params: any) => {
                    const pct = params.data?.value ?? params.value;
                    return pct >= 5 ? `${pct}%` : '';
                },
                fontSize: 10,
                color: '#fff',
            },
            emphasis: {
                itemStyle: {
                    shadowBlur: 10,
                    shadowColor: 'rgba(0, 0, 0, 0.3)',
                },
            },
        };
    });

    const isDark = document.body.classList.contains('theme-dark');
    const textColor = isDark ? '#f1f5f9' : '#0f172a';
    const axisColor = isDark ? 'rgba(255, 255, 255, 0.3)' : '#475569';
    const splitLineColor = isDark ? 'rgba(255, 255, 255, 0.05)' : '#e2e8f0';

    const chart: EChartsOption = {
        title: {
            text: variableLabel,
            left: 'center',
            top: 10,
            textStyle: {
                fontSize: 14,
                fontWeight: 600,
                color: textColor
            },
        },
        tooltip: {
            trigger: 'axis',
            backgroundColor: isDark ? '#1c253d' : '#fff',
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#ccc',
            textStyle: { color: textColor },
            axisPointer: {
                type: 'shadow',
            },
            formatter: (params: any) => {
                const dataset = params[0]?.axisValue ?? '';
                let html = `<b>${dataset}</b><br/>`;
                for (const p of params) {
                    const pct = p.data?.value ?? p.value;
                    const cnt = p.data?.count ?? 0;
                    html += `${p.marker} ${p.seriesName}: ${pct}% (n=${cnt})<br/>`;
                }
                return html;
            },
        },
        legend: {
            bottom: 0,
            type: 'scroll',
            textStyle: {
                fontSize: 11,
                color: textColor
            },
            pageTextStyle: { color: textColor }
        },
        grid: {
            left: '10%',
            right: '10%',
            bottom: '18%',
            top: '18%',
            containLabel: true,
        },
        xAxis: {
            type: 'category',
            data: datasets,
            axisLabel: {
                rotate: datasets.length > 4 ? 20 : 0,
                fontSize: 11,
                color: textColor
            },
            axisLine: { lineStyle: { color: axisColor } },
            name: 'Dataset',
            nameLocation: 'middle',
            nameGap: 35,
            nameTextStyle: { color: textColor }
        },
        yAxis: {
            type: 'value',
            name: 'Percentage (%)',
            nameLocation: 'middle',
            nameGap: 45,
            max: 100,
            axisLabel: {
                formatter: '{value}%',
                color: textColor
            },
            axisLine: { lineStyle: { color: axisColor } },
            splitLine: { lineStyle: { color: splitLineColor } },
            nameTextStyle: { color: textColor }
        },
        series,
    };

    return [chart];
}
