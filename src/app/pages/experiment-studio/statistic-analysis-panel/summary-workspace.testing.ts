import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideEchartsCore } from 'ngx-echarts';
import { StatisticAnalysisPanelComponent } from './statistic-analysis-panel.component';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentsDashboardService } from '../../../services/experiments-dashboard.service';
import { ChartBuilderService } from '../visualisations/charts/chart-builder.service';
import { PdfExportService } from '../../../services/pdf-export.service';
import { createSpyObj } from '../../../testing/spy-obj.testing';

export interface SummaryPanelHarness {
  fixture: ComponentFixture<StatisticAnalysisPanelComponent>;
  component: StatisticAnalysisPanelComponent;
  /** The step 1 "Raw data" preview: the shared summary workspace with kind 'source'. */
  workspace: () => HTMLElement;
}

/**
 * Renders the panel with a mocked describe response and opens the step 1 preview, so a spec
 * can query the shared summary workspace (variable rail, toolbar, statistics table).
 */
export async function createSummaryPanel(options: {
  featurewise: unknown[];
  variables: Array<{ code: string; label: string; type: string }>;
  datasetLabels?: Record<string, string>;
}): Promise<SummaryPanelHarness> {
  const datasetLabels = options.datasetLabels ?? { 'dataset-a': 'Dataset A' };
  const service = createSpyObj<ExperimentStudioService>('ExperimentStudioService', [
    'loadDescriptiveOverview',
    'loadOutlierReportPreview',
    'getAlgorithmResults',
    'getDatasetLabelMap',
    'setDataExclusionWarnings',
    'clearDataExclusionWarnings',
    'setAppliedDescriptivePreprocessing',
    'getAppliedDescriptivePreprocessing',
    'setFilters',
    'setFilterLogic',
    'filterVariableCodes',
    'buildTransformationDescribePreprocessing',
    'transformationSourceCodesForInput',
    'requestDatasets',
    'requestFilters',
    'getActiveDataModelCode',
    'upsertTransformation',
    'removeTransformation',
    'clearTransformations',
    'transformationDependents',
    'outputsInUse',
    'availableCreatorNames',
    'hasPreprocessingSpec',
    'catalogLoaded',
    'genericCatalogSteps',
    'genericStepDroppedCodes',
    'catalogStepSpec',
  ], {
    selectedVariables: signal([]),
    selectedFilters: signal([]),
    selectedDatasets: signal(Object.keys(datasetLabels)),
    selectedDataModel: signal({ code: 'Stroke', version: '3.7', variables: [] }),
    unavailableVariables: signal(new Map()),
    filterLogic: signal(null),
    editingExistingExperiment: () => false,
    appliedPreprocessingConfig: signal<Record<string, unknown> | null>(null),
    appliedTransformations: signal([] as { id: string; name: string; parameters: Record<string, unknown> }[]),
    backendAlgorithms: signal({}),
  });
  const mock = service as any;
  mock.loadDescriptiveOverview.mockReturnValue(of({ result: { featurewise: options.featurewise } }));
  mock.loadOutlierReportPreview.mockReturnValue(of({ result: { featurewise: [] } }));
  mock.getAlgorithmResults.mockReturnValue(of({ result: { histogram: [] } }));
  mock.getAppliedDescriptivePreprocessing.mockReturnValue(null);
  mock.getDatasetLabelMap.mockReturnValue(datasetLabels);
  mock.availableCreatorNames.mockReturnValue([]);
  mock.hasPreprocessingSpec.mockReturnValue(false);
  mock.catalogLoaded.mockReturnValue(true);
  mock.genericCatalogSteps.mockReturnValue([]);
  mock.genericStepDroppedCodes.mockReturnValue([]);
  mock.catalogStepSpec.mockReturnValue(null);
  mock.transformationDependents.mockReturnValue([]);
  mock.outputsInUse.mockReturnValue([]);
  mock.requestDatasets.mockReturnValue(Object.keys(datasetLabels));
  mock.requestFilters.mockReturnValue(null);
  mock.getActiveDataModelCode.mockReturnValue('Stroke:3.7');
  mock.buildTransformationDescribePreprocessing.mockReturnValue(null);
  mock.transformationSourceCodesForInput.mockReturnValue([]);
  mock.filterVariableCodes.mockReturnValue([]);

  const chartBuilder = createSpyObj<ChartBuilderService>('ChartBuilderService', ['getChartsForAlgorithm']);
  (chartBuilder as any).getChartsForAlgorithm.mockReturnValue([]);

  await TestBed.configureTestingModule({
    imports: [StatisticAnalysisPanelComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideEchartsCore({ echarts: () => import('echarts') }),
      { provide: ExperimentStudioService, useValue: service },
      { provide: ExperimentsDashboardService, useValue: { listKMeansExperiments: () => of([]), listPcaExperiments: () => of([]) } },
      { provide: ChartBuilderService, useValue: chartBuilder },
      { provide: PdfExportService, useValue: createSpyObj('PdfExportService', ['exportDescriptiveStatisticsPdf']) },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(StatisticAnalysisPanelComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  mock.selectedVariables.set(options.variables);
  fixture.detectChanges();
  if (!component.sectionOpen().source) component.toggleSourcePreview();
  fixture.detectChanges();

  return {
    fixture,
    component,
    workspace: () =>
      (fixture.nativeElement as HTMLElement).querySelector('[data-guide="analysis-source-summary"]') as HTMLElement,
  };
}
