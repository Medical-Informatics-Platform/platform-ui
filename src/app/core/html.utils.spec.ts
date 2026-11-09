import { escapeHtml } from './html.utils';

describe('escapeHtml', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml(`Sex <b>&"'x</b>`)).toBe('Sex &lt;b&gt;&amp;&quot;&#39;x&lt;/b&gt;');
  });

  it('leaves ordinary chart labels and numbers unchanged', () => {
    expect(escapeHtml('PC1 · 12.3%')).toBe('PC1 · 12.3%');
    expect(escapeHtml('Mean')).toBe('Mean');
    expect(escapeHtml('1.50')).toBe('1.50');
    expect(escapeHtml(null)).toBe('');
  });
});
