import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatisticAnalysisPanelComponent } from './statistic-analysis-panel.component';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ChartBuilderService } from '../visualisations/charts/chart-builder.service';
import { PdfExportService } from '../../../services/pdf-export.service';
import { of } from 'rxjs';
import { provideZonelessChangeDetection, signal } from '@angular/core';

describe('StatisticAnalysisPanelComponent', () => {
    let component: StatisticAnalysisPanelComponent;
    let fixture: ComponentFixture<StatisticAnalysisPanelComponent>;
    let mockExpService: jasmine.SpyObj<ExperimentStudioService>;
    let mockChartBuilder: jasmine.SpyObj<ChartBuilderService>;
    let mockPdfService: jasmine.SpyObj<PdfExportService>;

    beforeEach(async () => {
        mockExpService = jasmine.createSpyObj('ExperimentStudioService', [
            'loadDescriptiveOverview',
            'setDataExclusionWarnings',
            'clearDataExclusionWarnings',
            'setAppliedDescriptivePreprocessing'
        ], {
            selectedVariables: signal([]),
            selectedCovariates: signal([]),
            selectedFilters: signal([]),
            selectedDataModel: signal(null)
        });
        mockChartBuilder = jasmine.createSpyObj('ChartBuilderService', ['getChartsForAlgorithm']);
        mockChartBuilder.getChartsForAlgorithm.and.returnValue([]);
        mockPdfService = jasmine.createSpyObj('PdfExportService', ['exportDescriptiveStatisticsPdf']);

        await TestBed.configureTestingModule({
            imports: [StatisticAnalysisPanelComponent], // Standalone component
            providers: [
                provideZonelessChangeDetection(),
                { provide: ExperimentStudioService, useValue: mockExpService },
                { provide: ChartBuilderService, useValue: mockChartBuilder },
                { provide: PdfExportService, useValue: mockPdfService }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(StatisticAnalysisPanelComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should treat variable as nominal if counts are present in response, even if metadata type is missing', () => {
        // 1. Setup metadata (variable without nominal type)
        const variable = { code: 'biol_sex', label: 'Biological Sex', type: 'unknown' };
        (mockExpService.selectedVariables as any).set([variable]);

        // 2. Setup response with counts
        const response = {
            result: {
                featurewise: [
                    {
                        variable: 'biol_sex',
                        data: {
                            counts: { 'Female': 10, 'Male': 15 }, // Presence of counts
                            num_dtps: 25,
                            num_na: 0,
                            num_total: 25
                        }
                    }
                ],
            }
        };
        mockExpService.loadDescriptiveOverview.and.returnValue(of(response));

        // 3. Trigger fetch
        component.fetchDescriptiveStatistics();

        // 4. Verify categorization
        // Should be in nominalVariables
        expect(component.rawSummary.nominalVariables.find(v => v.code === 'biol_sex')).toBeTruthy();
        // Should NOT be in nonNominalVariables
        expect(component.rawSummary.nonNominalVariables.find(v => v.code === 'biol_sex')).toBeFalsy();
        // Charts should be built for nominal
        expect(component.rawSummary.chartsForNominal.length).toBe(1);
    });

    it('should treat variable as nominal if metadata type is nominal', () => {
        const variable = { code: 'var_nom', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([variable]);

        const response = { result: { featurewise: [] } }; // Empty data
        mockExpService.loadDescriptiveOverview.and.returnValue(of(response));

        component.fetchDescriptiveStatistics();

        expect(component.rawSummary.nominalVariables.find(v => v.code === 'var_nom')).toBeTruthy();
    });

    it('should treat variable as numeric if no counts and not nominal type', () => {
        const variable = { code: 'age', type: 'real' };
        (mockExpService.selectedVariables as any).set([variable]);

        const response = {
            result: {
                featurewise: [
                    { variable: 'age', data: { mean: 30, std: 5 } } // No counts
                ],
            }
        };
        mockExpService.loadDescriptiveOverview.and.returnValue(of(response));

        component.fetchDescriptiveStatistics();

        expect(component.rawSummary.nonNominalVariables.find(v => v.code === 'age')).toBeTruthy();
        expect(component.rawSummary.nominalVariables.find(v => v.code === 'age')).toBeFalsy();
    });

    it('renders the data review workflow without a model tab', () => {
        fixture.detectChanges();
        const text = fixture.nativeElement.textContent as string;

        expect(text).toContain('DATA REVIEW & PREPROCESSING');
        expect(text).toContain('Raw Data Summary');
        expect(text).toContain('Preprocessing Setup');
        expect(text).toContain('Processed Data Summary');
        const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
        const buttonLabels = Array.from(buttons).map((button) => button.textContent?.trim());
        expect(buttonLabels).not.toContain('Model');
    });

    it('shows longitudinal preprocessing only for longitudinal data models', () => {
        (mockExpService.selectedDataModel as any).set({
            code: 'longitudinal_dm',
            label: 'Longitudinal Data Model',
            longitudinal: true,
            variables: [
                {
                    code: 'visitid',
                    label: 'Visit ID',
                    enumerations: [
                        { code: 'BL', label: 'Baseline' },
                        { code: 'FL1', label: 'Follow-up 1' },
                    ],
                },
            ],
        });
        (mockExpService.selectedVariables as any).set([
            { code: 'age', label: 'Age', type: 'real' },
        ]);
        mockExpService.loadDescriptiveOverview.and.returnValue(of({ result: { featurewise: [] } }));

        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Longitudinal Preprocessing');
        expect(fixture.nativeElement.textContent).toContain('Required for longitudinal pathologies');
        expect(fixture.nativeElement.textContent).toContain('Diff (Visit 2 - Visit 1)');
        expect(fixture.nativeElement.textContent).not.toContain('Enable longitudinal transformation');

        (mockExpService.selectedDataModel as any).set({ code: 'dm', label: 'Data Model', longitudinal: false });
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).not.toContain('Longitudinal Preprocessing');
    });

    it('filters preprocessing rows by variable search', () => {
        (mockExpService.selectedVariables as any).set([
            { code: 'age', label: 'Age', type: 'real' },
            { code: 'biol_sex', label: 'Biological Sex', type: 'nominal' },
        ]);
        component.preprocessingSearch = 'age';

        expect(component.filteredPreprocessingVariables.map((v) => v.code)).toEqual(['age']);
    });

    it('shows the same empty state for longitudinal preprocessing when search has no matches', () => {
        (mockExpService.selectedDataModel as any).set({
            code: 'longitudinal_dm',
            label: 'Longitudinal Pathology',
            longitudinal: true,
            variables: [
                {
                    code: 'visitid',
                    label: 'Visit ID',
                    enumerations: [
                        { code: 'BL', label: 'Baseline' },
                        { code: 'FL1', label: 'Follow-up 1' },
                    ],
                },
            ],
        });
        (mockExpService.selectedVariables as any).set([
            { code: 'age', label: 'Age', type: 'real' },
        ]);
        component.preprocessingSearch = 'no-match';
        mockExpService.loadDescriptiveOverview.and.returnValue(of({ result: { featurewise: [] } }));

        fixture.detectChanges();

        const longitudinalSection = fixture.nativeElement.querySelector('.longitudinal-preprocessing') as HTMLElement;
        expect(longitudinalSection.querySelector('.empty-state-block')).toBeTruthy();
        expect(longitudinalSection.querySelector('.longitudinal-table')).toBeFalsy();
    });

    it('splits preprocessing rows by applied and not applied state', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age, sex]);
        component.appliedPreprocessingRules = {
            age: { variableCode: 'age', action: 'drop', value: '', enabled: true },
        };

        const appliedGroup = component.preprocessingGroups.find((group) => group.key === 'applied');
        const notAppliedGroup = component.preprocessingGroups.find((group) => group.key === 'not-applied');

        expect(appliedGroup?.variables.map((v) => v.code)).toEqual(['age']);
        expect(notAppliedGroup?.variables.map((v) => v.code)).toEqual(['sex']);
    });

    it('keeps preprocessing rules when variables are removed and re-added', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'real' };
        mockExpService.loadDescriptiveOverview.and.returnValue(of({ result: { featurewise: [] } }));
        component.pendingPreprocessingRules = {
            age: { variableCode: 'age', action: 'drop', value: '', enabled: true },
        };
        component.appliedPreprocessingRules = {
            age: { variableCode: 'age', action: 'drop', value: '', enabled: true },
        };

        (mockExpService.selectedVariables as any).set([sex]);
        fixture.detectChanges();
        expect(component.appliedPreprocessingRules['age']?.action).toBe('drop');
        expect(component.preprocessingGroups.find((group) => group.key === 'applied')).toBeUndefined();

        (mockExpService.selectedVariables as any).set([age, sex]);
        fixture.detectChanges();

        const appliedGroup = component.preprocessingGroups.find((group) => group.key === 'applied');
        const notAppliedGroup = component.preprocessingGroups.find((group) => group.key === 'not-applied');
        expect(appliedGroup?.variables.map((v) => v.code)).toEqual(['age']);
        expect(notAppliedGroup?.variables.map((v) => v.code)).toEqual(['sex']);
    });

    it('creates pending state when a missing value action changes', () => {
        const variable = { code: 'age', label: 'Age', type: 'real' };
        (mockExpService.selectedVariables as any).set([variable]);
        component.onMissingActionChange(variable, 'mean');

        expect(component.pendingChangeCount).toBe(1);
        expect(component.preprocessingStatus).toBe('pending');
    });

    it('validates constant missing value rules before apply', () => {
        const variable = { code: 'age', label: 'Age', type: 'real' };
        (mockExpService.selectedVariables as any).set([variable]);
        component.onMissingActionChange(variable, 'constant');

        component.applyPreprocessing();

        expect(component.preprocessingValidationErrors['age']).toBe('A constant value is required.');
        expect(mockExpService.loadDescriptiveOverview).not.toHaveBeenCalled();
    });

    it('expands processed summary accordions after preprocessing is applied', () => {
        const variable = { code: 'age', label: 'Age', type: 'real' };
        (mockExpService.selectedVariables as any).set([variable]);
        mockExpService.loadDescriptiveOverview.and.returnValue(of({
            result: {
                featurewise: [
                    {
                        dataset: 'all datasets',
                        variable: 'age',
                        data: {
                            num_dtps: 10,
                            num_na: 0,
                            num_total: 10,
                            mean: 71,
                        },
                    },
                ],
            },
        }));

        component.onMissingActionChange(variable, 'mean');
        component.applyPreprocessing();

        expect(component.sectionOpen.processed).toBeTrue();
        expect(component.isAccordionOpen('processed', 'Age')).toBeTrue();
    });

    it('applies longitudinal preprocessing with visit pair and per-variable strategies', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age, sex]);
        (mockExpService.selectedDataModel as any).set({
            code: 'longitudinal_dm',
            label: 'Longitudinal Data Model',
            longitudinal: true,
            variables: [
                {
                    code: 'visitid',
                    label: 'Visit ID',
                    enumerations: [
                        { code: 'BL', label: 'Baseline' },
                        { code: 'FL1', label: 'Follow-up 1' },
                    ],
                },
            ],
        });
        mockExpService.loadDescriptiveOverview.and.returnValue(of({ result: { featurewise: [] } }));

        component.applyPreprocessing();

        expect(mockExpService.loadDescriptiveOverview).toHaveBeenCalledWith(['age', 'sex'], {
            longitudinal_transformer: {
                visit1: 'BL',
                visit2: 'FL1',
                strategies: {
                    age: 'diff',
                    sex: 'first',
                },
            },
        });
        expect(mockExpService.setAppliedDescriptivePreprocessing).toHaveBeenCalledWith({
            longitudinal_transformer: {
                visit1: 'BL',
                visit2: 'FL1',
                strategies: {
                    age: 'diff',
                    sex: 'first',
                },
            },
        });
    });
});
