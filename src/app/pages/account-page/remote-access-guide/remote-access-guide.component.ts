import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthConfig } from '../cli-token';
import { copyToClipboard } from '../copy-to-clipboard';

type Platform = 'linux' | 'windows';

/** How to set up the mip client on the user's own computer, per operating system. */
@Component({
  selector: 'app-remote-access-guide',
  imports: [RouterModule],
  templateUrl: './remote-access-guide.component.html',
  styleUrls: ['../account-page.component.css', './remote-access-guide.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemoteAccessGuideComponent {
  // undefined while loading; null when the platform has no Keycloak client for the mip client.
  readonly authConfig = toSignal(
    inject(HttpClient).get<AuthConfig>('/services/auth-config').pipe(
      map((config): AuthConfig | null => config),
      catchError(() => of(null)),
    ),
  );
  readonly platforms: { id: Platform; label: string; icon: string }[] = [
    { id: 'linux', label: 'Linux / macOS', icon: 'fab fa-linux' },
    { id: 'windows', label: 'Windows', icon: 'fab fa-windows' },
  ];
  readonly platform = signal<Platform>(navigator.userAgent.includes('Windows') ? 'windows' : 'linux');
  readonly shellName = computed(() => (this.platform() === 'windows' ? 'PowerShell' : 'Terminal'));
  readonly setupSnippet = computed(() => [
    'pip install mip-client',
    this.platform() === 'windows'
      ? `$env:MIP_URL = "${window.location.origin}"`
      : `export MIP_URL=${window.location.origin}`,
  ].join('\n'));
  readonly tokenVariable = computed(() =>
    this.platform() === 'windows' ? '$env:MIP_API_TOKEN = "…"' : 'export MIP_API_TOKEN=…');
  readonly copyStatus = signal('');
  readonly copy = copyToClipboard;
}
