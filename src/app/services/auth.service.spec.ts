import { buildSignOutForm } from './auth.service';

describe('buildSignOutForm', () => {
  it('posts to the backend with the XSRF-TOKEN cookie value', () => {
    const form = buildSignOutForm('_xsrf=hub; XSRF-TOKEN=a%2Fb-c; other=1');

    expect(form.method.toUpperCase()).toBe('POST');
    expect(form.getAttribute('action')).toBe('/services/logout');
    expect((form.elements.namedItem('_csrf') as HTMLInputElement).value).toBe('a/b-c');
  });

  it('does not take the token from a cookie whose name only ends the same', () => {
    expect((buildSignOutForm('NOT-XSRF-TOKEN=x').elements.namedItem('_csrf') as HTMLInputElement).value).toBe('');
  });
});
