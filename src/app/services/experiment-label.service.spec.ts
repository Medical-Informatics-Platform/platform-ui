import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { of } from 'rxjs';
import { ExperimentLabelService } from './experiment-label.service';
import { ExperimentStudioService } from './experiment-studio.service';

describe('ExperimentLabelService', () => {
  const model = {
    uuid: 'u',
    code: 'dementia',
    version: '1',
    label: 'Dementia',
    released: true,
    datasets: [{ code: '12', label: 'EDSD' }, { code: '13', label: 'PPMI' }],
    variables: [
      { code: 'dataset', label: 'Dataset', type: 'nominal', enumerations: [{ code: '12', label: 'EDSD' }] },
      { code: 'sex', label: 'Sex', type: 'binary', enumerations: [{ code: '0', label: 'Male' }, { code: '1', label: 'Female' }] },
    ],
    groups: [],
  };

  let service: ExperimentLabelService;

  beforeEach(() => {
    const studio = {
      loadAllDataModels: () => of([model]),
      convertToD3Hierarchy: (data: typeof model) => ({
        hierarchy: { label: data.label, children: data.variables },
        allVariables: data.variables,
        allDatasets: data.datasets,
      }),
    };
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: ExperimentStudioService, useValue: studio }],
    });
    service = TestBed.inject(ExperimentLabelService);
  });

  it('labels numeric dataset codes from the catalog dataset list, including datasets without a dataset CDE entry', async () => {
    const labels = await service.getLabelMap('dementia:1');
    expect(labels['12']).toBe('EDSD');
    expect(labels['13']).toBe('PPMI');
  });

  it('maps every categorical code to its level label for results', async () => {
    const maps = await service.getEnumMaps('dementia:1');
    expect(maps['sex']).toEqual({ '0': 'Male', '1': 'Female' });
  });
});
