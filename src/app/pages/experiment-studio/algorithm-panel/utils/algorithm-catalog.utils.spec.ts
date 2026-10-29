import { AlgorithmConfig } from '../../../../models/algorithm-definition.model';
import { countAlgorithms, filterAlgorithmCategories, nextCollapsedCategories, runnableCount } from './algorithm-catalog.utils';

const algo = (name: string, isDisabled = false, extra: Partial<AlgorithmConfig> = {}): AlgorithmConfig => ({
  name,
  label: name.replace(/_/g, ' '),
  description: '',
  requiredVariable: [],
  covariate: [],
  category: 'Test',
  configSchema: [],
  isDisabled,
  ...extra,
});

describe('algorithm catalog utils', () => {
  const grouped = {
    Regression: [algo('logistic_regression', true), algo('linear_regression')],
    Tests: [algo('ttest', true, { flags: ['paired'] })],
  };

  it('keeps runnable methods only, or all with runnable first', () => {
    expect(filterAlgorithmCategories(grouped, true, '')).toEqual([{ name: 'Regression', algorithms: [grouped.Regression[1]] }]);
    const all = filterAlgorithmCategories(grouped, false, '');
    expect(all.map((c) => c.algorithms.map((a) => a.name))).toEqual([['linear_regression', 'logistic_regression'], ['ttest']]);
  });

  it('matches every search term across label, name and flags', () => {
    expect(filterAlgorithmCategories(grouped, false, '  PAIRED ').map((c) => c.name)).toEqual(['Tests']);
    expect(filterAlgorithmCategories(grouped, false, 'linear regression').flatMap((c) => c.algorithms.map((a) => a.name)))
      .toEqual(['linear_regression']);
    expect(filterAlgorithmCategories(grouped, false, 'nothing')).toEqual([]);
  });

  it('counts all and runnable methods', () => {
    expect(countAlgorithms(grouped)).toEqual({ all: 3, active: 1 });
    expect(countAlgorithms(null)).toEqual({ all: 0, active: 0 });
    expect(runnableCount({ name: 'Regression', algorithms: grouped.Regression })).toBe(1);
  });

  describe('nextCollapsedCategories', () => {
    const categories = filterAlgorithmCategories(grouped, false, '');

    it('collapses groups with nothing runnable and opens the rest', () => {
      const next = nextCollapsedCategories(categories, null, true, new Set(), new Set());
      expect([...next]).toEqual(['Tests']);
    });

    it('reveals the group of a new selection but leaves user-toggled groups alone', () => {
      expect([...nextCollapsedCategories(categories, 'ttest', true, new Set(['Tests']), new Set())]).toEqual([]);
      const collapsed = new Set(['Regression']);
      expect(nextCollapsedCategories(categories, null, false, collapsed, new Set(['Regression', 'Tests']))).toBe(collapsed);
    });
  });
});
