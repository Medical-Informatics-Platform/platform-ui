import { escapeHtml } from './html.utils';

describe('escapeHtml', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml(`Sex <b>&"'x</b>`)).toBe('Sex &lt;b&gt;&amp;&quot;&#39;x&lt;/b&gt;');
  });
});
