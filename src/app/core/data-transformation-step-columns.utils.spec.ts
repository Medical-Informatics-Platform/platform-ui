import { describe, expect, it } from 'vitest';
import { stepColumnEffect } from './data-transformation-step-columns.utils';

const sources = new Map([
  ['age', { code: 'age', label: 'Age' }],
  ['sex', { code: 'sex', label: 'Sex', enumerations: [{ code: 'M', label: 'Male' }, { code: 'F', label: 'Female' }, { code: 'X', label: 'Other' }] }],
]);

describe('stepColumnEffect', () => {
  it('names indicator columns after the variable and the suffix, with the engine default', () => {
    expect(stepColumnEffect('missing_indicator', { variables: ['age'] }, sources).created)
      .toEqual([{ code: 'age_missing', label: 'Age (missing)' }]);
    expect(stepColumnEffect('missing_indicator', { variables: ['age'], suffix: '_na' }, sources).created[0].code).toBe('age_na');
  });

  it('adds outlier flag columns only for the flag action', () => {
    const strategies = { age: 'zscore' };
    expect(stepColumnEffect('outlier_detector', { strategies }, sources).created).toEqual([{ code: 'age_outlier', label: 'Age (outlier)' }]);
    expect(stepColumnEffect('outlier_detector', { strategies, action: 'flag', suffix: '_o' }, sources).created[0].code).toBe('age_o');
    expect(stepColumnEffect('outlier_detector', { strategies, action: 'drop' }, sources).created).toEqual([]);
    expect(stepColumnEffect('outlier_detector', { strategies, action: 'set_missing' }, sources).created).toEqual([]);
  });

  it('one-hot encodes sorted levels, dropping the reference level and the original by default', () => {
    const effect = stepColumnEffect('one_hot_encoder', { variables: ['sex'] }, sources);
    expect(effect.created.map((c) => c.code)).toEqual(['sex_M', 'sex_X']);
    expect(effect.created[0].label).toBe('Sex: Male');
    expect(effect.dropped).toEqual(['sex']);
  });

  it('keeps every level and the original when asked to', () => {
    const effect = stepColumnEffect('one_hot_encoder', { variables: ['sex'], drop_first: false, drop_original: false }, sources);
    expect(effect.created.map((c) => c.code)).toEqual(['sex_F', 'sex_M', 'sex_X']);
    expect(effect.dropped).toEqual([]);
  });

  it('has no column effect for other steps', () => {
    expect(stepColumnEffect('global_winsorizer', { variables: ['age'] }, sources)).toEqual({ created: [], dropped: [] });
  });
});
