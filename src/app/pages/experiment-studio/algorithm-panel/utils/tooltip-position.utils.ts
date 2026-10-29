/** Tooltip box and spacing for {@link tooltipPosition}. */
export interface TooltipPlacement {
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  padding: number;
  offset: number;
}

/**
 * Where to put a tooltip for an item, in coordinates relative to `containerRect`: right of
 * the item, else left of it, else pinned to the right viewport edge; vertically centred on
 * the item and kept inside the viewport, never closer than `padding` to the container edge.
 */
export function tooltipPosition(rect: DOMRect, containerRect: DOMRect, placement: TooltipPlacement): { x: number; y: number } {
  const { width, height, viewportWidth, viewportHeight, padding, offset } = placement;
  const rightAlignedX = rect.right + offset;
  const leftAlignedX = rect.left - width - offset;
  const centeredY = rect.top + (rect.height - height) / 2;

  let x = rightAlignedX;
  if (rightAlignedX + width > viewportWidth - padding) {
    x = leftAlignedX >= padding ? leftAlignedX : viewportWidth - width - padding;
  }

  let y = centeredY;
  if (y + height > viewportHeight - padding) {
    y = viewportHeight - height - padding;
  }
  if (y < padding) {
    y = padding;
  }

  return {
    x: Math.max(padding, x - containerRect.left),
    y: Math.max(padding, y - containerRect.top),
  };
}
