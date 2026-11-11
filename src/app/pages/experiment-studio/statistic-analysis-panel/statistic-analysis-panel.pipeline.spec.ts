import type { MockedObject } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideEchartsCore } from 'ngx-echarts';
import { StatisticAnalysisPanelComponent } from './statistic-analysis-panel.component';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentsDashboardService } from '../../../services/experiments-dashboard.service';
import { ChartBuilderService } from '../visualisations/charts/chart-builder.service';
import { PdfExportService } from '../../../services/pdf-export.service';
import { createSpyObj } from '../../../testing/spy-obj.testing';

/**
 * Contract: a stage counts as added only when its work is either opened this
 * visit or present in the persisted request config. Opening a stage must never
 * write that config.
 */
describe('StatisticAnalysisPanelComponent pipeline presence', () => {
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
     * The collapsed rail rows: `live` is what runs, `ghost` is the dashed row that adds a step.
     * A stage has one add row at most; it holds the add-step menu (see `railOptions`).
     */
    function railRows(card: HTMLElement): { live: HTMLElement[]; ghost: HTMLElement[] } {
        const rows = Array.from(card.querySelectorAll('.pipeline-subnodes-tree .pipeline-subnode-item')) as HTMLElement[];
        return {
            live: rows.filter((row) => !row.classList.contains('is-ghost')),
            ghost: rows.filter((row) => row.classList.contains('is-ghost')),
        };
    }

    /** The add row of a collapsed stage's rail, or null when the stage has nothing left to add. */
    function railTrigger(card: HTMLElement): HTMLButtonElement | null {
        return card.querySelector('.pipeline-subnodes-tree app-step-picker .step-picker-trigger');
    }

    /** The steps the rail's add-step menu offers. Opens the menu first when it is closed. */
    function railOptions(card: HTMLElement): HTMLButtonElement[] {
        const trigger = railTrigger(card);
        if (!trigger) return [];
        if (trigger.getAttribute('aria-expanded') !== 'true') {
            trigger.click();
            fixture.detectChanges();
        }
        return Array.from(card.querySelectorAll('.pipeline-subnodes-tree app-step-picker .step-picker-option')) as HTMLButtonElement[];
    }

    /** Engine names of the steps the rail's add-step menu offers, in menu order. */
    function railSteps(card: HTMLElement): (string | undefined)[] {
        return railOptions(card).map((option) => option.dataset['step']);
    }

    function railOption(card: HTMLElement, step: string): HTMLButtonElement | undefined {
        return railOptions(card).find((option) => option.dataset['step'] === step);
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

    it('marks Filtering active from persisted filter rules, without opening it', () => {
        const logic: any = { condition: 'AND', rules: [{ field: 'age', operator: '>', value: 40 }] };
        (mockExpService.filterLogic as any).set(logic);
        fixture.detectChanges();

        expect(component.isStepAdded('filters')).toBe(true);
        expect(component.activeStagesCount).toBe(1);
        expect(mockExpService.filterLogic()).toBe(logic);
        expect(mockExpService.setFilterLogic).not.toHaveBeenCalled();
    });

    it('marks Preprocessing active from a persisted applied config', () => {
        seedAppliedConfig({ missing_values_handler: { strategies: { age: 'drop' } } });
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        expect(component.isStepAdded('setup')).toBe(true);
        expect(component.activeStagesCount).toBe(1);
    });

    it('counts transformation-only work as Transformation, not Preprocessing', () => {
        seedAppliedConfig({
            categorical_column_creator: [{
                new_column_names: ['group'],
                strategy: 'filter_rules',
                rules: { mild: { field: 'age', operator: '<', value: 50 } },
            }],
        });
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        expect(component.isStepAdded('transformation')).toBe(true);
        expect(component.isStepAdded('setup')).toBe(false);
    });

    it('does not persist when Preprocessing is opened', () => {
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        mockExpService.setAppliedDescriptivePreprocessing.mockClear();
        mockExpService.upsertTransformation.mockClear();
        component.addStep('setup');
        component.goToSection('setup');
        fixture.detectChanges();

        expect(mockExpService.setAppliedDescriptivePreprocessing).not.toHaveBeenCalled();
        expect(mockExpService.upsertTransformation).not.toHaveBeenCalled();
        expect((component as any).userPreprocessingApplied).toBe(false);
    });

    it('persists on Apply and clears the persisted config on Remove', () => {
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        component.onMissingActionChange(age, 'mean');
        component.applyPreprocessing();

        expect(mockExpService.setAppliedDescriptivePreprocessing).toHaveBeenCalledWith(
            expect.objectContaining({ missing_values_handler: { strategies: { age: 'mean' } } }),
        );
        expect(component.isStepAdded('setup')).toBe(true);

        mockExpService.setAppliedDescriptivePreprocessing.mockClear();
        component.removeStep('setup');

        expect(mockExpService.setAppliedDescriptivePreprocessing).toHaveBeenCalledWith(null);
        expect(component.isStepAdded('setup')).toBe(false);
    });

    it('shows what the next run will use in the terminal card', async () => {
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();
        await fixture.whenStable();

        component.rawSummary = {
            ...component.rawSummary,
            featurewiseRows: [{ dataset: 'all datasets', data: { num_total: 20 } }],
        } as any;
        component.processedSummary = {
            ...component.processedSummary,
            featurewiseRows: [{ dataset: 'all datasets', data: { num_total: 17 } }],
        } as any;
        // Toggling a signal marks the OnPush view for the summary mutation above;
        // production paths call markForCheck when a summary lands instead.
        component.showUnappliedChangesWarning.set(true);
        fixture.detectChanges();

        const terminal = fixture.nativeElement.querySelector('.pipeline-terminal-card') as HTMLElement;
        const text = terminal.textContent ?? '';
        expect(text).toContain('The next run will use');
        expect(text).toContain('17 of 20 records');
        expect(text).toContain('1 variables');
        expect(text).toContain('1 datasets');
        expect(text).toContain('Missing values: remove rows (default)');
        expect(terminal.querySelector('.unapplied-warning-card')).toBeTruthy();
    });

    it('shows the default NA-removal sub-node before any customization', () => {
        const nodes = component.appliedPreprocessingSubNodes;

        expect(nodes.length).toBe(1);
        expect(nodes[0].id).toBe('missing');
        expect(nodes[0].statusLabel).toBe('In run · Default');
        expect(component.appliedPreprocessingCount).toBe(0);
        expect(component.appliedTransformationSubNodes).toEqual([]);
    });

    /**
     * Default NaN removal is in the request from the first render, so the stage's rail says
     * Default before anyone opens it.
     */
    it('draws the untouched stage as a solid node tagged Default', () => {
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();
        mockExpService.setAppliedDescriptivePreprocessing.mockClear();

        const preprocessing = pipelineCard('analysis-preprocessing');
        expect(preprocessing.querySelector('.pipeline-node-header h3')?.textContent?.trim()).toBe('Preprocessing');
        expect(preprocessing.querySelector('.pipeline-node-subtitle')?.textContent).toContain('Decide what happens to missing values');

        const badge = preprocessing.querySelector('.pipeline-status-badge') as HTMLElement;
        expect(badge.textContent?.trim()).toBe('In run · Default');
        expect(badge.classList.contains('default')).toBe(true);
        expect(badge.classList.contains('applied')).toBe(false);

        const rows = railRows(preprocessing);
        expect(rows.live.length).toBe(1);
        expect(rows.live[0].textContent).toContain('Missing values');
        expect(rows.live[0].textContent).toContain('All 1 variable: remove rows with a missing value (default)');
        const chip = rows.live[0].querySelector('.pipeline-subnode-status') as HTMLElement;
        expect(chip.getAttribute('data-tone')).toBe('default');
        expect(chip.textContent?.trim()).toBe('In run · Default');

        expect(component.activeStagesCount).toBe(0);
        expect(mockExpService.setAppliedDescriptivePreprocessing).not.toHaveBeenCalled();
        expect(mockExpService.appliedPreprocessingConfig()).toBeNull();
    });

    /**
     * The rail's add row is the whole add flow: its menu opens the station already narrowed to
     * that sub-step, so a stage never has to be expanded just to reach a control.
     */
    it('adds a preprocessing sub-step from the collapsed rail without writing the request', () => {
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        expect(pipelineCard('analysis-preprocessing').querySelector('.pipeline-node-body')).toBeNull();
        const outlierOption = railOption(pipelineCard('analysis-preprocessing'), 'outlier_winsorizer');
        expect(outlierOption).toBeTruthy();
        expect(outlierOption!.textContent).toContain('Outlier Handling');

        mockExpService.setAppliedDescriptivePreprocessing.mockClear();
        outlierOption!.click();
        fixture.detectChanges();

        expect(component.sectionOpen().setup).toBe(true);
        expect(component.userEnabledOutliers()).toBe(true);
        expect(component.preprocessingStepOpen.outlier).toBe(true);
        expect(component.preprocessingStepOpen.missing).toBe(false);
        expect(pipelineCard('analysis-preprocessing').querySelector('.pipeline-node-body')).toBeTruthy();
        expect(mockExpService.setAppliedDescriptivePreprocessing).not.toHaveBeenCalled();
        // The stage is open now, so its rail (and the rail's add row) is gone.
        expect(railTrigger(pipelineCard('analysis-preprocessing'))).toBeNull();
    });

    /**
     * An opened step that was never configured contributes nothing to the request, so closing
     * it hands the stage back exactly as it was: the rail must keep offering the step, or the
     * one control that creates it is gone until the user finds the editor by another route.
     */
    it('offers the outlier step from the rail again after an untouched step is closed', () => {
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        railOption(pipelineCard('analysis-preprocessing'), 'outlier_winsorizer')!.click();
        fixture.detectChanges();

        expect(component.pendingChangeCount).toBe(0);
        // The card's own footer primary folds just that card; the stage keeps its shape.
        component.commitOrCloseStep('outlier');
        fixture.detectChanges();

        expect(component.preprocessingStepOpen.outlier).toBe(false);
        expect(component.sectionOpen().setup).toBe(true);
        expect(mockExpService.appliedPreprocessingConfig()).toBeNull();

        // Collapsed, the stage hands the step back to its rail: closing an untouched card
        // never consumed the one control that adds the step back.
        component.collapseStep('setup');
        fixture.detectChanges();
        expect(railRows(pipelineCard('analysis-preprocessing')).live.length).toBe(1);
        const outlierOption = railOption(pipelineCard('analysis-preprocessing'), 'outlier_winsorizer');
        expect(outlierOption).toBeTruthy();

        outlierOption!.click();
        fixture.detectChanges();
        expect(component.sectionOpen().setup).toBe(true);
        expect(component.preprocessingStepOpen.outlier).toBe(true);
    });

    it('adds a column creator from the collapsed rail in one click', () => {
        seedAppliedConfig({
            categorical_column_creator: [{
                new_column_names: ['mrs_good_outcome'],
                strategy: 'filter_rules',
                rules: { good: { field: 'age', operator: '<', value: 50 } },
            }],
        });
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        const card = () => pipelineCard('analysis-transformation');
        expect(railRows(card()).live.map((row) => row.textContent)).toEqual([expect.stringMatching('mrs_good_outcome')]);

        // Opening the menu is a read: it lists the steps and creates nothing.
        mockExpService.upsertTransformation.mockClear();
        expect(railSteps(card())).toEqual([
            'variable_transformer',
            'variable_scaler',
            'categorical_column_creator',
            'kmeans_cluster_creator',
        ]);
        expect(mockExpService.upsertTransformation).not.toHaveBeenCalled();
        expect(component.sectionOpen().transformation).toBe(false);

        // The creators sit in the menu themselves: no second chooser between the rail and the card.
        railOption(card(), 'kmeans_cluster_creator')!.click();
        fixture.detectChanges();

        expect(component.sectionOpen().transformation).toBe(true);
        expect(mockExpService.upsertTransformation).toHaveBeenCalledTimes(1);
        expect(component.cards().map((step) => step.name)).toEqual(['categorical_column_creator', 'kmeans_cluster_creator']);
        expect(card().querySelectorAll('.transformation-graph app-station-card').length).toBe(2);
    });

    it('lists one sub-node per applied preprocessing step with its summary', () => {
        const mmse = { code: 'mmse', label: 'MMSE', type: 'real' };
        (mockExpService.selectedVariables as any).set([age, mmse]);
        seedAppliedConfig({
            missing_values_handler: { strategies: { age: 'mean', mmse: 'median' } },
            outlier_winsorizer: { strategies: { age: 'iqr' }, tails: { age: 'both' }, folds: { age: 1.5 } },
        });
        fixture.detectChanges();

        const nodes = component.appliedPreprocessingSubNodes;
        expect(nodes.map((n) => n.id)).toEqual(['missing', 'outlier']);
        expect(nodes[0].subtitle).toContain('2 variables');
        expect(nodes[1].subtitle).toContain('IQR');
        expect(component.appliedPreprocessingCount).toBe(2);
        expect(component.preprocessingStatusLabel).toBe('2 steps applied ✓');
    });

    it('lists the transform and scaler sub-nodes on the data transformation stage, not on preprocessing', () => {
        (mockExpService.selectedVariables as any).set([age]);
        seedAppliedConfig({
            missing_values_handler: { strategies: { age: 'drop' } },
            variable_transformer: { strategies: { age: 'log1p' } },
            variable_scaler: { strategies: { age: 'standard' } },
        });
        fixture.detectChanges();

        // Both change what the variable means (range and scale), so they belong to Data transformation.
        expect(component.appliedPreprocessingSubNodes.map((n) => n.id)).toEqual(['missing']);
        const nodes = component.appliedTransformationSingletonNodes;
        expect(nodes.map((n) => n.id)).toEqual(['transform', 'scaler']);
        expect(nodes[0].subtitle).toContain('log(1 + x)');
        expect(nodes[1].subtitle).toContain('Standard');
        expect(component.appliedTransformationSubNodes.map((n) => n.id)).toEqual(['transform', 'scaler']);
    });

    it('offers transforms and scaling in the transformation menu while they hold no strategies', () => {
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        const steps = railSteps(pipelineCard('analysis-transformation'));
        expect(steps).toContain('variable_transformer');
        expect(steps).toContain('variable_scaler');
        expect(railSteps(pipelineCard('analysis-preprocessing'))).not.toContain('variable_transformer');
    });

    describe('catalog steps without a dedicated station', () => {
        const indicator = {
            name: 'missing_indicator',
            label: 'Missing Indicator',
            desc: 'Add a column flagging missing values.',
            parameters: {
                variables: { label: 'Variables', desc: '', types: ['text'], required: true, multiple: true },
                suffix: { label: 'Column suffix', desc: '', types: ['text'], required: false, default: '_missing' },
            },
        };

        beforeEach(() => {
            mockExpService.genericCatalogSteps.mockReturnValue([indicator] as never);
            mockExpService.catalogStepSpec.mockImplementation(((name: string) =>
                name === 'missing_indicator' ? indicator : null) as never);
            (mockExpService.selectedVariables as any).set([age]);
        });

        it('offers each listed step in the menu of the stage it belongs to', () => {
            fixture.detectChanges();

            // A missing indicator adds a column, so it is a data transformation.
            const option = railOption(pipelineCard('analysis-transformation'), 'missing_indicator');
            expect(option?.textContent).toContain('Missing Indicator');
            expect(option?.textContent).toContain('Add a column flagging missing values.');
            expect(railSteps(pipelineCard('analysis-preprocessing'))).not.toContain('missing_indicator');
        });

        it('opens the station of a listed step from the rail menu without writing the request', () => {
            fixture.detectChanges();
            mockExpService.setAppliedDescriptivePreprocessing.mockClear();

            railOption(pipelineCard('analysis-transformation'), 'missing_indicator')!.click();
            fixture.detectChanges();

            expect(component.sectionOpen().transformation).toBe(true);
            expect(component.genericStepOpen()['missing_indicator']).toBe(true);
            expect(fixture.nativeElement.querySelector('app-generic-data-transformation-step[data-step="missing_indicator"] app-station-card')).not.toBeNull();
            expect(mockExpService.setAppliedDescriptivePreprocessing).not.toHaveBeenCalled();
        });

        it('draws an applied step as a rail node with its own icon and drops it from the menu', () => {
            seedAppliedConfig({ missing_indicator: { variables: ['age'], suffix: '_na' } });
            fixture.detectChanges();
            fixture.detectChanges();

            const node = component.appliedTransformationSubNodes.find((candidate) => candidate.id === 'step:missing_indicator');
            expect(node?.icon).toBe('fas fa-flag');
            expect(railSteps(pipelineCard('analysis-transformation'))).not.toContain('missing_indicator');
        });

        it('restores an applied step as a rail node and an open-able station', () => {
            seedAppliedConfig({ missing_indicator: { variables: ['age'], suffix: '_na' } });
            fixture.detectChanges();
            fixture.detectChanges();

            const { live } = railRows(pipelineCard('analysis-transformation'));
            expect(live.some((row) => (row.textContent ?? '').includes('Missing Indicator'))).toBe(true);
            expect(component.isStepAdded('transformation')).toBe(true);
            expect(component.isStepAdded('setup')).toBe(false);
            expect(component.appliedGenericParameters('missing_indicator')).toEqual({ variables: ['age'], suffix: '_na' });
            expect(fixture.nativeElement.querySelector('app-generic-data-transformation-step[data-step="missing_indicator"] app-station-card')).not.toBeNull();
        });
    });

    it('restores the transform and scaler editors from a persisted config', () => {
        (mockExpService.selectedVariables as any).set([age]);
        seedAppliedConfig({
            variable_transformer: { strategies: { age: 'yeo_johnson' } },
            variable_scaler: { strategies: { age: 'minmax' }, feature_range: [-1, 1] },
        });
        fixture.detectChanges();

        expect(component.isStepAdded('transformation')).toBe(true);
        expect(component.isStepAdded('setup')).toBe(false);
        expect(component.appliedTransformStrategies).toEqual({ age: 'yeo_johnson' });
        expect(component.pendingTransformStrategies).toEqual({ age: 'yeo_johnson' });
        expect(component.appliedScalerStrategies).toEqual({ age: 'minmax' });
        expect(component.appliedScalerFeatureRange).toEqual([-1, 1]);
        expect(component.pendingScalerFeatureRange).toEqual(['-1', '1']);
    });

    it('keeps the data transformation steps when the preprocessing stage is removed', () => {
        const mmse = { code: 'mmse', label: 'MMSE', type: 'real' };
        (mockExpService.selectedVariables as any).set([age, mmse]);
        seedAppliedConfig({
            missing_values_handler: { strategies: { age: 'drop' } },
            variable_transformer: { strategies: { mmse: 'log1p' } },
        });
        fixture.detectChanges();

        mockExpService.setAppliedDescriptivePreprocessing.mockClear();
        component.removeStep('setup');
        const afterPreprocessing = mockExpService.setAppliedDescriptivePreprocessing.mock.calls.at(-1)![0] as Record<string, unknown> | null;
        expect(Object.keys(afterPreprocessing ?? {})).toEqual(['variable_transformer']);

    });

    it('keeps the preprocessing steps when the data transformation stage is removed', () => {
        const mmse = { code: 'mmse', label: 'MMSE', type: 'real' };
        (mockExpService.selectedVariables as any).set([age, mmse]);
        seedAppliedConfig({
            missing_values_handler: { strategies: { age: 'drop' } },
            variable_transformer: { strategies: { mmse: 'log1p' } },
        });
        fixture.detectChanges();

        component.removeStep('transformation');
        const afterTransformation = mockExpService.setAppliedDescriptivePreprocessing.mock.calls.at(-1)![0] as Record<string, unknown> | null;
        expect(Object.keys(afterTransformation ?? {})).toEqual(['missing_values_handler']);
        expect(component.appliedTransformStrategies).toEqual({});
    });

    it('hides the transform and scaler stations when the catalog lacks them', () => {
        (mockExpService.selectedVariables as any).set([age]);
        seedAppliedConfig({
            variable_transformer: { strategies: { age: 'log1p' } },
            variable_scaler: { strategies: { age: 'standard' } },
        });
        mockExpService.hasPreprocessingSpec.mockImplementation((name: string) =>
            ['categorical_column_creator', 'kmeans_cluster_creator'].includes(name));
        fixture.detectChanges();

        // No rail node and no ghost row: the deployment cannot run the step, so the
        // UI must not offer it even though a persisted config still carries it.
        expect(component.appliedPreprocessingSubNodes.map((n) => n.id)).toEqual(['missing']);
        expect(component.appliedTransformationSingletonNodes).toEqual([]);
        const card = pipelineCard('analysis-transformation');
        const steps = railSteps(card);
        expect(steps).not.toContain('variable_transformer');
        expect(steps).not.toContain('variable_scaler');
        expect(card.textContent).not.toContain('Variable Transforms');
        expect(card.textContent).not.toContain('Variable Scaling');
    });

    it('surfaces the applied derived column as a transformation sub-node', () => {
        seedAppliedConfig({
            categorical_column_creator: [{
                new_column_names: ['mrs_good_outcome'],
                strategy: 'filter_rules',
                rules: {
                    good: { field: 'age', operator: '<', value: 50 },
                    bad: { field: 'age', operator: '>=', value: 50 },
                },
                default_enumeration: 'unknown',
            }],
        });
        fixture.detectChanges();

        const nodes = component.appliedTransformationSubNodes;
        expect(nodes.length).toBe(1);
        expect(nodes[0].title).toBe('Derived column: mrs_good_outcome');
        expect(nodes[0].subtitle).toContain('2 category rules');
        expect(nodes[0].subtitle).toContain('default: unknown');
        expect(component.appliedTransformationCount).toBe(1);
        expect(component.transformationBadgeLabel).toBe('1 Transformation active');
    });

    it('lists one sub-node per applied derived column and counts them in the badge', () => {
        seedAppliedConfig({
            categorical_column_creator: [
                {
                    new_column_names: ['mrs_good_outcome'],
                    strategy: 'filter_rules',
                    rules: { good: { field: 'age', operator: '<', value: 50 } },
                },
                {
                    new_column_names: ['mrs_bad_outcome'],
                    strategy: 'filter_rules',
                    rules: {
                        bad: { field: 'age', operator: '>=', value: 50 },
                        interim: { field: 'age', operator: '=', value: 50 },
                    },
                    default_enumeration: 'unknown',
                },
            ],
        });
        fixture.detectChanges();

        const nodes = component.appliedTransformationSubNodes;
        expect(nodes.length).toBe(2);
        expect(nodes.map((node) => node.title)).toEqual([
            'Derived column: mrs_good_outcome',
            'Derived column: mrs_bad_outcome',
        ]);
        expect(nodes[1].subtitle).toContain('2 category rules');
        expect(component.appliedTransformationCount).toBe(2);
        expect(component.transformationBadgeLabel).toBe('2 Transformations active');
    });

    it('surfaces the applied K-means cluster column as a transformation sub-node', () => {
        seedAppliedConfig({
            kmeans_cluster_creator: {
                new_column_names: ['kmeans_cluster'],
                k: 2,
                enumeration_prefix: 'cluster_',
                reusable_preprocessing: {
                    enumeration_prefix: 'cluster_',
                    cluster_choices: [
                        { cluster_id: 'c1', label: 'Cluster 1' },
                        { cluster_id: 'c2', label: 'Cluster 2' },
                    ],
                    cluster_variables: ['a', 'b'],
                },
            },
        });
        fixture.detectChanges();

        const nodes = component.appliedTransformationSubNodes;
        const clusterNode = nodes.find((node) => node.title === 'K-means clusters: kmeans_cluster');
        expect(clusterNode?.id).toBe('transformation:kmeans-seed');
        expect(clusterNode?.subtitle).toBe('2 clusters from a, b');
        expect(clusterNode?.statusLabel).toBe('Applied');
        expect(clusterNode?.statusTone).toBe('applied');
    });

    it('counts the cluster column as the stage status on its own', () => {
        seedAppliedConfig({
            kmeans_cluster_creator: {
                new_column_names: ['kmeans_cluster'],
                k: 1,
                enumeration_prefix: 'cluster_',
                reusable_preprocessing: {
                    enumeration_prefix: 'cluster_',
                    cluster_choices: [{ cluster_id: 'c1', label: 'Cluster 1' }],
                    cluster_variables: ['a'],
                },
            },
        });
        fixture.detectChanges();

        // No categorical card is configured, but the stage does hold a derived column.
        expect(component.transformationStatusLabel).toBe('Applied');
        expect(component.transformationBadgeLabel).toBe('1 Transformation active');
    });

    it('folds every derived column card on Apply so the overview can list them', () => {
        seedAppliedConfig({
            categorical_column_creator: [
                { new_column_names: ['mrs_good_outcome'], strategy: 'filter_rules', rules: { good: { field: 'age', operator: '<', value: 50 } } },
                { new_column_names: ['mrs_bad_outcome'], strategy: 'filter_rules', rules: { bad: { field: 'age', operator: '>=', value: 50 } } },
            ],
        });
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        component.addStep('transformation');
        fixture.detectChanges();
        expect(component.sectionOpen().transformation).toBe(true);

        // Echo the hydrated filters back so committing does not blank them.
        const committed = component.transformationDrafts.flatMap((draft) => draft.rules.map((rule) => rule.filter));
        component.transformationRuleModals = {
            toArray: () => committed.map((filter) => ({ exportFilterLogic: () => filter, filterError: () => null })),
        } as any;

        // Every card answers for itself: its own Apply commits it and folds it, and the
        // stage stays open until a click on its header folds it to the overview.
        component.transformationDrafts.forEach((draft) => component.commitTransformationDraft(draft));
        fixture.detectChanges();
        expect(component.transformationDrafts.every((draft) => !draft.open)).toBe(true);
        expect(component.sectionOpen().transformation).toBe(true);

        component.collapseStep('transformation');
        fixture.detectChanges();

        expect(component.sectionOpen().transformation).toBe(false);
        const overview = Array.from(
            fixture.nativeElement.querySelectorAll('[data-guide="analysis-transformation"] .pipeline-subnodes-tree .pipeline-subnode-item')
        ) as HTMLElement[];
        expect(overview.map((item) => item.textContent)).toEqual([
            expect.stringMatching('mrs_good_outcome'),
            expect.stringMatching('mrs_bad_outcome'),
            // One add row, whatever the number of steps it can add.
            expect.stringMatching('Add a transformation step'),
        ]);
    });

    it('expands the stage and opens only the clicked station on sub-node click', () => {
        seedAppliedConfig({ missing_values_handler: { strategies: { age: 'mean' } } });
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        component.addStep('setup');
        component.preprocessingStepOpen.missing = true;
        component.jumpToSubNode('setup', 'outlier');

        expect(component.sectionOpen().setup).toBe(true);
        expect(component.preprocessingStepOpen.outlier).toBe(true);
        expect(component.preprocessingStepOpen.missing).toBe(false);

        component.jumpToSubNode('transformation', 'transformation');
        expect(component.sectionOpen().transformation).toBe(true);
        expect(component.preprocessingStepOpen.transformation).toBe(true);

        // A singleton transformation station opens alone, and not the derived-column graph.
        component.jumpToSubNode('transformation', 'scaler');
        expect(component.preprocessingStepOpen.scaler).toBe(true);
        expect(component.preprocessingStepOpen.transform).toBe(false);
        expect(component.preprocessingStepOpen.transformation).toBe(false);
    });

    it('opens step 0 as a read that adds no stage and writes no config', () => {
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        mockExpService.setFilterLogic.mockClear();
        mockExpService.setAppliedDescriptivePreprocessing.mockClear();
        component.toggleSourcePreview();
        fixture.detectChanges();

        expect(component.sectionOpen().source).toBe(true);
        expect(component.sectionOpen().filters).toBe(false);
        expect(component.isStepAdded('filters')).toBe(false);
        expect(component.activeStagesCount).toBe(0);
        expect(mockExpService.setFilterLogic).not.toHaveBeenCalled();
        expect(mockExpService.setAppliedDescriptivePreprocessing).not.toHaveBeenCalled();

        component.toggleSourcePreview();
        expect(component.sectionOpen().source).toBe(false);
    });

    it('renders un-added optional steps collapsed, with no editor mounted', () => {
        (mockExpService.selectedVariables as any).set([age]);
        (mockExpService.filterLogic as any).set(null);
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;

        for (const guide of ['analysis-filtering', 'analysis-transformation']) {
            const section = root.querySelector(`[data-guide="${guide}"]`)!;
            expect(section.classList.contains('is-compact'), guide).toBe(true);
            expect(section.querySelector('.btn-remove-step-node'), guide).toBeNull();
            expect(section.querySelector('.pipeline-node-body'), guide).toBeNull();
            expect(section.querySelector('.pipeline-node-toggle')?.getAttribute('aria-expanded'), guide).toBe('false');
        }
        expect(root.querySelector('[data-guide="analysis-filtering"]')?.textContent).toContain('Add condition');
        expect(root.querySelector('[data-guide="analysis-transformation"]')?.textContent).toContain('Add a transformation step');
    });

    it('opens and folds every step from its title button', () => {
        (mockExpService.selectedVariables as any).set([age]);
        (mockExpService.filterLogic as any).set(null);
        fixture.detectChanges();
        const toggle = (guide: string) => (fixture.nativeElement as HTMLElement)
            .querySelector(`[data-guide="${guide}"] .pipeline-node-toggle`) as HTMLButtonElement;

        for (const [guide, isOpen] of [
            ['analysis-source-data', () => component.sectionOpen().source],
            ['analysis-filtering', () => component.sectionOpen().filters],
            ['analysis-preprocessing', () => component.sectionOpen().setup],
            ['analysis-transformation', () => component.sectionOpen().transformation],
        ] as const) {
            toggle(guide).click();
            fixture.detectChanges();
            expect(isOpen(), guide).toBe(true);
            expect(toggle(guide).getAttribute('aria-expanded'), guide).toBe('true');

            toggle(guide).click();
            fixture.detectChanges();
            expect(isOpen(), guide).toBe(false);
        }
        expect(component.isStepAdded('filters')).toBe(true);
        expect(component.isStepAdded('transformation')).toBe(true);
    });

    it('folds a step from its header, but not from its buttons or a text selection', () => {
        (mockExpService.selectedVariables as any).set([age]);
        component.goToSection('filters');
        fixture.detectChanges();
        const section = (fixture.nativeElement as HTMLElement).querySelector('[data-guide="analysis-filtering"]')!;
        const subtitle = section.querySelector('.pipeline-node-header .pipeline-node-subtitle') as HTMLElement;

        vi.spyOn(component, 'removeStep').mockImplementation(() => undefined);
        (section.querySelector('.btn-remove-step-node') as HTMLButtonElement).click();
        expect(component.removeStep).toHaveBeenCalledWith('filters');
        expect(component.sectionOpen().filters).toBe(true);

        const selection = vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'Keep only' } as Selection);
        subtitle.click();
        expect(component.sectionOpen().filters).toBe(true);

        selection.mockRestore();
        subtitle.click();
        expect(component.sectionOpen().filters).toBe(false);
    });

    it('drops unapplied filter conditions with the removed step', () => {
        (mockExpService.selectedVariables as any).set([age]);
        (mockExpService.filterLogic as any).set(null);
        component.goToSection('filters');
        fixture.detectChanges();
        const section = (fixture.nativeElement as HTMLElement).querySelector('[data-guide="analysis-filtering"]')!;
        expect(section.querySelector('app-filter-config-modal')).not.toBeNull();

        component.removeStep('filters');
        fixture.detectChanges();

        // The builder is destroyed, so pending rules cannot survive into the next open.
        expect(section.querySelector('app-filter-config-modal')).toBeNull();
    });

    it('describes step 0 without the cohort filter and refetches only on a new selection', () => {
        (mockExpService.selectedVariables as any).set([age]);
        (mockExpService.filterLogic as any).set({ condition: 'AND', rules: [{ field: 'age', operator: '>', value: 40 }] });
        fixture.detectChanges();

        mockExpService.loadDescriptiveOverview.mockClear();
        component.toggleSourcePreview();

        // Filters are dropped from the request: the snapshot is the data as selected.
        expect(mockExpService.loadDescriptiveOverview).toHaveBeenCalledWith(['age'], null, null, null);

        // Close and reopen: the snapshot still matches the selection, so it is free.
        mockExpService.loadDescriptiveOverview.mockClear();
        component.toggleSourcePreview();
        component.toggleSourcePreview();
        expect(mockExpService.loadDescriptiveOverview).not.toHaveBeenCalled();

        // A new selection invalidates it, and an open snapshot refreshes at once.
        mockExpService.loadDescriptiveOverview.mockClear();
        (mockExpService.selectedVariables as any).set([age, { code: 'mmse', label: 'MMSE', type: 'real' }]);
        fixture.detectChanges();
        expect(mockExpService.loadDescriptiveOverview).toHaveBeenCalledWith(['age', 'mmse'], null, null, null);
    });

    it('renders the step 0 snapshot in the shared summary workspace', () => {
        mockExpService.loadDescriptiveOverview.mockReturnValue(of({
            result: {
                featurewise: [
                    { dataset: 'dataset-a', variable: 'age', data: { num_dtps: 10, num_na: 2, num_total: 12, mean: 61 } },
                ],
            },
        }));
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        component.toggleSourcePreview();
        fixture.detectChanges();

        const snapshot = (fixture.nativeElement as HTMLElement).querySelector('[data-guide="analysis-source-summary"]');
        // Same surface as the Raw preview: overlay tabs, variable browser, statistics table.
        expect(snapshot?.querySelectorAll('.summary-tabs button').length).toBe(3);
        expect(snapshot?.querySelector('.statistics-browser')).toBeTruthy();
        expect(snapshot?.querySelector('.summary-detail-toolbar h4')?.textContent).toContain('Age');
        expect(snapshot?.querySelector('.statistics-table')?.textContent).toContain('Dataset A');
        expect(snapshot?.querySelector('.summary-detail-toolbar .statistics-panel-kicker')?.textContent).toContain('Numerical');
        // Step 0 is read-only: no rule editor, and the tour anchors stay on the raw surface.
        expect(snapshot?.querySelector('app-filter-config-modal')).toBeNull();
        expect(snapshot?.querySelector('[data-guide]')).toBeNull();
    });

    /**
     * The collapsed stage header is the only copy the overview shows, so it must read the
     * stored request rather than the editor, and folding must close a stage without ever
     * taking it out of the run.
     */
    describe('stage header copy and collapse', () => {
        it('lists one collapsed row per top-level cohort rule', () => {
            (mockExpService.filterLogic as any).set({
                condition: 'AND',
                rules: [
                    { id: 'age', field: 'age', type: 'integer', input: 'number', operator: 'greater_or_equal', value: 60 },
                    {
                        condition: 'OR',
                        rules: [
                            { id: 'sex', field: 'sex', type: 'string', input: 'select', operator: 'equal', value: 'F' },
                            { id: 'sex', field: 'sex', type: 'string', input: 'select', operator: 'equal', value: 'M' },
                        ],
                    },
                ],
            });
            fixture.detectChanges();

            const rows = component.cohortRuleRows;
            expect(rows.length).toBe(2);
            expect(rows[0].subtitle).toBe('Numerical');
            expect(rows[0].title).toContain('60');
            expect(rows[1].subtitle).toBe('Group · matches any of 2 conditions');
            expect(rows[1].title).toContain(' or ');
            expect(component.cohortMatchesAny).toBe(false);
            expect(component.filteringStatusLabel).toBe('In run · 3 rules');
        });

        it('reads Not in run yet without stored rules', () => {
            (mockExpService.filterLogic as any).set(null);
            fixture.detectChanges();

            expect(component.filteringStatusLabel).toBe('Not in run yet');
        });

        it('collapses the filter station without removing the step', () => {
            component.goToSection('filters');
            component.collapseStep('filters');

            expect(component.sectionOpen().filters).toBe(false);
            expect(component.sectionOpen().raw).toBe(false);
            expect(component.isStepAdded('filters')).toBe(true);
        });

        it('collapses transformations without removing the step', () => {
            component.goToSection('transformation');
            component.collapseStep('transformation');

            expect(component.sectionOpen().transformation).toBe(false);
            expect(component.isStepAdded('transformation')).toBe(true);
        });

        it('closes a settled column card from its own footer without removing the step', () => {
            component.addStep('transformation');
            // The stage opens on its type chooser; the footer bar belongs to the column card.
            component.chooseTransformation('categorical');
            fixture.detectChanges();

            const apply = (fixture.nativeElement as HTMLElement).querySelector(
                '[data-guide="analysis-transformation"] .station-card-footer .station-action-apply') as HTMLButtonElement;

            expect(apply.textContent?.trim()).toBe('Close');
            expect(apply.disabled).toBe(false);
            expect(apply.classList.contains('is-quiet')).toBe(true);

            apply.click();
            fixture.detectChanges();

            // Close folds its own card and leaves the stage exactly where it was.
            expect(component.transformationDrafts[0].open).toBe(false);
            expect(component.sectionOpen().transformation).toBe(true);
            expect(component.isStepAdded('transformation')).toBe(true);
        });

        it('counts pending preprocessing changes in the badge and apply label', () => {
            const pending = vi.spyOn(component, 'pendingPreprocessingChangeCount', 'get').mockReturnValue(2);
            const missingPending = vi.spyOn(component, 'pendingMissingChangeCount', 'get').mockReturnValue(2);

            expect(component.preprocessingStatusLabel).toBe('In run · 2 changes not applied');
            expect(component.stepApplyLabel('missing')).toBe('Apply');

            pending.mockReturnValue(1);
            missingPending.mockReturnValue(0);
            expect(component.preprocessingStatusLabel).toBe('In run · 1 change not applied');
            // A card with nothing pending offers Close in its own footer instead of an Apply.
            expect(component.stepApplyLabel('missing')).toBe('Close');
        });

        /**
         * Every preprocessing card owns its Discard / Preview / Apply footer: the stage no
         * longer carries a bar of its own, so an action can never reach across cards.
         */
        it('gives each preprocessing card its own footer actions', () => {
            (mockExpService.selectedVariables as any).set([age]);
            component.addStep('setup');
            component.enableOutlierHandling();
            fixture.detectChanges();

            const openCards = (Array.from(
                (fixture.nativeElement as HTMLElement).querySelectorAll(
                    '[data-guide="analysis-preprocessing"] app-station-card')
            ) as HTMLElement[])
                .filter((card) => card.querySelector('.station-card')?.classList.contains('is-open'));

            // Missing Values plus the optional Outlier Handling card, each with one primary.
            expect(openCards.length).toBe(2);
            for (const card of openCards) {
                expect(card.querySelectorAll('.station-card-footer .station-action-apply').length).toBe(1);
            }

            // Nothing floats outside a card footer: no stage-level action bar in the station.
            const shell = (fixture.nativeElement as HTMLElement).querySelector(
                '[data-guide="analysis-preprocessing"] .preprocessing-shell') as HTMLElement;
            const strayBars = (Array.from(shell.querySelectorAll('.station-action-bar')) as HTMLElement[])
                .filter((bar) => !bar.closest('.station-card-footer'));
            expect(strayBars).toEqual([]);
        });

        it('shows category counts on the rule rows and has no preview button', () => {
            component.addStep('transformation');
            component.chooseTransformation('categorical');
            fixture.detectChanges();

            const footer = (fixture.nativeElement as HTMLElement).querySelector(
                '[data-guide="analysis-transformation"] .station-card-footer') as HTMLElement;
            expect(footer.querySelector('.station-action-preview')).toBeNull();
            expect(footer.querySelector('.station-action-apply')).toBeTruthy();
        });

        it('folds the How to use strip by default', () => {
            component.goToSection('transformation');
            fixture.detectChanges();

            const section = (fixture.nativeElement as HTMLElement).querySelector('[data-guide="analysis-transformation"]');
            const strip = section?.querySelector('details.how-to-strip') as HTMLDetailsElement | null;
            expect(strip).toBeTruthy();
            expect(strip?.open).toBe(false);
            expect(strip?.querySelector('summary .how-to-label')?.textContent?.trim()).toBe('How to use');

            (strip as HTMLDetailsElement).open = true;
            expect(strip?.querySelectorAll('.how-to-number').length).toBe(3);
        });

        it('numbers the column editor and adds categories from the ghost row', () => {
            component.goToSection('transformation');
            // The stage opens on the type chooser; the editor belongs to the column card.
            component.chooseTransformation('categorical');
            fixture.detectChanges();

            const section = (fixture.nativeElement as HTMLElement).querySelector('[data-guide="analysis-transformation"]');
            const create = section?.querySelector('.transformation-create');
            expect(create?.querySelectorAll('.column-step').length).toBe(2);
            expect(Array.from(create?.querySelectorAll('.column-step-number') ?? [])
                .map((number) => number.textContent?.trim()))
                .toEqual(['1', '2']);

            const ghost = section?.querySelector('.transformation-rules-list .transformation-add-category') as HTMLButtonElement | null;
            // The "Otherwise" fallback row was removed (task 02); the ghost button is now the
            // last element of the rules list and no fallback row may follow it.
            expect(section?.querySelector('.transformation-rule-fallback')).toBeNull();

            const before = (component as any).transformationDrafts[0].rules.length as number;
            (ghost as HTMLButtonElement).click();
            fixture.detectChanges();

            expect((component as any).transformationDrafts[0].rules.length).toBe(before + 1);
            expect((ghost as HTMLButtonElement).textContent).toContain('Add category');
        });
    });

    describe('category rule focus', () => {
        function rulesBlock(): HTMLElement {
            return (fixture.nativeElement as HTMLElement).querySelector(
                '[data-guide="analysis-transformation"] .transformation-rules') as HTMLElement;
        }

        function openCardWithTwoCategories() {
            // The rule builder renders its conditions only once there are variables to filter on.
            (mockExpService.selectedVariables as any).set([age]);
            component.goToSection('transformation');
            component.chooseTransformation('categorical');
            const draft = component.transformationDrafts[0];
            component.addTransformationRule(draft);
            component.addTransformationRule(draft);
            fixture.detectChanges();
            return draft;
        }

        it('opens the new category on a started filter', () => {
            const draft = openCardWithTwoCategories();

            expect(draft.openRuleIndex).toBe(1);
            const editing = rulesBlock().querySelector('.transformation-rule-editor.is-open');
            expect(editing?.querySelector('.empty-filter-group')).toBeNull();
            expect(editing?.querySelector('.condition-row')).not.toBeNull();
            expect(rulesBlock().querySelector('.transformation-rule-edit-link')?.textContent?.trim()).toBe('Set rule');
        });

        it('focuses the table on the rule being edited, and Done folds back to the list', () => {
            const draft = openCardWithTwoCategories();

            expect(rulesBlock().classList.contains('is-focused')).toBe(true);
            const editing = rulesBlock().querySelectorAll('.transformation-rule-row.is-editing');
            expect(editing.length).toBe(1);
            expect(editing[0].querySelector('.transformation-rule-number')?.textContent?.trim()).toBe('2');
            // Its own Edit button gives way to Done inside the editor.
            expect(editing[0].querySelector('.transformation-rule-edit-link')).toBeNull();
            expect(rulesBlock().closest('.column-step')?.querySelector('.column-step-meta')?.textContent?.trim())
                .toBe('Editing category 2 of 2');

            const filter = { condition: 'AND', rules: [{ id: 'age', field: 'age', operator: 'greater', value: 60 }] };
            const modal = component.transformationRuleModals!.toArray()[1];
            vi.spyOn(modal, 'exportFilterLogic').mockReturnValue(filter as any);
            (editing[0].querySelector('.transformation-rule-done') as HTMLButtonElement).click();
            fixture.detectChanges();

            expect(draft.rules[1].filter).toEqual(filter as any);
            expect(draft.openRuleIndex).toBeNull();
            expect(rulesBlock().classList.contains('is-focused')).toBe(false);
            expect(rulesBlock().querySelectorAll('.transformation-rule-edit-link')[1].textContent?.trim()).toBe('Edit rule');
        });

        it('keeps a rule open when its builder reports an error on Done', () => {
            const draft = openCardWithTwoCategories();
            component.toggleTransformationRule(draft, 0);
            fixture.detectChanges();

            const modal = component.transformationRuleModals!.toArray()[0];
            vi.spyOn(modal, 'exportFilterLogic').mockReturnValue(null);
            vi.spyOn(modal, 'filterError').mockReturnValue('Pick a value');
            component.finishTransformationRule(draft, 0);

            expect(draft.openRuleIndex).toBe(0);
            expect(draft.rules[0].filter).toBeNull();
        });
    });

    describe('review regressions', () => {
        // Built on the component's own empty summary so teardown finds its histogram maps.
        const summaryOf = (total: number) => ({
            ...(component as any).createEmptySummary(false),
            featurewiseRows: [{ dataset: 'all datasets', data: { num_total: total } }],
        });

        it('keeps a chosen K-means card in the graph when it is folded', () => {
            component.addStep('transformation');
            component.chooseTransformation('kmeans');
            component.toggleCardOpen(component.cards()[0].id, false);

            expect(component.kmeansCardShown).toBe(true);
            expect(component.transformationChooserOnly).toBe(false);
        });

        it('Clear drops the K-means card and its preview, back to the chooser', () => {
            component.addStep('transformation');
            component.chooseTransformation('kmeans');
            const stepId = component.cards().find((step) => step.name === 'kmeans_cluster_creator')!.id;
            mockExpService.upsertTransformation({
                id: stepId,
                name: 'kmeans_cluster_creator',
                parameters: {
                    new_column_names: ['cluster'],
                    k: 1,
                    enumeration_prefix: 'cluster_',
                    reusable_preprocessing: {
                        enumeration_prefix: 'cluster_',
                        cluster_choices: [{ cluster_id: 'c1', label: 'Cluster 1' }],
                        cluster_variables: ['a'],
                    },
                },
            });
            component.previewTransformationCard(stepId);

            component.resetTransformation();

            expect(component.previewDraftId).toBeNull();
            expect(component.kmeansCardShown).toBe(false);
            expect(component.transformationChooserOnly).toBe(true);
        });

        it('previewing the K-means card commits no categorical card', () => {
            component.addStep('transformation');
            component.chooseTransformation('kmeans');
            const stepId = component.cards().find((step) => step.name === 'kmeans_cluster_creator')!.id;
            const commit = vi.spyOn(component, 'commitTransformationRuleFilters').mockReturnValue(undefined);
            vi.spyOn(component, 'refreshTransformationStatistics').mockReturnValue(undefined);

            component.previewTransformationCard(stepId);

            expect(commit).not.toHaveBeenCalled();
            expect(component.previewDraftId).toBe(stepId);
        });

        it('hides Records out while the Raw summary is pinned to an unapplied preview', () => {
            (mockExpService.filterLogic as any).set(null);
            (component as any).rawSummaryKey = (component as any).rawSummaryKeyFor();
            (component as any).rawSummary = summaryOf(400);
            expect(component.recordsOut.source).toBe(400);
            expect(component.recordsOut.filtered).toBe(400);

            // Pinned to unsaved "age >= 60": 120 rows are not the source cohort.
            const pinned = { condition: 'AND', rules: [{ id: 'age', field: 'age', operator: 'greater_or_equal', value: 60 }] } as any;
            (component as any).rawSummaryKey = (component as any).rawSummaryKeyFor(pinned);
            (component as any).rawSummary = summaryOf(120);
            expect(component.recordsOut.source).toBeNull();
            expect(component.recordsOut.filtered).toBeNull();
        });

        it('never rounds a partial filter match to 0% or 100%', () => {
            (component as any).sourceSummary = summaryOf(1000);
            (component as any).rawSummary = summaryOf(998);
            expect(component.filterPreviewStatus).toContain('· 99%');
            (component as any).rawSummary = summaryOf(2);
            expect(component.filterPreviewStatus).toContain('· 1%');
            (component as any).rawSummary = summaryOf(1000);
            expect(component.filterPreviewStatus).toContain('· 100%');
        });

        it('keeps a card open with a message when its own Apply fails', () => {
            (mockExpService.selectedVariables as any).set([age]);
            component.addStep('setup');
            fixture.detectChanges();
            component.pendingPreprocessingRules = {
                age: { variableCode: 'age', action: 'mean', value: '', enabled: true },
            } as any;
            mockExpService.loadDescriptiveOverview.mockReturnValue(throwError(() => new Error('boom')));
            vi.spyOn(console, 'error').mockReturnValue(undefined);

            component.commitOrCloseStep('missing');

            expect(component.preprocessingStepOpen.missing).toBe(true);
            expect(component.sectionOpen().processed).toBe(false);
            expect(component.preprocessingApplyError['missing']).toContain('Could not apply');
            expect(component.stepPendingCount('missing')).toBe(1);

            component.resetChanges('missing');
            expect(component.preprocessingApplyError['missing']).toBeUndefined();
        });

        it('applying one card leaves the other card pending and unsaved', () => {
            (mockExpService.selectedVariables as any).set([age]);
            component.addStep('setup');
            fixture.detectChanges();
            component.onMissingActionChange(age, 'mean');
            component.pendingOutlierRules = {
                age: { variableCode: 'age', enabled: true, strategy: 'iqr', tail: 'both', fold: 1.5 },
            };

            component.commitOrCloseStep('missing');
            TestBed.flushEffects();

            expect(component.pendingOutlierRules['age'].enabled).toBe(true);
            expect(component.stepPendingCount('outlier')).toBe(1);
            expect(component.stepPendingCount('missing')).toBe(0);
            const saved = mockExpService.setAppliedDescriptivePreprocessing.mock.lastCall![0] as Record<string, unknown>;
            expect(saved['missing_values_handler']).toEqual(expect.objectContaining({ strategies: { age: 'mean' } }));
            expect(saved['outlier_winsorizer']).toBeUndefined();
        });

        it('previews one card while another card is invalid', () => {
            (mockExpService.selectedVariables as any).set([age]);
            component.addStep('setup');
            fixture.detectChanges();
            component.onMissingActionChange(age, 'mean');
            component.pendingOutlierRules = {
                age: { variableCode: 'age', enabled: true, strategy: 'iqr', tail: 'both', fold: null },
            };
            mockExpService.loadDescriptiveOverview.mockClear();

            component.previewProcessedData('missing');

            expect(mockExpService.loadDescriptiveOverview).toHaveBeenCalled();
            const config = mockExpService.loadDescriptiveOverview.mock.lastCall![1] as Record<string, unknown>;
            expect(config['missing_values_handler']).toEqual(expect.objectContaining({ strategies: { age: 'mean' } }));
            expect(config['outlier_winsorizer']).toBeUndefined();
        });
    });

    /**
     * A stage used to draw one dashed row per step it could still add: nine rows once the whole
     * catalog was on offer. The rail now ends in a single add row whose menu holds every step,
     * grouped by what the user wants to do.
     */
    describe('add-step menu on the collapsed rail', () => {
        const step = (name: string, label: string) => ({
            name,
            label,
            desc: `${label} description.`,
            parameters: {
                variables: { label: 'Variables', desc: '', types: ['text'], required: true, multiple: true },
            },
        });
        const catalog = [
            step('global_imputer', 'Global Imputer'),
            step('global_winsorizer', 'Global Winsorizer'),
            step('one_hot_encoder', 'One-Hot Encoder'),
            step('ordinal_encoder', 'Ordinal Encoder'),
            step('missing_indicator', 'Missing Indicator'),
            step('outlier_detector', 'Outlier Detector'),
        ];

        beforeEach(() => {
            mockExpService.genericCatalogSteps.mockReturnValue(catalog as never);
            mockExpService.catalogStepSpec.mockImplementation(((name: string) =>
                catalog.find((candidate) => candidate.name === name) ?? null) as never);
            (mockExpService.selectedVariables as any).set([age]);
            fixture.detectChanges();
        });

        it('ends each rail in one closed add row, however many steps the stage can add', () => {
            for (const [stage, label] of [
                ['analysis-preprocessing', 'Add a preprocessing step'],
                ['analysis-transformation', 'Add a transformation step'],
            ] as const) {
                const card = pipelineCard(stage);
                expect(railRows(card).ghost.length, stage).toBe(1);
                expect(railRows(card).ghost[0].querySelector('.pipeline-subnode-dot'), stage).not.toBeNull();
                expect(railTrigger(card)?.textContent, stage).toContain(label);
                expect(railTrigger(card)?.getAttribute('aria-expanded'), stage).toBe('false');
                expect(card.querySelectorAll('.step-picker-option').length, stage).toBe(0);
            }
            // Missing values is the only live row; the steps to add are inside the menu.
            expect(railRows(pipelineCard('analysis-preprocessing')).live.length).toBe(1);
            expect(railRows(pipelineCard('analysis-transformation')).live.length).toBe(0);
        });

        it('says what kind of steps each menu holds', () => {
            expect(railTrigger(pipelineCard('analysis-preprocessing'))?.textContent)
                .toContain('Fill or cap values. Every variable keeps its meaning.');
            expect(railTrigger(pipelineCard('analysis-transformation'))?.textContent)
                .toContain('Reshape values, encode categories, flag records or create columns.');
        });

        it('groups the preprocessing steps by purpose', () => {
            const card = pipelineCard('analysis-preprocessing');
            railOptions(card);
            const groups = Array.from(card.querySelectorAll('.step-picker-group')) as HTMLElement[];

            expect(groups.map((group) => group.dataset['group'])).toEqual(['missing', 'outliers']);
            expect(groups.map((group) => Array.from(group.querySelectorAll('.step-picker-option')).map((option) => (option as HTMLElement).dataset['step'])))
                .toEqual([['global_imputer'], ['outlier_winsorizer', 'global_winsorizer']]);
        });

        it('groups the transformation steps by purpose, column creators last', () => {
            const card = pipelineCard('analysis-transformation');
            railOptions(card);
            const groups = Array.from(card.querySelectorAll('.step-picker-group')) as HTMLElement[];

            expect(groups.map((group) => group.dataset['group'])).toEqual(['reshape', 'encode', 'flag', 'create']);
            expect(groups.map((group) => Array.from(group.querySelectorAll('.step-picker-option')).map((option) => (option as HTMLElement).dataset['step'])))
                .toEqual([
                    ['variable_transformer', 'variable_scaler'],
                    ['one_hot_encoder', 'ordinal_encoder'],
                    ['missing_indicator', 'outlier_detector'],
                    ['categorical_column_creator', 'kmeans_cluster_creator'],
                ]);
        });

        it('shows a creator with the name and icon of the card it adds', () => {
            const option = railOption(pipelineCard('analysis-transformation'), 'kmeans_cluster_creator')!;

            expect(option.querySelector('.step-picker-option-title')?.textContent?.trim()).toBe('K-means cluster column');
            expect(option.querySelector('i')?.className).toContain('fa-diagram-project');
        });

        it('offers the longitudinal comparison only for a longitudinal data model', () => {
            expect(railSteps(pipelineCard('analysis-transformation'))).not.toContain('longitudinal_transformer');

            (mockExpService.selectedDataModel as any).set({ code: 'Stroke', version: '3.7', variables: [], longitudinal: true });
            fixture.detectChanges();

            const card = pipelineCard('analysis-transformation');
            expect(railSteps(card)).toContain('longitudinal_transformer');
            expect((card.querySelector('.step-picker-group[data-group="visits"]') as HTMLElement | null)?.textContent)
                .toContain('Longitudinal Transformation');
        });

        it('keeps the rail caption free of the old dashed-row wording', () => {
            const caption = pipelineCard('analysis-preprocessing').querySelector('.pipeline-subnodes-caption')?.textContent ?? '';

            expect(caption).toContain('These steps run in this order');
            expect(caption).not.toContain('dashed');
        });
    });
});
