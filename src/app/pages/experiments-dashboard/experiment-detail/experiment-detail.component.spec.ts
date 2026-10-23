import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideEchartsCore } from 'ngx-echarts';
import { of } from 'rxjs';

import { Experiment } from '../../../models/experiments-dashboard.model';
import { ExperimentLabelService } from '../../../services/experiment-label.service';
import { ExperimentsDashboardService } from '../../../services/experiments-dashboard.service';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentDetailsComponent } from './experiment-detail.component';

describe('ExperimentDetailsComponent', () => {
  const experiment: Experiment = {
    id: 'run-1',
    name: 'Age by sex',
    dateCreated: new Date('2026-01-01T00:00:00.000Z'),
    status: 'success',
    algorithmName: 'ttest_independent',
    author: 'Marie Curie',
    authorEmail: 'marie.curie@chuv.ch',
    isShared: false,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExperimentDetailsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideEchartsCore({ echarts: () => import('echarts') }),
        {
          provide: ExperimentsDashboardService,
          useValue: {
            getExperimentResult: () => of({
              result: { t_stat: -3.9, df: 120, p: 0.0001, mean_diff: -1.2, ci_lower: -1.8, ci_upper: -0.6 },
              analysis: { algorithm: { x: ['sex'], y: ['age'], parameters: { groupA: 'M', groupB: 'F' } } },
            }),
          },
        },
        { provide: ExperimentLabelService, useValue: { getLabelMap: async () => ({}), getEnumMaps: async () => ({}) } },
        {
          provide: ExperimentStudioService,
          useValue: {
            backendAlgorithms: signal({}),
            algorithmAssignableVariables: () => [],
            selectedFilters: () => [],
            getDatasetLabelMap: () => ({}),
            formatPreprocessingConfig: () => '',
            formatPreprocessingEntries: () => [],
          },
        },
      ],
    }).compileComponents();
  });

  it('hands the run parameters to the result, which names the groups the t-test compared', async () => {
    const fixture = TestBed.createComponent(ExperimentDetailsComponent);
    fixture.componentRef.setInput('selectedExperiment', experiment);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.runParameters()).toEqual({ groupA: 'M', groupB: 'F' });
    const figures = (fixture.nativeElement as HTMLElement).querySelector('app-key-figures');
    expect(figures?.textContent).toContain('M − F');
  });
});
