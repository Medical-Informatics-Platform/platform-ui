import { AlgorithmAvailabilityDetail } from '../../../../models/algorithm-definition.model';
import {
  availabilityRequirementText,
  formatAvailabilityMessage,
  needsRequirementText,
} from './algorithm-availability-text.utils';

const detail = (overrides: Partial<AlgorithmAvailabilityDetail>): AlgorithmAvailabilityDetail => ({
  role: 'y',
  label: 'Outcome',
  selectedCount: 0,
  minCount: 1,
  maxCount: 1,
  required: true,
  types: [],
  stattypes: [],
  messages: [],
  satisfied: true,
  ...overrides,
});

describe('algorithm availability text', () => {
  it('words outcome needs with an article and the type family', () => {
    expect(needsRequirementText(detail({ types: ['real', 'int'] }))).toBe('Needs a numerical outcome');
    expect(needsRequirementText(detail({ types: ['ordinal'] }))).toBe('Needs a categorical outcome');
    expect(needsRequirementText(detail({ types: ['other'] }))).toBe('Needs an other outcome');
    expect(needsRequirementText(detail({ minCount: 2 }))).toBe('Needs at least 2 outcomes');
    expect(needsRequirementText(detail({ minCount: 0, required: false }))).toBe('No outcome needed');
  });

  it('words predictor needs by count', () => {
    expect(needsRequirementText(detail({ role: 'x', minCount: 2, types: ['nominal'] }))).toBe('At least 2 categorical predictors');
    expect(needsRequirementText(detail({ role: 'x', minCount: 0, maxCount: 3 }))).toBe('Up to 3 predictor');
    expect(needsRequirementText(detail({ role: 'x', minCount: 0, maxCount: null }))).toBe('Predictors optional');
  });

  it('lists count, selection and display types in tooltip requirements', () => {
    expect(availabilityRequirementText(detail({ minCount: 1, maxCount: 1, selectedCount: 0, types: ['text', 'integer', 'text'] })))
      .toBe('Outcome: exactly 1, selected 0 • type: nominal, int');
    expect(availabilityRequirementText(detail({ types: [] }))).toBe('Outcome: exactly 1, selected 0');
  });

  it('rewrites backend type lists in availability messages', () => {
    expect(formatAvailabilityMessage('Outcome type must be one of text, polynominal. Other text.'))
      .toBe('Outcome type must be one of nominal. Other text.');
    expect(formatAvailabilityMessage('Outcome needs at least 2, selected 1.')).toBe('Outcome needs at least 2, selected 1.');
  });
});
