import { isSameDataModel } from './data-model.utils';

describe('isSameDataModel', () => {
  it('compares code and version, versions as strings', () => {
    expect(isSameDataModel({ code: 'stroke', version: '3.7' }, { code: 'stroke', version: 3.7 as unknown as string })).toBe(true);
    expect(isSameDataModel({ code: 'stroke', version: '3.7' }, { code: 'stroke', version: '3.8' })).toBe(false);
    expect(isSameDataModel({ code: 'stroke' }, null)).toBe(false);
    expect(isSameDataModel(null, undefined)).toBe(false);
    expect(isSameDataModel(null, null)).toBe(true);
  });
});
