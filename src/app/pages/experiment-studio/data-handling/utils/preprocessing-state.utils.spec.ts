import { pendingOrDefault } from './preprocessing-state.utils';

describe('pendingOrDefault', () => {
  const stepDefault = () => 'default';

  it('prefers the edit', () => {
    expect(pendingOrDefault('edit', 'applied', stepDefault)).toBe('edit');
    expect(pendingOrDefault('edit', undefined, stepDefault)).toBe('edit');
  });

  it('falls back to the step default while nothing is applied', () => {
    expect(pendingOrDefault(undefined, undefined, stepDefault)).toBe('default');
  });

  it('has no pending rule when an applied rule was not edited', () => {
    expect(pendingOrDefault(undefined, 'applied', stepDefault)).toBeUndefined();
  });
});
