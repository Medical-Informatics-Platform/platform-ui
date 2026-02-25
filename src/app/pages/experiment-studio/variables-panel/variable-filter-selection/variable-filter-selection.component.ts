import { Component, Input, Output, EventEmitter, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { CdkDragDrop, DragDropModule, transferArrayItem } from '@angular/cdk/drag-drop'
import { D3HierarchyNode } from '../../../../models/data-model.interface';


@Component({
  selector: 'app-variable-filter-selection',
  templateUrl: './variable-filter-selection.component.html',
  styleUrls: ['./variable-filter-selection.component.css'],
  imports: [CommonModule, DragDropModule]
})
export class VariableFilterSelectionComponent implements OnInit {
  @Input() selectedNode: any; // Selected node from the bubble chart
  @Input() groupVariables: any[] = [];
  @Output() filtersChange = new EventEmitter<any[]>();
  @Output() variableClicked = new EventEmitter<any>();

  filterLogic: any;
  variables: any[] = [];
  covariates: any[] = [];
  filters: any[] = [];

  constructor(private expStudioService: ExperimentStudioService) {
    effect(() => {
      // todo: check and remove if not bugs appear
      // activates availableGroupedAlgorithms to recalculate available algorithms
      this.expStudioService.availableGroupedAlgorithms();
    });

    effect(() => {
      this.variables = this.expStudioService.selectedVariables();
    });

    effect(() => {
      this.covariates = this.expStudioService.selectedCovariates();
    });

    effect(() => {
      this.filters = this.expStudioService.selectedFilters();
    });
  }

  ngOnInit(): void {

  }

  onVariableClick(node: D3HierarchyNode): void {
    this.variableClicked.emit(node);
  }


  private getLeafNodes(node: any): any[] {
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

  get hasSelectedDatasets(): boolean {
    return (this.expStudioService.selectedDatasets() || []).length > 0;
  }

  addItem(listName: 'variables' | 'covariates' | 'filters'): void {
    const datasets = this.expStudioService.selectedDatasets();
    if (!datasets || datasets.length === 0) {
      return;
    }
    if (!this.selectedNode) return;

    // Select all leaves from selected node
    let itemsToAdd = this.selectedNode.children ? this.getLeafNodes(this.selectedNode) : [this.selectedNode];

    // Safety: don't add hundreds of filters at once if a group is selected by mistake
    if (listName === 'filters' && itemsToAdd.length > 5) {
      console.warn(`[VariableFilterSelection] Blocking bulk filter addition (${itemsToAdd.length} items). Please select individual variables.`);
      return;
    }

    const list = this[listName];
    const updated = [
      ...list,
      ...itemsToAdd.filter(item => !list.some(existing => existing.code === item.code))
    ];

    this[listName] = updated;

    if (listName === 'variables') {
      itemsToAdd.forEach(item => this.expStudioService.addVariableAndEnrich(item));
    } else {
      this.updateService(listName, updated);
    }
  }

  drop(event: CdkDragDrop<any[]>, listName: 'variables' | 'covariates' | 'filters') {
    if (event.previousContainer === event.container) return;

    const item = event.previousContainer.data[event.previousIndex];
    const targetList = event.container.data;
    if (targetList.some(v => v.code === item.code)) {
      return;
    }

    transferArrayItem(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex
    );

    // Sync all lists after move so availability recalculates correctly
    this.variables = [...this.variables];
    this.covariates = [...this.covariates];
    this.filters = [...this.filters];
    this.expStudioService.setVariables(this.variables);
    this.expStudioService.setCovariates(this.covariates);
    this.expStudioService.setFilters(this.filters);
  }

  addVariable(): void {
    this.addItem('variables');
  }

  addCovariate(): void {
    this.addItem('covariates');
  }

  addFilter(): void {
    this.addItem('filters');
  }

  isNodeSelectedAndNotInList(listName: 'variables' | 'covariates' | 'filters'): boolean {
    if (!this.selectedNode || this.selectedNode.children) return false;
    const list = this[listName];
    return !list.some(item => item.code === this.selectedNode.code);
  }

  removeItem(item: any, listName: string): void {
    switch (listName) {
      case 'variables':
        this.variables = this.variables.filter((v) => v.label !== item.label);
        this.updateService('variables', [...this.variables]);
        break;
      case 'covariates':
        this.covariates = this.covariates.filter((c) => c.label !== item.label);
        this.updateService('covariates', [...this.covariates]);
        break;
      case 'filters':
        this.filters = this.filters.filter((f) => f.label !== item.label);
        this.updateFilters([...this.filters]);
        this.updateService('filters', [...this.filters]);
        break;
      default:
        throw new Error(`Invalid listName: ${listName}`);
    }
  }

  clearList(listName: string): void {
    switch (listName) {
      case 'variables':
        this.variables = [];
        this.updateService('variables', []);
        break;
      case 'covariates':
        this.covariates = [];
        this.updateService('covariates', []);
        break;
      case 'filters':
        this.filters = [];
        this.updateService('filters', []);
        break;
      default:
        throw new Error(`Invalid listName: ${listName}`);
    }
  }

  openFilterConfig(): void {
    this.expStudioService.toggleFilterConfigModal(true);
  }


  // Check for redundant code
  updateFilters(updatedFilters: any[]): void {
    this.filters = updatedFilters;
    this.updateService('filters', updatedFilters);
  }

  onFiltersChange(updatedFilters: any[]): void {
    if (Array.isArray(updatedFilters)) {
      this.filters = [...updatedFilters];
      this.filtersChange.emit(this.filters); // this emits an event if a filter exists
      this.updateService('filters', this.filters);
    }
  }

  onModalClose(): void {
    this.expStudioService.toggleFilterConfigModal(false);
  }

  // Helper service for VariabeHandlingService
  updateService(listName: string, updatedList: any[]): void {
    switch (listName) {
      case 'variables':
        this.expStudioService.setVariables(updatedList);
        break;
      case 'covariates':
        this.expStudioService.setCovariates(updatedList);
        break;
      case 'filters':
        this.expStudioService.setFilters(updatedList);
        break;
    }
  }
}
