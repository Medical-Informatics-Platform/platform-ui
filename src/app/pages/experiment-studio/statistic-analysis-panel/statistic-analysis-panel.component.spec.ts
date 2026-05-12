import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatisticAnalysisPanelComponent } from './statistic-analysis-panel.component';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ChartBuilderService } from '../visualisations/charts/chart-builder.service';
import { PdfExportService } from '../../../services/pdf-export.service';
import { of, Subject } from 'rxjs';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideEchartsCore } from 'ngx-echarts';
import { getExperimentStudioScrollOffset } from '../experiment-studio-scroll.util';

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
            'setAppliedDescriptivePreprocessing',
            'getAppliedDescriptivePreprocessing',
            'setFilters',
            'setFilterLogic',
            'toggleFilterConfigModal'
        ], {
            selectedVariables: signal([]),
            selectedCovariates: signal([]),
            selectedFilters: signal([]),
            selectedDatasets: signal(['dataset-a']),
            selectedDataModel: signal({ code: 'Stroke', version: '3.7' }),
            filterLogic: signal(null),
            appliedPreprocessingConfig: signal(null)
        });
        mockChartBuilder = jasmine.createSpyObj('ChartBuilderService', ['getChartsForAlgorithm']);
        mockChartBuilder.getChartsForAlgorithm.and.returnValue([]);
        mockExpService.loadDescriptiveOverview.and.returnValue(of({ result: { featurewise: [] } }));
        mockExpService.getAppliedDescriptivePreprocessing.and.returnValue(null);
        mockPdfService = jasmine.createSpyObj('PdfExportService', ['exportDescriptiveStatisticsPdf']);

        await TestBed.configureTestingModule({
            imports: [StatisticAnalysisPanelComponent], // Standalone component
            providers: [
                provideZonelessChangeDetection(),
                provideEchartsCore({
                    echarts: () => import('echarts'),
                }),
                { provide: ExperimentStudioService, useValue: mockExpService },
                { provide: ChartBuilderService, useValue: mockChartBuilder },
                { provide: PdfExportService, useValue: mockPdfService }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(StatisticAnalysisPanelComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    function configureRawSummary(chartOptions: any[] = []) {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        mockChartBuilder.getChartsForAlgorithm.and.returnValue(chartOptions);
        mockExpService.loadDescriptiveOverview.and.returnValue(of({
            result: {
                featurewise: [
                    { dataset: 'all datasets', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 71 } },
                    { dataset: 'dataset-a', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 71 } },
                    { dataset: 'all datasets', variable: 'sex', data: { counts: { female: 6, male: 4 }, num_dtps: 10, num_na: 1, num_total: 11 } },
                ],
            },
        }));
        (mockExpService.selectedVariables as any).set([age, sex]);
        fixture.detectChanges();
        return { age, sex };
    }

    function workflowSection(title: string): HTMLElement {
        return (Array.from(fixture.nativeElement.querySelectorAll('.workflow-section')) as HTMLElement[])
            .find((section) => section.textContent?.includes(title)) as HTMLElement;
    }

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('does not fetch descriptive stats until a model and dataset are ready', () => {
        (mockExpService.selectedDataModel as any).set(null);
        (mockExpService.selectedDatasets as any).set([]);
        (mockExpService.selectedVariables as any).set([{ code: 'age', label: 'Age', type: 'real' }]);

        fixture.detectChanges();

        expect(mockExpService.loadDescriptiveOverview).not.toHaveBeenCalled();
        expect(component.isLoading).toBeFalse();
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
        expect(text).toContain('Preprocessing');
        expect(text).toContain('Filtering');
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
        expect(fixture.nativeElement.textContent).toContain('Required for longitudinal pathologies');
        expect(fixture.nativeElement.textContent).toContain('Longitudinal Transformation');
        expect(fixture.nativeElement.textContent).toContain('Longitudinal strategy');
        expect(fixture.nativeElement.textContent).toContain('Diff (Visit 2 - Visit 1)');
        expect(fixture.nativeElement.textContent).not.toContain('Enable longitudinal transformation');

        (mockExpService.selectedDataModel as any).set({ code: 'dm', label: 'Data Model', longitudinal: false });
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).not.toContain('Longitudinal Transformation');
        expect(fixture.nativeElement.textContent).not.toContain('Longitudinal strategy');
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

        const preprocessingSection = fixture.nativeElement.querySelector('.preprocessing-section') as HTMLElement;
        expect(preprocessingSection.querySelector('.empty-state-block')).toBeTruthy();
        expect(preprocessingSection.textContent).toContain('No variables match the current search.');
        expect(preprocessingSection.querySelector('.longitudinal-table')).toBeFalsy();
    });

    it('renders missing values as a selected-variable workspace', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age, sex]);
        fixture.detectChanges();

        const preprocessingSection = fixture.nativeElement.querySelector('.preprocessing-section') as HTMLElement;
        const missingStep = (Array.from(preprocessingSection.querySelectorAll('.preprocessing-step-card')) as HTMLElement[])
            .find((step) => step.textContent?.includes('Missing Values')) as HTMLElement;

        expect(missingStep.querySelector('.preprocessing-browser')).toBeTruthy();
        expect(missingStep.querySelector('.preprocessing-detail-panel')).toBeTruthy();
        expect(missingStep.querySelector('.preprocessing-table')).toBeFalsy();
        expect(missingStep.querySelector('.preprocessing-detail-panel h4')?.textContent).toContain('Age');
        expect(missingStep.textContent).toContain('Missing value handling');
    });

    it('updates preprocessing detail controls when a variable is selected', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age, sex]);
        fixture.detectChanges();

        const preprocessingSection = fixture.nativeElement.querySelector('.preprocessing-section') as HTMLElement;
        const sexButton = (Array.from(preprocessingSection.querySelectorAll('.preprocessing-variable-btn')) as HTMLButtonElement[])
            .find((button) => button.textContent?.includes('Sex'));
        sexButton?.click();
        fixture.detectChanges();

        expect(component.selectedPreprocessingVariable()?.code).toBe('sex');
        expect(preprocessingSection.querySelector('.preprocessing-detail-panel h4')?.textContent).toContain('Sex');
    });

    it('uses independent selected variables for missing values and longitudinal transformation', () => {
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
        fixture.detectChanges();

        component.selectPreprocessingVariable(sex);
        component.selectLongitudinalPreprocessingVariable(age);
        fixture.detectChanges();

        expect(component.selectedPreprocessingVariable()?.code).toBe('sex');
        expect(component.selectedLongitudinalPreprocessingVariable()?.code).toBe('age');
    });

    it('counts pending preprocessing by step instead of by variable rule', () => {
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
        fixture.detectChanges();

        expect(component.pendingChangeCount).toBe(2);
        expect(component.preprocessingStatusLabel).toBe('2 pending steps');
        expect(fixture.nativeElement.textContent).toContain('2 pending steps');
    });

    it('shows category choices for categorical constant preprocessing values', () => {
        const variable = {
            code: 'pad',
            label: 'PAD',
            type: 'nominal',
            enumerations: [
                { code: '0', label: 'No' },
                { code: '1', label: 'Yes' },
            ],
        };
        (mockExpService.selectedVariables as any).set([variable]);
        component.onMissingActionChange(variable, 'constant');
        fixture.detectChanges();

        const preprocessingSection = fixture.nativeElement.querySelector('.preprocessing-section') as HTMLElement;
        const options = Array.from(preprocessingSection.querySelectorAll('.preprocessing-detail-panel option')) as HTMLOptionElement[];

        expect(options.map((option) => option.textContent?.trim())).toContain('No');
        expect(options.map((option) => option.textContent?.trim())).toContain('Yes');
    });

    it('splits preprocessing rows by pending and applied state', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age, sex]);
        component.appliedPreprocessingRules = {
            age: { variableCode: 'age', action: 'drop', value: '', enabled: true },
        };
        component.pendingPreprocessingRules = {
            age: { variableCode: 'age', action: 'drop', value: '', enabled: true },
        };

        const pendingGroup = component.preprocessingGroups.find((group) => group.key === 'pending');
        const appliedGroup = component.preprocessingGroups.find((group) => group.key === 'applied');

        expect(pendingGroup?.variables.map((v) => v.code)).toEqual(['sex']);
        expect(appliedGroup?.variables.map((v) => v.code)).toEqual(['age']);
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
        const pendingGroup = component.preprocessingGroups.find((group) => group.key === 'pending');
        expect(appliedGroup?.variables.map((v) => v.code)).toEqual(['age']);
        expect(pendingGroup?.variables.map((v) => v.code)).toEqual(['sex']);
    });

    it('marks variables added after applied preprocessing as pending', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        const preprocessing = {
            missing_values_handler: {
                strategies: {
                    age: 'drop',
                },
            },
        };
        (mockExpService.appliedPreprocessingConfig as any).set(preprocessing);
        mockExpService.getAppliedDescriptivePreprocessing.and.returnValue(preprocessing);
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        expect(component.preprocessingVariableStateLabel(age)).toBe('Applied');
        expect(component.pendingChangeCount).toBe(0);

        (mockExpService.selectedVariables as any).set([age, sex]);
        fixture.detectChanges();

        const pendingGroup = component.preprocessingGroups.find((group) => group.key === 'pending');
        expect(component.preprocessingVariableStateLabel(sex)).toBe('Pending');
        expect(component.preprocessingVariableHasPendingChange(sex)).toBeTrue();
        expect(component.pendingChangeCount).toBe(1);
        expect(pendingGroup?.variables.map((v) => v.code)).toEqual(['sex']);
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

    it('selects the first processed statistic after preprocessing is applied', () => {
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
        expect(component.selectedStatisticBlock('processed')?.name).toBe('Age');
    });

    it('opens and scrolls to the processed summary while preprocessing is loading', (done) => {
        const { age } = configureRawSummary();
        const response$ = new Subject<unknown>();
        const scrollSpy = spyOn(window, 'scrollTo');
        spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback): number => {
            void Promise.resolve().then(() => callback(0));
            return 0;
        });
        mockExpService.loadDescriptiveOverview.and.returnValue(response$.asObservable());

        component.onMissingActionChange(age, 'mean');
        component.applyPreprocessing();
        fixture.detectChanges();

        const processedSection = workflowSection('Processed Data Summary');
        const processedHeader = processedSection.querySelector('.workflow-section-header') as HTMLElement;
        const processedBody = processedSection.querySelector('.workflow-section-body.open') as HTMLElement;
        expect(component.sectionOpen.processed).toBeTrue();
        expect(component.processedSummary.isLoading).toBeTrue();
        expect(processedHeader.textContent).toContain('Processed Data Summary');
        expect(processedBody).toBeTruthy();

        setTimeout(() => {
            const scrollOptions = scrollSpy.calls.mostRecent().args[0] as ScrollToOptions;
            expect(scrollOptions.behavior).toBe('smooth');
            expect(scrollOptions.top).toBe(Math.max(processedHeader.getBoundingClientRect().top + window.scrollY - getExperimentStudioScrollOffset(), 0));

            response$.next({
                result: {
                    featurewise: [
                        {
                            dataset: 'all datasets',
                            variable: 'age',
                            data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 71 },
                        },
                    ],
                },
            });
            response$.complete();
            fixture.detectChanges();

            expect(component.sectionOpen.processed).toBeTrue();
            expect(component.processedSummary.isLoading).toBeFalse();
            expect(component.selectedStatisticBlock('processed')?.name).toBe('Age');

            (mockExpService.appliedPreprocessingConfig as any).set({
                missing_values_handler: {
                    strategies: { age: 'mean' },
                },
            });
            fixture.detectChanges();
            expect(component.sectionOpen.processed).toBeTrue();
            expect(component.selectedStatisticBlock('processed')?.name).toBe('Age');
            done();
        });
    });

    it('uses the same header-aware offset for every workflow subsection', (done) => {
        configureRawSummary();
        const scrollSpy = spyOn(window, 'scrollTo');
        spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback): number => {
            void Promise.resolve().then(() => callback(0));
            return 0;
        });

        component.goToSection('filters');
        fixture.detectChanges();

        setTimeout(() => {
            const filtersHeader = workflowSection('Filtering').querySelector('.workflow-section-header') as HTMLElement;
            const scrollOptions = scrollSpy.calls.mostRecent().args[0] as ScrollToOptions;
            expect(scrollOptions.behavior).toBe('smooth');
            expect(scrollOptions.top).toBe(Math.max(filtersHeader.getBoundingClientRect().top + window.scrollY - getExperimentStudioScrollOffset(), 0));
            done();
        });
    });

    it('keeps the processed summary open and stops the spinner when preprocessing fails', () => {
        const { age } = configureRawSummary();
        const response$ = new Subject<unknown>();
        spyOn(console, 'error');
        mockExpService.loadDescriptiveOverview.and.returnValue(response$.asObservable());

        component.onMissingActionChange(age, 'mean');
        component.applyPreprocessing();
        fixture.detectChanges();

        expect(component.sectionOpen.processed).toBeTrue();
        expect(component.processedSummary.isLoading).toBeTrue();

        response$.error(new Error('preprocessing failed'));
        fixture.detectChanges();

        const processedSection = workflowSection('Processed Data Summary');
        expect(component.sectionOpen.processed).toBeTrue();
        expect(component.processedSummary.isLoading).toBeFalse();
        expect(processedSection.textContent).not.toContain('Processed data summary loading');
    });

    it('renders raw statistics as a grouped analysis workspace', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age, sex]);

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
                    {
                        dataset: 'all datasets',
                        variable: 'sex',
                        data: {
                            counts: { female: 6, male: 4 },
                            num_dtps: 10,
                            num_na: 1,
                            num_total: 11,
                        },
                    },
                ],
            },
        }));
        fixture.detectChanges();

        const workspace = fixture.nativeElement.querySelector('.statistics-workspace') as HTMLElement;
        const text = workspace.textContent ?? '';

        expect(workspace).toBeTruthy();
        expect(text).toContain('Numerical');
        expect(text).toContain('Categorical');
        expect(text).toContain('Age');
        expect(text).toContain('Sex');
        expect(text).toContain('Export');
        expect(text).toContain('CSV');
        const variableButtons = Array.from(workspace.querySelectorAll('.statistics-variable-btn')) as HTMLButtonElement[];
        const ageButtonText = variableButtons.find((button) => button.textContent?.includes('Age'))?.textContent ?? '';
        expect(ageButtonText).toContain('10 datapoints');
        expect(ageButtonText).toContain('0 missing');
        expect(ageButtonText).not.toContain('Numerical');
    });

    it('marks only numeric summary tables for the compact no-scroll layout', () => {
        const { age } = configureRawSummary();

        const rawSection = workflowSection('Raw Data Summary');
        const rawWrapper = rawSection.querySelector('.statistics-table-wrapper') as HTMLElement;
        expect(rawWrapper.classList.contains('statistics-table-wrapper--numeric')).toBeTrue();

        component.onMissingActionChange(age, 'mean');
        component.applyPreprocessing();
        fixture.detectChanges();

        const processedWrapper = workflowSection('Processed Data Summary').querySelector('.statistics-table-wrapper') as HTMLElement;
        expect(processedWrapper.classList.contains('statistics-table-wrapper--numeric')).toBeTrue();

        const sexButton = (Array.from(workflowSection('Raw Data Summary').querySelectorAll('.statistics-variable-btn')) as HTMLButtonElement[])
            .find((button) => button.textContent?.includes('Sex'));
        sexButton?.click();
        fixture.detectChanges();

        const nominalWrapper = workflowSection('Raw Data Summary').querySelector('.statistics-table-wrapper') as HTMLElement;
        expect(nominalWrapper.classList.contains('statistics-table-wrapper--numeric')).toBeFalse();
    });

    it('filters raw statistics browser by variable label or code', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age, sex]);
        mockExpService.loadDescriptiveOverview.and.returnValue(of({
            result: {
                featurewise: [
                    { dataset: 'all datasets', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 71 } },
                    { dataset: 'all datasets', variable: 'sex', data: { counts: { female: 6 }, num_dtps: 6, num_na: 0, num_total: 6 } },
                ],
            },
        }));
        fixture.detectChanges();

        const search = fixture.nativeElement.querySelector('input[aria-label="Search raw summary variables"]') as HTMLInputElement;
        search.value = 'sex';
        search.dispatchEvent(new Event('input'));
        fixture.detectChanges();

        expect(component.filteredStatisticBlocks('raw').map((block) => block.name)).toEqual(['Sex']);
        expect(component.selectedStatisticBlock('raw')?.name).toBe('Sex');
        const text = fixture.nativeElement.querySelector('.statistics-workspace')?.textContent ?? '';
        expect(text).toContain('Sex');
        expect(text).not.toContain('Age');
    });

    it('updates the statistics detail panel when a variable is selected', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age, sex]);
        mockExpService.loadDescriptiveOverview.and.returnValue(of({
            result: {
                featurewise: [
                    { dataset: 'all datasets', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 71 } },
                    { dataset: 'all datasets', variable: 'sex', data: { counts: { female: 6 }, num_dtps: 6, num_na: 0, num_total: 6 } },
                ],
            },
        }));
        fixture.detectChanges();

        const buttons = Array.from(fixture.nativeElement.querySelectorAll('.statistics-variable-btn')) as HTMLButtonElement[];
        const sexButton = buttons.find((button) => button.textContent?.includes('Sex'));
        sexButton?.click();
        fixture.detectChanges();

        expect(component.selectedStatisticBlock('raw')?.name).toBe('Sex');
        expect(fixture.nativeElement.querySelector('.statistics-panel h4')?.textContent).toContain('Sex');
    });

    it('keeps the raw variable browser visible when the right panel switches to charts', () => {
        configureRawSummary([{ title: { text: 'Age chart' }, series: [] }]);

        component.setSummaryTab('raw', 'Charts');
        fixture.detectChanges();

        const rawSection = workflowSection('Raw Data Summary');
        expect(rawSection.querySelectorAll('.statistics-browser').length).toBe(1);
        expect(rawSection.querySelector('.chart-browser')).toBeNull();
        expect(rawSection.querySelector('.statistics-browser')?.textContent).toContain('Age');
        expect(rawSection.querySelector('.statistics-panel h4')?.textContent).toContain('Age');
        expect(rawSection.querySelector('app-chart-renderer')).toBeTruthy();
    });

    it('preserves the selected raw variable across Statistics and Charts tabs', () => {
        configureRawSummary();

        const buttons = Array.from(fixture.nativeElement.querySelectorAll('.statistics-variable-btn')) as HTMLButtonElement[];
        buttons.find((button) => button.textContent?.includes('Sex'))?.click();
        fixture.detectChanges();

        component.setSummaryTab('raw', 'Charts');
        fixture.detectChanges();
        expect(component.selectedStatisticBlock('raw')?.name).toBe('Sex');
        expect(workflowSection('Raw Data Summary').querySelector('.statistics-panel h4')?.textContent).toContain('Sex');

        component.setSummaryTab('raw', 'Statistics');
        fixture.detectChanges();
        expect(component.selectedStatisticBlock('raw')?.name).toBe('Sex');
        expect(workflowSection('Raw Data Summary').querySelector('.statistics-panel h4')?.textContent).toContain('Sex');
    });

    it('shows a chart empty state for a selected variable without chart options', () => {
        configureRawSummary([]);

        component.setSummaryTab('raw', 'Charts');
        fixture.detectChanges();

        const rawSection = workflowSection('Raw Data Summary');
        expect(component.selectedStatisticBlock('raw')?.name).toBe('Age');
        expect(rawSection.textContent).toContain('No chart available for Age.');
        expect(rawSection.querySelector('.statistics-browser')).toBeTruthy();
    });

    it('uses the same selected-variable workspace for processed summaries', () => {
        const { age } = configureRawSummary([{ title: { text: 'Age chart' }, series: [] }]);

        component.onMissingActionChange(age, 'mean');
        component.applyPreprocessing();
        component.setSummaryTab('processed', 'Charts');
        fixture.detectChanges();

        const processedSection = workflowSection('Processed Data Summary');
        expect(processedSection.querySelector('.statistics-browser')).toBeTruthy();
        expect(processedSection.querySelector('.chart-browser')).toBeNull();
        expect(component.selectedStatisticBlock('processed')?.name).toBe('Age');
        expect(processedSection.querySelector('.statistics-panel h4')?.textContent).toContain('Age');
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
            missing_values_handler: {
                strategies: {
                    age: 'drop',
                    sex: 'drop',
                },
            },
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
            missing_values_handler: {
                strategies: {
                    age: 'drop',
                    sex: 'drop',
                },
            },
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

    it('resets missing value and longitudinal pending state together', () => {
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
        component.appliedPreprocessingRules = {
            age: { variableCode: 'age', action: 'mean', value: '', enabled: true },
            sex: { variableCode: 'sex', action: 'drop', value: '', enabled: true },
        };
        component.appliedLongitudinalEnabled = true;
        component.appliedLongitudinalVisit1 = 'BL';
        component.appliedLongitudinalVisit2 = 'FL1';
        component.appliedLongitudinalStrategies = { age: 'diff', sex: 'first' };
        component.onMissingActionChange(age, 'median');
        component.onLongitudinalStrategyChange(sex, 'second');

        component.resetChanges();

        expect(component.ruleFor(age).action).toBe('mean');
        expect(component.longitudinalStrategyFor(sex)).toBe('first');
        expect(component.pendingChangeCount).toBe(0);
    });

    it('hydrates saved preprocessing as applied without pending changes', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        const preprocessing = {
            missing_values_handler: {
                strategies: {
                    age: 'median',
                    sex: 'drop',
                },
            },
        };
        (mockExpService.appliedPreprocessingConfig as any).set(preprocessing);
        mockExpService.getAppliedDescriptivePreprocessing.and.returnValue(preprocessing);
        (mockExpService.selectedVariables as any).set([age, sex]);

        fixture.detectChanges();

        expect(component.ruleFor(age).action).toBe('median');
        expect(component.ruleFor(sex).action).toBe('drop');
        expect(component.preprocessingStatus).toBe('applied');
        expect(component.pendingChangeCount).toBe(0);
    });

    it('loads the processed summary when saved preprocessing is hydrated', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const preprocessing = {
            missing_values_handler: {
                strategies: {
                    age: 'median',
                },
            },
        };
        (mockExpService.appliedPreprocessingConfig as any).set(preprocessing);
        mockExpService.getAppliedDescriptivePreprocessing.and.returnValue(preprocessing);
        mockExpService.loadDescriptiveOverview.and.returnValues(
            of({ result: { featurewise: [] } }),
            of({
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
            })
        );

        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        expect(mockExpService.loadDescriptiveOverview).toHaveBeenCalledWith(['age'], preprocessing);
        expect(component.processedSummary.data.length).toBe(1);
        expect(component.processedSummary.data[0].name).toBe('Age');
    });
});
