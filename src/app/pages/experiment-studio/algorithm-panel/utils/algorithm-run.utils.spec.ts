import { AlgorithmAvailabilityDetail, AlgorithmConfig } from '../../../../models/algorithm-definition.model';
import { buildAlgorithmNeeds, readinessText, resolveRunAlgorithmNames } from './algorithm-run.utils';

const algorithm = (extra: Partial<AlgorithmConfig> = {}): AlgorithmConfig => ({
  name: 'linear_regression',
  label: 'Linear regression',
  description: '',
  requiredVariable: [],
  covariate: [],
  category: 'Regression',
  configSchema: [],
  isDisabled: false,
  ...extra,
});

const outcomeDetail: AlgorithmAvailabilityDetail = {
  role: 'y', label: 'Outcome', selectedCount: 0, minCount: 1, maxCount: 1, required: true,
  types: ['real'], stattypes: [], messages: ['Outcome needs exactly 1, selected 0.'], satisfied: false,
};

describe('algorithm run utils', () => {
  it('lists role needs, unavailable variables and run blockers in order', () => {
    const needs = buildAlgorithmNeeds({
      algorithm: algorithm(),
      details: [outcomeDetail],
      hasOutcome: false,
      unavailableVariablesReason: 'Remove variables not available in: ADNI',
      requirements: [{ id: 'preprocessing', message: 'Apply missing value preprocessing before running algorithms.', actionLabel: 'Go to preprocessing' }],
    });
    expect(needs.map((need) => [need.key, need.met, need.title])).toEqual([
      ['needs-y', false, 'Needs a numerical outcome'],
      ['unavailable-variables', false, 'Remove variables not available in: ADNI'],
      ['run-preprocessing', false, 'Apply missing value preprocessing before running algorithms.'],
    ]);
  });

  it('says an outcome is ignored by methods without one', () => {
    const [need] = buildAlgorithmNeeds({
      algorithm: algorithm({ inputdata: {} as AlgorithmConfig['inputdata'] }),
      details: [], hasOutcome: true, unavailableVariablesReason: '', requirements: [],
    });
    expect(need).toEqual({ key: 'needs-y', met: true, title: 'No outcome needed', messages: ['Your outcome is ignored'] });
  });

  it('summarizes readiness', () => {
    expect(readinessText({ algorithm: null, canRun: false, needs: [], y: [], x: [] })).toBe('Pick a method to continue');
    expect(readinessText({ algorithm: algorithm(), canRun: false, needs: [], y: [], x: [] })).toBe('Not ready to run yet');
    const needs = [
      { key: 'a', met: false, title: 'A', messages: ['one', 'two'] },
      { key: 'b', met: false, title: 'Fix B', messages: [], action: { id: 'availability' as const, message: 'Fix B', actionLabel: 'Go' } },
    ];
    expect(readinessText({ algorithm: algorithm(), canRun: false, needs, y: [], x: [] })).toBe('3 things left — one · two +1');
    expect(readinessText({ algorithm: algorithm(), canRun: true, needs: [], y: [{ code: 'age', label: 'Age' }], x: [{ code: 'sex' }] }))
      .toBe('Ready · Linear regression · y Age · 1 predictor');
  });

  it('resolves base, variant and sent names for cross-validation', () => {
    const catalog = {
      isCrossValidationOnly: (name: string) => name === 'svm_cv',
      getCrossValidationBase: (name: string) => (name.endsWith('_cv') ? name.slice(0, -3) : null),
      getCrossValidationVariant: (base: string) => (base === 'linear_regression' ? 'linear_regression_cv' : null),
    };
    expect(resolveRunAlgorithmNames('linear_regression', false, catalog)).toEqual({
      baseName: 'linear_regression', effectiveName: 'linear_regression', finalName: 'linear_regression', includeSplits: false,
    });
    expect(resolveRunAlgorithmNames('linear_regression', true, catalog)).toEqual({
      baseName: 'linear_regression', effectiveName: 'linear_regression_cv', finalName: 'linear_regression_cv', includeSplits: true,
    });
    expect(resolveRunAlgorithmNames('svm_cv', false, catalog)).toEqual({
      baseName: 'svm_cv', effectiveName: 'svm_cv', finalName: 'svm_cv', includeSplits: true,
    });
  });
});
