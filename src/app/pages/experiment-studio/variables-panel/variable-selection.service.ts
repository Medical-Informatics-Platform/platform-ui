import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { D3HierarchyNode, DataModel } from '../../../models/data-model.interface';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { isSameDataModel } from '../../../core/data-model.utils';
import { isVariableUnavailable } from '../../../core/variable-availability.utils';
import { ExperimentStudioGuideStateService } from '../guide/experiment-studio-guide-state.service';
import { MetadataSearchResult } from '../visualisations/metadata-browser/metadata-browser.model';
import { normalizeMetadataTree, selectionFromSearchResult } from '../visualisations/metadata-browser/metadata-browser-normalizer';
import { VariableCatalogService } from './variable-catalog.service';
import { VariableHistogramService } from './variable-histogram.service';
import { DetailsPanelTab, HighlightedNode } from './variables-panel.models';
import { collectLeafNodes, pathToNode } from './variables-panel.utils';

/**
 * The selected node of the variables panel and everything that follows from it:
 * which pathology is shown, what the details panel charts, and adding or removing
 * the selection from the experiment's variable pool. Every way of picking a node
 * (browsers, search, pool chips) goes through here.
 */
@Injectable()
export class VariableSelectionService {
  private readonly studio = inject(ExperimentStudioService);
  private readonly catalog = inject(VariableCatalogService);
  private readonly histogram = inject(VariableHistogramService);
  private readonly guideState = inject(ExperimentStudioGuideStateService);
  private readonly destroyRef = inject(DestroyRef);
  /** code:version of the pathology whose tree is shown. */
  private shownModelKey: string | null = null;

  readonly selectedNode = signal<D3HierarchyNode | null>(null);
  /** The node the browsers scroll to and outline; search picks carry their breadcrumb. */
  readonly highlightNode = signal<HighlightedNode | null>(null);
  readonly activeDetailsTab = signal<DetailsPanelTab>('histogram');
  /** Breadcrumb of the selected node for the Details tab. */
  readonly selectedPath = computed(() => pathToNode(this.catalog.hierarchy(), this.selectedNode()));
  readonly isSelectedNodeGroup = computed(() => !!this.selectedNode()?.children?.length);

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
    const selected = this.catalog.selectedVariables();
    return targets.every((item) => selected.some((variable) => variable.code === item.code));
  });
  /** The selected node offers nothing to add: every variable under it is unavailable. */
  private readonly selectedNodeOnlyUnavailable = computed(
    () => this.selectionTargets().length > 0 && this.addableTargets().length === 0
  );
  readonly poolToggleDisabled = computed(() =>
    !this.catalog.hasSelectedDatasets()
    || !this.selectedNode()
    || (this.selectedNodeOnlyUnavailable() && !this.isSelectedNodeInPool())
  );
  readonly poolToggleTitle = computed(() => {
    if (!this.catalog.hasSelectedDatasets()) return 'Select datasets first';
    if (!this.selectedNode()) return 'Select a variable or group on the map';
    if (this.selectedNodeOnlyUnavailable() && !this.isSelectedNodeInPool()) {
      return 'Not available in the selected datasets';
    }
    return this.isSelectedNodeInPool()
      ? 'Remove the selected variable from this experiment'
      : 'Add the selected variable to this experiment';
  });

  // ── Pathologies ────────────────────────────────────────────────────────────

  loadDataModels(): void {
    this.studio.getAllDataModels()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((dataModels: DataModel[]) => {
        this.catalog.setDataModels(dataModels);
        if (!dataModels.length) this.clearModelView();
      });
  }

  /**
   * Shows the tree of the selected pathology and selects its root. The same pathology
   * (code and version) is not reloaded; a studio reset (e.g. a saved experiment whose
   * pathology is gone) must not leave the old chart up.
   */
  showDataModel(model: DataModel | null): void {
    if (!model) {
      if (this.shownModelKey !== null) {
        this.shownModelKey = null;
        this.clearModelView();
      }
      return;
    }
    const key = `${model.code}:${model.version}`;
    if (this.shownModelKey === key) return;
    this.shownModelKey = key;
    this.catalog.loadHierarchy();
    const root = this.catalog.hierarchy();
    if (root) {
      this.select(root);
    }
  }

  /**
   * The user picked another pathology: the pool and datasets of the old one are cleared.
   * Returns false when `model` is the shown pathology (the selector re-announces it on open).
   */
  changeDataModel(model: DataModel | null): boolean {
    if (!model || isSameDataModel(this.catalog.selectedDataModel(), model)) return false;
    this.studio.selectedDataModel.set(model);
    this.studio.clearSelectionsForDataModelChange();
    this.histogram.clearCharts();
    this.activeDetailsTab.set('histogram');
    this.catalog.loadHierarchy();
    return true;
  }

  private clearModelView(): void {
    this.catalog.clear();
    this.selectedNode.set(null);
    this.guideState.setSelectedHierarchyNode(null);
    this.histogram.clearCharts();
    this.activeDetailsTab.set('histogram');
  }

  // ── Picking a node ─────────────────────────────────────────────────────────

  /** A click in the bubble map: selects without moving the highlight. */
  pickInMap(node: D3HierarchyNode): void {
    if (this.isUnavailable(node)) return;
    this.select(node);
  }

  /** A click in the List or Graph browser. */
  pickInBrowser(node: D3HierarchyNode): void {
    if (this.isUnavailable(node)) return;
    this.highlightNode.set(node);
    this.select(node);
  }

  /** Double click in any browser: select and add to the pool. */
  pickAndAdd(node: D3HierarchyNode): void {
    if (this.isUnavailable(node)) return;
    this.select(node);
    this.addSelectionToPool();
  }

  /**
   * A search result: resolved against the shown tree. Returns false when it cannot be
   * selected (no tree, or the variable is unavailable), so the search stays open.
   */
  pickSearchResult(result: MetadataSearchResult): boolean {
    const root = this.catalog.hierarchy();
    if (!root) {
      console.warn('[Search] No data model loaded');
      return false;
    }
    const node = selectionFromSearchResult(normalizeMetadataTree(root), result).originalNode;
    if (this.isUnavailable(node)) return false;
    this.highlightNode.set({ ...node, path: result.path });
    this.select(node);
    return true;
  }

  /** A chip in the experiment's variable pool. */
  pickPoolVariable(variable: D3HierarchyNode): void {
    if (!variable?.code) {
      console.warn('Invalid variable clicked:', variable);
      return;
    }
    this.highlightNode.set(variable);
    this.select(variable);
  }

  /** Selects a node (null clears the selection); a repeat pick of the selected node is ignored. */
  select(node: D3HierarchyNode | null): void {
    if (!node) {
      this.selectedNode.set(null);
      this.guideState.setSelectedHierarchyNode(null);
      this.histogram.showNothingSelected();
      this.activeDetailsTab.set('histogram');
      return;
    }
    const current = this.selectedNode();
    if (current?.code === node.code && current?.label === node.label) {
      return;
    }
    const selected = { ...node };
    this.selectedNode.set(selected);
    this.activeDetailsTab.set('histogram');
    this.guideState.setSelectedHierarchyNode(selected);
    this.histogram.show(node);
  }

  // ── Variable pool ──────────────────────────────────────────────────────────

  /** The Add / Remove button: adds the addable targets, or removes them all once pooled. */
  togglePool(): void {
    if (this.poolToggleDisabled() || !this.selectionTargets().length) {
      return;
    }
    if (this.isSelectedNodeInPool()) {
      const removeCodes = new Set(this.selectionTargets().map((item) => item.code));
      this.studio.setVariables(this.catalog.selectedVariables().filter((variable) => !removeCodes.has(variable.code)));
      return;
    }
    this.addSelectionToPool();
  }

  private addSelectionToPool(): void {
    if (!this.catalog.hasSelectedDatasets() || !this.selectedNode()) {
      return;
    }
    this.addableTargets().forEach((item) => this.studio.addVariableAndEnrich(item));
  }

  private isUnavailable(node: D3HierarchyNode | null | undefined): boolean {
    return isVariableUnavailable(this.catalog.unavailableVariables(), node);
  }
}
