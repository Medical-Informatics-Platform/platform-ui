import { isRoutePath } from './route-path.utils';

describe('isRoutePath', () => {
  it('matches the route and its nested paths, ignoring query and fragment, without matching siblings', () => {
    expect(isRoutePath('/notebook', '/notebook')).toBe(true);
    expect(isRoutePath('/notebook/launch', '/notebook')).toBe(true);
    expect(isRoutePath('/notebook?session=1#top', '/notebook')).toBe(true);
    expect(isRoutePath('/analyses?analysis=7', '/notebook')).toBe(false);
    expect(isRoutePath('/notebookish', '/notebook')).toBe(false);
    expect(isRoutePath('/analyses-dashboard', '/analyses')).toBe(false);
    expect(isRoutePath('/analyses-dashboard', '/analyses-dashboard')).toBe(true);
  });
});
