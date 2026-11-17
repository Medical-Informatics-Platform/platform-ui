import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideEchartsCore } from 'ngx-echarts';
import { of } from 'rxjs';

import { Analysis } from '../../../models/analyses-dashboard.model';
import { AnalysisLabelService } from '../../../services/analysis-label.service';
import { AnalysesDashboardService } from '../../../services/analyses-dashboard.service';
import { AnalysisStudioService } from '../../../services/analysis-studio.service';
import { AnalysisDetailsComponent } from './analysis-detail.component';

describe('AnalysisDetailsComponent', () => {
  const analysis: Analysis = {
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
      imports: [AnalysisDetailsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideEchartsCore({ echarts: () => import('echarts') }),
        {
          provide: AnalysesDashboardService,
          useValue: {
            getAnalysisResult: () => of({
              result: { t_stat: -3.9, df: 120, p: 0.0001, mean_diff: -1.2, ci_lower: -1.8, ci_upper: -0.6 },
              analysisRequest: { algorithm: { x: ['sex'], y: ['age'], parameters: { groupA: 'M', groupB: 'F' } } },
            }),
          },
        },
        { provide: AnalysisLabelService, useValue: { getLabelMap: async () => ({}), getEnumMaps: async () => ({}) } },
        {
          provide: AnalysisStudioService,
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
    const fixture = TestBed.createComponent(AnalysisDetailsComponent);
    fixture.componentRef.setInput('selectedAnalysis', analysis);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.runParameters()).toEqual({ groupA: 'M', groupB: 'F' });
    const figures = (fixture.nativeElement as HTMLElement).querySelector('app-key-figures');
    expect(figures?.textContent).toContain('M − F');
  });
});
