import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AlgorithmNames } from '../../../core/constants/algorithm.constants';
import { BackendFilter } from '../../../models/filters.model';
import { ExperimentStudioService, PreprocessingConfig } from '../../../services/experiment-studio.service';
import { histogramCacheKey } from '../visualisations/histogram/histogram-data';
import { HistogramPreviewData, PivotBlock, SummaryKind, SummaryView } from './data-handling.models';
import { StatisticSummaryService } from './statistic-summary.service';
import {
  HistogramPreviewVariable,
  histogramFromDescribeCounts,
  parseHistogramResponse,
  withDefaultDropFor,
} from './utils/histogram-preview.utils';

const LOAD_FAILED = 'Failed to load histogram preview.';

/** What one histogram plots a summary block as. */
export interface SummaryHistogramTarget {
  /** The variable code the histogram is requested for. */
  code: string;
  /** The variable it is split by ('' = not split), as the panel offers it right now. */
  split: string;
  /** The plotted variable as the preview describes it; read when the answer lands. */
  variable(): HistogramPreviewVariable;
  /** Legend label of the split variable; read when the answer lands. */
  splitLabel(groupingCode: string): string;
}

/** What the histogram loop needs from the panel, which owns the blocks and the pending state. */
export interface SummaryHistogramPorts {
  /** The block a surface has selected, or null while it has none. */
  selectedBlock(kind: SummaryKind): PivotBlock | null;
  /** What a block is plotted as; null when it is not a known variable. */
  target(kind: SummaryKind, block: PivotBlock): SummaryHistogramTarget | null;
  /** The pending preprocessing the Processed surface plots under (what the editors show, not what is stored). */
  pendingPreprocessing(): PreprocessingConfig | null;
  /** The unsaved cohort a Cohort Filtering preview pins the Raw surface to; undefined = the stored rules. */
  rawPreviewFilter(): BackendFilter | null | undefined;
  /** Legend label of one group of a split. */
  groupLabel(groupingVar: string, groupingEnum: string): string;
  /** Called after the surfaces changed, so the panel redraws. */
  changed(): void;
}

interface CacheEntry {
  data?: HistogramPreviewData;
  error?: string;
  loading?: boolean;
  settled?: boolean;
}

/**
 * Loads the histogram behind a summary's Histogram tab, one request per variable and
 * split, and caches the answer on the surface it was asked for. Provided by the Data
 * Handling panel, which hands over what it owns through `ports`.
 *
 * A nominal variable is read from the describe counts the surface already has; a numerical
 * one is a live federated run. A request that settles, with data or with an error, is not
 * repeated until its surface is rebuilt (`histogramSettledByVariable` is reset), and a
 * response the surface has moved on from is dropped.
 */
@Injectable()
export class SummaryHistogramService {
  private readonly studio = inject(ExperimentStudioService);
  private readonly summaries = inject(StatisticSummaryService);
  private readonly destroyRef = inject(DestroyRef);

  /** Set once by the panel, which owns the blocks and the pending preprocessing. */
  ports: SummaryHistogramPorts = {
    selectedBlock: () => null,
    target: () => null,
    pendingPreprocessing: () => null,
    rawPreviewFilter: () => undefined,
    groupLabel: (_variable, value) => value,
    changed: () => {},
  };

  /** Reloads the histogram of the selected block when the surface is showing the Histogram tab. */
  refreshActive(kind: SummaryKind): void {
    if (this.summaries.get(kind).activeTab !== 'Histogram') return;
    const block = this.ports.selectedBlock(kind);
    if (block) this.ensure(kind, block);
  }

  /** Makes sure the block's histogram is cached, loading, or settled; requests it otherwise. */
  ensure(kind: SummaryKind, block: PivotBlock): void {
    const target = this.ports.target(kind, block);
    if (!target) return;

    const { code, split } = target;
    const cacheKey = histogramCacheKey(code, split);
    const summary = this.summaries.get(kind);
    if (summary.histogramSettledByVariable[cacheKey]) return;
    if (summary.histogramLoadingByVariable[cacheKey]) return;
    if (summary.histogramDataByVariable[cacheKey]) return;

    if (!split) {
      const fromDescribe = histogramFromDescribeCounts(summary.featurewiseRows, code, target.variable());
      if (fromDescribe) {
        this.record(summary, cacheKey, { data: fromDescribe, error: '' });
        return;
      }
    }

    this.record(summary, cacheKey, { loading: true, error: '' });

    // `histogram_sql` cannot run without a missing-value strategy, so even the
    // unprocessed surfaces send the default drop for the plotted variable and nothing
    // else. The processed surface sends its pending rules — never the derived columns,
    // which are this variable's output, not its input. Grouping variables are not given
    // a drop strategy: that would remove rows from the overall total.
    const preprocessingOverride = withDefaultDropFor(kind === 'processed' ? this.ports.pendingPreprocessing() : null, code);

    const requestSeq = (summary.histogramRequestIdByVariable[cacheKey] ?? 0) + 1;
    summary.histogramRequestIdByVariable = { ...summary.histogramRequestIdByVariable, [cacheKey]: requestSeq };
    // Step 0 describes the unfiltered source, so its histogram drops the filter too —
    // otherwise the tab would show the filtered cohort under a "no filters applied"
    // heading. A Cohort Filtering preview pins the raw histograms to the same unsaved
    // cohort its table came from; the processed surface keeps the applied cohort
    // (undefined = the stored rules).
    const filterOverride = kind === 'source' ? null : kind === 'raw' ? this.ports.rawPreviewFilter() : undefined;
    this.studio
      .getAlgorithmResults(AlgorithmNames.HISTOGRAM, [code], null, preprocessingOverride, filterOverride, split ? [split] : null)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const current = this.summaries.get(kind);
          if (current.histogramRequestIdByVariable[cacheKey] !== requestSeq) return;
          const parsed = parseHistogramResponse({
            response,
            code,
            variable: target.variable(),
            kind,
            groupingCode: split,
            groupLabel: (groupingVar, groupingEnum) => this.ports.groupLabel(groupingVar, groupingEnum),
            datasets: this.studio.selectedDatasets(),
            splitLabel: (groupingCode) => target.splitLabel(groupingCode),
          });
          this.record(current, cacheKey, parsed.data
            ? { data: parsed.data, error: '', loading: false, settled: true }
            : { error: parsed.error, loading: false, settled: true });
        },
        error: () => {
          const current = this.summaries.get(kind);
          if (current.histogramRequestIdByVariable[cacheKey] !== requestSeq) return;
          this.record(current, cacheKey, { error: LOAD_FAILED, loading: false, settled: true });
        },
      });
  }

  /** Writes what changed for one cache key into fresh records, then asks the panel to redraw. */
  private record(summary: SummaryView, cacheKey: string, entry: CacheEntry): void {
    if (entry.data) summary.histogramDataByVariable = { ...summary.histogramDataByVariable, [cacheKey]: entry.data };
    if (entry.error !== undefined) summary.histogramErrorByVariable = { ...summary.histogramErrorByVariable, [cacheKey]: entry.error };
    if (entry.loading !== undefined) summary.histogramLoadingByVariable = { ...summary.histogramLoadingByVariable, [cacheKey]: entry.loading };
    if (entry.settled) summary.histogramSettledByVariable = { ...summary.histogramSettledByVariable, [cacheKey]: true };
    this.ports.changed();
  }
}
