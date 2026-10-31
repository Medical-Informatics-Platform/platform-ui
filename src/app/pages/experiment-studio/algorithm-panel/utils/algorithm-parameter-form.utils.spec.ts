import { AlgorithmConfig } from '../../../../models/algorithm-definition.model';
import { EnrichedParameterField } from '../algorithm-panel.models';
import {
  allowsDecimal,
  buildParameterForm,
  enrichParameterSchema,
  enumOptionsForVariableCode,
  isAdvancedField,
  multiSelectValues,
  nonBlankString,
  normalizeParameterValues,
  optionLabel,
  parameterFieldLabel,
  parameterFormSignature,
} from './algorithm-parameter-form.utils';

const algorithm = (name: string, configSchema: AlgorithmConfig['configSchema']): AlgorithmConfig => ({
  name,
  label: name,
  description: '',
  requiredVariable: [],
  covariate: [],
  category: 'Test',
  configSchema,
  isDisabled: false,
});

const field = (overrides: Partial<EnrichedParameterField>): EnrichedParameterField => ({
  key: 'k',
  label: 'K',
  desc: '',
  ...overrides,
});

describe('algorithm parameter form utils', () => {
  const sex = { code: 'sex', label: 'Sex', enumerations: [{ code: 'M', label: 'Male' }, { code: 'F', label: 'Female' }, { code: 'M', label: 'Dup' }] };
  const age = { code: 'age', label: 'Age' };

  it('reads blank values as null and options by label, name, then the option itself', () => {
    expect(nonBlankString('  ')).toBeNull();
    expect(nonBlankString(0)).toBe('0');
    expect(optionLabel({ code: 'M', label: 'Male' })).toBe('Male');
    expect(optionLabel({ code: 'M', name: 'Masc' })).toBe('Masc');
    expect(optionLabel('efron')).toBe('efron');
    expect(optionLabel(3)).toBe('3');
  });

  it('treats real, alpha, tol and mu as decimal fields and defaulted optionals as advanced', () => {
    expect(allowsDecimal({ key: 'alpha' })).toBe(true);
    expect(allowsDecimal({ key: 'k', types: ['real'] })).toBe(true);
    expect(allowsDecimal({ key: 'k', types: ['int'] })).toBe(false);
    expect(isAdvancedField({ key: 'alpha', default: 0.05 })).toBe(true);
    expect(isAdvancedField({ key: 'alpha', default: 0.05, required: true })).toBe(false);
    expect(isAdvancedField({ key: 'k', advanced: false, default: 1 })).toBe(false);
  });

  it('names the covariate in group field labels', () => {
    expect(parameterFieldLabel(field({ key: 'groupA', label: 'Group A' }), sex)).toBe('Group A (Sex)');
    expect(parameterFieldLabel(field({ key: 'alpha', label: 'Alpha' }), sex)).toBe('Alpha');
  });

  it('lists distinct enumeration codes of a selected variable', () => {
    expect(enumOptionsForVariableCode('sex', [age, sex])).toEqual([{ code: 'M', label: 'Male' }, { code: 'F', label: 'Female' }]);
    expect(enumOptionsForVariableCode('missing', [age, sex])).toEqual([]);
  });

  it('resolves options from the selected variables and fills labels', () => {
    const schema = enrichParameterSchema(
      algorithm('cox_regression_classical', [
        { key: 'event_var', type: 'select', enumType: 'input_var_names', enumSource: ['x'], required: 'true' },
        { key: 'positive_class', type: 'text' },
        { key: 'levels', type: 'select', options: ['y'] },
        { key: 'max_iter', label: '  ', type: 'number', default: 100 },
      ]),
      { y: [sex], x: [age, sex], eventVarCode: 'sex', withCrossValidationFolds: true },
    );
    const byKey = Object.fromEntries(schema.map((f) => [f.key, f]));
    expect(byKey['event_var'].options).toEqual([{ code: 'age', label: 'Age' }, { code: 'sex', label: 'Sex' }]);
    expect(byKey['event_var'].required).toBe(true);
    expect(byKey['positive_class']).toEqual(expect.objectContaining({
      type: 'select',
      required: true,
      desc: 'Event level mapped to 1; other observed levels are mapped to 0.',
    }));
    expect(byKey['levels'].options).toEqual(sex.enumerations);
    expect(byKey['max_iter'].label).toBe('Max Iter');
    expect(byKey['n_splits']).toEqual(expect.objectContaining({ label: 'Folds', type: 'number', min: 2, default: 5 }));
  });

  it('defaults category_order to every outcome level', () => {
    const [order] = enrichParameterSchema(algorithm('ordinal', [{ key: 'category_order', type: 'multi-select' }]), {
      y: [sex], x: [], eventVarCode: null, withCrossValidationFolds: false,
    });
    expect(order.default).toEqual(['M', 'F', 'M']);
  });

  it('changes the form signature with cross-validation and options only', () => {
    const schema = [field({ key: 'a', type: 'select', options: [{ code: 'x' }] })];
    expect(parameterFormSignature('m', false, schema)).toBe(parameterFormSignature('m', false, [{ ...schema[0], label: 'Other' }]));
    expect(parameterFormSignature('m', true, schema)).not.toBe(parameterFormSignature('m', false, schema));
  });

  it('starts controls from stored, backend, then UI defaults and validates integers', () => {
    const form = buildParameterForm([
      field({ key: 'alpha', type: 'number' }),
      field({ key: 'k', type: 'number', types: ['int'] }),
      field({ key: 'flag', type: 'checkbox' }),
      field({ key: 'name', type: 'text', default: 'x' }),
    ], { k: '2.5' });
    expect(form.getRawValue()).toEqual({ alpha: 0.05, k: 2.5, flag: false, name: 'x' });
    expect(form.get('k')?.hasError('pattern')).toBe(true);
    expect(form.get('alpha')?.touched).toBe(true);
    expect(form.get('k')?.touched).toBe(false);
  });

  it('parses numbers, serializes enum codes and drops empty optionals', () => {
    const schema = [
      field({ key: 'n', type: 'number' }),
      field({ key: 'level', type: 'select', options: [{ code: 'M', label: 'Male' }] }),
      field({ key: 'note', type: 'text' }),
    ];
    expect(normalizeParameterValues({ n: ' 3 ', level: 'Male', note: '' }, schema)).toEqual({ n: 3, level: 'M' });
  });

  it('reads multi-select values from arrays and comma lists', () => {
    expect(multiSelectValues(['a', 1])).toEqual(['a', '1']);
    expect(multiSelectValues('a, b,,')).toEqual(['a', 'b']);
    expect(multiSelectValues(null)).toEqual([]);
  });
});
