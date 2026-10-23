import { emptySummaryView } from './summary-view.utils';

describe('emptySummaryView', () => {
  it('starts on the Table view with no data', () => {
    const view = emptySummaryView(true);
    expect(view.isLoading).toBe(true);
    expect(view.activeTab).toBe('Statistics');
    expect(view.data).toEqual([]);
    expect(view.selectedStatisticKey).toBeNull();
  });

  it('never shares caches between views', () => {
    const a = emptySummaryView(false);
    const b = emptySummaryView(false);
    expect(a.histogramDataByVariable).not.toBe(b.histogramDataByVariable);
    expect(a.data).not.toBe(b.data);
  });
});
