import { Injectable, signal, WritableSignal, inject } from '@angular/core';
import { Experiment } from '../models/experiments-dashboard.model';
import { HttpClient } from '@angular/common/http';
import { BackendExperiment, BackendExperimentWithResult } from '../models/backend-experiment.model';
import { mapBackendToFrontend } from '../pages/experiments-dashboard/experiments-dashboard.mapper';
import { Subscription, map, tap } from 'rxjs';
import { ErrorService } from './error.service';

@Injectable({
  providedIn: 'root',
})
export class ExperimentsDashboardService {
  private apiUrl = '/services/experiments';

  // WritableSignal
  experiments: WritableSignal<Experiment[]> = signal<Experiment[]>([]);
  totalExperiments = signal<number>(0);
  globalTotalExperiments = signal<number>(0);
  totalPages = signal<number>(0);
  currentPage = signal<number>(0);

  private http = inject(HttpClient);
  private experimentsRequestSub: Subscription | null = null;

  constructor() { }

  private errorService = inject(ErrorService);

  // Fetch all experiments from the backend and update the signal
  getUserExperiments(page: number = 0, size: number = 10, onlyMine: boolean = false, filters?: any): void {
    const params: any = {
      page: page.toString(),
      size: size.toString(),
      mine: onlyMine.toString(),
      notMine: (!onlyMine).toString(),
      includeShared: (!onlyMine).toString()
    };

    if (filters) {
      if (filters.query) params.name = filters.query;
      if (filters.algorithm) params.algorithm = filters.algorithm;
      if (filters.shared === 'shared') params.shared = 'true';
      if (filters.shared === 'private') params.shared = 'false';
      const dateRange = this.resolveDateRange(filters.datePreset);
      if (dateRange.dateFrom) params.dateFrom = dateRange.dateFrom;
      if (dateRange.dateTo) params.dateTo = dateRange.dateTo;
    }

    this.experimentsRequestSub?.unsubscribe();
    this.experimentsRequestSub = this.http
      .get<{ experiments: BackendExperiment[], totalExperiments: number, totalPages: number, currentPage: number }>(this.apiUrl, {
        params: params
      })
      .subscribe({
        next: (response) => {
          const mappedExperiments = (response?.experiments || []).map(mapBackendToFrontend);
          this.experiments.set(mappedExperiments);
          this.totalExperiments.set(response?.totalExperiments || 0);
          this.totalPages.set(response?.totalPages || 0);
          this.currentPage.set(response?.currentPage || 0);
        },
        error: (err) => {
          console.error('[ExperimentsDashboardService] getUserExperiments error', err);
          this.errorService.setError('Failed to load experiments.');
          this.experiments.set([]);
          this.totalExperiments.set(0);
          this.totalPages.set(0);
          this.currentPage.set(0);
        }
      });
  }

  fetchGlobalTotal(): void {
    const params = {
      page: '0',
      size: '1',
      mine: 'false',
      includeShared: 'true'
    };
    this.http
      .get<{ experiments: BackendExperiment[], totalExperiments: number, totalPages: number, currentPage: number }>(this.apiUrl, {
        params: params
      })
      .subscribe({
        next: (response) => {
          this.globalTotalExperiments.set(response?.totalExperiments || 0);
        },
        error: (err) => {
          console.error('[ExperimentsDashboardService] fetchGlobalTotal error', err);
        }
      });
  }

  // For edit / hydrate (metadata)
  getExperiment(uuid: string) {
    return this.http.get<BackendExperiment>(`${this.apiUrl}/${uuid}`);
  }

  fetchExperimentById(uuid: string) {
    return this.http
      .get<BackendExperiment>(`${this.apiUrl}/${uuid}`)
      .pipe(map(mapBackendToFrontend));
  }

  upsertExperiment(experiment: Experiment): void {
    if (!experiment?.id) return;
    this.experiments.update((current) => {
      const idx = current.findIndex((exp) => exp.id === experiment.id);
      if (idx === -1) {
        return [experiment, ...current];
      }
      const next = [...current];
      next[idx] = { ...current[idx], ...experiment };
      return next;
    });
  }

  // For compare / results view
  getExperimentResult(uuid: string) {
    return this.http.get<BackendExperimentWithResult>(`${this.apiUrl}/${uuid}`);
  }

  updateExperimentShared(uuid: string, shared: boolean) {
    return this.http.patch(`/services/experiments/${uuid}`, { shared });
  }

  toggleExperimentShare(experimentId: string, newShared: boolean) {
    return this.http
      .patch<BackendExperiment>(`${this.apiUrl}/${experimentId}`, { shared: newShared })
      .pipe(
        tap((updated) => {
          this.experiments.update((current) =>
            current.map((exp) =>
              exp.id === experimentId
                ? { ...exp, isShared: updated.shared }
                : exp
            )
          );
        })
      );
  }

  updateExperimentName(experimentId: string, name: string) {
    return this.http
      .patch<BackendExperiment>(`${this.apiUrl}/${experimentId}`, { name })
      .pipe(
        tap((updated) => {
          this.experiments.update((current) =>
            current.map((exp) =>
              exp.id === experimentId
                ? { ...exp, name: updated.name }
                : exp
            )
          );
        })
      );
  }

  deleteExperiment(experimentId: string): void {
    if (!experimentId) return;

    const previousExperiments = this.experiments();
    const previousTotal = this.totalExperiments();

    // Optimistic update UI
    this.experiments.update((current: Experiment[]) =>
      current.filter((exp: Experiment) => exp.id !== experimentId)
    );
    this.totalExperiments.set(Math.max(0, previousTotal - 1));

    // Backend call with rollback on failure
    this.http.delete<void>(`${this.apiUrl}/${experimentId}`).subscribe({
      next: () => {
      },
      error: (err) => {
        console.error('Error deleting experiment', err);
        this.experiments.set(previousExperiments);
        this.totalExperiments.set(previousTotal);
        this.errorService.setError('Failed to delete experiment.');
      },
    });
  }

  private resolveDateRange(
    preset: 'any' | 'today' | '7d' | '30d' | string | null | undefined
  ): { dateFrom?: string; dateTo?: string } {
    if (!preset || preset === 'any') return {};

    const now = new Date();
    const toIso = (d: Date) => d.toISOString();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (preset === 'today') {
      return { dateFrom: toIso(startOfToday), dateTo: toIso(now) };
    }
    if (preset === '7d' || preset === '30d') {
      const days = preset === '7d' ? 7 : 30;
      const from = new Date(now);
      from.setDate(now.getDate() - days);
      return { dateFrom: toIso(from), dateTo: toIso(now) };
    }

    return {};
  }

}
