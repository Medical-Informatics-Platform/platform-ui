import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { GuideOnboardingService } from '../services/guide-onboarding.service';

export const studioGuideOnboardingGuard: CanActivateFn = () => {
  const guideOnboarding = inject(GuideOnboardingService);
  const router = inject(Router);

  if (guideOnboarding.hasSeenStudioGuide()) {
    return true;
  }

  return router.createUrlTree(['/experiment-studio']);
};
