import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ElementRef } from '@angular/core';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';

@Component({
  selector: 'app-dataset-selector',
  templateUrl: './dataset-selector.component.html',
  styleUrls: ['./dataset-selector.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onOutsideClick($event)',
  },
})
export class DatasetSelectorComponent implements OnChanges {
  @Input() datasets: { code: string; label: string }[] = [];
  @Input() selectedDatasetCodes: string[] = [];
  @Input() autoSelectAll = true;
  @Output() selectedDatasetsChange = new EventEmitter<string[]>();
  isDropdownOpen = false;


  constructor(private elementRef: ElementRef, private expStudioService: ExperimentStudioService) { }


  selectedDatasets = new Set<string>(); // Store selected datasets
  private hasInitializedDatasets = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.datasets?.length) {
      this.selectedDatasets = new Set();
      return;
    }

    if (changes['selectedDatasetCodes'] && !changes['datasets']) {
      this.syncFromInputSelection();
      return;
    }

    if (changes['datasets'] || changes['autoSelectAll']) {
      this.syncForDatasetOptionsChange();
    }
  }

  onDatasetSelectionChange(event: Event): void {
    const selectedOptions = (event.target as HTMLSelectElement).selectedOptions;
    this.selectedDatasets = new Set(
      Array.from(selectedOptions).map((option) => option.value)
    );
    this.emitSelectedDatasets();
  }
  toggleDataset(datasetCode: string): void {
    // Add or remove dataset based on selection
    if (this.selectedDatasets.has(datasetCode)) {
      this.selectedDatasets.delete(datasetCode);
    } else {
      this.selectedDatasets.add(datasetCode);
    }
    this.emitSelectedDatasets();
  }

  isDatasetSelected(datasetCode: string): boolean {
    return this.selectedDatasets.has(datasetCode);
  }

  emitSelectedDatasets(): void {
    const selected = Array.from(this.selectedDatasets);
    this.selectedDatasetsChange.emit(selected);

    // Notify the global service
    this.expStudioService.setSelectedDatasets(selected);
  }

  private preselectAllDatasets(): void {
    this.selectedDatasets = new Set(this.datasets.map((dataset) => dataset.code));
    this.emitSelectedDatasets(); // Emit the preselected datasets
  }

  private syncFromInputSelection(): void {
    const currentCodes = new Set(this.datasets.map(d => d.code));
    this.selectedDatasets = new Set(
      (this.selectedDatasetCodes ?? []).filter(code => currentCodes.has(code))
    );
  }

  private syncForDatasetOptionsChange(): void {
    const currentCodes = new Set(this.datasets.map(d => d.code));
    const requested = (this.selectedDatasetCodes ?? []).filter(code => currentCodes.has(code));

    if (requested.length > 0 || !this.autoSelectAll) {
      this.selectedDatasets = new Set(requested);
      this.hasInitializedDatasets = true;
      return;
    }

    const retained = [...this.selectedDatasets].filter(code => currentCodes.has(code));
    if (retained.length > 0) {
      this.selectedDatasets = new Set(retained);
      this.emitSelectedDatasets();
      this.hasInitializedDatasets = true;
      return;
    }

    this.hasInitializedDatasets = true;
    this.preselectAllDatasets();
  }

  toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  onOutsideClick(event: Event): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isDropdownOpen = false;
    }
  }

}
