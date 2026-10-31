import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../../services/auth.service';
import { CsvExportService } from '../../../../services/csv-export.service';
import { ErrorService } from '../../../../services/error.service';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { PdfExportService } from '../../../../services/pdf-export.service';
import { RuntimeEnvService } from '../../../../services/runtime-env.service';
import { AlgorithmConfig } from '../../../../models/algorithm-definition.model';
import { AlgorithmCatalogService } from '../algorithm-selection/algorithm-catalog.service';
import { AlgorithmConfigFormService } from '../algorithm-selection/algorithm-config-form.service';
import { StudioVariable } from '../algorithm-panel.models';
import { AlgorithmRunService } from './algorithm-run.service';

const algorithm: AlgorithmConfig = {
  name: 'flat_config_algorithm',
  label: 'Flat Config Algorithm',
  description: '',
  category: 'Test',
  requiredVariable: [],
  covariate: [],
  configSchema: [{ key: 'first', label: 'First', type: 'number', default: 1 }],
  isDisabled: false,
};

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

describe('AlgorithmRunService', () => {
  let studio: ReturnType<typeof createStudio>;
  let run: AlgorithmRunService;
  let configForm: AlgorithmConfigFormService;

  function createStudio() {
    return {
      selectedAlgorithm: signal<AlgorithmConfig | null>(algorithm),
      algorithmY: signal<StudioVariable[]>([]),
      algorithmX: signal<StudioVariable[]>([]),
      algorithmAssignableVariables: signal<StudioVariable[]>([]),
      unavailableVariables: signal<ReadonlyMap<string, readonly string[]>>(new Map()),
      selectedFilters: signal<StudioVariable[]>([]),
      selectedDatasets: signal<string[]>([]),
      selectedDataModel: signal(null),
      algorithmConfigurations: signal<Record<string, Record<string, unknown>>>({}),
      availableGroupedAlgorithms: signal<Record<string, AlgorithmConfig[]>>({ Test: [algorithm] }),
      backendAlgorithms: signal<Record<string, AlgorithmConfig>>({ flat_config_algorithm: algorithm }),
      isRunning: signal(false),
      lastUsedAlgorithm: signal(''),
      runResult: signal<Record<string, unknown> | null>(null),
      runId: signal<string | null>(null),
      runError: signal<string | null>(null),
      lastRunSchema: signal<unknown[]>([]),
      hasRunStarted: signal(false),
      runStatusText: signal(''),
      variableLabelMap: signal<Record<string, string>>({}),
      filterLogic: signal(null),
      getCategoricalEnumMaps: vi.fn().mockReturnValue({}),
      isCrossValidationOnly: vi.fn().mockReturnValue(false),
      getCrossValidationBase: vi.fn().mockReturnValue(null),
      getCrossValidationVariant: vi.fn().mockReturnValue(null),
      isCrossValidationAlgorithm: vi.fn().mockReturnValue(false),
      hasAppliedDescriptivePreprocessing: vi.fn().mockReturnValue(true),
      hasRequestPreprocessingForRun: vi.fn().mockReturnValue(false),
      isAlgorithmAvailable: vi.fn().mockReturnValue(true),
      getAlgorithmAvailability: vi.fn().mockReturnValue({ available: true, summary: '', details: [] }),
      setRunning: vi.fn(),
      runSelectedAlgorithm: vi.fn(),
      captureRunSetup: vi.fn(),
      getDatasetLabelMap: vi.fn().mockReturnValue({}),
      getEffectivePreprocessingEntries: vi.fn().mockReturnValue([]),
    };
  }

  beforeEach(() => {
    studio = createStudio();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: studio },
        { provide: ErrorService, useValue: { clearError: vi.fn() } },
        { provide: AuthService, useValue: { currentUser: null } },
        { provide: PdfExportService, useValue: { exportExperimentPdf: vi.fn() } },
        { provide: CsvExportService, useValue: { exportExperimentZip: vi.fn() } },
        { provide: RuntimeEnvService, useValue: { mipVersion: 'test' } },
        AlgorithmCatalogService,
        AlgorithmConfigFormService,
        AlgorithmRunService,
      ],
    });
    configForm = TestBed.inject(AlgorithmConfigFormService);
    run = TestBed.inject(AlgorithmRunService);
    TestBed.tick();
  });

  describe('variables missing from a selected dataset', () => {
    const unavailable = new Map<string, readonly string[]>([
      ['age', ['Dataset B']],
      ['sex', ['Dataset B', 'Dataset C']],
    ]);

    it('blocks the run while an outcome, predictor or filter is unavailable', () => {
      studio.unavailableVariables.set(unavailable);
      studio.algorithmY.set([{ code: 'age', label: 'Age' }]);
      studio.algorithmX.set([{ code: 'mmse', label: 'MMSE' }]);
      studio.selectedFilters.set([{ code: 'sex', label: 'Sex' }]);

      expect(run.canRun()).toBe(false);
      expect(run.runDisabledReason()).toBe('Remove variables not available in: Dataset B, Dataset C');
      expect(run.algorithmNeeds()).toContainEqual(expect.objectContaining({
        key: 'unavailable-variables',
        met: false,
        title: 'Remove variables not available in: Dataset B, Dataset C',
      }));

      run.runExperiment();
      expect(studio.runSelectedAlgorithm).not.toHaveBeenCalled();
      expect(studio.setRunning).not.toHaveBeenCalled();
    });

    it('checks predictors on their own', () => {
      studio.unavailableVariables.set(unavailable);
      studio.algorithmX.set([{ code: 'age', label: 'Age' }]);

      expect(run.canRun()).toBe(false);
      expect(run.runDisabledReason()).toBe('Remove variables not available in: Dataset B');
    });

    it('runs again once the unavailable variables are removed', () => {
      studio.unavailableVariables.set(unavailable);
      studio.algorithmY.set([{ code: 'age', label: 'Age' }]);
      expect(run.canRun()).toBe(false);

      studio.algorithmY.set([{ code: 'mmse', label: 'MMSE' }]);
      expect(run.canRun()).toBe(true);
      expect(run.runDisabledReason()).toBe('Execute experiment');
      expect(run.algorithmNeeds().some((need) => need.key === 'unavailable-variables')).toBe(false);
    });

    it('ignores unavailable variables the run does not use', () => {
      studio.unavailableVariables.set(unavailable);
      studio.algorithmAssignableVariables.set([{ code: 'age', label: 'Age' }]);

      expect(run.canRun()).toBe(true);
    });
  });

  it('shows the run error and stops running when the run request fails', () => {
    studio.runSelectedAlgorithm.mockReturnValue(throwError(() => new Error('500')));

    run.runExperiment();

    expect(studio.runError()).toBe('Unable to run experiment. Please try again.');
    expect(studio.runId()).toBeNull();
    expect(studio.setRunning).toHaveBeenCalledWith(true);
    expect(studio.setRunning).toHaveBeenLastCalledWith(false);
  });

  describe('outlier_report', () => {
    const age = { code: 'age', label: 'Age', type: 'real' };
    const bmi = { code: 'bmi', label: 'BMI', type: 'real' };

    beforeEach(() => {
      studio.selectedAlgorithm.set(outlierAlgorithm);
      studio.backendAlgorithms.set({ outlier_report: outlierAlgorithm });
      studio.hasAppliedDescriptivePreprocessing.mockReturnValue(false);
    });

    it('sends the rules as dictionary parameters and keeps the run', () => {
      studio.algorithmAssignableVariables.set([age, { code: 'sex', label: 'Sex', type: 'nominal' }, bmi]);
      studio.runId.set('stale-run');
      studio.runSelectedAlgorithm.mockReturnValue(of({ uuid: 'kept-run', status: 'success', result: { featurewise: [] } }));
      TestBed.tick();

      configForm.onOutlierReportEnabledChange(bmi, false);
      configForm.onOutlierReportStrategyChange(age, 'quantile');
      configForm.onOutlierReportFoldChange(age, 0.05);
      run.runExperiment();

      expect(studio.algorithmConfigurations()['outlier_report']).toEqual({
        strategies: { age: 'quantile' },
        tails: { age: 'both' },
        folds: { age: 0.05 },
      });
      expect(studio.captureRunSetup).toHaveBeenCalledWith('outlier_report');
      expect(studio.runSelectedAlgorithm).toHaveBeenCalledWith('outlier_report', 'outlier_report');
      // The kept run is what Save persists, so it must be the run behind the shown result.
      expect(studio.runId()).toBe('kept-run');
    });

    it('blocks invalid folds', () => {
      studio.algorithmAssignableVariables.set([age]);
      TestBed.tick();

      configForm.onOutlierReportStrategyChange(age, 'quantile');
      configForm.onOutlierReportFoldChange(age, 0.5);
      run.runExperiment();

      expect(studio.runSelectedAlgorithm).not.toHaveBeenCalled();
      expect(run.errorMsg()).toBe('Fix the outlier report configuration before running.');
      expect(studio.setRunning).toHaveBeenLastCalledWith(false);
    });
  });
});
