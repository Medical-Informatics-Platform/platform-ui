import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ErrorService } from '../../../services/error.service';
import { ResultsPdfExportService } from '../../../services/export-results-pdf.service';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import { SessionStorageService } from '../../../services/session-storage.service';
import { AlgorithmConfig } from '../../../models/algorithm-definition.model';
import { AlgorithmPanelComponent } from './algorithm-panel.component';
import { of } from 'rxjs';

describe('AlgorithmPanelComponent', () => {
  let fixture: ComponentFixture<AlgorithmPanelComponent>;
  let experimentStudioService: {
    selectedAlgorithm: ReturnType<typeof signal<AlgorithmConfig | null>>;
    selectedVariables: ReturnType<typeof signal<any[]>>;
    selectedCovariates: ReturnType<typeof signal<any[]>>;
    selectedFilters: ReturnType<typeof signal<any[]>>;
    selectedDatasets: ReturnType<typeof signal<string[]>>;
    selectedDataModel: ReturnType<typeof signal<any>>;
    algorithmConfigurations: ReturnType<typeof signal<Record<string, any>>>;
    availableGroupedAlgorithms: ReturnType<typeof signal<Record<string, AlgorithmConfig[]>>>;
    backendAlgorithms: ReturnType<typeof signal<Record<string, AlgorithmConfig>>>;
    isRunning: ReturnType<typeof signal<boolean>>;
    currentExperimentUUID: ReturnType<typeof signal<string | null>>;
    lastUsedAlgorithm: ReturnType<typeof signal<string>>;
    availableDatasets: ReturnType<typeof signal<any[]>>;
    getCategoricalEnumMaps: jasmine.Spy;
    isCrossValidationOnly: jasmine.Spy;
    getCrossValidationBase: jasmine.Spy;
    getCrossValidationVariant: jasmine.Spy;
    getTransformationBase: jasmine.Spy;
    getTransformationVariant: jasmine.Spy;
    hasAppliedDescriptivePreprocessing: jasmine.Spy;
    isAlgorithmAvailable: jasmine.Spy;
    getAlgorithmAvailability: jasmine.Spy;
    setAlgorithm: jasmine.Spy;
    setRunning: jasmine.Spy;
    runSelectedAlgorithmTransient: jasmine.Spy;
    runSelectedAlgorithm: jasmine.Spy;
    getEffectivePreprocessingSummary: jasmine.Spy;
  };

  const algorithm: AlgorithmConfig = {
    name: 'flat_config_algorithm',
    label: 'Flat Config Algorithm',
    description: 'Algorithm with more than three configuration fields.',
    documentation: 'Line one.\nLine two.',
    category: 'Test',
    requiredVariable: [],
    covariate: [],
    configSchema: [
      { key: 'first', label: 'First', type: 'number', default: 1 },
      { key: 'second', label: 'Second', type: 'number', default: 2 },
      { key: 'third', label: 'Third', type: 'number', default: 3 },
      { key: 'fourth', label: 'Fourth', type: 'number', default: 4 },
    ],
    isDisabled: false,
  };

  beforeEach(async () => {
    experimentStudioService = {
      selectedAlgorithm: signal<AlgorithmConfig | null>(algorithm),
      selectedVariables: signal<any[]>([{ code: 'y', label: 'Y variable' }]),
      selectedCovariates: signal<any[]>([]),
      selectedFilters: signal<any[]>([]),
      selectedDatasets: signal<string[]>([]),
      selectedDataModel: signal<any>(null),
      algorithmConfigurations: signal<Record<string, any>>({}),
      availableGroupedAlgorithms: signal<Record<string, AlgorithmConfig[]>>({ Test: [algorithm] }),
      backendAlgorithms: signal<Record<string, AlgorithmConfig>>({ flat_config_algorithm: algorithm }),
      isRunning: signal(false),
      currentExperimentUUID: signal<string | null>(null),
      lastUsedAlgorithm: signal(''),
      availableDatasets: signal<any[]>([]),
      getCategoricalEnumMaps: jasmine.createSpy('getCategoricalEnumMaps').and.returnValue({}),
      isCrossValidationOnly: jasmine.createSpy('isCrossValidationOnly').and.returnValue(false),
      getCrossValidationBase: jasmine.createSpy('getCrossValidationBase').and.returnValue(null),
      getCrossValidationVariant: jasmine.createSpy('getCrossValidationVariant').and.returnValue(null),
      getTransformationBase: jasmine.createSpy('getTransformationBase').and.returnValue(null),
      getTransformationVariant: jasmine.createSpy('getTransformationVariant').and.returnValue(null),
      hasAppliedDescriptivePreprocessing: jasmine.createSpy('hasAppliedDescriptivePreprocessing').and.returnValue(true),
      isAlgorithmAvailable: jasmine.createSpy('isAlgorithmAvailable').and.returnValue(true),
      getAlgorithmAvailability: jasmine.createSpy('getAlgorithmAvailability').and.returnValue({
        available: true,
        summary: '',
        details: [],
      }),
      setAlgorithm: jasmine.createSpy('setAlgorithm').and.callFake((next: AlgorithmConfig) => {
        experimentStudioService.selectedAlgorithm.set(next);
      }),
      setRunning: jasmine.createSpy('setRunning'),
      runSelectedAlgorithmTransient: jasmine.createSpy('runSelectedAlgorithmTransient'),
      runSelectedAlgorithm: jasmine.createSpy('runSelectedAlgorithm'),
      getEffectivePreprocessingSummary: jasmine.createSpy('getEffectivePreprocessingSummary').and.returnValue(null),
    };

    await TestBed.configureTestingModule({
      imports: [AlgorithmPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ExperimentStudioService, useValue: experimentStudioService },
        { provide: ErrorService, useValue: { clearError: jasmine.createSpy('clearError') } },
        { provide: AuthService, useValue: { currentUser: null } },
        { provide: ResultsPdfExportService, useValue: { exportExperimentPdf: jasmine.createSpy('exportExperimentPdf') } },
        { provide: RuntimeEnvService, useValue: { mipVersion: 'test' } },
        { provide: SessionStorageService, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AlgorithmPanelComponent);
    fixture.detectChanges();
  });

  it('renders all algorithm configuration fields without an advanced toggle', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const fields = nativeElement.querySelectorAll('.config-field');

    expect(fields.length).toBe(4);
    expect(nativeElement.textContent).toContain('Fourth');
    expect((nativeElement.querySelector('.algorithm-readonly-fieldset') as HTMLFieldSetElement)?.disabled).toBeFalse();
    expect((nativeElement.querySelector('[data-guide="run-experiment"]') as HTMLButtonElement)?.disabled).toBeFalse();
    expect(nativeElement.textContent).not.toContain('Show advanced configuration');
    expect(nativeElement.textContent).not.toContain('Hide advanced configuration');
  });

  it('does not surface covariate requirements when covariates are optional', () => {
    const optionalCovariateAlgorithm = {
      name: 'outlier_report',
      label: 'Outlier Report',
      inputdata: {
        y: { required: true, types: ['real'] },
        x: { required: false, types: ['real'] },
      },
    };

    expect(fixture.componentInstance.getVariableRequirement(optionalCovariateAlgorithm)).toContain('Variable:');
    expect(fixture.componentInstance.getCovariateRequirement(optionalCovariateAlgorithm)).toBeNull();
  });

  it('renders selected algorithm documentation separately from the short description', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const details = nativeElement.querySelector('.documentation-panel') as HTMLDetailsElement;

    expect(nativeElement.querySelector('.config-description')?.textContent).toContain('Algorithm with more than three configuration fields.');
    expect(details?.textContent).toContain('Documentation');
    expect(details?.textContent).toContain('Line one.');
    expect(details?.textContent).toContain('Line two.');
    expect(details?.open).toBeFalse();
    expect(details?.querySelector('.documentation-content')?.textContent).toContain('Line one.');
  });

  it('shows disabled algorithm availability reasons in the list and tooltip', async () => {
    const disabledAlgorithm: AlgorithmConfig = {
      ...algorithm,
      name: 'needs_two_variables',
      label: 'Needs Two Variables',
      isDisabled: true,
      availability: {
        available: false,
        summary: 'Variable needs at least 2, selected 1.',
        details: [
          {
            role: 'y',
            label: 'Variable',
            selectedCount: 1,
            minCount: 2,
            maxCount: 3,
            required: true,
            types: ['real'],
            stattypes: ['nominal'],
            messages: [
              'Variable needs at least 2, selected 1.',
              'Variable type must be one of real.',
            ],
            satisfied: false,
          },
        ],
      },
    };
    experimentStudioService.availableGroupedAlgorithms.set({ Test: [disabledAlgorithm] });

    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.tooltipVisible.set(true);
    component.tooltipData.set(disabledAlgorithm);
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    expect(nativeElement.textContent).toContain('Variable needs at least 2, selected 1.');
    expect(nativeElement.textContent).toContain('Availability');
    expect(nativeElement.textContent).toContain('Variable: 2-3, selected 1');
    expect(nativeElement.textContent).toContain('type: real');
    expect(nativeElement.querySelector('.tooltip')?.textContent).toContain('Variable type must be one of real.');
    expect(nativeElement.textContent).not.toContain('type: nominal');
    expect(nativeElement.textContent).not.toContain('stattypes: nominal');
  });

  it('hides type-only availability reasons on algorithm cards', async () => {
    const disabledAlgorithm: AlgorithmConfig = {
      ...algorithm,
      name: 'type_only_algorithm',
      label: 'Type Only Algorithm',
      isDisabled: true,
      availability: {
        available: false,
        summary: 'Variable type must be one of real.',
        details: [
          {
            role: 'y',
            label: 'Variable',
            selectedCount: 1,
            minCount: 1,
            maxCount: 1,
            required: true,
            types: ['real'],
            stattypes: [],
            messages: ['Variable type must be one of real.'],
            satisfied: false,
          },
        ],
      },
    };
    experimentStudioService.availableGroupedAlgorithms.set({ Test: [disabledAlgorithm] });

    fixture.detectChanges();
    await fixture.whenStable();

    const algorithmItem = fixture.nativeElement.querySelector('li') as HTMLElement;
    expect(algorithmItem.textContent).toContain('Type Only Algorithm');
    expect(algorithmItem.querySelector('.algo-unavailable-reason')).toBeNull();
    expect(algorithmItem.textContent).not.toContain('Variable type must be one of real.');
  });

  it('selects unavailable algorithms as a read-only preview with expandable documentation', async () => {
    const unavailableAlgorithm: AlgorithmConfig = {
      ...algorithm,
      name: 'unavailable_algorithm',
      label: 'Unavailable Algorithm',
      documentation: 'Unavailable docs.\nSecond line.',
      isDisabled: true,
      configSchema: [
        { key: 'alpha', label: 'Alpha', type: 'number', default: 0.05 },
      ],
      availability: {
        available: false,
        summary: 'Variable needs at least 2, selected 1.',
        details: [],
      },
    };
    experimentStudioService.availableGroupedAlgorithms.set({ Test: [unavailableAlgorithm] });
    experimentStudioService.backendAlgorithms.set({ unavailable_algorithm: unavailableAlgorithm });
    experimentStudioService.isAlgorithmAvailable.and.callFake((name: string) => name !== 'unavailable_algorithm');
    experimentStudioService.getAlgorithmAvailability.and.callFake((name: string) => name === 'unavailable_algorithm'
      ? unavailableAlgorithm.availability
      : { available: true, summary: '', details: [] });

    fixture.componentInstance.openCategories.set(['Test']);
    fixture.detectChanges();
    await fixture.whenStable();

    const unavailableListItem = (fixture.nativeElement as HTMLElement).querySelector('li.disabled-algo') as HTMLElement;
    expect(getComputedStyle(unavailableListItem).cursor).toBe('pointer');

    fixture.componentInstance.onAlgorithmClick(unavailableAlgorithm);
    fixture.detectChanges();
    await fixture.whenStable();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const details = nativeElement.querySelector('.documentation-panel') as HTMLDetailsElement;
    const fieldset = nativeElement.querySelector('.algorithm-readonly-fieldset') as HTMLFieldSetElement;
    const previewWarning = nativeElement.querySelector('.algorithm-preview-warning') as HTMLElement;
    const input = fieldset.querySelector('input.config-input') as HTMLInputElement;
    const runButton = nativeElement.querySelector('[data-guide="run-experiment"]') as HTMLButtonElement;

    expect(experimentStudioService.selectedAlgorithm()?.name).toBe('unavailable_algorithm');
    expect(details?.textContent).toContain('Unavailable docs.');
    expect(previewWarning?.textContent).toContain('Preview only');
    expect(previewWarning?.textContent).toContain('Variable needs at least 2, selected 1.');
    expect(details?.open).toBeFalse();
    details.open = true;
    expect(details.open).toBeTrue();
    expect(fieldset?.disabled).toBeTrue();
    expect(getComputedStyle(fieldset).pointerEvents).toBe('none');
    expect(input?.matches(':disabled')).toBeTrue();
    expect(runButton?.disabled).toBeTrue();

    fixture.componentInstance.onClickRunExp();
    expect(experimentStudioService.runSelectedAlgorithm).not.toHaveBeenCalled();
    expect(experimentStudioService.runSelectedAlgorithmTransient).not.toHaveBeenCalled();
  });

  it('keeps fields after the old advanced cutoff in the persisted form config', async () => {
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.configForm().get('fourth')?.setValue('42');

    expect(experimentStudioService.algorithmConfigurations()['flat_config_algorithm']['fourth']).toBe(42);
  });

  it('serializes outlier_report rules into dictionary parameters', async () => {
    const outlierAlgorithm: AlgorithmConfig = {
      name: 'outlier_report',
      label: 'Outlier Report',
      description: '',
      category: 'Descriptive Statistics',
      requiredVariable: ['real'],
      covariate: ['real'],
      configSchema: [
        { key: 'strategies', label: 'Strategies', type: 'dict' },
        { key: 'tails', label: 'Tails', type: 'dict' },
        { key: 'folds', label: 'Folds', type: 'dict' },
      ],
      isDisabled: false,
    };
    experimentStudioService.selectedAlgorithm.set(outlierAlgorithm);
    experimentStudioService.backendAlgorithms.set({ outlier_report: outlierAlgorithm });
    experimentStudioService.availableGroupedAlgorithms.set({ 'Descriptive Statistics': [outlierAlgorithm] });
    experimentStudioService.selectedVariables.set([
      { code: 'age', label: 'Age', type: 'real' },
      { code: 'sex', label: 'Sex', type: 'nominal' },
    ]);
    experimentStudioService.selectedCovariates.set([{ code: 'bmi', label: 'BMI', type: 'real' }]);
    experimentStudioService.hasAppliedDescriptivePreprocessing.and.returnValue(false);
    experimentStudioService.runSelectedAlgorithmTransient.and.returnValue(of({
      status: 'success',
      result: { featurewise: [] },
    }));

    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.onOutlierReportEnabledChange({ code: 'bmi', label: 'BMI', type: 'real' }, false);
    component.onOutlierReportStrategyChange({ code: 'age', label: 'Age', type: 'real' }, 'quantile');
    component.onOutlierReportFoldChange({ code: 'age', label: 'Age', type: 'real' }, 0.05);
    component.onClickRunExp();

    expect(experimentStudioService.algorithmConfigurations()['outlier_report']).toEqual({
      strategies: { age: 'quantile' },
      tails: { age: 'both' },
      folds: { age: 0.05 },
    });
    expect(experimentStudioService.runSelectedAlgorithmTransient).toHaveBeenCalledWith('outlier_report', 'outlier_report');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Age');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('BMI');
  });

  it('blocks invalid outlier_report folds', async () => {
    const outlierAlgorithm: AlgorithmConfig = {
      name: 'outlier_report',
      label: 'Outlier Report',
      description: '',
      category: 'Descriptive Statistics',
      requiredVariable: ['real'],
      covariate: ['real'],
      configSchema: [
        { key: 'strategies', label: 'Strategies', type: 'dict' },
        { key: 'tails', label: 'Tails', type: 'dict' },
        { key: 'folds', label: 'Folds', type: 'dict' },
      ],
      isDisabled: false,
    };
    experimentStudioService.selectedAlgorithm.set(outlierAlgorithm);
    experimentStudioService.selectedVariables.set([{ code: 'age', label: 'Age', type: 'real' }]);
    experimentStudioService.hasAppliedDescriptivePreprocessing.and.returnValue(false);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.onOutlierReportStrategyChange({ code: 'age', label: 'Age', type: 'real' }, 'quantile');
    component.onOutlierReportFoldChange({ code: 'age', label: 'Age', type: 'real' }, 0.5);
    experimentStudioService.runSelectedAlgorithmTransient.calls.reset();

    component.onClickRunExp();

    expect(experimentStudioService.runSelectedAlgorithmTransient).not.toHaveBeenCalled();
    expect(component.errorMsg()).toBe('Fix the outlier report configuration before running.');
  });
});
