import { signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';

import { Study, AnalysisGroup } from '../../models/study.model';
import { User } from '../../models/user.interface';
import { StudiesService } from '../../services/studies.service';

/** The surface the dashboard, the list, the canvas and the compare workspace call. */
type StudiesSurface = Pick<
  StudiesService,
  | 'studies'
  | 'loading'
  | 'loadError'
  | 'setActiveUser'
  | 'createStudy'
  | 'renameStudy'
  | 'deleteStudy'
  | 'toggleAnalysis'
  | 'addAnalysis'
  | 'removeAnalysis'
  | 'createGroup'
  | 'renameGroup'
  | 'deleteGroup'
  | 'moveToGroup'
  | 'removeFromGroups'
  | 'pruneAnalysis'
  | 'studyById'
  | 'isMember'
  | 'groupOf'
>;

type StudyMethod =
  | 'createStudy'
  | 'renameStudy'
  | 'deleteStudy'
  | 'toggleAnalysis'
  | 'addAnalysis'
  | 'removeAnalysis'
  | 'createGroup'
  | 'renameGroup'
  | 'deleteGroup'
  | 'moveToGroup'
  | 'removeFromGroups';

const nameKey = (name: string): string => name.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * `FakeStudiesService` is the study service as its components see it, minus the HTTP.
 *
 * `StudiesService` speaks to `/services/studies` and answers every mutation
 * with an Observable, so a spec double can keep the synchronous feel the component specs were
 * written with: seeding is a plain call (`seedStudy`/`seedGroup`), a component-triggered mutation
 * answers immediately, and a spec that wants to see the failure path asks for it with `failWith`.
 * The wire contract itself — URLs, bodies, the 409 that becomes `null`/`false` — is covered once,
 * against `HttpTestingController`, in `studies.service.spec.ts`.
 */
export class FakeStudiesService implements StudiesSurface {
  readonly studies = signal<Study[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  /** Whom the host kept naming, so a spec can see the session was handed over — and handed over once. */
  readonly sessions: Array<string | null> = [];

  private readonly failures = new Map<StudyMethod, unknown>();
  private sequence = 0;

  // ---- test seams ----

  /** Makes the next `method` the component calls fail, the way a dead backend would. */
  failWith(method: StudyMethod, error: unknown = new Error('the backend is down')): void {
    this.failures.set(method, error);
  }

  /** Seeds a study without pretending it was a user gesture. */
  seedStudy(name: string, analysisIds: string[] = []): Study {
    const study: Study = {
      id: this.id('study'),
      name: name.replace(/\s+/g, ' ').trim(),
      analysisIds: [...analysisIds],
      groups: [],
    };
    this.studies.update((current) => [...current, study]);
    return study;
  }

  /** Seeds a group, and the members it holds, without going through the canvas menu. */
  seedGroup(studyId: string, name: string, analysisIds: string[] = []): AnalysisGroup | null {
    const study = this.studyById(studyId);
    if (!study) return null;

    const created: AnalysisGroup = { id: this.id('group'), name: name.replace(/\s+/g, ' ').trim(), analysisIds: [...analysisIds] };
    this.studies.update((current) =>
      current.map((candidate) =>
        candidate.id === studyId
          ? {
              ...candidate,
              groups: [...candidate.groups, created],
              analysisIds: [
                ...candidate.analysisIds,
                ...analysisIds.filter((id) => !candidate.analysisIds.includes(id)),
              ],
            }
          : candidate,
      ),
    );
    return created;
  }

  // ---- the surface itself ----

  setActiveUser(user: User | null): void {
    // Recorded, not obeyed: there is nothing to read when the spec is the one seeding the rows.
    this.sessions.push(user?.username?.trim() || null);
  }

  createStudy(name: string, analysisId?: string): Observable<Study | null> {
    const cleanName = name.replace(/\s+/g, ' ').trim();
    if (!cleanName || this.studies().some((study) => nameKey(study.name) === nameKey(cleanName))) {
      return of(null);
    }

    return this.answer('createStudy', () => {
      const created = this.seedStudy(cleanName, analysisId ? [analysisId] : []);
      return created;
    });
  }

  renameStudy(studyId: string, name: string): Observable<boolean> {
    const cleanName = name.replace(/\s+/g, ' ').trim();
    if (!cleanName) return of(false);

    return this.answer('renameStudy', () => {
      const clash = this.studies().some((study) => study.id !== studyId && nameKey(study.name) === nameKey(cleanName));
      if (clash) return false;

      this.studies.update((current) =>
        current.map((study) => (study.id === studyId ? { ...study, name: cleanName } : study)),
      );
      return true;
    });
  }

  deleteStudy(studyId: string): Observable<void> {
    return this.answer('deleteStudy', () => {
      this.studies.update((current) => current.filter((study) => study.id !== studyId));
    });
  }

  toggleAnalysis(studyId: string, analysisId: string): Observable<Study> {
    return this.isMember(studyId, analysisId)
      ? this.removeAnalysis(studyId, analysisId)
      : this.addAnalysis(studyId, analysisId);
  }

  addAnalysis(studyId: string, analysisId: string): Observable<Study> {
    return this.answer('addAnalysis', () => {
      const updated = this.map(studyId, (study) =>
        study.analysisIds.includes(analysisId)
          ? study
          : { ...study, analysisIds: [...study.analysisIds, analysisId] },
      );
      return this.require(studyId, updated);
    });
  }

  removeAnalysis(studyId: string, analysisId: string): Observable<Study> {
    return this.answer('removeAnalysis', () => {
      const updated = this.map(studyId, (study) => ({
        ...study,
        analysisIds: study.analysisIds.filter((id) => id !== analysisId),
        groups: this.dropFromGroups(study.groups, analysisId),
      }));
      return this.require(studyId, updated);
    });
  }

  createGroup(studyId: string, name: string, analysisId?: string): Observable<Study | null> {
    const cleanName = name.replace(/\s+/g, ' ').trim();
    const study = this.studyById(studyId);
    if (!study || !cleanName || study.groups.some((group) => nameKey(group.name) === nameKey(cleanName))) {
      return of(null);
    }

    return this.answer('createGroup', () => {
      if (analysisId) this.seedGroup(studyId, cleanName, [analysisId]);
      else this.seedGroup(studyId, cleanName);
      return this.studyById(studyId);
    });
  }

  renameGroup(studyId: string, groupId: string, name: string): Observable<boolean> {
    const cleanName = name.replace(/\s+/g, ' ').trim();
    const study = this.studyById(studyId);
    if (!study || !cleanName || !study.groups.some((group) => group.id === groupId)) return of(false);
    if (study.groups.some((group) => group.id !== groupId && nameKey(group.name) === nameKey(cleanName))) return of(false);

    return this.answer('renameGroup', () => {
      this.studies.update((current) =>
        current.map((candidate) =>
          candidate.id === studyId
            ? { ...candidate, groups: candidate.groups.map((group) => (group.id === groupId ? { ...group, name: cleanName } : group)) }
            : candidate,
        ),
      );
      return true;
    });
  }

  deleteGroup(studyId: string, groupId: string): Observable<Study> {
    return this.answer('deleteGroup', () => {
      const updated = this.map(studyId, (study) => ({ ...study, groups: study.groups.filter((group) => group.id !== groupId) }));
      return this.require(studyId, updated);
    });
  }

  moveToGroup(studyId: string, analysisId: string, groupId: string): Observable<Study> {
    return this.answer('moveToGroup', () => {
      const updated = this.map(studyId, (study) =>
        study.groups.some((group) => group.id === groupId)
          ? {
              ...study,
              analysisIds: study.analysisIds.includes(analysisId)
                ? study.analysisIds
                : [...study.analysisIds, analysisId],
              groups: study.groups.map((group) =>
                group.id === groupId
                  ? { ...group, analysisIds: [...group.analysisIds.filter((id) => id !== analysisId), analysisId] }
                  : { ...group, analysisIds: group.analysisIds.filter((id) => id !== analysisId) },
              ),
            }
          : study,
      );
      return this.require(studyId, updated);
    });
  }

  removeFromGroups(studyId: string, analysisId: string): Observable<Study> {
    return this.answer('removeFromGroups', () => {
      const updated = this.map(studyId, (study) => ({ ...study, groups: this.dropFromGroups(study.groups, analysisId) }));
      return this.require(studyId, updated);
    });
  }

  pruneAnalysis(analysisId: string): void {
    if (!analysisId) return;
    this.studies.update((current) =>
      current.map((study) => ({
        ...study,
        analysisIds: study.analysisIds.filter((id) => id !== analysisId),
        groups: this.dropFromGroups(study.groups, analysisId),
      })),
    );
  }

  studyById(studyId: string | null): Study | null {
    if (!studyId) return null;
    return this.studies().find((study) => study.id === studyId) ?? null;
  }

  isMember(studyId: string, analysisId: string): boolean {
    return this.studies().find((study) => study.id === studyId)?.analysisIds.includes(analysisId) ?? false;
  }

  groupOf(studyId: string, analysisId: string): string | null {
    return this.studyById(studyId)?.groups.find((group) => group.analysisIds.includes(analysisId))?.id ?? null;
  }

  // ---- internals ----

  /** One answer per call, with the failure a spec asked for taking precedence. */
  private answer<T>(method: StudyMethod, mutate: () => T): Observable<T> {
    const failure = this.failures.get(method);
    if (failure !== undefined) {
      this.failures.delete(method);
      return throwError(() => failure);
    }
    return of(mutate());
  }

  private map(studyId: string, edit: (study: Study) => Study): Study | null {
    const updated = this.studies().map((study) => (study.id === studyId ? edit(study) : study));
    this.studies.set(updated);
    return updated.find((study) => study.id === studyId) ?? null;
  }

  /** The server always answers a write with the study; the double says the same even if it never had it. */
  private require(studyId: string, study: Study | null): Study {
    return study ?? { id: studyId, name: 'Missing study', analysisIds: [], groups: [] };
  }

  private dropFromGroups(groups: AnalysisGroup[], analysisId: string): AnalysisGroup[] {
    return groups.map((group) => ({ ...group, analysisIds: group.analysisIds.filter((id) => id !== analysisId) }));
  }

  private id(prefix: 'study' | 'group'): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }
}
