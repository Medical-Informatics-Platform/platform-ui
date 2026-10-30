import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { AlgorithmConfig } from '../../../../models/algorithm-definition.model';
import { StudioVariable } from '../algorithm-panel.models';
import { AlgorithmConfigFormService } from './algorithm-config-form.service';

const algorithm: AlgorithmConfig = {
  name: 'flat_config_algorithm',
  label: 'Flat Config Algorithm',
  description: '',
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

describe('AlgorithmConfigFormService', () => {
  let studio: ReturnType<typeof createStudio>;
  let service: AlgorithmConfigFormService;

  function createStudio() {
    return {
      selectedAlgorithm: signal<AlgorithmConfig | null>(algorithm),
      algorithmY: signal<StudioVariable[]>([]),
      algorithmX: signal<StudioVariable[]>([]),
      algorithmAssignableVariables: signal<StudioVariable[]>([]),
      algorithmConfigurations: signal<Record<string, Record<string, unknown>>>({}),
      backendAlgorithms: signal<Record<string, AlgorithmConfig>>({}),
      isCrossValidationOnly: vi.fn().mockReturnValue(false),
      getCrossValidationBase: vi.fn().mockReturnValue(null),
      getCrossValidationVariant: vi.fn().mockReturnValue(null),
      isCrossValidationAlgorithm: vi.fn().mockReturnValue(false),
    };
  }

  beforeEach(() => {
    studio = createStudio();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: studio },
        AlgorithmConfigFormService,
      ],
    });
    service = TestBed.inject(AlgorithmConfigFormService);
    TestBed.tick();
  });

  it('keeps fields after the old advanced cutoff in the persisted form config', () => {
    service.configForm().get('fourth')?.setValue('42');

    expect(studio.algorithmConfigurations()['flat_config_algorithm']['fourth']).toBe(42);
  });

  it('builds the form from the stored config of the selected method', () => {
    studio.algorithmConfigurations.set({ flat_config_algorithm: { first: 7 } });
    service.resetForNewAlgorithm();
    studio.selectedAlgorithm.set({ ...algorithm });
    TestBed.tick();

    expect(service.configForm().get('first')?.value).toBe(7);
    expect(service.configForm().get('second')?.value).toBe(2);
  });

  it('carries the parameters over to the cross-validation variant and back', () => {
    studio.getCrossValidationVariant.mockImplementation((name: string) => name === 'flat_config_algorithm' ? 'flat_config_algorithm_cv' : null);
    studio.backendAlgorithms.set({ flat_config_algorithm: algorithm });
    studio.algorithmConfigurations.set({ flat_config_algorithm_cv: { first: 1, n_splits: 5 } });
    TestBed.tick();

    service.setCrossValidation(true);
    expect(service.crossValidationEnabled()).toBe(true);
    expect(studio.algorithmConfigurations()['flat_config_algorithm_cv']).toEqual(
      expect.objectContaining({ first: 1, fourth: 4, n_splits: 5 }));

    service.setCrossValidation(false);
    expect(service.crossValidationEnabled()).toBe(false);
    expect(studio.algorithmConfigurations()['flat_config_algorithm_cv']).not.toHaveProperty('n_splits');
  });

  it('reads an outlier_report variable without a rule as an enabled default', () => {
    const rule = service.outlierReportRuleFor({ code: 'age', label: 'Age', type: 'real' });

    expect(rule.enabled).toBe(true);
    expect(service.outlierReportRuleError({ code: 'age' })).toBe('');
  });

  it('clears the form when nothing is selected', () => {
    studio.selectedAlgorithm.set(null);
    TestBed.tick();

    expect(Object.keys(service.configForm().controls)).toEqual([]);
    expect(service.invalid()).toBe(false);
  });
});
