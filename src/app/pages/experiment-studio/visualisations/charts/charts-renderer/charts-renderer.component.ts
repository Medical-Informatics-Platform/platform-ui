import { Component, ChangeDetectionStrategy, OnChanges, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EChartsOption } from 'echarts';
import { NgxEchartsModule } from 'ngx-echarts';
import { SimpleChanges } from '@angular/core';
import { CHART_SERIES_COLORS } from '../chart-palette';
import { groupThousands } from '../../result-format';

/** --font-sans without the licensed Alaska faces, which canvas text cannot load either. */
const CHART_FONT = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

@Component({
  selector: 'app-chart-renderer',
  imports: [CommonModule, NgxEchartsModule],
  templateUrl: './charts-renderer.component.html',
  styleUrl: './charts-renderer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChartRendererComponent implements OnChanges {
  readonly charts = input<EChartsOption[]>([]);
  themedCharts: EChartsOption[] = [];

  constructor() { }

  ngOnChanges(_changes: SimpleChanges): void {
    this.themedCharts = this.charts().map((chart) => this.applyBrandChartDefaults(chart));
  }

  /**
   * House style every chart starts from; a renderer's own settings win. Canvas text cannot read
   * CSS, so the app font, title ink and tooltip card are set here once rather than per renderer.
   */
  private applyBrandChartDefaults(chart: EChartsOption): EChartsOption {
    const title = chart.title;
    const tooltip = chart.tooltip;
    return {
      ...chart,
      // ECharts writes a text description of each chart for screen readers; no decal patterns.
      aria: { enabled: true, decal: { show: false } },
      color: CHART_SERIES_COLORS,
      textStyle: { fontFamily: CHART_FONT, ...this.objectValue(chart.textStyle) },
      ...(title && !Array.isArray(title)
        ? {
          title: {
            ...title,
            textStyle: { fontSize: 13, fontWeight: 600, color: '#0f172a', ...this.objectValue((title as Record<string, unknown>)['textStyle']) },
            subtextStyle: { fontSize: 12, color: '#475569', ...this.objectValue((title as Record<string, unknown>)['subtextStyle']) },
          },
        }
        : {}),
      ...(tooltip && !Array.isArray(tooltip)
        ? {
          tooltip: {
            backgroundColor: '#ffffff',
            borderColor: 'rgba(148, 163, 184, 0.45)',
            borderWidth: 1,
            extraCssText: 'border-radius: 8px; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);',
            ...tooltip,
            textStyle: { color: '#0f172a', fontSize: 12, fontFamily: CHART_FONT, ...this.objectValue((tooltip as Record<string, unknown>)['textStyle']) },
          },
        }
        : {}),
      ...(chart.xAxis ? { xAxis: this.groupAxisLabels(chart.xAxis, 'category') as EChartsOption['xAxis'] } : {}),
      ...(chart.yAxis ? { yAxis: this.groupAxisLabels(chart.yAxis, 'value') as EChartsOption['yAxis'] } : {}),
      series: this.softenSeries(chart.series),
    } as EChartsOption;
  }

  /** Value-axis ticks grouped like the result tables (10 000): ECharts' own label puts a comma there.
   *  An axis with its own label formatter keeps it; `defaultType` is ECharts' type when none is set. */
  private groupAxisLabels(axis: unknown, defaultType: 'category' | 'value'): unknown {
    if (Array.isArray(axis)) return axis.map((entry) => this.groupAxisLabels(entry, defaultType));
    const options = this.objectValue(axis);
    const axisLabel = this.objectValue(options['axisLabel']);
    if ((options['type'] ?? defaultType) !== 'value' || axisLabel['formatter']) return axis;
    return {
      ...options,
      axisLabel: { ...axisLabel, formatter: (value: number) => groupThousands(value.toLocaleString('en-US', { maximumFractionDigits: 20 })) },
    };
  }

  private softenSeries(series: EChartsOption['series']): EChartsOption['series'] {
    if (!series) return series;
    if (Array.isArray(series)) {
      return series.map((entry) => this.softenSingleSeries(entry)) as EChartsOption['series'];
    }

    return this.softenSingleSeries(series) as EChartsOption['series'];
  }

  private softenSingleSeries(series: unknown): unknown {
    if (!series || typeof series !== 'object') return series;

    const next = { ...(series as Record<string, unknown>) };
    const type = next['type'];

    if (type === 'bar') {
      next['itemStyle'] = {
        borderRadius: [5, 5, 0, 0],
        ...this.objectValue(next['itemStyle']),
      };
    }

    // Lines keep their series colour and their real shape: smoothing invents bends
    // between discrete points (an elbow curve, a ROC curve) that the data does not have.
    if (type === 'line') {
      next['lineStyle'] = {
        width: 2,
        ...this.objectValue(next['lineStyle']),
      };
    }

    return next;
  }

  private objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }


  chartHeight(chart: EChartsOption): number {
    const custom = (chart as EChartsOption & { mipChartHeight?: number }).mipChartHeight;
    return typeof custom === 'number' && custom > 0 ? custom : 500;
  }

}
