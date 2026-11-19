import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { D3HierarchyNode } from '../../../../models/data-model.interface';

interface EnumerationEntry {
  label: string;
  code?: string;
}

@Component({
  selector: 'app-metadata-info-panel',
  templateUrl: './metadata-info-panel.component.html',
  styleUrl: './metadata-info-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetadataInfoPanelComponent {
  readonly selectedNode = input<D3HierarchyNode | null>(null);

  /** Enumerations shown before "Show all": a long nominal list stays a glance, not a wall. */
  readonly enumerationPreview = 8;
  /** Resets to collapsed whenever a new node is selected. */
  readonly showAllEnumerations = linkedSignal({ source: this.selectedNode, computation: () => false });

  readonly enumerations = computed(() => this.resolveEnumerationEntries(this.selectedNode()?.enumerations));
  readonly visibleEnumerations = computed(() =>
    this.showAllEnumerations() ? this.enumerations() : this.enumerations().slice(0, this.enumerationPreview)
  );

  private resolveEnumerationEntries(value: unknown): EnumerationEntry[] {
    if (!Array.isArray(value) || !value.length) {
      return [];
    }

    const codeToLabel = this.buildEnumerationLabelMap(value);
    const seen = new Set<string>();

    return value
      .map((entry) => this.resolveEnumerationEntry(entry, codeToLabel))
      .filter((entry): entry is EnumerationEntry => !!entry?.label)
      .filter((entry) => {
        const key = `${entry.code ?? ''}:${entry.label}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  private buildEnumerationLabelMap(enumerations: unknown[]): Map<string, string> {
    const map = new Map<string, string>();

    enumerations.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }

      const record = entry as Record<string, unknown>;
      const code = this.normalizeString(record['code'] ?? record['value']);
      const label = this.normalizeString(record['label'] ?? record['name']);
      if (!code && !label) {
        return;
      }

      const displayLabel = this.preferredEnumerationLabel(label, code);
      if (code) {
        map.set(code, displayLabel);
      }
      if (label && label !== code) {
        map.set(label, displayLabel);
      }
    });

    return map;
  }

  private resolveEnumerationEntry(
    entry: unknown,
    codeToLabel: Map<string, string>
  ): EnumerationEntry | null {
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      const code = this.normalizeString(record['code'] ?? record['value']);
      const rawLabel = this.normalizeString(record['label'] ?? record['name']);
      const label = rawLabel
        ? this.preferredEnumerationLabel(rawLabel, code)
        : code
          ? codeToLabel.get(code) ?? this.humanizeEnumCode(code)
          : '';

      if (!label) {
        return null;
      }

      return { label, code: code || undefined };
    }

    const code = this.normalizeString(entry);
    if (!code) {
      return null;
    }

    const label = codeToLabel.get(code) ?? this.humanizeEnumCode(code);
    return { label, code };
  }

  private preferredEnumerationLabel(label: string, code: string): string {
    if (!label) {
      return code ? this.humanizeEnumCode(code) : '';
    }
    if (!code || label.toLowerCase() !== code.toLowerCase()) {
      return label;
    }
    return this.humanizeEnumCode(code);
  }

  private humanizeEnumCode(code: string): string {
    const normalized = code.replace(/[_-]+/g, ' ').trim();
    if (!normalized) {
      return '';
    }
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  private normalizeString(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }
}
