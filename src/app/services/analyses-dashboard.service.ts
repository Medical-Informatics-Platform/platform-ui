import { Injectable, signal, WritableSignal, inject } from '@angular/core';
import { Analysis } from '../models/analyses-dashboard.model';
import { HttpClient } from '@angular/common/http';
import { BackendAnalysis, BackendAnalysisWithResult } from '../models/backend-analysis.model';
import { mapBackendToFrontend } from '../pages/analyses-dashboard/analyses-dashboard.mapper';
import {
  ANALYSIS_SORTS,
  AnalysisDatePreset,
  AnalysisFilters,
  AnalysisSort,
} from '../pages/analyses-dashboard/analysis-search/analysis-filter.model';
import { Observable, Subscription, catchError, forkJoin, map, of, switchMap, tap, throwError } from 'rxjs';
import { ErrorService } from './error.service';
import { isNotFoundError } from '../core/http-error.utils';

interface AnalysesPage {
  analyses: BackendAnalysis[];
  totalAnalyses: number;
  totalPages: number;
  currentPage: number;
}

const PAGE_SIZE_FOR_FULL_LOAD = 50;
/**
 * A filter the backend contract cannot express (substring search, author, variable, status,
 * date) is answered from one ownership-scoped snapshot of the history, sliced here. That
 * snapshot is capped, so past `FULL_LOAD_HISTORY_CAP` runs a search is honest about the
 * range it covered rather than implying it read everything. Retiring the cap needs a backend
 * substring/date filter, which retires loadAllAnalyses entirely.
 */
const MAX_FULL_LOAD_PAGES = 50;
const FULL_LOAD_HISTORY_CAP = PAGE_SIZE_FOR_FULL_LOAD * MAX_FULL_LOAD_PAGES;

/** One ownership-scoped read of the history, and whether the cap cut it short. */
interface Snapshot {
  analyses: Analysis[];
  truncated: boolean;
}

const DEFAULT_FILTERS: AnalysisFilters = {
  query: '',
  datePreset: 'any',
  algorithm: null,
  author: null,
  variable: null,
  status: 'any',
  shared: 'any',
};

@Injectable({
  providedIn: 'root',
})
export class AnalysesDashboardService {
  private apiUrl = '/services/analyses';

  analyses: WritableSignal<Analysis[]> = signal<Analysis[]>([]);
  totalAnalyses = signal<number>(0);
  /** True when a client-side filter had to stop at `fullHistoryCap` runs. */
  historyTruncated = signal<boolean>(false);
  readonly fullHistoryCap = FULL_LOAD_HISTORY_CAP;
  totalPages = signal<number>(0);
  currentPage = signal<number>(0);
  isLoading = signal<boolean>(false);

  private http = inject(HttpClient);
  private analysesRequestSub: Subscription | null = null;
  private lastListRequest: (() => void) | null = null;

  /** Full per-tab cache used only when a filter cannot be pushed to the backend contract. */
  private allAnalysesCache = new Map<'mine' | 'shared', Snapshot>();

  /** Clears the client-filter snapshot so the next load reads the backend again. */
  invalidateListCache(): void {
    this.allAnalysesCache.clear();
  }

  private errorService = inject(ErrorService);

  constructor() { }

  /**
   * Loads a dashboard page.
   *
   * The backend supports ownership, name-prefix, popularity and a few flags directly, but not
   * description/author/variable/status/date filters and not true substring search. When the
   * user asks for one of those, load the ownership-scoped history once and slice it here so
   * the controls do what they say. Normal browsing stays server-paginated.
   */
  getUserAnalyses(
    page: number = 0,
    size: number = 10,
    onlyMine: boolean = false,
    filters?: Partial<AnalysisFilters>,
    sort: AnalysisSort = 'created-desc',
  ): void {
    const effectiveFilters: AnalysisFilters = { ...DEFAULT_FILTERS, ...(filters ?? {}) };
    this.lastListRequest = () => this.getUserAnalyses(page, size, onlyMine, effectiveFilters, sort);

    this.analysesRequestSub?.unsubscribe();
    this.isLoading.set(true);

    if (this.needsClientFiltering(effectiveFilters)) {
      this.analysesRequestSub = this.loadAllAnalyses(onlyMine, sort).subscribe({
        next: (all) => this.applyClientView(all, page, size, effectiveFilters),
        error: (err) => this.handleListError(err),
      });
      return;
    }

    this.analysesRequestSub = this.http
      .get<AnalysesPage>(this.apiUrl, {
        params: this.buildServerParams(page, size, onlyMine, sort, effectiveFilters),
      })
      .subscribe({
        next: (response) => this.applyServerPage(response),
        error: (err) => this.handleListError(err),
      });
  }

  retryLastRequest(): void {
    this.lastListRequest?.();
  }

  /**
   * The user's own K-means analyses (newest first) that can provide cluster columns.
   * The picker replays the run's stored preprocessing, so it must not read the shared
   * scope: another user's clusters are not a column this user may inject.
   */
  listKMeansAnalyses(): Observable<BackendAnalysis[]> {
    return this.http
      .get<AnalysesPage>(this.apiUrl, {
        params: this.buildServerParams(0, 50, true, 'created-desc', {
          ...DEFAULT_FILTERS,
          algorithm: 'kmeans',
        }),
      })
      .pipe(map((page) => page?.analyses ?? []));
  }

  /**
   * The user's own PCA analyses (newest first) that can provide component columns.
   * Own scope only — same rationale as {@link listKMeansAnalyses}.
   */
  listPcaAnalyses(): Observable<BackendAnalysis[]> {
    return this.http
      .get<AnalysesPage>(this.apiUrl, {
        params: this.buildServerParams(0, 50, true, 'created-desc', {
          ...DEFAULT_FILTERS,
          algorithm: 'pca',
        }),
      })
      .pipe(map((page) => page?.analyses ?? []));
  }

  private applyServerPage(response: AnalysesPage | null): void {
    this.isLoading.set(false);
    const mappedAnalyses = (response?.analyses || []).map(mapBackendToFrontend);
    this.analyses.set(mappedAnalyses);
    this.totalAnalyses.set(response?.totalAnalyses || 0);
    this.totalPages.set(response?.totalPages || 0);
    this.currentPage.set(response?.currentPage || 0);
    // Server-paginated browsing never reads a capped snapshot.
    this.historyTruncated.set(false);
  }

  /** The snapshot arrives already in the requested order (the server sorted it), so filtering and
   * slicing preserve that order — there is nothing to re-sort here. */
  private applyClientView(
    all: Analysis[],
    page: number,
    size: number,
    filters: AnalysisFilters,
  ): void {
    this.isLoading.set(false);
    const sorted = all.filter((analysis) => this.matchesFilters(analysis, filters));
    const total = sorted.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / size);
    const safePage = total === 0 ? 0 : Math.min(page, Math.max(0, totalPages - 1));

    this.analyses.set(sorted.slice(safePage * size, safePage * size + size));
    this.totalAnalyses.set(total);
    this.totalPages.set(totalPages);
    this.currentPage.set(safePage);
  }

  private buildServerParams(
    page: number,
    size: number,
    onlyMine: boolean,
    sort: AnalysisSort,
    filters: AnalysisFilters,
  ): Record<string, string> {
    const params: Record<string, string> = {
      ...this.baseListParams(page, size, onlyMine),
      ...this.sortParams(sort),
    };

    if (filters.algorithm) params['algorithm'] = filters.algorithm;
    if (filters.shared !== 'any') params['shared'] = (filters.shared === 'shared').toString();

    return params;
  }

  private baseListParams(page: number, size: number, onlyMine: boolean): Record<string, string> {
    return {
      page: page.toString(),
      size: size.toString(),
      mine: onlyMine.toString(),
      notMine: (!onlyMine).toString(),
      includeShared: (!onlyMine).toString(),
    };
  }

  private sortParams(sort: AnalysisSort): Record<string, string> {
    const { orderBy, descending } = ANALYSIS_SORTS[sort] ?? ANALYSIS_SORTS['created-desc'];
    return { orderBy, descending: descending.toString() };
  }

  private buildFullLoadParams(page: number, onlyMine: boolean, sort: AnalysisSort): Record<string, string> {
    return {
      ...this.baseListParams(page, PAGE_SIZE_FOR_FULL_LOAD, onlyMine),
      ...this.sortParams(sort),
    };
  }

  private loadAllAnalyses(onlyMine: boolean, sort: AnalysisSort): Observable<Analysis[]> {
    const cacheKey: 'mine' | 'shared' = onlyMine ? 'mine' : 'shared';
    const cached = this.allAnalysesCache.get(cacheKey);
    if (cached) {
      this.historyTruncated.set(cached.truncated);
      return of(cached.analyses);
    }

    const fetchPage = (page: number): Observable<{ page: AnalysesPage; analyses: Analysis[] }> =>
      this.http
        .get<AnalysesPage>(this.apiUrl, { params: this.buildFullLoadParams(page, onlyMine, sort) })
        .pipe(
          map((response) => ({
            page: response,
            analyses: (response?.analyses || []).map(mapBackendToFrontend),
          })),
        );

    return fetchPage(0).pipe(
      switchMap((first) => {
        const serverPages = first.page?.totalPages || 1;
        const pageCount = Math.min(Math.max(1, serverPages), MAX_FULL_LOAD_PAGES);
        const pageRequests = Array.from({ length: pageCount - 1 }, (_, index) => fetchPage(index + 1));

        return (pageRequests.length ? forkJoin(pageRequests) : of([])).pipe(
          map((rest): Snapshot => ({
            analyses: [
              ...first.analyses,
              ...rest.flatMap((entry) => entry.analyses),
            ],
            // Pages the history had that the cap refused to read: the search did not see them.
            truncated: serverPages > pageCount,
          })),
        );
      }),
      tap((snapshot) => {
        this.allAnalysesCache.set(cacheKey, snapshot);
        this.historyTruncated.set(snapshot.truncated);
      }),
      map((snapshot) => snapshot.analyses),
    );
  }

  private needsClientFiltering(filters: AnalysisFilters): boolean {
    return Boolean(
      filters.query?.trim() ||
      filters.author ||
      filters.variable ||
      filters.status !== 'any' ||
      filters.datePreset !== 'any',
    );
  }

  private matchesFilters(analysis: Analysis, filters: AnalysisFilters): boolean {
    if (!this.matchesQuery(analysis, filters.query)) return false;
    if (filters.algorithm && analysis.algorithmName !== filters.algorithm) return false;
    if (filters.author && !this.normalize(analysis.author).includes(this.normalize(filters.author))) return false;
    if (filters.variable && !this.matchesVariable(analysis, filters.variable)) return false;
    if (filters.status !== 'any' && analysis.status !== filters.status) return false;
    if (filters.shared === 'shared' && !analysis.isShared) return false;
    if (filters.shared === 'private' && analysis.isShared) return false;
    if (!this.matchesDatePreset(analysis.dateCreated, filters.datePreset)) return false;
    return true;
  }

  private matchesQuery(analysis: Analysis, query: string): boolean {
    const needle = this.normalize(query);
    if (!needle) return true;

    const fields = [
      analysis.name,
      analysis.description,
      analysis.author,
      analysis.algorithmName,
      analysis.domain,
      ...(analysis.datasets ?? []),
      ...(analysis.variables ?? []),
      ...(analysis.covariates ?? []),
    ];

    return fields.some((value) => this.normalize(value).includes(needle));
  }

  private matchesVariable(analysis: Analysis, variable: string): boolean {
    const needle = this.normalize(variable);
    if (!needle) return true;

    return [...(analysis.variables ?? []), ...(analysis.covariates ?? [])].some((value) =>
      this.normalize(value).includes(needle),
    );
  }

  private matchesDatePreset(date: Date, preset: AnalysisDatePreset): boolean {
    if (!preset || preset === 'any') return true;
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (preset === 'today') return date >= startOfToday;

    const days = preset === '7d' ? 7 : 30;
    const from = new Date(startOfToday);
    from.setDate(from.getDate() - days);
    return date >= from;
  }

  private handleListError(err: unknown): void {
    this.isLoading.set(false);
    console.error('[AnalysesDashboardService] getUserAnalyses error', err);
    this.errorService.setError('Failed to load analyses.');
    this.analyses.set([]);
    this.totalAnalyses.set(0);
    this.totalPages.set(0);
    this.currentPage.set(0);
    this.historyTruncated.set(false);
  }

  private normalize(value: string | null | undefined): string {
    return (value ?? '').toLowerCase();
  }

  // For edit / hydrate (metadata)
  getAnalysis(uuid: string) {
    return this.http.get<BackendAnalysis>(`${this.apiUrl}/${uuid}`);
  }

  fetchAnalysisById(uuid: string) {
    return this.http
      .get<BackendAnalysis>(`${this.apiUrl}/${uuid}`)
      .pipe(map(mapBackendToFrontend));
  }

  upsertAnalysis(analysis: Analysis): void {
    if (!analysis?.id) return;
    this.analyses.update((current) => {
      const idx = current.findIndex((item) => item.id === analysis.id);
      if (idx === -1) {
        return [analysis, ...current];
      }
      const next = [...current];
      next[idx] = { ...current[idx], ...analysis };
      return next;
    });

    // The snapshot is a server read, so a local edit drops it rather than being merged into it.
    this.allAnalysesCache.clear();
  }

  /**
   * Resolves `ids` to analyses in study order, fetching the members that sit on another
   * page. The compare workspace reads the loaded page only, so without this an off-page
   * member of a study would drop out of the comparison silently. A member the backend no
   * longer returns is skipped here; the study canvas reports and prunes it.
   */
  hydrateAnalyses(ids: string[]): Observable<Analysis[]> {
    const known = new Map(this.analyses().map((analysis) => [analysis.id, analysis] as const));
    const missing = ids.filter((id) => !known.has(id));

    const resolved = (fetched: Analysis[]): Analysis[] => {
      fetched.forEach((analysis) => this.upsertAnalysis(analysis));
      const byId = new Map(known);
      fetched.forEach((analysis) => byId.set(analysis.id, analysis));
      return ids
        .map((id) => byId.get(id))
        .filter((analysis): analysis is Analysis => !!analysis);
    };

    if (!missing.length) return of(resolved([]));

    return forkJoin(
      missing.map((id) =>
        this.fetchAnalysisById(id).pipe(
          // A 404 means the member is gone and may be dropped. Any other failure is a real
          // fetch failure and must reach the caller so the UI can say the handoff failed.
          catchError((err) => isNotFoundError(err) ? of<Analysis | null>(null) : throwError(() => err)),
        ),
      ),
    ).pipe(
      map((fetched) =>
        resolved(fetched.filter((analysis): analysis is Analysis => !!analysis)),
      ),
    );
  }

  // For compare / results view
  getAnalysisResult(uuid: string) {
    return this.http.get<BackendAnalysisWithResult>(`${this.apiUrl}/${uuid}`);
  }

  toggleAnalysisShare(analysisId: string, newShared: boolean) {
    return this.http
      .patch<BackendAnalysis>(`${this.apiUrl}/${analysisId}`, { shared: newShared })
      .pipe(
        tap((updated) => {
          this.analyses.update((current) =>
            current.map((analysis) =>
              analysis.id === analysisId
                ? { ...analysis, isShared: updated.shared }
                : analysis
            )
          );
        })
      );
  }

  updateAnalysisName(analysisId: string, name: string) {
    return this.http
      .patch<BackendAnalysis>(`${this.apiUrl}/${analysisId}`, { name })
      .pipe(
        tap((updated) => {
          this.analyses.update((current) =>
            current.map((analysis) =>
              analysis.id === analysisId
                ? { ...analysis, name: updated.name }
                : analysis
            )
          );
        })
      );
  }

  deleteAnalysis(analysisId: string, onDeleted?: (analysisId: string) => void): void {
    if (!analysisId) return;

    const previousAnalyses = this.analyses();
    const previousTotal = this.totalAnalyses();
    this.allAnalysesCache.clear();

    // Optimistic update UI
    this.analyses.update((current: Analysis[]) =>
      current.filter((analysis: Analysis) => analysis.id !== analysisId)
    );
    this.totalAnalyses.set(Math.max(0, previousTotal - 1));

    // Backend call with rollback on failure
    this.http.delete<void>(`${this.apiUrl}/${analysisId}`).subscribe({
      next: () => {
        onDeleted?.(analysisId);
      },
      error: (err) => {
        console.error('Error deleting analysis', err);
        this.analyses.set(previousAnalyses);
        this.totalAnalyses.set(previousTotal);
        this.allAnalysesCache.clear();
        this.errorService.setError('Failed to delete analysis.');
      },
    });
  }
}
