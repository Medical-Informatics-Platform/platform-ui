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

describe('StatisticAnalysisPanelComponent copy and step layout', () => {
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

    function host(): HTMLElement {
        return fixture.nativeElement as HTMLElement;
    }

    function alphaOf(color: string): number {
        const match = color.match(/rgba?\(([^)]+)\)/);
        if (!match) return 1;
        const parts = match[1].split(',').map((part) => part.trim());
        return parts.length === 4 ? Number(parts[3]) : 1;
    }

    it('explains the pipeline in the new wording', () => {
        const intro = host().querySelector('.pipeline-header-title-group p')?.textContent ?? '';
        expect(intro).toContain('Get your selected data ready for analysis.');
        expect(intro).toContain('first look at the descriptive statistics of your raw data');
        expect(intro).toContain('Updated descriptive statistics are shown at each step when you click Preview.');
        expect(intro).not.toContain('read-only preview');
    });

    it('describes Raw data as the descriptive statistics of the unprocessed variables', () => {
        const raw = host().querySelector('[data-guide="analysis-source-data"] .pipeline-node-subtitle')?.textContent?.trim();
        expect(raw).toBe('Look at the descriptive statistics of your unprocessed selected variables.');
    });

    it('gives step title bars a tinted background and the step boxes a stronger border', () => {
        const node = host().querySelector<HTMLElement>('[data-guide="analysis-source-data"]')!;
        const header = node.querySelector<HTMLElement>('.pipeline-node-header')!;
        const background = getComputedStyle(header).backgroundColor;
        expect(background).toBe('rgb(238, 241, 253)');
        expect(alphaOf(getComputedStyle(node).borderTopColor)).toBeGreaterThanOrEqual(0.2);
    });

    it('lets the missing-values detail pane scroll when the window is short', () => {
        (mockExpService.selectedVariables as any).set([{ code: 'age', label: 'Age', type: 'real' }]);
        fixture.detectChanges();
        component.addStep('setup');
        fixture.detectChanges();

        const pane = host().querySelector<HTMLElement>('.preprocessing-workspace .preprocessing-detail-panel');
        expect(pane).not.toBeNull();
        // The workspace card clips at min(72vh, 760px); the pane must carry the same cap
        // so its own overflow-y: auto scrolls instead of the card cutting the coverage tiles.
        expect(getComputedStyle(pane!).overflowY).toBe('auto');
        expect(getComputedStyle(pane!).maxHeight).not.toBe('none');
    });
});
