import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AnalysisStudioService } from '../../../services/analysis-studio.service';
import { AnalysisStudioNavigationService } from '../../../services/analysis-studio-navigation.service';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import { prettifyLabel } from '../../../core/algorithm-mappers';
import { formulaLine } from '../../../core/result-label.utils';
import { AlgorithmResultComponent } from '../algorithm-panel/algorithm-result/algorithm-result.component';
import { AnalysisSetupSummaryComponent } from './analysis-setup-summary/analysis-setup-summary.component';

/**
 * Execution Results step: the run skeleton, its error state, and the result view with
 * its docked setup summary.
 * It owns no run configuration — Export stays on the algorithm panel, which owns the parameter
 * form, and is emitted back to it by the studio shell. Saving needs no configuration: it
 * persists the kept run behind the result through the studio service.
 */
@Component({
  selector: 'app-execution-panel',
  imports: [FormsModule, RouterLink, AlgorithmResultComponent, AnalysisSetupSummaryComponent],
  templateUrl: './execution-panel.component.html',
  styleUrl: './execution-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExecutionPanelComponent {
  private analysisStudioService = inject(AnalysisStudioService);
  private studioNavigation = inject(AnalysisStudioNavigationService);

  readonly isRunning = this.analysisStudioService.isRunning;
  readonly isSaving = this.analysisStudioService.isSaving;
  readonly result = this.analysisStudioService.runResult;
  /** Setup behind the result; the summary aside is only rendered when a run captured one. */
  readonly setupSnapshot = this.analysisStudioService.runSetup;
  readonly runError = this.analysisStudioService.runError;
  readonly schema = this.analysisStudioService.lastRunSchema;
  readonly loadingText = this.analysisStudioService.runStatusText;
  readonly mipVersion = inject(RuntimeEnvService).mipVersion;

  readonly saveAsMode = signal(false);
  readonly saveAsName = signal('');
  readonly showSuccessNotification = this.analysisStudioService.saveSucceeded;
  readonly saveError = this.analysisStudioService.saveError;

  readonly resultAlgorithmLabel = computed(() => {
    const algoKey = this.analysisStudioService.lastUsedAlgorithm() ?? '';
    if (!algoKey) return 'Algorithm';
    return this.analysisStudioService.backendAlgorithms()[algoKey]?.label ?? prettifyLabel(algoKey);
  });

  readonly resultDisplayTitle = computed(() => {
    const explicitTitle = this.result()?.title;
    if (typeof explicitTitle === 'string' && explicitTitle.trim()) return explicitTitle.trim();
    return `Result ${this.resultAlgorithmLabel()}`;
  });

  readonly resultAlgorithmKey = computed(() => this.analysisStudioService.lastUsedAlgorithm() ?? '');
  readonly enumMaps = computed(() => this.analysisStudioService.getCategoricalEnumMaps());
  readonly yVar = computed(() => this.analysisStudioService.algorithmY()[0]?.code ?? null);
  readonly xVar = computed(() => this.analysisStudioService.algorithmX()[0]?.code ?? null);
  readonly labelMap = this.analysisStudioService.variableLabelMap;

  /** PDF and ZIP export need the parameter form, so the algorithm panel keeps them. */
  readonly exportPdf = output<HTMLElement>();
  readonly exportZip = output<void>();

  readonly exportOpen = signal(false);
  /** Set once a save round-trips, so the header can switch Unsaved -> Saved. */
  readonly savedName = signal<string | null>(null);
  readonly runAt = signal<Date | null>(null);
  readonly runDurationMs = signal<number | null>(null);
  private runningSince: number | null = null;

  constructor() {
    // The save completes in the studio service; its success flag is the shared signal that
    // closes this panel's inline Save As form.
    // Only the success flag is tracked: the flag stays up for 8s, and re-running on a name edit
    // in that window would close a fresh "Save a copy" form and mark it saved.
    effect(() => {
      if (!this.analysisStudioService.saveSucceeded()) return;
      untracked(() => {
        const name = this.saveAsName().trim();
        this.saveAsMode.set(false);
        if (name) {
          this.savedName.set(name);
        } else if (!this.savedName()) {
          this.savedName.set(this.resultHeadline());
        }
      });
    });

    // Run provenance: captured locally so the header can say when and how long the run took
    // without adding state to the shared service (and without breaking its test doubles).
    effect(() => {
      const running = this.isRunning();
      if (running) {
        this.runningSince = Date.now();
        // A new run produces a new, unsaved result, with no earlier save failure.
        untracked(() => {
          this.savedName.set(null);
          this.saveError.set(null);
        });
        return;
      }
      if (this.runningSince === null) return;
      this.runDurationMs.set(Date.now() - this.runningSince);
      this.runningSince = null;
      this.runAt.set(new Date());
    });

    effect(() => {
      if (this.result() && !this.runAt()) {
        this.runAt.set(new Date());
      }
    });
  }

  toggleSaveAsMode(): void {
    this.saveAsMode.update((v) => !v);
    if (this.saveAsMode()) {
      this.saveAsName.set(`Analysis for ${this.resultAlgorithmLabel()}`);
    }
  }

  cancelSaveAs(): void {
    this.saveAsMode.set(false);
    this.saveAsName.set('');
  }

  onSaveAs(): void {
    const name = this.saveAsName().trim();
    if (!name || this.isSaving()) return;
    // Saves the run already on screen; the analysis is not executed again.
    this.analysisStudioService.saveRun(name);
  }

  readonly savedText = computed(() => {
    const name = this.savedName();
    return name ? `Saved as “${name}”` : 'Unsaved';
  });

  readonly savedTone = computed(() => (this.savedName() ? 'is-saved' : 'is-unsaved'));

  readonly saveLabel = computed(() => (this.savedName() ? 'Save a copy' : 'Save analysis'));

  readonly resultEyebrow = computed(() => this.resultAlgorithmLabel() || 'Algorithm');

  readonly resultHeadline = computed(() => {
    const result = this.result();
    const algorithm = this.resultAlgorithmKey();
    if (
      result &&
      (algorithm === 'linear_regression' || algorithm.startsWith('linear_regression_')) &&
      typeof result['dependent_var'] === 'string'
    ) {
      const predictors = Array.isArray(result['indep_vars'])
        ? result['indep_vars']
            .map((value: unknown) => String(value ?? ''))
            .filter((value: string) => !/^intercept$/i.test(value))
        : [];
      if (predictors.length) return formulaLine([result['dependent_var']], predictors, ' + ');
    }
    return this.resultDisplayTitle();
  });

  readonly runTimeText = computed(() => {
    const date = this.runAt();
    if (!date) return 'Ran just now';
    const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(date);
    return date.toDateString() === new Date().toDateString() ? `Ran today, ${time}` : `Ran ${date.toLocaleDateString()}, ${time}`;
  });

  readonly runDurationText = computed(() => {
    const duration = this.runDurationMs();
    if (duration === null || duration <= 0) return '';
    return duration < 1000 ? `${duration} ms` : `${(duration / 1000).toFixed(1)} s`;
  });

  toggleExport(): void {
    this.exportOpen.update((open) => !open);
  }

  onExportPdf(section: HTMLElement): void {
    this.exportOpen.set(false);
    this.exportPdf.emit(section);
  }

  onExportZip(): void {
    this.exportOpen.set(false);
    this.exportZip.emit();
  }

  backToAlgorithm(): void {
    this.cancelSaveAs();
    this.studioNavigation.navigateToSection('algorithm-section');
  }
}
