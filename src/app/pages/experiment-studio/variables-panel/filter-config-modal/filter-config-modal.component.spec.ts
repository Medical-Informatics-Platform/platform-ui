import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { FilterConfigModalComponent } from './filter-config-modal.component';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';

describe('FilterConfigModalComponent block builder', () => {
  let fixture: ComponentFixture<FilterConfigModalComponent>;
  let component: FilterConfigModalComponent;
  let expStudio: any;

  beforeEach(async () => {
    expStudio = {
      selectedDataModel: signal({
        code: 'dm',
        label: 'Data model',
        variables: [
          { code: 'age', label: 'Age', type: 'real' },
          {
            code: 'sex',
            label: 'Sex',
            type: 'nominal',
            enumerations: [
              { code: 'female', label: 'Female' },
              { code: 'male', label: 'Male' },
            ],
          },
        ],
      }),
      setFilters: jasmine.createSpy('setFilters'),
      setFilterLogic: jasmine.createSpy('setFilterLogic'),
    };

    await TestBed.configureTestingModule({
      imports: [FilterConfigModalComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: expStudio },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FilterConfigModalComponent);
    component = fixture.componentInstance;
    component.inline = true;
    fixture.detectChanges();
    component.allFilterVariables.set([
      { code: 'age', label: 'Age', type: 'real' },
      {
        code: 'sex',
        label: 'Sex',
        type: 'nominal',
        enumerations: [
          { code: 'female', label: 'Female' },
          { code: 'male', label: 'Male' },
        ],
      },
    ]);
  });

  it('renders an existing nested filter tree as blocks', () => {
    component.filterLogic = {
      condition: 'OR',
      rules: [
        { field: 'age', operator: 'greater', value: 2 },
        { condition: 'AND', rules: [{ field: 'sex', operator: 'equal', value: 'female' }] },
      ],
    };
    component.ngOnChanges({ filterLogic: { currentValue: component.filterLogic } as any });
    fixture.detectChanges();

    expect(component.activeRulesCount()).toBe(2);
    expect(component.previewExpression()).toContain('Age > 2');
    expect(component.previewExpression()).toContain('Sex = female');
  });

  it('saves edited condition and nested group to backend filter payload', () => {
    const root = component.rootGroup();
    component.addCondition(root.id, 0);
    let condition = component.rootGroup().rules[0] as any;
    component.onConditionVariableTextChange(condition.id, 'Age (real)');
    component.setConditionOperator(condition.id, '>');
    component.setConditionValue(condition.id, '2');

    component.addGroup(root.id, 1);
    const group = component.rootGroup().rules[1] as any;
    component.setGroupCondition(root.id, 'OR');
    component.addCondition(group.id, 0);
    condition = (component.rootGroup().rules[1] as any).rules[0];
    component.onConditionVariableTextChange(condition.id, 'Sex (nominal)');
    component.setConditionValue(condition.id, 'female');

    component.saveFilters();

    expect(expStudio.setFilters).toHaveBeenCalledWith([
      jasmine.objectContaining({ code: 'age' }),
      jasmine.objectContaining({ code: 'sex' }),
    ]);
    expect(expStudio.setFilterLogic).toHaveBeenCalledWith(jasmine.objectContaining({
      condition: 'OR',
      rules: jasmine.any(Array),
      valid: true,
    }));
  });

  it('limits nominal variables to equality operators and exposes categories', () => {
    const root = component.rootGroup();
    component.addCondition(root.id, 0);
    let condition = component.rootGroup().rules[0] as any;
    component.onConditionVariableTextChange(condition.id, 'Sex (nominal)');
    condition = component.rootGroup().rules[0] as any;

    expect(component.operatorOptions(condition)).toEqual(['=', '!=', 'IS NULL', 'IS NOT NULL']);
    expect(component.categoryOptions(condition).map((item) => item.label)).toEqual(['Female', 'Male']);
  });

  it('exposes null checks for numeric variables', () => {
    const root = component.rootGroup();
    component.addCondition(root.id, 0);
    let condition = component.rootGroup().rules[0] as any;
    component.onConditionVariableTextChange(condition.id, 'Age (real)');
    condition = component.rootGroup().rules[0] as any;

    expect(component.operatorOptions(condition)).toContain('IS NULL');
    expect(component.operatorOptions(condition)).toContain('IS NOT NULL');
  });

  it('renders readable operator labels without changing stored operator values', () => {
    expect(component.operatorDisplayLabel('=')).toBe('Equals');
    expect(component.operatorDisplayLabel('!=')).toBe('Does not equal');
    expect(component.operatorDisplayLabel('>')).toBe('Greater than');
    expect(component.operatorDisplayLabel('>=')).toBe('Greater than or equal to');
    expect(component.operatorDisplayLabel('<')).toBe('Less than');
    expect(component.operatorDisplayLabel('<=')).toBe('Less than or equal to');
    expect(component.operatorDisplayLabel('IS NULL')).toBe('Is null');
    expect(component.operatorDisplayLabel('IS NOT NULL')).toBe('Is not null');
  });

  it('saves null checks without requiring a value', () => {
    const root = component.rootGroup();
    component.addCondition(root.id, 0);
    const condition = component.rootGroup().rules[0] as any;
    component.onConditionVariableTextChange(condition.id, 'Age (real)');
    component.setConditionOperator(condition.id, 'IS NULL');

    component.saveFilters();

    expect(component.filterError()).toBeNull();
    expect(expStudio.setFilterLogic).toHaveBeenCalledWith(jasmine.objectContaining({
      rules: [jasmine.objectContaining({
        field: 'age',
        operator: 'is_null',
        value: null,
      })],
    }));
  });

  it('renders existing null checks as unary preview expressions', () => {
    component.filterLogic = {
      condition: 'OR',
      rules: [
        { field: 'age', operator: 'greater', value: 2 },
        { field: 'age', operator: 'is_null', value: null },
      ],
    };
    component.ngOnChanges({ filterLogic: { currentValue: component.filterLogic } as any });

    expect(component.previewExpression()).toContain('Age > 2');
    expect(component.previewExpression()).toContain('Age IS NULL');
  });
});
