import type { MockedObject } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatisticAnalysisPanelComponent } from './statistic-analysis-panel.component';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentsDashboardService } from '../../../services/experiments-dashboard.service';
import { ChartBuilderService } from '../visualisations/charts/chart-builder.service';
import { PdfExportService } from '../../../services/pdf-export.service';
import { of } from 'rxjs';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideEchartsCore } from 'ngx-echarts';
import { createSpyObj } from '../../../testing/spy-obj.testing';

describe('StatisticAnalysisPanelComponent summary chart splits', () => {
    let component: StatisticAnalysisPanelComponent;
    let fixture: ComponentFixture<StatisticAnalysisPanelComponent>;
    let mockExpService: MockedObject<ExperimentStudioService>;
    let mockChartBuilder: MockedObject<ChartBuilderService>;
    let mockPdfService: MockedObject<PdfExportService>;

    beforeEach(async () => {
        mockExpService = createSpyObj('ExperimentStudioService', [
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
            'genericCatalogSteps',
            'genericStepDroppedCodes',
        ], {
            selectedVariables: signal([]),
            selectedFilters: signal([]),
            selectedDatasets: signal(['dataset-a']),
            excludedDatasets: signal([]),
            selectedDataModel: signal({ code: 'Stroke', version: '3.7', variables: [] }),
            unavailableVariables: signal(new Map()),
            filterLogic: signal(null),
            editingExistingExperiment: () => false,
            appliedPreprocessingConfig: signal(null),
            appliedTransformations: signal([] as { id: string; name: string; parameters: Record<string, unknown> }[]),
            backendAlgorithms: signal({})
        });
        mockChartBuilder = createSpyObj('ChartBuilderService', ['getChartsForAlgorithm']);
        mockChartBuilder.getChartsForAlgorithm.mockReturnValue([]);
        mockExpService.loadDescriptiveOverview.mockReturnValue(of({ result: { featurewise: [] } }));
        mockExpService.loadOutlierReportPreview.mockReturnValue(of({ result: { featurewise: [] } }));
        mockExpService.getAlgorithmResults.mockReturnValue(of({ result: { histogram: [] } }));
        mockExpService.getAppliedDescriptivePreprocessing.mockReturnValue(null);
        mockExpService.getDatasetLabelMap.mockReturnValue({ 'dataset-a': 'Dataset A' });
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
        mockExpService.requestDatasets.mockReturnValue(['dataset-a']);
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
        mockExpService.genericCatalogSteps.mockReturnValue([]);
        mockExpService.genericStepDroppedCodes.mockReturnValue([]);
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
        mockPdfService = createSpyObj('PdfExportService', ['exportDescriptiveStatisticsPdf']);

        await TestBed.configureTestingModule({
            imports: [StatisticAnalysisPanelComponent], // Standalone component
            providers: [
                provideZonelessChangeDetection(),
                provideEchartsCore({
                    echarts: () => import('echarts'),
                }),
                { provide: ExperimentStudioService, useValue: mockExpService },
                { provide: ExperimentsDashboardService, useValue: { listKMeansExperiments: () => of([]), listPcaExperiments: () => of([]) } },
                { provide: ChartBuilderService, useValue: mockChartBuilder },
                { provide: PdfExportService, useValue: mockPdfService }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(StatisticAnalysisPanelComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    function configureRawSummary() {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = {
            code: 'sex', label: 'Sex', type: 'nominal',
            enumerations: [{ code: 'female', label: 'Female' }, { code: 'male', label: 'Male' }],
        };
        mockExpService.loadDescriptiveOverview.mockReturnValue(of({
            result: {
                featurewise: [
                    { dataset: 'all datasets', variable: 'age', data: { num_dtps: 20, num_na: 0, num_total: 20, mean: 71, q1: 60, q2: 72, q3: 80, min: 20, max: 99, std: 11 } },
                    { dataset: 'dataset-a', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 70, q1: 59, q2: 71, q3: 79, min: 20, max: 98, std: 11 } },
                    { dataset: 'dataset-b', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 72, q1: 61, q2: 73, q3: 81, min: 25, max: 99, std: 12 } },
                    { dataset: 'all datasets', variable: 'sex', data: { counts: { female: 6, male: 4 }, num_dtps: 10, num_na: 1, num_total: 11 } },
                    { dataset: 'dataset-a', variable: 'sex', data: { counts: { female: 3, male: 2 }, num_dtps: 5, num_na: 0, num_total: 5 } },
                ],
            },
        }));
        (mockExpService.selectedVariables as any).set([age, sex]);
        fixture.detectChanges();
        component.goToSection('raw');
        fixture.detectChanges();
    }

    it('offers the histogram split for categorical variables too', () => {
        configureRawSummary();

        const nominal = component.statisticBlocks('raw', 'nominal');
        const numeric = component.statisticBlocks('raw', 'numeric');
        expect(nominal.length).toBeGreaterThan(0);
        expect(numeric.length).toBeGreaterThan(0);
        expect(component.canSplitSummaryHistogram('raw', nominal[0])).toBe(true);
        expect(component.canSplitSummaryHistogram('raw', numeric[0])).toBe(true);
    });

    it('plots the pooled "all datasets" box next to the per-dataset boxes', () => {
        configureRawSummary();

        const describeCalls = mockChartBuilder.getChartsForAlgorithm.mock.calls
            .filter(([algorithm]) => algorithm === 'describe');
        expect(describeCalls.length).toBeGreaterThan(0);
        const datasets = describeCalls.flatMap(([, response]) =>
            ((response as any)?.result?.featurewise ?? []).map((row: any) => row.dataset));
        expect(datasets).toContain('all datasets');
        expect(datasets).toContain('dataset-a');
    });
});
