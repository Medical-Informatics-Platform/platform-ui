import { vi } from 'vitest';
import type { PreprocessingGroup, VariableRow } from '../data-handling.models';
import { cloneMissingRules, defaultMissingRule, groupPreprocessingVariables, isDefaultMissingRule, pendingOrDefault, serializeMissingRule } from './preprocessing-state.utils';

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

describe('groupPreprocessingVariables', () => {
  const row = (code: string) => ({ code }) as VariableRow;

  it('groups in display order, keeps the variables in order and drops empty groups', () => {
    const states: Record<string, PreprocessingGroup['key']> = { a: 'not-applied', b: 'pending', c: 'not-applied', d: 'applied' };
    const groups = groupPreprocessingVariables([row('a'), row('b'), row('c'), row('d')], (variable) => states[variable.code]);
    expect(groups.map((group) => [group.key, group.title, group.variables.map((variable) => variable.code)])).toEqual([
      ['pending', 'Pending', ['b']],
      ['applied', 'Applied preprocessing', ['d']],
      ['not-applied', 'Not applied', ['a', 'c']],
    ]);
  });

  it('asks for each state once and returns no groups for no variables', () => {
    const stateOf = vi.fn(() => 'default' as const);
    expect(groupPreprocessingVariables([row('a'), row('b')], stateOf)[0].title).toBe('Default (NA removal)');
    expect(stateOf).toHaveBeenCalledTimes(2);
    expect(groupPreprocessingVariables([], stateOf)).toEqual([]);
  });
});

describe('missing-values rule helpers', () => {
  it('recognises the step default and compares rules by action, value and enabled', () => {
    expect(isDefaultMissingRule(defaultMissingRule('a'))).toBe(true);
    expect(isDefaultMissingRule({ ...defaultMissingRule('a'), value: '0' })).toBe(false);
    expect(isDefaultMissingRule(undefined)).toBe(false);
    expect(serializeMissingRule(undefined)).toBe(serializeMissingRule({ variableCode: 'b', action: 'no_action', value: '', enabled: false }));
    expect(serializeMissingRule(defaultMissingRule('a'))).toBe(serializeMissingRule(defaultMissingRule('b')));
  });

  it('clones each rule', () => {
    const rules = { a: defaultMissingRule('a') };
    const copy = cloneMissingRules(rules);
    expect(copy).toEqual(rules);
    expect(copy['a']).not.toBe(rules['a']);
  });
});
