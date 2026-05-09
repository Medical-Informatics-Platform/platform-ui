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
        return 'light';
    }

    private applyTheme(_theme: Theme): void {
        document.body.classList.remove('theme-light', 'theme-dark');
        document.body.classList.add('theme-light');
        localStorage.setItem(this.STORAGE_KEY, 'light');
    }

    toggleTheme(): void {
        this.theme.set('light');
    }

    isDark(): boolean {
        return false;
    }
}
