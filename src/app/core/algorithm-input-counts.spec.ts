import {
  applyFallbackInputCounts,
  formatInputCountRange,
  readInputCount,
  resolveInputMaxCount,
  resolveInputMinCount,
} from './algorithm-input-counts';

describe('algorithm input counts', () => {
  it('reads snake_case and camelCase count fields', () => {
    expect(readInputCount({ min_count: 2 }, 'min_count')).toBe(2);
    expect(readInputCount({ minCount: 3 }, 'min_count')).toBe(3);
    expect(readInputCount({ max_count: '1' }, 'max_count')).toBe(1);
  });

  it('applies Binary GLMM fallback bounds when counts are missing', () => {
    const inputdata = applyFallbackInputCounts({
      y: { label: 'Y', desc: '', types: ['int'], required: true },
      x: { label: 'X', desc: '', types: ['real'], required: true },
    }, 'glmm_binary');

    expect(inputdata['y']).toEqual(jasmine.objectContaining({ max_count: 1 }));
    expect(inputdata['x']).toEqual(jasmine.objectContaining({ min_count: 2 }));
  });

  it('resolves Binary GLMM availability counts', () => {
    const y = { required: true };
    const x = { required: true };

    expect(resolveInputMaxCount(y, 'y', 'glmm_binary')).toBe(1);
    expect(resolveInputMinCount(x, 'x', 'glmm_binary')).toBe(2);
    expect(formatInputCountRange(1, 1)).toBe('exactly 1');
    expect(formatInputCountRange(2, null)).toBe('2+');
    expect(formatInputCountRange(2, 2)).toBe('exactly 2');
  });
});
