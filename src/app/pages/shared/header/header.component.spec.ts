import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HeaderComponent } from './header.component';
import { AuthService } from '../../../services/auth.service';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import { NotebookNavService } from '../../../services/notebook-nav.service';
import { ExperimentStudioNavigationService } from '../../../services/experiment-studio-navigation.service';

@Component({ template: '' })
class StubStudioComponent {}

describe('HeaderComponent', () => {
  let fixture: ComponentFixture<HeaderComponent>;
  let component: HeaderComponent;
  let authService: jasmine.SpyObj<AuthService>;
  let runtimeEnv: { notebookEnabled: boolean };
  let notebookNav: jasmine.SpyObj<NotebookNavService>;
  let router: Router;

  beforeEach(async () => {
    authService = jasmine.createSpyObj<AuthService>('AuthService', ['isLoggedIn', 'login']);
    authService.isLoggedIn.and.returnValue(true);

    notebookNav = jasmine.createSpyObj<NotebookNavService>('NotebookNavService', ['hasVisited']);
    notebookNav.hasVisited.and.returnValue(true);

    runtimeEnv = { notebookEnabled: true };

    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([
          { path: 'experiment-studio', component: StubStudioComponent },
          { path: 'notebook', component: StubStudioComponent },
        ]),
        { provide: AuthService, useValue: authService },
        { provide: NotebookNavService, useValue: notebookNav },
        { provide: RuntimeEnvService, useValue: runtimeEnv },
        ExperimentStudioNavigationService,
      ],
    })
      .compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('creates header component', () => {
    expect(component).toBeTruthy();
  });

  it('renders branding and user actions in standard non-studio mode', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.branding')).toBeTruthy();
    expect(compiled.querySelector('.header-actions')).toBeTruthy();
    expect(compiled.querySelector('app-studio-stepper')).toBeNull();
  });

  it('renders My experiments button and no studio stepper when on /experiment-studio route', async () => {
    await router.navigateByUrl('/experiment-studio');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(component.isStudioRoute()).toBe(true);
    expect(compiled.querySelector('.header--studio')).toBeTruthy();
    expect(compiled.querySelector('app-studio-stepper')).toBeNull();
    const myExpBtn = compiled.querySelector<HTMLAnchorElement>('.header-nav-link--dashboard');
    expect(myExpBtn).toBeTruthy();
    expect(myExpBtn?.textContent).toContain('My experiments');
  });

  it('delegates to studio navigation when clicking My experiments', async () => {
    const studioNav = TestBed.inject(ExperimentStudioNavigationService);
    spyOn(studioNav, 'backToDashboard');

    await router.navigateByUrl('/experiment-studio');
    fixture.detectChanges();

    const myExpBtn = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.header-nav-link--dashboard');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    myExpBtn?.dispatchEvent(click);

    expect(studioNav.backToDashboard).toHaveBeenCalled();
    expect(click.defaultPrevented).toBe(true);
  });

  it('leaves modifier and middle clicks to the browser', async () => {
    const studioNav = TestBed.inject(ExperimentStudioNavigationService);
    const back = spyOn(studioNav, 'backToDashboard');

    await router.navigateByUrl('/experiment-studio');
    fixture.detectChanges();

    const pill = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.header-nav-link--dashboard');
    if (!pill) throw new Error('studio pill missing');

    // Registered after Angular's (click) listener, so it observes what the component
    // decided and then cancels the navigation the browser would otherwise perform.
    let preventedByComponent = true;
    pill.addEventListener('click', (event) => {
      preventedByComponent = event.defaultPrevented;
      event.preventDefault();
    });

    for (const init of [
      { button: 1 },
      { button: 0, metaKey: true },
      { button: 0, ctrlKey: true },
      { button: 0, shiftKey: true },
    ]) {
      pill.dispatchEvent(new MouseEvent('click', { ...init, bubbles: true, cancelable: true }));
      expect(preventedByComponent).toBe(false);
    }
    expect(back).not.toHaveBeenCalled();

    // A plain left click is the component's to handle.
    pill.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(preventedByComponent).toBe(true);
  });

  it('marks the notebook link as the current page', async () => {
    await router.navigate(['/notebook']);
    fixture.detectChanges();

    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.header-nav-link--notebook');
    expect(link?.getAttribute('aria-current')).toBe('page');
  });
});
