import { AlgorithmRoles } from '../core/constants/algorithm.constants';
import { AlgorithmConfig } from '../models/algorithm-definition.model';
import { AlgorithmRulesService } from './algorithm-rules.service';

describe('AlgorithmRulesService', () => {
  let service: AlgorithmRulesService;
  const baseInputdata = {
    data_model: { label: 'data_model', desc: '', types: ['text'], required: true, multiple: false },
    datasets: { label: 'datasets', desc: '', types: ['text'], required: true, multiple: true },
  };

  const buildAlgo = (inputdata: Record<string, any>): AlgorithmConfig => ({
    name: 'mock_algo',
    label: 'mock_algo',
    description: '',
    requiredVariable: [],
    covariate: [],
    category: 'Mock',
    configSchema: [],
    isDisabled: false,
    inputdata: {
      ...baseInputdata,
      ...inputdata,
    },
  } as AlgorithmConfig);

  beforeEach(() => {
    service = new AlgorithmRulesService();
  });

  it('validates required roles from the JSON specification', () => {
    const algo = buildAlgo({
      y: { label: 'y', desc: '', types: ['real'], required: true, multiple: false },
      x: { label: 'x', desc: '', types: ['text'], required: false, multiple: true },
    });

    expect(service.isAlgorithmAvailable(algo, { y: [], x: [], filters: [] })).toBeFalse();
    expect(service.isAlgorithmAvailable(algo, {
      y: [{ code: 'v1', label: 'var1', type: 'real' } as any],
      x: [],
      filters: [],
    })).toBeTrue();
  });

  it('validates multiple=false from the JSON specification', () => {
    const algo = buildAlgo({
      y: { label: 'y', desc: '', types: ['real'], required: true, multiple: false },
    });

    const available = service.isAlgorithmAvailable(algo, {
      y: [
        { code: 'v1', label: 'var1', type: 'real' } as any,
        { code: 'v2', label: 'var2', type: 'real' } as any,
      ],
      x: [],
      filters: [],
    });

    expect(available).toBeFalse();
  });

  it('validates selected variable types from the JSON specification', () => {
    const algo = buildAlgo({
      y: { label: 'y', desc: '', types: ['real'], required: true, multiple: false },
    });

    expect(service.isAlgorithmAvailable(algo, {
      y: [{ code: 'v1', label: 'var1', type: 'text' } as any],
      x: [],
      filters: [],
    })).toBeFalse();

    expect(service.isAlgorithmAvailable(algo, {
      y: [{ code: 'v1', label: 'var1', type: 'real' } as any],
      x: [],
      filters: [],
    })).toBeTrue();
  });

  it('uses normalized metadata type aliases only for matching specification types', () => {
    const algo = buildAlgo({
      y: { label: 'y', desc: '', types: ['text'], required: true, multiple: false },
    });

    expect(service.isAlgorithmAvailable(algo, {
      y: [{ code: 'v1', label: 'var1', type: 'nominal' } as any],
      x: [],
      filters: [],
    })).toBeTrue();
  });

  it('does not apply algorithm-name-specific restrictions beyond the JSON specification', () => {
    const algo = {
      ...buildAlgo({
        y: { label: 'y', desc: '', types: ['real'], required: true, multiple: false },
        x: { label: 'x', desc: '', types: ['text'], required: true, multiple: true },
      }),
      name: 'anova_twoway',
    } as AlgorithmConfig;

    const availableWithOneCovariate = service.isAlgorithmAvailable(algo, {
      y: [{ code: 'age', label: 'Age', type: 'real' } as any],
      x: [{ code: 'sex', label: 'Sex', type: 'text' } as any],
      filters: [],
    });

    expect(availableWithOneCovariate).toBeTrue();
  });

  it('does not disable an algorithm when a filter variable is selected and filter types are payload metadata', () => {
    const algo = buildAlgo({
      y: { label: 'y', desc: '', types: ['real'], required: true, multiple: false },
      x: { label: 'x', desc: '', types: ['real'], required: false, multiple: true },
      filter: { label: 'filter', desc: '', types: ['json'], required: false, multiple: true },
    });

    const available = service.isAlgorithmAvailable(algo, {
      y: [{ code: 'v1', label: 'var1', type: 'real' } as any],
      x: [],
      filters: [{ code: 'f1', label: 'filter1', type: 'real' } as any],
    });

    expect(available).toBeTrue();
  });

  it('does not disable an algorithm when multiple filter variables contribute to one filter payload', () => {
    const algo = buildAlgo({
      y: { label: 'y', desc: '', types: ['real'], required: true, multiple: false },
      x: { label: 'x', desc: '', types: ['real'], required: false, multiple: true },
      filter: { label: 'filter', desc: '', types: ['json'], required: false, multiple: false },
    });

    const available = service.isAlgorithmAvailable(algo, {
      y: [{ code: 'v1', label: 'var1', type: 'real' } as any],
      x: [],
      filters: [
        { code: 'age', label: 'Age', type: 'real' } as any,
        { code: 'event_type', label: 'Event Type', type: 'text' } as any,
      ],
    });

    expect(available).toBeTrue();
  });

  it('requires an active filter payload when filter input is mandatory', () => {
    const algo = buildAlgo({
      y: { label: 'y', desc: '', types: ['real'], required: true, multiple: false },
      [AlgorithmRoles.FILTER]: { label: 'filter', desc: '', types: ['json'], required: true, multiple: true },
    });

    const withoutActiveFilter = service.isAlgorithmAvailable(algo, {
      y: [{ code: 'v1', label: 'var1', type: 'real' } as any],
      x: [],
      filters: [{ code: 'f1', label: 'filter1', type: 'real' } as any],
      hasActiveFilter: false,
    });

    const withActiveFilter = service.isAlgorithmAvailable(algo, {
      y: [{ code: 'v1', label: 'var1', type: 'real' } as any],
      x: [],
      filters: [{ code: 'f1', label: 'filter1', type: 'real' } as any],
      hasActiveFilter: true,
    });

    expect(withoutActiveFilter).toBeFalse();
    expect(withActiveFilter).toBeTrue();
  });

  it('enforces mandatory role when legacy notblank=true is provided', () => {
    const algo = buildAlgo({
      y: { label: 'y', desc: '', types: ['real'], notblank: true, multiple: false },
      x: { label: 'x', desc: '', types: ['text'], required: false, multiple: true },
    });

    const available = service.isAlgorithmAvailable(algo, {
      y: [],
      x: [],
      filters: [],
    });

    expect(available).toBeFalse();
  });
});
