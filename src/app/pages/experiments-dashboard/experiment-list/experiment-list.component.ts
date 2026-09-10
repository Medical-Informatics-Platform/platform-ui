import { ChangeDetectionStrategy, Component, computed, signal, effect, OnInit, OnDestroy, output, inject, input, viewChild, Renderer2, ChangeDetectorRef } from '@angular/core';
import { CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import { ExperimentsDashboardService } from '../../../services/experiments-dashboard.service';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentFoldersService } from '../../../services/experiment-folders.service';
import { Experiment } from '../../../models/experiments-dashboard.model';
import { ExperimentFolder } from '../../../models/experiment-folder.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExperimentSearchComponent } from '../experiment-search/experiment-search.component';
import { Router, RouterModule } from '@angular/router';
import { buildExperimentShareUrl, copyShareUrl, isExperimentOwner, SHARE_TOAST, shareToggleToast } from '../../../core/share.utils';
import { beginExperimentDrag, droppedExperimentId, isExperimentDrag, leavesDragZone } from '../../../core/experiment-drag.utils';
import { ExperimentFilters } from '../experiment-search/experiment-filter.model';

@Component({
  selector: 'app-experiments-list',
  imports: [CommonModule, FormsModule, RouterModule, ExperimentSearchComponent, CdkMenu, CdkMenuItem],
  templateUrl: './experiment-list.component.html',
  styleUrl: './experiment-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExperimentsListComponent implements OnInit, OnDestroy {
  experimentsService = inject(ExperimentsDashboardService);
  readonly foldersService = inject(ExperimentFoldersService);
  private expStudio = inject(ExperimentStudioService);
  private router = inject(Router);
  private renderer = inject(Renderer2);
  private cdr = inject(ChangeDetectorRef);

  readonly experimentSelected = output<Experiment>();
  readonly deleteRequested = output<string>();
  readonly editRequested = output<string>();
  /** null clears the folder canvas; a folder and an experiment never share the centre pane. */
  readonly folderSelected = output<string | null>();

  readonly selectedExperimentId = input<string | null>(null);
  readonly selectedFolderId = input<string | null>(null);
  readonly currentUserEmail = input<string | null>(null);
  readonly compareIds = input<string[]>([]);
  readonly compareMode = input<boolean>(false);

  constructor() {
    this.expStudio.loadAllDataModels().subscribe(models => {
      const map: Record<string, string> = {};
      models.forEach(m => {
        if (m.code) {
          const key = m.version ? `${m.code}:${m.version}` : m.code;
          map[key] = m.label || m.code;
        }
      });
      this.modelLabels.set(map);
    });

    effect(() => {
      this.experimentsService.getUserExperiments(
        this.pageIndex(),
        this.pageSize,
        this.onlyMine(),
        this.filters()
      );
    });
  }

  ngOnInit(): void {
    this.onlyMine.set(this.initialOnlyMine());
  }

  ngOnDestroy(): void {
    this.unlistenFolderMenuClick?.();
    this.unlistenFolderMenuClick = null;
  }

  // toggle
  readonly initialOnlyMine = input(true);
  readonly onlyMine = signal(true);

  // pagination
  readonly pageSize = 10;
  readonly pageIndex = signal(0);

  // share toast
  readonly copyToastVisible = signal<boolean>(false);
  readonly copyToastMessage = signal<string>('Link copied to clipboard');
  readonly lastSharedExperimentId = signal<string | null>(null);

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

  private modelLabels = signal<Record<string, string>>({});

  patchFilters(patch: Partial<ExperimentFilters>) {
    this.filters.update(f => ({ ...f, ...patch }));
    this.pageIndex.set(0);
  }

  // compare helper
  isInCompare(id: string): boolean {
    return this.compareIds().includes(id);
  }

  setTab(isMine: boolean) {
    if (this.onlyMine() === isMine) return;
    this.onlyMine.set(isMine);
    this.pageIndex.set(0);
  }

  // ---- folders: the chip strip under the tabs ----
  readonly isCreatingFolder = signal(false);
  readonly newFolderDraft = signal('');
  readonly folderFormError = signal<string | null>(null);

  selectFolder(folderId: string) {
    this.closeFolderMenu();
    this.isCreatingFolder.set(false);
    this.folderFormError.set(null);
    this.folderSelected.emit(this.selectedFolderId() === folderId ? null : folderId);
  }

  startNewFolder() {
    this.newFolderDraft.set('');
    this.folderFormError.set(null);
    this.isCreatingFolder.set(true);
  }

  cancelNewFolder() {
    this.isCreatingFolder.set(false);
    this.folderFormError.set(null);
  }

  commitNewFolder() {
    const created = this.foldersService.createFolder(this.newFolderDraft());
    if (!created) {
      this.folderFormError.set(this.newFolderDraft().trim() ? 'That name is taken.' : 'Give the folder a name.');
      return;
    }

    // Open the new folder: its empty canvas is where adding runs gets explained.
    this.isCreatingFolder.set(false);
    this.folderFormError.set(null);
    this.folderSelected.emit(created.id);
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
    this.foldersService.toggleExperiment(folder.id, expId);
  }

  openFolderMenuNew(): void {
    this.folderMenuNewOpen.set(true);
    this.folderMenuDraft.set('');
    this.folderMenuError.set(null);
  }

  commitFolderMenuNew(expId: string): void {
    const created = this.foldersService.createFolder(this.folderMenuDraft(), expId);
    if (!created) {
      this.folderMenuError.set(this.folderMenuDraft().trim() ? 'That name is taken.' : 'Give the folder a name.');
      return;
    }
    this.folderMenuNewOpen.set(false);
    this.folderMenuError.set(null);
  }

  // ---- drag a run onto a folder: the canvas and the chips both receive it ----
  /** The row in flight, so it can sit back visually while its ghost travels. */
  readonly draggingExperimentId = signal<string | null>(null);
  /** The chip currently under the pointer, or null while nothing local accepts the drag. */
  readonly receivingFolderId = signal<string | null>(null);

  onExperimentDragStart(exp: Experiment, event: DragEvent): void {
    beginExperimentDrag(event.dataTransfer, exp.id);
    this.draggingExperimentId.set(exp.id);
    // A menu left open under the drag would swallow the drop and look like a dead row.
    this.closeFolderMenu();
  }

  onExperimentDragEnd(): void {
    this.draggingExperimentId.set(null);
    this.receivingFolderId.set(null);
  }

  onFolderChipDragOver(folderId: string, event: DragEvent): void {
    if (!isExperimentDrag(event.dataTransfer)) return;
    // Without this the browser refuses the drop and the chip never gets to say yes.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.receivingFolderId.set(folderId);
  }

  onFolderChipDragLeave(folderId: string, event: DragEvent): void {
    if (!leavesDragZone(event, event.currentTarget)) return;
    if (this.receivingFolderId() === folderId) this.receivingFolderId.set(null);
  }

  /**
   * A drop always adds — unlike the row menu there is no second gesture to undo a mistake, and
   * toggling would silently remove a member the user meant to drop a second run next to.
   */
  onFolderChipDrop(folder: ExperimentFolder, event: DragEvent): void {
    this.receivingFolderId.set(null);
    this.draggingExperimentId.set(null);

    const experimentId = droppedExperimentId(event.dataTransfer);
    if (!experimentId) return;
    event.preventDefault();
    this.foldersService.addExperiment(folder.id, experimentId);
  }

  // ---- share logic (unchanged) ----
  private showCopyToast(message: string, expId: string) {
    this.copyToastMessage.set(message);
    this.copyToastVisible.set(true);
    this.lastSharedExperimentId.set(expId);

    setTimeout(() => {
      this.copyToastVisible.set(false);
      this.lastSharedExperimentId.set(null);
    }, 2400);
  }


  isOwner(exp: Experiment): boolean {
    return isExperimentOwner(this.currentUserEmail(), exp.authorEmail);
  }

  onCopyLinkClicked(exp: Experiment, event: MouseEvent) {
    event.stopPropagation();
    copyShareUrl(buildExperimentShareUrl(this.router, exp.id)).then((message) => this.showCopyToast(message, exp.id));
  }

  onToggleShare(exp: Experiment, event: MouseEvent) {
    event.stopPropagation();

    // Extra safety update check
    if (!this.isOwner(exp)) {
      console.warn('Cannot share/unshare experiment owned by someone else.');
      return;
    }

    const newShared = !exp.isShared;

    this.experimentsService
      .toggleExperimentShare(exp.id, newShared)
      .subscribe({
        next: () => this.showCopyToast(shareToggleToast(newShared), exp.id),
        error: (err) => {
          console.error('Failed to toggle share:', err);
          this.showCopyToast(SHARE_TOAST.toggleFailed, exp.id);
        },
      });
  }


  // pages
  readonly totalPages = computed(() => this.experimentsService.totalPages());
  readonly currentPage = computed(() => this.pageIndex() + 1);

  readonly pagedExperiments = computed<Experiment[]>(() => {
    return this.experimentsService.experiments();
  });
  readonly guideExperimentId = computed(() => this.selectGuideExperiment(this.pagedExperiments())?.id ?? null);

  // pagination helpers
  goToPage(page: number) {
    const max = this.totalPages();
    if (page < 1) page = 1;
    if (page > max) page = max;
    this.pageIndex.set(page - 1);
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

  isGuideExperiment(exp: Experiment): boolean {
    return exp.id === this.guideExperimentId();
  }

  onEditRequested(id: string) {
    this.editRequested.emit(id);
  }

  onDeleteRequested(id: string) {
    this.deleteRequested.emit(id);
  }

  getAlgorithmLabel(code: string | null | undefined): string {
    if (!code) return 'Unknown algorithm';
    const algoConfig = this.expStudio.backendAlgorithms()[code];
    return algoConfig?.label || code;
  }

  getDomainLabel(code: string | null | undefined): string | null {
    if (!code) return null;
    return this.modelLabels()[code] || code;
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
