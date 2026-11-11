import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  QueryList,
  ViewChildren,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { D3HierarchyNode } from '../../../../../models/data-model.interface';
import {
  EMPTY_UNAVAILABLE_VARIABLES,
  UnavailableVariablesMap,
  unavailableDatasetsFor,
  unavailableTooltipFor,
} from '../../../../../core/variable-availability.utils';
import {
  NormalizedGroupNode,
  NormalizedVariableNode,
} from '../metadata-browser.model';
import { groupContentsLabel } from '../metadata-browser-labels';
import {
  findGroupByNode,
  findVariableByNode,
  normalizeMetadataTree,
  pathForGroup,
} from '../metadata-browser-normalizer';

/** Most variables of nested groups the contents pane lists before it asks the user to narrow down. */
export const SUBTREE_VARIABLE_LIMIT = 200;

/** A variable of a nested group, with the group names between the selected group and the variable. */
export interface SubtreeVariableRow {
  variable: NormalizedVariableNode;
  path: string;
}

interface TreeRow {
  group: NormalizedGroupNode;
  depth: number;
  expanded: boolean;
  selected: boolean;
  hasChildren: boolean;
}

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
  /** Variables missing from some selected dataset: shown amber, viewable, never addable. */
  readonly unavailableVariables = input<UnavailableVariablesMap>(EMPTY_UNAVAILABLE_VARIABLES);
  readonly selectedNodeChange = output<D3HierarchyNode>();
  readonly nodeDoubleClicked = output<D3HierarchyNode>();
  readonly variablePoolToggle = output<D3HierarchyNode>();

  @ViewChildren('treeRowButton') private treeRowButtons?: QueryList<ElementRef<HTMLButtonElement>>;

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
    const rows: TreeRow[] = [];
    const visit = (group: NormalizedGroupNode, depth: number): void => {
      const hasChildren = group.childGroupIds.length > 0;
      const isExpanded = expanded.has(group.id);
      rows.push({
        group,
        depth,
        expanded: isExpanded,
        selected: group.id === selectedGroupId,
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
    return groupContentsLabel(group.directGroupCount, group.totalVariableCount);
  });
  /** Count of pooled variables under each group (any descendant whose code is in the pool). */
  readonly pooledCountByGroupId = computed(() => {
    const index = this.index();
    const poolCodes = new Set(
      this.poolVariables()
        .map((node) => String(node?.code ?? ''))
        .filter((code) => code !== '')
    );
    const counts = new Map<string, number>();
    for (const id of index.variableIds) {
      const variable = index.variablesById[id];
      if (!poolCodes.has(variable.code)) continue;
      for (const groupId of variable.pathGroupIds) {
        counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
      }
    }
    return counts;
  });

  /** Variables of the selected group's nested groups (not its direct ones), capped at the limit. */
  readonly subtreeRows = computed<SubtreeVariableRow[]>(() => {
    throw new Error('not implemented');
  });
  /** How many nested variables the cap left out; 0 when all are listed. */
  readonly subtreeOverflow = computed<number>(() => {
    throw new Error('not implemented');
  });

  readonly groupContentsLabel = groupContentsLabel;

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
    if (this.isVariablePartial(variable)) return;
    this.selectVariable(variable);
    this.nodeDoubleClicked.emit(variable.original);
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

  /** Row click selects; a click on the Add/Remove affordance also toggles the pool.
   *  A partially available variable is only viewed: it never toggles the pool. */
  onVariableRowClick(event: MouseEvent, variable: NormalizedVariableNode): void {
    this.selectVariable(variable);
    if (this.isVariablePartial(variable)) return;
    if ((event.target as HTMLElement).closest('.row-add, .row-remove')) {
      this.variablePoolToggle.emit(variable.original);
    }
  }

  isVariablePartial(variable: NormalizedVariableNode): boolean {
    return this.unavailableTooltip(variable) !== '';
  }

  /** Datasets lacking the variable, e.g. for the "Missing in N datasets" badge. */
  partialDatasetCount(variable: NormalizedVariableNode): number {
    return unavailableDatasetsFor(this.unavailableVariables(), { code: variable.code }).length;
  }

  /** "Not available in: …" for an unavailable variable, '' otherwise. */
  unavailableTooltip(variable: NormalizedVariableNode): string {
    return unavailableTooltipFor(this.unavailableVariables(), { code: variable.code });
  }

  variableRowTitle(variable: NormalizedVariableNode): string {
    const unavailable = this.unavailableTooltip(variable);
    return unavailable ? `${variable.label}\n${unavailable}` : variable.label;
  }

  /** Variables of the group's whole subtree that are already in the experiment pool. */
  pooledCount(group: NormalizedGroupNode): number {
    return this.pooledCountByGroupId().get(group.id) ?? 0;
  }

  /** Width (0-100) of the group's size bar: its variable count against the largest listed sibling. */
  shareOf(group: NormalizedGroupNode): number {
    const max = this.selectedChildGroups().reduce(
      (largest, child) => Math.max(largest, child.totalVariableCount),
      0
    );
    return max === 0 ? 0 : Math.round((group.totalVariableCount / max) * 100);
  }

  treePadding(depth: number): number {
    return 10 + depth * 16;
  }

  private applyExternalSelection(node: D3HierarchyNode): void {
    const index = this.index();
    const variable = findVariableByNode(index, node);
    if (variable) {
      this.selectedGroupId.set(variable.parentGroupId);
      this.selectedVariableId.set(variable.id);
      this.expandPathToGroup(variable.parentGroupId);
      return;
    }

    const group = findGroupByNode(index, node);
    if (group) {
      this.selectedGroupId.set(group.id);
      this.selectedVariableId.set(null);
      this.expandPathToGroup(group.id);
    }
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
