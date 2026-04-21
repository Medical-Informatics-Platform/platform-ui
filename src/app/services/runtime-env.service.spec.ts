import { isDevMode } from '@angular/core';
import { RuntimeEnvService } from './runtime-env.service';

type RuntimeWindow = Window & {
  __env?: {
    MIP_VERSION?: unknown;
    GUIDE_COVARIATE?: unknown;
    GUIDE_VARIABLE?: unknown;
  };
};

describe('RuntimeEnvService', () => {
  let originalEnv: RuntimeWindow['__env'];

  beforeEach(() => {
    originalEnv = (window as RuntimeWindow).__env;
    spyOn(console, 'warn');
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete (window as RuntimeWindow).__env;
      return;
    }

    (window as RuntimeWindow).__env = originalEnv;
  });

  it('builds footer version entries from the MIP version only', () => {
    (window as RuntimeWindow).__env = {
      MIP_VERSION: 'mip-testing',
    };

    const service = new RuntimeEnvService();

    expect(service.mipVersion).toBe('mip-testing');
    expect(service.versionEntries).toEqual([{ label: 'Version', value: 'mip-testing' }]);
  });

  it('uses the expected missing-version behavior for the current Angular mode', () => {
    (window as RuntimeWindow).__env = {
      MIP_VERSION: '',
    };

    const service = new RuntimeEnvService();

    if (isDevMode()) {
      expect(service.mipVersion).toBe('9.0.0');
      expect(service.versionEntries).toEqual([{ label: 'Version', value: '9.0.0' }]);
      expect(console.warn).not.toHaveBeenCalled();
      return;
    }

    expect(service.mipVersion).toBeNull();
    expect(service.versionEntries).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(
      '[RuntimeEnv] Expected MIP version in window.__env.MIP_VERSION, but it was not provided. The UI will hide that version until it is set.'
    );
  });

  it('reads configurable guide targets from the runtime env', () => {
    (window as RuntimeWindow).__env = {
      MIP_VERSION: 'mip-testing',
      GUIDE_COVARIATE: 'biol_sex',
      GUIDE_VARIABLE: 'age_years',
    };

    const service = new RuntimeEnvService();

    expect(service.guideCovariate).toEqual({ value: 'biol_sex', label: 'Biol Sex' });
    expect(service.guideVariable).toEqual({ value: 'age_years', label: 'Age Years' });
  });

  it('falls back to the default guide targets when runtime guide env vars are missing', () => {
    (window as RuntimeWindow).__env = {
      MIP_VERSION: 'mip-testing',
    };

    const service = new RuntimeEnvService();

    expect(service.guideCovariate).toEqual({ value: 'Sex', label: 'Sex' });
    expect(service.guideVariable).toEqual({ value: 'Age', label: 'Age' });
  });
});
