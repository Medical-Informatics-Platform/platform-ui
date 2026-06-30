import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import {
    clearHubLoginState,
    ensureHubSession,
    primeHubSession,
} from './hub-session';
import {
    HubApiError,
    buildLabUrl,
    ensureServerRunning,
} from './jupyterhub-api';
import { RuntimeEnvService } from '../../services/runtime-env.service';
import { NotebookNavService } from '../../services/notebook-nav.service';

@Component({
    selector: 'app-notebook',
    imports: [CommonModule],
    templateUrl: './notebook.component.html',
    styleUrl: './notebook.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotebookComponent implements OnInit {
    private sanitizer = inject(DomSanitizer);
    private runtimeEnv = inject(RuntimeEnvService);
    private notebookNav = inject(NotebookNavService);
    private jupyterBasePath = this.runtimeEnv.jupyterContextPath;

    readonly jupyterUrl = signal<SafeResourceUrl | null>(null);
    readonly isLoading = signal(true);
    readonly loadingMessage = signal('Preparing your notebook…');
    readonly spawnError = signal<string | null>(null);

    ngOnInit() {
        if (this.redirectTopLevelLabToShell()) {
            return;
        }
        this.notebookNav.markVisited();
        void this.initAsync();
    }

    onLoad() {
        if (!this.jupyterUrl()) {
            return;
        }
        setTimeout(() => {
            this.isLoading.set(false);
            this.spawnError.set(null);
            clearHubLoginState();
        });
    }

    retrySpawn() {
        clearHubLoginState();
        void this.initAsync();
    }

    private async initAsync() {
        this.beginLoading('Preparing your notebook…');

        this.loadingMessage.set('Connecting to your notebook…');
        const hubState = await ensureHubSession(this.jupyterBasePath);
        if (hubState === 'redirected') {
            return;
        }
        if (hubState === 'failed') {
            this.showSpawnError(new HubApiError(
                'Notebook sign-in did not complete',
                401,
            ));
            return;
        }

        await this.spawnAndOpenLab();
    }

    private async spawnAndOpenLab(sessionRecovered = false) {
        this.spawnError.set(null);
        this.jupyterUrl.set(null);
        this.beginLoading('Checking notebook session…');

        try {
            await primeHubSession(this.jupyterBasePath);
            const user = await ensureServerRunning(this.jupyterBasePath, {
                onProgress: (message) => this.loadingMessage.set(message),
            });
            this.loadingMessage.set('Opening JupyterLab…');
            this.jupyterUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(
                buildLabUrl(this.jupyterBasePath, user.name),
            ));
        } catch (error) {
            if (error instanceof HubApiError && error.status === 401) {
                const hubState = await ensureHubSession(this.jupyterBasePath);
                if (hubState === 'redirected') {
                    return;
                }
                if (hubState === 'failed') {
                    this.showSpawnError(new HubApiError(
                        'Unable to sign in to the notebook after multiple attempts',
                        401,
                    ));
                }
                if (hubState === 'ready' && !sessionRecovered) {
                    await this.spawnAndOpenLab(true);
                    return;
                }
                if (hubState === 'ready') {
                    this.showSpawnError(new HubApiError(
                        'Unable to sign in to the notebook after multiple attempts',
                        401,
                    ));
                }
                return;
            }

            console.error('Failed to start notebook server via Hub API', error);
            this.showSpawnError(error);
        }
    }

    private beginLoading(message: string) {
        this.isLoading.set(true);
        this.spawnError.set(null);
        this.loadingMessage.set(message);
    }

    private showSpawnError(error: unknown) {
        const message = error instanceof HubApiError
            ? error.message
            : 'Unable to start your notebook server';

        this.jupyterUrl.set(null);
        if (message.includes('Please try again')) {
            this.spawnError.set(message.endsWith('.') ? message : `${message}.`);
        } else {
            const suffix = message.endsWith('.') ? '' : '.';
            this.spawnError.set(`${message}${suffix} Please try again.`);
        }
        this.isLoading.set(true);
        this.loadingMessage.set('Notebook server unavailable');
    }

    private redirectTopLevelLabToShell(): boolean {
        try {
            const path = window.location.pathname;
            if (!path.startsWith(`${this.jupyterBasePath}/user/`)) {
                return false;
            }
            window.location.replace('/notebook');
            return true;
        } catch {
            return false;
        }
    }
}
