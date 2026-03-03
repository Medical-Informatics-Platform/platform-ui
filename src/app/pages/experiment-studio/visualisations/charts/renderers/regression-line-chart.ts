import { EChartsOption } from 'echarts';

/**
 * Builds a regression line chart for single-predictor Linear or Logistic Regression.
 *
 * Linear:   y = intercept + β·x   (straight line)
 * Logistic: P = 1 / (1 + e^-(intercept + β·x))   (sigmoid curve)
 *
 * For multi-predictor models (more than 1 independent variable besides Intercept)
 * no chart is returned — only the coefficient table is meaningful.
 */
export function buildRegressionLineChart(result: any): EChartsOption[] {
    const isLogistic = !!result?.summary;

    let variables: string[];
    let coefficients: number[];
    let title: string;
    let yLabel: string;

    if (isLogistic) {
        // Logistic Regression payload
        variables = result.indep_vars ?? [];
        coefficients = result.summary?.coefficients ?? [];
        title = 'Logistic Regression';
        yLabel = 'P(y = 1)';
    } else if (result?.indep_vars && result?.coefficients) {
        // Linear Regression payload
        variables = result.indep_vars ?? [];
        coefficients = result.coefficients ?? [];
        title = 'Linear Regression';
        yLabel = result.dependent_var ?? 'y';
    } else {
        return [];
    }

    // We expect [Intercept, variable] – exactly one predictor besides the intercept.
    if (variables.length !== 2 || coefficients.length !== 2) return [];

    const intercept = coefficients[0];
    const slope = coefficients[1];
    const xLabel = variables[1]; // first entry is "Intercept"

    if (!Number.isFinite(intercept) || !Number.isFinite(slope)) return [];

    // Generate a reasonable x-range centred around where the line is interesting.
    // For linear: pick a range that spans ~10 units of slope effect.
    // For logistic: pick so that the sigmoid transition region is visible.
    let xMin: number;
    let xMax: number;

    if (isLogistic) {
        // The sigmoid midpoint is at x = -intercept/slope
        const midpoint = slope !== 0 ? -intercept / slope : 0;
        // Show ±5/|slope| around the midpoint (covers ~99% of the curve)
        const span = slope !== 0 ? 5 / Math.abs(slope) : 10;
        xMin = midpoint - span;
        xMax = midpoint + span;
    } else {
        // For linear, centre around x=0 with a reasonable span
        const span = slope !== 0 ? Math.max(10, 5 / Math.abs(slope)) : 10;
        xMin = -span;
        xMax = span;
    }

    // Generate points along the line/curve
    const numPoints = 100;
    const step = (xMax - xMin) / (numPoints - 1);
    const lineData: [number, number][] = [];

    for (let i = 0; i < numPoints; i++) {
        const x = xMin + i * step;
        let y: number;

        if (isLogistic) {
            const z = intercept + slope * x;
            y = 1 / (1 + Math.exp(-z));
        } else {
            y = intercept + slope * x;
        }

        lineData.push([x, y]);
    }

    const fmt = (v: number): string =>
        Number.isFinite(v) ? v.toFixed(4) : 'N/A';

    const option: EChartsOption = {
        title: {
            text: title,
            left: 'center',
        },
        tooltip: {
            trigger: 'axis',
            formatter: (params: any) => {
                const p = Array.isArray(params) ? params[0] : params;
                if (!p?.data) return '';
                const [x, y] = p.data as [number, number];
                return `${xLabel} = ${fmt(x)}<br/>${yLabel} = ${fmt(y)}`;
            },
        },
        grid: {
            top: 60,
            left: 20,
            right: 40,
            bottom: 20,
            containLabel: true,
        },
        xAxis: {
            type: 'value',
            name: xLabel,
            nameLocation: 'middle',
            nameGap: 30,
            splitLine: { show: true, lineStyle: { type: 'dashed' } },
        },
        yAxis: {
            type: 'value',
            name: yLabel,
            nameLocation: 'middle',
            nameGap: 50,
            ...(isLogistic ? { min: 0, max: 1 } : {}),
            splitLine: { show: true },
        },
        series: [
            {
                type: 'line',
                data: lineData,
                smooth: isLogistic, // smooth for sigmoid; straight for linear
                showSymbol: false,
                lineStyle: { width: 2.5, color: '#5470c6' },
                areaStyle: isLogistic
                    ? { color: 'rgba(84, 112, 198, 0.08)' }
                    : undefined,
            },
        ],
    };

    return [option];
}
