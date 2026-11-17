import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';

import { Study, AnalysisGroup } from '../models/study.model';
import { BackendStudiesResponse, BackendStudy } from '../models/backend-study.model';
import { User } from '../models/user.interface';

/** The one backend surface for studies and the groups inside them; see `backend-study.model.ts`. */
const STUDIES_URL = '/services/studies';
const MAX_NAME_LENGTH = 60;

/** Every mutation answers with the study itself (StudyAPI returns a bare DTO). */

/**
 * Studies: a named group of runs the user wants side by side.
 *
 * PostgreSQL is the store and `/services/studies` is the only way in or out. The signal
 * below is a mirror of the server's rows, not a second source of truth: every mutation sends its
 * request, and only the study the server returns is written back into the signal. Nothing is kept
 * in the browser, so a study made here is a study the next tab, device, or reload finds.
 *
 * Ownership is not a query parameter — the session picks the rows — so the username here is only a
 * cache key: it tells the service when the mirror has to be thrown away and read again.
 *
 * Studies hold member ids only, never analysis copies, so the only drift risk is an id that no
 * longer resolves. Membership is pruned after a confirmed delete or a real 404, never against the
 * visible page: the dashboard list is server-paginated, so a page is never the full truth and
 * pruning against it would silently empty studies whose members sit on another page.
 *
 * Inside a study, groups are named subsets of the members — the grouping the compare workspace
 * renders as sections. They partition the members: a run sits in at most one group, and anything
 * in no group is Ungrouped, which the compare derives per algorithm instead.
 */
@Injectable({ providedIn: 'root' })
export class StudiesService {
  readonly studies = signal<Study[]>([]);
  /** True while the study rows for the active user are on their way in. */
  readonly loading = signal(false);
  /** Why the mirror above is not the truth; the study strip says so instead of showing nothing. */
  readonly loadError = signal<string | null>(null);

  private readonly http = inject(HttpClient);

  /** Whose rows `studies` mirrors; null means nobody is signed in and there is nothing to mirror. */
  private activeUsername: string | null = null;
  /** Rises with every load, so a response that arrives after a newer one is dropped, not applied. */
  private loadToken = 0;

  /**
   * Points the mirror at the signed-in user. Called from the dashboard once the session resolves.
   *
   * A signed-out user gets an empty mirror and no request; a new username clears the mirror and
   * reads the server again; the same username coming back through change detection does neither.
   */
  setActiveUser(user: User | null): void {
    const username = user?.username?.trim() || null;
    if (username === this.activeUsername) return;

    this.activeUsername = username;
    const token = ++this.loadToken;
    this.studies.set([]);
    this.loadError.set(null);
    if (!username) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.http.get<BackendStudiesResponse>(STUDIES_URL).subscribe({
      next: (response) => {
        if (token !== this.loadToken) return;
        this.loading.set(false);
        this.studies.set(this.studiesFrom(response));
      },
      error: (err) => {
        if (token !== this.loadToken) return;
        console.error('[StudiesService] Could not load studies', err);
        this.loading.set(false);
        this.loadError.set('Could not load your studies. Check the connection and reload the page.');
      },
    });
  }

  /** Blank names are rejected here; a name another study of this user's already took comes back as 409, which becomes null. */
  createStudy(name: string, analysisId?: string): Observable<Study | null> {
    const cleanName = this.sanitizeName(name);
    if (!cleanName) return of(null);

    return this.post(STUDIES_URL, {
      name: cleanName,
      ...(analysisId ? { analysisId: analysisId } : {}),
    }).pipe(
      catchError((error) => this.nameTaken<Study | null>(error, null)),
    );
  }

  /** True on success, false when the name is taken or blank; anything else the server said is rethrown. */
  renameStudy(studyId: string, name: string): Observable<boolean> {
    const cleanName = this.sanitizeName(name);
    if (!cleanName) return of(false);
    if (!studyId) return this.invalid('renameStudy needs a study id');

    return this.http
      .patch<BackendStudy>(this.studyUrl(studyId), { name: cleanName })
      .pipe(
        map((response) => this.confirmRename(response)),
        catchError((error) => this.nameTaken<boolean>(error, false)),
      );
  }

  /** The server answers with no body, so the mirror is what drops the study. */
  deleteStudy(studyId: string): Observable<void> {
    if (!studyId) return this.invalid('deleteStudy needs a study id');

    return this.http.delete<void>(this.studyUrl(studyId)).pipe(
      map(() => {
        this.studies.update((current) => current.filter((study) => study.id !== studyId));
      }),
    );
  }

  /** The row menu ticks a study on or off, so one entry point decides which way this call goes. */
  toggleAnalysis(studyId: string, analysisId: string): Observable<Study> {
    return this.isMember(studyId, analysisId)
      ? this.removeAnalysis(studyId, analysisId)
      : this.addAnalysis(studyId, analysisId);
  }

  addAnalysis(studyId: string, analysisId: string): Observable<Study> {
    if (!studyId || !analysisId) return this.invalid('addAnalysis needs a study and a run');

    return this.post(this.studyUrl(studyId, 'members'), { analysisId: analysisId });
  }

  /** Leaving the study ends the membership outright: a group cannot keep a run the study lost. */
  removeAnalysis(studyId: string, analysisId: string): Observable<Study> {
    if (!studyId || !analysisId) return this.invalid('removeAnalysis needs a study and a run');

    return this.http
      .delete<BackendStudy>(this.studyUrl(studyId, 'members', analysisId))
      .pipe(map((response) => this.applyStudy(response)));
  }

  /**
   * Prune a deleted or 404'd analysis out of the mirror, groups included. Local on purpose: the
   * caller has already been told by the analysis API that the run is gone, and
   * `ON DELETE CASCADE` dropped the membership rows in the same transaction, so there is nothing
   * left to ask the server. It is never a write — pruning on an unconfirmed delete would let a
   * failed request cost the user a study.
   */
  pruneAnalysis(analysisId: string): void {
    if (!analysisId) return;
    if (!this.studies().some((study) => this.studyHolds(study, analysisId))) return;

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

  // ---- groups: named subsets of a study, one level deep by design ----

  /** Same name rules as studies, in a namespace of their own: a group may share its study's name. */
  createGroup(studyId: string, name: string, analysisId?: string): Observable<Study | null> {
    const cleanName = this.sanitizeName(name);
    if (!studyId || !cleanName) return of(null);

    return this.post(this.studyUrl(studyId, 'groups'), {
      name: cleanName,
      ...(analysisId ? { analysisId: analysisId } : {}),
    }).pipe(
      catchError((error) => this.nameTaken<Study | null>(error, null)),
    );
  }

  renameGroup(studyId: string, groupId: string, name: string): Observable<boolean> {
    const cleanName = this.sanitizeName(name);
    if (!cleanName) return of(false);
    if (!studyId || !groupId) return this.invalid('renameGroup needs a study and a group');

    return this.http
      .patch<BackendStudy>(this.studyUrl(studyId, 'groups', groupId), { name: cleanName })
      .pipe(
        map((response) => this.confirmRename(response)),
        catchError((error) => this.nameTaken<boolean>(error, false)),
      );
  }

  /** Deleting a group retires the name, never the runs: its members fall back to Ungrouped. */
  deleteGroup(studyId: string, groupId: string): Observable<Study> {
    if (!studyId || !groupId) return this.invalid('deleteGroup needs a study and a group');

    return this.http
      .delete<BackendStudy>(this.studyUrl(studyId, 'groups', groupId))
      .pipe(map((response) => this.applyStudy(response)));
  }

  /** The strict partition: the server repoints the membership row, so the group that had it gives it up. */
  moveToGroup(studyId: string, analysisId: string, groupId: string): Observable<Study> {
    if (!studyId || !analysisId || !groupId) return this.invalid('moveToGroup needs a study, a run and a group');

    return this.assignGroup(studyId, analysisId, groupId);
  }

  /** The way out of a group that is not "leave the study": back to the Ungrouped group. */
  removeFromGroups(studyId: string, analysisId: string): Observable<Study> {
    if (!studyId || !analysisId) return this.invalid('removeFromGroups needs a study and a run');

    return this.assignGroup(studyId, analysisId, null);
  }

  /** Which group holds this run; null when it sits in the study ungrouped. */
  groupOf(studyId: string, analysisId: string): string | null {
    return this.studyById(studyId)?.groups.find((group) => group.analysisIds.includes(analysisId))?.id ?? null;
  }

  /** Joining a group and leaving one are the same write: the member row's group id, set or cleared. */
  private assignGroup(studyId: string, analysisId: string, groupId: string | null): Observable<Study> {
    return this.http
      .patch<BackendStudy>(this.studyUrl(studyId, 'members', analysisId, 'group'), { groupId: groupId })
      .pipe(map((response) => this.applyStudy(response)));
  }

  /** A rename answers with the renamed study — the mirror takes it, and the caller gets a true. */
  private confirmRename(payload: unknown): boolean {
    this.applyStudy(payload);
    return true;
  }

  private post(url: string, body: unknown): Observable<Study> {
    return this.http.post<BackendStudy>(url, body).pipe(map((response) => this.applyStudy(response)));
  }

  /**
   * The server's copy wins, so the mirror is replaced rather than edited. A study the mirror has
   * never seen — one created in this tab a moment ago — takes its place at the end of the list,
   * which is also where the server's own ordering puts it.
   */
  private applyStudy(payload: unknown): Study {
    const study = this.studyFrom(payload);
    if (!study) {
      throw new Error('[StudiesService] The server answered a study write without a study');
    }

    this.studies.update((current) =>
      current.some((candidate) => candidate.id === study.id)
        ? current.map((candidate) => (candidate.id === study.id ? study : candidate))
        : [...current, study],
    );
    return study;
  }

  private studyUrl(studyId: string, ...rest: string[]): string {
    return [STUDIES_URL, studyId, ...rest].join('/');
  }

  /** A 409 is the server saying "a sibling already has that name", which the inline message speaks. */
  private nameTaken<T>(error: unknown, taken: T): Observable<T> {
    if ((error as { status?: number } | null)?.status === 409) return of(taken);
    return throwError(() => error);
  }

  /** A call the UI should never have made: failing loudly beats the silent no-op it used to be. */
  private invalid(message: string): Observable<never> {
    const error = new Error(`[StudiesService] ${message}`);
    console.error(error.message);
    return throwError(() => error);
  }

  private sanitizeName(name: string): string {
    return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  }

  private studyHolds(study: Study, analysisId: string): boolean {
    return study.analysisIds.includes(analysisId) || study.groups.some((group) => group.analysisIds.includes(analysisId));
  }

  private dropFromGroups(groups: AnalysisGroup[], analysisId: string): AnalysisGroup[] {
    return groups.map((group) => ({ ...group, analysisIds: group.analysisIds.filter((id) => id !== analysisId) }));
  }

  /**
   * The mirror is written from what the server sent, so a payload that lost a field degrades to
   * "no members" or "no groups" instead of throwing inside a response handler. A row with neither an
   * id nor a name is not a study and is dropped.
   */
  private studiesFrom(response: BackendStudiesResponse | null): Study[] {
    const value = response?.studies;
    if (!Array.isArray(value)) return [];

    return value.map((study) => this.studyFrom(study)).filter((study): study is Study => !!study);
  }

  private studyFrom(value: unknown): Study | null {
    const candidate = value as { id?: unknown; name?: unknown; analysisIds?: unknown; groups?: unknown } | null;
    if (!candidate || typeof candidate.id !== 'string' || typeof candidate.name !== 'string') return null;

    return {
      id: candidate.id,
      name: candidate.name,
      analysisIds: this.stringsFrom(candidate.analysisIds),
      groups: this.groupsFrom(candidate.groups),
    };
  }

  private groupsFrom(value: unknown): AnalysisGroup[] {
    if (!Array.isArray(value)) return [];

    return value
      .filter((group): group is { id: string; name: string; analysisIds?: unknown } =>
        !!group && typeof group.id === 'string' && typeof group.name === 'string')
      .map((group) => ({ id: group.id, name: group.name, analysisIds: this.stringsFrom(group.analysisIds) }));
  }

  private stringsFrom(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  }
}
