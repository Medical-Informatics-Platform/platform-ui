import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import { NotebookNavService } from '../../../services/notebook-nav.service';
import { ExperimentStudioNavigationService } from '../../../services/experiment-studio-navigation.service';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';

/**
 * Modifier and non-primary clicks belong to the browser: ⌘/Ctrl/middle-click on the logo
 * or the studio pill must still be able to open a tab. Swallowing every click made the
 * advertised routerLink/href a lie.
 */
function isPlainLeftClick(event?: Event): boolean {
  if (!event) return true;
  const { button, metaKey, ctrlKey, shiftKey, altKey } = event as MouseEvent;
  return button === 0 && !metaKey && !ctrlKey && !shiftKey && !altKey;
}

@Component({
  selector: 'app-header',
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  private router = inject(Router);
  authService = inject(AuthService);
  readonly runtimeEnv = inject(RuntimeEnvService);
  readonly notebookNav = inject(NotebookNavService);
  readonly studioNav = inject(ExperimentStudioNavigationService);

  readonly notebookRouteActive = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.isNotebookRoute()),
      startWith(this.isNotebookRoute()),
    ),
    { initialValue: this.isNotebookRoute() },
  );

  readonly isStudioRoute = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.isExperimentStudioRoute()),
      startWith(this.isExperimentStudioRoute()),
    ),
    { initialValue: this.isExperimentStudioRoute() },
  );

  isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  login(): void {
    // Always route back to dashboard after login for a clean start
    this.authService.login();
  }

  goHome(event?: Event): void {
    if (!isPlainLeftClick(event)) return;
    event?.preventDefault();
    if (this.isStudioRoute()) {
      this.goToDashboard();
      return;
    }
    this.router.navigate(['/experiments-dashboard']);
  }

  goToDashboard(event?: Event): void {
    if (!isPlainLeftClick(event)) return;
    event?.preventDefault();
    this.studioNav.backToDashboard();
  }

  private isNotebookRoute(): boolean {
    const path = this.router.url.split('?')[0].split('#')[0];
    return path === '/notebook' || path.startsWith('/notebook/');
  }

  private isExperimentStudioRoute(): boolean {
    const path = this.router.url.split('?')[0].split('#')[0];
    return path === '/experiment-studio';
  }
}
