import { newStepId } from '../../../../core/transformation-steps.utils';
import { TransformationColumnDraft } from '../data-handling.models';

/** A blank "Create new categorical column" card, open on its editor. Its id is the store step id. */
export function emptyTransformationDraft(id = newStepId()): TransformationColumnDraft {
  return { id, code: '', defaultEnumeration: '', rules: [], open: true, openRuleIndex: null };
}
