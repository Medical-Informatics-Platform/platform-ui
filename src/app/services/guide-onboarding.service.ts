import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GuideOnboardingService {
  private readonly studioSeenStorageKey = 'mip.guide.experiment-studio.seen';
  private readonly legacyStudioAutoStartStorageKey = 'mip.guide.experiment-studio.autostarted';

  hasSeenStudioGuide(): boolean {
    try {
      return localStorage.getItem(this.studioSeenStorageKey) === 'true'
        || localStorage.getItem(this.legacyStudioAutoStartStorageKey) === 'true';
    } catch {
      return false;
    }
  }

  markStudioGuideSeen(): void {
    try {
      localStorage.setItem(this.studioSeenStorageKey, 'true');
      // Backwards compatibility: users who already dismissed or auto-started the old guide
      // should not be forced through onboarding after the storage key rename.
      localStorage.setItem(this.legacyStudioAutoStartStorageKey, 'true');
    } catch {
      // Ignore storage failures and keep the guide functional.
    }
  }
}
