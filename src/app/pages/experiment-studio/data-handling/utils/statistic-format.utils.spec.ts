import {
  formatInteger,
  formatNumber,
  formatOutlierBound,
  formatOutlierPercentage,
  formatPercent,
  parseNumber,
} from './statistic-format.utils';

describe('statistic-format utils', () => {
  it('parses summary cells with grouping commas and a trailing percent', () => {
    expect(parseNumber('1,234.5')).toBe(1234.5);
    expect(parseNumber('12%')).toBe(12);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('N/A')).toBeNull();
    expect(parseNumber(null)).toBeNull();
  });

  it('formats canonical pivot cells with two decimals and no grouping', () => {
    expect(formatNumber(1234.5)).toBe('1234.50');
    expect(formatNumber('1,234.5')).toBe('1234.50');
    expect(formatNumber('')).toBe('N/A');
    expect(formatNumber('abc')).toBe('abc');
  });

  it('formats integers, bounds and percentages with their own empty markers', () => {
    expect(formatInteger(4.6)).toBe('5');
    expect(formatInteger(undefined, '-')).toBe('-');
    expect(formatOutlierBound(null)).toBe('-');
    expect(formatPercent(5)).toBe('5.0%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(42.4)).toBe('42%');
    expect(formatOutlierPercentage('3.14159')).toBe('3.14%');
    expect(formatOutlierPercentage('x')).toBe('-');
  });
});
