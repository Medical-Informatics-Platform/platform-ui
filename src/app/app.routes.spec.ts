import { AuthGuard } from './guards/auth.guard';
import { TermsGuard } from './guards/terms.guard';
import { appRoutes } from './app.routes';

describe('appRoutes', () => {
  it('lets authenticated users open the dashboard without a studio-guide gate', () => {
    const dashboard = appRoutes.find((route) => route.path === 'analyses-dashboard');

    expect(dashboard?.canActivate).toEqual([AuthGuard, TermsGuard]);
    expect(dashboard?.redirectTo).toBeUndefined();
  });

  it('keeps the previous dashboard and studio paths as redirects', () => {
    expect(appRoutes.find((route) => route.path === 'experiments-dashboard')?.redirectTo).toBe('analyses-dashboard');
    expect(appRoutes.find((route) => route.path === 'experiment-studio')?.redirectTo).toBe('analysis-studio');
  });
});
