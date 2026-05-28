import { clipHistogramNullEdges, selectXTickValues, shouldClipNullEdges } from './histogram-chart';

describe('clipHistogramNullEdges', () => {
  it('trims leading and trailing null counts but keeps interior null bins', () => {
    expect(clipHistogramNullEdges(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      [44, null, 10, 22, 84, 266, 1214, 3106, 2802, 470, 206, 50, 46, null, null]
    )).toEqual({
      bins: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
      counts: [44, null, 10, 22, 84, 266, 1214, 3106, 2802, 470, 206, 50, 46],
    });
  });

  it('trims trailing null counts on edge-based histograms', () => {
    expect(clipHistogramNullEdges(
      [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      [null, 190000, 20000, 5000, null, null, null, null, null, null]
    )).toEqual({
      bins: ['10', '20', '30'],
      counts: [190000, 20000, 5000],
    });
  });

  it('keeps categorical bins aligned with counts', () => {
    expect(clipHistogramNullEdges(
      ['A', 'B', 'C', 'D'],
      [null, 3, 5, null]
    )).toEqual({
      bins: ['B', 'C'],
      counts: [3, 5],
    });
  });

  it('returns empty data when all counts are null', () => {
    expect(clipHistogramNullEdges([0, 10, 20], [null, null])).toEqual({
      bins: [],
      counts: [],
    });
  });
});

describe('selectXTickValues', () => {
  const denseBins = ['110', '115', '120', '125', '130', '135', '140', '145', '150', '155', '160', '165', '170', '175', '180', '185', '190', '195', '200', '205', '210', '215'];

  it('keeps all labels when there is enough width', () => {
    expect(selectXTickValues(['110', '115', '120'], 400, 3)).toEqual(['110', '115', '120']);
  });

  it('subsamples dense multi-digit numeric labels', () => {
    const ticks = selectXTickValues(denseBins, 529, 3);
    expect(ticks.length).toBeLessThan(denseBins.length);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    expect(ticks[0]).toBe('110');
    expect(ticks[ticks.length - 1]).toBe('215');
  });
});

describe('shouldClipNullEdges', () => {
  it('returns true for numeric bins', () => {
    expect(shouldClipNullEdges([0, 1, 2, 3])).toBeTrue();
  });

  it('returns false for nominal bins', () => {
    expect(shouldClipNullEdges(['yes', 'no', 'unknown'])).toBeFalse();
  });
});
