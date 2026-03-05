import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnDestroy, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { CommonModule } from "@angular/common";
import { ExperimentDatePreset, ExperimentFilters, } from "./experiment-filter.model";

@Component({
    selector: 'app-experiment-search',
    imports: [CommonModule, FormsModule],
    templateUrl: './experiment-search.component.html',
    styleUrls: ['./experiment-search.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExperimentSearchComponent implements OnDestroy {
  @Input({ required: true }) filters!: ExperimentFilters;
  @Output() filtersChange = new EventEmitter<Partial<ExperimentFilters>>();

  private t: ReturnType<typeof setTimeout> | null = null;

  onQueryInput(value: string) {
    if (this.t) clearTimeout(this.t);

    this.t = setTimeout(() => {
      this.filtersChange.emit({ query: value });
    }, 150);
  }

  onDatePresetChange(value: ExperimentDatePreset) {
    this.filtersChange.emit({ datePreset: value });
  }

  onAlgorithmInput(value: string) {
    const v = value.trim();
    this.filtersChange.emit({ algorithm: v ? v : null });
  }

  onAuthorInput(value: string) {
    const v = value.trim();
    this.filtersChange.emit({ author: v ? v : null });
  }

  onClear() {
    this.filtersChange.emit({
      query: '',
      datePreset: 'any',
      algorithm: null,
      author: null,
      variable: null,
      status: 'any',
      shared: 'any',
    });
  }

  ngOnDestroy(): void {
    if (this.t) {
      clearTimeout(this.t);
      this.t = null;
    }
  }

}
