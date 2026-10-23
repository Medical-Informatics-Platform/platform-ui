import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChartRendererComponent } from '../../visualisations/charts/charts-renderer/charts-renderer.component';
import { HistogramComponent } from '../../visualisations/histogram/histogram.component';
import { DATA_HANDLING } from '../data-handling.context';
import { HowToGuide, StatisticVariableType, SummaryKind, SummaryView, TabKey } from '../data-handling.models';
import { HowToStripComponent } from '../how-to-strip/how-to-strip.component';

/** The variable browser's groups, in display order. */
const VARIABLE_GROUPS: ReadonlyArray<{ type: StatisticVariableType; title: string }> = [
  { type: 'numeric', title: 'Numerical' },
  { type: 'nominal', title: 'Categorical' },
];

/** The detail pane's views; the first one is the default. */
const SUMMARY_TABS: ReadonlyArray<{ key: TabKey; label: string; /** Font Awesome solid glyph. */ icon: string }> = [
  { key: 'Statistics', label: 'Table', icon: 'fa-table' },
  { key: 'Charts', label: 'Charts', icon: 'fa-chart-simple' },
  { key: 'Histogram', label: 'Histogram', icon: 'fa-chart-column' },
];

/**
 * The shared summary workspace: variable browser, statistics table, charts, histograms
 * and export for one Data Handling surface (the Raw data snapshot, the Raw preview or
 * the Processed preview). Attached to the section body element itself, so the studio's
 * reveal animation and every selector see the same DOM as before.
 */
@Component({
  selector: 'div[app-summary-workspace]',
  imports: [FormsModule, ChartRendererComponent, HistogramComponent, HowToStripComponent],
  templateUrl: './summary-workspace.component.html',
  styleUrl: './summary-workspace.component.css',
  // Reads the pipeline's plain fields, so it refreshes with the pipeline (see DATA_HANDLING).
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class SummaryWorkspaceComponent {
  protected readonly dh = inject(DATA_HANDLING);

  readonly kind = input.required<SummaryKind>();
  readonly summary = input.required<SummaryView>();
  /** The empty-state line shown when the summary has no data. */
  readonly emptyHint = input.required<string>();
  /** False keeps the workspace out of the DOM (the Raw data snapshot renders only while open). */
  readonly rendered = input(true);
  /** Optional "How to use" strip shown above the workspace. */
  readonly howTo = input<HowToGuide | null>(null);

  protected readonly variableGroups = VARIABLE_GROUPS;
  protected readonly tabs = SUMMARY_TABS;
  /** Placeholder grid shown while the summary loads: one header row, three body rows. */
  protected readonly skeletonHeadCells = Array.from({ length: 4 });
  protected readonly skeletonBodyCells = Array.from({ length: 12 });
}
