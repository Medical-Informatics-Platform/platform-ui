import { DataModel, EnumValue, Group, Variable } from '../../../../models/data-model.interface';
import { ChangeDetectionStrategy, Component, Output, EventEmitter, OnInit, effect, signal, computed, Input, SimpleChanges, OnChanges } from '@angular/core';
import { QueryBuilderConfig, QueryBuilderModule } from "@kerwin612/ngx-query-builder";
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type SupportedType = 'real' | 'integer' | 'nominal';
type AuthoringMode = 'builder' | 'where';
type WhereToken = { type: 'word' | 'number' | 'string' | 'operator' | 'paren'; value: string };

@Component({
  selector: 'app-filter-config-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, QueryBuilderModule],
  templateUrl: './filter-config-modal.component.html',
  styleUrls: ['./filter-config-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterConfigModalComponent implements OnInit, OnChanges {
  @Input() filterLogic: any | null = null;
  @Input() inline = false;
  @Output() closeModal = new EventEmitter<void>();

  // Variables to be filtered
  filters = signal<any[]>([]);

  // query builder
  filterLogicModel = signal<{ condition: string; rules: any[] }>({ condition: 'AND', rules: [] });
  authoringMode = signal<AuthoringMode>('where');
  whereExpression = signal('');
  whereError = signal<string | null>(null);
  whereField = signal('');
  whereVariableText = signal('');
  whereOperator = signal('=');
  whereValue = signal('');
  readonly allFilterVariables = signal<any[]>([]);
  readonly visibleFilterVariables = computed(() => {
    const query = this.whereVariableText().trim().toLowerCase();
    return this.allFilterVariables().filter((variable) => {
      if (!query) return true;
      return String(variable.code ?? '').toLowerCase().includes(query) ||
        String(variable.label ?? variable.name ?? '').toLowerCase().includes(query);
    });
  });
  selectedWhereFilter = computed(() => this.filters().find((filter) => filter.code === this.whereField()) ?? null);
  whereOperatorOptions = computed(() => {
    const filter = this.selectedWhereFilter();
    const type = String(filter?.type ?? '').toLowerCase();
    const operators = type === 'nominal'
      ? ['=', '!=']
      : ['=', '!=', '>', '>=', '<', '<='];
    return operators.map((value) => ({ value, label: value }));
  });
  whereCategoryOptions = computed(() => {
    const filter = this.selectedWhereFilter();
    return (filter?.enumerations ?? []).map((entry: any) => ({
      value: String(entry.code ?? entry.label ?? entry.name ?? ''),
      label: String(entry.label ?? entry.name ?? entry.code ?? ''),
    })).filter((entry: { value: string; label: string }) => entry.value);
  });
  activeRulesCount = computed(() => this.countRules(this.filterLogicModel()));

  private countRules(node: any): number {
    if (!node || !Array.isArray(node.rules)) return 0;

    let count = 0;
    for (const r of node.rules) {
      if (r?.condition && Array.isArray(r.rules)) {
        // group
        count += this.countRules(r);
      } else {
        // leaf rule
        count += 1;
      }
    }
    return count;
  }

  // Config for QueryBuilder object
  config = signal<QueryBuilderConfig>({ fields: {} });

  // Operator sets per variable type
  private operatorOptions: Record<SupportedType, string[]> = {
    real: ['equal', 'not_equal', 'less', 'less_or_equal', 'greater', 'greater_or_equal', 'between', 'not_between'],
    integer: ['equal', 'not_equal', 'less', 'less_or_equal', 'greater', 'greater_or_equal', 'between', 'not_between'],
    nominal: ['equal', 'not_equal'],
  };

  // Human readable labels
  operatorLabels: Record<string, string> = {
    equal: 'Equal',
    not_equal: 'Not Equal',
    less: 'Less',
    less_or_equal: 'Less or Equal',
    greater: 'Greater',
    greater_or_equal: 'Greater or Equal',
    between: 'Between',
    not_between: 'Not Between',
    in: 'In',
    not_in: 'Not In',
    contains: 'Contains',
    not_contains: 'Not Contains',
    begins_with: 'Begins With',
    ends_with: 'Ends With',
    is_empty: 'Is Empty',
    is_not_empty: 'Is Not Empty',
    is_null: 'Is Null',
    is_not_null: 'Is Not Null'
  };

  Object = Object;

  configKey = computed(() => Object.keys(this.config().fields || {}).join('-'));

  constructor(private expStudio: ExperimentStudioService) {
    effect(() => {
      const available = this.flattenDataModelVariables(this.expStudio.selectedDataModel());
      this.allFilterVariables.set(available);
      const query = this.whereVariableText().trim().toLowerCase();
      const visible = available.filter((variable) => {
        if (!query) return true;
        return String(variable.code ?? '').toLowerCase().includes(query) ||
          String(variable.label ?? variable.name ?? '').toLowerCase().includes(query);
      });

      if (!available || available.length === 0) {
        this.filters.set([]);
        this.config.set({ fields: {} });
        return;
      }

      const builtConfig = this.buildFieldsConfig(visible.length || this.whereVariableText().trim() ? visible : available);
      this.filters.set(available);
      this.config.set({
        fields: builtConfig,
        allowEmptyRulesets: true,
        coerceValueForOperator: (operator, value, rule) => {
          if (operator === 'between' || operator === 'not_between') {
            if (!Array.isArray(value)) {
              return [value || 0, value || 0];
            }
            if (value.length !== 2) {
              return [value[0] || 0, value[1] || 0];
            }
          }
          return value;
        }
      });


    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['filterLogic']) {
      const incoming = changes['filterLogic'].currentValue;
      if (incoming && Array.isArray(incoming.rules)) {
        this.filterLogicModel.set(structuredClone(incoming));
        this.whereExpression.set(this.toWhereExpression(incoming));
      } else {
        this.filterLogicModel.set({ condition: 'AND', rules: [] });
        this.whereExpression.set('');
      }
      this.whereError.set(null);
    }
  }

  setAuthoringMode(mode: AuthoringMode): void {
    this.authoringMode.set(mode);
    this.whereError.set(null);
    if (mode === 'where') {
      this.whereExpression.set(this.toWhereExpression(this.filterLogicModel()));
    }
  }

  onWhereFieldChange(field: string): void {
    this.whereField.set(field);
    const selected = this.allFilterVariables().find((variable) => variable.code === field);
    this.whereVariableText.set(selected ? this.variableDisplayLabel(selected) : '');
    this.whereValue.set('');
    const allowed = this.whereOperatorOptions().map((operator) => operator.value);
    if (!allowed.includes(this.whereOperator())) {
      this.whereOperator.set(allowed[0] ?? '=');
    }
    this.whereError.set(null);
  }

  onWhereVariableTextChange(value: string): void {
    this.whereVariableText.set(value);
    const selected = this.resolveFilterField(value);
    this.whereField.set(selected?.code ?? '');
    if (selected) {
      const allowed = this.whereOperatorOptions().map((operator) => operator.value);
      if (!allowed.includes(this.whereOperator())) {
        this.whereOperator.set(allowed[0] ?? '=');
      }
    }
    this.whereError.set(null);
  }

  appendWhereToken(token: string): void {
    this.whereExpression.set(this.joinWhereParts(this.whereExpression(), token));
    this.whereError.set(null);
  }

  appendWhereCondition(): void {
    const field = this.whereField();
    const operator = this.whereOperator();
    const value = this.whereValue().trim();
    if (!field || !operator || !value) {
      this.whereError.set('Choose a variable, operator, and value before adding a condition.');
      return;
    }

    const filter = this.allFilterVariables().find((variable) => variable.code === field);
    const label = filter?.label ?? filter?.name ?? field;
    this.whereExpression.set(this.joinWhereParts(this.whereExpression(), `${this.formatBuilderValue(label)} ${operator} ${this.formatBuilderValue(value)}`));
    this.whereValue.set('');
    this.whereError.set(null);
  }

  clearWhereExpression(): void {
    this.whereExpression.set('');
    this.whereError.set(null);
  }

  removeLastWherePart(): void {
    const expression = this.whereExpression().trim();
    if (!expression) return;
    const tokens = this.tokenizeWhere(expression);
    tokens.pop();
    this.whereExpression.set(tokens.map((token) => token.type === 'string' ? this.formatBuilderValue(token.value) : token.value).join(' '));
    this.whereError.set(null);
  }

  getOperatorLabel(op: string): string {
    if (this.operatorLabels[op]) {
      return this.operatorLabels[op];
    }
    // Fallback: title case replacing underscores
    return op.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  ngOnInit() {
  }

  // Turns enums to options
  private toOptions(values: EnumValue[] | string[]): { name: string; value: any }[] {
    if (!values || values.length === 0) return [];
    if (typeof values[0] === 'string') {
      return (values as string[]).map(v => ({ name: v, value: v }));
    }
    return (values as EnumValue[]).map(v => ({ name: v.label, value: v.code }));
  }

  // Creates for Query Builder
  private buildFieldsConfig(filters: any[]): Record<string, any> {
    const fields: Record<string, any> = {};
    if (!filters?.length) return fields;

    for (const f of filters) {
      const ops = this.operatorOptions[f.type as SupportedType] ?? ['equal', 'not_equal'];
      const enums = f.type === 'nominal' ? f.enumerations ?? [] : undefined;

      fields[f.code] = {
        name: f.label ?? f.name ?? f.code,
        type: (f.type === 'real' || f.type === 'integer') ? 'number' : 'category',
        operators: ops,
        options:
          f.type === 'nominal' && enums?.length
            ? this.toOptions(enums)
            : undefined,
      };
    }
    return fields;
  }

  private formatFiltersForBackend(rawLogic: { condition: string; rules: any[] }): any {
    if (!rawLogic || !Array.isArray(rawLogic.rules) || rawLogic.rules.length === 0) {
      return null;
    }

    const normalizeRule = (r: any): any => {
      // Group
      if (r?.condition && Array.isArray(r.rules)) {
        return {
          condition: String(r.condition).toUpperCase(), // Upper case
          rules: r.rules.map(normalizeRule),
        };
      }

      // Leaf
      const fieldKey = r.field ?? r.id;
      const op = r.operator;
      let val = r.value;

      if ((op === 'in' || op === 'not_in') && !Array.isArray(val)) val = [val];

      return {
        id: fieldKey,
        field: fieldKey,
        type: this.detectType(fieldKey),       // 'string' | 'integer' | 'real'
        input: this.detectInput(fieldKey),     // 'number' | 'select' | 'text'
        operator: op,
        value: val,
        entity: undefined,
      };
    };

    // Root to upper case
    const formatted = {
      condition: String(rawLogic.condition || 'AND').toUpperCase(),
      rules: rawLogic.rules.map(normalizeRule),
      valid: true,
    };

    return formatted;
  }

  // turns internal UI types to backend types
  private detectType(field: string): 'string' | 'integer' | 'real' {
    const f = this.filters().find(v => v.code === field);
    if (!f) return 'real';
    if (f.type === 'integer') return 'integer';
    if (f.type === 'real') return 'real';
    // nominal/text -> backend "string"
    return 'string';
  }

  private detectInput(field: string): 'text' | 'number' | 'select' {
    const f = this.filters().find(v => v.code === field);
    if (!f) return 'text';
    if (f.type === 'integer' || f.type === 'real') return 'number';
    if (f.type === 'nominal') return 'select';
    return 'text';
  }

  // Saves logic in service
  saveFilters() {
    if (this.authoringMode() === 'where') {
      const parsed = this.parseWhereExpression(this.whereExpression());
      if (!parsed.ok) {
        this.whereError.set(parsed.error);
        return;
      }
      this.filterLogicModel.set(parsed.logic);
      this.whereError.set(null);
    }

    const raw = this.filterLogicModel();
    const formatted = this.formatFiltersForBackend(raw);

    const toStore =
      formatted && Array.isArray(formatted.rules) && formatted.rules.length > 0
        ? formatted
        : null;

    const selectedFilters = toStore
      ? this.extractFilterCodes(toStore)
        .map((code) => this.allFilterVariables().find((variable) => variable.code === code))
        .filter((variable): variable is any => !!variable)
      : [];
    this.expStudio.setFilters(selectedFilters);
    this.expStudio.setFilterLogic(toStore);
    this.closeModal.emit();
  }


  // Closes modal without saving edits
  cancel() {
    this.closeModal.emit();
  }

  private parseWhereExpression(expression: string): { ok: true; logic: { condition: string; rules: any[] } } | { ok: false; error: string } {
    const source = expression.trim();
    if (!source) return { ok: true, logic: { condition: 'AND', rules: [] } };

    const tokens = this.tokenizeWhere(source);
    if (tokens.length === 0) return { ok: true, logic: { condition: 'AND', rules: [] } };

    let index = 0;
    const peek = () => tokens[index];
    const take = () => tokens[index++];
    const isJoin = (value: string) => ['AND', 'OR'].includes(value.toUpperCase());

    const parseExpression = (): any => parseOr();

    const parseOr = (): any => {
      let left = parseAnd();
      while (peek()?.type === 'word' && peek().value.toUpperCase() === 'OR') {
        take();
        left = this.mergeWhereNodes('OR', left, parseAnd());
      }
      return left;
    };

    const parseAnd = (): any => {
      let left = parsePrimary();
      while (peek()?.type === 'word' && peek().value.toUpperCase() === 'AND') {
        take();
        left = this.mergeWhereNodes('AND', left, parsePrimary());
      }
      return left;
    };

    const parsePrimary = (): any => {
      if (peek()?.type === 'paren' && peek().value === '(') {
        take();
        const node = parseExpression();
        if (peek()?.type !== 'paren' || peek().value !== ')') {
          throw new Error('Missing closing parenthesis.');
        }
        take();
        return node;
      }
      return parseComparison();
    };

    const parseComparison = (): any => {
      const field = take();
      if (!field || field.type !== 'word' || isJoin(field.value)) {
        throw new Error('Expected a filter variable.');
      }

      const operator = take();
      if (!operator || operator.type !== 'operator') {
        throw new Error(`Expected an operator after ${field.value}.`);
      }

      const value = take();
      if (!value || !['word', 'number', 'string'].includes(value.type)) {
        throw new Error(`Expected a value after ${field.value} ${operator.value}.`);
      }

      const filter = this.resolveFilterField(field.value);
      if (!filter) {
        throw new Error(`Unknown filter variable "${field.value}". Add it to the selected filters first.`);
      }

      return {
        field: filter.code,
        operator: this.sqlOperatorToBuilder(operator.value),
        value: this.coerceWhereValue(filter, value),
      };
    };

    try {
      const logic = parseExpression();
      if (index < tokens.length) {
        throw new Error(`Unexpected token "${tokens[index].value}".`);
      }
      return { ok: true, logic: this.ensureGroup(logic) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Invalid WHERE expression.' };
    }
  }

  private joinWhereParts(current: string, next: string): string {
    const base = current.trim();
    if (!base) return next;
    if (next === ')') return `${base} ${next}`;
    return `${base} ${next}`;
  }

  private formatBuilderValue(value: string): string {
    if (/^-?\d+(\.\d+)?$/.test(value)) return value;
    return /^[A-Za-z0-9_.-]+$/.test(value) ? value : `"${value.replace(/"/g, '\\"')}"`;
  }

  variableDisplayLabel(variable: any): string {
    const label = variable?.label ?? variable?.name ?? variable?.code ?? '';
    const type = variable?.type ? ` (${variable.type})` : '';
    return `${label}${type}`;
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

  private tokenizeWhere(source: string): WhereToken[] {
    const tokens: WhereToken[] = [];
    let index = 0;
    while (index < source.length) {
      const char = source[index];
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      if (char === '(' || char === ')') {
        tokens.push({ type: 'paren', value: char });
        index += 1;
        continue;
      }
      const two = source.slice(index, index + 2);
      if (['>=', '<=', '!=', '<>'].includes(two)) {
        tokens.push({ type: 'operator', value: two });
        index += 2;
        continue;
      }
      if (['=', '>', '<'].includes(char)) {
        tokens.push({ type: 'operator', value: char });
        index += 1;
        continue;
      }
      if (char === '"' || char === "'") {
        const quote = char;
        let end = index + 1;
        let value = '';
        while (end < source.length && source[end] !== quote) {
          value += source[end];
          end += 1;
        }
        if (end >= source.length) throw new Error('Unclosed quoted value.');
        tokens.push({ type: 'string', value });
        index = end + 1;
        continue;
      }
      const numberMatch = source.slice(index).match(/^-?\d+(\.\d+)?/);
      if (numberMatch) {
        tokens.push({ type: 'number', value: numberMatch[0] });
        index += numberMatch[0].length;
        continue;
      }
      const wordMatch = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_.-]*/);
      if (wordMatch) {
        tokens.push({ type: 'word', value: wordMatch[0] });
        index += wordMatch[0].length;
        continue;
      }
      throw new Error(`Unexpected character "${char}".`);
    }
    return tokens;
  }

  private mergeWhereNodes(condition: 'AND' | 'OR', left: any, right: any): any {
    const leftGroup = left?.condition === condition ? left.rules : [left];
    const rightGroup = right?.condition === condition ? right.rules : [right];
    return { condition, rules: [...leftGroup, ...rightGroup] };
  }

  private ensureGroup(node: any): { condition: string; rules: any[] } {
    if (node?.condition && Array.isArray(node.rules)) return node;
    return { condition: 'AND', rules: [node] };
  }

  private resolveFilterField(raw: string): any | null {
    const normalized = raw.toLowerCase();
    return this.filters().find((filter) =>
      String(filter.code ?? '').toLowerCase() === normalized ||
      String(filter.label ?? '').toLowerCase() === normalized ||
      String(filter.name ?? '').toLowerCase() === normalized ||
      this.variableDisplayLabel(filter).toLowerCase() === normalized
    ) ?? null;
  }

  private sqlOperatorToBuilder(operator: string): string {
    switch (operator) {
      case '=': return 'equal';
      case '!=':
      case '<>': return 'not_equal';
      case '>': return 'greater';
      case '>=': return 'greater_or_equal';
      case '<': return 'less';
      case '<=': return 'less_or_equal';
      default: return 'equal';
    }
  }

  private sqlOperatorLabel(operator: string): string {
    switch (operator) {
      case '=': return 'Equal';
      case '!=': return 'Not equal';
      case '>': return 'Greater than';
      case '>=': return 'Greater than or equal';
      case '<': return 'Less than';
      case '<=': return 'Less than or equal';
      default: return operator;
    }
  }

  private builderOperatorToSql(operator: string): string {
    switch (operator) {
      case 'equal': return '=';
      case 'not_equal': return '!=';
      case 'greater': return '>';
      case 'greater_or_equal': return '>=';
      case 'less': return '<';
      case 'less_or_equal': return '<=';
      default: return operator;
    }
  }

  private coerceWhereValue(filter: any, token: WhereToken): any {
    if (token.type === 'number') return Number(token.value);
    if (filter?.type !== 'nominal') return token.value;

    const match = (filter.enumerations ?? []).find((entry: any) =>
      String(entry.code ?? '').toLowerCase() === token.value.toLowerCase() ||
      String(entry.label ?? '').toLowerCase() === token.value.toLowerCase() ||
      String(entry.name ?? '').toLowerCase() === token.value.toLowerCase()
    );
    return match?.code ?? token.value;
  }

  private toWhereExpression(node: any): string {
    if (!node || !Array.isArray(node.rules) || node.rules.length === 0) return '';
    const serialize = (item: any): string => {
      if (item?.condition && Array.isArray(item.rules)) {
        return `(${item.rules.map(serialize).join(` ${String(item.condition).toUpperCase()} `)})`;
      }
      const field = item.field ?? item.id;
      const filter = this.filters().find((entry) => entry.code === field);
      const label = filter?.label ?? filter?.name ?? field;
      return `${this.formatWhereValue(label)} ${this.builderOperatorToSql(item.operator)} ${this.formatWhereValue(item.value)}`;
    };
    const expression = serialize(node);
    return expression.startsWith('(') && expression.endsWith(')') ? expression.slice(1, -1) : expression;
  }

  private formatWhereValue(value: any): string {
    if (typeof value === 'number') return String(value);
    const raw = String(value ?? '');
    return /^[A-Za-z0-9_.-]+$/.test(raw) ? raw : `"${raw.replace(/"/g, '\\"')}"`;
  }
}
