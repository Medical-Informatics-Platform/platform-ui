import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { DataModel } from '../../../../models/data-model.interface';
import { BubbleChartComponent } from '../../visualisations/bubble-chart/bubble-chart.component';
import { OntologyTreeBrowserComponent } from '../../visualisations/metadata-browser/ontology-tree-browser/ontology-tree-browser.component';
import { CollapsibleTreeBrowserComponent } from '../../visualisations/metadata-browser/collapsible-tree-browser/collapsible-tree-browser.component';
import { MetadataBrowserMode, MetadataSearchResult } from '../../visualisations/metadata-browser/metadata-browser.model';
import { DataModelSelectorComponent } from '../data-model-selector/data-model-selector.component';
import { DatasetSelectorComponent } from '../dataset-selector/dataset-selector.component';
import { SearchBarComponent } from '../search-bar/search-bar.component';
import { VariableCatalogService } from '../variable-catalog.service';
import { VariableSelectionService } from '../variable-selection.service';
import { MetadataBrowserModeOption } from '../variables-panel.models';
import { studyContextTitle } from '../variables-panel.utils';

/** localStorage key of the last Map / List / Graph choice. */
const METADATA_BROWSER_MODE_STORAGE_KEY = 'metadata_browser_mode';

const METADATA_BROWSER_MODES: readonly MetadataBrowserModeOption[] = [
  { value: 'bubble', label: 'Map', icon: 'fas fa-circle-nodes', title: 'Bubble overview of the metadata structure' },
  { value: 'ontology', label: 'List', icon: 'fas fa-sitemap', title: 'Expandable hierarchy list of groups and variables' },
  { value: 'collapsible', label: 'Graph', icon: 'fas fa-project-diagram', title: 'Interactive collapsible hierarchy diagram' },
];

/**
 * The left card of the variables step: the study-context chip (pathology and datasets),
 * the Map / List / Graph switcher, variable search, and the browser itself. Attached to
 * the card's <section>, so the DOM, ids and data-guide anchors stay where they were.
 */
@Component({
  selector: 'section[app-model-browser]',
  templateUrl: './model-browser.component.html',
  styleUrl: './model-browser.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
  imports: [
    BubbleChartComponent,
    OntologyTreeBrowserComponent,
    CollapsibleTreeBrowserComponent,
    DataModelSelectorComponent,
    DatasetSelectorComponent,
    SearchBarComponent,
  ],
})
export class ModelBrowserComponent {
  protected readonly catalog = inject(VariableCatalogService);
  protected readonly selection = inject(VariableSelectionService);

  private readonly searchSection = viewChild<ElementRef<HTMLElement>>('searchSection');
  private readonly contextSection = viewChild<ElementRef<HTMLElement>>('contextSection');

  readonly metadataBrowserModes = METADATA_BROWSER_MODES;
  readonly contextOpen = signal(false);
  readonly searchExpanded = signal(false);
  readonly metadataBrowserMode = signal<MetadataBrowserMode>(loadMetadataBrowserMode());
  readonly metadataBrowserModeIndex = computed(() => {
    const index = this.metadataBrowserModes.findIndex((mode) => mode.value === this.metadataBrowserMode());
    return index >= 0 ? index : 0;
  });
  readonly studyContextTitle = computed(() =>
    studyContextTitle(this.catalog.selectedDataModel()?.label, this.catalog.selectedDatasetCount())
  );

  onDataModelChange(model: DataModel | null): void {
    if (this.selection.changeDataModel(model)) {
      this.searchExpanded.set(false);
    }
  }

  onSearchSelected(result: MetadataSearchResult): void {
    if (this.selection.pickSearchResult(result)) {
      this.searchExpanded.set(false);
    }
  }

  setMetadataBrowserMode(mode: MetadataBrowserMode): void {
    this.metadataBrowserMode.set(mode);
    try {
      localStorage.setItem(METADATA_BROWSER_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore private-mode or quota failures; the UI can still use the in-memory signal.
    }
  }

  toggleContext(): void {
    this.contextOpen.update((open) => !open);
  }

  toggleSearch(): void {
    const opening = !this.searchExpanded();
    this.searchExpanded.set(opening);
    if (opening) {
      setTimeout(() => this.searchSection()?.nativeElement.querySelector('input')?.focus(), 0);
    }
  }

  /** A click outside a toolbar popover closes it. */
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node;
    const contextSection = this.contextSection()?.nativeElement;
    if (this.contextOpen() && contextSection && !contextSection.contains(target)) {
      this.contextOpen.set(false);
    }
    const searchSection = this.searchSection()?.nativeElement;
    if (this.searchExpanded() && searchSection && !searchSection.contains(target)) {
      this.searchExpanded.set(false);
    }
  }

  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.contextOpen.set(false);
      this.searchExpanded.set(false);
    }
  }
}

function loadMetadataBrowserMode(): MetadataBrowserMode {
  try {
    const saved = localStorage.getItem(METADATA_BROWSER_MODE_STORAGE_KEY);
    if (saved === 'ontology' || saved === 'collapsible' || saved === 'bubble') {
      return saved;
    }
  } catch {
    // Fall through to the Map default.
  }
  return 'bubble';
}
