import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { AnalysisStudioService } from '../../../../services/analysis-studio.service';
import { unavailableTooltipFor } from '../../../../core/variable-availability.utils';
import { AlgorithmRulesService } from '../../../../services/algorithm-rules.service';
import { AnalysisStudioNavigationService } from '../../../../services/analysis-studio-navigation.service';
import { formatInputCountRange, resolveInputMaxCount, resolveInputMinCount } from '../../../../core/algorithm-input-counts';
import {
  acceptedVariableTypes,
  describeVariableType,
  isFreeTextCde,
  slotTypesText,
  specificationAcceptsVariableType,
} from '../../../../core/data-model.utils';

type AlgorithmRole = 'y' | 'x';
type PoolRole = AlgorithmRole | '';

/** One input of the selected method, as the rails describe it. */
interface RoleSlot {
  spec: unknown;
  minCount: number;
  /** `numerical`, `numerical or categorical`; '' when the slot takes any kind. */
  types: string;
  /** `exactly 1`, `1+`, `optional`. */
  count: string;
  /** Problems with what is assigned now; empty while the slot is still empty. */
  messages: string[];
  met: boolean;
}

@Component({
  selector: 'app-algorithm-role-assignment',
  imports: [DragDropModule],
  templateUrl: './algorithm-role-assignment.component.html',
  styleUrl: './algorithm-role-assignment.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlgorithmRoleAssignmentComponent {
  private readonly analysisStudioService = inject(AnalysisStudioService);
  private readonly rules = inject(AlgorithmRulesService);
  private readonly navigation = inject(AnalysisStudioNavigationService);

  readonly assignable = this.analysisStudioService.algorithmAssignableVariables;
  readonly y = this.analysisStudioService.algorithmY;
  readonly x = this.analysisStudioService.algorithmX;
  readonly algorithm = this.analysisStudioService.selectedAlgorithm;
  readonly poolFilter = signal('');

  /** The selected method's outcome and predictor inputs; a role it does not take is absent. */
  readonly slots = computed<Partial<Record<AlgorithmRole, RoleSlot>>>(() => {
    const algorithm = this.algorithm();
    if (!algorithm) return {};
    const inputdata = (algorithm.inputdata ?? {}) as Record<string, unknown>;
    const details = this.rules.evaluateAlgorithmAvailability(algorithm, { y: this.y(), x: this.x() }).details;
    const slots: Partial<Record<AlgorithmRole, RoleSlot>> = {};
    for (const role of ['y', 'x'] as const) {
      if (!(role in inputdata)) continue;
      const spec = inputdata[role];
      const minCount = resolveInputMinCount(spec, role, algorithm.name);
      const detail = details.find((entry) => entry.role === role);
      slots[role] = {
        spec,
        minCount,
        types: slotTypesText(acceptedVariableTypes(spec as any)),
        count: formatInputCountRange(minCount, resolveInputMaxCount(spec, role, algorithm.name)),
        messages: detail && detail.selectedCount > 0 ? detail.messages : [],
        met: !detail || detail.messages.length === 0,
      };
    }
    return slots;
  });
  /** Compact once both roles have a value; expanded by default so y can be assigned. */
  readonly rolesExpanded = signal(this.y().length === 0);

  constructor() {
    effect(() => {
      if (this.y().length === 0 && !this.rolesExpanded()) {
        this.rolesExpanded.set(true);
      }
    });
  }

  expandRoles(): void {
    this.rolesExpanded.set(true);
    requestAnimationFrame(() => {
      document.getElementById('pool-filter')?.focus();
    });
  }

  collapseRoles(): void {
    this.rolesExpanded.set(false);
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>('.role-action--add')?.focus();
    });
  }

  /** Assignable pool members not yet assigned to either role. */
  readonly source = computed(() => {
    const inY = new Set(this.y().map((v) => v.code));
    const inX = new Set(this.x().map((v) => v.code));
    return this.assignable().filter((v) => !inY.has(v.code) && !inX.has(v.code));
  });

  /** Unassigned variables that fit at least one input of the selected method. */
  readonly fittingPool = computed(() => this.filteredPool().filter((node) => this.fitsAny(node)));
  /** Unassigned variables no input of the method takes; listed apart with the reason. */
  readonly misfitPool = computed(() => this.filteredPool().filter((node) => !this.fitsAny(node)));

  /** Whether `node` can fill `role` of the selected method: the slot exists and takes its kind. */
  fits(node: any, role: AlgorithmRole): boolean {
    const slot = this.slots()[role];
    if (!slot) return false;
    if (!node?.isCreatedColumn && isFreeTextCde(node)) return false;
    return specificationAcceptsVariableType(slot.spec as any, node?.type);
  }

  fitsAny(node: any): boolean {
    return this.fits(node, 'y') || this.fits(node, 'x');
  }

  /** `nominal — needs numerical` for a variable no input of the method takes. */
  misfitReason(node: any): string {
    if (!node?.isCreatedColumn && isFreeTextCde(node)) return 'free text, cannot be analysed';
    const wanted = [...new Set(Object.values(this.slots()).map((slot) => slot!.types).filter(Boolean))];
    return `${describeVariableType(node?.type)}, needs ${wanted.join(' or ') || 'another kind'}`;
  }

  /** Title for a role button the variable cannot take. */
  roleBlockedTitle(node: any, role: AlgorithmRole): string {
    const slot = this.slots()[role];
    const noun = role === 'y' ? 'outcome' : 'predictor';
    if (!slot) return `${this.algorithm()?.label ?? 'This method'} takes no ${noun}`;
    return `${this.algorithm()?.label ?? 'This method'} takes ${slot.types || 'other'} ${noun}s; ${this.label(node)} is ${describeVariableType(node?.type)}`;
  }

  /** `Pick a numerical outcome below` for an empty rail. */
  invite(role: AlgorithmRole): string {
    const slot = this.slots()[role];
    if (!slot) return '';
    // The rail label already names the kind and count, so the invite only points at the list.
    return slot.minCount <= 0 ? 'Optional — pick below or leave empty' : 'None yet — pick from the list below';
  }

  /** A required input none of the selected variables can fill. */
  noneFit(role: AlgorithmRole): boolean {
    const slot = this.slots()[role];
    return !!slot && slot.minCount > 0 && !this.assignable().some((node) => this.fits(node, role));
  }

  goToVariables(): void {
    this.navigation.navigateToSection('variables-top');
  }

  /** Unassigned variables only — assigned ones live as chips in the role slots. */
  readonly filteredPool = computed(() => {
    const q = this.poolFilter().trim().toLowerCase();
    const list = this.source();
    if (!q) return list;
    return list.filter((node) => {
      const name = this.label(node).toLowerCase();
      const type = String(node?.type ?? '').toLowerCase();
      return name.includes(q) || type.includes(q);
    });
  });

  /** A chip released over the other slot moves there; drops inside its own slot are ignored. */
  onChipDrop(event: CdkDragDrop<unknown>, role: AlgorithmRole): void {
    if (event.previousContainer === event.container) return;
    if (!this.fits(event.item.data, role)) return;
    this.assignTo(role, event.item.data);
  }

  onFilter(event: Event): void {
    this.poolFilter.set((event.target as HTMLInputElement).value);
  }

  roleOf(node: any): PoolRole {
    if (this.isAssigned(node, 'y')) return 'y';
    if (this.isAssigned(node, 'x')) return 'x';
    return '';
  }

  setRole(node: any, role: PoolRole): void {
    if (this.isUnavailable(node)) return;
    if (role && !this.fits(node, role)) return;
    if (role) this.assignTo(role, node);
    else {
      const current = this.roleOf(node);
      if (current) this.removeFrom(current, node);
    }
  }

  isAssigned(node: any, role: AlgorithmRole): boolean {
    const list = role === 'y' ? this.y() : this.x();
    return list.some((v) => v.code === node.code);
  }

  assignTo(role: AlgorithmRole, node: any): void {
    // Missing from a selected dataset: cannot be given a role or moved between roles.
    if (this.isUnavailable(node)) return;
    const target = role === 'y' ? this.y() : this.x();
    // Guard: a node can never appear in both roles. If it is already in the
    // target role, assigning again is a no-op; if it is in the opposite role,
    // remove it there so the roles stay disjoint.
    if (target.some((v) => v.code === node.code)) return;
    const opposite = role === 'y' ? this.x() : this.y();
    const otherNext = opposite.filter((v) => v.code !== node.code);
    const next = [...target, node];
    if (role === 'y') {
      this.analysisStudioService.setAlgorithmX(otherNext);
      this.analysisStudioService.setAlgorithmY(next);
    } else {
      this.analysisStudioService.setAlgorithmY(otherNext);
      this.analysisStudioService.setAlgorithmX(next);
    }
  }

  removeFrom(role: AlgorithmRole, node: any): void {
    const list = role === 'y' ? this.y() : this.x();
    const next = list.filter((v) => v.code !== node.code);
    if (role === 'y') {
      this.analysisStudioService.setAlgorithmY(next);
    } else {
      this.analysisStudioService.setAlgorithmX(next);
    }
  }

  label(node: any): string {
    return node?.label ?? node?.name ?? node?.code ?? '';
  }

  /** "Not available in: …" for a variable missing from a selected dataset, '' otherwise. */
  unavailableTooltip(node: any): string {
    return unavailableTooltipFor(this.analysisStudioService.unavailableVariables(), { code: node?.code });
  }

  isUnavailable(node: any): boolean {
    return this.unavailableTooltip(node) !== '';
  }

  isCreated(node: any): boolean {
    return !!node?.isCreatedColumn;
  }
}
