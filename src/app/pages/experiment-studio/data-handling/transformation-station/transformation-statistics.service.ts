import { Injectable, inject, signal } from '@angular/core';
import { ExperimentStudioService, PreprocessingConfig } from '../../../../services/experiment-studio.service';
import { getFeaturewiseDescribeRows } from '../../../../core/describe-result.utils';
import { kmeansCreatorClusterChoices, kmeansCreatorVariables } from '../../../../core/kmeans-cluster-source.utils';
import { BackendFilter } from '../../../../models/filters.model';
import { HistogramPreviewData, TransformationColumnDraft } from '../data-handling.models';
import { TransformationDraftsService } from './transformation-drafts.service';

/** The category counts of one derived column; `count` is null until a describe has answered. */
export interface TransformationStatsBlock {
  code: string;
  rows: Array<{ value: string; count: number | null }>;
}

/** What a counts describe needs from the panel: its pending preprocessing and its labels. */
export interface TransformationStatsPorts {
  /** True when the pending preprocessing rules fail validation, so a describe would not match a run. */
  hasInvalidPendingRules(): boolean;
  /** The pending preprocessing rules as the request config a run would send. */
  pendingPreprocessingConfig(): PreprocessingConfig | null;
  variableLabel(code: string): string;
}

const LOAD_FAILED = 'Failed to load category counts.';

/**
 * The category counts shown under the transformation stage's columns: one table per nominal
 * card and per applied K-means column, loaded by a single describe over all of them. Provided
 * by the Data Handling panel. A new request, or any later edit, supersedes what is in flight.
 */
@Injectable()
export class TransformationStatisticsService {
  private readonly studio = inject(ExperimentStudioService);
  private readonly drafts = inject(TransformationDraftsService);
  private requestId = 0;

  /** Set once by the panel, which owns the preprocessing state a describe must include. */
  ports: TransformationStatsPorts = {
    hasInvalidPendingRules: () => false,
    pendingPreprocessingConfig: () => null,
    variableLabel: (code) => code,
  };

  readonly blocks = signal<TransformationStatsBlock[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  /** The nominal card whose Done loaded the current counts; it shows their loading/error state. */
  readonly countsDraftId = signal<string | null>(null);

  /** The counts table of the column named `code`. */
  forColumn(code: string): TransformationStatsBlock[] {
    const target = code.trim();
    return this.blocks().filter((block) => block.code === target);
  }

  /** Loaded record count for one enumeration of a card's column. */
  count(draft: TransformationColumnDraft, value: string): string {
    const row = this.blocks().find((block) => block.code === draft.code.trim())?.rows.find((item) => item.value === value);
    return row?.count != null ? row.count.toLocaleString() : '—';
  }

  /** Category counts as the same horizontal bar chart the summary uses for groups. */
  countChart(block: TransformationStatsBlock): HistogramPreviewData | null {
    if (!block.rows.some((row) => typeof row.count === 'number')) return null;
    return {
      bins: block.rows.map((row) => row.value),
      counts: block.rows.map((row) => row.count),
      variableName: block.code,
      variableType: 'nominal',
    };
  }

  /**
   * The counts note belongs to rule-built columns. A K-means column carries its own
   * sentence, in the same shape as the categorical column card.
   */
  showsRuleColumnCounts(): boolean {
    const clusterCodes = new Set(this.appliedKMeans().map((entry) => entry.code));
    return this.blocks().some((block) => !clusterCodes.has(block.code));
  }

  /**
   * Present an applied K-means column as a categorical column: a name, one assignment
   * rule per cluster, and the variables that placed each record. Null for any other column.
   */
  kmeansColumnView(code: string): { code: string; lead: string; foot: string; rules: Record<string, string> } | null {
    const target = code.trim();
    const match = this.appliedKMeans().find((entry) => entry.code === target);
    if (!match) return null;

    const sources = kmeansCreatorVariables(match.creator);
    const variables = sources
      .map((variable) => this.ports.variableLabel(variable))
      .filter((label, index, all) => !!label && label !== sources[index] && all.indexOf(label) === index);
    const choices = kmeansCreatorClusterChoices(match.creator);
    const rules: Record<string, string> = {};
    for (const choice of choices) {
      const label = choice.label.trim();
      rules[choice.cluster_id] = label && label !== choice.cluster_id ? `Nearest cluster — ${label}` : 'Nearest cluster';
    }
    const count = choices.length;
    const clusterWord = count === 1 ? 'cluster' : 'clusters';
    return {
      code: target,
      lead: variables.length
        ? `Each record is assigned to the nearest of these clusters, using ${variables.join(', ')}.`
        : 'Each record is assigned to the nearest of these clusters.',
      foot: variables.length
        ? `${count} ${clusterWord} from ${variables.join(', ')} · covers every record that has those variables`
        : `${count} ${clusterWord} · covers every record`,
      rules,
    };
  }

  /** Drops every table and the notice (the stage was cleared or its drafts discarded). */
  clear(): void {
    this.blocks.set([]);
    this.error.set('');
  }

  /** Category counts describe the config at the last Done; any later edit drops them. */
  invalidate(): void {
    if (this.countsDraftId() === null) return;
    this.countsDraftId.set(null);
    // ponytail: also cancels an in-flight K-means preview; scope per card if both overlap in practice.
    this.requestId++;
    this.loading.set(false);
    this.error.set('');
    const clusterCodes = new Set(this.appliedKMeans().map((entry) => entry.code));
    this.blocks.update((blocks) => blocks.filter((block) => clusterCodes.has(block.code)));
  }

  /** Shows the shape of every derived column, then loads its counts with one describe. */
  refresh(): void {
    const kmeansEntries = this.appliedKMeans();
    const placeholderBlocks: TransformationStatsBlock[] = [
      ...this.drafts.drafts
        .filter((draft) => draft.code.trim().length > 0)
        .map((draft) => ({ code: draft.code.trim(), rows: this.placeholderRows(draft) })),
      ...kmeansEntries.map((entry) => ({
        code: entry.code,
        rows: kmeansCreatorClusterChoices(entry.creator).map((choice) => ({ value: choice.cluster_id, count: null })),
      })),
    ];
    const configs = this.drafts.configs();

    if (!configs.length && !kmeansEntries.length) {
      // Every named card gets a heading over this table, so a named card always needs a
      // reason beside it: falling through to the "counts from a describe run" line would
      // describe a describe that never ran.
      this.show(placeholderBlocks, this.gapNotice());
      return;
    }

    const columnCodes = [
      ...configs.map((config) => config.new_column_names[0]?.trim() ?? '').filter(Boolean),
      ...kmeansEntries.map((entry) => entry.code),
    ];
    const columnSet = new Set(columnCodes);
    // Same CDE set a run would send: filter fields + selected variables + K-means/PCA sources
    // that are not earlier outputs. Created columns (pca_pc*, cluster codes) stay out.
    const sourceCodes = Array.from(
      new Set(
        [
          ...configs.flatMap((config) =>
            Object.values(config.rules).flatMap((filter) => this.studio.filterVariableCodes(filter as BackendFilter))
          ),
          ...this.studio.transformationSourceCodesForInput(),
          ...this.studio.selectedVariables().map((variable) => String(variable?.code ?? '')),
        ]
          .map((code) => String(code).trim())
          .filter((code) => !!code && !columnSet.has(code))
      )
    );

    if (!sourceCodes.length) {
      this.show(
        placeholderBlocks,
        configs.length
          ? 'Category filters must reference at least one data-model variable before counts can be loaded.'
          : 'The K-means cluster column has no clustering variables to read.'
      );
      return;
    }

    // Pipeline consistency: the preview uses the same ordered-step builder as a run
    // (singletons, then PCA/categorical/K-means in store order with CDE-only drops).
    const requestId = ++this.requestId;
    if (this.ports.hasInvalidPendingRules()) {
      this.show(placeholderBlocks, 'Fix the preprocessing rules before loading category counts.');
      return;
    }
    this.blocks.set(placeholderBlocks);
    this.error.set('');
    this.loading.set(true);
    const preprocessing = this.studio.buildTransformationDescribePreprocessing(this.ports.pendingPreprocessingConfig());
    this.studio.loadDescriptiveOverview(columnCodes, preprocessing, sourceCodes).subscribe({
      next: (response) => {
        if (requestId !== this.requestId) return;
        if (!response) {
          this.fail();
          return;
        }
        const blocks: TransformationStatsBlock[] = [
          ...configs.map((config) => ({
            code: config.new_column_names[0]?.trim() ?? '',
            rows: this.countsFromDescribe(response, config.new_column_names[0]?.trim() ?? '', Object.keys(config.rules), config.default_enumeration ?? ''),
          })),
          ...kmeansEntries.map((entry) => ({
            code: entry.code,
            rows: this.countsFromDescribe(
              response,
              entry.code,
              kmeansCreatorClusterChoices(entry.creator).map((choice) => choice.cluster_id),
              ''
            ),
          })),
        ];
        const hasAnyCount = blocks.some((block) => block.rows.some((row) => typeof row.count === 'number' && Number.isFinite(row.count)));
        this.blocks.set(blocks);
        this.error.set(
          hasAnyCount
            ? ''
            : isErrorResponse(response)
              ? LOAD_FAILED
              : 'No counts were returned (privacy threshold or insufficient data after preprocessing).'
        );
        this.loading.set(false);
      },
      error: () => {
        if (requestId === this.requestId) this.fail();
      },
    });
  }

  /** Applied K-means creators from store cards (every card with an output name). */
  private appliedKMeans(): Array<{ code: string; creator: Record<string, unknown> }> {
    return this.drafts
      .cards()
      .filter((step) => step.name === 'kmeans_cluster_creator')
      .map((step) => ({
        code: String((step.parameters['new_column_names'] as unknown[] | undefined)?.[0] ?? '').trim(),
        creator: step.parameters,
      }))
      .filter((entry) => !!entry.code);
  }

  /** Placeholder (null-count) rows for one card so Preview shows the category shape. */
  private placeholderRows(draft: TransformationColumnDraft): TransformationStatsBlock['rows'] {
    const configuredValues = draft.rules.map((rule) => rule.value.trim()).filter((value) => value.length > 0);
    const rows: TransformationStatsBlock['rows'] = configuredValues.map((value) => ({ value, count: null }));
    const fallback = draft.defaultEnumeration.trim();
    if (fallback && !configuredValues.includes(fallback)) rows.push({ value: fallback, count: null });
    return rows;
  }

  /**
   * Why no card reached a complete config, phrased once for every named card that is short
   * of one: a card with no named category needs a category, a card whose categories are
   * unnamed by a filter needs the filter. A stage with no named cards at all has nothing to
   * explain — the empty state already says so.
   */
  private gapNotice(): string {
    const gaps: string[] = [];
    if (this.drafts.drafts.some((draft) => draft.code.trim() && !draft.rules.some((rule) => rule.value.trim().length > 0))) {
      gaps.push('a named category');
    }
    if (this.drafts.rulesNeedFilters) gaps.push('a filter on each one');
    return gaps.length ? `Each derived column needs ${gaps.join(' and ')} before counts can be loaded.` : '';
  }

  /** Placeholder tables with a notice and nothing loading. */
  private show(blocks: TransformationStatsBlock[], notice: string): void {
    this.blocks.set(blocks);
    this.error.set(notice);
    this.loading.set(false);
  }

  private fail(): void {
    this.error.set(LOAD_FAILED);
    this.loading.set(false);
  }

  private countsFromDescribe(
    response: unknown,
    columnCode: string,
    configuredValues: string[],
    defaultEnumeration: string
  ): TransformationStatsBlock['rows'] {
    const featurewise = getFeaturewiseDescribeRows(response);
    const row =
      featurewise.find(
        (item: { variable?: string; dataset?: string }) =>
          item?.variable === columnCode && String(item?.dataset ?? '') === 'all datasets'
      ) ?? featurewise.find((item: { variable?: string }) => item?.variable === columnCode);
    const counts = (row as { data?: { counts?: Record<string, number> } })?.data?.counts ?? {};
    const ordered = [...configuredValues];
    if (defaultEnumeration && !ordered.includes(defaultEnumeration)) ordered.push(defaultEnumeration);
    Object.keys(counts).forEach((key) => {
      if (!ordered.includes(key)) ordered.push(key);
    });
    return ordered.map((value) => {
      const raw = counts[value];
      return { value, count: typeof raw === 'number' && Number.isFinite(raw) ? raw : null };
    });
  }
}

function isErrorResponse(response: unknown): boolean {
  const body = response as { status?: unknown; result?: { type?: unknown; data?: unknown } } | null;
  return (
    body?.status === 'error' ||
    (typeof body?.result?.type === 'string' && body.result.type.includes('error')) ||
    typeof body?.result?.data === 'string'
  );
}
