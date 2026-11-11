/** Text of one bubble label after it was fitted to its circle. */
export interface BubbleLabelFit {
  lines: string[];
  fontSize: number;
}

/** Screen box a label takes, used to drop labels that would overlap. */
export interface BubbleLabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Higher wins when two boxes overlap. The renderer passes the circle radius. */
  priority: number;
}

/** Average glyph width as a share of the font size. */
export const BUBBLE_LABEL_CHAR_WIDTH = 0.6;
/** Line height as a share of the font size. */
export const BUBBLE_LABEL_LINE_HEIGHT = 1.2;
/** Share of the radius a group label may span (it sits in the top band of the circle). */
export const GROUP_LABEL_WIDTH_RATIO = 1.4;
/** Share of the radius a variable label may span (it sits on the centre line). */
export const LEAF_LABEL_WIDTH_RATIO = 1.7;

/**
 * Wraps and truncates a label so it stays inside a circle of `radius` screen pixels.
 * Returns null when the circle is too small to carry any readable text.
 */
export function fitBubbleLabel(label: string, radius: number, isGroup: boolean): BubbleLabelFit | null {
  void label;
  void radius;
  void isGroup;
  throw new Error('not implemented');
}

/**
 * Decides which labels stay visible. Result index matches the input index.
 * A box is hidden when it overlaps a kept box of higher priority.
 */
export function pickVisibleLabels(boxes: BubbleLabelBox[]): boolean[] {
  void boxes;
  throw new Error('not implemented');
}
