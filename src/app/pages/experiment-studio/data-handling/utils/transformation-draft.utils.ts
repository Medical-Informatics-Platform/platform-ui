import { TransformationColumnDraft } from '../data-handling.models';

let transformationDraftSeq = 0;

/** Ids are unique per page load; they key the stage's cards and their template tracking. */
export function nextTransformationDraftId(): number {
  return ++transformationDraftSeq;
}

/** A blank "Create new categorical column" card with a fresh id, open on its editor. */
export function emptyTransformationDraft(): TransformationColumnDraft {
  return { id: nextTransformationDraftId(), code: '', defaultEnumeration: '', rules: [], open: true, openRuleIndex: null };
}
