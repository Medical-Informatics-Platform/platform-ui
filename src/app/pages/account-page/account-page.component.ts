import { ChangeDetectionStrategy, Component, computed, inject, signal, WritableSignal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule, Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService } from "../../services/auth.service";
import { AuthConfig, cliTokenSignInUrl, finishCliTokenSignIn, isSignInReturn } from './cli-token';

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
  private http = inject(HttpClient);

  userName = computed(() => this.authService.authState().user?.fullname ?? '');
  userEmail = computed(() => this.authService.authState().user?.email ?? '');

  // The platform's public Keycloak client for the mip client; the backend answers 404
  // when there is none, and the remote access guide stays hidden.
  readonly authConfig = toSignal(
    this.http.get<AuthConfig>('/services/auth-config').pipe(catchError(() => of(null))),
    { initialValue: null },
  );
  // Keycloak sends the browser back here after the sign-in for a new token.
  private readonly tokenRedirectUri = `${window.location.origin}/account`;
  // Shown once; never stored, and gone when the page is left.
  readonly cliToken = signal('');
  readonly tokenError = signal('');
  readonly creatingToken = signal(false);
  readonly tokenCopyStatus = signal('');
  readonly setupSnippet = ['pip install mip-client', `export MIP_URL=${window.location.origin}`].join('\n');
  readonly copyStatus = signal('');

  constructor() {
    const query = new URLSearchParams(window.location.search);
    if (isSignInReturn(query)) {
      // Take the one-time code out of the address bar and history right away, even when it is not ours.
      this.location.replaceState('/account');
      this.creatingToken.set(true);
      finishCliTokenSignIn(query, this.tokenRedirectUri)
        .then((token) => this.cliToken.set(token))
        .catch((err: Error) => this.tokenError.set(err.message))
        .finally(() => this.creatingToken.set(false));
    }
  }

  async createToken(): Promise<void> {
    const config = this.authConfig();
    if (!config) return;
    this.tokenError.set('');
    this.creatingToken.set(true);
    // Back from Keycloak can restore this page from the back/forward cache with the button still disabled.
    window.addEventListener('pageshow', () => this.creatingToken.set(false), { once: true });
    try {
      this.redirect(await cliTokenSignInUrl(config, this.tokenRedirectUri));
    } catch (err) {
      // e.g. no crypto.subtle when the portal is not served over HTTPS
      this.tokenError.set(`Could not start the sign-in (${(err as Error).message}).`);
      this.creatingToken.set(false);
    }
  }

  protected redirect(url: string): void {
    window.location.assign(url);
  }

  signOut(): void {
    this.authService.logout();
  }

  goBack(): void {
    this.location.back();
  }

  async copy(text: string, status: WritableSignal<string>): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      status.set('Copied');
    } catch {
      status.set('Could not copy, select the text instead');
    }
    // Cleared after a while so the live region changes, and is announced, on every click.
    setTimeout(() => status.set(''), 2400);
  }
}
