import { AlgorithmNames, AlgorithmRoles, VariableTypes } from '../core/constants/algorithm.constants';
import { AlgorithmConfig } from '../models/algorithm-definition.model';
import { AlgorithmRulesService } from './algorithm-rules.service';

describe('AlgorithmRulesService', () => {
  let service: AlgorithmRulesService;

  const buildAlgo = (name: string): AlgorithmConfig => ({
    name,
    label: name,
    description: '',
    requiredVariable: [],
    covariate: [],
    category: 'Mock',
    configSchema: [],
    isDisabled: false,
    inputdata: {
      data_model: { label: 'data_model', desc: '', types: ['text'], required: true, multiple: false },
      datasets: { label: 'datasets', desc: '', types: ['text'], required: true, multiple: true },
      y: { label: 'y', desc: '', types: ['real'], required: true, multiple: false },
      x: { label: 'x', desc: '', types: ['text'], required: true, multiple: true },
    },
  } as AlgorithmConfig);

  beforeEach(() => {
    service = new AlgorithmRulesService();
  });

  it('does not disable an algorithm when a filter variable is selected and filter types are payload metadata', () => {
    const algo = {
      name: 'mock_algo',
      label: 'Mock Algo',
      description: '',
      requiredVariable: [],
      covariate: [],
      category: 'Mock',
      configSchema: [],
      isDisabled: false,
      inputdata: {
        data_model: { label: 'data_model', desc: '', types: ['text'], required: true, multiple: false },
        datasets: { label: 'datasets', desc: '', types: ['text'], required: true, multiple: true },
        y: { label: 'y', desc: '', types: ['real'], required: true, multiple: false },
        x: { label: 'x', desc: '', types: ['real'], required: false, multiple: true },
        filter: { label: 'filter', desc: '', types: ['json'], required: false, multiple: true },
      },
    } as AlgorithmConfig;

    const available = service.isAlgorithmAvailable(algo, {
      y: [{ code: 'v1', label: 'var1', type: 'real' } as any],
      x: [],
      filters: [{ code: 'f1', label: 'filter1', type: 'real' } as any],
    });

    expect(available).toBeTrue();
  });

  it('still enforces required filter presence when required is true', () => {
    const algo = {
      name: 'mock_algo',
      label: 'Mock Algo',
      description: '',
      requiredVariable: [],
      covariate: [],
      category: 'Mock',
      configSchema: [],
      isDisabled: false,
      inputdata: {
        data_model: { label: 'data_model', desc: '', types: ['text'], required: true, multiple: false },
        datasets: { label: 'datasets', desc: '', types: ['text'], required: true, multiple: true },
        y: { label: 'y', desc: '', types: ['real'], required: true, multiple: false },
        [AlgorithmRoles.FILTER]: { label: 'filter', desc: '', types: ['json'], required: true, multiple: true },
      },
    } as AlgorithmConfig;

    const available = service.isAlgorithmAvailable(algo, {
      y: [{ code: 'v1', label: 'var1', type: 'real' } as any],
      x: [],
      filters: [],
    });

    expect(available).toBeFalse();
  });

  it('enforces mandatory role when legacy notblank=true is provided', () => {
    const algo = {
      ...buildAlgo('mock_notblank_algo'),
      inputdata: {
        data_model: { label: 'data_model', desc: '', types: ['text'], required: true, multiple: false },
        datasets: { label: 'datasets', desc: '', types: ['text'], required: true, multiple: true },
        y: { label: 'y', desc: '', types: ['real'], notblank: true, multiple: false },
        x: { label: 'x', desc: '', types: ['text'], required: false, multiple: true },
      },
    } as AlgorithmConfig;

    const available = service.isAlgorithmAvailable(algo, {
      y: [],
      x: [],
      filters: [],
    });

    expect(available).toBeFalse();
  });

  it('enforces strict 2-way ANOVA rule for canonical anova_twoway', () => {
    const algo = buildAlgo(AlgorithmNames.ANOVA_TWOWAY);

    const valid = service.isAlgorithmAvailable(algo, {
      y: [{ code: 'age', label: 'age', type: VariableTypes.REAL } as any],
      x: [
        { code: 'sex', label: 'sex', type: VariableTypes.NOMINAL } as any,
        { code: 'dataset', label: 'dataset', type: VariableTypes.TEXT } as any,
      ],
      filters: [],
    });

    const wrongCovariateCount = service.isAlgorithmAvailable(algo, {
      y: [{ code: 'age', label: 'age', type: VariableTypes.REAL } as any],
      x: [{ code: 'sex', label: 'sex', type: VariableTypes.NOMINAL } as any],
      filters: [],
    });

    const wrongCovariateType = service.isAlgorithmAvailable(algo, {
      y: [{ code: 'age', label: 'age', type: VariableTypes.REAL } as any],
      x: [
        { code: 'sex', label: 'sex', type: VariableTypes.NOMINAL } as any,
        { code: 'cholesterol', label: 'cholesterol', type: VariableTypes.REAL } as any,
      ],
      filters: [],
    });

    expect(valid).toBeTrue();
    expect(wrongCovariateCount).toBeFalse();
    expect(wrongCovariateType).toBeFalse();
  });

  it('returns requirement override for canonical anova_twoway', () => {
    const override = service.getAlgorithmRequirementOverrides({
      name: AlgorithmNames.ANOVA_TWOWAY,
      inputdata: {},
    });

    expect(override?.x).toContain('exactly 2');
    expect(override?.x).toContain('types: nominal');
    expect(override?.x).not.toContain('types: text');
    expect(override?.y).toContain('exactly 1');
  });
});
