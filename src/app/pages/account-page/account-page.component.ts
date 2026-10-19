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
    // Asks for the token without echoing it and saves it to a file, so it stays out of
    // the shell history and of the environment every program (AI assistants too) inherits.
    'mip login',
  ].join('\n');
  readonly copyStatus = signal('');
  private copyStatusTimer?: ReturnType<typeof setTimeout>;

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
      this.showCopyStatus('Copied');
    } catch (err) {
      console.warn('Failed to copy setup snippet:', err);
      this.showCopyStatus('Could not copy, select the text instead');
    }
  }

  // Cleared after a while so the live region changes, and is announced, on every click.
  private showCopyStatus(message: string): void {
    clearTimeout(this.copyStatusTimer);
    this.copyStatus.set(message);
    this.copyStatusTimer = setTimeout(() => this.copyStatus.set(''), 2400);
  }
}
