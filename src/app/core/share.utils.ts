import { Router } from '@angular/router';

/**
 * Build an absolute share URL for an experiment, pointing back at the
 * experiments dashboard with the experiment id in the query string.
 */
export function buildExperimentShareUrl(router: Router, experimentId: string): string {
  const tree = router.createUrlTree(['/experiments-dashboard'], {
    queryParams: { experiment: experimentId },
  });
  const relative = router.serializeUrl(tree);
  return window.location.origin + relative;
}

/**
 * Whether the given user owns the experiment (matching the author's email).
 * Returns false when either email is unavailable.
 */
export function isExperimentOwner(
  currentUserEmail: string | null | undefined,
  authorEmail: string | null | undefined
): boolean {
  if (!currentUserEmail || !authorEmail) return false;
  return currentUserEmail === authorEmail;
}
