import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'light' | 'dark';

@Injectable({
    providedIn: 'root'
})
export class ThemeService {
    private readonly STORAGE_KEY = 'mip-theme';

    // Reactive signal for current theme
    theme = signal<Theme>(this.getInitialTheme());

    // Apply theme class to body whenever theme changes
    private _themeEffect = effect(() => {
        this.applyTheme(this.theme());
    });

    constructor() { }

    private getInitialTheme(): Theme {
        // Check localStorage first
        const stored = localStorage.getItem(this.STORAGE_KEY) as Theme | null;
        if (stored === 'light' || stored === 'dark') {
            return stored;
        }
        // Fall back to system preference
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    private applyTheme(theme: Theme): void {
        document.body.classList.remove('theme-light', 'theme-dark');
        document.body.classList.add(`theme-${theme}`);
        localStorage.setItem(this.STORAGE_KEY, theme);
    }

    toggleTheme(): void {
        this.theme.update(current => current === 'light' ? 'dark' : 'light');
    }

    isDark(): boolean {
        return this.theme() === 'dark';
    }
}
