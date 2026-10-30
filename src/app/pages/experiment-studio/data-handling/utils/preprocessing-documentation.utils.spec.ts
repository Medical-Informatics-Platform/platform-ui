import { buildPreprocessingDocumentationHtml } from './preprocessing-documentation.utils';

describe('buildPreprocessingDocumentationHtml', () => {
  it('returns nothing for empty documentation', () => {
    expect(buildPreprocessingDocumentationHtml('   ')).toBe('');
  });

  it('turns intro, section titles and term bullets into paragraphs and a list', () => {
    const html = buildPreprocessingDocumentationHtml('Caps values.\nStrategies:\n- Fold: how far out\n- plain bullet');
    expect(html).toBe(
      '<p class="preprocessing-doc-paragraph preprocessing-doc-intro">Caps values.</p>'
      + '<p class="preprocessing-doc-section-title">Strategies:</p>'
      + '<ul class="preprocessing-doc-list"><li><span class="preprocessing-doc-term">Fold:</span> '
      + '<span class="preprocessing-doc-desc">how far out</span></li>'
      + '<li><span class="preprocessing-doc-desc">plain bullet</span></li></ul>',
    );
  });

  it('escapes backend text before it reaches innerHTML', () => {
    expect(buildPreprocessingDocumentationHtml('<b>x</b>')).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
