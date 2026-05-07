import { DataModel, Group, Variable } from '../../../../models/data-model.interface';
import { ChangeDetectionStrategy, Component, Output, EventEmitter, effect, signal, computed, Input, SimpleChanges, OnChanges } from '@angular/core';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type GroupCondition = 'AND' | 'OR';
type FilterBlock = FilterGroupBlock | FilterConditionBlock;

interface FilterGroupBlock {
  kind: 'group';
  id: string;
  condition: GroupCondition;
  rules: FilterBlock[];
}

interface FilterConditionBlock {
  kind: 'condition';
  id: string;
  field: string;
  variableText: string;
  operator: string;
  value: string;
}

@Component({
  selector: 'app-filter-config-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './filter-config-modal.component.html',
  styleUrls: ['./filter-config-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterConfigModalComponent implements OnChanges {
  @Input() filterLogic: any | null = null;
  @Input() inline = false;
  @Output() closeModal = new EventEmitter<void>();

  readonly allFilterVariables = signal<any[]>([]);
  readonly rootGroup = signal<FilterGroupBlock>(this.createGroup());
  readonly filterError = signal<string | null>(null);
  readonly previewExpression = computed(() => this.groupPreview(this.rootGroup()));
  readonly activeRulesCount = computed(() => this.countRules(this.rootGroup()));

  constructor(private expStudio: ExperimentStudioService) {
    effect(() => {
      this.allFilterVariables.set(this.flattenDataModelVariables(this.expStudio.selectedDataModel()));
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['filterLogic']) return;
    const incoming = changes['filterLogic'].currentValue;
    this.rootGroup.set(this.backendToGroup(incoming));
    this.filterError.set(null);
  }

  addCondition(groupId: string, index: number): void {
    this.updateGroup(groupId, (group) => ({
      ...group,
      rules: this.insertAt(group.rules, index, this.createCondition()),
    }));
  }

  addGroup(groupId: string, index: number): void {
    this.updateGroup(groupId, (group) => ({
      ...group,
      rules: this.insertAt(group.rules, index, this.createGroup()),
    }));
  }

  removeBlock(blockId: string): void {
    this.rootGroup.update((root) => this.removeBlockFromGroup(root, blockId));
    this.filterError.set(null);
  }

  setGroupCondition(groupId: string, condition: GroupCondition): void {
    this.updateGroup(groupId, (group) => ({ ...group, condition }));
  }

  onConditionVariableTextChange(blockId: string, value: string): void {
    const selected = this.resolveFilterField(value);
    this.updateCondition(blockId, (block) => {
      const nextOperator = selected && !this.operatorOptionsForVariable(selected).includes(block.operator)
        ? this.operatorOptionsForVariable(selected)[0]
        : block.operator;
      return {
        ...block,
        variableText: value,
        field: selected?.code ?? '',
        operator: nextOperator ?? '=',
        value: selected ? '' : block.value,
      };
    });
  }

  setConditionOperator(blockId: string, operator: string): void {
    this.updateCondition(blockId, (block) => ({
      ...block,
      operator,
      value: this.isUnaryOperator(operator) ? '' : block.value,
    }));
  }

  setConditionValue(blockId: string, value: string): void {
    this.updateCondition(blockId, (block) => ({ ...block, value }));
  }

  visibleFilterVariables(query: string): any[] {
    const normalized = query.trim().toLowerCase();
    return this.allFilterVariables().filter((variable) => {
      if (!normalized) return true;
      return String(variable.code ?? '').toLowerCase().includes(normalized) ||
        String(variable.label ?? variable.name ?? '').toLowerCase().includes(normalized);
    });
  }

  selectedFilter(block: FilterConditionBlock): any | null {
    return this.allFilterVariables().find((filter) => filter.code === block.field) ?? null;
  }

  operatorOptions(block: FilterConditionBlock): string[] {
    return this.operatorOptionsForVariable(this.selectedFilter(block));
  }

  operatorDisplayLabel(operator: string): string {
    switch (operator) {
      case '=': return 'Equals';
      case '!=': return 'Does not equal';
      case '>': return 'Greater than';
      case '>=': return 'Greater than or equal to';
      case '<': return 'Less than';
      case '<=': return 'Less than or equal to';
      case 'IS NULL': return 'Is null';
      case 'IS NOT NULL': return 'Is not null';
      default: return operator;
    }
  }

  isUnaryOperator(operator: string): boolean {
    return operator === 'IS NULL' || operator === 'IS NOT NULL';
  }

  categoryOptions(block: FilterConditionBlock): Array<{ value: string; label: string }> {
    const filter = this.selectedFilter(block);
    return (filter?.enumerations ?? []).map((entry: any) => ({
      value: String(entry.code ?? entry.label ?? entry.name ?? ''),
      label: String(entry.label ?? entry.name ?? entry.code ?? ''),
    })).filter((entry: { value: string; label: string }) => entry.value);
  }

  variableDisplayLabel(variable: any): string {
    const label = variable?.label ?? variable?.name ?? variable?.code ?? '';
    const type = variable?.type ? ` (${variable.type})` : '';
    return `${label}${type}`;
  }

  blockTrackBy(_index: number, block: FilterBlock): string {
    return block.id;
  }

  saveFilters(): void {
    const validationError = this.validateGroup(this.rootGroup());
    if (validationError) {
      this.filterError.set(validationError);
      return;
    }

    const normalized = this.normalizeGroup(this.rootGroup());
    const toStore = normalized.rules.length > 0 ? this.formatFiltersForBackend(normalized) : null;
    const selectedFilters = toStore
      ? this.extractFilterCodes(toStore)
        .map((code) => this.allFilterVariables().find((variable) => variable.code === code))
        .filter((variable): variable is any => !!variable)
      : [];

    this.expStudio.setFilters(selectedFilters);
    this.expStudio.setFilterLogic(toStore);
    this.closeModal.emit();
    this.filterError.set(null);
  }

  cancel(): void {
    this.closeModal.emit();
  }

  clearFilters(): void {
    this.rootGroup.set(this.createGroup());
    this.expStudio.setFilters([]);
    this.expStudio.setFilterLogic(null);
    this.filterError.set(null);
  }

  private createGroup(rules: FilterBlock[] = []): FilterGroupBlock {
    return { kind: 'group', id: this.nextId(), condition: 'AND', rules };
  }

  private createCondition(): FilterConditionBlock {
    return { kind: 'condition', id: this.nextId(), field: '', variableText: '', operator: '=', value: '' };
  }

  private nextId(): string {
    return `filter-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private insertAt<T>(items: T[], index: number, item: T): T[] {
    return [...items.slice(0, index), item, ...items.slice(index)];
  }

  private updateGroup(groupId: string, updater: (group: FilterGroupBlock) => FilterGroupBlock): void {
    this.rootGroup.update((root) => this.mapGroups(root, groupId, updater));
    this.filterError.set(null);
  }

  private updateCondition(blockId: string, updater: (block: FilterConditionBlock) => FilterConditionBlock): void {
    this.rootGroup.update((root) => this.mapConditions(root, blockId, updater));
    this.filterError.set(null);
  }

  private mapGroups(group: FilterGroupBlock, groupId: string, updater: (group: FilterGroupBlock) => FilterGroupBlock): FilterGroupBlock {
    const mapped = {
      ...group,
      rules: group.rules.map((block) => block.kind === 'group' ? this.mapGroups(block, groupId, updater) : block),
    };
    return mapped.id === groupId ? updater(mapped) : mapped;
  }

  private mapConditions(group: FilterGroupBlock, blockId: string, updater: (block: FilterConditionBlock) => FilterConditionBlock): FilterGroupBlock {
    return {
      ...group,
      rules: group.rules.map((block) => {
        if (block.kind === 'condition') return block.id === blockId ? updater(block) : block;
        return this.mapConditions(block, blockId, updater);
      }),
    };
  }

  private removeBlockFromGroup(group: FilterGroupBlock, blockId: string): FilterGroupBlock {
    return {
      ...group,
      rules: group.rules
        .filter((block) => block.id !== blockId)
        .map((block) => block.kind === 'group' ? this.removeBlockFromGroup(block, blockId) : block),
    };
  }

  private operatorOptionsForVariable(variable: any | null): string[] {
    return String(variable?.type ?? '').toLowerCase() === 'nominal'
      ? ['=', '!=', 'IS NULL', 'IS NOT NULL']
      : ['=', '!=', '>', '>=', '<', '<=', 'IS NULL', 'IS NOT NULL'];
  }

  private resolveFilterField(raw: string): any | null {
    const normalized = raw.toLowerCase();
    return this.allFilterVariables().find((filter) =>
      String(filter.code ?? '').toLowerCase() === normalized ||
      String(filter.label ?? '').toLowerCase() === normalized ||
      String(filter.name ?? '').toLowerCase() === normalized ||
      this.variableDisplayLabel(filter).toLowerCase() === normalized
    ) ?? null;
  }

  private backendToGroup(logic: any): FilterGroupBlock {
    if (!logic || !Array.isArray(logic.rules)) return this.createGroup();
    return {
      kind: 'group',
      id: this.nextId(),
      condition: String(logic.condition ?? 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND',
      rules: logic.rules.map((rule: any) => this.backendToBlock(rule)),
    };
  }

  private backendToBlock(rule: any): FilterBlock {
    if (rule?.condition && Array.isArray(rule.rules)) return this.backendToGroup(rule);
    const field = String(rule?.field ?? rule?.id ?? '');
    const variable = this.allFilterVariables().find((entry) => entry.code === field);
    return {
      kind: 'condition',
      id: this.nextId(),
      field,
      variableText: variable ? this.variableDisplayLabel(variable) : field,
      operator: this.backendOperatorToSymbol(String(rule?.operator ?? '=')),
      value: rule?.value === undefined || rule?.value === null ? '' : String(rule.value),
    };
  }

  private backendOperatorToSymbol(operator: string): string {
    switch (operator) {
      case 'equal': return '=';
      case 'not_equal': return '!=';
      case 'greater': return '>';
      case 'greater_or_equal': return '>=';
      case 'less': return '<';
      case 'less_or_equal': return '<=';
      case 'is_null': return 'IS NULL';
      case 'is_not_null': return 'IS NOT NULL';
      default: return operator;
    }
  }

  private symbolToBackendOperator(operator: string): string {
    switch (operator) {
      case '=': return 'equal';
      case '!=': return 'not_equal';
      case '>': return 'greater';
      case '>=': return 'greater_or_equal';
      case '<': return 'less';
      case '<=': return 'less_or_equal';
      case 'IS NULL': return 'is_null';
      case 'IS NOT NULL': return 'is_not_null';
      default: return 'equal';
    }
  }

  private validateGroup(group: FilterGroupBlock): string | null {
    for (const block of group.rules) {
      if (block.kind === 'group') {
        const groupError = this.validateGroup(block);
        if (groupError) return groupError;
        continue;
      }
      if (!block.field) return 'Choose a variable for every condition.';
      if (!block.operator) return 'Choose an operator for every condition.';
      if (this.isUnaryOperator(block.operator)) continue;
      if (block.value === '') return 'Choose or enter a value for every condition.';
    }
    return null;
  }

  private normalizeGroup(group: FilterGroupBlock): any {
    return {
      condition: group.condition,
      rules: group.rules.map((block) => block.kind === 'group' ? this.normalizeGroup(block) : this.normalizeCondition(block)),
    };
  }

  private normalizeCondition(block: FilterConditionBlock): any {
    const variable = this.selectedFilter(block);
    return {
      field: block.field,
      operator: this.symbolToBackendOperator(block.operator),
      value: this.isUnaryOperator(block.operator) ? null : this.coerceValue(variable, block.value),
    };
  }

  private coerceValue(variable: any | null, value: string): unknown {
    if (String(variable?.type ?? '').toLowerCase() === 'nominal') return value;
    const numeric = Number(value);
    return Number.isFinite(numeric) && value.trim() !== '' ? numeric : value;
  }

  private formatFiltersForBackend(rawLogic: { condition: string; rules: any[] }): any {
    return {
      condition: String(rawLogic.condition || 'AND').toUpperCase(),
      rules: rawLogic.rules.map((rule) => this.formatRuleForBackend(rule)),
      valid: true,
    };
  }

  private formatRuleForBackend(rule: any): any {
    if (rule?.condition && Array.isArray(rule.rules)) {
      return {
        condition: String(rule.condition || 'AND').toUpperCase(),
        rules: rule.rules.map((child: any) => this.formatRuleForBackend(child)),
      };
    }

    const fieldKey = rule.field ?? rule.id;
    return {
      id: fieldKey,
      field: fieldKey,
      type: this.detectType(fieldKey),
      input: this.detectInput(fieldKey),
      operator: rule.operator,
      value: rule.value,
      entity: undefined,
    };
  }

  private detectType(field: string): 'string' | 'integer' | 'real' {
    const variable = this.allFilterVariables().find((entry) => entry.code === field);
    if (variable?.type === 'integer') return 'integer';
    if (variable?.type === 'real') return 'real';
    return 'string';
  }

  private detectInput(field: string): 'text' | 'number' | 'select' {
    const variable = this.allFilterVariables().find((entry) => entry.code === field);
    if (variable?.type === 'integer' || variable?.type === 'real') return 'number';
    if (variable?.type === 'nominal') return 'select';
    return 'text';
  }

  private extractFilterCodes(logic: any): string[] {
    const codes = new Set<string>();
    const walk = (node: any): void => {
      if (!node) return;
      if (Array.isArray(node.rules)) {
        node.rules.forEach(walk);
        return;
      }
      const code = node.field ?? node.id;
      if (code) codes.add(String(code));
    };
    walk(logic);
    return Array.from(codes);
  }

  private countRules(group: FilterGroupBlock): number {
    return group.rules.reduce((count, block) => count + (block.kind === 'group' ? this.countRules(block) : 1), 0);
  }

  private groupPreview(group: FilterGroupBlock): string {
    if (!group.rules.length) return '';
    const expression = group.rules.map((block) => block.kind === 'group' ? `(${this.groupPreview(block)})` : this.conditionPreview(block));
    return expression.join(` ${group.condition} `);
  }

  private conditionPreview(block: FilterConditionBlock): string {
    const variable = this.selectedFilter(block);
    const label = variable?.label ?? variable?.name ?? block.field ?? 'Variable';
    if (this.isUnaryOperator(block.operator)) return label + ' ' + block.operator;
    const value = block.value || 'value';
    return label + ' ' + block.operator + ' ' + value;
  }

  private flattenDataModelVariables(model: DataModel | null): any[] {
    if (!model) return [];
    const seen = new Map<string, any>();
    const addVariable = (variable: Variable): void => {
      if (!variable?.code || seen.has(variable.code)) return;
      const type = String(variable.type ?? '').toLowerCase();
      if (!['real', 'integer', 'nominal'].includes(type)) return;
      seen.set(variable.code, {
        code: variable.code,
        label: variable.label,
        name: (variable as any).name,
        type: variable.type,
        enumerations: variable.enumerations,
      });
    };
    const visitGroups = (groups: Group[] = []): void => {
      groups.forEach((group) => {
        (group.variables ?? []).forEach(addVariable);
        visitGroups(group.groups ?? []);
      });
    };

    (model.variables ?? []).forEach(addVariable);
    visitGroups(model.groups ?? []);
    return Array.from(seen.values());
  }
}
