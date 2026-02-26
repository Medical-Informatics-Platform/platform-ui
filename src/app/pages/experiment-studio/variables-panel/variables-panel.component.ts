import { BubbleChartComponent } from './../visualisations/bubble-chart/bubble-chart.component';
import { ErrorService } from '../../../services/error.service';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { Component, signal, inject, Input, WritableSignal, OnDestroy, ElementRef, ViewChild, effect, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { DataModel } from '../../../models/data-model.interface';
import { DataModelSelectorComponent } from './data-model-selector/data-model-selector.component';
import { DatasetSelectorComponent } from './dataset-selector/dataset-selector.component';
import { SearchBarComponent } from './search-bar/search-bar.component';
import { VariableFilterSelectionComponent } from './variable-filter-selection/variable-filter-selection.component';
import { HistogramGraphComponent } from './histogram-graph/histogram-graph.component';
import { SpinnerComponent } from '../../shared/spinner/spinner.component';
import { catchError, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { PdfExportService } from '../../../services/pdf-export.service';
import { CsvExportService } from '../../../services/csv-export.service';

@Component({
  selector: 'app-variables-panel',
  templateUrl: './variables-panel.component.html',
  styleUrls: ['./variables-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatChipsModule,
    MatIconModule,
    BubbleChartComponent,
    HistogramGraphComponent,
    DataModelSelectorComponent,
    DatasetSelectorComponent,
    SearchBarComponent,
    VariableFilterSelectionComponent,
    SpinnerComponent,
  ]
})
export class VariablesPanelComponent implements OnDestroy {
  @Input() defaultModel: DataModel | null = null;
  @Input() dataModelHierarchy: any;
  @ViewChild('histogramExport') histogramExport?: ElementRef<HTMLElement>;
  @ViewChild(VariableFilterSelectionComponent) variableFilterSelection?: VariableFilterSelectionComponent;
  highlightNode: any = null;

  experimentStudioService = inject(ExperimentStudioService);
  pdfExportService = inject(PdfExportService);
  csvExportService = inject(CsvExportService);
  private cdr = inject(ChangeDetectorRef);

  errorService = inject(ErrorService);
  filteredVariables: WritableSignal<any[]> = signal([]);
  filteredGroups: WritableSignal<any[]> = signal([]);
  histogramData = signal<any | null>(null);
  groupHistogramData = signal<{ bins: string[]; counts: number[]; variableName: string } | null>(null);
  histogramVariants = signal<Array<{ key: string; label: string; data: any }>>([]);
  selectedHistogramVariantKey = signal<string | null>(null);
  groupHistogramMeta = signal<{
    pathNodes: Array<{ code: string; label: string }>;
    groupCount: number;
    hasGroups: boolean;
  } | null>(null);
  d3Data: any;
  selectedDataModel = this.experimentStudioService.selectedDataModel;
  selectedNode: any;
  crossSectionalModels: DataModel[] = [];
  longitudinalModels: DataModel[] = [];
  availableDatasets: { code: string; label: string }[] = [];
  error: string | null = null;
  filteredData: any; // Filtered variables and groups
  searchQuery = ''; // Search input
  dataWithName: any;
  groupVariables: any[] = [];
  isLoadingHistogram = signal(false);
  errorMessage = signal<string | null>(null);
  isExporting = signal(false);
  refreshKey = signal(0);
  histogramBins = signal<number | null>(null);
  private destroy$ = new Subject<void>();
  private histogramRequest$ = new Subject<{ codes: string[]; label?: string; bins?: number | null }>();
  private lastModelKey: string | null = null;

  constructor() {
    this.setupHistogramPipeline();

    effect(() => {
      const model = this.selectedDataModel();
      if (!model) return;
      const key = `${model.code}:${model.version}`;
      if (this.lastModelKey === key) return;
      this.lastModelKey = key;
      this.loadVisualizationData();
      if (this.d3Data) {
        this.onSelectedNodeChange(this.d3Data);
      }
    }, { allowSignalWrites: true });
  }


  ngOnInit(): void {
    this.selectedDataModel.set(this.defaultModel);
    this.loadDataModels();
  }

  onSearchResult(selectedName: string) {
    const found = this.filteredVariables().find(v => v.label === selectedName);
    if (found) {
      this.highlightNode = found;
      this.onSelectedNodeChange(this.highlightNode);

    } else {
      console.warn('No variable "', selectedName);
      return;
    }
  }

  onSearchSelected(code: string) {
    const foundVar = this.filteredVariables().find(v => v.code === code);
    if (foundVar) {
      this.highlightNode = foundVar;              // zoom + highlight leaf
      this.onSelectedNodeChange(foundVar);        // histogram for leaf
      return;
    }

    const foundGroup = this.findNodeByCode(this.d3Data, code);
    if (foundGroup) {
      this.highlightNode = { code };
      this.onSelectedNodeChange(foundGroup);
      return;
    }

    console.warn('[Search] No node found for code:', code);
  }

  private findNodeByCode(node: any, code: string): any | null {
    if (!node) return null;
    if (node.code === code) return node;
    for (const child of node.children ?? []) {
      const found = this.findNodeByCode(child, code);
      if (found) return found;
    }
    return null;
  }

  onVariableClicked(variable: any): void {
    if (!variable?.code) {
      console.warn('Invalid variable clicked:', variable);
      return;
    }
    this.highlightNode = variable;
    this.onSelectedNodeChange(variable);
  }

  onNodeDoubleClicked(node: any): void {
    this.onSelectedNodeChange(node);
    this.addVariableFromBubble();
    this.cdr.detectChanges();
  }

  get selectedVariables(): any[] {
    return this.experimentStudioService.selectedVariables();
  }

  get selectedCovariates(): any[] {
    return this.experimentStudioService.selectedCovariates();
  }

  get selectedFilters(): any[] {
    return this.experimentStudioService.selectedFilters();
  }

  get hasSelectedDatasets(): boolean {
    return (this.experimentStudioService.selectedDatasets() || []).length > 0;
  }

  addVariableFromBubble(): void {
    this.variableFilterSelection?.addVariable();
  }

  addCovariateFromBubble(): void {
    this.variableFilterSelection?.addCovariate();
  }

  addFilterFromBubble(): void {
    this.variableFilterSelection?.addFilter();
  }

  findParentNode(currentNode: any, targetNode: any, parent: any = null): any {
    if (currentNode === targetNode) return parent;
    for (const child of currentNode.children || []) {
      const foundParent = this.findParentNode(child, targetNode, currentNode);
      if (foundParent) return foundParent;
    }
    return null;
  }

  // Recursively find a node by name
  findNodeByName(node: any, name: string): any {
    if (node.label === name) return node;
    for (const child of node.children || []) {
      const found = this.findNodeByName(child, name);
      if (found) return found;
    }
    return null;
  }

  onVariableChange(updatedVariables: any[]): void {
    this.experimentStudioService.setVariables(updatedVariables);
  }

  onCovariateChange(updatedCovariates: any[]): void {
    this.experimentStudioService.setCovariates(updatedCovariates);
  }

  onFilterChange(updatedFilters: any[]): void {
    this.experimentStudioService.setFilters(updatedFilters);
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
      const next = current
        ? models.find(
          (model) =>
            model.code === current.code
            && String(model.version) === String(current.version)
        ) ?? null
        : null;
      this.selectedDataModel.set(next ?? models[0] ?? null);
      this.experimentStudioService.selectedDataModel.set(this.selectedDataModel() ?? null);
    }
  }

  loadVisualizationData(): void {
    const model = this.selectedDataModel();
    if (!model) return; // exit early

    const { hierarchy, allVariables } =
      this.experimentStudioService.convertToD3Hierarchy(model);

    this.d3Data = hierarchy;
    this.filteredVariables.set(allVariables);
    this.filteredGroups.set(this.d3Data.children.filter((item: any) => item.children));
    // TODO: Refactor dataset sourcing via Exaflow so datasets/labels come from a single canonical source.
    const datasetVariable = allVariables.find(
      (variable: any) => String(variable?.code ?? '').toLowerCase() === 'dataset'
    );
    const datasetEnums = datasetVariable?.enumerations ?? [];
    const datasetSource: any = (model as any).datasets;
    const allowedCodes = new Set<string>(
      Array.isArray(datasetSource)
        ? datasetSource
          .map((item: any) => String(item?.code ?? item ?? ''))
          .filter((code: string) => code)
        : []
    );
    this.availableDatasets = datasetEnums
      .filter((dataset: any) => {
        const code = String(dataset?.code ?? '');
        return allowedCodes.size === 0 || allowedCodes.has(code);
      })
      .map((dataset: any) => ({
        code: String(dataset?.code ?? ''),
        label: String(dataset?.label ?? dataset?.name ?? dataset?.code ?? ''),
      }));
  }

  fetchFederationHistogram(): void {
    const federation = this.selectedDataModel();
    if (!federation) {
      console.warn('No federation selected.');
      return;
    }

    const federationGroups = this.d3Data.children || [];
    const groupCodes = federationGroups.map((g: any) => g.code);

    const algorithmName = "histogram";

    this.queueHistogramRequest(groupCodes, 'Federation');
  }

  // end of services functions
  onSelectedDataModelChange(selectedDataModel: DataModel | null): void {
    if (!selectedDataModel) return;
    const current = this.selectedDataModel();
    if (
      current
      && current.code === selectedDataModel.code
      && String(current.version) === String(selectedDataModel.version)
    ) {
      return;
    }
    // update service signal
    this.experimentStudioService.selectedDataModel.set(selectedDataModel);

    // clean up selections
    this.experimentStudioService.setVariables([]);
    this.experimentStudioService.setCovariates([]);
    this.experimentStudioService.setFilters([]);

    this.filteredVariables.set([]);
    this.filteredGroups.set([]);
    this.histogramData.set(null);
    this.groupHistogramData.set(null);
    this.groupHistogramMeta.set(null);

    // reload new model data
    this.loadVisualizationData();
  }

  // search bar functions
  onSearchQueryChange(query: string): void {
    this.searchQuery = query.toLowerCase();
    this.filterData();
  }

  filterData(): void {
    const filterNodes = (node: any) => {
      if (node.label.toLowerCase().includes(this.searchQuery)) {
        return { ...node };
      }
      if (node.children) {
        const filteredChildren = node.children.map(filterNodes).filter(Boolean);
        if (filteredChildren.length > 0) {
          return { ...node, children: filteredChildren };
        }
      }
      return null;
    };
    this.filteredData = filterNodes(this.d3Data) || { name: 'No Results', children: [] };
  }

  getAllLeafNodes(node: any): any[] {
    if (!node.children || node.children.length === 0) {
      return [];
    }

    const leaves: any[] = [];

    function collectLeaves(n: any) {
      if (!n.children || n.children.length === 0) {
        leaves.push(n);
      } else {
        n.children.forEach(collectLeaves);
      }
    }
    collectLeaves(node);
    return leaves;
  }

  onSelectedNodeChange(node: any): void {
    if (!node) {
      this.selectedNode = null;
      this.cdr.detectChanges();
      this.errorMessage.set(null);
      this.histogramData.set(null);
      this.groupHistogramData.set(null);
      this.histogramVariants.set([]);
      this.selectedHistogramVariantKey.set(null);
      this.groupHistogramMeta.set(null);
      this.isLoadingHistogram.set(false);
      this.errorMessage.set('No variable selected.');
      return;
    }

    // Guard against redundant clicks on the already selected node
    if (this.selectedNode?.code === node.code && this.selectedNode?.label === node.label) {
      return;
    }

    this.selectedNode = { ...node };
    this.cdr.detectChanges();
    this.errorMessage.set(null);
    this.histogramData.set(null); // clear previous histogram
    this.groupHistogramData.set(null);
    this.histogramVariants.set([]);
    this.selectedHistogramVariantKey.set(null);
    this.groupHistogramMeta.set(null);
    this.histogramBins.set(null); // Reset bins on new selection

    if (!node) {
      this.isLoadingHistogram.set(false);
      this.errorMessage.set('No variable selected.');
      return;
    }

    if (node.children && node.children.length > 0) {
      const children = Array.isArray(node.children) ? node.children : [];
      const hasGroups = children.some((child: any) => child?.children?.length);
      const items = hasGroups
        ? children.filter((child: any) => child?.children?.length)
        : children;

      if (!items.length) {
        this.isLoadingHistogram.set(false);
        this.errorMessage.set('No groups found for this selection.');
        return;
      }

      const bins = items.map((child: any) => String(child?.label ?? child?.name ?? child?.code ?? ''));
      const counts = items.map((child: any) => this.countLeafNodes(child));
      const pathNodes = this.getPathNodes(node);

      this.isLoadingHistogram.set(false);
      this.groupHistogramData.set({
        bins,
        counts,
        variableName: String(node?.label ?? 'Groups'),
      });
      this.groupHistogramMeta.set({
        pathNodes,
        groupCount: items.length,
        hasGroups,
      });
      return;
    }

    const codes = [node.code];
    this.queueHistogramRequest(codes, node.label);
  }

  addGroupVariables(): void {
    if (!this.groupVariables.length) return;

    const existingCodes = new Set(this.selectedVariables.map(v => v.code));
    const newVariables = this.groupVariables.filter((v: any) => !existingCodes.has(v.code));

    newVariables.forEach((variable: any) => {
      this.experimentStudioService.addVariableAndEnrich(variable);
    });

    // Update signal if it needs to refresh manually
    this.onVariableChange([...this.selectedVariables, ...newVariables]);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupHistogramPipeline(): void {
    this.histogramRequest$
      .pipe(
        takeUntil(this.destroy$),
        switchMap(({ codes, label, bins }) => {
          const algoName = 'histogram';
          return this.experimentStudioService
            .getAlgorithmResults(algoName, codes, bins)
            .pipe(
              catchError((error) => {
                this.isLoadingHistogram.set(false);
                console.error('Error fetching histogram:', error);
                this.errorMessage.set('Error loading histogram. Please try again.');
                return of(null);
              }),
              map((response) => ({ response, label, codes }))
            );
        })
      )
      .subscribe(({ response, label, codes }) => {
        this.isLoadingHistogram.set(false);

        if (!response) return;

        const histList = response?.result?.histogram ?? response?.histogram ?? [];
        if (histList.length) {
          const variableCode = histList[0]?.variable ?? codes?.[0];
          const variableNode = variableCode ? this.findNodeByCode(this.d3Data, variableCode) : null;

          const variants = histList.map((hist: any, idx: number) => {
            const enrichedHistogram = this.mapBinsToEnumLabels(hist, variableNode?.enumerations);
            const groupingVarCode = hist?.grouping_var;
            const groupingVarNode = groupingVarCode ? this.findNodeByCode(this.d3Data, groupingVarCode) : null;
            const groupingVarLabel = groupingVarNode?.label ?? groupingVarCode;
            const groupingEnumLabel = this.mapEnumValueLabel(hist?.grouping_enum, groupingVarNode?.enumerations);

            const variantLabel = groupingVarCode
              ? `${groupingVarLabel}: ${groupingEnumLabel ?? hist?.grouping_enum ?? 'N/A'}`
              : 'Overall';

            const dataWithName = {
              ...enrichedHistogram,
              variableName: label ?? variableNode?.label ?? enrichedHistogram.variable ?? enrichedHistogram.variableName,
              variableType: variableNode?.type
            };

            return {
              key: groupingVarCode ? `${groupingVarCode}:${String(hist?.grouping_enum ?? idx)}` : 'overall',
              label: variantLabel,
              data: dataWithName,
              isOverall: !groupingVarCode,
            };
          });

          const sortedVariants = [
            ...variants.filter((v: { isOverall: boolean }) => v.isOverall),
            ...variants.filter((v: { isOverall: boolean }) => !v.isOverall),
          ].map(({ key, label: variantLabel, data }) => ({ key, label: variantLabel, data }));

          this.histogramVariants.set(sortedVariants);
          const selectedKey = sortedVariants[0]?.key ?? null;
          this.selectedHistogramVariantKey.set(selectedKey);
          this.histogramData.set(sortedVariants[0]?.data ?? null);
          this.errorMessage.set(null);
        } else {
          this.histogramVariants.set([]);
          this.selectedHistogramVariantKey.set(null);
          const resultData = response?.result?.data || response?.data;
          if (typeof resultData === 'string' && resultData.includes('insufficient data')) {
            this.errorMessage.set(resultData);
          } else {
            this.errorMessage.set('No histogram data found for this selection.');
          }
        }
      });
  }

  private queueHistogramRequest(codes: string[], label?: string, bins: number | null = null) {
    this.isLoadingHistogram.set(true);
    this.errorMessage.set(null);
    this.histogramData.set(null);
    this.histogramVariants.set([]);
    this.selectedHistogramVariantKey.set(null);
    this.histogramRequest$.next({ codes, label, bins });
  }

  onHistogramVariantChange(event: Event): void {
    const key = (event.target as HTMLSelectElement).value;
    this.selectedHistogramVariantKey.set(key);
    const variant = this.histogramVariants().find((item) => item.key === key);
    if (variant) {
      this.histogramData.set(variant.data);
    }
  }

  onBinsChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const bins = value ? parseInt(value, 10) : null;
    this.histogramBins.set(bins);

    if (this.selectedNode) {
      this.queueHistogramRequest([this.selectedNode.code], this.selectedNode.label, bins);
    }
  }

  getPathNodes(node: any): Array<{ code: string; label: string }> {
    const code = node?.code;
    if (!code) {
      const fallbackLabel = String(node?.label ?? '');
      return fallbackLabel ? [{ code: String(code ?? ''), label: fallbackLabel }] : [];
    }
    const pathNodes: Array<{ code: string; label: string }> = [];
    const found = this.collectPathNodes(this.d3Data, code, pathNodes);
    if (!found) {
      return [{ code: String(code), label: String(node?.label ?? code) }];
    }
    return pathNodes;
  }

  private collectPathNodes(
    current: any,
    code: string,
    path: Array<{ code: string; label: string }>
  ): boolean {
    if (!current) return false;
    const label = String(current?.label ?? current?.name ?? current?.code ?? '');
    const currentCode = String(current?.code ?? '');
    if (label) {
      path.push({ code: currentCode, label });
    }
    if (current?.code === code) return true;
    for (const child of current.children ?? []) {
      if (this.collectPathNodes(child, code, path)) return true;
    }
    path.pop();
    return false;
  }

  onGroupSummaryClick(node: { code: string }): void {
    if (!node?.code) return;
    const target = this.findNodeByCode(this.d3Data, node.code);
    if (!target) return;
    this.highlightNode = target;
    this.onSelectedNodeChange(target);
  }

  isExportDisabled(): boolean {
    if (this.isLoadingHistogram()) return true;
    if (this.errorMessage()) return true;
    if (!this.selectedNode) return true;
    if (this.showGroupVariableSelectionMessage()) return true;
    return !this.histogramData() && !this.groupHistogramData();
  }

  showGroupVariableSelectionMessage(): boolean {
    return !!this.groupHistogramData() && this.groupHistogramMeta()?.hasGroups === false;
  }

  showBinSelector(): boolean {
    if (!this.selectedNode || !this.selectedNode.type) return false;
    const type = String(this.selectedNode.type).toLowerCase();
    return ['real', 'integer', 'int'].includes(type);
  }

  async exportHistogramPdf(): Promise<void> {
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
        isGroupView: !!this.groupHistogramData()
      });

    } catch (err) {
      console.error('Histogram PDF export failed:', err);
    } finally {
      this.isExporting.set(false);
    }
  }

  exportHistogramCsv(): void {
    if (this.isExportDisabled()) return;

    const data = this.groupHistogramData() || this.histogramData();
    if (!data) return;

    try {
      this.csvExportService.exportHistogramCsv(
        { bins: data.bins, counts: data.counts },
        String(this.selectedNode?.label ?? data.variableName ?? 'histogram')
      );
    } catch (err) {
      console.error('Histogram CSV export failed:', err);
    }
  }

  private countLeafNodes(node: any): number {
    if (!node?.children || node.children.length === 0) {
      return 1;
    }
    return node.children.reduce((total: number, child: any) => total + this.countLeafNodes(child), 0);
  }

  /**
   * Replace histogram bin codes with enumeration labels when available.
   */
  private mapBinsToEnumLabels(hist: any, enumerations?: Array<{ code?: any; label?: string; name?: string }>) {
    if (!hist || !Array.isArray(hist.bins) || !enumerations || !enumerations.length) return hist;

    const codeToLabel = new Map(
      enumerations.map((e) => [String(e.code ?? e.label ?? ''), e.label ?? e.name ?? String(e.code ?? '')])
    );

    let mapped = 0;
    const binsWithLabels = hist.bins.map((b: any) => {
      const label = codeToLabel.get(String(b));
      if (label) {
        mapped += 1;
        return label;
      }
      return b;
    });

    if (!mapped) return hist;
    return { ...hist, bins: binsWithLabels };
  }

  private mapEnumValueLabel(value: any, enumerations?: Array<{ code?: any; label?: string; name?: string }>): string | null {
    if (value === null || value === undefined || !enumerations?.length) return null;
    const match = enumerations.find((entry) => String(entry?.code ?? entry?.label ?? entry?.name ?? '') === String(value));
    if (!match) return null;
    return String(match?.label ?? match?.name ?? value);
  }

}
