import { TestBed } from '@angular/core/testing';
import { ExperimentStudioGuideStateService } from './experiment-studio-guide-state.service';

type RuntimeWindow = Window & {
  __env?: {
    GUIDE_COVARIATE?: unknown;
    GUIDE_VARIABLE?: unknown;
  };
};

describe('ExperimentStudioGuideStateService', () => {
  let service: ExperimentStudioGuideStateService;
  let originalEnv: RuntimeWindow['__env'];

  beforeEach(() => {
    originalEnv = (window as RuntimeWindow).__env;
    TestBed.configureTestingModule({
      providers: [ExperimentStudioGuideStateService],
    });
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete (window as RuntimeWindow).__env;
      return;
    }

    (window as RuntimeWindow).__env = originalEnv;
  });

  it('matches the intended sex tutorial variable by exact tutorial aliases', () => {
    service = TestBed.inject(ExperimentStudioGuideStateService);

    expect(service.matchesTutorialCovariate({ code: 'sex', label: 'Sex' }, 'sex')).toBeTrue();
    expect(service.matchesTutorialCovariate({ code: 'biol_sex', label: 'Biological Sex' }, 'sex')).toBeTrue();
  });

  it('does not match unrelated variables that only contain the target as a substring', () => {
    service = TestBed.inject(ExperimentStudioGuideStateService);

    expect(service.matchesTutorialCovariate({ code: 'timemetrics', label: 'Timemetrics' }, 'sex')).toBeFalse();
    expect(service.matchesTutorialCovariate({ code: 'sextraction_flag', label: 'Sextraction Flag' }, 'sex')).toBeFalse();
  });

  it('maps the add-age-variable step to the Age tutorial target', () => {
    service = TestBed.inject(ExperimentStudioGuideStateService);
    service.setActiveStep('add-age-variable');

    expect(service.expectedTutorialCovariate()).toBe('Age');
  });

  it('uses the runtime-configured guide covariate and variable targets', () => {
    (window as RuntimeWindow).__env = {
      GUIDE_COVARIATE: 'biol_sex',
      GUIDE_VARIABLE: 'age_years',
    };
    service = TestBed.inject(ExperimentStudioGuideStateService);

    service.setActiveStep('add-sex-covariate');
    expect(service.expectedTutorialCovariate()).toBe('biol_sex');
    expect(service.matchesTutorialCovariate({ code: 'biol_sex', label: 'Biological Sex' })).toBeTrue();

    service.setActiveStep('add-age-variable');
    expect(service.expectedTutorialCovariate()).toBe('age_years');
    expect(service.matchesTutorialCovariate({ code: 'age_years', label: 'Age Years' })).toBeTrue();
  });
});
