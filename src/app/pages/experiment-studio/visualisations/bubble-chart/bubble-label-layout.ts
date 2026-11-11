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

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const wrapBubbleLabel = (label: string, maxChars: number, maxLines: number): string[] => {
  const words = label.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) {
    return [''];
  }

  const lines: string[] = [];
  let line = '';

  const ellipsize = (lastLine: string, remaining: string[]): string => {
    const combined = lastLine ? `${lastLine} ${remaining.join(' ')}` : remaining.join(' ');
    return combined.slice(0, maxChars - 1).trimEnd() + '…';
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) {
      line = candidate;
      continue;
    }

    const onLastLine = lines.length + 1 >= maxLines;
    if (onLastLine) {
      lines.push(ellipsize(line, words.slice(i)));
      return lines;
    }

    if (line.length > 0) {
      lines.push(line);
      line = '';
      i -= 1;
      continue;
    }

    lines.push(ellipsize('', words.slice(i)));
    return lines;
  }

  if (line) {
    lines.push(line);
  }
  return lines;
};

/**
 * Wraps and truncates a label so it stays inside a circle of `radius` screen pixels.
 * Returns null when the circle is too small to carry any readable text.
 */
export function fitBubbleLabel(label: string, radius: number, isGroup: boolean): BubbleLabelFit | null {
  if (isGroup) {
    if (radius < 28) return null;
  } else if (radius < 22) {
    return null;
  }

  const fontSize = isGroup
    ? clamp(Math.round(radius * 0.16), 11, 14)
    : clamp(Math.round(radius * 0.3), 9, 12);
  const maxLines = isGroup ? 2 : 3;
  const budget = radius * (isGroup ? GROUP_LABEL_WIDTH_RATIO : LEAF_LABEL_WIDTH_RATIO);
  const maxChars = Math.floor(budget / (fontSize * BUBBLE_LABEL_CHAR_WIDTH));
  if (maxChars < 4) return null;

  return { lines: wrapBubbleLabel(label, maxChars, maxLines), fontSize };
}

const boxesOverlap = (a: BubbleLabelBox, b: BubbleLabelBox): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Decides which labels stay visible. Result index matches the input index.
 * A box is hidden when it overlaps a kept box of higher priority.
 */
export function pickVisibleLabels(boxes: BubbleLabelBox[]): boolean[] {
  const order = boxes.map((_, index) => index);
  order.sort((left, right) => {
    const priorityDelta = boxes[right].priority - boxes[left].priority;
    if (priorityDelta !== 0) return priorityDelta;
    return left - right;
  });

  const visible = boxes.map(() => false);
  const kept: number[] = [];
  for (const index of order) {
    const box = boxes[index];
    if (kept.some((keptIndex) => boxesOverlap(box, boxes[keptIndex]))) continue;
    kept.push(index);
    visible[index] = true;
  }
  return visible;
}
