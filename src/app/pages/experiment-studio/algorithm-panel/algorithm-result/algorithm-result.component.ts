import { ChartBuilderService } from './../../visualisations/charts/chart-builder.service';
import { Component, input, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AutoRendererComponent } from '../../visualisations/auto-renderer/auto-renderer.component';
import { ChartRendererComponent } from '../../visualisations/charts/charts-renderer/charts-renderer.component';
import { AlgorithmChartRegistry } from '../../visualisations/charts/chart-registry';
import { NgxEchartsModule } from 'ngx-echarts';
import { EnumMaps, LabelMap, mapAlgorithmResultEnums } from '../../../../core/algorithm-result-enum-mapper';
import { prettifyLabel } from '../../../../core/algorithm-mappers';
import { RegressionResultComponent } from '../../visualisations/regression/regression-result.component';
import { buildRegressionView } from '../../visualisations/regression/regression-view';
import { KeyFiguresComponent } from '../../visualisations/summary/key-figures.component';
import { buildSummaryFigures } from '../../visualisations/summary/summary-figures';

@Component({
  selector: 'app-algorithm-result',
  imports: [CommonModule,
    AutoRendererComponent,
    ChartRendererComponent,
    RegressionResultComponent,
    KeyFiguresComponent,
    NgxEchartsModule],
  templateUrl: './algorithm-result.component.html',
  styleUrl: './algorithm-result.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlgorithmResultComponent {
  private chartBuilder = inject(ChartBuilderService);

  result = input<any>(null);
  schema = input<any[]>([]);
  algorithm = input.required<string>();
  algorithmLabel = input<string | null>(null);
  enumMaps = input<EnumMaps | null>(null);
  yVar = input<string | null>(null);
  xVar = input<string | null>(null);
  labelMap = input<LabelMap | null>(null);
  /** The run's algorithm parameters; names the groups a two-group test compared. */
  parameters = input<Record<string, unknown> | null>(null);

  readonly regression = computed(() =>
    this.errorMessage() ? null : buildRegressionView(this.algorithm(), this.mappedResult(), this.yVar())
  );

  readonly summaryFigures = computed(() =>
    this.errorMessage() ? null : buildSummaryFigures(this.algorithm(), this.mappedResult(), this.groupLabels())
  );

  /** groupA / groupB parameters as the x variable's enumeration labels. */
  private readonly groupLabels = computed(() => {
    const params = this.parameters();
    const enumMap = this.enumMaps()?.[this.xVar() ?? ''] ?? {};
    const label = (value: unknown) => (value === null || value === undefined || value === '' ? null : enumMap[String(value)] ?? String(value));
    return { groupA: label(params?.['groupA']), groupB: label(params?.['groupB']) };
  });

  constructor() { }

  errorMessage = computed(() => {
    if (!this.result()) return null;
    if (this.result()?.status === 'error') {
      return this.result()?.error || this.result()?.message || 'An error occurred.';
    }
    return this.result()?.error ?? null;
  });

  isRenderable = computed(() => {
    return !!this.result() && !!this.algorithm() && !this.errorMessage();
  });

  mappedResult = computed(() =>
    this.errorMessage()
      ? this.result()
      : mapAlgorithmResultEnums(this.algorithm(), this.result(), this.enumMaps(), {
        y: this.yVar(),
        x: this.xVar(),
      }, this.labelMap())
  );

  fallbackResultTitle = computed(() => {
    const explicitTitle = this.mappedResult()?.title;
    if (typeof explicitTitle === 'string' && explicitTitle.trim()) {
      return explicitTitle.trim();
    }

    const label = this.algorithmLabel()?.trim();
    if (label) return `Result ${label}`;

    return `Result ${prettifyLabel(this.algorithm()) || 'Algorithm'}`;
  });


  readonly chartTitle = computed(() => AlgorithmChartRegistry[this.algorithm()]?.title ?? 'Charts');

  renderedCharts = computed(() => {
    if (!this.result() || !this.algorithm() || this.errorMessage()) return [];
    return this.chartBuilder.getChartsForAlgorithm(this.algorithm(), this.mappedResult(), this.fallbackResultTitle());
  });
}

