import { BubbleChartComponent } from './../visualisations/bubble-chart/bubble-chart.component';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { Component, signal, inject, OnInit, ElementRef, viewChild, effect, computed, ChangeDetectionStrategy, untracked, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { D3HierarchyNode, DataModel } from '../../../models/data-model.interface';
import { DataModelSelectorComponent } from './data-model-selector/data-model-selector.component';
import { DatasetSelectorComponent } from './dataset-selector/dataset-selector.component';
import { SearchBarComponent } from './search-bar/search-bar.component';
import { SelectedVariablesComponent } from './selected-variables/selected-variables.component';
import { HistogramGraphComponent } from './histogram-graph/histogram-graph.component';
import { MetadataInfoPanelComponent } from './metadata-info-panel/metadata-info-panel.component';
import { catchError, map, of, Subject, switchMap } from 'rxjs';
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
  MetadataBrowserModeOption,
} from './variables-panel.models';

/** localStorage key of the last Map / List / Graph choice. */
const METADATA_BROWSER_MODE_STORAGE_KEY = 'metadata_browser_mode';

const NO_DISTRIBUTION_MESSAGE = 'No distribution for this selection.';

/** Shown when the selected node groups variables only, so there is nothing to census. */
const GROUP_OF_VARIABLES_ONLY_MESSAGE =
  'Please select one of the variables in the representation on the left to see its histogram in the selected centers.';

@Component({
  selector: 'app-variables-panel',
  templateUrl: './variables-panel.component.html',
  styleUrl: './variables-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
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

  private readonly histogramExport = viewChild<ElementRef<HTMLElement>>('histogramExport');
  private readonly searchSection = viewChild<ElementRef<HTMLElement>>('searchSection');
  private readonly contextSection = viewChild<ElementRef<HTMLElement>>('contextSection');
  /** The node the browsers scroll to and outline; search picks carry their breadcrumb. */
  readonly highlightNode = signal<HighlightedNode | null>(null);

  protected readonly experimentStudioService = inject(ExperimentStudioService);
  private readonly pdfExportService = inject(PdfExportService);
  private readonly csvExportService = inject(CsvExportService);
  private readonly mipVersion = inject(RuntimeEnvService).mipVersion;
  private readonly guideState = inject(ExperimentStudioGuideStateService);
  private readonly destroyRef = inject(DestroyRef);

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
  /** The selected pathology as a browsable tree; null until a data model is loaded. */
  readonly hierarchy = signal<D3HierarchyNode | null>(null);
  readonly selectedDataModel = this.experimentStudioService.selectedDataModel;
  readonly selectedNode = signal<D3HierarchyNode | null>(null);
  readonly crossSectionalModels = signal<DataModel[]>([]);
  readonly longitudinalModels = signal<DataModel[]>([]);
  readonly availableDatasets = signal<DatasetOption[]>([]);
  readonly selectedVariables = this.experimentStudioService.selectedVariables;
  isLoadingHistogram = signal(false);
  errorMessage = signal<string | null>(null);
  emptyChartMessage = signal<string | null>(null);
  isExporting = signal(false);
  exportMenuOpen = signal(false);
  metadataBrowserMode = signal<MetadataBrowserMode>(loadMetadataBrowserMode());
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
  private readonly hasSelectedDatasets = computed(() => this.selectedDatasetCount() > 0);
  readonly studyContextTitle = computed(() => studyContextTitle(this.selectedDataModel()?.label, this.selectedDatasetCount()));
  /** Breadcrumb of the selected node for the Details tab. */
  readonly selectedPath = computed(() => pathToNode(this.hierarchy(), this.selectedNode()));

  /** The variables the selected node stands for: itself, or every variable under a group. */
  private readonly selectionTargets = computed((): D3HierarchyNode[] => {
    const node = this.selectedNode();
    if (!node) return [];
    return node.children ? collectLeafNodes(node) : [node];
  });
  /** Selection targets minus unavailable variables, so adding a group never pools one. */
  private readonly addableTargets = computed(() => this.selectionTargets().filter((item) => !this.isUnavailable(item)));
  /**
   * Unavailable variables can never be added, so they do not count against "all added";
   * a node with only unavailable variables still reads as pooled when they were added earlier.
   */
  readonly isSelectedNodeInPool = computed(() => {
    const addable = this.addableTargets();
    const targets = addable.length ? addable : this.selectionTargets();
    if (!targets.length) return false;
    const selected = this.selectedVariables();
    return targets.every((item) => selected.some((variable) => variable.code === item.code));
  });
  /** The selected node offers nothing to add: every variable under it is unavailable. */
  private readonly selectedNodeOnlyUnavailable = computed(
    () => this.selectionTargets().length > 0 && this.addableTargets().length === 0
  );
  readonly selectionToggleDisabled = computed(() =>
    !this.hasSelectedDatasets()
    || !this.selectedNode()
    || (this.selectedNodeOnlyUnavailable() && !this.isSelectedNodeInPool())
  );
  readonly selectionToggleLabel = computed(() => (this.isSelectedNodeInPool() ? 'Remove' : 'Add'));
  readonly selectionToggleTitle = computed(() => {
    if (!this.hasSelectedDatasets()) return 'Select datasets first';
    if (!this.selectedNode()) return 'Select a variable or group on the map';
    if (this.selectedNodeOnlyUnavailable() && !this.isSelectedNodeInPool()) {
      return 'Not available in the selected datasets';
    }
    return this.isSelectedNodeInPool()
      ? 'Remove the selected variable from this experiment'
      : 'Add the selected variable to this experiment';
  });
  readonly isSelectedNodeGroup = computed(() => !!this.selectedNode()?.children?.length);
  readonly detailsPanelTitle = computed(() => {
    const node = this.selectedNode();
    return node ? String(node.label ?? '').trim() : 'Select a variable';
  });
  readonly detailsPanelSubtitle = computed(() => {
    const node = this.selectedNode();
    if (!node) return '';
    const meta = this.groupHistogramMeta();
    if (this.isSelectedNodeGroup() && meta) {
      return meta.hasGroups ? `${meta.groupCount} groups in this view` : `${meta.groupCount} variables in this group`;
    }
    return String(node.description ?? '').trim();
  });
  readonly isExportDisabled = computed(() =>
    this.isLoadingHistogram()
    || !!this.errorMessage()
    || !this.selectedNode()
    || (!this.histogramData() && !this.groupHistogramData())
  );

  activeDetailsTab = signal<DetailsPanelTab>('histogram');
  private readonly histogramRequest$ = new Subject<{
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
      untracked(() => this.showDataModel(model));
    });
  }

  ngOnInit(): void {
    this.loadDataModels();
  }

  // ── Data models and the hierarchy ──────────────────────────────────────────

  loadDataModels(): void {
    this.experimentStudioService.getAllDataModels()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((dataModels) => this.handleDataModelResponse(dataModels));
  }

  handleDataModelResponse(dataModels: DataModel[]): void {
    const { crossSectional, longitudinal } = this.experimentStudioService.categorizeDataModels(dataModels);
    this.crossSectionalModels.set(crossSectional);
    this.longitudinalModels.set(longitudinal);

    if (dataModels.length > 0) {
      const current = this.selectedDataModel();
      const models = [...crossSectional, ...longitudinal];
      const next = current ? models.find((model) => isSameDataModel(model, current)) ?? null : null;
      const fallback = this.experimentStudioService.editingExistingExperiment() ? null : models[0] ?? null;
      this.selectedDataModel.set(next ?? fallback);
      return;
    }

    this.selectedDataModel.set(null);
    this.clearModelView();
  }

  /**
   * Loads the tree of a newly selected pathology and selects its root. The same
   * pathology (code and version) is not reloaded; a studio reset (e.g. a saved
   * experiment whose pathology is gone) must not leave the old chart up.
   */
  private showDataModel(model: DataModel | null): void {
    if (!model) {
      if (this.lastModelKey !== null) {
        this.lastModelKey = null;
        this.clearModelView();
      }
      return;
    }
    const key = `${model.code}:${model.version}`;
    if (this.lastModelKey === key) return;
    this.lastModelKey = key;
    this.loadVisualizationData();
    const root = this.hierarchy();
    if (root) {
      this.onSelectedNodeChange(root);
    }
  }

  private clearModelView(): void {
    this.availableDatasets.set([]);
    this.hierarchy.set(null);
    this.selectedNode.set(null);
    this.guideState.setSelectedHierarchyNode(null);
    this.histogramData.set(null);
    this.groupHistogramData.set(null);
    this.groupHistogramMeta.set(null);
    this.activeDetailsTab.set('histogram');
  }

  loadVisualizationData(): void {
    const model = this.selectedDataModel();
    if (!model) return;

    this.hierarchy.set(this.experimentStudioService.convertToD3Hierarchy(model).hierarchy);
    // TODO: Refactor dataset sourcing via Exaflow so datasets/labels come from a single canonical source.
    this.experimentStudioService.updateAvailableDatasets(model);
    this.availableDatasets.set(this.experimentStudioService.availableDatasets());
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
    const available = this.availableDatasets();
    if (available.some((dataset) => selected.has(dataset.code))) {
      return;
    }
    this.experimentStudioService.setSelectedDatasets(available.map((dataset) => dataset.code));
  }

  onSelectedDataModelChange(selectedDataModel: DataModel | null): void {
    if (!selectedDataModel || isSameDataModel(this.selectedDataModel(), selectedDataModel)) return;
    this.experimentStudioService.selectedDataModel.set(selectedDataModel);
    this.experimentStudioService.clearSelectionsForDataModelChange();

    this.histogramData.set(null);
    this.groupHistogramData.set(null);
    this.groupHistogramMeta.set(null);
    this.activeDetailsTab.set('histogram');
    this.searchExpanded.set(false);

    this.loadVisualizationData();
  }

  // ── Node selection ─────────────────────────────────────────────────────────

  onSearchSelected(result: MetadataSearchResult): void {
    const root = this.hierarchy();
    if (!root) {
      console.warn('[Search] No data model loaded');
      return;
    }
    const node = selectionFromSearchResult(normalizeMetadataTree(root), result).originalNode;
    if (this.isUnavailable(node)) return;
    this.highlightNode.set({ ...node, path: result.path });
    this.onSelectedNodeChange(node);
    this.searchExpanded.set(false);
  }

  onVariableClicked(variable: D3HierarchyNode): void {
    if (!variable?.code) {
      console.warn('Invalid variable clicked:', variable);
      return;
    }
    this.highlightNode.set(variable);
    this.onSelectedNodeChange(variable);
  }

  onBubbleNodeSelected(node: D3HierarchyNode): void {
    if (this.isUnavailable(node)) return;
    this.onSelectedNodeChange(node);
  }

  onMetadataBrowserNodeSelected(node: D3HierarchyNode): void {
    if (this.isUnavailable(node)) return;
    this.highlightNode.set(node);
    this.onSelectedNodeChange(node);
  }

  onNodeDoubleClicked(node: D3HierarchyNode): void {
    if (this.isUnavailable(node)) return;
    this.onSelectedNodeChange(node);
    this.addVariableFromBubble();
  }

  onSelectedNodeChange(node: D3HierarchyNode | null): void {
    if (!node) {
      this.selectedNode.set(null);
      this.guideState.setSelectedHierarchyNode(null);
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
    const current = this.selectedNode();
    if (current?.code === node.code && current?.label === node.label) {
      return;
    }

    const selected = { ...node };
    this.selectedNode.set(selected);
    this.activeDetailsTab.set('histogram');
    this.guideState.setSelectedHierarchyNode(selected);
    this.clearChartNotices();
    this.histogramData.set(null);
    this.groupHistogramData.set(null);
    this.histogramSplit.set(HISTOGRAM_SPLIT_NONE);
    this.plottedVariable.set(node);
    this.groupHistogramMeta.set(null);

    if (node.children && node.children.length > 0) {
      const { hasGroups, items } = describeGroup(node);
      if (!items.length) {
        this.isLoadingHistogram.set(false);
        this.errorMessage.set('No groups found for this selection.');
        return;
      }

      this.isLoadingHistogram.set(false);
      this.groupHistogramMeta.set({
        pathNodes: pathToNode(this.hierarchy(), node),
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

  private isUnavailable(node: D3HierarchyNode | null | undefined): boolean {
    return isVariableUnavailable(this.unavailableVariables(), node);
  }

  // ── Variable pool ──────────────────────────────────────────────────────────

  toggleSelectedNodeInPool(): void {
    if (this.selectionToggleDisabled() || !this.selectionTargets().length) {
      return;
    }
    if (this.isSelectedNodeInPool()) {
      const removeCodes = new Set(this.selectionTargets().map((item) => item.code));
      this.experimentStudioService.setVariables(
        this.selectedVariables().filter((variable) => !removeCodes.has(variable.code))
      );
      return;
    }
    this.addableTargets().forEach((item) => this.experimentStudioService.addVariableAndEnrich(item));
  }

  addVariableFromBubble(): void {
    if (!this.hasSelectedDatasets() || !this.selectedNode()) {
      return;
    }
    this.addableTargets().forEach((item) => this.experimentStudioService.addVariableAndEnrich(item));
  }

  // ── Toolbar popovers and browser mode ──────────────────────────────────────

  setMetadataBrowserMode(mode: MetadataBrowserMode): void {
    this.metadataBrowserMode.set(mode);
    try {
      localStorage.setItem(METADATA_BROWSER_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore private-mode or quota failures; the UI can still use the in-memory signal.
    }
  }

  setActiveDetailsTab(tab: DetailsPanelTab): void {
    this.activeDetailsTab.set(tab);
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

  // ── Histogram ──────────────────────────────────────────────────────────────

  private setupHistogramPipeline(): void {
    this.histogramRequest$
      .pipe(
        switchMap(({ codes, label, bins, grouping }) =>
          this.experimentStudioService
            .getAlgorithmResults(AlgorithmNames.HISTOGRAM, codes, bins ?? null, undefined, undefined, grouping ? [grouping] : undefined)
            .pipe(
              catchError((error) => {
                this.isLoadingHistogram.set(false);
                console.error('Error fetching histogram:', error);
                this.errorMessage.set('Error loading histogram. Please try again.');
                return of(null);
              }),
              map((response) => ({ response, label, codes, grouping: grouping ?? null }))
            )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ response, label, codes, grouping }) => {
          this.isLoadingHistogram.set(false);
          if (!response) return;
          try {
            this.showHistogramResponse(response, codes, label, grouping);
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

  private showHistogramResponse(response: unknown, codes: string[], label: string | undefined, grouping: string | null): void {
    const items = extractHistogramItems(response);
    if (!items.length) {
      this.histogramData.set(null);
      this.emptyChartMessage.set(
        isInsufficientDataResponse(response) ? 'This variable does not have sufficient data.' : NO_DISTRIBUTION_MESSAGE
      );
      return;
    }
    const variableCode = String(items[0]?.var ?? items[0]?.variable ?? codes?.[0] ?? '');
    const variableNode = variableCode ? findNodeByCode(this.hierarchy(), variableCode) : null;
    const stacked = buildStackedHistogramSeries(
      items,
      variableCode,
      grouping,
      (groupingVar, groupingEnum) => this.groupingEnumLabel(groupingVar, groupingEnum),
      this.experimentStudioService.selectedDatasets()
    );
    if (!stacked) {
      this.histogramData.set(null);
      this.emptyChartMessage.set(NO_DISTRIBUTION_MESSAGE);
      return;
    }
    const splitLabel = grouping
      ? (this.histogramSplitOptions().find((option) => option.code === grouping)?.label ?? grouping)
      : undefined;
    this.histogramData.set({
      bins: labelHistogramBins(stacked.bins, variableNode?.enumerations),
      counts: stacked.counts,
      groups: stacked.groups,
      variableName: label ?? variableNode?.label ?? '',
      variableType: variableNode?.type,
      splitLabel,
    });
    this.clearChartNotices();
  }

  private clearChartNotices(): void {
    this.errorMessage.set(null);
    this.emptyChartMessage.set(null);
  }

  private queueHistogramRequest(codes: string[], label?: string, bins: number | null = null, grouping: string | null = null): void {
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
    const node = this.selectedNode() ?? this.plottedVariable();
    if (!node?.code || node.children?.length) return;
    this.queueHistogramRequest([node.code], node.label, null, resolved || null);
  }

  private groupingEnumLabel(groupingVar: string, groupingEnum: string): string {
    if (groupingVar.toLowerCase() === DATASET_VARIABLE_CODE) {
      const fromMap = this.experimentStudioService.getDatasetLabelMap()[groupingEnum];
      if (fromMap) return fromMap;
      const fromList = this.availableDatasets().find((dataset) => dataset.code === groupingEnum)?.label;
      if (fromList) return fromList;
    }
    const node = findNodeByCode(this.hierarchy(), groupingVar)
      ?? this.selectedVariables().find((variable: { code?: string }) => variable.code === groupingVar);
    return enumerationLabel(groupingEnum, node?.enumerations) ?? groupingEnum;
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  toggleExportMenu(): void {
    this.exportMenuOpen.update((open) => !open);
  }

  closeExportMenu(): void {
    this.exportMenuOpen.set(false);
  }

  async exportHistogramPdf(): Promise<void> {
    this.closeExportMenu();
    if (this.isExportDisabled()) return;
    this.isExporting.set(true);

    try {
      const exportTarget = this.histogramExport()?.nativeElement;
      if (!exportTarget) {
        console.warn('Histogram export target not found.');
        return;
      }
      const node = this.selectedNode();
      const model = this.selectedDataModel();
      const datasets = this.availableDatasets();
      await this.pdfExportService.exportHistogramPdf(exportTarget, {
        title: this.groupHistogramData() ? 'Group Description' : 'Histogram',
        nodeLabel: String(node?.label ?? this.histogramData()?.variableName ?? ''),
        modelLabel: String(model?.label ?? model?.code ?? ''),
        datasetLabels: this.experimentStudioService.selectedDatasets()
          .map((code) => datasets.find((dataset) => dataset.code === code)?.label ?? code)
          .filter((label) => !!label),
        description: String(node?.description ?? ''),
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
        String(this.selectedNode()?.label ?? data.variableName ?? 'histogram')
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
