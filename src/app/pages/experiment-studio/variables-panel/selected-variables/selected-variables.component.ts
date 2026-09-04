import { ChangeDetectionStrategy, Component, computed, output, inject, input, signal, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { D3HierarchyNode } from '../../../../models/data-model.interface';


@Component({
  selector: 'app-selected-variables',
  templateUrl: './selected-variables.component.html',
  styleUrl: './selected-variables.component.css',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onOutsideClick($event)',
    '(document:keydown.escape)': 'close()',
  },
})
export class SelectedVariablesComponent {
  private expStudioService = inject(ExperimentStudioService);
  private elementRef = inject(ElementRef);

  readonly selectedNode = input<any>();
  readonly variableClicked = output<any>();

  readonly isOpen = signal(false);

  /** The single assignable pool (data-model variables only). */
  readonly variables = computed(() => this.expStudioService.selectedVariables());

  /** Values column: up to 3 enumeration labels (+N more), or `min – max` for numerics. */
  valuesSummary(variable: D3HierarchyNode): string[] {
    const raw = Array.isArray(variable?.enumerations) ? variable.enumerations : [];
    if (raw.length) {
      const labels = raw
        .map((entry: any) =>
          entry && typeof entry === 'object' ? String(entry.label ?? entry.code ?? '') : String(entry),
        )
        .filter(Boolean);
      return labels.length > 3
        ? [...labels.slice(0, 3), `+${labels.length - 3} more`]
        : labels;
    }

    const min = variable?.minValue;
    const max = variable?.maxValue;
    return min != null && max != null
      ? [`${min} – ${max}${variable.units ? ` ${variable.units}` : ''}`]
      : [];
  }

  onVariableClick(node: D3HierarchyNode): void {
    this.variableClicked.emit(node);
  }

  toggle(): void {
    this.isOpen.update((open) => !open);
  }

  close(): void {
    this.isOpen.set(false);
  }

  onOutsideClick(event: Event): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.close();
    }
  }

  removeItem(item: any): void {
    this.expStudioService.setVariables(
      this.variables().filter((v) => v.code !== item.code)
    );
  }

  clearList(): void {
    this.expStudioService.setVariables([]);
  }
}
