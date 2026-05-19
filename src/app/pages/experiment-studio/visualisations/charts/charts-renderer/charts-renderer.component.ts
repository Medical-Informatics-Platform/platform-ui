import { Component, AfterViewInit, QueryList, ViewChildren, NgZone, inject, ChangeDetectionStrategy, OnChanges, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ECharts, EChartsOption } from 'echarts';
import { NgxEchartsModule, NgxEchartsDirective } from 'ngx-echarts';
import { SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-chart-renderer',
  imports: [CommonModule, NgxEchartsModule],
  templateUrl: './charts-renderer.component.html',
  styleUrl: './charts-renderer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChartRendererComponent implements AfterViewInit, OnChanges {
  private zone = inject(NgZone);
  private readonly brandChartColors = ['#2B33E9', '#7F9CE8', '#FFBA08', '#DFEFE4'];
  readonly charts = input<EChartsOption[]>([]);
  themedCharts: EChartsOption[] = [];
  @ViewChildren(NgxEchartsDirective) echartsDirectives!: QueryList<NgxEchartsDirective>;

  private instances: ECharts[] = [];

  constructor() { }

  ngOnChanges(_changes: SimpleChanges): void {
    this.themedCharts = this.charts().map((chart) => this.applyBrandChartDefaults(chart));
  }

  private applyBrandChartDefaults(chart: EChartsOption): EChartsOption {
    return {
      ...chart,
      color: this.brandChartColors,
      series: this.softenSeries(chart.series),
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

    if (type === 'line') {
      next['smooth'] = next['smooth'] ?? true;
      next['lineStyle'] = {
        width: 2.5,
        color: this.brandChartColors[0],
        ...this.objectValue(next['lineStyle']),
      };
      next['areaStyle'] = next['areaStyle'] ?? { color: 'rgba(127, 156, 232, 0.12)' };
    }

    return next;
  }

  private objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      setTimeout(() => {
        this.instances = this.echartsDirectives
          .map(d => (d as any).getInstance?.())
          .filter((i): i is ECharts => !!i);
      }, 1000);
    });
  }

  getInstances(): ECharts[] {
    return this.instances;
  }

}
