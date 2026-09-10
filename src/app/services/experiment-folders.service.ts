import { Injectable, signal } from '@angular/core';

import { ExperimentFolder, ExperimentSet } from '../models/experiment-folder.model';

const STORAGE_BASE_KEY = 'mip.experiments.folders.v1';
const ANON_SCOPE = 'anon';
const MAX_NAME_LENGTH = 60;

/**
 * Experiment folders ("analysis sets"): a named group of runs the user wants side by side.
 *
 * Persistence is a frontend cache for now. All folder mutations stay behind this service
 * so the upcoming backend folder API can replace localStorage without changing the
 * dashboard/canvas components. Folders hold member ids only, never experiment copies, so
 * the only drift risk is an id that no longer resolves. Membership is pruned after a
 * confirmed delete or a real 404, never against the visible page: the dashboard list is
 * server-paginated, so a page is never the full truth and pruning against it would
 * silently empty folders whose members sit on another page.
 *
 * Inside a folder, sets are named subsets of the members — the grouping the compare workspace
 * renders as sections. They partition the members: a run sits in at most one set, and anything
 * in no set is Ungrouped, which the compare derives per algorithm instead.
 */
@Injectable({ providedIn: 'root' })
export class ExperimentFoldersService {
  readonly folders = signal<ExperimentFolder[]>([]);

  /** Key suffix follows the signed-in user; null until the scope is resolved. */
  private scope: string | null = null;

  /**
   * Points storage at the current user. Called from the dashboard once the session (and
   * therefore the email) is known; folders made before that live under the anon key and are
   * adopted once, so a first folder made while signing in does not vanish on reload.
   */
  useUserScope(email: string | null): void {
    const next = this.normalizeScope(email);
    if (next === this.scope) return;

    const adopt = (this.scope === null || this.scope === ANON_SCOPE) && next !== ANON_SCOPE && this.folders().length > 0;
    this.scope = next;

    if (!adopt) {
      this.folders.set(this.foldersFrom(this.readKey(this.storageKey(next))));
      return;
    }
    this.persist();
    this.removeKey(this.storageKey(ANON_SCOPE));
  }

  /** Blank and duplicate names are rejected; a duplicate returns null so callers can say so. */
  createFolder(name: string, experimentId?: string): ExperimentFolder | null {
    const cleanName = this.sanitizeName(name);
    if (!cleanName) return null;
    if (this.folders().some((folder) => this.nameKey(folder.name) === this.nameKey(cleanName))) return null;

    const folder: ExperimentFolder = {
      id: this.makeId('folder'),
      name: cleanName,
      experimentIds: experimentId ? [experimentId] : [],
      sets: [],
    };

    this.folders.update((current) => [...current, folder]);
    this.persist();
    return folder;
  }

  renameFolder(folderId: string, name: string): boolean {
    const cleanName = this.sanitizeName(name);
    if (!cleanName) return false;
    const clash = this.folders().some(
      (folder) => folder.id !== folderId && this.nameKey(folder.name) === this.nameKey(cleanName),
    );
    if (clash) return false;

    const existing = this.folders().find((folder) => folder.id === folderId);
    if (!existing) return false;

    this.folders.update((current) =>
      current.map((folder) => (folder.id === folderId ? { ...folder, name: cleanName } : folder)),
    );
    this.persist();
    return true;
  }

  deleteFolder(folderId: string): void {
    if (!this.folders().some((folder) => folder.id === folderId)) return;
    this.folders.update((current) => current.filter((folder) => folder.id !== folderId));
    this.persist();
  }

  /** The row menu and the canvas both add and drop members, so one entry point. */
  toggleExperiment(folderId: string, experimentId: string): void {
    if (this.isMember(folderId, experimentId)) {
      this.removeExperiment(folderId, experimentId);
      return;
    }
    this.addExperiment(folderId, experimentId);
  }

  addExperiment(folderId: string, experimentId: string): void {
    if (!experimentId || this.isMember(folderId, experimentId)) return;
    this.folders.update((current) =>
      current.map((folder) =>
        folder.id === folderId
          ? { ...folder, experimentIds: [...folder.experimentIds, experimentId] }
          : folder,
      ),
    );
    this.persist();
  }

  /** Leaving the folder ends the membership outright: a set cannot keep a run the folder lost. */
  removeExperiment(folderId: string, experimentId: string): void {
    this.folders.update((current) =>
      current.map((folder) =>
        folder.id === folderId
          ? {
              ...folder,
              experimentIds: folder.experimentIds.filter((id) => id !== experimentId),
              sets: this.dropFromSets(folder.sets, experimentId),
            }
          : folder,
      ),
    );
    this.persist();
  }

  /** Prune a deleted or 404'd experiment from every folder, sets included. The one pruning path. */
  pruneExperiment(experimentId: string): void {
    if (!experimentId) return;
    if (!this.folders().some((folder) => this.folderHolds(folder, experimentId))) return;

    this.folders.update((current) =>
      current.map((folder) => ({
        ...folder,
        experimentIds: folder.experimentIds.filter((id) => id !== experimentId),
        sets: this.dropFromSets(folder.sets, experimentId),
      })),
    );
    this.persist();
  }

  folderById(folderId: string | null): ExperimentFolder | null {
    if (!folderId) return null;
    return this.folders().find((folder) => folder.id === folderId) ?? null;
  }

  isMember(folderId: string, experimentId: string): boolean {
    return this.folders().find((folder) => folder.id === folderId)?.experimentIds.includes(experimentId) ?? false;
  }

  // ---- sets: named subsets of a folder, one level deep by design ----

  /** Same name rules as folders, in a namespace of their own: a set may share its folder's name. */
  createSet(folderId: string, name: string, experimentId?: string): ExperimentSet | null {
    const folder = this.folderById(folderId);
    if (!folder) return null;

    const cleanName = this.sanitizeName(name);
    if (!cleanName) return null;
    if (folder.sets.some((set) => this.nameKey(set.name) === this.nameKey(cleanName))) return null;

    const created: ExperimentSet = { id: this.makeId('set'), name: cleanName, experimentIds: [] };
    this.folders.update((current) =>
      current.map((candidate) =>
        candidate.id === folderId
          ? {
              ...candidate,
              sets: [...candidate.sets, created],
              experimentIds:
                experimentId && !candidate.experimentIds.includes(experimentId)
                  ? [...candidate.experimentIds, experimentId]
                  : candidate.experimentIds,
            }
          : candidate,
      ),
    );
    if (experimentId) this.moveToSet(folderId, experimentId, created.id);
    // Unconditional: the update above is a real mutation even when the move below it no-ops.
    this.persist();

    return created;
  }

  renameSet(folderId: string, setId: string, name: string): boolean {
    const folder = this.folderById(folderId);
    if (!folder) return false;

    const cleanName = this.sanitizeName(name);
    if (!cleanName) return false;
    const clash = folder.sets.some((set) => set.id !== setId && this.nameKey(set.name) === this.nameKey(cleanName));
    if (clash) return false;
    if (!folder.sets.some((set) => set.id === setId)) return false;

    this.folders.update((current) =>
      current.map((candidate) =>
        candidate.id === folderId
          ? { ...candidate, sets: candidate.sets.map((set) => (set.id === setId ? { ...set, name: cleanName } : set)) }
          : candidate,
      ),
    );
    this.persist();
    return true;
  }

  /** Deleting a set retires the name, never the runs: its members fall back to Ungrouped. */
  deleteSet(folderId: string, setId: string): void {
    const folder = this.folderById(folderId);
    if (!folder || !folder.sets.some((set) => set.id === setId)) return;

    this.folders.update((current) =>
      current.map((candidate) =>
        candidate.id === folderId ? { ...candidate, sets: candidate.sets.filter((set) => set.id !== setId) } : candidate,
      ),
    );
    this.persist();
  }

  /** The strict partition: moving in files the run nowhere else, so the old set gives it up. */
  moveToSet(folderId: string, experimentId: string, setId: string): void {
    if (!experimentId || !setId) return;
    const folder = this.folderById(folderId);
    if (!folder || !folder.sets.some((set) => set.id === setId)) return;
    if (this.setOf(folderId, experimentId) === setId) return;

    this.folders.update((current) =>
      current.map((candidate) =>
        candidate.id === folderId
          ? {
              ...candidate,
              // A set only ever holds members, so moving in also joins the folder.
              experimentIds: candidate.experimentIds.includes(experimentId)
                ? candidate.experimentIds
                : [...candidate.experimentIds, experimentId],
              sets: candidate.sets.map((set) =>
                set.id === setId
                  ? { ...set, experimentIds: [...set.experimentIds, experimentId] }
                  : { ...set, experimentIds: set.experimentIds.filter((id) => id !== experimentId) },
              ),
            }
          : candidate,
      ),
    );
    this.persist();
  }

  /** The way out of a set that is not "leave the folder": back to the Ungrouped group. */
  removeFromSets(folderId: string, experimentId: string): void {
    const folder = this.folderById(folderId);
    if (!folder || !folder.sets.some((set) => set.experimentIds.includes(experimentId))) return;

    this.folders.update((current) =>
      current.map((candidate) =>
        candidate.id === folderId ? { ...candidate, sets: this.dropFromSets(candidate.sets, experimentId) } : candidate,
      ),
    );
    this.persist();
  }

  /** Which set holds this run; null when it sits in the folder ungrouped. */
  setOf(folderId: string, experimentId: string): string | null {
    return this.folderById(folderId)?.sets.find((set) => set.experimentIds.includes(experimentId))?.id ?? null;
  }

  private normalizeScope(email: string | null): string {
    const clean = email?.trim().toLowerCase();
    return clean ? clean : ANON_SCOPE;
  }

  private storageKey(scope: string): string {
    return scope === ANON_SCOPE ? STORAGE_BASE_KEY : `${STORAGE_BASE_KEY}:${scope}`;
  }

  private sanitizeName(name: string): string {
    return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  }

  /** Comparison key only — the chip keeps the casing the user typed. */
  private nameKey(name: string): string {
    return this.sanitizeName(name).toLowerCase();
  }

  private makeId(prefix: 'folder' | 'set'): string {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  private folderHolds(folder: ExperimentFolder, experimentId: string): boolean {
    return folder.experimentIds.includes(experimentId) || folder.sets.some((set) => set.experimentIds.includes(experimentId));
  }

  private dropFromSets(sets: ExperimentSet[], experimentId: string): ExperimentSet[] {
    return sets.map((set) => ({ ...set, experimentIds: set.experimentIds.filter((id) => id !== experimentId) }));
  }

  private persist(): void {
    try {
      localStorage.setItem(this.storageKey(this.scope ?? ANON_SCOPE), JSON.stringify(this.folders()));
    } catch {
      // Quota or private mode: folders stay usable in memory for this session.
    }
  }

  private readKey(key: string): unknown {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) as unknown : null;
    } catch {
      this.removeKey(key);
      return null;
    }
  }

  private removeKey(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Private mode: nothing to clean up either way.
    }
  }

  /**
   * Storage is the user's own, so the only realistic damage is a payload left by an older
   * build or a half-written write: keep what has an id and a name, default the rest.
   */
  private foldersFrom(value: unknown): ExperimentFolder[] {
    if (!Array.isArray(value)) return [];

    return value
      .filter((folder): folder is ExperimentFolder => !!folder && typeof folder.id === 'string' && typeof folder.name === 'string')
      .map((folder) => ({
        ...folder,
        experimentIds: this.stringsFrom(folder.experimentIds),
        sets: this.setsFrom(folder.sets),
      }));
  }

  private setsFrom(value: unknown): ExperimentSet[] {
    if (!Array.isArray(value)) return [];

    return value
      .filter((set): set is ExperimentSet => !!set && typeof set.id === 'string' && typeof set.name === 'string')
      .map((set) => ({ ...set, experimentIds: this.stringsFrom(set.experimentIds) }));
  }

  private stringsFrom(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  }
}
