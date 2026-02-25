export function prettifyLabel(label: string): string {
  if (!label) return '';

  return label
    .replace(/_/g, ' ')                       // underscores → spaces
    .replace(/([a-z])([A-Z])/g, '$1 $2')      // split camelCase
    .replace(/^r(?=[A-Z])/g, 'Right ')        // rX → Right
    .replace(/^l(?=[A-Z])/g, 'Left ')         // lX → Left
    .replace(/\s+/g, ' ')                     // cleanup multiple spaces
    .trim();
}
