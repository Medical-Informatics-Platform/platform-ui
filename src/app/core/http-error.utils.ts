import { HttpErrorResponse } from '@angular/common/http';

/**
 * True when an HTTP failure means "this resource is gone", not "the request failed".
 * The distinction matters for folder-member hydration: a 404 is safe to prune, while a
 * transient network/server error must leave folder membership intact for a retry.
 */
export function isNotFoundError(error: unknown): boolean {
  if (error instanceof HttpErrorResponse) {
    return error.status === 404;
  }

  const status = (error as { status?: unknown } | null)?.status;
  if (status === 404) {
    return true;
  }

  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /\b404\b/.test(message);
}
