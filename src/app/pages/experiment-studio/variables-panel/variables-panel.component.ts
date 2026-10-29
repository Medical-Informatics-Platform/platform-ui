import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, OnInit, signal, untracked, viewChild } from '@angular/core';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { PdfExportService } from '../../../services/pdf-export.service';
import { CsvExportService } from '../../../services/csv-export.service';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import { D3HierarchyNode, DataModel } from '../../../models/data-model.interface';
import { BubbleChartComponent } from '../visualisations/bubble-chart/bubble-chart.component';
import { OntologyTreeBrowserComponent } from '../visualisations/metadata-browser/ontology-tree-browser/ontology-tree-browser.component';
import { CollapsibleTreeBrowserComponent } from '../visualisations/metadata-browser/collapsible-tree-browser/collapsible-tree-browser.component';
import { MetadataBrowserMode, MetadataSearchResult } from '../visualisations/metadata-browser/metadata-browser.model';
import { DataModelSelectorComponent } from './data-model-selector/data-model-selector.component';
import { DatasetSelectorComponent } from './dataset-selector/dataset-selector.component';
import { SearchBarComponent } from './search-bar/search-bar.component';
import { SelectedVariablesComponent } from './selected-variables/selected-variables.component';
import { HistogramGraphComponent } from './histogram-graph/histogram-graph.component';
import { MetadataInfoPanelComponent } from './metadata-info-panel/metadata-info-panel.component';
import { VariableCatalogService } from './variable-catalog.service';
import { VariableHistogramService } from './variable-histogram.service';
import { VariableSelectionService } from './variable-selection.service';
import { MetadataBrowserModeOption } from './variables-panel.models';
import { studyContextTitle } from './variables-panel.utils';

/** localStorage key of the last Map / List / Graph choice. */
const METADATA_BROWSER_MODE_STORAGE_KEY = 'metadata_browser_mode';

@Component({
  selector: 'app-variables-panel',
  templateUrl: './variables-panel.component.html',
  styleUrl: './variables-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [VariableCatalogService, VariableHistogramService, VariableSelectionService],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
  imports: [
    BubbleChartComponent,
    OntologyTreeBrowserComponent,
    CollapsibleTreeBrowserComponent,
    HistogramGraphComponent,
    MetadataInfoPanelComponent,
    DataModelSelectorComponent,
    DatasetSelectorComponent,
    SearchBarComponent,
    SelectedVariablesComponent,
  ]
})
export class VariablesPanelComponent implements OnInit {
  readonly metadataBrowserModes: MetadataBrowserModeOption[] = [
    { value: 'bubble', label: 'Map', icon: 'fas fa-circle-nodes', title: 'Bubble overview of the metadata structure' },
    { value: 'ontology', label: 'List', icon: 'fas fa-sitemap', title: 'Expandable hierarchy list of groups and variables' },
    { value: 'collapsible', label: 'Graph', icon: 'fas fa-project-diagram', title: 'Interactive collapsible hierarchy diagram' },
  ];

  protected readonly catalog = inject(VariableCatalogService);
  protected readonly histogram = inject(VariableHistogramService);
  protected readonly selection = inject(VariableSelectionService);
  private readonly experimentStudioService = inject(ExperimentStudioService);
  private readonly pdfExportService = inject(PdfExportService);
  private readonly csvExportService = inject(CsvExportService);
  private readonly mipVersion = inject(RuntimeEnvService).mipVersion;

  private readonly histogramExport = viewChild<ElementRef<HTMLElement>>('histogramExport');
  private readonly searchSection = viewChild<ElementRef<HTMLElement>>('searchSection');
  private readonly contextSection = viewChild<ElementRef<HTMLElement>>('contextSection');

  readonly isExporting = signal(false);
  readonly exportMenuOpen = signal(false);
  readonly contextOpen = signal(false);
  readonly searchExpanded = signal(false);
  readonly metadataBrowserMode = signal<MetadataBrowserMode>(loadMetadataBrowserMode());
  readonly metadataBrowserModeIndex = computed(() => {
    const index = this.metadataBrowserModes.findIndex((mode) => mode.value === this.metadataBrowserMode());
    return index >= 0 ? index : 0;
  });
  readonly studyContextTitle = computed(() =>
    studyContextTitle(this.catalog.selectedDataModel()?.label, this.catalog.selectedDatasetCount())
  );
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

  constructor() {
    effect(() => {
      const model = this.catalog.selectedDataModel();
      untracked(() => this.selection.showDataModel(model));
    });
  }

  ngOnInit(): void {
    this.selection.loadDataModels();
  }

  onDataModelChange(model: DataModel | null): void {
    if (this.selection.changeDataModel(model)) {
      this.searchExpanded.set(false);
    }
  }

  onSearchSelected(result: MetadataSearchResult): void {
    if (this.selection.pickSearchResult(result)) {
      this.searchExpanded.set(false);
    }
  }

  onVariableClicked(variable: D3HierarchyNode): void {
    this.selection.pickPoolVariable(variable);
  }

  setMetadataBrowserMode(mode: MetadataBrowserMode): void {
    this.metadataBrowserMode.set(mode);
    try {
      localStorage.setItem(METADATA_BROWSER_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore private-mode or quota failures; the UI can still use the in-memory signal.
    }
  }

  toggleContext(): void {
    this.contextOpen.update((open) => !open);
  }

  toggleSearch(): void {
    this.searchExpanded.update((expanded) => {
      if (!expanded) {
        setTimeout(() => this.searchSection()?.nativeElement?.querySelector('input')?.focus(), 0);
      }
      return !expanded;
    });
  }

  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node;
    const contextSection = this.contextSection()?.nativeElement;
    if (this.contextOpen() && contextSection && !contextSection.contains(target)) {
      this.contextOpen.set(false);
    }
    const searchSection = this.searchSection()?.nativeElement;
    if (this.searchExpanded() && searchSection && !searchSection.contains(target)) {
      this.searchExpanded.set(false);
    }
    if (this.exportMenuOpen() && !(target as HTMLElement)?.closest?.('.histogram-export-group')) {
      this.exportMenuOpen.set(false);
    }
  }

  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.contextOpen.set(false);
      this.searchExpanded.set(false);
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

function loadMetadataBrowserMode(): MetadataBrowserMode {
  try {
    const saved = localStorage.getItem(METADATA_BROWSER_MODE_STORAGE_KEY);
    if (saved === 'ontology' || saved === 'collapsible' || saved === 'bubble') {
      return saved;
    }
  } catch {
    // Fall through to the Map default.
  }
  return 'bubble';
}
