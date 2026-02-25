import { mapAlgorithmResultEnums } from './algorithm-result-enum-mapper';

describe('mapAlgorithmResultEnums', () => {
  it('maps naive bayes classes using y-variable enum map', () => {
    const enumMaps = {
      diagnosis: {
        '0': 'Control',
        '1': 'Case',
      },
    };

    const mapped = mapAlgorithmResultEnums(
      'naive_bayes_gaussian',
      {
        classes: [0, 1],
        class_prior: [0.4, 0.6],
      },
      enumMaps,
      { y: 'diagnosis' }
    );

    expect(mapped.classes).toEqual(['Control', 'Case']);
  });
});
