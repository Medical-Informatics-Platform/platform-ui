import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { PdfExportService } from '../../../../services/pdf-export.service';
import { CsvExportService } from '../../../../services/csv-export.service';
import { RuntimeEnvService } from '../../../../services/runtime-env.service';
import { HistogramGraphComponent } from '../histogram-graph/histogram-graph.component';
import { MetadataInfoPanelComponent } from '../metadata-info-panel/metadata-info-panel.component';
import { VariableCatalogService } from '../variable-catalog.service';
import { VariableHistogramService } from '../variable-histogram.service';
import { VariableSelectionService } from '../variable-selection.service';

/**
 * Right-hand details card for the selected variable or group: header with the
 * pool toggle, Chart / Details tabs, histogram split and export.
 * Attached to the shell's `section#histogram-graph` so the DOM is unchanged.
 */
@Component({
  selector: 'section[app-variable-details-panel]',
  templateUrl: './variable-details-panel.component.html',
  styleUrl: './variable-details-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
  imports: [HistogramGraphComponent, MetadataInfoPanelComponent],
})
export class VariableDetailsPanelComponent {
  private readonly catalog = inject(VariableCatalogService);
  protected readonly histogram = inject(VariableHistogramService);
  protected readonly selection = inject(VariableSelectionService);
  private readonly experimentStudioService = inject(ExperimentStudioService);
  private readonly pdfExportService = inject(PdfExportService);
  private readonly csvExportService = inject(CsvExportService);
  private readonly mipVersion = inject(RuntimeEnvService).mipVersion;

  private readonly histogramExport = viewChild<ElementRef<HTMLElement>>('histogramExport');

  readonly isExporting = signal(false);
  readonly exportMenuOpen = signal(false);
  readonly detailsPanelTitle = computed(() => {
    const node = this.selection.selectedNode();
    return node ? String(node.label ?? '').trim() : 'Select a variable';
  });
  readonly detailsPanelSubtitle = computed(() => {
    const node = this.selection.selectedNode();
    if (!node) return '';
    const meta = this.histogram.groupHistogramMeta();
    if (this.selection.isSelectedNodeGroup() && meta) {
      return meta.hasGroups ? `${meta.groupCount} groups in this view` : `${meta.groupCount} variables in this group`;
    }
    return String(node.description ?? '').trim();
  });
  readonly isExportDisabled = computed(() =>
    this.histogram.isLoadingHistogram()
    || !!this.histogram.errorMessage()
    || !this.selection.selectedNode()
    || (!this.histogram.histogramData() && !this.histogram.groupHistogramData())
  );

  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (this.exportMenuOpen() && !target?.closest?.('.histogram-export-group')) {
      this.exportMenuOpen.set(false);
    }
  }

  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.exportMenuOpen.set(false);
    }
  }

  onHistogramSplitChange(event: Event): void {
    this.histogram.selectSplit((event.target as HTMLSelectElement).value);
  }

  toggleExportMenu(): void {
    this.exportMenuOpen.update((open) => !open);
  }

  async exportHistogramPdf(): Promise<void> {
    this.exportMenuOpen.set(false);
    if (this.isExportDisabled()) return;
    this.isExporting.set(true);
    try {
      const exportTarget = this.histogramExport()?.nativeElement;
      if (!exportTarget) {
        console.warn('Histogram export target not found.');
        return;
      }
      const node = this.selection.selectedNode();
      const model = this.catalog.selectedDataModel();
      const groupData = this.histogram.groupHistogramData();
      await this.pdfExportService.exportHistogramPdf(exportTarget, {
        title: groupData ? 'Group Description' : 'Histogram',
        nodeLabel: String(node?.label ?? this.histogram.histogramData()?.variableName ?? ''),
        modelLabel: String(model?.label ?? model?.code ?? ''),
        datasetLabels: this.experimentStudioService.selectedDatasets()
          .map((code) => this.catalog.datasetLabel(code))
          .filter((label) => !!label),
        description: String(node?.description ?? ''),
        meta: this.histogram.groupHistogramMeta() ?? undefined,
        isGroupView: !!groupData,
        mipVersion: this.mipVersion,
      });
    } catch (err) {
      console.error('Histogram PDF export failed:', err);
    } finally {
      this.isExporting.set(false);
    }
  }

  exportHistogramCsv(): void {
    this.exportMenuOpen.set(false);
    if (this.isExportDisabled()) return;
    const data = this.histogram.groupHistogramData() || this.histogram.histogramData();
    if (!data) return;
    try {
      this.csvExportService.exportHistogramCsv(
        { bins: data.bins, counts: data.counts, groups: 'groups' in data ? data.groups : undefined },
        String(this.selection.selectedNode()?.label ?? data.variableName ?? 'histogram')
      );
    } catch (err) {
      console.error('Histogram CSV export failed:', err);
    }
  }
}
