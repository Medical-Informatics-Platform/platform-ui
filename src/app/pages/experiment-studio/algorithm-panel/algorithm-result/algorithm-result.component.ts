import { ChartBuilderService } from './../../visualisations/charts/chart-builder.service';
import { Component, input, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AutoRendererComponent } from '../../visualisations/auto-renderer/auto-renderer.component';
import { ChartRendererComponent } from '../../visualisations/charts/charts-renderer/charts-renderer.component';
import { AlgorithmChartRegistry, tablesReplacedByCharts } from '../../visualisations/charts/chart-registry';
import { NgxEchartsModule } from 'ngx-echarts';
import { EnumMaps, LabelMap, mapAlgorithmResultEnums } from '../../../../core/algorithm-result-enum-mapper';
import { prettifyLabel } from '../../../../core/algorithm-mappers';
import { RegressionResultComponent } from '../../visualisations/regression/regression-result.component';
import { buildRegressionView } from '../../visualisations/regression/regression-view';
import { KeyFiguresComponent } from '../../visualisations/summary/key-figures.component';
import { buildSummaryFigures, FIGURE_NOTES, tablesShownAsFigures } from '../../visualisations/summary/summary-figures';

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
    this.errorMessage() ? null : buildRegressionView(this.algorithm(), this.mappedResult(), this.yVar(), this.positiveClassLabel())
  );

  /** The positive_class parameter of a binary model as the outcome's enumeration label. */
  private readonly positiveClassLabel = computed(() => {
    const value = this.parameters()?.['positive_class'];
    if (value === null || value === undefined || value === '') return null;
    return this.enumMaps()?.[this.yVar() ?? '']?.[String(value)] ?? String(value);
  });

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

  mappedResult = computed(() => {
    if (this.errorMessage()) return this.result();
    const mapped = mapAlgorithmResultEnums(this.algorithm(), this.result(), this.enumMaps(), {
      y: this.yVar(),
      x: this.xVar(),
    }, this.labelMap());
    // A binary tp/fp/fn/tn matrix names its classes after the positive class when the run says which.
    const cm = mapped?.confusion_matrix;
    const positive = this.positiveClassLabel();
    return positive && cm && cm.tp !== undefined ? { ...mapped, confusion_matrix: { ...cm, positive_label: positive } } : mapped;
  });

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
  readonly chartNote = computed(() => AlgorithmChartRegistry[this.algorithm()]?.note ?? null);
  readonly figureNote = computed(() => FIGURE_NOTES[this.algorithm()] ?? null);

  /** What the figures or charts above already show of the tables, so it is not repeated below:
   *  only the values those figures print and the tables whose own chart rendered. */
  readonly coveredTables = computed(() => [
    ...(this.summaryFigures() ? tablesShownAsFigures(this.algorithm(), this.mappedResult()) : []),
    ...tablesReplacedByCharts(this.algorithm(), this.renderedCharts()),
  ]);

  readonly hasSummaryAbove = computed(() => !!this.summaryFigures() || this.renderedCharts().length > 0);

  /** The reader can ask for every value as a table again — what a chart shows is otherwise only pixels. */
  readonly showAllTables = signal(false);
  readonly tablesToCover = computed(() => (this.showAllTables() ? [] : this.coveredTables()));

  renderedCharts = computed(() => {
    if (!this.result() || !this.algorithm() || this.errorMessage()) return [];
    return this.chartBuilder.getChartsForAlgorithm(this.algorithm(), this.mappedResult(), this.fallbackResultTitle());
  });
}

