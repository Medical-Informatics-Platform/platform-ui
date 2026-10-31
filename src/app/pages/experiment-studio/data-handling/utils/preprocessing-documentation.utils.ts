import { escapeHtml } from '../../../../core/html.utils';

/** Backend step docs arrive as prose whose bullets are '-', '*' or '\u2022'; all of them
   become real list items, so the block reads like the algorithm documentation. */
const DOCUMENTATION_BULLET = /^[-*\u2022\u00b7]\s+/;

/**
 * The "How this works" panel of a preprocessing card: backend prose turned into
 * paragraphs, section titles and term/description list items. Every piece of text is
 * escaped, so the result is safe to bind with `[innerHTML]`.
 */
export function buildPreprocessingDocumentationHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }

  const lines = trimmed.includes('\n')
    ? trimmed.split(/\r?\n/)
    : trimmed.split(/\s+(?:[-*\u2022\u00b7])\s+(?=[A-Za-z])/);

  const parts: string[] = [];
  let listItems: string[] = [];
  let isIntroParagraph = true;

  const flushList = (): void => {
    if (!listItems.length) {
      return;
    }
    parts.push('<ul class="preprocessing-doc-list">' + listItems.join('') + '</ul>');
    listItems = [];
  };

  const pushParagraph = (line: string): void => {
    const escaped = escapeHtml(line);
    if (line.endsWith(':') && line.length <= 120) {
      parts.push('<p class="preprocessing-doc-section-title">' + escaped + '</p>');
      isIntroParagraph = false;
      return;
    }

    const classes = isIntroParagraph
      ? 'preprocessing-doc-paragraph preprocessing-doc-intro'
      : 'preprocessing-doc-paragraph';
    parts.push('<p class="' + classes + '">' + escaped + '</p>');
    isIntroParagraph = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const isBullet = DOCUMENTATION_BULLET.test(line);
    let itemText = isBullet ? line.replace(DOCUMENTATION_BULLET, '').trim() : line;
    const colonIndex = itemText.indexOf(':');
    const looksLikeListItem =
      isBullet ||
      (colonIndex > 0 && colonIndex < 40 && itemText.slice(colonIndex + 1).trim().length > 0);

    if (looksLikeListItem && colonIndex > 0) {
      const term = escapeHtml(itemText.slice(0, colonIndex).trim());
      const description = escapeHtml(itemText.slice(colonIndex + 1).trim());
      // The term keeps its colon: the item is read as one line of prose, not a table.
      listItems.push(
        '<li><span class="preprocessing-doc-term">' + term + ':</span> ' +
        '<span class="preprocessing-doc-desc">' + description + '</span></li>'
      );
      continue;
    }

    if (isBullet) {
      listItems.push('<li><span class="preprocessing-doc-desc">' + escapeHtml(itemText) + '</span></li>');
      continue;
    }

    flushList();
    pushParagraph(line);
  }

  flushList();
  return parts.join('');
}
