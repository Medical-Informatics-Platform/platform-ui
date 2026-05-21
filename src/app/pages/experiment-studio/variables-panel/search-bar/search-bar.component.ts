import {
  Component,
  ElementRef,
  SimpleChanges,
  OnChanges,
  inject,
  ChangeDetectionStrategy,
  output,
  input,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MetadataSearchResult,
  NormalizedMetadataIndex,
} from '../../visualisations/metadata-browser/metadata-browser.model';
import {
  normalizeMetadataTree,
  searchMetadataIndex,
} from '../../visualisations/metadata-browser/metadata-browser-normalizer';

@Component({
  selector: 'app-search-bar',
  templateUrl: './search-bar.component.html',
  imports: [FormsModule],
  styleUrl: './search-bar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onOutsideClick($event)',
  },
})
export class SearchBarComponent implements OnChanges {
  private eRef = inject(ElementRef);

  readonly dataModelHierarchy = input<any>();
  readonly searchResultSelected = output<MetadataSearchResult>();

  searchQuery = '';
  filteredItems: MetadataSearchResult[] = [];
  searchSuggestionsVisible = false;
  isSearchExpanded = false;
  filterType: 'variables' | 'groups' = 'variables';
  variableTypeFilter = '';
  variableTypes: string[] = [];

  private metadataIndex: NormalizedMetadataIndex | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['dataModelHierarchy']?.currentValue) {
      this.rebuildIndex(this.dataModelHierarchy());
    }
  }

  expandSearch(event: MouseEvent): void {
    event.stopPropagation();
    this.isSearchExpanded = true;
  }

  closeSearch(): void {
    this.isSearchExpanded = false;
    this.searchQuery = '';
    this.searchSuggestionsVisible = false;
  }

  highlight(name: string): string {
    if (!this.searchQuery) return name;
    const re = new RegExp(`(${this.escapeRegExp(this.searchQuery)})`, 'gi');
    return name.replace(re, '<mark>$1</mark>');
  }

  onOutsideClick(event: Event): void {
    if (!this.eRef.nativeElement.contains(event.target)) {
      this.closeSearch();
    }
  }

  handleSearch(query: string): void {
    this.searchQuery = query;
    this.applyFilter(this.filterType);
  }

  applyFilter(type: 'variables' | 'groups'): void {
    this.filterType = type;
    const index = this.metadataIndex;
    if (!index) {
      this.filteredItems = [];
      return;
    }

    const results = searchMetadataIndex(index, this.searchQuery);
    this.filteredItems = results.filter((result) => {
      if (type === 'groups') {
        return result.kind === 'group';
      }
      if (result.kind !== 'variable') {
        return false;
      }
      if (!this.variableTypeFilter) {
        return true;
      }
      return index.variablesById[result.id]?.type === this.variableTypeFilter;
    });
  }

  applyVariableTypeFilter(type: string): void {
    this.variableTypeFilter = type;
    this.applyFilter(this.filterType);
  }

  onItemClick(item: MetadataSearchResult): void {
    this.searchQuery = item.label;
    this.searchSuggestionsVisible = false;
    this.searchResultSelected.emit(item);
  }

  parentGroupLabel(item: MetadataSearchResult): string {
    if (!item.pathLabels.length) {
      return 'Root';
    }
    if (item.pathLabels.length < 2) {
      return item.pathLabels[0];
    }
    return item.pathLabels[item.pathLabels.length - 2];
  }

  variableType(item: MetadataSearchResult): string {
    return this.metadataIndex?.variablesById[item.id]?.type ?? '';
  }

  generateTooltip(item: MetadataSearchResult): string {
    if (item.kind === 'group') {
      return `Group: ${item.label}\nPath: ${item.path}`;
    }
    const variable = this.metadataIndex?.variablesById[item.id];
    return `Variable: ${item.label}\nPath: ${item.path}\nType: ${variable?.type ?? 'unknown'}`;
  }

  onSearchFocus(): void {
    this.searchSuggestionsVisible = true;
    this.handleSearch(this.searchQuery);
  }

  private rebuildIndex(hierarchy: any): void {
    if (!hierarchy) {
      this.metadataIndex = null;
      this.variableTypes = [];
      this.filteredItems = [];
      return;
    }

    this.metadataIndex = normalizeMetadataTree(hierarchy);
    this.variableTypes = [
      ...new Set(
        this.metadataIndex.variableIds
          .map((id) => this.metadataIndex!.variablesById[id]?.type)
          .filter((type): type is string => !!type)
      ),
    ].sort((a, b) => a.localeCompare(b));
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
