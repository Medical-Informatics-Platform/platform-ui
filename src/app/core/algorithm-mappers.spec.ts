import { getOutputSchema, mapSpecificationsToAlgorithmConfigs } from './algorithm-mappers';
describe('algorithm mappers', () => {
  it('provides output schemas for new Exaflow algorithms', () => {
    ['lmm', 'glmm_binary', 'glmm_ordinal', 'chi_squared', 'fisher_exact', 'outlier_report', 'quartiles', 'binned_mann_whitney_u_test'].forEach((name) => {
      const schema = getOutputSchema(name);
      expect(schema).toBeTruthy();
      expect(schema?.length).toBeGreaterThan(0);
    });
  });

  it('carries variable_types of a variable-picking parameter into its config field', () => {
    const field = { label: '', desc: '', types: ['text'] };
    const configs = mapSpecificationsToAlgorithmConfigs(
      { data_model: field, datasets: field, filters: field, variables: field },
      [],
      [
        {
          name: 'cox_regression_classical',
          label: 'Cox',
          desc: '',
          y: { label: 'y', desc: '', types: ['numerical'] },
          x: { label: 'x', desc: '', types: ['numerical', 'nominal', 'ordinal', 'binary'] },
          requires_validation_datasets: false,
          required_preprocessing: [],
          parameters: {
            event_var: {
              label: 'Event',
              desc: '',
              types: ['text'],
              enums: { type: 'input_var_names', source: ['x'] },
              variable_types: ['binary'],
            },
          },
        },
      ],
    );

    const eventVar = configs['cox_regression_classical'].configSchema.find((entry) => entry.key === 'event_var');
    expect(eventVar.variableTypes).toEqual(['binary']);
    expect(configs['cox_regression_classical'].inputdata?.x?.types).toEqual(['numerical', 'nominal', 'ordinal', 'binary']);
  });
});
