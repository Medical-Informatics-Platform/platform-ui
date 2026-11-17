import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  OnDestroy,
  output,
  Renderer2,
  signal,
  viewChild,
} from '@angular/core';
import { CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import { Observable } from 'rxjs';
import { InflightWrites } from '../../../core/inflight-writes';

import { Analysis } from '../../../models/analyses-dashboard.model';
import { AnalysisGroup } from '../../../models/study.model';
import { droppedAnalysisId, isAnalysisDrag, leavesDragZone } from '../../../core/analysis-drag.utils';
import { isNotFoundError } from '../../../core/http-error.utils';
import { AnalysisStudioService } from '../../../services/analysis-studio.service';
import { AnalysesDashboardService } from '../../../services/analyses-dashboard.service';
import { StudiesService } from '../../../services/studies.service';
import { CommonModule } from '@angular/common';
import { AnalysisStatusComponent } from '../shared/analysis-status/analysis-status.component';

/** One row of the canvas: a member id plus whatever we know about it yet. */
interface StudyMemberRow {
  id: string;
  analysis: Analysis | null;
}

/** One heading on the canvas: a named group, or the implicit Ungrouped tail. */
interface MemberGroup {
  id: string;
  name: string;
  isUngrouped: boolean;
  /** Rows listed above this heading, so one number line runs down the whole canvas. */
  start: number;
  rows: StudyMemberRow[];
}

/** Not a group id — nothing a group can be called, so it can never clash with one. */
const UNGROUPED_GROUP_ID = 'ungrouped';
const UNGROUPED_GROUP_NAME = 'Ungrouped';

/** One drop report: the copy, whether it changed anything (which drives its tint), and the row it just added. */
interface DropNotice {
  text: string;
  kind: 'added' | 'duplicate';
  landedId: string | null;
}

/** Long enough to read against the row that just appeared, short enough not to linger. */
const DROP_NOTICE_MS = 2200;

/**
 * The study canvas: the centre-pane view for a selected study. It is a selection
 * helper, not a second detail view — a member click still opens the detail, and the primary
 * action hands the member ids to the compare workspace.
 *
 * Inside the canvas, members are partitioned into named groups: the headings the compare
 * workspace later renders as sections. Everything not moved into a group sits under an
 * implicit Ungrouped heading, which compare groups by algorithm instead.
 */
@Component({
  selector: 'app-study',
  templateUrl: './study.component.html',
  styleUrl: './study.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CdkMenu, CdkMenuItem, AnalysisStatusComponent],
})
export class StudyComponent implements OnDestroy {
  /** The study is read through the service, so a member added or pruned elsewhere shows up
   *  without the parent having to push a fresh copy down. */
  readonly studyId = input<string | null>(null);

  readonly back = output<void>();
  readonly openAnalysis = output<Analysis>();
  readonly compareRequested = output<string[]>();

  private dashboardService = inject(AnalysesDashboardService);
  private studiesService = inject(StudiesService);
  private analysisStudio = inject(AnalysisStudioService);
  private renderer = inject(Renderer2);
  private cdr = inject(ChangeDetectorRef);

  readonly study = computed(() => this.studiesService.studyById(this.studyId()));

  /** Members outside the loaded page, fetched for display only (never upserted into the list). */
  private fetched = signal<Record<string, Analysis>>({});
  /** Guards the fetch loop only; no template reads it, and `fetched` already re-runs the effect. */
  private readonly inFlight = new Set<string>();
  /** Members the backend stopped returning. The canvas shows one study, so a study id resets them. */
  private unavailable = linkedSignal({
    source: () => this.studyId(),
    computation: () => [] as string[],
  });
  /** Members that failed to load for a reason other than a 404; they stay in the study. */
  private readonly memberErrors = linkedSignal({
    source: () => this.studyId(),
    computation: () => ({} as Record<string, string>),
  });

  readonly isEditingName = signal(false);
  readonly nameDraft = signal('');
  readonly nameError = signal<string | null>(null);
  readonly isConfirmingDelete = signal(false);

  /**
   * What the server refused. The canvas keeps no local copy of a study, so a write that never
   * landed has nowhere else to be admitted — silently leaving the rows as they were would read as
   * the click having done nothing at all.
   */
  readonly actionError = signal<string | null>(null);
  /** Writes on their way to the server; `busy` is what the template disarms buttons with. */
  private readonly writes = new InflightWrites((message) => this.actionError.set(message));
  readonly busy = this.writes.busy;

  /** A run is hovering over the canvas with the study as its plausible destination. */
  readonly isReceiving = signal(false);
  /** What the last drop did, spelled out once: the count badge alone does not say "already in".
   *  Its `landedId` is the member that just appeared, so its row can land with a flash. */
  readonly dropNotice = signal<DropNotice | null>(null);
  private dropNoticeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const study = this.study();
      if (!study) return;

      const loaded = new Set(this.dashboardService.analyses().map((analysis) => analysis.id));
      const cached = this.fetched();

      const pending = study.analysisIds.filter(
        (id) => !loaded.has(id) && !cached[id] && !this.inFlight.has(id),
      );
      if (!pending.length) return;

      pending.forEach((id) => this.inFlight.add(id));

      const requestStudyId = study.id;

      pending.forEach((id) =>
        this.dashboardService.fetchAnalysisById(id).subscribe({
          next: (analysis) => {
            this.inFlight.delete(id);
            this.fetched.update((current) => ({ ...current, [analysis.id]: analysis }));
            this.memberErrors.update((current) => {
              if (!(id in current)) return current;
              const next = { ...current };
              delete next[id];
              return next;
            });
          },
          error: (err) => {
            this.inFlight.delete(id);
            if (isNotFoundError(err)) {
              console.warn('[Study] Member no longer available', id, err);
              this.markUnavailable(id);
              return;
            }
            if (this.studyId() !== requestStudyId) return;
            console.warn('[Study] Member failed to load', id, err);
            this.markLoadError(id);
          },
        }),
      );
    });
  }

  readonly rows = computed<StudyMemberRow[]>(() => {
    const study = this.study();
    if (!study) return [];

    const loaded = this.dashboardService.analyses();
    const cached = this.fetched();

    const members = study.analysisIds.map((id) => ({
      id,
      analysis: loaded.find((analysis) => analysis.id === id) ?? cached[id] ?? null,
    }));

    const ghosts = this.unavailable().map((id) => ({ id, analysis: null }));

    return [...members, ...ghosts];
  });

  /**
   * Groups in study order first, Ungrouped last — the same order compare sections follow, so
   * the canvas is a preview of the workspace rather than a second arrangement of the runs.
   * An empty group keeps its heading: it is a name the user made on purpose. An empty Ungrouped
   * tail does not, because it is the absence of a name.
   */
  readonly groups = computed<MemberGroup[]>(() => {
    const study = this.study();
    if (!study) return [];

    const rows = this.rows();
    if (!study.groups.length) {
      return [{ id: UNGROUPED_GROUP_ID, name: UNGROUPED_GROUP_NAME, isUngrouped: true, start: 0, rows }];
    }

    const buckets = new Map<string, StudyMemberRow[]>(study.groups.map((group) => [group.id, []]));
    const ungrouped: StudyMemberRow[] = [];
    for (const row of rows) {
      const groupId = this.currentGroupId(row);
      const bucket = groupId ? buckets.get(groupId) : undefined;
      if (bucket) bucket.push(row);
      else ungrouped.push(row);
    }

    // Numbered as they are listed, not as the study stores them: a heading is a heading, so the
    // canvas still reads 1, 2, 3 down the page and compare, which sections the same way, agrees.
    let listed = 0;
    const heading = (id: string, name: string, isUngrouped: boolean, members: StudyMemberRow[]) => {
      const group = { id, name, isUngrouped, start: listed, rows: members };
      listed += members.length;
      return group;
    };

    const headings = study.groups.map((group) => heading(group.id, group.name, false, buckets.get(group.id) ?? []));

    return ungrouped.length
      ? [...headings, heading(UNGROUPED_GROUP_ID, UNGROUPED_GROUP_NAME, true, ungrouped)]
      : headings;
  });

  readonly memberCount = computed(() => this.study()?.analysisIds.length ?? 0);
  readonly canCompare = computed(() => this.memberCount() >= 2);
  readonly isEmpty = computed(() => this.memberCount() === 0);

  /**
   * What the study is made of, as "2 algorithms · 1 domain". Only resolved members count: a
   * member still loading or gone has no algorithm or domain to contribute, so the line stays
   * out of the way until the canvas knows something true.
   */
  readonly summary = computed<string | null>(() => {
    const resolved = this.rows()
      .map((row) => row.analysis)
      .filter((analysis): analysis is Analysis => !!analysis);
    if (!resolved.length) return null;

    const algorithms = new Set(resolved.map((analysis) => analysis.algorithmName).filter(Boolean));
    const domains = new Set(resolved.map((analysis) => analysis.domain).filter(Boolean));
    const parts = [this.countLabel(algorithms.size, 'algorithm')];
    if (domains.size) parts.push(this.countLabel(domains.size, 'domain'));

    return parts.join(' · ');
  });

  isUnavailable(id: string): boolean {
    return this.unavailable().includes(id);
  }

  isLoading(row: StudyMemberRow): boolean {
    return !row.analysis && !this.isUnavailable(row.id) && !this.memberError(row.id);
  }

  memberError(id: string): string | null {
    return this.memberErrors()[id] ?? null;
  }

  getAlgorithmLabel(code: string | null | undefined): string {
    if (!code) return 'Unknown algorithm';
    return this.analysisStudio.backendAlgorithms()[code]?.label || code;
  }

  /** "1 algorithm" / "3 algorithms" — the summary line never says "1 algorithms". */
  private countLabel(count: number, noun: string): string {
    return `${count} ${count === 1 ? noun : `${noun}s`}`;
  }

  onRowClick(row: StudyMemberRow): void {
    if (row.analysis) this.openAnalysis.emit(row.analysis);
  }

  /** The whole canvas is the target, not only the empty state: adding to a full study is commoner. */
  onDragOver(event: DragEvent): void {
    if (!isAnalysisDrag(event.dataTransfer)) return;
    // The browser only fires `drop` when the drag was accepted here first.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    if (!this.isReceiving()) this.isReceiving.set(true);
  }

  onDragLeave(event: DragEvent): void {
    if (!leavesDragZone(event, event.currentTarget)) return;
    this.isReceiving.set(false);
  }

  onDrop(event: DragEvent): void {
    this.isReceiving.set(false);

    const study = this.study();
    const analysisId = droppedAnalysisId(event.dataTransfer);
    if (!study || !analysisId) return;
    event.preventDefault();

    // A drop adds; it never undoes. Re-dropping a member is a misaim, not a request to remove it.
    // The mirror answers the duplicate straight away — the server stays the authority either way.
    if (this.studiesService.isMember(study.id, analysisId)) {
      this.showDropNotice({ text: `Already in ${study.name}`, kind: 'duplicate', landedId: null });
      return;
    }

    // The notice waits for the answer, so a row that never appeared never arrives wearing "Added".
    this.runWrite(
      `add:${study.id}:${analysisId}`,
      this.studiesService.addAnalysis(study.id, analysisId),
      (updated) => this.showDropNotice({ text: `Added to ${updated.name}`, kind: 'added', landedId: analysisId }),
      'Could not add that run to the study.',
    );
  }

  /**
   * The bookend every study write needs, in `core/inflight-writes`: one request per action in
   * flight, a canvas that says it is waiting, and a visible line when the server refuses. A success
   * retires the previous refusal before the caller reports what the write did.
   */
  private runWrite<T>(dedupeKey: string, request: Observable<T>, onDone: ((value: T) => void) | null, failure: string): void {
    this.writes.run(dedupeKey, request, (value) => {
      this.actionError.set(null);
      onDone?.(value);
    }, failure);
  }

  ngOnDestroy(): void {
    this.clearDropNotice();
    this.unlistenGroupMenuClick?.();
    this.unlistenGroupMenuClick = null;
  }

  onRemoveMember(row: StudyMemberRow): void {
    // A ghost row is not a member: its id was pruned the moment it 404'd. Removing it from the
    // study again would no-op and leave the row on screen, so this button dismisses it instead.
    if (this.isUnavailable(row.id)) {
      this.dismissUnavailable(row.id);
      return;
    }

    const study = this.study();
    if (!study) return;
    this.runWrite(
      `remove:${study.id}:${row.id}`,
      this.studiesService.removeAnalysis(study.id, row.id),
      null,
      'Could not remove that run from the study.',
    );
  }

  onCompare(): void {
    const study = this.study();
    if (!study || study.analysisIds.length < 2) return;
    this.compareRequested.emit([...study.analysisIds]);
  }

  startRename(): void {
    this.nameDraft.set(this.study()?.name ?? '');
    this.nameError.set(null);
    this.isEditingName.set(true);
  }

  cancelRename(): void {
    this.isEditingName.set(false);
    this.nameError.set(null);
  }

  saveRename(): void {
    const study = this.study();
    if (!study) return;

    const draft = this.nameDraft();
    this.runWrite(
      `rename:${study.id}`,
      this.studiesService.renameStudy(study.id, draft),
      (renamed) => {
        // False is the name rule speaking, and it belongs under the input it was typed into;
        // anything else the server said is the general line above.
        if (!renamed) {
          this.nameError.set(draft.trim() ? 'A study with that name already exists.' : 'Give the study a name.');
          return;
        }
        this.isEditingName.set(false);
        this.nameError.set(null);
      },
      'Could not rename the study. Nothing was changed.',
    );
  }

  askDelete(): void {
    this.isConfirmingDelete.set(true);
  }

  cancelDelete(): void {
    this.isConfirmingDelete.set(false);
  }

  confirmDelete(): void {
    const study = this.study();
    if (!study) return;

    // The way out only opens once the server has the study gone; leaving the canvas over a
    // study that is still in the strip would leave the two disagreeing.
    this.runWrite(
      `delete:${study.id}`,
      this.studiesService.deleteStudy(study.id),
      () => {
        this.isConfirmingDelete.set(false);
        this.back.emit();
      },
      'Could not delete the study. It is still there.',
    );
  }

  // ---- groups: the headings over the member list ----

  /** Group ids whose rows are folded away. The implicit group is collapsible too. */
  private readonly collapsedGroups = signal<Record<string, boolean>>({});

  isGroupCollapsed(group: MemberGroup): boolean {
    return this.collapsedGroups()[group.id] ?? false;
  }

  toggleGroup(group: MemberGroup): void {
    this.collapsedGroups.update((current) => ({ ...current, [group.id]: !this.isGroupCollapsed(group) }));
  }

  readonly renamingGroupId = signal<string | null>(null);
  readonly groupRenameDraft = signal('');
  readonly groupRenameError = signal<string | null>(null);
  readonly confirmingGroupDeleteId = signal<string | null>(null);

  startGroupRename(group: MemberGroup): void {
    this.closeGroupMenu();
    this.renamingGroupId.set(group.id);
    this.groupRenameDraft.set(group.name);
    this.groupRenameError.set(null);
  }

  cancelGroupRename(): void {
    this.renamingGroupId.set(null);
    this.groupRenameError.set(null);
  }

  saveGroupRename(): void {
    const study = this.study();
    const groupId = this.renamingGroupId();
    if (!study || !groupId) return;

    const draft = this.groupRenameDraft();
    this.runWrite(
      `rename-group:${study.id}:${groupId}`,
      this.studiesService.renameGroup(study.id, groupId, draft),
      (renamed) => {
        if (!renamed) {
          this.groupRenameError.set(
            draft.trim() ? 'A group with that name already exists.' : 'Give the group a name.',
          );
          return;
        }
        this.cancelGroupRename();
      },
      'Could not rename the group. Nothing was changed.',
    );
  }

  askGroupDelete(group: MemberGroup): void {
    this.confirmingGroupDeleteId.set(group.id);
  }

  cancelGroupDelete(): void {
    this.confirmingGroupDeleteId.set(null);
  }

  /** The name retires, the runs do not: they fall back to Ungrouped, listed where they now sit. */
  confirmGroupDelete(): void {
    const study = this.study();
    const groupId = this.confirmingGroupDeleteId();
    if (!study || !groupId) return;

    this.runWrite(
      `delete-group:${study.id}:${groupId}`,
      this.studiesService.deleteGroup(study.id, groupId),
      () => this.confirmingGroupDeleteId.set(null),
      'Could not delete the group. It is still there.',
    );
  }

  // ---- per-row move-to-group menu: same recipe as the list row's add-to-study menu ----

  readonly groupMenuRowId = signal<string | null>(null);
  readonly groupMenuNewOpen = signal(false);
  readonly groupMenuDraft = signal('');
  readonly groupMenuError = signal<string | null>(null);

  private readonly groupMenu = viewChild(CdkMenu);
  private unlistenGroupMenuClick: (() => void) | null = null;

  /** Which group holds this member right now; null when it sits ungrouped in the study. */
  currentGroupId(row: StudyMemberRow): string | null {
    const study = this.study();
    return study ? this.studiesService.groupOf(study.id, row.id) : null;
  }

  toggleGroupMenu(row: StudyMemberRow): void {
    if (this.groupMenuRowId() === row.id) {
      this.closeGroupMenu();
      return;
    }
    this.openGroupMenu(row.id);
  }

  private openGroupMenu(rowId: string): void {
    this.groupMenuRowId.set(rowId);
    this.groupMenuNewOpen.set(false);
    this.groupMenuDraft.set('');
    this.groupMenuError.set(null);
    // The menu is an @if, so CdkMenu's roving tabindex only exists after this render.
    this.cdr.detectChanges();
    this.groupMenu()?.focusFirstItem();

    this.unlistenGroupMenuClick?.();
    this.unlistenGroupMenuClick = this.renderer.listen(document, 'pointerdown', (event: PointerEvent) => {
      // Every row carries a trigger and only one row carries a panel, so the click is judged by
      // what was hit rather than by comparing against the first of either. A trigger decides its
      // own fate in its click handler; anything else outside the open menu is a click away.
      const target = event.target as HTMLElement | null;
      if (target?.closest('.group-menu-anchor, .group-menu')) return;
      this.closeGroupMenu();
    });
  }

  closeGroupMenu(): void {
    if (!this.groupMenuRowId()) return;
    this.groupMenuRowId.set(null);
    this.groupMenuNewOpen.set(false);
    this.groupMenuError.set(null);
    this.unlistenGroupMenuClick?.();
    this.unlistenGroupMenuClick = null;
  }

  /** Move to: the run leaves whatever group held it, and the menu stays open to show the new home. */
  onGroupMenuPick(group: AnalysisGroup, row: StudyMemberRow): void {
    const study = this.study();
    if (!study) return;
    this.runWrite(
      `move:${study.id}:${row.id}:${group.id}`,
      this.studiesService.moveToGroup(study.id, row.id, group.id),
      () => this.groupMenuError.set(null),
      'Could not move that run. The groups are unchanged.',
    );
  }

  onGroupMenuUnset(row: StudyMemberRow): void {
    const study = this.study();
    if (!study) return;
    this.closeGroupMenu();
    this.runWrite(
      `unset:${study.id}:${row.id}`,
      this.studiesService.removeFromGroups(study.id, row.id),
      null,
      'Could not move that run back to Ungrouped.',
    );
  }

  openGroupMenuNew(): void {
    this.groupMenuNewOpen.set(true);
    this.groupMenuDraft.set('');
    this.groupMenuError.set(null);
  }

  /** A new group is born with the run inside it — an empty heading is not what was asked for. */
  commitGroupMenuNew(row: StudyMemberRow): void {
    const study = this.study();
    if (!study) return;

    const draft = this.groupMenuDraft();
    this.runWrite(
      `create-group:${study.id}:${draft}`,
      this.studiesService.createGroup(study.id, draft, row.id),
      (updated) => {
        // null is the duplicate (or the blank) the inline line already explains.
        if (!updated) {
          this.groupMenuError.set(draft.trim() ? 'That name is taken.' : 'Give the group a name.');
          return;
        }
        this.groupMenuNewOpen.set(false);
        this.groupMenuError.set(null);
      },
      'Could not create the group.',
    );
  }

  private showDropNotice(notice: DropNotice): void {
    this.clearDropNotice();
    this.dropNotice.set(notice);
    this.dropNoticeTimer = setTimeout(() => {
      this.dropNotice.set(null);
      this.dropNoticeTimer = null;
    }, DROP_NOTICE_MS);
  }

  /** A second drop restarts the countdown rather than letting an older timer cut the newer one short. */
  private clearDropNotice(): void {
    if (!this.dropNoticeTimer) return;
    clearTimeout(this.dropNoticeTimer);
    this.dropNoticeTimer = null;
  }

  /** Drop a reported ghost row. Only a member that resolves again can replace it. */
  private dismissUnavailable(id: string): void {
    this.unavailable.update((ids) => ids.filter((seen) => seen !== id));
  }

  private markUnavailable(id: string): void {
    // A 404 is the one signal that the run really is gone: prune it from every study,
    // then keep the row visible in the study that was showing it so the count change
    // has an explanation instead of a member that quietly disappears.
    const wasMember = this.study()?.analysisIds.includes(id) ?? false;
    this.studiesService.pruneAnalysis(id);
    if (wasMember) {
      this.unavailable.update((ids) => (ids.includes(id) ? ids : [...ids, id]));
    }
  }

  private markLoadError(id: string): void {
    // Transient failures are not deletions: keep the member in the study and show
    // the row as failed rather than pruning user data on a network blip.
    this.memberErrors.update((current) => ({ ...current, [id]: 'Could not load this run.' }));
  }
}
