import { Injectable } from '@angular/core';
import { TransformationColumnDraft } from '../data-handling.models';
import {
  TransformationColumnConfig,
  TransformationDraftStatus,
  draftHasWork,
  emptyTransformationDraft,
  hasDuplicateColumnCodes,
  hasUnfinishedCategory,
  transformationConfigFor,
  transformationDraftStatus,
} from '../utils/transformation-draft.utils';

/**
 * The transformation stage's nominal-column drafts: the ordered card list and every
 * question asked of it (status, completeness, duplicate names, the store payload) plus
 * the in-place edits on a card's categories. Provided by the Data Handling panel, so
 * it lives exactly as long as the pipeline; the panel keeps the side effects (store
 * writes, statistics, rule builders, change detection).
 */
@Injectable()
export class TransformationDraftsService {
  /** The cards, in display and payload order. Never empty: the last card resets instead. */
  drafts: TransformationColumnDraft[] = [emptyTransformationDraft()];

  /** A card is on screen once chosen from the type chooser or once it holds any work. */
  isShown(draft: TransformationColumnDraft): boolean {
    return !!draft.chosen || draftHasWork(draft);
  }

  status(draft: TransformationColumnDraft): TransformationDraftStatus {
    return transformationDraftStatus(draft, this.drafts);
  }

  /** Card is incomplete or clashes: its primary slot says Apply, otherwise Close. */
  hasNewWork(draft: TransformationColumnDraft): boolean {
    const { label } = this.status(draft);
    return label === 'Not applied' || label === 'Duplicate name';
  }

  /** Drafts that already form a valid column config (code + at least one filtered rule). */
  configs(): TransformationColumnConfig[] {
    return this.drafts.map(transformationConfigFor).filter((config): config is TransformationColumnConfig => !!config);
  }

  /**
   * Payload for the shared store: the valid configs in order, keeping only the first
   * card of a duplicated name; null when there is none.
   */
  payload(): TransformationColumnConfig[] | null {
    const seen = new Set<string>();
    const configs = this.configs().filter((config) => {
      if (seen.has(config.code)) return false;
      seen.add(config.code);
      return true;
    });
    return configs.length ? configs : null;
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

  /** The type chooser reuses the blank model card before stacking another one. */
  firstHidden(): TransformationColumnDraft | undefined {
    return this.drafts.find((draft) => !this.isShown(draft));
  }

  /** Appends another (chosen) empty card. */
  add(): void {
    this.drafts.push({ ...emptyTransformationDraft(), chosen: true });
  }

  /**
   * Removes a card; the last one is reset to the blank, unchosen model card instead, so
   * the stage falls back to its type chooser. Returns false when there is no such card.
   */
  remove(id: number): boolean {
    const index = this.drafts.findIndex((draft) => draft.id === id);
    if (index < 0) return false;
    if (this.drafts.length === 1) this.drafts[0] = emptyTransformationDraft();
    else this.drafts.splice(index, 1);
    return true;
  }

  reset(): void {
    this.drafts = [emptyTransformationDraft()];
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
