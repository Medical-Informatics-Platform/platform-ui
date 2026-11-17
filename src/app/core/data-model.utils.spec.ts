import {
  datasetLabelsOf,
  acceptedSlotStatTypes,
  acceptedVariableTypes,
  formatSlotStatTypes,
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

  describe('algorithm input slots', () => {
    const slot = (types: string[], stattypes?: string[]) => ({ types, ...(stattypes ? { stattypes } : {}) });

    it('matches categorical stattypes one-to-one', () => {
      const binaryOnly = slot(['int', 'text'], ['binary']);
      expect(specificationAcceptsVariableType(binaryOnly, 'binary')).toBe(true);
      expect(specificationAcceptsVariableType(binaryOnly, 'nominal')).toBe(false);
      expect(specificationAcceptsVariableType(binaryOnly, 'ordinal')).toBe(false);
      expect(specificationAcceptsVariableType(binaryOnly, 'continuous')).toBe(false);

      const ordinalOnly = slot(['int', 'text'], ['ordinal']);
      expect(specificationAcceptsVariableType(ordinalOnly, 'ordinal')).toBe(true);
      expect(specificationAcceptsVariableType(ordinalOnly, 'nominal')).toBe(false);
      expect(specificationAcceptsVariableType(ordinalOnly, 'binary')).toBe(false);

      const nominalOnly = slot(['int', 'text'], ['nominal']);
      expect(specificationAcceptsVariableType(nominalOnly, 'nominal')).toBe(true);
      expect(specificationAcceptsVariableType(nominalOnly, 'binary')).toBe(false);
    });

    it('accepts every categorical type only when the slot lists them all', () => {
      const anyCategorical = slot(['int', 'text'], ['nominal', 'ordinal', 'binary']);
      for (const type of ['nominal', 'ordinal', 'binary']) {
        expect(specificationAcceptsVariableType(anyCategorical, type)).toBe(true);
      }
      expect(specificationAcceptsVariableType(anyCategorical, 'continuous')).toBe(false);
      expect(specificationAcceptsVariableType(slot(['int', 'text'], ['nominal', 'binary']), 'ordinal')).toBe(false);
    });

    it('lets numerical stattypes take continuous and discrete, subject to the value types', () => {
      const numerical = slot(['real', 'int'], ['numerical']);
      expect(specificationAcceptsVariableType(numerical, 'continuous')).toBe(true);
      expect(specificationAcceptsVariableType(numerical, 'discrete')).toBe(true);
      expect(specificationAcceptsVariableType(numerical, 'binary')).toBe(false);
      expect(specificationAcceptsVariableType(slot(['real'], ['numerical']), 'discrete')).toBe(true);
      expect(specificationAcceptsVariableType(slot(['int'], ['numerical']), 'discrete')).toBe(true);
      expect(specificationAcceptsVariableType(slot(['int'], ['numerical']), 'continuous')).toBe(false);
    });

    it('reads a slot without stattypes by its value types, where text meant any categorical', () => {
      expect(specificationAcceptsVariableType(slot(['real']), 'continuous')).toBe(true);
      expect(specificationAcceptsVariableType(slot(['real']), 'discrete')).toBe(true);
      expect(specificationAcceptsVariableType(slot(['int']), 'continuous')).toBe(false);
      for (const type of ['nominal', 'ordinal', 'binary']) {
        expect(specificationAcceptsVariableType(slot(['text']), type)).toBe(true);
      }
      expect(specificationAcceptsVariableType(slot(['real', 'int']), 'nominal')).toBe(false);
      expect(acceptedSlotStatTypes(slot(['real', 'int', 'text']))).toEqual(['numerical', 'nominal', 'ordinal', 'binary']);
    });

    it('rejects legacy and unknown types', () => {
      for (const legacy of ['real', 'integer', 'int', 'text', 'boolean', '', undefined]) {
        expect(specificationAcceptsVariableType(slot(['real', 'text'], ['numerical', 'nominal']), legacy)).toBe(false);
      }
    });

    it('names what a slot takes in requirement messages', () => {
      expect(acceptedVariableTypes(slot(['int', 'text'], ['binary']))).toEqual(['binary']);
      expect(acceptedVariableTypes(slot(['real', 'int', 'text'], ['numerical', 'nominal', 'ordinal', 'binary']))).toEqual([
        'numerical',
        'nominal',
        'ordinal',
        'binary',
      ]);
      expect(acceptedVariableTypes(slot(['int'], ['numerical']))).toEqual(['discrete']);
      expect(acceptedVariableTypes(slot([]))).toEqual([]);
      expect(formatSlotStatTypes(['binary'])).toBe('binary');
      expect(formatSlotStatTypes(['nominal', 'binary'])).toBe('nominal or binary');
      expect(formatSlotStatTypes(['numerical', 'nominal', 'binary'])).toBe('numerical, nominal or binary');
    });
  });

  it('treats a categorical CDE without enumerations as free text Exaflow cannot analyse', () => {
    expect(isFreeTextCde({ type: 'nominal' })).toBe(true);
    expect(isFreeTextCde({ type: 'ordinal', enumerations: [] })).toBe(true);
    expect(isFreeTextCde({ type: 'nominal', enumerations: [{ code: 'M' }] })).toBe(false);
    expect(isFreeTextCde({ type: 'continuous' })).toBe(false);
    expect(isFreeTextCde(null)).toBe(false);
  });
});

describe('datasetLabelsOf', () => {
  it('maps numeric dataset codes to labels from the dataset list and the dataset CDE', () => {
    const labels = datasetLabelsOf({
      uuid: 'm',
      label: 'M',
      released: true,
      datasets: [{ code: '12', label: 'EDSD' }] as unknown as string[],
      groups: [
        {
          code: 'g',
          label: 'G',
          variables: [
            { code: 'dataset', label: 'Dataset', type: 'nominal', enumerations: [{ code: '12', label: 'Ignored' }, { code: '13', label: 'ADNI' }] },
          ],
        },
      ],
    } as any);

    expect([...labels]).toEqual([['12', 'EDSD'], ['13', 'ADNI']]);
  });

  it('is empty for a missing model or a plain list of dataset codes', () => {
    expect(datasetLabelsOf(null).size).toBe(0);
    expect(datasetLabelsOf({ uuid: 'm', label: 'M', released: true, datasets: ['12'] }).size).toBe(0);
  });
});
