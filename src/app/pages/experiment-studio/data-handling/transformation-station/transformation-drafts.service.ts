import { Injectable, inject, signal } from '@angular/core';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { collectVariableCodes } from '../../../../core/variable-availability.utils';
import {
  CreatorName,
  TransformationStep,
  newStepId,
  stepOutputNames,
} from '../../../../core/transformation-steps.utils';
import { StationStatus } from '../../shared/station-card/station-card.component';
import { TransformationColumnDraft } from '../data-handling.models';
import {
  CREATOR_CHOOSER_COPY,
  TransformationColumnConfig,
  TransformationDraftStatus,
  draftHasWork,
  emptyTransformationDraft,
  hasDuplicateColumnCodes,
  hasUnfinishedCategory,
  transformationConfigFor,
} from '../utils/transformation-draft.utils';

const NAME_TAKEN = 'Name already used';

/**
 * The transformation stage's cards: the ordered steps of the shared store (one per derived
 * column, any creator) and, for each nominal one, its draft with the rules being edited.
 * Answers every question about them (status, titles, name clashes, what may be removed, the
 * store payload) and holds the in-place edits on a card's categories. Provided by the Data
 * Handling panel, so it lives exactly as long as the pipeline; the panel keeps the side
 * effects (store writes, statistics, rule builders, change detection).
 */
@Injectable()
export class TransformationDraftsService {
  private readonly studio = inject(ExperimentStudioService);

  /** The nominal-column drafts, in display order; each id is its store step id. */
  drafts: TransformationColumnDraft[] = [];
  /** Folded/open state per store step id (nominal drafts also keep `open`). */
  readonly cardOpenState = signal<Record<string, boolean>>({});

  /** Ordered cards from the store: one station per transformation step. */
  cards(): TransformationStep[] {
    return this.studio.appliedTransformations();
  }

  /** Creator types the deployment exposes in `/services/specifications/preprocessing`. */
  availableCreators(): CreatorName[] {
    return this.studio.availableCreatorNames();
  }

  draftFor(stepId: string): TransformationColumnDraft | undefined {
    return this.drafts.find((draft) => draft.id === stepId);
  }

  /** A card is on screen once chosen from the type chooser or once it holds any work. */
  isShown(draft: TransformationColumnDraft): boolean {
    return !!draft.chosen || draftHasWork(draft);
  }

  /**
   * Why a nominal card cannot be written to the store: a name collision, or a later step
   * still reads the column the edit would drop (renamed, or left incomplete). Mirrors the
   * refusal in `upsertTransformation`, so a refused edit is shown on the card instead of lost.
   */
  writeProblem(draft: TransformationColumnDraft): string | null {
    const code = draft.code.trim();
    const nameError = code ? this.columnNameError(draft.id, code) : null;
    if (nameError || transformationConfigFor(draft)) return nameError;
    const inUse = this.studio.outputsInUse(draft.id, []);
    return inUse.length ? `Used by a later step: ${inUse.join(', ')}` : null;
  }

  /** The reason `name` cannot be the output of step `stepId`, or null. */
  columnNameError(stepId: string, name: string): string | null {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (new Set(collectVariableCodes(this.studio.selectedDataModel())).has(trimmed)) return NAME_TAKEN;
    for (const step of this.cards()) {
      // Ignore empty/incomplete placeholders — only real outputs collide.
      if (step.id !== stepId && stepOutputNames(step).includes(trimmed)) return NAME_TAKEN;
    }
    // Among local drafts, the first occurrence of a name wins; later cards show the error
    // and never overwrite the store.
    for (const draft of this.drafts) {
      if (draft.id === stepId) break;
      if (draft.code.trim() === trimmed) return NAME_TAKEN;
    }
    // A nominal card writes one column: renaming it must not orphan a later step that reads it.
    if (this.draftFor(stepId)) {
      const inUse = this.studio.outputsInUse(stepId, [trimmed]);
      if (inUse.length) return `Used by a later step: ${inUse.join(', ')}`;
    }
    return null;
  }

  /** Per-card chip: Applied only when every category is complete and the card can be written. */
  status(draft: TransformationColumnDraft): TransformationDraftStatus {
    const problem = this.writeProblem(draft);
    if (problem) return { label: problem === NAME_TAKEN ? 'Duplicate name' : 'Column in use', tone: 'pending' };
    if (!hasUnfinishedCategory(draft) && transformationConfigFor(draft)) return { label: 'Applied', tone: 'applied' };
    if (draftHasWork(draft)) return { label: 'Not applied', tone: 'pending' };
    return { label: 'Not set', tone: 'default' };
  }

  /** Card is incomplete or clashes: its primary slot says Apply, otherwise Close. */
  hasNewWork(draft: TransformationColumnDraft): boolean {
    const { label } = this.status(draft);
    return label === 'Not applied' || label === 'Duplicate name';
  }

  /** The chip of any card, whatever its creator. */
  stepStatus(step: TransformationStep): { label: string; tone: StationStatus } {
    if (!this.isCreatorAvailable(step.name)) return { label: 'Unavailable', tone: 'pending' };
    if (step.name === 'categorical_column_creator') {
      const draft = this.draftFor(step.id);
      return draft ? this.status(draft) : { label: 'Not set', tone: 'default' };
    }
    return stepOutputNames(step).length ? { label: 'Applied', tone: 'applied' } : { label: 'Not set', tone: 'default' };
  }

  stepTitle(step: TransformationStep): string {
    const outputs = stepOutputNames(step);
    if (step.name === 'categorical_column_creator') {
      const code = this.draftFor(step.id)?.code.trim() || outputs[0] || '';
      return code ? `Nominal column · ${code}` : 'Nominal column';
    }
    const { title } = CREATOR_CHOOSER_COPY[step.name];
    return outputs.length ? `${title} · ${outputs[0]}` : title;
  }

  /**
   * True when the editor should render for this creator. Empty specs before the catalog
   * loads are not "unavailable" — only loaded && missing means the deployment placeholder.
   */
  isCreatorAvailable(name: CreatorName): boolean {
    return !this.studio.catalogLoaded() || this.studio.hasPreprocessingSpec(name);
  }

  canRemove(stepId: string): boolean {
    return this.studio.transformationDependents(stepId).length === 0;
  }

  removeTooltip(stepId: string): string {
    const dependents = this.studio.transformationDependents(stepId);
    if (!dependents.length) return 'Remove column';
    const names = dependents.flatMap(stepOutputNames);
    return names.length ? `Used by ${names.join(', ')}` : 'Used by a later step';
  }

  isCardOpen(stepId: string): boolean {
    return this.cardOpenState()[stepId] ?? true;
  }

  setCardOpen(stepId: string, open: boolean): void {
    this.cardOpenState.update((state) => ({ ...state, [stepId]: open }));
  }

  /** Drafts that already form a valid column config (name + at least one filtered rule). */
  configs(): TransformationColumnConfig[] {
    return this.drafts.map(transformationConfigFor).filter((config): config is TransformationColumnConfig => !!config);
  }

  get hasDuplicateCodes(): boolean {
    return hasDuplicateColumnCodes(this.drafts);
  }

  get hasAnyWork(): boolean {
    return this.drafts.some(draftHasWork);
  }

  /** A touched card that cannot be saved as it is, or a name clash. */
  get hasPendingChange(): boolean {
    if (this.hasDuplicateCodes) return true;
    return this.drafts.some((draft) => draftHasWork(draft) && (hasUnfinishedCategory(draft) || !transformationConfigFor(draft)));
  }

  /** True when a named category on any named card is still missing its rule. */
  get rulesNeedFilters(): boolean {
    return this.drafts.some((draft) => {
      if (!draft.code.trim()) return false;
      const named = draft.rules.filter((rule) => rule.value.trim().length > 0);
      return named.length > 0 && named.some((rule) => !rule.filter);
    });
  }

  /**
   * Type chooser row: appends a new store step (fresh id) and opens its card. A nominal card
   * also gets a draft for its rule editor. Returns the new step id.
   */
  choose(name: CreatorName): string {
    const id = newStepId();
    this.studio.upsertTransformation({ id, name, parameters: {} });
    if (name === 'categorical_column_creator') {
      this.drafts = [...this.drafts.filter((draft) => this.isShown(draft)), { ...emptyTransformationDraft(id), chosen: true, open: true }];
    }
    this.setCardOpen(id, true);
    return id;
  }

  /** Removes a step and its draft. Returns false while a later step still reads its columns. */
  remove(stepId: string): boolean {
    if (!this.canRemove(stepId)) return false;
    this.studio.removeTransformation(stepId);
    this.drafts = this.drafts.filter((draft) => draft.id !== stepId);
    this.cardOpenState.update(({ [stepId]: _removed, ...rest }) => rest);
    return true;
  }

  reset(): void {
    this.studio.clearTransformations();
    this.drafts = [];
    this.cardOpenState.set({});
  }

  /** Appends an empty category and opens it; returns its index. */
  addRule(draft: TransformationColumnDraft): number {
    draft.rules.push({ value: '', filter: null });
    draft.openRuleIndex = draft.rules.length - 1;
    return draft.openRuleIndex;
  }

  /** Removes a category, keeping the open editor on the same category when it survives. */
  removeRule(draft: TransformationColumnDraft, index: number): void {
    draft.rules.splice(index, 1);
    if (draft.openRuleIndex === index) draft.openRuleIndex = null;
    else if (draft.openRuleIndex != null && draft.openRuleIndex > index) draft.openRuleIndex -= 1;
  }
}
