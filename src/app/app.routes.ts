import { inject } from '@angular/core';
import { CanMatchFn, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { TermsGuard } from './guards/terms.guard';
import { RuntimeEnvService } from './services/runtime-env.service';

const notebookEnabledMatch: CanMatchFn = () => {
  return inject(RuntimeEnvService).notebookEnabled;
};

export const appRoutes: Routes = [
  {
    path: 'analyses-dashboard',
    loadComponent: () => import('./pages/analyses-dashboard/analyses-dashboard.component').then(m => m.AnalysesDashboardComponent),
    canActivate: [AuthGuard, TermsGuard],
  },
  {
    path: '',
    redirectTo: 'analyses-dashboard',
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
    path: 'account/remote-access',
    loadComponent: () => import('./pages/account-page/remote-access-guide/remote-access-guide.component').then(m => m.RemoteAccessGuideComponent),
    canActivate: [AuthGuard, TermsGuard],
  },
  {
    path: 'analysis-studio',
    loadComponent: () => import('./pages/analysis-studio/analysis-studio.component').then(m => m.AnalysisStudioComponent),
    canActivate: [AuthGuard, TermsGuard],
  },
  {
    path: 'notebook',
    loadComponent: () => import('./pages/notebook/notebook.component').then(m => m.NotebookComponent),
    canMatch: [notebookEnabledMatch],
    canActivate: [AuthGuard, TermsGuard],
  },
  { path: 'experiments-dashboard', redirectTo: 'analyses-dashboard', pathMatch: 'full' },
  { path: 'experiment-studio', redirectTo: 'analysis-studio', pathMatch: 'full' },
  { path: '**', redirectTo: 'analyses-dashboard' }
];
