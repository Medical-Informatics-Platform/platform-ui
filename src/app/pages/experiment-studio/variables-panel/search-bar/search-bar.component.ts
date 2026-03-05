import { Component, EventEmitter, Input, Output, OnInit, ElementRef, SimpleChanges, OnChanges, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from "@angular/forms";

@Component({
  selector: 'app-search-bar',
  templateUrl: './search-bar.component.html',
  imports: [
    FormsModule,
  ],
  styleUrls: ['./search-bar.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onOutsideClick($event)',
  }
})
export class SearchBarComponent implements OnInit, OnChanges {
  private eRef = inject(ElementRef);

  @Input() dataModelHierarchy: any;
  @Output() searchResultSelected = new EventEmitter<string>();

  searchQuery: string = '';
  variables: { label: string; code: string; type: string; path: string }[] = [];
  groups: { label: string; code: string; path: string }[] = [];
  filteredItems: any[] = [];
  searchSuggestionsVisible = false;
  isSearchExpanded = false;
  filterType: string = 'variables'; // Default filter type
  variableTypeFilter: string = ''; // Additional variable type filter
  variableTypes: string[] = []; // List of available variable types

  constructor() { }

  ngOnInit(): void {
    if (this.dataModelHierarchy) {
      this.extractVariablesAndGroups(this.dataModelHierarchy);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['dataModelHierarchy']?.currentValue) {

      // Ensure variables and groups are cleared before reloading
      this.variables = [];
      this.groups = [];
      this.variableTypes = [];

      // Extract variables and groups
      this.extractVariablesAndGroups(this.dataModelHierarchy);

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
    const re = new RegExp(`(${this.searchQuery})`, 'gi');
    return name.replace(re, '<mark>$1</mark>');
  }

  onOutsideClick(event: Event): void {
    if (!this.eRef.nativeElement.contains(event.target)) {
      this.closeSearch();
    }
  }

  // Handles the search query input.
  extractVariablesAndGroups(hierarchy: any): void {
    this.variables = [];
    this.groups = [];
    this.variableTypes = [];

    const traverse = (node: any, path: string) => {
      if (!node) return;
      const currentPath = path ? `${path} > ${node.label}` : node.label;

      // GROUP
      if (Array.isArray(node.children) && node.children.length > 0) {
        this.groups.push({
          label: node.label,
          code: node.code ?? node.label, // fallback safe
          path: currentPath
        });
        node.children.forEach((child: any) => traverse(child, currentPath));
        return;
      }

      // LEAF (variable)
      if (typeof node.type === 'string' || Array.isArray(node.type)) {
        this.variables.push({
          label: node.label,
          code: node.code ?? node.label, // fallback safe
          type: node.type as string,
          path: currentPath
        });

        const t = node.type as string;
        if (!this.variableTypes.includes(t)) this.variableTypes.push(t);
      }
    };

    traverse(hierarchy, '');
  }

  handleSearch(query: string): void {
    this.searchQuery = query.toLowerCase();
    this.applyFilter(this.filterType);
    this.searchSuggestionsVisible = this.filteredItems.length > 0;
  }

  // Applies the filter for either variables or groups.
  applyFilter(type: string): void {
    if (type === 'variables') {
      this.filteredItems = this.variables.filter(
        (v) =>
          v.label.toLowerCase().includes(this.searchQuery) &&
          (this.variableTypeFilter ? v.type === this.variableTypeFilter : true)
      );
    } else if (type === 'groups') {
      this.filteredItems = this.groups.filter((g) =>
        g.label.toLowerCase().includes(this.searchQuery)
      );
    }
  }

  // Applies the variable type filter.
  applyVariableTypeFilter(type: string): void {
    this.variableTypeFilter = type;
    this.applyFilter(this.filterType);
  }

  onItemClick(item: any): void {
    this.searchQuery = item.label || item;
    this.searchSuggestionsVisible = false;

    const code = item.code ?? item.label ?? item;
    this.searchResultSelected.emit(code);
  }

  //  Generates tooltip text for search results.
  generateTooltip(item: any): string {
    const parent = item.path.split(' > ').slice(-2, -1)[0] || 'Root';
    return `Group: ${parent}\nPath: ${item.path}\nType: ${item.type}`;
  }

  // Handles focus event on the search bar.
  onSearchFocus(): void {
    this.searchSuggestionsVisible = true;
    this.handleSearch(this.searchQuery);
  }
}
