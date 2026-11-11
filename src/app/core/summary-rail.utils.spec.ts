import { orderByMissing, railCountLabel, railStep, visibleSummaryColumns } from './summary-rail.utils';

describe('summary rail utils', () => {
  describe('railCountLabel', () => {
    it('names the count when nothing is hidden', () => {
      expect(railCountLabel(3, 3)).toBe('3 variables');
      expect(railCountLabel(1, 1)).toBe('1 variable');
    });

    it('says how many of the total the search leaves', () => {
      expect(railCountLabel(2, 5)).toBe('2 of 5 variables');
      expect(railCountLabel(1, 4)).toBe('1 of 4 variables');
      expect(railCountLabel(0, 5)).toBe('0 of 5 variables');
    });
  });

  describe('orderByMissing', () => {
    const shares: Record<string, number | null> = { a: 0.1, b: 0.5, c: null, d: 0.5, e: 0 };
    const shareOf = (item: string) => shares[item];

    it('puts the largest share first, keeps ties in place and unpriced items last', () => {
      expect(orderByMissing(['a', 'b', 'c', 'd', 'e'], shareOf)).toEqual(['b', 'd', 'a', 'e', 'c']);
    });

    it('returns a new array and leaves the input alone', () => {
      const input = ['a', 'b'];
      const output = orderByMissing(input, shareOf);
      expect(output).toEqual(['b', 'a']);
      expect(input).toEqual(['a', 'b']);
      expect(output).not.toBe(input);
    });
  });

  describe('railStep', () => {
    it('moves one row and stops at the ends', () => {
      expect(railStep('ArrowDown', 0, 3)).toBe(1);
      expect(railStep('ArrowDown', 2, 3)).toBe(2);
      expect(railStep('ArrowUp', 2, 3)).toBe(1);
      expect(railStep('ArrowUp', 0, 3)).toBe(0);
    });

    it('jumps to the first and last row', () => {
      expect(railStep('Home', 2, 3)).toBe(0);
      expect(railStep('End', 0, 3)).toBe(2);
    });

    it('starts at the first row when nothing is selected', () => {
      expect(railStep('ArrowDown', -1, 3)).toBe(0);
      expect(railStep('ArrowUp', -1, 3)).toBe(0);
    });

    it('ignores other keys and an empty rail', () => {
      expect(railStep('Enter', 0, 3)).toBeNull();
      expect(railStep('a', 0, 3)).toBeNull();
      expect(railStep('ArrowDown', 0, 0)).toBeNull();
    });
  });

  describe('visibleSummaryColumns', () => {
    const isRollup = (column: string) => column === 'all';

    it('drops the pooled column beside a single dataset', () => {
      expect(visibleSummaryColumns(['a', 'all'], isRollup)).toEqual(['a']);
      expect(visibleSummaryColumns(['all', 'a'], isRollup)).toEqual(['a']);
    });

    it('keeps the pooled column beside two or more datasets', () => {
      expect(visibleSummaryColumns(['a', 'b', 'all'], isRollup)).toEqual(['a', 'b', 'all']);
    });

    it('keeps the pooled column when it is the only one', () => {
      expect(visibleSummaryColumns(['all'], isRollup)).toEqual(['all']);
      expect(visibleSummaryColumns([], isRollup)).toEqual([]);
    });
  });
});
