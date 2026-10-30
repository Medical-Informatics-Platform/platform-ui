import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ChartBuilderService } from '../visualisations/charts/chart-builder.service';
import type { PivotBlock, VariableRow } from './data-handling.models';
import { StatisticSummaryService } from './statistic-summary.service';
import { emptySummaryView, nextStatisticSelection, selectionKey } from './utils/summary-view.utils';

const age = { code: 'age', label: 'Age', type: 'real' } as VariableRow;
const sex = { code: 'sex', label: 'Sex', type: 'nominal', enumerations: [{ code: 'F', label: 'Female' }] } as VariableRow;

function setup() {
  const studio = {
    selectedVariables: signal([age, sex]),
    selectedFilters: signal([] as VariableRow[]),
    filterLogic: signal<unknown>(null),
    getDatasetLabelMap: () => ({}),
  };
  const charts = { getChartsForAlgorithm: vi.fn(() => []) };
  TestBed.configureTestingModule({
    providers: [
      StatisticSummaryService,
      { provide: ExperimentStudioService, useValue: studio },
      { provide: ChartBuilderService, useValue: charts },
    ],
  });
  return { service: TestBed.inject(StatisticSummaryService), studio, charts };
}

describe('StatisticSummaryService', () => {
  it('holds the three surfaces and keys the Raw summary on the cohort (or a pinned preview)', () => {
    const { service, studio } = setup();
    expect(service.get('source')).toBe(service.source);
    expect(service.get('raw')).toBe(service.raw);
    expect(service.get('processed').isLoading).toBe(false);
    const stored = service.rawKeyFor();
    studio.filterLogic.set({ condition: 'AND', rules: [] });
    expect(service.rawKeyFor()).not.toBe(stored);
    expect(service.rawKeyFor(null)).toBe(stored);
  });

  it('turns a describe response into a summary, keeping the view and resetting histogram caches', () => {
    const { service, charts } = setup();
    const current = { ...emptySummaryView(true), activeTab: 'Charts' as const, selectedStatisticKey: 'sex', histogramDataByVariable: { age: {} as never } };
    const response = {
      result: {
        featurewise: [
          { dataset: 'ds1', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 70 } },
          { dataset: 'all datasets', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 70 } },
          { dataset: 'all datasets', variable: 'sex', data: { num_dtps: 10, num_na: 0, num_total: 10, counts: { F: 6 } } },
        ],
      },
    };
    const view = service.fromDescribeResponse(response, current, [age, sex]);
    expect(view.isLoading).toBe(false);
    expect(view.activeTab).toBe('Charts');
    expect(view.selectedStatisticKey).toBe('sex');
    expect(view.histogramDataByVariable).toEqual({});
    expect(view.featurewiseRows.length).toBe(3);
    expect(view.nominalVariables.map((variable) => variable.code)).toEqual(['sex']);
    expect(view.nonNominalVariables.map((variable) => variable.code)).toEqual(['age']);
    expect(view.distributionSubTab).toBe('Numeric');
    expect(charts.getChartsForAlgorithm).toHaveBeenCalledTimes(1);
  });
});

describe('summary view helpers', () => {
  it('keeps a still-present selection, else selects the first block', () => {
    const blocks = [{ code: 'a', name: 'A' }, { name: 'B' }] as PivotBlock[];
    expect(nextStatisticSelection(blocks, 'B')).toBe('B');
    expect(nextStatisticSelection(blocks, 'gone')).toBe('a');
    expect(nextStatisticSelection([], 'a')).toBeNull();
  });

  it('keys a selection independently of variable order', () => {
    expect(selectionKey([age, sex], [], null)).toBe(selectionKey([sex, age], [], null));
    expect(selectionKey([age], [], null)).not.toBe(selectionKey([age], [], null, { applied: true }));
  });
});
