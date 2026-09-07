import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideEchartsCore } from 'ngx-echarts';
import { StatisticAnalysisPanelComponent } from './statistic-analysis-panel.component';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ChartBuilderService } from '../visualisations/charts/chart-builder.service';
import { PdfExportService } from '../../../services/pdf-export.service';

/**
 * Contract: a pipeline node is "active" only when the stage's work is either
 * opened this visit or present in the persisted request config. Opening a
 * stage must never write that config.
 */
describe('StatisticAnalysisPanelComponent pipeline presence', () => {
    let component: StatisticAnalysisPanelComponent;
    let fixture: ComponentFixture<StatisticAnalysisPanelComponent>;
    let mockExpService: jasmine.SpyObj<ExperimentStudioService>;

    const age = { code: 'age', label: 'Age', type: 'real' };

    /** Round-trips the applied config the way the real service does. */
    function seedAppliedConfig(config: Record<string, unknown> | null): void {
        (mockExpService.appliedPreprocessingConfig as any).set(config);
        mockExpService.getAppliedDescriptivePreprocessing.and.returnValue(config as never);
    }

    beforeEach(async () => {
        mockExpService = jasmine.createSpyObj('ExperimentStudioService', [
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
            'setTransformationPreprocessing',
        ], {
            selectedVariables: signal([]),
            selectedFilters: signal([]),
            selectedDatasets: signal(['dataset-a']),
            selectedDataModel: signal({ code: 'Stroke', version: '3.7' }),
            filterLogic: signal(null),
            editingExistingExperiment: () => false,
            appliedPreprocessingConfig: signal<Record<string, unknown> | null>(null),
            backendAlgorithms: signal({})
        });
        mockExpService.loadDescriptiveOverview.and.returnValue(of({ result: { featurewise: [] } }));
        mockExpService.loadOutlierReportPreview.and.returnValue(of({ result: { featurewise: [] } }));
        mockExpService.getAlgorithmResults.and.returnValue(of({ result: { histogram: [] } }));
        mockExpService.getAppliedDescriptivePreprocessing.and.returnValue(null);
        mockExpService.getDatasetLabelMap.and.returnValue({ 'dataset-a': 'Dataset A' });
        mockExpService.setAppliedDescriptivePreprocessing.and.callFake((config: unknown) =>
            seedAppliedConfig(config as Record<string, unknown> | null));
        mockExpService.setTransformationPreprocessing.and.callFake((config: unknown) => {
            const next: Record<string, unknown> = { ...(mockExpService.appliedPreprocessingConfig() ?? {}) };
            if (config) next['categorical_column_creator'] = config;
            else delete next['categorical_column_creator'];
            seedAppliedConfig(Object.keys(next).length ? next : null);
        });

        await TestBed.configureTestingModule({
            imports: [StatisticAnalysisPanelComponent],
            providers: [
                provideZonelessChangeDetection(),
                provideEchartsCore({ echarts: () => import('echarts') }),
                { provide: ExperimentStudioService, useValue: mockExpService },
                { provide: ChartBuilderService, useValue: (() => { const s = jasmine.createSpyObj('ChartBuilderService', ['getChartsForAlgorithm']); s.getChartsForAlgorithm.and.returnValue([]); return s; })() },
                { provide: PdfExportService, useValue: jasmine.createSpyObj('PdfExportService', ['exportDescriptiveStatisticsPdf']) }
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

        expect(component.isStepAdded('filters')).toBeTrue();
        expect(component.activeStagesCount).toBe(1);
        expect(mockExpService.filterLogic()).toBe(logic);
        expect(mockExpService.setFilterLogic).not.toHaveBeenCalled();
    });

    it('marks Preprocessing active from a persisted applied config', () => {
        seedAppliedConfig({ missing_values_handler: { strategies: { age: 'drop' } } });
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        expect(component.isStepAdded('setup')).toBeTrue();
        expect(component.activeStagesCount).toBe(1);
    });

    it('counts transformation-only work as Transformation, not Preprocessing', () => {
        seedAppliedConfig({
            categorical_column_creator: {
                code: 'group',
                strategy: 'filter_rules',
                rules: { mild: { field: 'age', operator: '<', value: 50 } },
            },
        });
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        expect(component.isStepAdded('transformation')).toBeTrue();
        expect(component.isStepAdded('setup')).toBeFalse();
    });

    it('does not persist when Preprocessing is opened', () => {
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        mockExpService.setAppliedDescriptivePreprocessing.calls.reset();
        mockExpService.setTransformationPreprocessing.calls.reset();
        component.addStep('setup');
        component.goToSection('setup');
        fixture.detectChanges();

        expect(mockExpService.setAppliedDescriptivePreprocessing).not.toHaveBeenCalled();
        expect(mockExpService.setTransformationPreprocessing).not.toHaveBeenCalled();
        expect((component as any).userPreprocessingApplied).toBe(false);
    });

    it('persists on Apply and clears the persisted config on Remove', () => {
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        component.onMissingActionChange(age, 'mean');
        component.applyPreprocessing();

        expect(mockExpService.setAppliedDescriptivePreprocessing).toHaveBeenCalledWith(
            jasmine.objectContaining({ missing_values_handler: { strategies: { age: 'mean' } } }),
        );
        expect(component.isStepAdded('setup')).toBeTrue();

        mockExpService.setAppliedDescriptivePreprocessing.calls.reset();
        component.removeStep('setup');

        expect(mockExpService.setAppliedDescriptivePreprocessing).toHaveBeenCalledWith(null);
        expect(component.isStepAdded('setup')).toBeFalse();
    });

    it('shows the default NA-removal sub-node before any customization', () => {
        const nodes = component.appliedPreprocessingSubNodes;

        expect(nodes.length).toBe(1);
        expect(nodes[0].id).toBe('missing');
        expect(nodes[0].statusLabel).toBe('Default');
        expect(component.appliedPreprocessingCount).toBe(0);
        expect(component.appliedTransformationSubNodes).toEqual([]);
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

    it('surfaces the applied derived column as a transformation sub-node', () => {
        seedAppliedConfig({
            categorical_column_creator: {
                code: 'mrs_good_outcome',
                strategy: 'filter_rules',
                rules: {
                    good: { field: 'age', operator: '<', value: 50 },
                    bad: { field: 'age', operator: '>=', value: 50 },
                },
                default_enumeration: 'unknown',
            },
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
                    code: 'mrs_good_outcome',
                    strategy: 'filter_rules',
                    rules: { good: { field: 'age', operator: '<', value: 50 } },
                },
                {
                    code: 'mrs_bad_outcome',
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

    it('collapses the stage on Apply so every derived column shows in the overview', () => {
        seedAppliedConfig({
            categorical_column_creator: [
                { code: 'mrs_good_outcome', strategy: 'filter_rules', rules: { good: { field: 'age', operator: '<', value: 50 } } },
                { code: 'mrs_bad_outcome', strategy: 'filter_rules', rules: { bad: { field: 'age', operator: '>=', value: 50 } } },
            ],
        });
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        component.addStep('transformation');
        fixture.detectChanges();
        expect(component.sectionOpen().transformation).toBeTrue();

        // Echo the hydrated filters back so committing does not blank them.
        const committed = component.transformationDrafts.flatMap((draft) => draft.rules.map((rule) => rule.filter));
        component.transformationRuleModals = {
            toArray: () => committed.map((filter) => ({ exportFilterLogic: () => filter, filterError: () => null })),
        } as any;

        component.applyTransformation();
        fixture.detectChanges();

        expect(component.sectionOpen().transformation).toBeFalse();
        const overview = Array.from(
            fixture.nativeElement.querySelectorAll('[data-guide="analysis-transformation"] .pipeline-subnode-item')
        ) as HTMLElement[];
        expect(overview.map((item) => item.textContent)).toEqual([
            jasmine.stringMatching('mrs_good_outcome'),
            jasmine.stringMatching('mrs_bad_outcome'),
        ]);
    });

    it('expands the stage and opens only the clicked station on sub-node click', () => {
        seedAppliedConfig({ missing_values_handler: { strategies: { age: 'mean' } } });
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        component.addStep('setup');
        component.preprocessingStepOpen.missing = true;
        component.jumpToSubNode('setup', 'outlier');

        expect(component.sectionOpen().setup).toBeTrue();
        expect(component.preprocessingStepOpen.outlier).toBeTrue();
        expect(component.preprocessingStepOpen.missing).toBeFalse();
        expect(component.preprocessingStepOpen.longitudinal).toBeFalse();

        component.jumpToSubNode('transformation', 'transformation');
        expect(component.sectionOpen().transformation).toBeTrue();
        expect(component.preprocessingStepOpen.transformation).toBeTrue();
    });
});
