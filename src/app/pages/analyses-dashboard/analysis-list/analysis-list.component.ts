import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, signal, effect, OnInit, OnDestroy, output, inject, input, viewChild, Renderer2, ChangeDetectorRef } from '@angular/core';
import { CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import { AnalysesDashboardService } from '../../../services/analyses-dashboard.service';
import { AnalysisStudioService } from '../../../services/analysis-studio.service';
import { StudiesService } from '../../../services/studies.service';
import { AnalysisLabelService } from '../../../services/analysis-label.service';
import { Analysis } from '../../../models/analyses-dashboard.model';
import { Study } from '../../../models/study.model';
import { CommonModule, formatDate } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AnalysisSearchComponent } from '../analysis-search/analysis-search.component';
import { AnalysisStatusComponent } from '../shared/analysis-status/analysis-status.component';
import { RouterModule } from '@angular/router';
import { isAnalysisOwner } from '../../../core/share.utils';
import { beginAnalysisDrag } from '../../../core/analysis-drag.utils';
import { formulaLine } from '../../../core/result-label.utils';
import { AnalysisFilters, ANALYSIS_SORTS, ANALYSIS_SORT_VALUES, AnalysisSort } from '../analysis-search/analysis-filter.model';
import { readDashboardQuery, updateDashboardQuery } from '../dashboard-query.utils';
import { InflightWrites } from '../../../core/inflight-writes';
import { statusChip } from '../shared/analysis-status/analysis-status.component';

/** A query-string value is only trusted when it is one the UI can actually offer. */
const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
  value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const DATE_PRESETS = ['any', 'today', '7d', '30d'] as const;
const STATUSES = ['any', 'success', 'error'] as const;
const SHARED = ['any', 'shared', 'private'] as const;

const RELATIVE_TIME = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });

/** Today, the six days before it, or earlier — by local calendar day. */
export function dayBucket(value: Date | string, now = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = date.getTime();
  if (time >= startOfToday) return 'Today';
  if (time >= startOfToday - 6 * 86_400_000) return 'This week';
  return 'Earlier';
}

@Component({
  selector: 'app-analyses-list',
  imports: [CommonModule, FormsModule, RouterModule, AnalysisSearchComponent, AnalysisStatusComponent, CdkMenu, CdkMenuItem],
  templateUrl: './analysis-list.component.html',
  styleUrl: './analysis-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysesListComponent implements OnInit, OnDestroy {
  analysesService = inject(AnalysesDashboardService);
  readonly studiesService = inject(StudiesService);
  readonly analysisStudio = inject(AnalysisStudioService);
  private readonly labelService = inject(AnalysisLabelService);
  /** Domain code → variable code → catalog label. Missing key means the map is still loading. */
  private readonly labelsByDomain = signal<Record<string, Record<string, string>>>({});
  private readonly labelLoads = new Set<string>();
  private renderer = inject(Renderer2);
  private cdr = inject(ChangeDetectorRef);

  readonly analysisSelected = output<Analysis>();
  /** null clears the study canvas; a study and an analysis never share the centre pane. */
  readonly studySelected = output<string | null>();
  readonly clearCompareSelection = output<void>();
  readonly compareToggled = output<string>();
  readonly compareOpened = output<void>();

  readonly selectedAnalysisId = input<string | null>(null);
  readonly selectedStudyId = input<string | null>(null);
  readonly currentUserEmail = input<string | null>(null);
  readonly compareIds = input<string[]>([]);

  constructor() {
    effect(() => {
      this.analysesService.getUserAnalyses(
        this.pageIndex(),
        this.pageSize,
        this.onlyMine(),
        this.filters(),
        this.sort(),
      );
    });

    effect(() => {
      const domains = this.pagedAnalyses()
        .map((analysis) => analysis.domain)
        .filter((domain): domain is string => !!domain);
      for (const domain of domains) {
        if (this.labelsByDomain()[domain] || this.labelLoads.has(domain)) continue;
        this.labelLoads.add(domain);
        void this.labelService.getLabelMap(domain).then((map) => {
          this.labelsByDomain.update((current) => ({ ...current, [domain]: map }));
        });
      }
    });

    // Running jobs change server-side; refresh the visible page while any row is still active.
    this.statusPoll = setInterval(() => {
      if (this.hasRunningAnalyses()) {
        this.refreshCurrentPage();
      }
    }, 15_000);
  }

  ngOnInit(): void {
    this.applyUrlState();
  }

  @HostListener('window:popstate')
  onDashboardPopState() {
    this.applyUrlState();
  }

  private applyUrlState(): void {
    const params = readDashboardQuery();
    const tab = params.get('tab');
    const page = Number(params.get('page') ?? '0');
    const query = params.get('q');
    const datePreset = params.get('date');
    const algorithm = params.get('algo');
    const author = params.get('author');
    const variable = params.get('variable');
    const status = params.get('status');
    const shared = params.get('shared');
    const sort = params.get('sort');

    if (tab === 'mine' || tab === 'shared') {
      this.onlyMine.set(tab === 'mine');
    } else {
      this.onlyMine.set(this.initialOnlyMine());
    }

    this.pageIndex.set(Number.isFinite(page) && page > 0 ? Math.floor(page) : 0);
    this.filters.set({
      query: query ?? '',
      datePreset: pick(datePreset, DATE_PRESETS, 'any'),
      algorithm: algorithm ?? null,
      author: author ?? null,
      variable: variable ?? null,
      status: pick(status, STATUSES, 'any'),
      shared: pick(shared, SHARED, 'any'),
    });
    this.sort.set(pick(sort, ANALYSIS_SORT_VALUES, 'created-desc'));
  }

  private syncUrlState(): void {
    const filters = this.filters();
    updateDashboardQuery({
      tab: this.onlyMine() ? 'mine' : 'shared',
      page: this.pageIndex() > 0 ? String(this.pageIndex()) : null,
      sort: this.sort() !== 'created-desc' ? this.sort() : null,
      q: filters.query || null,
      date: filters.datePreset !== 'any' ? filters.datePreset : null,
      algo: filters.algorithm,
      author: filters.author,
      variable: filters.variable,
      status: filters.status !== 'any' ? filters.status : null,
      shared: filters.shared !== 'any' ? filters.shared : null,
    });
  }

  ngOnDestroy(): void {
    this.unlistenStudyMenuClick?.();
    this.unlistenStudyMenuClick = null;
    if (this.statusPoll) {
      clearInterval(this.statusPoll);
      this.statusPoll = null;
    }
  }

  /** `pending` is the only status the backend can leave a run in, so it is the one worth polling. */
  private hasRunningAnalyses(): boolean {
    return this.analysesService.analyses().some((analysis) => statusChip(analysis.status).tone === 'pending');
  }

  private refreshCurrentPage(): void {
    this.analysesService.invalidateListCache();
    this.analysesService.getUserAnalyses(
      this.pageIndex(),
      this.pageSize,
      this.onlyMine(),
      this.filters(),
      this.sort(),
    );
  }

  // toggle
  readonly initialOnlyMine = input(true);
  readonly onlyMine = signal(true);

  // pagination
  readonly pageSize = 10;
  readonly pageIndex = signal(0);

  // sort
  readonly sort = signal<AnalysisSort>('created-desc');
  /** The menu and the trigger's tooltip both read the one list of orders. */
  readonly sortOptions = ANALYSIS_SORT_VALUES.map((value) => ({ value, label: ANALYSIS_SORTS[value].label }));
  readonly sortLabel = computed(() => ANALYSIS_SORTS[this.sort()].label);
  private readonly sortMenu = viewChild<ElementRef<HTMLDetailsElement>>('sortMenu');

  // advanced filters
  readonly filtersOpen = signal(false);

  // filters (single source of truth)
  readonly filters = signal<AnalysisFilters>({
    query: '',
    datePreset: 'any',
    algorithm: null,
    author: null,
    variable: null,
    status: 'any',
    shared: 'any',
  });

  readonly activeFilterCount = computed(() => {
    const value = this.filters();
    return [
      value.query?.trim(),
      value.datePreset !== 'any',
      value.algorithm,
      value.author,
      value.variable,
      value.status !== 'any',
      value.shared !== 'any',
    ].filter(Boolean).length;
  });

  readonly hasActiveFilters = computed(() => this.activeFilterCount() > 0);

  readonly algorithmOptions = computed(() =>
    Object.entries(this.analysisStudio.backendAlgorithms())
      .map(([value, config]) => ({ value, label: config?.label ?? value }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );

  private statusPoll: ReturnType<typeof setInterval> | null = null;

  patchFilters(patch: Partial<AnalysisFilters>) {
    this.filters.update(f => ({ ...f, ...patch }));
    this.pageIndex.set(0);
    this.syncUrlState();
  }

  /** The menu is a choice, not a hold: picking an order folds the <details> back into the icon. */
  setSort(sort: AnalysisSort) {
    this.sortMenu()?.nativeElement.removeAttribute('open');
    if (this.sort() === sort) return;
    this.sort.set(sort);
    this.pageIndex.set(0);
    this.syncUrlState();
  }

  toggleFilters() {
    this.filtersOpen.update((open) => !open);
  }

  clearFilters() {
    this.patchFilters({
      query: '',
      datePreset: 'any',
      algorithm: null,
      author: null,
      variable: null,
      status: 'any',
      shared: 'any',
    });
    this.filtersOpen.set(false);
  }

  // compare helper
  isInCompare(id: string): boolean {
    return this.compareIds().includes(id);
  }

  onCompareCheck(id: string, event: Event): void {
    event.stopPropagation();
    this.compareToggled.emit(id);
  }

  setTab(isMine: boolean) {
    if (this.onlyMine() === isMine) return;
    this.onlyMine.set(isMine);
    this.pageIndex.set(0);
    this.syncUrlState();
  }

  // ---- studies: the chip strip under the tabs ----
  readonly isCreatingStudy = signal(false);
  readonly newStudyDraft = signal('');
  readonly studyFormError = signal<string | null>(null);
  /**
   * A study write the server refused for a reason a name cannot explain. Nothing was cached
   * locally, so the strip is the only place this could surface — and it has to surface, or a dead
   * backend looks exactly like a study that simply did not take the run.
   */
  readonly studyWriteError = signal<string | null>(null);
  /**
   * Every study mutation goes through the tracker: one request per gesture on the wire (a doubled
   * click is one write, an add to study A and an add to study B may overlap), the server's copy
   * written back by the service, and any failure the service could not name landing on the strip
   * instead of disappearing into an unhandled subscription.
   */
  private readonly writes = new InflightWrites((message) => this.studyWriteError.set(message));
  readonly studyBusy = this.writes.busy;

  onStudyPick(value: string): void {
    this.closeStudyMenu();
    this.isCreatingStudy.set(false);
    this.studyFormError.set(null);
    this.studySelected.emit(value === 'all' ? null : value);
  }

  startNewStudy() {
    this.newStudyDraft.set('');
    this.studyFormError.set(null);
    this.studyWriteError.set(null);
    this.isCreatingStudy.set(true);
  }

  cancelNewStudy() {
    this.isCreatingStudy.set(false);
    this.studyFormError.set(null);
  }

  commitNewStudy() {
    const name = this.newStudyDraft();
    this.writes.run(
      `create-study:${name.trim().toLowerCase()}`,
      this.studiesService.createStudy(name),
      (created) => {
        if (!created) {
          this.studyFormError.set(name.trim() ? 'That name is taken.' : 'Give the study a name.');
          return;
        }

        // Open the new study: its empty canvas is where adding runs gets explained.
        this.isCreatingStudy.set(false);
        this.studyFormError.set(null);
        this.studyWriteError.set(null);
        this.studySelected.emit(created.id);
      },
      'Could not create the study — nothing was saved.',
    );
  }

  // ---- studies: per-row add-to-study menu ----
  readonly studyMenuAnalysisId = signal<string | null>(null);
  readonly studyMenuNewOpen = signal(false);
  readonly studyMenuDraft = signal('');
  readonly studyMenuError = signal<string | null>(null);

  private readonly studyMenu = viewChild(CdkMenu);
  private unlistenStudyMenuClick: (() => void) | null = null;

  isStudyMember(studyId: string, analysisId: string): boolean {
    return this.studiesService.isMember(studyId, analysisId);
  }

  toggleStudyMenu(analysisId: string): void {
    if (this.studyMenuAnalysisId() === analysisId) {
      this.closeStudyMenu();
      return;
    }
    this.openStudyMenu(analysisId);
  }

  private openStudyMenu(analysisId: string): void {
    this.studyMenuAnalysisId.set(analysisId);
    this.studyMenuNewOpen.set(false);
    this.studyMenuDraft.set('');
    this.studyMenuError.set(null);
    // The menu is an @if, so CdkMenu's roving tabindex only exists after this render.
    this.cdr.detectChanges();
    this.studyMenu()?.focusFirstItem();

    this.unlistenStudyMenuClick?.();
    this.unlistenStudyMenuClick = this.renderer.listen(document, 'pointerdown', (event: PointerEvent) => {
      // Every row carries a trigger and only one row carries a panel, so the click is judged by
      // what was hit rather than by a per-row template ref. The trigger decides its own fate in
      // its click handler; anything else outside the open menu is a click away.
      const target = event.target as HTMLElement | null;
      if (target?.closest('.study-menu-anchor, .study-menu')) return;
      this.closeStudyMenu();
    });
  }

  closeStudyMenu(): void {
    if (!this.studyMenuAnalysisId()) return;
    this.studyMenuAnalysisId.set(null);
    this.studyMenuNewOpen.set(false);
    this.studyMenuError.set(null);
    this.unlistenStudyMenuClick?.();
    this.unlistenStudyMenuClick = null;
  }

  /** One pick adds or drops the run, and the menu stays open for a second one. */
  onStudyMenuPick(study: Study, analysisId: string): void {
    this.writes.run(
      `toggle-member:${study.id}:${analysisId}`,
      this.studiesService.toggleAnalysis(study.id, analysisId),
      () => this.studyMenuError.set(null),
      'Could not change this study — nothing was saved.',
    );
  }

  openStudyMenuNew(): void {
    this.studyMenuNewOpen.set(true);
    this.studyMenuDraft.set('');
    this.studyMenuError.set(null);
  }

  commitStudyMenuNew(analysisId: string): void {
    const name = this.studyMenuDraft();
    this.writes.run(
      `create-study-member:${analysisId}:${name.trim().toLowerCase()}`,
      this.studiesService.createStudy(name, analysisId),
      (created) => {
        if (!created) {
          this.studyMenuError.set(name.trim() ? 'That name is taken.' : 'Give the study a name.');
          return;
        }
        this.studyMenuNewOpen.set(false);
        this.studyMenuError.set(null);
        this.studyWriteError.set(null);
      },
      'Could not create the study — nothing was saved.',
    );
  }

  readonly draggingAnalysisId = signal<string | null>(null);

  onAnalysisDragStart(analysis: Analysis, event: DragEvent): void {
    beginAnalysisDrag(event.dataTransfer, analysis.id);
    this.draggingAnalysisId.set(analysis.id);
    this.closeStudyMenu();
  }

  onAnalysisDragEnd(): void {
    this.draggingAnalysisId.set(null);
  }

  isOwner(analysis: Analysis): boolean {
    return isAnalysisOwner(this.currentUserEmail(), analysis.authorEmail);
  }

  /** Outcome and predictors on one line, using catalog labels. A bare variable code is never shown. */
  modelLine(analysis: Analysis): string {
    const domain = analysis.domain;
    const map = domain ? this.labelsByDomain()[domain] : undefined;
    if (domain && !map) return '';
    const names = (codes: string[] | undefined) =>
      (codes ?? []).map((code) => this.displayName(code, map)).filter((name) => name.length > 0);
    return formulaLine(names(analysis.variables), names(analysis.covariates));
  }

  private displayName(code: string, map: Record<string, string> | undefined): string {
    const label = map?.[code];
    if (label && label !== code) return label;
    // An empty map means the catalog could not be read (load failed or the model version is
    // gone); showing the code beats a row that silently loses its variables.
    if (map && Object.keys(map).length === 0) return code;
    if (map || /^[a-z][a-z0-9_]*$/.test(code)) return '';
    return code;
  }

  metaLine(analysis: Analysis): string {
    const parts = [this.getAlgorithmLabel(analysis.algorithmName), this.relativeWhen(analysis.dateCreated)];
    if (!this.isOwner(analysis)) {
      const who = analysis.authorEmail?.split('@')[0] || analysis.author;
      if (who) parts.push(who);
    }
    return parts.filter(Boolean).join(' · ');
  }

  private relativeWhen(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    const minutes = Math.round((date.getTime() - Date.now()) / 60000);
    if (!Number.isFinite(minutes)) return '';
    if (minutes > -1) return 'Just now';
    if (minutes > -60) return RELATIVE_TIME.format(minutes, 'minute');
    if (minutes > -1440) return RELATIVE_TIME.format(Math.round(minutes / 60), 'hour');
    if (minutes > -10080) return RELATIVE_TIME.format(Math.round(minutes / 1440), 'day');
    return formatDate(date, 'mediumDate', 'en-US');
  }

  // pages
  readonly totalPages = computed(() => this.analysesService.totalPages());
  readonly isLoading = computed(() => this.analysesService.isLoading());
  readonly currentPage = computed(() => this.pageIndex() + 1);
  readonly totalAnalyses = computed(() => this.analysesService.totalAnalyses());
  readonly historyTruncated = computed(() => this.analysesService.historyTruncated());
  readonly historyCap = computed(() => this.analysesService.fullHistoryCap);

  readonly pagedAnalyses = computed<Analysis[]>(() => {
    return this.analysesService.analyses();
  });

  /** Day buckets in list order. Only a date sort is bucketed; any other order is one unlabelled group. */
  readonly analysisGroups = computed(() => {
    const rows = this.pagedAnalyses();
    if (!this.sort().startsWith('created')) return [{ label: '', rows }];
    const groups: { label: string; rows: Analysis[] }[] = [];
    for (const analysis of rows) {
      const label = dayBucket(analysis.dateCreated);
      const last = groups.at(-1);
      if (last?.label === label) last.rows.push(analysis);
      else groups.push({ label, rows: [analysis] });
    }
    return groups;
  });

  readonly rangeStart = computed(() =>
    this.totalAnalyses() === 0 ? 0 : this.pageIndex() * this.pageSize + 1,
  );

  readonly rangeEnd = computed(() =>
    Math.min(this.pageIndex() * this.pageSize + this.pagedAnalyses().length, this.totalAnalyses()),
  );
  readonly guideAnalysisId = computed(() => this.selectGuideAnalysis(this.pagedAnalyses())?.id ?? null);

  // pagination helpers
  goToPage(page: number) {
    const max = this.totalPages();
    if (page < 1) page = 1;
    if (page > max) page = max;
    this.pageIndex.set(page - 1);
    this.syncUrlState();
  }

  nextPage() {
    this.goToPage(this.pageIndex() + 2);
  }

  prevPage() {
    this.goToPage(this.pageIndex());
  }

  // selection / delete (unchanged)
  selectAnalysis(analysis: Analysis) {
    this.analysisSelected.emit(analysis);
  }

  onRowKeydown(event: KeyboardEvent, analysis: Analysis) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.selectAnalysis(analysis);
  }

  isGuideAnalysis(analysis: Analysis): boolean {
    return analysis.id === this.guideAnalysisId();
  }

  getAlgorithmLabel(code: string | null | undefined): string {
    if (!code) return 'Unknown algorithm';
    const algoConfig = this.analysisStudio.backendAlgorithms()[code];
    return algoConfig?.label || code;
  }

  private selectGuideAnalysis(analyses: Analysis[]): Analysis | null {
    if (!analyses.length) {
      return null;
    }

    let bestMatch = analyses[0];
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const analysis of analyses) {
      const name = analysis.name.toLowerCase();
      const algorithmName = analysis.algorithmName.toLowerCase();
      const variables = (analysis.variables ?? []).map((value) => value.toLowerCase());
      let score = 0;

      if (analysis.isShared) {
        score += 2;
      }

      if (name.includes('tutorial') || name.includes('guide') || name.includes('example')) {
        score += 4;
      }

      if (algorithmName.includes('anova') || name.includes('anova')) {
        score += 3;
      }

      if (name.includes('one-way') || name.includes('one way') || name.includes('oneway')) {
        score += 2;
      }

      if (variables.some((value) => value.includes('age'))) {
        score += 1;
      }

      if (variables.some((value) => value.includes('sex'))) {
        score += 1;
      }

      if (score > bestScore) {
        bestMatch = analysis;
        bestScore = score;
      }
    }

    return bestMatch;
  }
}
