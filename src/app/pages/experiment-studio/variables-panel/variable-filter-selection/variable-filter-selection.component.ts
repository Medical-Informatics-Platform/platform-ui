import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { CdkDragDrop, DragDropModule, transferArrayItem } from '@angular/cdk/drag-drop'
import { D3HierarchyNode } from '../../../../models/data-model.interface';


@Component({
  selector: 'app-variable-filter-selection',
  templateUrl: './variable-filter-selection.component.html',
  styleUrls: ['./variable-filter-selection.component.css'],
  imports: [CommonModule, DragDropModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VariableFilterSelectionComponent {
  @Input() selectedNode: any; // Selected node from the bubble chart
  @Input() groupVariables: any[] = [];
  @Output() variableClicked = new EventEmitter<any>();

  readonly variables = computed(() => this.expStudioService.selectedVariables());
  readonly covariates = computed(() => this.expStudioService.selectedCovariates());

  constructor(private expStudioService: ExperimentStudioService) {
    effect(() => {
      // todo: check and remove if not bugs appear
      // activates availableGroupedAlgorithms to recalculate available algorithms
      this.expStudioService.availableGroupedAlgorithms();
    });
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

  addItem(listName: 'variables' | 'covariates'): void {
    const datasets = this.expStudioService.selectedDatasets();
    if (!datasets || datasets.length === 0) {
      return;
    }
    if (!this.selectedNode) return;

    // Select all leaves from selected node
    let itemsToAdd = this.selectedNode.children ? this.getLeafNodes(this.selectedNode) : [this.selectedNode];

    const list = this.getListByName(listName);
    const updated = [
      ...list,
      ...itemsToAdd.filter(item => !list.some(existing => existing.code === item.code))
    ];

    if (listName === 'variables') {
      itemsToAdd.forEach(item => this.expStudioService.addVariableAndEnrich(item));
    } else {
      this.updateService(listName, updated);
    }
  }

  drop(event: CdkDragDrop<any[]>, listName: 'variables' | 'covariates') {
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
    this.expStudioService.setVariables([...this.variables()]);
    this.expStudioService.setCovariates([...this.covariates()]);
  }

  addVariable(): void {
    this.addItem('variables');
  }

  addCovariate(): void {
    this.addItem('covariates');
  }

  isNodeSelectedAndNotInList(listName: 'variables' | 'covariates'): boolean {
    if (!this.selectedNode || this.selectedNode.children) return false;
    const list = this.getListByName(listName);
    return !list.some(item => item.code === this.selectedNode.code);
  }

  removeItem(item: any, listName: string): void {
    switch (listName) {
      case 'variables':
        this.updateService('variables', this.variables().filter((v) => v.label !== item.label));
        break;
      case 'covariates':
        this.updateService('covariates', this.covariates().filter((c) => c.label !== item.label));
        break;
      default:
        throw new Error(`Invalid listName: ${listName}`);
    }
  }

  clearList(listName: string): void {
    switch (listName) {
      case 'variables':
        this.updateService('variables', []);
        break;
      case 'covariates':
        this.updateService('covariates', []);
        break;
      default:
        throw new Error(`Invalid listName: ${listName}`);
    }
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
    }
  }

  private getListByName(listName: 'variables' | 'covariates'): any[] {
    switch (listName) {
      case 'variables':
        return this.variables();
      case 'covariates':
        return this.covariates();
      default:
        return [];
    }
  }
}
