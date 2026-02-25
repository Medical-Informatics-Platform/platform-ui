import { CanMatchFn, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { TermsGuard } from './guards/terms.guard';

const parseBool = (value: unknown, defaultValue: boolean): boolean => {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return defaultValue;
};

const notebookEnabledMatch: CanMatchFn = () => {
  const runtimeEnv = (window as any).__env || {};
  return parseBool(runtimeEnv.NOTEBOOK_ENABLED, false);
};

export const appRoutes: Routes = [
  {
    path: 'experiments-dashboard',
    loadComponent: () => import('./pages/experiments-dashboard/experiments-dashboard.component').then(m => m.ExperimentsDashboardComponent),
    canActivate: [AuthGuard, TermsGuard],
  },
  {
    path: '',
    redirectTo: 'experiments-dashboard',
    pathMatch: 'full'
  },
  {
    path: 'home',
    redirectTo: 'experiments-dashboard',
    pathMatch: 'full'
  },
  {
    path: 'terms',
    loadComponent: () => import('./pages/terms-page/terms-page.component').then(m => m.TermsPageComponent),
    canActivate: [AuthGuard],
  },
  {
    path: 'account',
    loadComponent: () => import('./pages/account-page/account-page.component').then(m => m.AccountPageComponent),
    canActivate: [AuthGuard, TermsGuard],
  },
  {
    path: 'experiment-studio',
    loadComponent: () => import('./pages/experiment-studio/experiment-studio.component').then(m => m.ExperimentStudioComponent),
    canActivate: [AuthGuard, TermsGuard],
  },
  {
    path: 'notebook',
    loadComponent: () => import('./pages/notebook/notebook.component').then(m => m.NotebookComponent),
    canMatch: [notebookEnabledMatch],
    canActivate: [AuthGuard],
  },
  { path: '**', redirectTo: 'experiments-dashboard' }
];
