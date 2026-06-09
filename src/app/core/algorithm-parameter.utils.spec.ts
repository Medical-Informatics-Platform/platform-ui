import {
  omitEmptyOptionalParameters,
  optionBindingValue,
  serializeAlgorithmParameterValue,
} from './algorithm-parameter.utils';

describe('algorithm-parameter.utils', () => {
  it('binds option values as string codes', () => {
    expect(optionBindingValue({ code: 1, label: 'yes' })).toBe('1');
    expect(optionBindingValue({ code: 'yes', label: 'Yes' })).toBe('yes');
  });

  it('serializes select values to string codes using option metadata', () => {
    const field = {
      key: 'positive_class',
      type: 'select',
      options: [
        { code: '0', label: 'no' },
        { code: '1', label: 'yes' },
        { code: '9', label: 'unknown' },
      ],
    };

    expect(serializeAlgorithmParameterValue('yes', field)).toBe('1');
    expect(serializeAlgorithmParameterValue(1, field)).toBe('1');
    expect(serializeAlgorithmParameterValue('unknown', field)).toBe('9');
  });

  it('keeps positive_class as a string code without catalog options', () => {
    expect(
      serializeAlgorithmParameterValue(1, { key: 'positive_class', type: 'select' })
    ).toBe('1');
  });

  it('omits empty optional parameters from the request payload', () => {
    const result = omitEmptyOptionalParameters(
      {
        event_var: 'procedure',
        positive_class: null,
        alpha: 0.05,
      },
      [
        { key: 'event_var', required: true },
        { key: 'positive_class', required: false },
        { key: 'alpha', required: false },
      ]
    );

    expect(result['positive_class']).toBeUndefined();
    expect(result['event_var']).toBe('procedure');
    expect(result['alpha']).toBe(0.05);
  });

  it('keeps empty required positive_class in the request payload', () => {
    const result = omitEmptyOptionalParameters(
      {
        event_var: 'procedure',
        positive_class: null,
      },
      [
        { key: 'event_var', required: true },
        { key: 'positive_class', required: true },
      ]
    );

    expect(result['positive_class']).toBeNull();
    expect(result['event_var']).toBe('procedure');
  });
});
