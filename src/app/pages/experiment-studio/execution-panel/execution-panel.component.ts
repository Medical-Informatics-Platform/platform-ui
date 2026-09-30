import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentStudioNavigationService } from '../../../services/experiment-studio-navigation.service';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import { CsvExportService } from '../../../services/csv-export.service';
import { prettifyLabel } from '../../../core/algorithm-mappers';
import { formulaLine } from '../../../core/result-label.utils';
import { AlgorithmResultComponent } from '../algorithm-panel/algorithm-result/algorithm-result.component';
import { ExperimentSetupSummaryComponent } from './experiment-setup-summary/experiment-setup-summary.component';

/**
 * Experiment Execution step: the run skeleton, its error state, and the result view with
 * its docked setup summary.
 * It owns no run configuration — Save As / Export stay on the algorithm panel, which owns
 * the parameter form, and are emitted back to it by the studio shell.
 */
@Component({
  selector: 'app-execution-panel',
  imports: [FormsModule, RouterLink, AlgorithmResultComponent, ExperimentSetupSummaryComponent],
  templateUrl: './execution-panel.component.html',
  styleUrl: './execution-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExecutionPanelComponent {
  private expStudioService = inject(ExperimentStudioService);
  private studioNavigation = inject(ExperimentStudioNavigationService);
  private csvExport = inject(CsvExportService);

  readonly isRunning = this.expStudioService.isRunning;
  readonly result = this.expStudioService.runResult;
  /** Setup behind the result; the summary aside is only rendered when a run captured one. */
  readonly setupSnapshot = this.expStudioService.runSetup;
  readonly runError = this.expStudioService.runError;
  readonly schema = this.expStudioService.lastRunSchema;
  readonly loadingText = this.expStudioService.runStatusText;
  readonly mipVersion = inject(RuntimeEnvService).mipVersion;

  readonly saveAsMode = signal(false);
  readonly saveAsName = signal('');
  readonly showSuccessNotification = this.expStudioService.saveSucceeded;

  readonly resultAlgorithmLabel = computed(() => {
    const algoKey = this.expStudioService.lastUsedAlgorithm() ?? '';
    if (!algoKey) return 'Algorithm';
    return this.expStudioService.backendAlgorithms()[algoKey]?.label ?? prettifyLabel(algoKey);
  });

  readonly resultDisplayTitle = computed(() => {
    const explicitTitle = this.result()?.title;
    if (typeof explicitTitle === 'string' && explicitTitle.trim()) return explicitTitle.trim();
    return `Result ${this.resultAlgorithmLabel()}`;
  });

  readonly resultAlgorithmKey = computed(() => this.expStudioService.lastUsedAlgorithm() ?? '');
  readonly enumMaps = computed(() => this.expStudioService.getCategoricalEnumMaps());
  readonly yVar = computed(() => this.expStudioService.algorithmY()[0]?.code ?? null);
  readonly xVar = computed(() => this.expStudioService.algorithmX()[0]?.code ?? null);
  readonly labelMap = this.expStudioService.variableLabelMap;

  /** Save As and PDF export need the parameter form, so the algorithm panel keeps them. */
  readonly saveAs = output<string>();
  readonly exportPdf = output<HTMLElement>();

  readonly exportOpen = signal(false);
  /** Set once a save round-trips, so the header can switch Unsaved -> Saved. */
  readonly savedName = signal<string | null>(null);
  readonly runAt = signal<Date | null>(null);
  readonly runDurationMs = signal<number | null>(null);
  private runningSince: number | null = null;

  constructor() {
    // The save itself runs on the algorithm panel (it owns the parameter form); its success
    // flag is the shared signal that closes this panel's inline Save As form.
    // Only the success flag is tracked: the flag stays up for 8s, and re-running on a name edit
    // in that window would close a fresh "Save a copy" form and mark it saved.
    effect(() => {
      if (!this.expStudioService.saveSucceeded()) return;
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
        // A new run produces a new, unsaved result.
        untracked(() => this.savedName.set(null));
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
      this.saveAsName.set(`Experiment for ${this.resultAlgorithmLabel()}`);
    }
  }

  cancelSaveAs(): void {
    this.saveAsMode.set(false);
    this.saveAsName.set('');
  }

  onSaveAs(): void {
    const name = this.saveAsName().trim();
    if (!name) return;
    this.saveAs.emit(name);
  }

  readonly savedText = computed(() => {
    const name = this.savedName();
    return name ? `Saved as “${name}”` : 'Unsaved';
  });

  readonly savedTone = computed(() => (this.savedName() ? 'is-saved' : 'is-unsaved'));

  readonly saveLabel = computed(() => (this.savedName() ? 'Save a copy' : 'Save experiment'));

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

  /** Quiet fallback export: one CSV, each result table as a titled block, then the chart readings. */
  onExportAllCsv(section: HTMLElement): void {
    this.exportOpen.set(false);
    const tables = Array.from(section.querySelectorAll<HTMLTableElement>('table'));
    const cell = (text: string | null | undefined) => `"${(text ?? '').replace(/\s+/g, ' ').trim().replace(/"/g, '""')}"`;
    const readings = Array.from(section.querySelectorAll('.chart-caption')).map((caption) => {
      const title = caption.closest('.chart-container')?.querySelector('.chart-title')?.textContent;
      return [cell(title || 'Chart'), cell(caption.textContent)].join(',');
    });
    if (!tables.length && !readings.length) return;

    const blocks = tables.map((table, index) => {
      const title =
        table.closest('.ar-card')?.querySelector('.ar-title')?.textContent ||
        table.closest('.coefficients-card')?.querySelector('.coefficients-title')?.textContent ||
        `Table ${index + 1}`;
      const rows = Array.from(table.querySelectorAll('tr')).map((row) =>
        Array.from(row.querySelectorAll('th,td')).map((c) => cell(c.textContent)).join(',')
      );
      return [cell(title), ...rows].join('\n');
    });
    if (readings.length) blocks.push([cell('Chart readings'), ...readings].join('\n'));
    this.csvExport.downloadCsv(blocks.join('\n\n'), 'experiment_tables.csv');
  }

  backToAlgorithm(): void {
    this.cancelSaveAs();
    this.studioNavigation.navigateToSection('algorithm-section');
  }
}
