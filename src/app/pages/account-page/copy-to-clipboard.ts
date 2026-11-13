import { WritableSignal } from '@angular/core';

/** Copies text and reports the outcome in `status`, an aria-live region's text. */
export async function copyToClipboard(text: string, status: WritableSignal<string>): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    status.set('Copied');
  } catch {
    status.set('Could not copy, select the text instead');
  }
  // Cleared after a while so the live region changes, and is announced, on every click.
  setTimeout(() => status.set(''), 2400);
}
