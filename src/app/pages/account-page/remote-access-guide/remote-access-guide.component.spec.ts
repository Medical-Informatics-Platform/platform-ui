import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RemoteAccessGuideComponent } from './remote-access-guide.component';

describe('RemoteAccessGuideComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // offered: whether the backend has a Keycloak client for `mip login` (GET /services/auth-config).
  function render(offered = true) {
    TestBed.configureTestingModule({
      imports: [RemoteAccessGuideComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(RemoteAccessGuideComponent);
    const authConfig = TestBed.inject(HttpTestingController).expectOne('/services/auth-config');
    if (offered) {
      authConfig.flush({ issuer: 'https://idp.example/realms/MIP', clientId: 'mip-cli' });
    } else {
      authConfig.flush(null, { status: 404, statusText: 'Not Found' });
    }
    fixture.componentInstance.platform.set('linux');
    fixture.detectChanges();
    return fixture;
  }

  it('says so when the platform does not offer remote access', () => {
    const el: HTMLElement = render(false).nativeElement;

    expect(el.querySelector('.guide-steps')).toBeNull();
    expect(el.textContent).toContain('does not offer access from your own computer');
  });

  it('explains both ways to sign in and sends the user to the profile page for a token', () => {
    const el: HTMLElement = render().nativeElement;

    const text = el.querySelector('.guide-steps')!.textContent!;
    expect(text).toContain('mip login --token');
    expect(text).toContain('MIP_API_TOKEN');
    expect(text).toContain('mip.Client.from_env()');
    expect(el.textContent).toContain('mip logout');
    expect(el.querySelector('.remote-option a.account-link')!.getAttribute('href')).toBe('/account');
    expect(el.querySelector('.guide-footnote a')!.getAttribute('href'))
      .toBe('https://idp.example/realms/MIP/account/applications');
    expect(el.querySelector('a[href*="/hub/token"]')).toBeNull();
  });

  it('switches the commands between Linux / macOS and Windows', () => {
    const fixture = render();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.snippet code')!.textContent).toContain(`export MIP_URL=${window.location.origin}`);

    const windows = Array.from(el.querySelectorAll<HTMLButtonElement>('.platform-tab'))
      .find((tab) => tab.textContent!.includes('Windows'))!;
    windows.click();
    fixture.detectChanges();

    expect(windows.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('.snippet code')!.textContent).toContain(`$env:MIP_URL = "${window.location.origin}"`);
    expect(el.textContent).toContain('$env:MIP_API_TOKEN');
    expect(el.textContent).toContain('PowerShell');
  });

  it('copies a setup snippet built from the current origin, with no real token', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const fixture = render();

    (fixture.nativeElement.querySelector('.snippet-copy-btn') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalledWith(`pip install mip-client\nexport MIP_URL=${window.location.origin}`);
    expect(fixture.nativeElement.querySelector('.copy-status').textContent).toContain('Copied');
  });

  it('clears the copy status so the next copy is announced again', async () => {
    vi.useFakeTimers();
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const page = render().componentInstance;

    await page.copy(page.setupSnippet(), page.copyStatus);
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
