import { createDefaultOutlierRule } from '../../../../core/outlier-rules';
import { PreprocessingStateService } from './preprocessing-state.service';

describe('PreprocessingStateService', () => {
  let state: PreprocessingStateService;
  beforeEach(() => (state = new PreprocessingStateService()));

  it('creates the pending rules as step defaults on first read and keeps them', () => {
    const rule = state.missingRule('age');
    expect(rule).toEqual({ variableCode: 'age', action: 'drop', value: '', enabled: true });
    expect(state.missingRule('age')).toBe(rule);
    const outlier = state.outlierRule('age');
    expect(outlier).toEqual(createDefaultOutlierRule('age', false));
    expect(state.outlierRule('age')).toBe(outlier);
  });

  it('does not count sitting on the implicit missing-values default as a change', () => {
    expect(state.missingHasPendingChange('age')).toBe(false);
    expect(state.isUsingDefaultMissing('age')).toBe(true);
    state.pendingMissing['age'] = { variableCode: 'age', action: 'mean', value: '', enabled: true };
    expect(state.missingHasPendingChange('age')).toBe(true);
    expect(state.isUsingDefaultMissing('age')).toBe(false);
  });

  it('compares edits against the applied rule once one is applied', () => {
    state.appliedMissing['age'] = { variableCode: 'age', action: 'mean', value: '', enabled: true };
    expect(state.hasAppliedMissing('age')).toBe(true);
    // loading hydrates the pending map from the applied one
    state.pendingMissing['age'] = { ...state.appliedMissing['age'] };
    expect(state.missingHasPendingChange('age')).toBe(false);
    state.pendingMissing['age'] = { variableCode: 'age', action: 'drop', value: '', enabled: true };
    expect(state.missingHasPendingChange('age')).toBe(true);
    state.appliedMissing['sex'] = { variableCode: 'sex', action: 'no_action', value: '', enabled: true };
    expect(state.hasAppliedMissing('sex')).toBe(false);
  });

  it('treats an outlier edit as pending until it matches the applied rule', () => {
    expect(state.outlierHasPendingChange('age')).toBe(false);
    state.pendingOutlier = { age: { ...createDefaultOutlierRule('age', false), enabled: true } };
    expect(state.outlierHasPendingChange('age')).toBe(true);
    state.appliedOutlier = { age: { ...state.pendingOutlier['age'] } };
    expect(state.outlierHasPendingChange('age')).toBe(false);
    expect(state.hasAppliedOutlier('age')).toBe(true);
  });
});
