import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
    selector: 'app-notebook',
    imports: [CommonModule],
    templateUrl: './notebook.component.html',
    styleUrls: ['./notebook.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotebookComponent implements OnInit {
    private sanitizer = inject(DomSanitizer);
    private runtimeEnv = (window as any).__env || {};
    private jupyterBasePath = this.normalizeBasePath(this.runtimeEnv.JUPYTER_CONTEXT_PATH || '/notebook');
    private jupyterLandingPath = this.normalizeSubPath(this.runtimeEnv.JUPYTER_LANDING_PATH || '/hub/spawn');
    private hubLoginBounceKey = 'mip_notebook_hub_login_bounced_ts_v2';

    readonly jupyterUrl = signal<SafeResourceUrl | null>(null);
    readonly isLoading = signal(true);
    readonly needsHubLogin = signal(false);
    readonly hubLoginUrl = signal<string | null>(null);

    ngOnInit() {
        // Do not try to run the OAuth/Keycloak flow inside the iframe.
        // If the Hub session is missing, bounce the *top window* through the Hub login once,
        // then come back and embed Jupyter normally.
        void this.initAsync();
    }

    private buildJupyterUrl(path: string): string {
        return `${this.jupyterBasePath}${path}`;
    }

    private normalizeBasePath(path: string): string {
        if (!path) {
            return '/notebook';
        }
        const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
        return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
    }

    private normalizeSubPath(path: string): string {
        if (!path) {
            return '/hub/spawn';
        }
        return path.startsWith('/') ? path : `/${path}`;
    }

    onLoad() {
        // Iframe load can fire during initial change detection; defer state mutation.
        setTimeout(() => {
            this.isLoading.set(false);
        });
    }

    private async initAsync() {
        // Check whether the user is logged into the hub.
        // /hub/home returns 200 when authenticated, and 302 -> /hub/login otherwise.
        const hasHubSession = await this.hasHubSession();
        if (!hasHubSession) {
            this.hubLoginUrl.set(this.buildHubLoginUrl());
            if (this.bounceToHubLoginOnce()) {
                return;
            }
            // Don't try embedding a login flow in an iframe (blocked by most IdPs/browsers).
            this.needsHubLogin.set(true);
            this.isLoading.set(false);
            return;
        }

        // Successful hub session: clear bounce throttle so future expirations can redirect again.
        try {
            sessionStorage.removeItem(this.hubLoginBounceKey);
        } catch {
            // ignore storage errors
        }

        this.isLoading.set(true);
        this.jupyterUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(
            this.buildJupyterUrl(this.jupyterLandingPath)
        ));
    }

    private async hasHubSession(): Promise<boolean> {
        try {
            const url = `${this.jupyterBasePath}/hub/home`;
            const r = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                redirect: 'manual',
                cache: 'no-store',
            });

            // Some browsers represent manual redirects as "opaque redirect".
            if ((r as any).type === 'opaqueredirect') {
                return false;
            }
            // Some browsers report status 0 for manual redirects; treat as unauthenticated.
            if (r.status === 0) {
                return false;
            }
            if (r.status === 200) {
                return true;
            }
            if (r.status >= 300 && r.status < 400) {
                return false;
            }
            return false;
        } catch {
            return false;
        }
    }

    private buildHubLoginUrl(): string {
        // Login must happen in top-window, but we want to return to the Angular shell route
        // so Jupyter is rendered inside iframe with UI header/footer.
        const next = encodeURIComponent('/notebook?hub_auth=1');
        return `${this.jupyterBasePath}/hub/login?next=${next}`;
    }

    private bounceToHubLoginOnce(): boolean {
        try {
            const raw = sessionStorage.getItem(this.hubLoginBounceKey);
            const last = raw ? Number(raw) : 0;
            const now = Date.now();
            // Avoid loops, but allow retry after a short cooldown (e.g., user cancelled login).
            if (last && Number.isFinite(last) && (now - last) < 30_000) {
                return false;
            }
            sessionStorage.setItem(this.hubLoginBounceKey, String(now));
        } catch {
            return false;
        }

        window.location.assign(this.buildHubLoginUrl());
        return true;
    }

    continueToHubLogin() {
        window.location.assign(this.buildHubLoginUrl());
    }
}
