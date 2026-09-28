import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, signal, effect, OnInit, OnDestroy, output, inject, input, viewChild, Renderer2, ChangeDetectorRef } from '@angular/core';
import { CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import { ExperimentsDashboardService } from '../../../services/experiments-dashboard.service';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentFoldersService } from '../../../services/experiment-folders.service';
import { ExperimentLabelService } from '../../../services/experiment-label.service';
import { Experiment } from '../../../models/experiments-dashboard.model';
import { ExperimentFolder } from '../../../models/experiment-folder.model';
import { CommonModule, formatDate } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExperimentSearchComponent } from '../experiment-search/experiment-search.component';
import { ExperimentStatusComponent } from '../shared/experiment-status/experiment-status.component';
import { RouterModule } from '@angular/router';
import { isExperimentOwner } from '../../../core/share.utils';
import { beginExperimentDrag } from '../../../core/experiment-drag.utils';
import { formulaLine } from '../../../core/result-label.utils';
import { ExperimentFilters, EXPERIMENT_SORTS, EXPERIMENT_SORT_VALUES, ExperimentSort } from '../experiment-search/experiment-filter.model';
import { readDashboardQuery, updateDashboardQuery } from '../dashboard-query.utils';
import { InflightWrites } from '../../../core/inflight-writes';
import { statusChip } from '../shared/experiment-status/experiment-status.component';

/** A query-string value is only trusted when it is one the UI can actually offer. */
const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
  value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const DATE_PRESETS = ['any', 'today', '7d', '30d'] as const;
const STATUSES = ['any', 'success', 'error'] as const;
const SHARED = ['any', 'shared', 'private'] as const;

const RELATIVE_TIME = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });

@Component({
  selector: 'app-experiments-list',
  imports: [CommonModule, FormsModule, RouterModule, ExperimentSearchComponent, ExperimentStatusComponent, CdkMenu, CdkMenuItem],
  templateUrl: './experiment-list.component.html',
  styleUrl: './experiment-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExperimentsListComponent implements OnInit, OnDestroy {
  experimentsService = inject(ExperimentsDashboardService);
  readonly foldersService = inject(ExperimentFoldersService);
  readonly expStudio = inject(ExperimentStudioService);
  private readonly labelService = inject(ExperimentLabelService);
  /** Domain code → variable code → catalog label. Missing key means the map is still loading. */
  private readonly labelsByDomain = signal<Record<string, Record<string, string>>>({});
  private readonly labelLoads = new Set<string>();
  private renderer = inject(Renderer2);
  private cdr = inject(ChangeDetectorRef);

  readonly experimentSelected = output<Experiment>();
  /** null clears the folder canvas; a folder and an experiment never share the centre pane. */
  readonly folderSelected = output<string | null>();
  readonly clearCompareSelection = output<void>();
  readonly compareToggled = output<string>();
  readonly compareOpened = output<void>();

  readonly selectedExperimentId = input<string | null>(null);
  readonly selectedFolderId = input<string | null>(null);
  readonly currentUserEmail = input<string | null>(null);
  readonly compareIds = input<string[]>([]);

  constructor() {
    effect(() => {
      this.experimentsService.getUserExperiments(
        this.pageIndex(),
        this.pageSize,
        this.onlyMine(),
        this.filters(),
        this.sort(),
      );
    });

    effect(() => {
      const domains = this.pagedExperiments()
        .map((exp) => exp.domain)
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
      if (this.hasRunningExperiments()) {
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
    this.sort.set(pick(sort, EXPERIMENT_SORT_VALUES, 'created-desc'));
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
    this.unlistenFolderMenuClick?.();
    this.unlistenFolderMenuClick = null;
    if (this.statusPoll) {
      clearInterval(this.statusPoll);
      this.statusPoll = null;
    }
  }

  /** `pending` is the only status the backend can leave a run in, so it is the one worth polling. */
  private hasRunningExperiments(): boolean {
    return this.experimentsService.experiments().some((experiment) => statusChip(experiment.status).tone === 'pending');
  }

  private refreshCurrentPage(): void {
    this.experimentsService.invalidateListCache();
    this.experimentsService.getUserExperiments(
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
  readonly sort = signal<ExperimentSort>('created-desc');
  /** The menu and the trigger's tooltip both read the one list of orders. */
  readonly sortOptions = EXPERIMENT_SORT_VALUES.map((value) => ({ value, label: EXPERIMENT_SORTS[value].label }));
  readonly sortLabel = computed(() => EXPERIMENT_SORTS[this.sort()].label);
  private readonly sortMenu = viewChild<ElementRef<HTMLDetailsElement>>('sortMenu');

  // advanced filters
  readonly filtersOpen = signal(false);

  // filters (single source of truth)
  readonly filters = signal<ExperimentFilters>({
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
    Object.entries(this.expStudio.backendAlgorithms())
      .map(([value, config]) => ({ value, label: config?.label ?? value }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );

  private statusPoll: ReturnType<typeof setInterval> | null = null;

  patchFilters(patch: Partial<ExperimentFilters>) {
    this.filters.update(f => ({ ...f, ...patch }));
    this.pageIndex.set(0);
    this.syncUrlState();
  }

  /** The menu is a choice, not a hold: picking an order folds the <details> back into the icon. */
  setSort(sort: ExperimentSort) {
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

  // ---- folders: the chip strip under the tabs ----
  readonly isCreatingFolder = signal(false);
  readonly newFolderDraft = signal('');
  readonly folderFormError = signal<string | null>(null);
  /**
   * A folder write the server refused for a reason a name cannot explain. Nothing was cached
   * locally, so the strip is the only place this could surface — and it has to surface, or a dead
   * backend looks exactly like a folder that simply did not take the run.
   */
  readonly folderWriteError = signal<string | null>(null);
  /**
   * Every folder mutation goes through the tracker: one request per gesture on the wire (a doubled
   * click is one write, an add to folder A and an add to folder B may overlap), the server's copy
   * written back by the service, and any failure the service could not name landing on the strip
   * instead of disappearing into an unhandled subscription.
   */
  private readonly writes = new InflightWrites((message) => this.folderWriteError.set(message));
  readonly folderBusy = this.writes.busy;

  onFolderPick(value: string): void {
    this.closeFolderMenu();
    this.isCreatingFolder.set(false);
    this.folderFormError.set(null);
    this.folderSelected.emit(value === 'all' ? null : value);
  }

  startNewFolder() {
    this.newFolderDraft.set('');
    this.folderFormError.set(null);
    this.folderWriteError.set(null);
    this.isCreatingFolder.set(true);
  }

  cancelNewFolder() {
    this.isCreatingFolder.set(false);
    this.folderFormError.set(null);
  }

  commitNewFolder() {
    const name = this.newFolderDraft();
    this.writes.run(
      `create-folder:${name.trim().toLowerCase()}`,
      this.foldersService.createFolder(name),
      (created) => {
        if (!created) {
          this.folderFormError.set(name.trim() ? 'That name is taken.' : 'Give the folder a name.');
          return;
        }

        // Open the new folder: its empty canvas is where adding runs gets explained.
        this.isCreatingFolder.set(false);
        this.folderFormError.set(null);
        this.folderWriteError.set(null);
        this.folderSelected.emit(created.id);
      },
      'Could not create the folder — nothing was saved.',
    );
  }

  // ---- folders: per-row add-to-folder menu ----
  readonly folderMenuExpId = signal<string | null>(null);
  readonly folderMenuNewOpen = signal(false);
  readonly folderMenuDraft = signal('');
  readonly folderMenuError = signal<string | null>(null);

  private readonly folderMenu = viewChild(CdkMenu);
  private unlistenFolderMenuClick: (() => void) | null = null;

  isFolderMember(folderId: string, experimentId: string): boolean {
    return this.foldersService.isMember(folderId, experimentId);
  }

  toggleFolderMenu(expId: string): void {
    if (this.folderMenuExpId() === expId) {
      this.closeFolderMenu();
      return;
    }
    this.openFolderMenu(expId);
  }

  private openFolderMenu(expId: string): void {
    this.folderMenuExpId.set(expId);
    this.folderMenuNewOpen.set(false);
    this.folderMenuDraft.set('');
    this.folderMenuError.set(null);
    // The menu is an @if, so CdkMenu's roving tabindex only exists after this render.
    this.cdr.detectChanges();
    this.folderMenu()?.focusFirstItem();

    this.unlistenFolderMenuClick?.();
    this.unlistenFolderMenuClick = this.renderer.listen(document, 'pointerdown', (event: PointerEvent) => {
      // Every row carries a trigger and only one row carries a panel, so the click is judged by
      // what was hit rather than by a per-row template ref. The trigger decides its own fate in
      // its click handler; anything else outside the open menu is a click away.
      const target = event.target as HTMLElement | null;
      if (target?.closest('.folder-menu-anchor, .folder-menu')) return;
      this.closeFolderMenu();
    });
  }

  closeFolderMenu(): void {
    if (!this.folderMenuExpId()) return;
    this.folderMenuExpId.set(null);
    this.folderMenuNewOpen.set(false);
    this.folderMenuError.set(null);
    this.unlistenFolderMenuClick?.();
    this.unlistenFolderMenuClick = null;
  }

  /** One pick adds or drops the run, and the menu stays open for a second one. */
  onFolderMenuPick(folder: ExperimentFolder, expId: string): void {
    this.writes.run(
      `toggle-member:${folder.id}:${expId}`,
      this.foldersService.toggleExperiment(folder.id, expId),
      () => this.folderMenuError.set(null),
      'Could not change this folder — nothing was saved.',
    );
  }

  openFolderMenuNew(): void {
    this.folderMenuNewOpen.set(true);
    this.folderMenuDraft.set('');
    this.folderMenuError.set(null);
  }

  commitFolderMenuNew(expId: string): void {
    const name = this.folderMenuDraft();
    this.writes.run(
      `create-folder-member:${expId}:${name.trim().toLowerCase()}`,
      this.foldersService.createFolder(name, expId),
      (created) => {
        if (!created) {
          this.folderMenuError.set(name.trim() ? 'That name is taken.' : 'Give the folder a name.');
          return;
        }
        this.folderMenuNewOpen.set(false);
        this.folderMenuError.set(null);
        this.folderWriteError.set(null);
      },
      'Could not create the folder — nothing was saved.',
    );
  }

  readonly draggingExperimentId = signal<string | null>(null);

  onExperimentDragStart(exp: Experiment, event: DragEvent): void {
    beginExperimentDrag(event.dataTransfer, exp.id);
    this.draggingExperimentId.set(exp.id);
    this.closeFolderMenu();
  }

  onExperimentDragEnd(): void {
    this.draggingExperimentId.set(null);
  }

  isOwner(exp: Experiment): boolean {
    return isExperimentOwner(this.currentUserEmail(), exp.authorEmail);
  }

  /** Outcome and predictors on one line, using catalog labels. A bare variable code is never shown. */
  modelLine(exp: Experiment): string {
    const domain = exp.domain;
    const map = domain ? this.labelsByDomain()[domain] : undefined;
    if (domain && !map) return '';
    const names = (codes: string[] | undefined) =>
      (codes ?? []).map((code) => this.displayName(code, map)).filter((name) => name.length > 0);
    return formulaLine(names(exp.variables), names(exp.covariates));
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

  metaLine(exp: Experiment): string {
    const parts = [this.getAlgorithmLabel(exp.algorithmName), this.relativeWhen(exp.dateCreated)];
    if (!this.isOwner(exp)) {
      const who = exp.authorEmail?.split('@')[0] || exp.author;
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
  readonly totalPages = computed(() => this.experimentsService.totalPages());
  readonly isLoading = computed(() => this.experimentsService.isLoading());
  readonly currentPage = computed(() => this.pageIndex() + 1);
  readonly totalExperiments = computed(() => this.experimentsService.totalExperiments());
  readonly historyTruncated = computed(() => this.experimentsService.historyTruncated());
  readonly historyCap = computed(() => this.experimentsService.fullHistoryCap);

  readonly pagedExperiments = computed<Experiment[]>(() => {
    return this.experimentsService.experiments();
  });

  readonly rangeStart = computed(() =>
    this.totalExperiments() === 0 ? 0 : this.pageIndex() * this.pageSize + 1,
  );

  readonly rangeEnd = computed(() =>
    Math.min(this.pageIndex() * this.pageSize + this.pagedExperiments().length, this.totalExperiments()),
  );
  readonly guideExperimentId = computed(() => this.selectGuideExperiment(this.pagedExperiments())?.id ?? null);

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
  selectExperiment(exp: Experiment) {
    this.experimentSelected.emit(exp);
  }

  onRowKeydown(event: KeyboardEvent, exp: Experiment) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.selectExperiment(exp);
  }

  isGuideExperiment(exp: Experiment): boolean {
    return exp.id === this.guideExperimentId();
  }

  getAlgorithmLabel(code: string | null | undefined): string {
    if (!code) return 'Unknown algorithm';
    const algoConfig = this.expStudio.backendAlgorithms()[code];
    return algoConfig?.label || code;
  }

  private selectGuideExperiment(experiments: Experiment[]): Experiment | null {
    if (!experiments.length) {
      return null;
    }

    let bestMatch = experiments[0];
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const experiment of experiments) {
      const name = experiment.name.toLowerCase();
      const algorithmName = experiment.algorithmName.toLowerCase();
      const variables = (experiment.variables ?? []).map((value) => value.toLowerCase());
      let score = 0;

      if (experiment.isShared) {
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
        bestMatch = experiment;
        bestScore = score;
      }
    }

    return bestMatch;
  }
}
