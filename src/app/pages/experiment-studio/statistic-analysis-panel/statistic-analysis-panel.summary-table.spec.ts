import { SummaryPanelHarness, createSummaryPanel } from './summary-workspace.testing';

/**
 * Contract: the statistics table of the shared data summary does not repeat itself. With one
 * dataset the pooled "All datasets" column is a copy of the dataset column, so it is not
 * drawn; with two or more it stays. The wrapper publishes the column count so the stylesheet
 * can size the table to its content.
 */
describe('StatisticAnalysisPanelComponent summary table', () => {
  let harness: SummaryPanelHarness;

  const variables = [{ code: 'age', label: 'Age', type: 'real' }];
  const ageRow = (dataset: string) => ({
    dataset,
    variable: 'age',
    data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 71, std: 4, min: 60, q1: 65, q2: 71, q3: 77, max: 90 },
  });

  const wrapper = () => harness.workspace().querySelector('.statistics-table-wrapper') as HTMLElement;
  const headers = () =>
    Array.from(wrapper().querySelectorAll('thead th')).map((cell) => (cell.textContent ?? '').trim());
  const groupRow = () => wrapper().querySelector('tr.statistics-metric-group td') as HTMLTableCellElement;
  const bodyRow = (metric: string) =>
    (Array.from(wrapper().querySelectorAll('tbody tr')) as HTMLTableRowElement[])
      .find((tr) => (tr.querySelector('.metric-cell')?.textContent ?? '').trim() === metric) as HTMLTableRowElement;

  describe('one dataset', () => {
    beforeEach(async () => {
      harness = await createSummaryPanel({
        variables,
        featurewise: [ageRow('dataset-a'), ageRow('all datasets')],
      });
    });

    it('draws the dataset column only', () => {
      expect(headers()).toEqual(['Metric', 'Dataset A']);
      expect(wrapper().querySelector('.statistics-col-rollup')).toBeNull();
      expect(bodyRow('Mean').querySelectorAll('td').length).toBe(2);
    });

    it('spans the group headings over the drawn columns', () => {
      expect(groupRow().getAttribute('colspan')).toBe('2');
    });

    it('publishes the column count to the stylesheet', () => {
      expect(wrapper().style.getPropertyValue('--summary-cols').trim()).toBe('1');
    });

    it('leaves the block itself complete, so exports keep the pooled column', () => {
      const block = harness.component.selectedStatisticBlock('source')!;
      expect(block.columns).toEqual(['dataset-a', 'all datasets']);
      expect(harness.component.summaryColumns(block)).toEqual(['dataset-a']);
    });
  });

  describe('two datasets', () => {
    beforeEach(async () => {
      harness = await createSummaryPanel({
        variables,
        datasetLabels: { 'dataset-a': 'Dataset A', 'dataset-b': 'Dataset B' },
        featurewise: [ageRow('dataset-a'), ageRow('dataset-b'), ageRow('all datasets')],
      });
    });

    it('keeps the pooled column beside the datasets', () => {
      expect(headers()).toEqual(['Metric', 'Dataset A', 'Dataset B', 'All datasets']);
      expect(wrapper().querySelectorAll('thead th.statistics-col-rollup').length).toBe(1);
      expect(bodyRow('Mean').querySelectorAll('td').length).toBe(4);
    });

    it('spans the group headings and publishes the column count', () => {
      expect(groupRow().getAttribute('colspan')).toBe('4');
      expect(wrapper().style.getPropertyValue('--summary-cols').trim()).toBe('3');
    });
  });

  it('keeps the pooled column when it is the only column of a block', async () => {
    harness = await createSummaryPanel({ variables, featurewise: [ageRow('all datasets')] });

    expect(headers()).toEqual(['Metric', 'All datasets']);
  });
});
