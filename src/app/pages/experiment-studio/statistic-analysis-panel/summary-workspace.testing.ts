import type { MockedObject } from 'vitest';
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

export interface PanelFixture {
  fixture: ComponentFixture<StatisticAnalysisPanelComponent>;
  component: StatisticAnalysisPanelComponent;
  mockExpService: MockedObject<ExperimentStudioService>;
  mockChartBuilder: MockedObject<ChartBuilderService>;
}

export interface SummaryPanelHarness extends PanelFixture {
  /** The step 1 "Raw data" preview: the shared summary workspace with kind 'source'. */
  workspace: () => HTMLElement;
}

/** Renders the panel against a mocked studio service whose transformation store behaves like the real one. */
export async function createPanelFixture(options: {
  featurewise?: unknown[];
  datasetLabels?: Record<string, string>;
} = {}): Promise<PanelFixture> {
  const datasetLabels = options.datasetLabels ?? { 'dataset-a': 'Dataset A' };
  const mockExpService = createSpyObj<ExperimentStudioService>('ExperimentStudioService', [
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
    'stepOutputNames',
  ], {
    selectedVariables: signal([]),
    selectedFilters: signal([]),
    selectedDatasets: signal(Object.keys(datasetLabels)),
    excludedDatasets: signal([]),
    selectedDataModel: signal({ code: 'Stroke', version: '3.7', variables: [] }),
    unavailableVariables: signal(new Map()),
    filterLogic: signal(null),
    editingExistingExperiment: () => false,
    appliedPreprocessingConfig: signal(null),
    appliedTransformations: signal([] as { id: string; name: string; parameters: Record<string, unknown> }[]),
    backendAlgorithms: signal({})
  });
  const mockChartBuilder = createSpyObj<ChartBuilderService>('ChartBuilderService', ['getChartsForAlgorithm']);
  mockChartBuilder.getChartsForAlgorithm.mockReturnValue([]);
  mockExpService.loadDescriptiveOverview.mockReturnValue(of({ result: { featurewise: options.featurewise ?? [] } }));
  mockExpService.loadOutlierReportPreview.mockReturnValue(of({ result: { featurewise: [] } }));
  mockExpService.getAlgorithmResults.mockReturnValue(of({ result: { histogram: [] } }));
  mockExpService.getAppliedDescriptivePreprocessing.mockReturnValue(null);
  mockExpService.getDatasetLabelMap.mockReturnValue(datasetLabels);
  mockExpService.buildTransformationDescribePreprocessing.mockImplementation((singletons: any) => {
    const steps: { name: string; parameters: Record<string, unknown> }[] = [];
    if (singletons && typeof singletons === 'object') {
      for (const [name, parameters] of Object.entries(singletons)) {
        if (parameters && typeof parameters === 'object') {
          steps.push({ name, parameters: parameters as Record<string, unknown> });
        }
      }
    }
    for (const step of mockExpService.appliedTransformations() as any[]) {
      if (Array.isArray(step.parameters?.new_column_names) && step.parameters.new_column_names.some((n: unknown) => String(n ?? '').trim())) {
        steps.push({ name: step.name, parameters: step.parameters });
      }
    }
    return steps.length ? steps : null;
  });
  mockExpService.transformationSourceCodesForInput.mockReturnValue([]);
  mockExpService.requestDatasets.mockReturnValue(Object.keys(datasetLabels));
  mockExpService.requestFilters.mockReturnValue(null);
  mockExpService.getActiveDataModelCode.mockReturnValue('Stroke:3.7');
  mockExpService.availableCreatorNames.mockReturnValue([
    'categorical_column_creator',
    'kmeans_cluster_creator',
  ]);
  mockExpService.hasPreprocessingSpec.mockImplementation((name: string) =>
    ['categorical_column_creator', 'kmeans_cluster_creator'].includes(name),
  );
  mockExpService.catalogLoaded.mockReturnValue(true);
  mockExpService.transformationDependents.mockReturnValue([]);
  mockExpService.outputsInUse.mockReturnValue([]);
  mockExpService.upsertTransformation.mockImplementation((step: any) => {
    const current = [...(mockExpService.appliedTransformations() as any[])];
    const index = current.findIndex((existing) => existing.id === step.id);
    const next = index === -1
      ? [...current, step]
      : current.map((existing, i) => (i === index ? step : existing));
    (mockExpService.appliedTransformations as any).set(next);
    return true;
  });
  mockExpService.clearTransformations.mockImplementation(() =>
    (mockExpService.appliedTransformations as any).set([]));
  mockExpService.removeTransformation.mockImplementation((id: string) => {
    const next = (mockExpService.appliedTransformations() as any[]).filter((step) => step.id !== id);
    (mockExpService.appliedTransformations as any).set(next);
  });
  // Mirrors the real collector: a group walks its rules, a condition is its field.
  mockExpService.filterVariableCodes.mockImplementation((logic: any) => {
    const codes = new Set<string>();
    const walk = (node: any) => {
      if (!node) return;
      if (Array.isArray(node.rules)) {
        node.rules.forEach(walk);
      } else if (node.field || node.id) {
        codes.add(String(node.field ?? node.id));
      }
    };
    walk(logic);
    return [...codes];
  });

  await TestBed.configureTestingModule({
    imports: [StatisticAnalysisPanelComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideEchartsCore({ echarts: () => import('echarts') }),
      { provide: ExperimentStudioService, useValue: mockExpService },
      { provide: ExperimentsDashboardService, useValue: { listKMeansExperiments: () => of([]), listPcaExperiments: () => of([]) } },
      { provide: ChartBuilderService, useValue: mockChartBuilder },
      { provide: PdfExportService, useValue: createSpyObj('PdfExportService', ['exportDescriptiveStatisticsPdf']) },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(StatisticAnalysisPanelComponent);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, mockExpService, mockChartBuilder };
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
  const panel = await createPanelFixture(options);
  const { fixture, component } = panel;
  (panel.mockExpService.selectedVariables as any).set(options.variables);
  fixture.detectChanges();
  if (!component.sectionOpen().source) component.toggleSourcePreview();
  fixture.detectChanges();

  return {
    ...panel,
    workspace: () =>
      (fixture.nativeElement as HTMLElement).querySelector('[data-guide="analysis-source-summary"]') as HTMLElement,
  };
}
