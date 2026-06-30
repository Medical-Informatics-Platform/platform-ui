import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import { NotebookNavService } from '../../../services/notebook-nav.service';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';

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

  readonly notebookRouteActive = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.isNotebookRoute()),
      startWith(this.isNotebookRoute()),
    ),
    { initialValue: this.isNotebookRoute() },
  );

  isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  login(): void {
    // Always route back to dashboard after login for a clean start
    this.authService.login();
  }

  goHome(event?: Event): void {
    event?.preventDefault();
    this.router.navigate(['/experiments-dashboard']);
  }

  showGuideSlot(): boolean {
    return !this.notebookRouteActive();
  }

  private isNotebookRoute(): boolean {
    const path = this.router.url.split('?')[0].split('#')[0];
    return path === '/notebook' || path.startsWith('/notebook/');
  }

}
