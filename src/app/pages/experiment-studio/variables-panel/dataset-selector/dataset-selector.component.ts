import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, HostListener, ElementRef } from '@angular/core';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';

@Component({
  selector: 'app-dataset-selector',
  standalone: true,
  templateUrl: './dataset-selector.component.html',
  styleUrls: ['./dataset-selector.component.css'],
})
export class DatasetSelectorComponent implements OnChanges {
  @Input() datasets: { code: string; label: string }[] = [];
  @Output() selectedDatasetsChange = new EventEmitter<string[]>();
  isDropdownOpen = false;


  constructor(private elementRef: ElementRef, private expStudioService: ExperimentStudioService) { }


  selectedDatasets = new Set<string>(); // Store selected datasets

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['datasets'] && this.datasets?.length > 0) {
      const prevSelection = new Set(this.selectedDatasets);
      const currentCodes = this.datasets.map(d => d.code);

      // keep only valid selections that still exist
      this.selectedDatasets = new Set(
        [...prevSelection].filter(code => currentCodes.includes(code))
      );

      // if none left, preselect all (initial mount case)
      if (this.selectedDatasets.size === 0) {
        this.preselectAllDatasets();
      } else {
        this.emitSelectedDatasets();
      }
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

  toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  @HostListener('document:click', ['$event'])
  onOutsideClick(event: Event): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isDropdownOpen = false;
    }
  }

}
