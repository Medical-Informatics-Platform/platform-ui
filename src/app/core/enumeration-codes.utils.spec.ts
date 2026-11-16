import { describe, expect, it } from 'vitest';
import {
  enumerationCodeAsInteger,
  enumerationCodeIssues,
  isIntegerCoded,
  legacyCdeShapeIssues,
  normalizeCdeVariable,
  normalizeDataModelCdes,
  normalizeEnumerationCode,
  requiresIntegerEnumerationCodes,
  summarizeCdeMetadataIssues,
} from './enumeration-codes.utils';

const levels = (...codes: unknown[]) => codes.map((code) => ({ code, label: `Level ${code}` }));

describe('enumeration codes', () => {
  it('holds a code as the string of an integer', () => {
    expect(normalizeEnumerationCode(1)).toBe('1');
    expect(normalizeEnumerationCode(' 2 ')).toBe('2');
    expect(normalizeEnumerationCode(null)).toBe('');
    expect(enumerationCodeAsInteger('12')).toBe(12);
    expect(enumerationCodeAsInteger('0')).toBe(0);
    expect(enumerationCodeAsInteger('F')).toBeNull();
    expect(enumerationCodeAsInteger('1.5')).toBeNull();
  });

  describe('enumerationCodeIssues', () => {
    it.each(['discrete', 'nominal', 'ordinal', 'binary'])('accepts integer codes on a %s variable', (type) => {
      const codes = type === 'binary' ? [0, 1] : [1, 2, 3];
      expect(enumerationCodeIssues({ code: 'v', type, enumerations: levels(...codes) })).toEqual([]);
    });

    it.each(['nominal', 'ordinal', 'binary', 'discrete'])('flags non-integer codes on a %s variable', (type) => {
      const issues = enumerationCodeIssues({ code: 'sex', type, enumerations: levels('M', 'F') });
      expect(issues[0]).toContain('must be integers');
      expect(issues[0]).toContain('"M"');
    });

    it('requires exactly the codes 0 and 1 for a binary variable', () => {
      expect(enumerationCodeIssues({ code: 'b', type: 'binary', enumerations: levels('0', '1') })).toEqual([]);
      expect(enumerationCodeIssues({ code: 'b', type: 'binary', enumerations: levels(1, 2) })).toEqual([
        'binary enumeration codes must be 0 and 1, got "2"',
      ]);
    });

    it('lets nominal and ordinal codes be any integers', () => {
      expect(enumerationCodeIssues({ code: 'n', type: 'nominal', enumerations: levels(4, 7) })).toEqual([]);
    });

    it('flags duplicate codes', () => {
      expect(enumerationCodeIssues({ code: 'n', type: 'nominal', enumerations: levels('1', 1) })[0]).toContain('duplicate');
    });

    it('leaves continuous variables, created columns and free-text identifiers alone', () => {
      expect(enumerationCodeIssues({ code: 'age', type: 'continuous' })).toEqual([]);
      expect(
        enumerationCodeIssues({ code: 'cluster', type: 'nominal', isCreatedColumn: true, enumerations: levels('cluster_1') })
      ).toEqual([]);
      expect(enumerationCodeIssues({ code: 'visitid', type: 'nominal', enumerations: levels('BL', 'FL1') })).toEqual([]);
      expect(requiresIntegerEnumerationCodes({ code: 'sex', type: 'binary' })).toBe(true);
      expect(requiresIntegerEnumerationCodes({ code: 'age', type: 'continuous' })).toBe(false);
    });
  });

  describe('isIntegerCoded', () => {
    it('is true for a categorical CDE whose codes are all integers', () => {
      expect(isIntegerCoded({ code: 'sex', type: 'binary', enumerations: levels('0', '1') })).toBe(true);
      expect(isIntegerCoded({ code: 'dataset', type: 'nominal', enumerations: levels(1, 2) })).toBe(true);
    });

    it('is false for text codes, missing enumerations, numerical types and created columns', () => {
      expect(isIntegerCoded({ code: 'sex', type: 'nominal', enumerations: levels('M', 'F') })).toBe(false);
      expect(isIntegerCoded({ code: 'free', type: 'nominal', enumerations: [] })).toBe(false);
      expect(isIntegerCoded({ code: 'age', type: 'discrete', enumerations: levels(1) })).toBe(false);
      expect(isIntegerCoded({ code: 'c', type: 'nominal', isCreatedColumn: true, enumerations: levels(1) })).toBe(false);
    });
  });

  describe('legacy metadata', () => {
    it('names retired fields and types', () => {
      expect(legacyCdeShapeIssues({ type: 'nominal', sql_type: 'text', is_categorical: 'true' })).toEqual([
        'has the retired field sql_type',
        'has the retired field is_categorical',
      ]);
      expect(legacyCdeShapeIssues({ type: 'real' })).toEqual(['has the retired type "real"']);
      expect(legacyCdeShapeIssues({ type: 'binary' })).toEqual([]);
    });

    it('maps retired types to the current ones and drops the retired fields', () => {
      const real = normalizeCdeVariable({ label: 'Age', code: 'age', type: 'real', sql_type: 'real' });
      expect(real.variable).toEqual({ label: 'Age', code: 'age', type: 'continuous' });
      expect(real.issues).toHaveLength(2);

      const integer = normalizeCdeVariable({ label: 'Score', code: 'score', type: 'integer' });
      expect(integer.variable.type).toBe('discrete');

      const categorical = normalizeCdeVariable({ label: 'Sex', code: 'sex', is_categorical: 'true' });
      expect((categorical.variable as { type?: string }).type).toBe('nominal');
    });

    it('converts numeric codes to strings and keeps contract violations as received', () => {
      const ok = normalizeCdeVariable({ label: 'Sex', code: 'sex', type: 'binary', enumerations: levels(0, 1) as never });
      expect(ok.variable.enumerations).toEqual([
        { code: '0', label: 'Level 0' },
        { code: '1', label: 'Level 1' },
      ]);
      expect(ok.issues).toEqual([]);

      const bad = normalizeCdeVariable({ label: 'Sex', code: 'sex', type: 'nominal', enumerations: levels('M', 'F') as never });
      expect((bad.variable.enumerations as { code: string }[]).map((entry) => entry.code)).toEqual(['M', 'F']);
      expect(bad.issues).toHaveLength(1);
    });

    it('accepts a code-to-label map of enumerations', () => {
      const result = normalizeCdeVariable({
        label: 'Sex',
        code: 'sex',
        type: 'binary',
        enumerations: { '0': 'Male', '1': 'Female' } as never,
      });
      expect(result.variable.enumerations).toEqual([
        { code: '0', label: 'Male' },
        { code: '1', label: 'Female' },
      ]);
    });
  });

  describe('normalizeDataModelCdes', () => {
    const model = {
      uuid: 'u',
      label: 'Dementia',
      code: 'dementia',
      version: '1',
      released: true,
      datasets: [{ code: 1, label: 'CHUV' }] as never,
      variables: [{ label: 'Age', code: 'age', type: 'real' }],
      groups: [
        {
          label: 'Demographics',
          variables: [{ label: 'Sex', code: 'sex', type: 'binary', enumerations: levels('M', 'F') as never }],
        },
      ],
    };

    it('walks nested groups and reports each variable with its data model', () => {
      const { model: normalized, issues } = normalizeDataModelCdes(model);
      expect(normalized.variables?.[0].type).toBe('continuous');
      expect(normalized.datasets).toEqual([{ code: '1', label: 'CHUV' }]);
      expect(issues.map((issue) => `${issue.dataModel} ${issue.variable}`)).toEqual([
        'dementia:1 age',
        'dementia:1 sex',
      ]);
      expect(model.variables[0].type).toBe('real');
    });

    it('summarizes the first issue and how many more there are', () => {
      const { issues } = normalizeDataModelCdes(model);
      const text = summarizeCdeMetadataIssues(issues);
      expect(text).toContain('dementia:1 · age has the retired type "real" (and 1 more)');
      expect(summarizeCdeMetadataIssues([])).toBe('');
    });
  });
});
