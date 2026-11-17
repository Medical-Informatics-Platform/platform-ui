import { ChangeDetectionStrategy, Component, OnDestroy, output, input } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { CommonModule } from "@angular/common";
import { AnalysisDatePreset, AnalysisFilters, } from "./analysis-filter.model";

@Component({
    selector: 'app-analysis-search',
    imports: [CommonModule, FormsModule],
    templateUrl: './analysis-search.component.html',
    styleUrl: './analysis-search.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisSearchComponent implements OnDestroy {
  readonly filters = input.required<AnalysisFilters>();
  readonly filtersChange = output<Partial<AnalysisFilters>>();

  private t: ReturnType<typeof setTimeout> | null = null;

  onQueryInput(value: string) {
    if (this.t) clearTimeout(this.t);

    this.t = setTimeout(() => {
      this.filtersChange.emit({ query: value });
    }, 150);
  }

  onDatePresetChange(value: AnalysisDatePreset) {
    this.filtersChange.emit({ datePreset: value });
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
