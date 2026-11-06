import { HttpXsrfTokenExtractor, provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService, buildSignOutForm } from './auth.service';

describe('buildSignOutForm', () => {
  it('posts the token to the backend', () => {
    const form = buildSignOutForm('a-token');

    expect(form.method.toUpperCase()).toBe('POST');
    expect(form.getAttribute('action')).toBe('/services/logout');
    expect((form.elements.namedItem('_csrf') as HTMLInputElement).value).toBe('a-token');
  });
});

describe('AuthService.logout', () => {
  function setup(token: string | null) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: HttpXsrfTokenExtractor, useValue: { getToken: () => token } },
      ],
    });
    const service = TestBed.inject(AuthService);
    return {
      service,
      login: vi.spyOn(service, 'login').mockReturnValue(undefined),
      submit: vi.spyOn(HTMLFormElement.prototype, 'submit').mockReturnValue(undefined),
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('form[action="/services/logout"]').forEach((form) => form.remove());
  });

  it('submits the sign-out form when the token exists', () => {
    const { service, login, submit } = setup('a-token');

    service.logout();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(login).not.toHaveBeenCalled();
    expect(service.authState().status).toBe('unauthenticated');
  });

  it('goes to login instead of posting when the token is missing', () => {
    const { service, login, submit } = setup(null);

    service.logout();

    expect(submit).not.toHaveBeenCalled();
    expect(login).toHaveBeenCalledTimes(1);
  });
});
