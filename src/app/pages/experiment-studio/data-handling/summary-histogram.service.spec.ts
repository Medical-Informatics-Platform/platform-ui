import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ChartBuilderService } from '../visualisations/charts/chart-builder.service';
import type { PivotBlock, SummaryKind } from './data-handling.models';
import { StatisticSummaryService } from './statistic-summary.service';
import { SummaryHistogramPorts, SummaryHistogramService } from './summary-histogram.service';

const age: PivotBlock = { code: 'age', name: 'Age', columns: ['all datasets'], rows: [] };
const sex: PivotBlock = { code: 'sex', name: 'Sex', columns: ['all datasets'], rows: [] };
const ageResponse = { result: { histogram: [{ var: 'age', bins: [0, 10, 20], counts: [4, 6] }] } };

function setup(overrides: Partial<SummaryHistogramPorts> = {}, selectedBlock: PivotBlock | null = age) {
  const studio = {
    getAlgorithmResults: vi.fn((..._args: unknown[]): Observable<unknown> => of(ageResponse)),
    selectedDatasets: () => ['d1'],
  };
  TestBed.configureTestingModule({
    providers: [
      StatisticSummaryService,
      SummaryHistogramService,
      { provide: ExperimentStudioService, useValue: studio },
      { provide: ChartBuilderService, useValue: { getChartsForAlgorithm: () => [] } },
    ],
  });
  const summaries = TestBed.inject(StatisticSummaryService);
  const service = TestBed.inject(SummaryHistogramService);
  const changed = vi.fn();
  service.ports = {
    selectedBlock: () => selectedBlock,
    target: (_kind, block) => ({
      code: block.code!,
      split: '',
      variable: () => ({ name: block.name, type: block.code === 'sex' ? 'nominal' : 'numeric' }),
      splitLabel: (code) => `by ${code}`,
    }),
    pendingPreprocessing: () => null,
    rawPreviewFilter: () => undefined,
    groupLabel: (_variable, value) => value,
    changed,
    ...overrides,
  };
  return { service, summaries, studio, changed };
}

describe('SummaryHistogramService', () => {
  it('requests a numerical histogram with the default drop and stores the answer', () => {
    const { service, summaries, studio, changed } = setup();
    service.ensure('raw', age);

    expect(studio.getAlgorithmResults).toHaveBeenCalledWith(
      'histogram',
      ['age'],
      null,
      { missing_values_handler: { strategies: { age: 'drop' } } },
      undefined,
      null,
    );
    const raw = summaries.get('raw');
    expect(raw.histogramDataByVariable['age']).toEqual(expect.objectContaining({ bins: ['0', '10', '20'], counts: [4, 6], variableName: 'Age' }));
    expect(raw.histogramLoadingByVariable['age']).toBe(false);
    expect(raw.histogramErrorByVariable['age']).toBe('');
    expect(raw.histogramSettledByVariable['age']).toBe(true);
    expect(changed).toHaveBeenCalled();
  });

  it('shows the loading state while a request is open and does not send a second one', () => {
    const open = new Subject<unknown>();
    const { service, summaries, studio } = setup();
    studio.getAlgorithmResults.mockReturnValue(open as never);
    service.ensure('raw', age);
    service.ensure('raw', age);

    expect(summaries.get('raw').histogramLoadingByVariable['age']).toBe(true);
    expect(studio.getAlgorithmResults).toHaveBeenCalledTimes(1);
    open.next(ageResponse);
    expect(summaries.get('raw').histogramLoadingByVariable['age']).toBe(false);
  });

  it('keeps one cache per surface and does not repeat a request it already has the data for', () => {
    const { service, summaries, studio } = setup();
    service.ensure('raw', age);
    service.ensure('raw', age);
    expect(studio.getAlgorithmResults).toHaveBeenCalledTimes(1);

    service.ensure('processed', age);
    expect(studio.getAlgorithmResults).toHaveBeenCalledTimes(2);
    expect(summaries.get('processed').histogramDataByVariable['age']).toBeDefined();
    expect(summaries.get('source').histogramDataByVariable['age']).toBeUndefined();
  });

  it('does nothing for a block the panel cannot map to a variable', () => {
    const { service, studio } = setup({ target: () => null });
    service.ensure('raw', age);
    expect(studio.getAlgorithmResults).not.toHaveBeenCalled();
  });

  it('builds a nominal histogram from the describe counts without a request', () => {
    const { service, summaries, studio } = setup();
    summaries.raw = {
      ...summaries.raw,
      featurewiseRows: [{ variable: 'sex', dataset: 'all datasets', data: { counts: { F: 3, M: 5 } } }] as never,
    };
    service.ensure('raw', sex);

    expect(studio.getAlgorithmResults).not.toHaveBeenCalled();
    expect(summaries.get('raw').histogramDataByVariable['sex']).toEqual(
      expect.objectContaining({ bins: ['F', 'M'], counts: [3, 5], variableName: 'Sex', variableType: 'nominal' }),
    );
  });

  describe('what each surface asks for', () => {
    it.each<[SummaryKind, unknown]>([
      ['source', null],
      ['raw', { condition: 'AND', rules: [] }],
      ['processed', undefined],
    ])('pins the %s surface to its cohort', (kind, expected) => {
      const { service, studio } = setup({ rawPreviewFilter: () => ({ condition: 'AND', rules: [] }) as never });
      service.ensure(kind, age);
      expect(studio.getAlgorithmResults.mock.calls[0][4]).toEqual(expected);
    });

    it('sends the pending rules of the processed surface and adds the drop for the plotted variable only', () => {
      const pending = { missing_values_handler: { strategies: { bmi: 'mean' } } };
      const { service, studio } = setup({ pendingPreprocessing: () => pending });
      service.ensure('processed', age);
      service.ensure('raw', age);

      expect(studio.getAlgorithmResults.mock.calls[0][3]).toEqual({ missing_values_handler: { strategies: { bmi: 'mean', age: 'drop' } } });
      expect(studio.getAlgorithmResults.mock.calls[1][3]).toEqual({ missing_values_handler: { strategies: { age: 'drop' } } });
      expect(pending).toEqual({ missing_values_handler: { strategies: { bmi: 'mean' } } });
    });

    it('caches a split next to the unsplit histogram and labels it from the panel', () => {
      const grouped = {
        result: { histogram: [
          { var: 'age', grouping_var: null, grouping_enum: null, bins: [0, 5, 10], counts: [3, 5] },
          { var: 'age', grouping_var: 'dataset', grouping_enum: 'd1', bins: [0, 5, 10], counts: [1, 2] },
        ] },
      };
      const { service, summaries, studio } = setup({
        target: (_kind, block) => ({
          code: block.code!,
          split: 'dataset',
          variable: () => ({ name: block.name, type: 'numeric' }),
          splitLabel: (code) => `by ${code}`,
        }),
        groupLabel: (_variable, value) => `Node ${value}`,
      });
      studio.getAlgorithmResults.mockReturnValue(of(grouped));
      service.ensure('raw', age);

      expect(studio.getAlgorithmResults.mock.calls[0][5]).toEqual(['dataset']);
      const stored = summaries.get('raw').histogramDataByVariable['age::dataset'];
      expect(stored?.splitLabel).toBe('by dataset');
      expect(stored?.groups?.map((group) => group.label)).toEqual(['Node d1']);
      expect(summaries.get('raw').histogramDataByVariable['age']).toBeUndefined();
    });
  });

  describe('when the answer is not data', () => {
    it('keeps the reason and does not retry until the surface is rebuilt', () => {
      const { service, summaries, studio } = setup();
      studio.getAlgorithmResults.mockReturnValue(of({ result: {} }));
      service.ensure('raw', age);
      service.ensure('raw', age);

      const raw = summaries.get('raw');
      expect(raw.histogramErrorByVariable['age']).toBe('No histogram data available for this variable.');
      expect(raw.histogramDataByVariable['age']).toBeUndefined();
      expect(studio.getAlgorithmResults).toHaveBeenCalledTimes(1);

      summaries.raw = { ...raw, histogramSettledByVariable: {} };
      service.ensure('raw', age);
      expect(studio.getAlgorithmResults).toHaveBeenCalledTimes(2);
    });

    it('reports a failed request and settles it', () => {
      const { service, summaries, studio } = setup();
      studio.getAlgorithmResults.mockReturnValue(throwError(() => new Error('down')));
      service.ensure('raw', age);

      const raw = summaries.get('raw');
      expect(raw.histogramErrorByVariable['age']).toBe('Failed to load histogram preview.');
      expect(raw.histogramLoadingByVariable['age']).toBe(false);
      expect(raw.histogramSettledByVariable['age']).toBe(true);
    });
  });

  describe('a surface that moved on', () => {
    it('drops the answer of a surface that was rebuilt while it was in flight', () => {
      const open = new Subject<unknown>();
      const { service, summaries, studio } = setup();
      studio.getAlgorithmResults.mockReturnValue(open as never);
      service.ensure('processed', age);

      summaries.processed = { ...summaries.processed, histogramRequestIdByVariable: {}, histogramLoadingByVariable: {} };
      open.next(ageResponse);
      expect(summaries.get('processed').histogramDataByVariable['age']).toBeUndefined();
    });

    it('stops listening when the panel is destroyed', () => {
      const open = new Subject<unknown>();
      const { service, studio } = setup();
      studio.getAlgorithmResults.mockReturnValue(open as never);
      service.ensure('raw', age);
      expect(open.observed).toBe(true);

      TestBed.resetTestingModule();
      expect(open.observed).toBe(false);
    });
  });

  describe('refreshActive', () => {
    it('loads the selected block only while the Histogram tab is showing', () => {
      const { service, summaries, studio } = setup();
      service.refreshActive('raw');
      expect(studio.getAlgorithmResults).not.toHaveBeenCalled();

      summaries.raw = { ...summaries.raw, activeTab: 'Histogram' };
      service.refreshActive('raw');
      expect(studio.getAlgorithmResults).toHaveBeenCalledTimes(1);
    });

    it('does nothing without a selected block', () => {
      const { service, summaries, studio } = setup({}, null);
      summaries.raw = { ...summaries.raw, activeTab: 'Histogram' };
      service.refreshActive('raw');
      expect(studio.getAlgorithmResults).not.toHaveBeenCalled();
    });
  });
});
