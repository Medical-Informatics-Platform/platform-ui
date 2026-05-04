import { getOutputSchema, mapRawAlgorithmToAlgorithmConfig } from './algorithm-mappers';
import { RawAlgorithmDefinition } from '../models/backend-algorithms.model';

function rawAlgorithm(overrides: Partial<RawAlgorithmDefinition>): RawAlgorithmDefinition {
  return {
    name: 'mock',
    label: 'Mock',
    desc: 'Mock algorithm',
    enabled: true,
    inputdata: {
      data_model: { label: 'Data model', desc: '', types: ['text'], required: true, multiple: false },
      datasets: { label: 'Datasets', desc: '', types: ['text'], required: true, multiple: true },
      y: { label: 'Y', desc: '', types: ['real'], required: true, multiple: false },
      x: { label: 'X', desc: '', types: ['text'], required: true, multiple: true },
    },
    parameters: {},
    ...overrides,
  };
}

describe('algorithm mappers', () => {
  it('categorizes mixed-effects algorithms and preserves input-var enum metadata', () => {
    const config = mapRawAlgorithmToAlgorithmConfig(rawAlgorithm({
      name: 'lmm',
      label: 'Linear Mixed Model',
      parameters: {
        grouping_var: {
          label: 'Grouping variable',
          desc: 'Variable from x to use as grouping factor.',
          types: ['text'],
          required: true,
          multiple: false,
          enums: { type: 'input_var_names', source: ['x'] },
        },
      },
    }));

    expect(config.category).toBe('Regression');
    expect(config.configSchema[0]).toEqual(jasmine.objectContaining({
      key: 'grouping_var',
      type: 'select',
      enumType: 'input_var_names',
      enumSource: ['x'],
      options: [],
      required: true,
    }));
  });

  it('maps enum-driven GLMM parameters and ordinal category order', () => {
    const config = mapRawAlgorithmToAlgorithmConfig(rawAlgorithm({
      name: 'glmm_ordinal',
      label: 'Ordinal GLMM',
      parameters: {
        grouping_var: {
          label: 'Grouping variable',
          desc: '',
          types: ['text'],
          required: true,
          multiple: false,
          enums: { type: 'input_var_names', source: ['x'] },
        },
        category_order: {
          label: 'Ordinal category order',
          desc: '',
          types: ['text', 'int'],
          required: true,
          multiple: true,
        },
      },
    }));

    expect(config.category).toBe('Regression');
    expect(config.configSchema.find(field => field.key === 'grouping_var')?.type).toBe('select');
    expect(config.configSchema.find(field => field.key === 'category_order')).toEqual(jasmine.objectContaining({
      type: 'multi-select',
      required: true,
      multiple: true,
    }));
  });

  it('maps null parameter definitions to an empty config schema', () => {
    const chiSquared = mapRawAlgorithmToAlgorithmConfig(rawAlgorithm({
      name: 'chi_squared',
      label: 'Chi-Squared Test',
      parameters: null,
    }));

    expect(chiSquared.category).toBe('Statistical Tests');
    expect(chiSquared.configSchema).toEqual([]);
  });

  it('provides output schemas for new Exaflow algorithms', () => {
    ['lmm', 'glmm_binary', 'glmm_ordinal', 'chi_squared', 'fisher_exact'].forEach((name) => {
      const schema = getOutputSchema(name);
      expect(schema).toBeTruthy();
      expect(schema?.length).toBeGreaterThan(0);
    });
  });
});
