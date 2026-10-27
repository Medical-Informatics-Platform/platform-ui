import {
  isCategoricalVariableType,
  isFreeTextCde,
  isNumericalVariableType,
  specificationAcceptsVariableType,
} from './data-model.utils';

describe('CDE variable types', () => {
  it('classifies the five CDE types and rejects legacy ones', () => {
    expect(['continuous', 'discrete'].every(isNumericalVariableType)).toBe(true);
    expect(['nominal', 'ordinal', 'binary'].every(isCategoricalVariableType)).toBe(true);
    for (const legacy of ['real', 'integer', 'int', 'text']) {
      expect(isNumericalVariableType(legacy)).toBe(false);
      expect(isCategoricalVariableType(legacy)).toBe(false);
    }
  });

  it('maps CDE types onto algorithm specification input types', () => {
    expect(specificationAcceptsVariableType(['real'], 'continuous')).toBe(true);
    expect(specificationAcceptsVariableType(['real'], 'discrete')).toBe(true);
    expect(specificationAcceptsVariableType(['int'], 'discrete')).toBe(true);
    expect(specificationAcceptsVariableType(['int'], 'continuous')).toBe(false);
    expect(specificationAcceptsVariableType(['text'], 'ordinal')).toBe(true);
    expect(specificationAcceptsVariableType(['text'], 'binary')).toBe(true);
    expect(specificationAcceptsVariableType(['real', 'int'], 'nominal')).toBe(false);
    expect(specificationAcceptsVariableType(['real'], 'real')).toBe(false);
  });

  it('treats a categorical CDE without enumerations as free text Exaflow cannot analyse', () => {
    expect(isFreeTextCde({ type: 'nominal' })).toBe(true);
    expect(isFreeTextCde({ type: 'ordinal', enumerations: [] })).toBe(true);
    expect(isFreeTextCde({ type: 'nominal', enumerations: [{ code: 'M' }] })).toBe(false);
    expect(isFreeTextCde({ type: 'continuous' })).toBe(false);
    expect(isFreeTextCde(null)).toBe(false);
  });
});
