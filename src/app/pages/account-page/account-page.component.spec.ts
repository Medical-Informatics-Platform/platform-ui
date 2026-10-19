import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AccountPageComponent } from './account-page.component';
import { AuthService } from '../../services/auth.service';
import { RuntimeEnvService } from '../../services/runtime-env.service';
import { createSpyObj } from '../../testing/spy-obj.testing';

describe('AccountPageComponent', () => {
  afterEach(() => vi.useRealTimers());

  function render(runtimeEnv: Partial<RuntimeEnvService>) {
    const authService = createSpyObj<AuthService>('AuthService', ['logout'], {
      authState: signal({ status: 'authenticated', user: { fullname: 'Marie Curie', email: 'm@c.eu' } }),
    });
    TestBed.configureTestingModule({
      imports: [AccountPageComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: RuntimeEnvService, useValue: runtimeEnv },
      ],
    });
    const fixture = TestBed.createComponent(AccountPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('hides the remote access section when the notebook is disabled', () => {
    const el: HTMLElement = render({ notebookEnabled: false, jupyterContextPath: '/notebook' }).nativeElement;

    expect(el.querySelector('.remote-access')).toBeNull();
  });

  it('links to the Hub token page under the configured context path', () => {
    const el: HTMLElement = render({ notebookEnabled: true, jupyterContextPath: '/jupyter' }).nativeElement;

    const tokenLink = el.querySelector<HTMLAnchorElement>('.token-btn')!;
    expect(tokenLink.getAttribute('href')).toBe('/jupyter/hub/token');
    expect(tokenLink.target).toBe('_blank');
  });

  it('copies a setup snippet built from the current origin, with no real token', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const fixture = render({ notebookEnabled: true, jupyterContextPath: '/notebook' });

    (fixture.nativeElement.querySelector('.copy-btn') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalledWith(
      `pip install mip-client\nexport MIP_URL=${window.location.origin}\nmip login`,
    );
    expect(fixture.nativeElement.querySelector('.copy-status').textContent).toContain('Copied');
  });

  it('clears the copy status so the next copy is announced again', async () => {
    vi.useFakeTimers();
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const fixture = render({ notebookEnabled: true, jupyterContextPath: '/notebook' });

    await fixture.componentInstance.copySetupSnippet();
    expect(fixture.componentInstance.copyStatus()).toBe('Copied');
    vi.advanceTimersByTime(2400);
    expect(fixture.componentInstance.copyStatus()).toBe('');
  });

  it('tells the user to copy by hand when the clipboard refuses', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fixture = render({ notebookEnabled: true, jupyterContextPath: '/notebook' });

    (fixture.nativeElement.querySelector('.copy-btn') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.copy-status').textContent).toContain('Could not copy');
  });
});
