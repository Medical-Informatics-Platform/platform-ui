import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from "../../services/auth.service";
import { RuntimeEnvService } from '../../services/runtime-env.service';

@Component({
  selector: 'app-account-page',
  imports: [CommonModule, RouterModule],
  templateUrl: './account-page.component.html',
  styleUrl: './account-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccountPageComponent {
  public authService = inject(AuthService);
  private location = inject(Location);
  private runtimeEnv = inject(RuntimeEnvService);

  userName = computed(() => this.authService.authState().user?.fullname ?? '');
  userEmail = computed(() => this.authService.authState().user?.email ?? '');

  // Remote access goes through JupyterHub, which holds the user's Keycloak login;
  // the token is created on Hub's own page, so this UI never sees it.
  readonly notebookEnabled = this.runtimeEnv.notebookEnabled;
  readonly hubTokenUrl = `${this.runtimeEnv.jupyterContextPath}/hub/token`;
  readonly setupSnippet = [
    'pip install mip-client',
    `export MIP_URL=${window.location.origin}`,
    'export MIP_API_TOKEN=<paste your token here>',
  ].join('\n');
  readonly copyStatus = signal('');

  constructor() { }

  signOut(): void {
    this.authService.logout();
  }

  goBack(): void {
    this.location.back();
  }

  async copySetupSnippet(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.setupSnippet);
      this.copyStatus.set('Copied');
    } catch (err) {
      console.warn('Failed to copy setup snippet:', err);
      this.copyStatus.set('Could not copy, select the text instead');
    }
  }
}
