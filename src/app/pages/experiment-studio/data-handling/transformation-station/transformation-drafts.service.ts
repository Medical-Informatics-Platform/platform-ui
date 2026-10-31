import { Injectable } from '@angular/core';
import { TransformationColumnDraft } from '../data-handling.models';
import {
  TransformationColumnConfig,
  draftHasWork,
  hasDuplicateColumnCodes,
  hasUnfinishedCategory,
  transformationConfigFor,
} from '../utils/transformation-draft.utils';

/**
 * The transformation stage's nominal-column drafts: one editable card per categorical
 * store step (keyed by the step id), every question asked of the list (completeness,
 * duplicate names, the valid configs) and the in-place edits on a card's categories.
 * Provided by the Data Handling panel, so it lives exactly as long as the pipeline; the
 * panel keeps the side effects (store writes, the per-card status that needs the store,
 * statistics, rule builders, change detection).
 */
@Injectable()
export class TransformationDraftsService {
  /** The cards, in store (creation) order. Empty until a nominal column is chosen. */
  drafts: TransformationColumnDraft[] = [];

  /** A card is on screen once chosen from the type chooser or once it holds any work. */
  isShown(draft: TransformationColumnDraft): boolean {
    return !!draft.chosen || draftHasWork(draft);
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

  reset(): void {
    this.drafts = [];
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
