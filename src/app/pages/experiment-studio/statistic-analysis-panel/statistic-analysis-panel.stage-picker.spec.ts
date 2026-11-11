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

/**
 * Contract: an opened stage draws the stations of the steps that are applied or were opened
 * this visit, and nothing else. Every step it could still add sits behind one add row at the
 * end of the stage, the same add-step menu the collapsed rail ends in. No dashed "Add ..."
 * button per step, and no separate chooser for the column creators.
 */
describe('StatisticAnalysisPanelComponent add-step menu in an opened stage', () => {
    let component: StatisticAnalysisPanelComponent;
    let fixture: ComponentFixture<StatisticAnalysisPanelComponent>;
    let mockExpService: MockedObject<ExperimentStudioService>;

    const age = { code: 'age', label: 'Age', type: 'real' };

    /** Round-trips the applied config the way the real service does. */
    function seedAppliedConfig(config: Record<string, unknown> | null): void {
        (mockExpService.appliedPreprocessingConfig as any).set(config);
        mockExpService.getAppliedDescriptivePreprocessing.mockReturnValue(config as never);
        // Mirror creators into the ordered store when the seed carries them. Singleton-only
        // writes (Apply preprocessing) must not wipe transformation steps already in the store.
        const hasCreators = !!config && (
            'categorical_column_creator' in config
            || 'kmeans_cluster_creator' in config
            || 'pca_column_creator' in config
        );
        if (!hasCreators) return;
        const steps: { id: string; name: string; parameters: Record<string, unknown> }[] = [];
        const categorical = config?.['categorical_column_creator'];
        for (const parameters of Array.isArray(categorical) ? categorical : categorical ? [categorical] : []) {
            steps.push({ id: crypto.randomUUID(), name: 'categorical_column_creator', parameters: parameters as Record<string, unknown> });
        }
        const kmeans = config?.['kmeans_cluster_creator'];
        if (kmeans && typeof kmeans === 'object') {
            steps.push({ id: 'kmeans-seed', name: 'kmeans_cluster_creator', parameters: kmeans as Record<string, unknown> });
        }
        const pca = config?.['pca_column_creator'];
        if (pca && typeof pca === 'object') {
            steps.push({ id: crypto.randomUUID(), name: 'pca_column_creator', parameters: pca as Record<string, unknown> });
        }
        (mockExpService.appliedTransformations as any).set(steps);
    }

    /** A stage card of the pipeline canvas, as rendered. */
    function pipelineCard(stage: 'analysis-preprocessing' | 'analysis-transformation'): HTMLElement {
        return (fixture.nativeElement as HTMLElement).querySelector(`[data-guide="${stage}"]`) as HTMLElement;
    }

    /**
     * The add-step menu of a stage: the rail's while the stage is collapsed, the stage's own once
     * the stage is open.
     */
    function menuTrigger(card: HTMLElement, where: 'rail' | 'stage'): HTMLButtonElement | null {
        const scope = where === 'rail' ? '.pipeline-subnodes-tree' : '.pipeline-node-body';
        return card.querySelector(`${scope} app-step-picker .step-picker-trigger`);
    }

    /** The steps a menu offers. Opens the menu first when it is closed. */
    function menuOptions(card: HTMLElement, where: 'rail' | 'stage'): HTMLButtonElement[] {
        const trigger = menuTrigger(card, where);
        if (!trigger) return [];
        if (trigger.getAttribute('aria-expanded') !== 'true') {
            trigger.click();
            fixture.detectChanges();
        }
        const scope = where === 'rail' ? '.pipeline-subnodes-tree' : '.pipeline-node-body';
        return Array.from(card.querySelectorAll(`${scope} app-step-picker .step-picker-option`)) as HTMLButtonElement[];
    }

    /** Engine names of the steps a menu offers, in menu order. */
    function menuSteps(card: HTMLElement, where: 'rail' | 'stage'): (string | undefined)[] {
        return menuOptions(card, where).map((option) => option.dataset['step']);
    }

    function pick(card: HTMLElement, where: 'rail' | 'stage', step: string): void {
        const option = menuOptions(card, where).find((candidate) => candidate.dataset['step'] === step);
        expect(option, `menu option ${step}`).toBeTruthy();
        option!.click();
        fixture.detectChanges();
    }

    /** Titles of the stations an opened stage draws, top to bottom. */
    function stationTitles(card: HTMLElement): string[] {
        return Array.from(card.querySelectorAll('.preprocessing-shell .station-card-title'))
            .map((title) => title.textContent?.trim() ?? '');
    }

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
            'genericCatalogSteps',
            'genericStepDroppedCodes',
            'catalogStepSpec',
        ], {
            selectedVariables: signal([]),
            selectedFilters: signal([]),
            selectedDatasets: signal(['dataset-a']),
            selectedDataModel: signal({ code: 'Stroke', version: '3.7', variables: [] }),
            unavailableVariables: signal(new Map()),
            filterLogic: signal(null),
            editingExistingExperiment: () => false,
            appliedPreprocessingConfig: signal<Record<string, unknown> | null>(null),
            appliedTransformations: signal([] as { id: string; name: string; parameters: Record<string, unknown> }[]),
            backendAlgorithms: signal({})
        });
        mockExpService.loadDescriptiveOverview.mockReturnValue(of({ result: { featurewise: [] } }));
        mockExpService.loadOutlierReportPreview.mockReturnValue(of({ result: { featurewise: [] } }));
        mockExpService.getAlgorithmResults.mockReturnValue(of({ result: { histogram: [] } }));
        mockExpService.getAppliedDescriptivePreprocessing.mockReturnValue(null);
        mockExpService.getDatasetLabelMap.mockReturnValue({ 'dataset-a': 'Dataset A' });
        mockExpService.availableCreatorNames.mockReturnValue([
            'categorical_column_creator',
            'kmeans_cluster_creator',
        ]);
        mockExpService.hasPreprocessingSpec.mockImplementation((name: string) =>
            ['categorical_column_creator', 'kmeans_cluster_creator', 'variable_transformer', 'variable_scaler'].includes(name),
        );
        mockExpService.catalogLoaded.mockReturnValue(true);
        mockExpService.genericCatalogSteps.mockReturnValue([]);
        mockExpService.genericStepDroppedCodes.mockReturnValue([]);
        mockExpService.catalogStepSpec.mockReturnValue(null);
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
            (mockExpService.appliedTransformations as any).set(
                (mockExpService.appliedTransformations() as any[]).filter((step) => step.id !== id),
            );
        });
        mockExpService.requestDatasets.mockReturnValue(['dataset-a']);
        mockExpService.requestFilters.mockReturnValue(null);
        mockExpService.getActiveDataModelCode.mockReturnValue('Stroke:3.7');
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
                if (Array.isArray(step.parameters?.new_column_names)
                    && step.parameters.new_column_names.some((n: unknown) => String(n ?? '').trim())) {
                    steps.push({ name: step.name, parameters: step.parameters });
                }
            }
            return steps.length ? steps : null;
        });
        mockExpService.transformationSourceCodesForInput.mockReturnValue([]);
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
        mockExpService.setAppliedDescriptivePreprocessing.mockImplementation((config: unknown) =>
            seedAppliedConfig(config as Record<string, unknown> | null));

        await TestBed.configureTestingModule({
            imports: [StatisticAnalysisPanelComponent],
            providers: [
                provideZonelessChangeDetection(),
                provideEchartsCore({ echarts: () => import('echarts') }),
                { provide: ExperimentStudioService, useValue: mockExpService },
                { provide: ExperimentsDashboardService, useValue: { listKMeansExperiments: () => of([]), listPcaExperiments: () => of([]) } },
                { provide: ChartBuilderService, useValue: (() => { const s = createSpyObj('ChartBuilderService', ['getChartsForAlgorithm']); s.getChartsForAlgorithm.mockReturnValue([]); return s; })() },
                { provide: PdfExportService, useValue: createSpyObj('PdfExportService', ['exportDescriptiveStatisticsPdf']) }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(StatisticAnalysisPanelComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    describe('data transformation', () => {
        const card = () => pipelineCard('analysis-transformation');
        const graphCards = () => card().querySelectorAll('.transformation-graph app-station-card');
        const creators = () => menuSteps(card(), 'stage').filter((step) => step?.endsWith('_creator'));

        beforeEach(() => {
            (mockExpService.selectedVariables as any).set([age]);
            fixture.detectChanges();
        });

        it('opens an empty stage on its unfolded menu, column creators included', () => {
            component.addStep('transformation');
            fixture.detectChanges();

            // Nothing to show yet, so the stage asks instead of making the user hunt for the row.
            expect(component.transformationChooserOnly).toBe(true);
            expect(component.transformationPickerOpen).toBe(true);
            expect(menuTrigger(card(), 'stage')?.getAttribute('aria-expanded')).toBe('true');
            expect(menuTrigger(card(), 'stage')?.textContent).toContain('Add a transformation step');
            expect(graphCards().length).toBe(0);
            expect(creators()).toEqual(['categorical_column_creator', 'kmeans_cluster_creator']);

            pick(card(), 'stage', 'categorical_column_creator');

            expect(graphCards().length).toBe(1);
            expect(component.transformationChooserOnly).toBe(false);
            // The stage has a card to show now, so the menu folds back into its add row.
            expect(component.transformationPickerOpen).toBe(false);
            expect(menuTrigger(card(), 'stage')?.getAttribute('aria-expanded')).toBe('false');

            pick(card(), 'stage', 'kmeans_cluster_creator');

            expect(graphCards().length).toBe(2);
            // Every creator stays on offer: a stage may hold several columns of one kind.
            expect(creators()).toEqual(['categorical_column_creator', 'kmeans_cluster_creator']);
        });

        it('has no separate chooser for the column creators', () => {
            component.addStep('transformation');
            fixture.detectChanges();

            expect(card().querySelector('.transformation-chooser')).toBeNull();
            expect(card().querySelectorAll('.pipeline-node-body app-step-picker').length).toBe(1);
        });

        it('opens the Variable Transforms station from the menu before anything is applied', () => {
            mockExpService.setAppliedDescriptivePreprocessing.mockClear();

            pick(card(), 'rail', 'variable_transformer');

            expect(component.sectionOpen().transformation).toBe(true);
            expect(component.transformStationShown).toBe(true);
            expect(component.scalerStationShown).toBe(false);
            expect(stationTitles(card())).toEqual(['Variable Transforms']);
            expect(card().querySelector('.preprocessing-shell .station-card')?.classList.contains('is-open')).toBe(true);
            // Opening a station is a read: the request is untouched until Apply.
            expect(mockExpService.setAppliedDescriptivePreprocessing).not.toHaveBeenCalled();
        });

        it('keeps the menu folded when the stage opens on a station', () => {
            pick(card(), 'rail', 'variable_transformer');

            expect(component.transformationPickerOpen).toBe(false);
            expect(menuTrigger(card(), 'stage')?.getAttribute('aria-expanded')).toBe('false');
            expect(card().querySelectorAll('.pipeline-node-body .step-picker-option').length).toBe(0);
        });

        it('leaves a step out of the stage menu while its station is on screen', () => {
            pick(card(), 'rail', 'variable_transformer');

            const steps = menuSteps(card(), 'stage');
            expect(steps).not.toContain('variable_transformer');
            expect(steps).toContain('variable_scaler');
        });

        it('adds Variable Scaling from the stage menu and opens only that station', () => {
            pick(card(), 'rail', 'variable_transformer');
            pick(card(), 'stage', 'variable_scaler');

            expect(stationTitles(card())).toEqual(['Variable Transforms', 'Variable Scaling']);
            expect(component.preprocessingStepOpen.scaler).toBe(true);
            expect(component.preprocessingStepOpen.transform).toBe(false);
            expect(menuSteps(card(), 'stage')).toEqual(['categorical_column_creator', 'kmeans_cluster_creator']);
        });

        it('hands an untouched station back to the menu when its step is removed', () => {
            pick(card(), 'rail', 'variable_transformer');

            component.removePreprocessingSubNode('transform');
            fixture.detectChanges();

            expect(component.transformStationShown).toBe(false);
            expect(stationTitles(card())).toEqual([]);
            expect(menuSteps(card(), 'stage')).toContain('variable_transformer');
        });

        it('keeps the menu folded when the stage already holds an applied step', () => {
            seedAppliedConfig({ variable_scaler: { strategies: { age: 'standard' } } });
            fixture.detectChanges();

            component.addStep('transformation');
            fixture.detectChanges();

            expect(stationTitles(card())).toEqual(['Variable Scaling']);
            expect(component.transformationPickerOpen).toBe(false);
            expect(menuTrigger(card(), 'stage')?.getAttribute('aria-expanded')).toBe('false');
            expect(menuSteps(card(), 'stage')).not.toContain('variable_scaler');
        });

        it('lists a catalog step in the stage menu until its station is on screen', () => {
            const indicator = {
                name: 'missing_indicator',
                label: 'Missing Indicator',
                desc: 'Add a column flagging missing values.',
                parameters: {
                    variables: { label: 'Variables', desc: '', types: ['text'], required: true, multiple: true },
                    suffix: { label: 'Column suffix', desc: '', types: ['text'], required: false, default: '_missing' },
                },
            };
            mockExpService.genericCatalogSteps.mockReturnValue([indicator] as never);
            mockExpService.catalogStepSpec.mockImplementation(((name: string) =>
                name === 'missing_indicator' ? indicator : null) as never);
            component.addStep('transformation');
            fixture.detectChanges();

            const station = () => card().querySelector('app-generic-data-transformation-step[data-step="missing_indicator"] app-station-card');
            expect(station()).toBeNull();
            expect(menuSteps(card(), 'stage')).toContain('missing_indicator');

            pick(card(), 'stage', 'missing_indicator');

            expect(station()).not.toBeNull();
            expect(component.genericStepOpen()['missing_indicator']).toBe(true);
            expect(menuSteps(card(), 'stage')).not.toContain('missing_indicator');
        });
    });

    describe('preprocessing', () => {
        const card = () => pipelineCard('analysis-preprocessing');

        beforeEach(() => {
            (mockExpService.selectedVariables as any).set([age]);
            fixture.detectChanges();
            component.addStep('setup');
            fixture.detectChanges();
        });

        it('ends the opened stage in a folded menu: Missing Values is always there to show', () => {
            expect(stationTitles(card())).toEqual(['Missing Values']);
            expect(menuTrigger(card(), 'stage')?.getAttribute('aria-expanded')).toBe('false');
            expect(menuTrigger(card(), 'stage')?.textContent).toContain('Add a preprocessing step');
            expect(menuSteps(card(), 'stage')).toEqual(['outlier_winsorizer']);
        });

        it('adds Outlier Handling from the stage menu without writing the request', () => {
            mockExpService.setAppliedDescriptivePreprocessing.mockClear();

            pick(card(), 'stage', 'outlier_winsorizer');

            expect(component.userEnabledOutliers()).toBe(true);
            expect(stationTitles(card())).toEqual(['Missing Values', 'Outlier Handling']);
            expect(component.preprocessingStepOpen.outlier).toBe(true);
            expect(component.preprocessingStepOpen.missing).toBe(false);
            expect(mockExpService.setAppliedDescriptivePreprocessing).not.toHaveBeenCalled();
            // Nothing is left to add, so the add row is gone too.
            expect(menuTrigger(card(), 'stage')).toBeNull();
        });
    });

    it('draws no dashed add button in an opened stage', () => {
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();
        component.addStep('setup');
        component.addStep('transformation');
        fixture.detectChanges();

        for (const stage of ['analysis-preprocessing', 'analysis-transformation'] as const) {
            expect(pipelineCard(stage).querySelectorAll('.pipeline-node-body .btn-add-dashed').length, stage).toBe(0);
        }
    });
});
