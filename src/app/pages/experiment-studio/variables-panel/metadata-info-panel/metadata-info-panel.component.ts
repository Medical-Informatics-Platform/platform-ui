import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { D3HierarchyNode } from '../../../../models/data-model.interface';

export interface MetadataPathNode {
  code: string;
  label: string;
}

export interface MetadataGroupInfo {
  groupCount: number;
  hasGroups: boolean;
}

interface MetadataField {
  label: string;
  value: string;
}

@Component({
  selector: 'app-metadata-info-panel',
  templateUrl: './metadata-info-panel.component.html',
  styleUrl: './metadata-info-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetadataInfoPanelComponent {
  readonly selectedNode = input<D3HierarchyNode | null>(null);
  readonly pathNodes = input<MetadataPathNode[]>([]);
  readonly groupInfo = input<MetadataGroupInfo | null>(null);

  readonly isGroup = computed(() => !!this.selectedNode()?.children?.length);
  readonly directGroupCount = computed(() => this.children().filter((child) => !!child.children?.length).length);
  readonly directVariableCount = computed(() => this.children().filter((child) => !child.children?.length).length);
  readonly totalVariableCount = computed(() => this.children().reduce((total, child) => total + this.countLeafNodes(child), 0));
  readonly enumerations = computed(() => this.normalizeEnumerationLabels(this.selectedNode()?.enumerations));
  readonly fields = computed<MetadataField[]>(() => {
    const node = this.selectedNode();
    if (!node || this.isGroup()) return [];

    return [
      { label: 'Label', value: this.normalizeString(node.label) },
      { label: 'Type', value: this.normalizeString(node.type) },
      { label: 'Units', value: this.normalizeString(node.units) },
      { label: 'Minimum', value: this.normalizeString(node.minValue) },
      { label: 'Maximum', value: this.normalizeString(node.maxValue) },
    ].filter((field) => field.value);
  });

  private children(): D3HierarchyNode[] {
    return this.selectedNode()?.children ?? [];
  }

  private countLeafNodes(node: D3HierarchyNode): number {
    if (!node.children?.length) return 1;
    return node.children.reduce((total, child) => total + this.countLeafNodes(child), 0);
  }

  private normalizeEnumerationLabels(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => {
        if (entry && typeof entry === 'object') {
          const record = entry as Record<string, unknown>;
          return this.normalizeString(record['label'] ?? record['name'] ?? record['value']);
        }
        return this.normalizeString(entry);
      })
      .filter((label) => !!label);
  }

  private normalizeString(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }
}
