import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AccountPageComponent } from './account-page.component';
import { AuthService } from '../../services/auth.service';
import { createSpyObj } from '../../testing/spy-obj.testing';
import { cliTokenSignInUrl } from './cli-token';

describe('AccountPageComponent', () => {
  const startUrl = window.location.pathname + window.location.search;
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sessionStorage.clear();
    history.replaceState(null, '', startUrl);
  });

  // offered: whether the backend has a Keycloak client for `mip login` (GET /services/auth-config).
  function render(offered = true) {
    const authService = createSpyObj<AuthService>('AuthService', ['logout'], {
      authState: signal({ status: 'authenticated', user: { fullname: 'Marie Curie', email: 'm@c.eu' } }),
    });
    TestBed.configureTestingModule({
      imports: [AccountPageComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authService },
      ],
    });
    const fixture = TestBed.createComponent(AccountPageComponent);
    const authConfig = TestBed.inject(HttpTestingController).expectOne('/services/auth-config');
    if (offered) {
      authConfig.flush({ issuer: 'https://idp.example/realms/MIP', clientId: 'mip-cli' });
    } else {
      authConfig.flush(null, { status: 404, statusText: 'Not Found' });
    }
    fixture.detectChanges();
    return fixture;
  }

  it('hides the remote access section when the platform does not offer it', () => {
    const el: HTMLElement = render(false).nativeElement;

    expect(el.querySelector('.remote-access')).toBeNull();
  });

  it('explains both ways to sign in and never sends users to the JupyterHub token page', () => {
    const el: HTMLElement = render().nativeElement;

    const text = el.querySelector('.remote-access')!.textContent!;
    expect(text).toContain('mip login --token');
    expect(text).toContain('MIP_API_TOKEN');
    expect(text).toContain('mip logout');
    expect(text).not.toContain('custom:mip-platform-token');
    expect(el.querySelector('a[href*="/hub/token"]')).toBeNull();
    expect(el.querySelector('.token-value')).toBeNull();
  });

  it('links to the Keycloak account page to end every computer\'s sign-in', () => {
    const link = (render().nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.account-link')!;

    expect(link.getAttribute('href')).toBe('https://idp.example/realms/MIP/account/applications');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener');
  });

  it('starts the token sign-in at Keycloak as the public client', async () => {
    const fixture = render();
    const redirect = vi.spyOn(fixture.componentInstance as unknown as { redirect: (url: string) => void }, 'redirect')
      .mockImplementation(() => {});

    (fixture.nativeElement.querySelector('.create-token-btn') as HTMLButtonElement).click();
    await fixture.whenStable();

    const url = new URL(redirect.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://idp.example/realms/MIP/protocol/openid-connect/auth');
    expect(url.searchParams.get('client_id')).toBe('mip-cli');
    expect(url.searchParams.get('redirect_uri')).toBe(`${window.location.origin}/account`);
  });

  it('shows the token once when Keycloak sends the browser back, and drops the code from the address', async () => {
    const config = { issuer: 'https://idp.example/realms/MIP', clientId: 'mip-cli' };
    const state = new URL(await cliTokenSignInUrl(config, `${window.location.origin}/account`)).searchParams.get('state')!;
    history.replaceState(null, '', `/account?code=one-time-code&state=${state}`);
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'a', refresh_token: 'offline-token' }), { status: 200 }),
    );

    const fixture = render();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.token-value').textContent).toContain('offline-token');
    });

    expect(TestBed.inject(Location).path()).toBe('/account');
    expect(sessionStorage.length).toBe(0);
  });

  it('drops a code it did not ask for from the address and says so, without exchanging it', async () => {
    history.replaceState(null, '', '/account?code=one-time-code&state=elsewhere');
    const fetchSpy = vi.spyOn(window, 'fetch');

    const fixture = render();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.token-error').textContent).toContain('not started on this page');
    });

    expect(TestBed.inject(Location).path()).toBe('/account');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows why the sign-in could not start and lets the user try again', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('no subtle crypto'));
    const fixture = render();
    const button = fixture.nativeElement.querySelector('.create-token-btn') as HTMLButtonElement;

    button.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.token-error').textContent).toContain('no subtle crypto');
    });
    expect(button.disabled).toBe(false);
  });

  it('enables the button again when the browser comes back from Keycloak through its back/forward cache', async () => {
    const fixture = render();
    const redirect = vi.spyOn(fixture.componentInstance as unknown as { redirect: (url: string) => void }, 'redirect')
      .mockImplementation(() => {});
    const button = fixture.nativeElement.querySelector('.create-token-btn') as HTMLButtonElement;

    button.click();
    await vi.waitFor(() => expect(redirect).toHaveBeenCalled());
    fixture.detectChanges();
    expect(button.disabled).toBe(true);

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    fixture.detectChanges();
    expect(button.disabled).toBe(false);
  });

  it('copies a setup snippet built from the current origin, with no real token', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const fixture = render();

    (fixture.nativeElement.querySelector('.snippet-copy-btn') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalledWith(
      `pip install mip-client\nexport MIP_URL=${window.location.origin}`,
    );
    expect(fixture.nativeElement.querySelector('.copy-status').textContent).toContain('Copied');
  });

  it('clears the copy status so the next copy is announced again', async () => {
    vi.useFakeTimers();
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const fixture = render();

    const page = fixture.componentInstance;
    await page.copy(page.setupSnippet, page.copyStatus);
    expect(page.copyStatus()).toBe('Copied');
    vi.advanceTimersByTime(2400);
    expect(page.copyStatus()).toBe('');
  });

  it('tells the user to copy by hand when the clipboard refuses', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    const fixture = render();

    (fixture.nativeElement.querySelector('.snippet-copy-btn') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.copy-status').textContent).toContain('Could not copy');
  });
});
