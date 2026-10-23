import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  QueryList,
  ViewChild,
  ViewChildren,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { pluralize } from '../../../../../core/result-label.utils';
import { D3HierarchyNode } from '../../../../../models/data-model.interface';
import {
  EMPTY_UNAVAILABLE_VARIABLES,
  UnavailableVariablesMap,
  unavailableTooltipFor,
} from '../../../../../core/variable-availability.utils';
import {
  NormalizedGroupNode,
  NormalizedVariableNode,
} from '../metadata-browser.model';
import {
  findGroupByNode,
  findVariableByNode,
  foldPath,
  normalizeMetadataTree,
  pathForGroup,
} from '../metadata-browser-normalizer';

interface TreeRow {
  group: NormalizedGroupNode;
  depth: number;
  expanded: boolean;
  selected: boolean;
  /** An ancestor of the selected group. */
  onPath: boolean;
  hasChildren: boolean;
}

/** Indent per tree level, in px; the row's guide lines use the same step. */
const TREE_INDENT = 14;

const EMPTY_METADATA_TREE: D3HierarchyNode = {
  label: 'Metadata',
  code: 'metadata',
  children: [],
};

@Component({
  selector: 'app-ontology-tree-browser',
  templateUrl: './ontology-tree-browser.component.html',
  styleUrl: './ontology-tree-browser.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OntologyTreeBrowserComponent {
  readonly data = input<D3HierarchyNode | null>(null);
  readonly highlightNode = input<D3HierarchyNode | null>(null);
  readonly poolVariables = input<D3HierarchyNode[]>([]);
  /** Variables shown grayed out that ignore clicks for the current datasets. */
  readonly unavailableVariables = input<UnavailableVariablesMap>(EMPTY_UNAVAILABLE_VARIABLES);
  readonly selectedNodeChange = output<D3HierarchyNode>();
  readonly nodeDoubleClicked = output<D3HierarchyNode>();
  readonly variablePoolToggle = output<D3HierarchyNode>();

  @ViewChildren('treeRowButton') private treeRowButtons?: QueryList<ElementRef<HTMLButtonElement>>;
  @ViewChild('treePane') private treePane?: ElementRef<HTMLElement>;
  private readonly injector = inject(Injector);

  readonly selectedGroupId = signal<string | null>(null);
  readonly selectedVariableId = signal<string | null>(null);
  readonly expandedGroupIds = signal<ReadonlySet<string>>(new Set<string>());
  readonly activeTreeIndex = signal(0);

  readonly index = computed(() => normalizeMetadataTree(this.data() ?? EMPTY_METADATA_TREE));
  readonly selectedGroup = computed(() => {
    const index = this.index();
    const groupId = this.selectedGroupId() ?? index.rootId;
    return index.groupsById[groupId] ?? index.groupsById[index.rootId];
  });
  /**
   * Middle-pane heading. Uses the selected group's own name, but when the
   * selected group is the tree root (the pathology/data-model root) it shows a
   * neutral "Contents" so the pathology name is not re-headed a third time
   * (it already appears in the context chip and the tree root).
   */
  readonly contentsPaneTitle = computed(() => {
    const index = this.index();
    return this.selectedGroup().id === index.rootId ? 'Contents' : this.selectedGroup().label;
  });
  /** Groups above the selected one, root first. */
  readonly selectedAncestors = computed(() =>
    pathForGroup(this.index(), this.selectedGroup().id).slice(0, -1));
  readonly showFullPath = signal(false);
  readonly ancestorCrumbs = computed(() => foldPath(this.selectedAncestors(), 2, this.showFullPath()));
  readonly foldedAncestorsTitle = computed(() => this.ancestorCrumbs().folded.map((group) => group.label).join(' › '));
  readonly selectedChildGroups = computed(() => {
    const index = this.index();
    return this.selectedGroup().childGroupIds.map((id) => index.groupsById[id]);
  });
  readonly selectedVariables = computed(() => {
    const index = this.index();
    return this.selectedGroup().variableIds.map((id) => index.variablesById[id]);
  });
  readonly visibleTreeRows = computed<TreeRow[]>(() => {
    const index = this.index();
    const expanded = this.expandedGroupIds();
    const selectedGroupId = this.selectedGroup().id;
    const ancestorIds = new Set(this.selectedAncestors().map((group) => group.id));
    const rows: TreeRow[] = [];
    const visit = (group: NormalizedGroupNode, depth: number): void => {
      const hasChildren = group.childGroupIds.length > 0;
      const isExpanded = expanded.has(group.id);
      rows.push({
        group,
        depth,
        expanded: isExpanded,
        selected: group.id === selectedGroupId,
        onPath: ancestorIds.has(group.id),
        hasChildren,
      });

      if (!isExpanded) return;
      group.childGroupIds.forEach((id) => visit(index.groupsById[id], depth + 1));
    };

    visit(index.groupsById[index.rootId], 0);
    return rows;
  });
  readonly contentsPaneSubtitle = computed(() => {
    const group = this.selectedGroup();
    return `${this.pluralize(group.directGroupCount, 'group')} · ${this.pluralize(group.totalVariableCount, 'variable')}`;
  });

  readonly pluralize = pluralize;

  constructor() {
    effect(() => {
      const index = this.index();
      if (!this.selectedGroupId() || !index.groupsById[this.selectedGroupId() ?? '']) {
        this.selectedGroupId.set(index.rootId);
        this.selectedVariableId.set(null);
      }
      if (!this.expandedGroupIds().has(index.rootId)) {
        this.expandedGroupIds.update((current) => new Set([...current, index.rootId]));
      }
    });

    effect(() => {
      const node = this.highlightNode();
      if (node) {
        this.applyExternalSelection(node);
      }
    });
  }

  selectGroup(group: NormalizedGroupNode): void {
    this.showFullPath.set(false);
    this.selectedGroupId.set(group.id);
    this.selectedVariableId.set(null);
    this.expandPathToGroup(group.id);
    this.selectedNodeChange.emit(group.original);
  }

  selectVariable(variable: NormalizedVariableNode): void {
    this.selectedGroupId.set(variable.parentGroupId);
    this.selectedVariableId.set(variable.id);
    this.expandPathToGroup(variable.parentGroupId);
    this.selectedNodeChange.emit(variable.original);
  }

  openVariable(variable: NormalizedVariableNode): void {
    if (this.isVariableUnavailable(variable)) return;
    this.selectVariable(variable);
    this.nodeDoubleClicked.emit(variable.original);
  }

  /** Folds every branch except the one leading to the selected group. */
  collapseAll(): void {
    const index = this.index();
    this.expandedGroupIds.set(new Set([index.rootId, ...this.selectedAncestors().map((group) => group.id)]));
  }

  toggleGroup(group: NormalizedGroupNode, event: Event): void {
    event.stopPropagation();
    this.expandedGroupIds.update((current) => {
      const next = new Set(current);
      if (next.has(group.id)) {
        next.delete(group.id);
      } else {
        next.add(group.id);
      }
      return next;
    });
  }

  onTreeKeydown(event: KeyboardEvent, row: TreeRow, rowIndex: number): void {
    const rows = this.visibleTreeRows();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.focusTreeIndex(Math.min(rowIndex + 1, rows.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.focusTreeIndex(Math.max(rowIndex - 1, 0));
        break;
      case 'Home':
        event.preventDefault();
        this.focusTreeIndex(0);
        break;
      case 'End':
        event.preventDefault();
        this.focusTreeIndex(rows.length - 1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (row.hasChildren && !row.expanded) {
          this.expandedGroupIds.update((current) => new Set([...current, row.group.id]));
        } else {
          this.focusTreeIndex(Math.min(rowIndex + 1, rows.length - 1));
        }
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (row.expanded) {
          this.expandedGroupIds.update((current) => {
            const next = new Set(current);
            next.delete(row.group.id);
            return next;
          });
        } else if (row.group.parentId) {
          const parentIndex = rows.findIndex((item) => item.group.id === row.group.parentId);
          if (parentIndex >= 0) {
            this.focusTreeIndex(parentIndex);
            this.selectGroup(rows[parentIndex].group);
          }
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.selectGroup(row.group);
        break;
    }
  }

  isVariableSelected(variableId: string): boolean {
    return this.selectedVariableId() === variableId;
  }

  isVariableInPool(variable: NormalizedVariableNode): boolean {
    return this.poolVariables().some((node) => {
      const code = String(node?.code ?? '');
      return code !== '' && code === variable.code;
    });
  }

  /** Row click selects; a click on the Add/Remove affordance also toggles the pool. */
  onVariableRowClick(event: MouseEvent, variable: NormalizedVariableNode): void {
    if (this.isVariableUnavailable(variable)) return;
    this.selectVariable(variable);
    if ((event.target as HTMLElement).closest('.row-add, .row-remove')) {
      this.variablePoolToggle.emit(variable.original);
    }
  }

  isVariableUnavailable(variable: NormalizedVariableNode): boolean {
    return this.unavailableTooltip(variable) !== '';
  }

  /** "Not available in: …" for an unavailable variable, '' otherwise. */
  unavailableTooltip(variable: NormalizedVariableNode): string {
    return unavailableTooltipFor(this.unavailableVariables(), { code: variable.code });
  }

  variableRowTitle(variable: NormalizedVariableNode): string {
    const unavailable = this.unavailableTooltip(variable);
    return unavailable ? `${variable.label}\n${unavailable}` : variable.label;
  }

  treePadding(depth: number): number {
    return 10 + depth * TREE_INDENT;
  }

  private applyExternalSelection(node: D3HierarchyNode): void {
    const index = this.index();
    const variable = findVariableByNode(index, node);
    if (variable) {
      this.selectedGroupId.set(variable.parentGroupId);
      this.selectedVariableId.set(variable.id);
      this.expandPathToGroup(variable.parentGroupId);
      this.revealSelectedRow();
      return;
    }

    const group = findGroupByNode(index, node);
    if (group) {
      this.selectedGroupId.set(group.id);
      this.selectedVariableId.set(null);
      this.expandPathToGroup(group.id);
      this.revealSelectedRow();
    }
  }

  /** Scrolls the tree pane (not the page) so a selection made elsewhere is visible. */
  private revealSelectedRow(): void {
    this.showFullPath.set(false);
    afterNextRender(() => {
      const pane = this.treePane?.nativeElement;
      const rowIndex = this.visibleTreeRows().findIndex((row) => row.selected);
      const row = this.treeRowButtons?.get(rowIndex)?.nativeElement;
      if (!pane || !row) return;
      const paneRect = pane.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      if (rowRect.top >= paneRect.top + 40 && rowRect.bottom <= paneRect.bottom) return;
      pane.scrollTop += rowRect.top - paneRect.top - pane.clientHeight / 2;
    }, { injector: this.injector });
  }

  private expandPathToGroup(groupId: string): void {
    const ids = pathForGroup(this.index(), groupId).map((group) => group.id);
    this.expandedGroupIds.update((current) => new Set([...current, ...ids]));
  }

  private focusTreeIndex(index: number): void {
    this.activeTreeIndex.set(index);
    queueMicrotask(() => {
      this.treeRowButtons?.get(index)?.nativeElement.focus();
    });
  }
}
