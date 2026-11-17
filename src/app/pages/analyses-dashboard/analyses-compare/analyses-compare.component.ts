import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, inject, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';

import { Analysis } from '../../../models/analyses-dashboard.model';
import { AnalysesDashboardService } from '../../../services/analyses-dashboard.service';
import { AlgorithmResultComponent } from '../../analysis-studio/algorithm-panel/algorithm-result/algorithm-result.component';
import { getOutputSchema } from '../../../core/algorithm-mappers';
import { AnalysisLabelService } from '../../../services/analysis-label.service';
import { EnumMaps } from '../../../core/algorithm-result-enum-mapper';
import { enrichPcaResult, withLabels } from '../../../core/result-label.utils';
import { StudiesService } from '../../../services/studies.service';
import { AnalysisStudioService } from '../../../services/analysis-studio.service';
import { AnalysisStatusComponent } from '../shared/analysis-status/analysis-status.component';

interface CompareResultState {
  loading: boolean;
  error: string | null;
  result: any | null;
  /** The run's algorithm parameters, so a two-group test can name its groups. */
  parameters?: Record<string, unknown> | null;
}

interface CompareItem {
  analysis: Analysis;
  state: CompareResultState;
}

/** One column: a run, its comparison-wide number, and the group tag when an analysis group claimed it. */
interface CompareColumn {
  item: CompareItem;
  number: number;
  groupTag: string | null;
}

@Component({
  selector: 'app-analyses-compare',
  imports: [CommonModule, AlgorithmResultComponent, AnalysisStatusComponent],
  templateUrl: './analyses-compare.component.html',
  styleUrl: './analyses-compare.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysesCompareComponent implements OnDestroy {
  private dashboardService = inject(AnalysesDashboardService);
  private labelService = inject(AnalysisLabelService);
  private studiesService = inject(StudiesService);
  private analysisStudio = inject(AnalysisStudioService);
  private destroy$ = new Subject<void>();

  analyses = input<Analysis[]>([]);

  /**
   * The study this compare was opened from, or null for a hand-picked selection. The id is enough:
   * groups are read from the same signal-backed service the canvas edits, so a group created after the
   * handoff still sections the workspace, and this view never has to write to it.
   */
  readonly originStudyId = input<string | null>(null);
  readonly backToStudy = output<void>();

  readonly originStudy = computed(() => this.studiesService.studyById(this.originStudyId()));
  readonly originStudyName = computed(() => this.originStudy()?.name ?? null);

  /** Says what the workspace is holding, so the header stops asking for a selection it already has. */
  readonly compareHeadline = computed(() => {
    const count = this.analyses().length;
    const runs = count === 1 ? 'run' : 'runs';
    return `Comparing ${this.originStudyName() ?? 'your selection'} · ${count} ${runs}`;
  });

  // Results map: analysisId -> state
  private resultMap = signal<Record<string, CompareResultState>>({});

  // Config collapse per analysis
  private configExpandedMap = signal<Record<string, boolean>>({});

  // Labels grouped by domain (data_model:version)
  private labelsByDomain = signal<Record<string, Record<string, string>>>({});
  private enumMapsByDomain = signal<Record<string, EnumMaps>>({});

  readonly analysesWithState = computed<CompareItem[]>(() => {
    const analyses = this.analyses();
    const map = this.resultMap();
    return analyses.map((analysis) => ({
      analysis,
      state: map[analysis.id] ?? { loading: false, error: null, result: null },
    }));
  });

  /**
   * The comparison's order, flattened to one column per run: user groups come first, in study order
   * — the order the canvas numbered them in — and everything nobody grouped follows as one group
   * per algorithm label, in the order the runs appear. Describe and histogram are ordinary
   * algorithm groups: an ungrouped run needs a home, not a special case. Numbering runs across the
   * whole comparison, so "run 7" names one column whichever group it landed in.
   */
  readonly columns = computed<CompareColumn[]>(() => {
    const groups: { groupTag: string | null; items: CompareItem[] }[] = [];
    const claimed = new Set<string>();

    for (const group of this.originStudy()?.groups ?? []) {
      const members = this.analysesWithState().filter((item) => group.analysisIds.includes(item.analysis.id));
      if (!members.length) continue; // An empty group has nothing to show; its tag can wait.
      members.forEach((member) => claimed.add(member.analysis.id));
      groups.push({ groupTag: group.name, items: members });
    }

    const byAlgorithm = new Map<string, CompareItem[]>();
    for (const item of this.analysesWithState()) {
      if (claimed.has(item.analysis.id)) continue;
      const key = item.analysis.algorithmName ?? 'unknown';
      const bucket = byAlgorithm.get(key);
      if (bucket) bucket.push(item);
      else byAlgorithm.set(key, [item]);
    }
    for (const items of byAlgorithm.values()) groups.push({ groupTag: null, items });

    let number = 0;
    return groups.flatMap((group) =>
      group.items.map((item) => ({ item, number: (number += 1), groupTag: group.groupTag })),
    );
  });

  constructor() {
    effect(
      () => {
        const analyses = this.analyses();
        const currentMap = this.resultMap();

        // load results for missing
        analyses.forEach((analysis) => {
          if (!currentMap[analysis.id]) this.loadResult(analysis.id);
        });

        const domains = Array.from(
          new Set(
            analyses
              .map((analysis) => analysis?.domain)
              .filter((domain): domain is string => !!domain)
          )
        );
        domains.forEach((domain) => {
          void this.loadLabels(domain);
          void this.loadEnumMaps(domain);
        });
      }
    );
  }

  private async loadLabels(domain: string | null) {
    if (!domain) return;
    if (this.labelsByDomain()[domain]) return;

    const map = await this.labelService.getLabelMap(domain);
    this.labelsByDomain.update((current) => ({ ...current, [domain]: map }));
  }

  private async loadEnumMaps(domain: string | null) {
    if (!domain) return;

    const cached = this.enumMapsByDomain()[domain];
    if (cached) return;

    const maps = await this.labelService.getEnumMaps(domain);
    this.enumMapsByDomain.update((current) => ({ ...current, [domain]: maps }));
  }


  isConfigExpanded(analysisId: string): boolean {
    return this.configExpandedMap()[analysisId] ?? false; // default collapsed
  }

  toggleConfig(analysisId: string) {
    this.configExpandedMap.update((m) => ({
      ...m,
      [analysisId]: !(m[analysisId] ?? false),
    }));
  }

  private loadResult(uuid: string) {
    this.resultMap.update((map) => ({
      ...map,
      [uuid]: { loading: true, error: null, result: null },
    }));

    this.dashboardService.getAnalysisResult(uuid).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.resultMap.update((map) => ({
          ...map,
          [uuid]: {
            loading: false,
            error: null,
            result: res?.result ?? res,
            parameters: res?.analysisRequest?.algorithm?.parameters ?? null,
          },
        }));
      },
      error: (err) => {
        console.error('Error loading analysis result for compare', err);
        this.resultMap.update((map) => ({
          ...map,
          [uuid]: {
            loading: false,
            error: 'Failed to load results.',
            result: null,
          },
        }));
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getOutputSchemaFor(analysis: Analysis) {
    return getOutputSchema(analysis.algorithmName) ?? [];
  }

  private getLabelMapForDomain(domain: string | null | undefined): Record<string, string> {
    if (!domain) return {};
    return this.labelsByDomain()[domain] ?? {};
  }

  private withLabels(codes: string[] | undefined | null, domain?: string | null) {
    return withLabels(codes, this.getLabelMapForDomain(domain));
  }

  /** The algorithm's human label, so a column's algorithm line reads like the list row above it. */
  algorithmLabel(code: string | null | undefined): string {
    if (!code) return 'Unknown algorithm';
    return this.analysisStudio.backendAlgorithms()[code]?.label || code;
  }

  getVariablesWithLabels(analysis: Analysis) {
    return this.withLabels((analysis as any).variables, analysis?.domain ?? null);
  }

  getCovariatesWithLabels(analysis: Analysis) {
    return this.withLabels((analysis as any).covariates, analysis?.domain ?? null);
  }

  getFiltersWithLabels(analysis: Analysis) {
    return this.withLabels((analysis as any).filters, analysis?.domain ?? null);
  }

  getEnumMapsFor(analysis: Analysis): EnumMaps {
    const domain = analysis?.domain ?? '';
    return this.enumMapsByDomain()[domain] ?? {};
  }

  getLabelMapFor(analysis: Analysis): Record<string, string> {
    return this.getLabelMapForDomain(analysis?.domain ?? null);
  }

  getYVarFor(analysis: Analysis): string | null {
    const vars = (analysis as any)?.variables;
    if (Array.isArray(vars)) return vars[0] ?? null;
    return null;
  }

  getXVarFor(analysis: Analysis): string | null {
    const vars = (analysis as any)?.covariates;
    if (Array.isArray(vars)) return vars[0] ?? null;
    return null;
  }

  enrichResult(analysis: Analysis, result: any): any {
    if (!result || !analysis) return result;
    return enrichPcaResult(result, analysis.algorithmName, [
      ...this.getVariablesWithLabels(analysis),
      ...this.getCovariatesWithLabels(analysis),
    ]);
  }
}
