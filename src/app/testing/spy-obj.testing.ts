import type { MockedObject } from 'vitest';

/**
 * Vitest stand-in for `jasmine.createSpyObj`: one named `vi.fn()` per method,
 * plus plain properties (signals, values) copied as they are.
 */
export function createSpyObj<T = any>(
  baseName: string,
  methods: readonly string[],
  properties: object = {},
): MockedObject<T> {
  const spies = Object.fromEntries(methods.map((method) => [method, vi.fn().mockName(`${baseName}.${method}`)]));
  return { ...spies, ...properties } as unknown as MockedObject<T>;
}
