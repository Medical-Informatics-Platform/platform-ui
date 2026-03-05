import { ChangeDetectionStrategy, Component, Output, EventEmitter, computed, signal, Input, effect, OnInit } from '@angular/core';
import { ExperimentsDashboardService } from '../../../services/experiments-dashboard.service';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { Experiment } from '../../../models/experiments-dashboard.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExperimentSearchComponent } from '../experiment-search/experiment-search.component';
import { Router, RouterModule } from '@angular/router';
import { ExperimentFilters } from '../experiment-search/experiment-filter.model';

@Component({
  selector: 'app-experiments-list',
  imports: [CommonModule, FormsModule, RouterModule, ExperimentSearchComponent],
  templateUrl: './experiment-list.component.html',
  styleUrls: ['./experiment-list.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExperimentsListComponent implements OnInit {
  @Output() experimentSelected = new EventEmitter<Experiment>();
  @Output() deleteRequested = new EventEmitter<string>();
  @Output() editRequested = new EventEmitter<string>();

  @Input() selectedExperimentId: string | null = null;
  @Input() currentUserEmail: string | null = null;
  @Input() compareIds: string[] = [];
  @Input() compareMode: boolean = false;

  constructor(
    public experimentsService: ExperimentsDashboardService,
    private expStudio: ExperimentStudioService,
    private router: Router
  ) {
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
    this.onlyMine.set(this.initialOnlyMine);
    this.experimentsService.fetchGlobalTotal();
  }

  // toggle
  @Input() initialOnlyMine = true;
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
    return this.compareIds.includes(id);
  }

  setTab(isMine: boolean) {
    if (this.onlyMine() === isMine) return;
    this.onlyMine.set(isMine);
    this.pageIndex.set(0);
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

  private buildShareUrl(expId: string): string {
    const tree = this.router.createUrlTree(
      ['/experiments-dashboard'],
      { queryParams: { experiment: expId } }
    );

    const relative = this.router.serializeUrl(tree);
    const origin = window.location.origin;

    return origin + relative;
  }

  isOwner(exp: Experiment): boolean {
    const currentEmail = this.currentUserEmail;
    if (!currentEmail || !exp.authorEmail) return false;
    return currentEmail === exp.authorEmail;
  }

  onCopyLinkClicked(exp: Experiment, event: MouseEvent) {
    event.stopPropagation();
    const url = this.buildShareUrl(exp.id);

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => this.showCopyToast('Link copied to clipboard', exp.id),
        (err) => {
          console.warn('Failed to copy share URL:', err);
          this.showCopyToast('Could not copy link — check console.', exp.id);
        }
      );
    } else {
      console.warn('Clipboard API not available, share URL:', url);
      this.showCopyToast('Clipboard not available — check console log.', exp.id);
    }
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
        next: () => {
          if (newShared) {
            this.showCopyToast('Experiment is now shared', exp.id);
            // Auto-copy link when enabling share? User request implies separation, but usually convenient.
            // Requirement says "split the button". I will keep them separate as requested.
          } else {
            this.showCopyToast('Experiment is no longer shared', exp.id);
          }
        },
        error: (err) => {
          console.error('Failed to toggle share:', err);
          this.showCopyToast('Failed to update share state', exp.id);
        },
      });
  }

  // counts
  readonly totalExperiments = computed(() => this.experimentsService.totalExperiments());
  readonly visibleExperiments = computed(() => this.experimentsService.experiments().length);

  // pages
  readonly totalPages = computed(() => this.experimentsService.totalPages());
  readonly currentPage = computed(() => this.pageIndex() + 1);

  readonly pagedExperiments = computed<Experiment[]>(() => {
    return this.experimentsService.experiments();
  });

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
}
