import { BubbleChartComponent } from './../visualisations/bubble-chart/bubble-chart.component';
import { ErrorService } from '../../../services/error.service';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { Component, HostListener, signal, inject, OnDestroy, ElementRef, ViewChild, effect, computed, ChangeDetectionStrategy, ChangeDetectorRef, untracked } from '@angular/core';
import { D3HierarchyNode, DataModel } from '../../../models/data-model.interface';
import { DataModelSelectorComponent } from './data-model-selector/data-model-selector.component';
import { DatasetSelectorComponent } from './dataset-selector/dataset-selector.component';
import { SearchBarComponent } from './search-bar/search-bar.component';
import { SelectedVariablesComponent } from './selected-variables/selected-variables.component';
import { HistogramGraphComponent } from './histogram-graph/histogram-graph.component';
import { MetadataInfoPanelComponent } from './metadata-info-panel/metadata-info-panel.component';
import { catchError, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { PdfExportService } from '../../../services/pdf-export.service';
import { CsvExportService } from '../../../services/csv-export.service';
import { ExperimentStudioGuideStateService } from '../guide/experiment-studio-guide-state.service';
import { AlgorithmNames } from '../../../core/constants/algorithm.constants';
import { OntologyTreeBrowserComponent } from '../visualisations/metadata-browser/ontology-tree-browser/ontology-tree-browser.component';
import { CollapsibleTreeBrowserComponent } from '../visualisations/metadata-browser/collapsible-tree-browser/collapsible-tree-browser.component';
import { MetadataBrowserMode, MetadataSearchResult } from '../visualisations/metadata-browser/metadata-browser.model';
import {
  normalizeMetadataTree,
  selectionFromSearchResult,
} from '../visualisations/metadata-browser/metadata-browser-normalizer';
import { isSameDataModel } from '../../../core/data-model.utils';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import { isVariableUnavailable } from '../../../core/variable-availability.utils';
import {
  describeClippedNullEdges,
  formatClippedNullEdgesNote,
} from '../visualisations/histogram/histogram-chart';
import {
  DATASET_VARIABLE_CODE,
  HISTOGRAM_SPLIT_NONE,
  HistogramChartData,
  HistogramSplitOption,
  buildHistogramSplitOptions,
  buildStackedHistogramSeries,
  extractHistogramItems,
  isNominalHistogramNode,
} from '../visualisations/histogram/histogram-data';
import {
  buildGroupCensus,
  collectLeafNodes,
  describeGroup,
  enumerationLabel,
  findNodeByCode,
  isInsufficientDataResponse,
  labelHistogramBins,
  pathToNode,
  studyContextTitle,
} from './variables-panel.utils';
import {
  DatasetOption,
  DetailsPanelTab,
  GroupCensusData,
  GroupHistogramMeta,
  HighlightedNode,
  PathNode,
  MetadataBrowserModeOption,
} from './variables-panel.models';

/** Shown when the selected node groups variables only, so there is nothing to census. */
const GROUP_OF_VARIABLES_ONLY_MESSAGE =
  'Please select one of the variables in the representation on the left to see its histogram in the selected centers.';

@Component({
  selector: 'app-variables-panel',
  templateUrl: './variables-panel.component.html',
  styleUrl: './variables-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
export class VariablesPanelComponent implements OnDestroy {
  private readonly metadataBrowserModeStorageKey = 'metadata_browser_mode';
  readonly metadataBrowserModes: MetadataBrowserModeOption[] = [
      {
        value: 'bubble',
        label: 'Map',
        icon: 'fas fa-circle-nodes',
        title: 'Bubble overview of the metadata structure',
      },
      {
        value: 'ontology',
        label: 'List',
        icon: 'fas fa-sitemap',
        title: 'Expandable hierarchy list of groups and variables',
      },
      {
        value: 'collapsible',
        label: 'Graph',
        icon: 'fas fa-project-diagram',
        title: 'Interactive collapsible hierarchy diagram',
      },
    ];

  @ViewChild('histogramExport') histogramExport?: ElementRef<HTMLElement>;
  @ViewChild('searchSection') searchSection?: ElementRef<HTMLElement>;
  @ViewChild('contextSection') contextSection?: ElementRef<HTMLElement>;
  highlightNode: HighlightedNode | null = null;

  experimentStudioService = inject(ExperimentStudioService);
  pdfExportService = inject(PdfExportService);
  csvExportService = inject(CsvExportService);
  private readonly mipVersion = inject(RuntimeEnvService).mipVersion;
  guideState = inject(ExperimentStudioGuideStateService);
  private cdr = inject(ChangeDetectorRef);

  errorService = inject(ErrorService);
  histogramData = signal<HistogramChartData | null>(null);
  groupHistogramData = signal<GroupCensusData | null>(null);
  histogramSplit = signal(HISTOGRAM_SPLIT_NONE);
  plottedVariable = signal<D3HierarchyNode | null>(null);
  readonly histogramSplitOptions = computed((): HistogramSplitOption[] =>
    buildHistogramSplitOptions({
      plottedCode: this.plottedVariable()?.code,
      selectedVariables: this.experimentStudioService.selectedVariables(),
      datasetLevelCount: this.experimentStudioService.selectedDatasets().length,
      unavailableVariables: this.experimentStudioService.unavailableVariables(),
    })
  );
  readonly canSplitHistogram = computed(() => {
    const node = this.plottedVariable();
    return !!node && !node.children?.length && !isNominalHistogramNode(node);
  });
  readonly histogramPrivacyTrimNote = computed(() => {
    const data = this.histogramData();
    if (!data?.bins?.length || isNominalHistogramNode(this.plottedVariable())) {
      return null;
    }
    return formatClippedNullEdgesNote(describeClippedNullEdges(data.bins, data.counts));
  });
  groupHistogramMeta = signal<GroupHistogramMeta | null>(null);
  d3Data: D3HierarchyNode | null = null;
  selectedDataModel = this.experimentStudioService.selectedDataModel;
  selectedNode: D3HierarchyNode | null = null;
  crossSectionalModels: DataModel[] = [];
  longitudinalModels: DataModel[] = [];
  availableDatasets: DatasetOption[] = [];
  error: string | null = null;
  isLoadingHistogram = signal(false);
  errorMessage = signal<string | null>(null);
  emptyChartMessage = signal<string | null>(null);
  isExporting = signal(false);
  exportMenuOpen = signal(false);
  metadataBrowserMode = signal<MetadataBrowserMode>(this.loadMetadataBrowserMode());
  readonly metadataBrowserModeIndex = computed(() => {
    const index = this.metadataBrowserModes.findIndex(
      (mode) => mode.value === this.metadataBrowserMode()
    );
    return index >= 0 ? index : 0;
  });
  contextOpen = signal(false);
  searchExpanded = signal(false);
  /** Variables missing from a selected dataset: grayed out in every view and never selected. */
  readonly unavailableVariables = this.experimentStudioService.unavailableVariables;
  readonly selectedDatasetCount = computed(() => (this.experimentStudioService.selectedDatasets() ?? []).length);
  activeDetailsTab = signal<DetailsPanelTab>('histogram');
  private destroy$ = new Subject<void>();
  private histogramRequest$ = new Subject<{
    codes: string[];
    label?: string;
    bins?: number | null;
    grouping?: string | null;
  }>();
  private lastModelKey: string | null = null;

  constructor() {
    this.setupHistogramPipeline();

    // A split whose option was removed from the pool or became disabled (too many
    // datasets) must not stay drawn under a select that no longer offers it.
    effect(() => {
      const split = this.histogramSplit();
      if (!split) return;
      const option = this.histogramSplitOptions().find((item) => item.code === split);
      // A split that became unavailable after a dataset change is kept: nothing chosen is auto-removed.
      if (option && (!option.disabled || option.unavailable)) return;
      untracked(() => this.applyHistogramSplit(HISTOGRAM_SPLIT_NONE));
    });

    effect(() => {
      const model = this.selectedDataModel();
      if (!model) {
        // A studio reset (e.g. a saved experiment whose pathology is gone) must not leave the old chart up.
        if (this.lastModelKey !== null) {
          this.lastModelKey = null;
          untracked(() => this.clearModelView());
        }
        return;
      }
      const key = `${model.code}:${model.version}`;
      if (this.lastModelKey === key) return;
      this.lastModelKey = key;
      this.loadVisualizationData();
      if (this.d3Data) {
        this.onSelectedNodeChange(this.d3Data);
      }
    });
  }


  ngOnInit(): void {
    this.loadDataModels();
  }


  onSearchSelected(result: MetadataSearchResult): void {
    if (!this.d3Data) {
      console.warn('[Search] No data model loaded');
      return;
    }

    const index = normalizeMetadataTree(this.d3Data);
    const selection = selectionFromSearchResult(index, result);
    const node = selection.originalNode;
    if (this.isUnavailable(node)) return;
    this.highlightNode = { ...node, path: result.path };
    this.onSelectedNodeChange(node);
    this.searchExpanded.set(false);
  }

  onVariableClicked(variable: D3HierarchyNode): void {
    if (!variable?.code) {
      console.warn('Invalid variable clicked:', variable);
      return;
    }
    this.highlightNode = variable;
    this.onSelectedNodeChange(variable);
  }

  onBubbleNodeSelected(node: D3HierarchyNode): void {
    if (this.isUnavailable(node)) return;
    this.onSelectedNodeChange(node);
  }

  onMetadataBrowserNodeSelected(node: D3HierarchyNode): void {
    if (this.isUnavailable(node)) return;
    this.highlightNode = node;
    this.onSelectedNodeChange(node);
  }

  onNodeDoubleClicked(node: D3HierarchyNode): void {
    if (this.isUnavailable(node)) return;
    this.onSelectedNodeChange(node);
    this.addVariableFromBubble();
    this.cdr.detectChanges();
  }

  get selectedVariables(): D3HierarchyNode[] {
    return this.experimentStudioService.selectedVariables();
  }


  setMetadataBrowserMode(mode: MetadataBrowserMode): void {
    this.metadataBrowserMode.set(mode);
    try {
      localStorage.setItem(this.metadataBrowserModeStorageKey, mode);
    } catch {
      // Ignore private-mode or quota failures; the UI can still use the in-memory signal.
    }
  }

  setActiveDetailsTab(tab: DetailsPanelTab): void {
    this.activeDetailsTab.set(tab);
  }

  toggleContext(): void {
    this.contextOpen.update(open => !open);
  }

  get contextChipTitle(): string {
    return studyContextTitle(this.selectedDataModel()?.label, this.selectedDatasetCount());
  }

  toggleSearch(): void {
    this.searchExpanded.update(expanded => {
      if (!expanded) {
        setTimeout(() => {
          this.searchSection?.nativeElement?.querySelector('input')?.focus();
        }, 0);
      }
      return !expanded;
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClickForContext(event: MouseEvent): void {
    const target = event.target as Node;
    if (this.contextOpen() && this.contextSection && !this.contextSection.nativeElement.contains(target)) {
      this.contextOpen.set(false);
    }
    if (
      this.searchExpanded()
      && this.searchSection
      && !this.searchSection.nativeElement.contains(target)
    ) {
      this.searchExpanded.set(false);
    }
    if (this.exportMenuOpen() && !(target as HTMLElement)?.closest?.('.histogram-export-group')) {
      this.exportMenuOpen.set(false);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydownForContext(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.contextOpen.set(false);
      this.searchExpanded.set(false);
      this.exportMenuOpen.set(false);
    }
  }

  get hasSelectedDatasets(): boolean {
    return (this.experimentStudioService.selectedDatasets() || []).length > 0;
  }

  private isUnavailable(node: D3HierarchyNode | null | undefined): boolean {
    return isVariableUnavailable(this.unavailableVariables(), node);
  }

  isSelectedNodeInPool(): boolean {
    // Unavailable variables can never be added, so they do not count against "all added";
    // a node with only unavailable variables still reads as pooled when they were added earlier.
    const addable = this.addableTargets();
    const targets = addable.length ? addable : this.selectionTargets();
    if (!targets.length) {
      return false;
    }
    const selected = this.experimentStudioService.selectedVariables();
    return targets.every((item) => selected.some((variable) => variable.code === item.code));
  }

  selectionToggleDisabled(): boolean {
    return !this.hasSelectedDatasets
      || !this.selectedNode
      || (this.selectedNodeOnlyUnavailable() && !this.isSelectedNodeInPool());
  }

  /** The selected node offers nothing to add: every variable under it is unavailable. */
  private selectedNodeOnlyUnavailable(): boolean {
    return this.selectionTargets().length > 0 && this.addableTargets().length === 0;
  }

  selectionToggleLabel(): string {
    return this.isSelectedNodeInPool() ? 'Remove' : 'Add';
  }

  selectionToggleTitle(): string {
    if (!this.hasSelectedDatasets) {
      return 'Select datasets first';
    }
    if (!this.selectedNode) {
      return 'Select a variable or group on the map';
    }
    if (this.selectedNodeOnlyUnavailable() && !this.isSelectedNodeInPool()) {
      return 'Not available in the selected datasets';
    }
    return this.isSelectedNodeInPool()
      ? 'Remove the selected variable from this experiment'
      : 'Add the selected variable to this experiment';
  }

  toggleSelectedNodeInPool(): void {
    if (this.selectionToggleDisabled()) {
      return;
    }
    if (!this.selectionTargets().length) {
      return;
    }
    if (this.isSelectedNodeInPool()) {
      const removeCodes = new Set(this.selectionTargets().map((item) => item.code));
      this.experimentStudioService.setVariables(
        this.experimentStudioService.selectedVariables().filter((variable) => !removeCodes.has(variable.code))
      );
      return;
    }
    this.addableTargets().forEach((item) => this.experimentStudioService.addVariableAndEnrich(item));
  }

  addVariableFromBubble(): void {
    if (!this.hasSelectedDatasets || !this.selectedNode) {
      return;
    }
    this.addableTargets().forEach((item) => this.experimentStudioService.addVariableAndEnrich(item));
  }

  /** Selection targets minus unavailable variables, so adding a group never pools one. */
  private addableTargets(): D3HierarchyNode[] {
    return this.selectionTargets().filter((item) => !this.isUnavailable(item));
  }

  private selectionTargets(): D3HierarchyNode[] {
    const selectedNode = this.selectedNode;
    if (!selectedNode) {
      return [];
    }
    return selectedNode.children ? collectLeafNodes(selectedNode) : [selectedNode];
  }

  loadDataModels(): void {
    this.experimentStudioService.getAllDataModels()
      .pipe(takeUntil(this.destroy$))
      .subscribe((dataModels) => {
        this.handleDataModelResponse(dataModels);
      });
  }

  handleDataModelResponse(dataModels: DataModel[]): void {
    const { crossSectional, longitudinal } = this.experimentStudioService.categorizeDataModels(dataModels);
    this.crossSectionalModels = crossSectional;
    this.longitudinalModels = longitudinal;

    if (dataModels.length > 0) {
      const current = this.selectedDataModel();
      const models = [...crossSectional, ...longitudinal];
      const next = current ? models.find((model) => isSameDataModel(model, current)) ?? null : null;
      const fallback = this.experimentStudioService.editingExistingExperiment()
        ? null
        : models[0] ?? null;
      this.selectedDataModel.set(next ?? fallback);
      this.experimentStudioService.selectedDataModel.set(this.selectedDataModel() ?? null);
      return;
    }

    this.selectedDataModel.set(null);
    this.experimentStudioService.selectedDataModel.set(null);
    this.clearModelView();
  }

  private clearModelView(): void {
    this.availableDatasets = [];
    this.d3Data = null;
    this.selectedNode = null;
    this.guideState.setSelectedHierarchyNode(null);
    this.histogramData.set(null);
    this.groupHistogramData.set(null);
    this.groupHistogramMeta.set(null);
    this.activeDetailsTab.set('histogram');
  }

  loadVisualizationData(): void {
    const model = this.selectedDataModel();
    if (!model) return; // exit early

    this.d3Data = this.experimentStudioService.convertToD3Hierarchy(model).hierarchy;
    // TODO: Refactor dataset sourcing via Exaflow so datasets/labels come from a single canonical source.
    this.experimentStudioService.updateAvailableDatasets(model);
    this.availableDatasets = this.experimentStudioService.availableDatasets();
    this.ensureDatasetsSelected();
  }

  /**
   * A new session (or a fresh pathology pick) should land with a working
   * dataset gate, not a lone "0". Auto-select every available dataset unless
   * the user has a valid selection or is opening an existing experiment.
   */
  ensureDatasetsSelected(): void {
    if (this.experimentStudioService.editingExistingExperiment()) {
      return;
    }
    const selected = new Set(this.experimentStudioService.selectedDatasets());
    const hasValidSelection = this.availableDatasets.some((dataset) => selected.has(dataset.code));
    if (hasValidSelection) {
      return;
    }
    this.experimentStudioService.setSelectedDatasets(
      this.availableDatasets.map((dataset) => dataset.code)
    );
  }


  // end of services functions
  onSelectedDataModelChange(selectedDataModel: DataModel | null): void {
    if (!selectedDataModel) return;
    if (isSameDataModel(this.selectedDataModel(), selectedDataModel)) {
      return;
    }
    // update service signal
    this.experimentStudioService.selectedDataModel.set(selectedDataModel);

    // clean up selections
    this.experimentStudioService.clearSelectionsForDataModelChange();

    this.histogramData.set(null);
    this.groupHistogramData.set(null);
    this.groupHistogramMeta.set(null);
    this.activeDetailsTab.set('histogram');
    this.searchExpanded.set(false);

    // reload new model data
    this.loadVisualizationData();
  }


  onSelectedNodeChange(node: D3HierarchyNode | null): void {
    if (!node) {
      this.selectedNode = null;
      this.guideState.setSelectedHierarchyNode(null);
      this.cdr.detectChanges();
      this.histogramData.set(null);
      this.groupHistogramData.set(null);
      this.histogramSplit.set(HISTOGRAM_SPLIT_NONE);
      this.plottedVariable.set(null);
      this.groupHistogramMeta.set(null);
      this.isLoadingHistogram.set(false);
      this.errorMessage.set('No variable selected.');
      this.activeDetailsTab.set('histogram');
      return;
    }

    // Guard against redundant clicks on the already selected node
    if (this.selectedNode?.code === node.code && this.selectedNode?.label === node.label) {
      return;
    }

    this.selectedNode = { ...node };
    this.activeDetailsTab.set('histogram');
    this.guideState.setSelectedHierarchyNode(this.selectedNode);
    this.cdr.detectChanges();
    this.clearChartNotices();
    this.histogramData.set(null); // clear previous histogram
    this.groupHistogramData.set(null);
    this.histogramSplit.set(HISTOGRAM_SPLIT_NONE);
    this.plottedVariable.set(node);
    this.groupHistogramMeta.set(null);
    if (!node) {
      this.isLoadingHistogram.set(false);
      this.errorMessage.set('No variable selected.');
      return;
    }

    if (node.children && node.children.length > 0) {
      const { hasGroups, items } = describeGroup(node);

      if (!items.length) {
        this.isLoadingHistogram.set(false);
        this.errorMessage.set('No groups found for this selection.');
        return;
      }

      const pathNodes = this.getPathNodes(node);
      this.isLoadingHistogram.set(false);
      this.groupHistogramMeta.set({
        pathNodes,
        groupCount: items.length,
        hasGroups,
      });

      // A group that holds only variables has nothing to census: every bar would be a
      // single variable. Ask the user to pick a variable from the browser instead.
      if (!hasGroups) {
        this.emptyChartMessage.set(GROUP_OF_VARIABLES_ONLY_MESSAGE);
        return;
      }

      this.groupHistogramData.set(buildGroupCensus(node, items));
      return;
    }

    this.queueHistogramRequest([node.code ?? ''], node.label);
  }


  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupHistogramPipeline(): void {
    this.histogramRequest$
      .pipe(
        takeUntil(this.destroy$),
        switchMap(({ codes, label, bins, grouping }) => {
          return this.experimentStudioService
            .getAlgorithmResults(
              AlgorithmNames.HISTOGRAM,
              codes,
              bins ?? null,
              undefined,
              undefined,
              grouping ? [grouping] : undefined
            )
            .pipe(
              catchError((error) => {
                this.isLoadingHistogram.set(false);
                console.error('Error fetching histogram:', error);
                this.errorMessage.set('Error loading histogram. Please try again.');
                return of(null);
              }),
              map((response) => ({ response, label, codes, grouping: grouping ?? null }))
            );
        })
      )
      .subscribe({
        next: ({ response, label, codes, grouping }) => {
          this.isLoadingHistogram.set(false);

          if (!response) return;

          try {
            const histList = extractHistogramItems(response);
            if (histList.length) {
              const variableCode = String(histList[0]?.var ?? histList[0]?.variable ?? codes?.[0] ?? '');
              const variableNode = variableCode ? findNodeByCode(this.d3Data, variableCode) : null;
              const stacked = buildStackedHistogramSeries(
                histList,
                variableCode,
                grouping,
                (groupingVar, groupingEnum) => this.groupingEnumLabel(groupingVar, groupingEnum),
                this.experimentStudioService.selectedDatasets()
              );
              if (!stacked) {
                this.histogramData.set(null);
                this.emptyChartMessage.set('No distribution for this selection.');
                return;
              }
              const binLabels = labelHistogramBins(stacked.bins, variableNode?.enumerations);
              const splitLabel = grouping
                ? (this.histogramSplitOptions().find((option) => option.code === grouping)?.label ?? grouping)
                : undefined;
              this.histogramData.set({
                bins: binLabels,
                counts: stacked.counts,
                groups: stacked.groups,
                variableName: label ?? variableNode?.label ?? '',
                variableType: variableNode?.type,
                splitLabel,
              });
              this.clearChartNotices();
            } else {
              this.histogramData.set(null);
              if (isInsufficientDataResponse(response)) {
                this.emptyChartMessage.set('This variable does not have sufficient data.');
              } else {
                this.emptyChartMessage.set('No distribution for this selection.');
              }
            }
          } catch (error) {
            console.error('Error parsing histogram:', error);
            this.histogramData.set(null);
            this.errorMessage.set('Error loading histogram. Please try again.');
          }
        },
        error: (error) => {
          this.isLoadingHistogram.set(false);
          console.error('Error fetching histogram:', error);
          this.errorMessage.set('Error loading histogram. Please try again.');
        },
      });
  }

  private clearChartNotices(): void {
    this.errorMessage.set(null);
    this.emptyChartMessage.set(null);
  }

  private queueHistogramRequest(
    codes: string[],
    label?: string,
    bins: number | null = null,
    grouping: string | null = null
  ) {
    this.isLoadingHistogram.set(true);
    this.clearChartNotices();
    this.histogramData.set(null);
    this.histogramRequest$.next({ codes, label, bins, grouping });
  }

  onHistogramSplitChange(event: Event): void {
    const split = (event.target as HTMLSelectElement).value;
    const option = this.histogramSplitOptions().find((item) => item.code === split);
    this.applyHistogramSplit(option && !option.disabled ? split : HISTOGRAM_SPLIT_NONE);
  }

  private applyHistogramSplit(resolved: string): void {
    this.histogramSplit.set(resolved);
    const node = this.selectedNode ?? this.plottedVariable();
    if (!node?.code || node.children?.length) return;
    this.queueHistogramRequest([node.code], node.label, null, resolved || null);
  }

  private groupingEnumLabel(groupingVar: string, groupingEnum: string): string {
    if (groupingVar.toLowerCase() === DATASET_VARIABLE_CODE) {
      const fromMap = this.experimentStudioService.getDatasetLabelMap()[groupingEnum];
      if (fromMap) return fromMap;
      const fromList = this.availableDatasets.find((dataset) => dataset.code === groupingEnum)?.label;
      if (fromList) return fromList;
    }
    const node = findNodeByCode(this.d3Data, groupingVar)
      ?? this.experimentStudioService.selectedVariables().find((variable: { code?: string }) => variable.code === groupingVar);
    return enumerationLabel(groupingEnum, node?.enumerations) ?? groupingEnum;
  }

  getPathNodes(node: D3HierarchyNode | null): PathNode[] {
    return pathToNode(this.d3Data, node);
  }

  isExportDisabled(): boolean {
    if (this.isLoadingHistogram()) return true;
    if (this.errorMessage()) return true;
    if (!this.selectedNode) return true;
    return !this.histogramData() && !this.groupHistogramData();
  }

  isSelectedNodeGroup(): boolean {
    return !!this.selectedNode?.children?.length;
  }

  detailsPanelTitle(): string {
    if (!this.selectedNode) {
      return 'Select a variable';
    }
    return String(this.selectedNode.label ?? '').trim();
  }

  detailsPanelSubtitle(): string {
    if (!this.selectedNode) {
      return '';
    }
    if (this.isSelectedNodeGroup()) {
      const meta = this.groupHistogramMeta();
      if (meta) {
        return meta.hasGroups
          ? `${meta.groupCount} groups in this view`
          : `${meta.groupCount} variables in this group`;
      }
    }
    return String(this.selectedNode.description ?? '').trim();
  }

  toggleExportMenu(): void {
    this.exportMenuOpen.update(open => !open);
  }

  closeExportMenu(): void {
    this.exportMenuOpen.set(false);
  }

  async exportHistogramPdf(): Promise<void> {
    this.closeExportMenu();
    if (this.isExportDisabled()) return;
    this.isExporting.set(true);

    try {
      const exportTarget = this.histogramExport?.nativeElement;
      if (!exportTarget) {
        console.warn('Histogram export target not found.');
        return;
      }

      await this.pdfExportService.exportHistogramPdf(exportTarget, {
        title: this.groupHistogramData() ? 'Group Description' : 'Histogram',
        nodeLabel: String(this.selectedNode?.label ?? this.histogramData()?.variableName ?? ''),
        modelLabel: String(this.selectedDataModel()?.label ?? this.selectedDataModel()?.code ?? ''),
        datasetLabels: this.experimentStudioService.selectedDatasets()
          .map(code => this.availableDatasets.find(d => d.code === code)?.label ?? code)
          .filter(label => !!label),
        description: String(this.selectedNode?.description ?? ''),
        meta: this.groupHistogramMeta() ?? undefined,
        isGroupView: !!this.groupHistogramData(),
        mipVersion: this.mipVersion,
      });

    } catch (err) {
      console.error('Histogram PDF export failed:', err);
    } finally {
      this.isExporting.set(false);
    }
  }

  exportHistogramCsv(): void {
    this.closeExportMenu();
    if (this.isExportDisabled()) return;

    const data = this.groupHistogramData() || this.histogramData();
    if (!data) return;

    try {
      this.csvExportService.exportHistogramCsv(
        { bins: data.bins, counts: data.counts, groups: 'groups' in data ? data.groups : undefined },
        String(this.selectedNode?.label ?? data.variableName ?? 'histogram')
      );
    } catch (err) {
      console.error('Histogram CSV export failed:', err);
    }
  }


  private loadMetadataBrowserMode(): MetadataBrowserMode {
    try {
      const saved = localStorage.getItem(this.metadataBrowserModeStorageKey);
      if (saved === 'ontology' || saved === 'collapsible' || saved === 'bubble') {
        return saved;
      }
    } catch {
      // Fall through to the Map default.
    }
    return 'bubble';
  }
}
