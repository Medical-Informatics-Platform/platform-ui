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

describe('StatisticAnalysisPanelComponent transformation card open state', () => {
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

    /** What the real store does after any applied change: a new applied config re-runs hydration. */
    function echoAppliedConfig(marker: number): void {
        mockExpService.getAppliedDescriptivePreprocessing.mockReturnValue({});
        (mockExpService.appliedPreprocessingConfig as any).set({ marker });
        fixture.detectChanges();
    }

    function stepId(name: string): string {
        return (mockExpService.appliedTransformations() as any[]).find((step) => step.name === name)!.id;
    }

    it('keeps a folded nominal column folded when the applied config is re-read', () => {
        component.chooseTransformation('categorical');
        fixture.detectChanges();
        const id = stepId('categorical_column_creator');
        component.toggleTransformationDraft(component.draftForStep(id)!);
        expect(component.draftForStep(id)?.open).toBe(false);

        echoAppliedConfig(1);
        echoAppliedConfig(2);

        expect(component.draftForStep(id)?.open).toBe(false);
    });

    it('opens only the newly chosen transformation and folds the others', () => {
        component.chooseTransformation('categorical');
        fixture.detectChanges();
        const categoricalId = stepId('categorical_column_creator');

        component.chooseTransformation('kmeans');
        fixture.detectChanges();
        const kmeansId = stepId('kmeans_cluster_creator');

        expect(component.draftForStep(categoricalId)?.open).toBe(false);
        expect(component.isCardOpen(kmeansId)).toBe(true);

        component.chooseTransformation('categorical');
        fixture.detectChanges();
        expect(component.isCardOpen(kmeansId)).toBe(false);
        expect(component.draftForStep(categoricalId)?.open).toBe(false);
        const newest = component.transformationDrafts[component.transformationDrafts.length - 1];
        expect(newest.id).not.toBe(categoricalId);
        expect(newest.open).toBe(true);
    });

    it('restores stored nominal columns folded', () => {
        (mockExpService.appliedTransformations as any).set([{
            id: 'stored-1',
            name: 'categorical_column_creator',
            parameters: {
                new_column_names: ['age_band'],
                rules: { old: { condition: 'AND', rules: [{ id: 'age', field: 'age', type: 'real', input: 'number', operator: 'greater', value: 65 }] } },
                default_enumeration: null,
            },
        }]);
        echoAppliedConfig(3);

        expect(component.draftForStep('stored-1')).toBeDefined();
        expect(component.draftForStep('stored-1')?.open).toBe(false);
    });

    it('does not show the "Otherwise" fallback row in a nominal column card', () => {
        component.addStep('transformation');
        component.chooseTransformation('categorical');
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        expect(host.querySelector('.transformation-rules')).not.toBeNull();
        expect(host.querySelector('.transformation-rule-fallback')).toBeNull();
        expect(host.textContent).not.toContain('Otherwise — records that match no rule');
        expect(host.textContent).not.toContain('+ fallback');
    });
});
