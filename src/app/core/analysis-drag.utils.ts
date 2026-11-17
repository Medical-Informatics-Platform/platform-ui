/**
 * The one contract between an analysis row being dragged and whatever can receive it — the
 * study canvas and the study chips. A private MIME keeps the payload from being mistaken for
 * dropped text, and every target reads it through these helpers so the two surfaces cannot
 * drift apart on the type string.
 *
 * Drop targets may only inspect `types` while the drag is in flight: the payload itself stays
 * unreadable until the drop lands. Hence the split `isAnalysisDrag` / `droppedAnalysisId`.
 */

export const ANALYSIS_DRAG_MIME = 'application/x-mip-analysis';

/** Arm the drag. Only `dragstart` has a writable data transfer, so this is the single writer. */
export function beginAnalysisDrag(dataTransfer: DataTransfer | null, analysisId: string): void {
  if (!dataTransfer || !analysisId) return;
  dataTransfer.effectAllowed = 'copy';
  dataTransfer.setData(ANALYSIS_DRAG_MIME, analysisId);
}

/** Cheap enough for `dragover`, which fires continuously and must never touch the payload. */
export function isAnalysisDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types || []).includes(ANALYSIS_DRAG_MIME);
}

/** The dragged run id, or null when the drag carries something else (a file, selected text). */
export function droppedAnalysisId(dataTransfer: DataTransfer | null): string | null {
  if (!dataTransfer || !isAnalysisDrag(dataTransfer)) return null;
  const id = dataTransfer.getData(ANALYSIS_DRAG_MIME)?.trim();
  return id ? id : null;
}

/**
 * Whether a `dragleave` really leaves the drop zone. It also fires when the pointer crosses a
 * child, so the naive handler makes a highlight flicker over every row and icon inside it.
 */
export function leavesDragZone(event: DragEvent, zone: EventTarget | null): boolean {
  if (!zone) return true;
  const next = event.relatedTarget as Node | null;
  return !(zone as HTMLElement).contains(next);
}
