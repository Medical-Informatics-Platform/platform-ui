import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MetadataInfoPanelComponent } from './metadata-info-panel.component';

describe('MetadataInfoPanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MetadataInfoPanelComponent],
      providers: [provideZonelessChangeDetection()],
    });
  });

  it('renders enumeration labels instead of raw codes', () => {
    const fixture = TestBed.createComponent(MetadataInfoPanelComponent);
    fixture.componentRef.setInput('selectedNode', {
      label: 'Hemisphere',
      code: 'hemisphere',
      type: 'nominal',
      enumerations: [
        { code: 'right', label: 'Right' },
        { code: 'left', label: 'Left' },
        { code: 'bilateral', label: 'Bilateral' },
        { code: 'unknown', label: 'Unknown' },
      ],
    });
    fixture.detectChanges();

    const items = Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll('.enumeration-list li')
    ).map((el) => el.textContent?.trim() ?? '');

    expect(items).toEqual(['Right', 'Left', 'Bilateral', 'Unknown']);
  });

  it('humanizes enumeration codes when labels are missing', () => {
    const fixture = TestBed.createComponent(MetadataInfoPanelComponent);
    fixture.componentRef.setInput('selectedNode', {
      label: 'Hemisphere',
      code: 'hemisphere',
      type: 'nominal',
      enumerations: [
        { code: 'right' },
        { code: 'left' },
        { code: 'bilateral' },
        { code: 'unknown' },
      ],
    });
    fixture.detectChanges();

    const items = Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll('.enumeration-list li')
    ).map((el) => el.textContent?.trim() ?? '');

    expect(items).toEqual(['Right', 'Left', 'Bilateral', 'Unknown']);
  });

  it('renders variable metadata and enumeration labels without raw variable codes', () => {
    const fixture = TestBed.createComponent(MetadataInfoPanelComponent);
    fixture.componentRef.setInput('selectedNode', {
      label: 'Anaesthesia type',
      code: 'acute_treat_evt_anaesth',
      description: 'Type of anesthesia',
      type: 'nominal',
      units: 'N/A',
      methodology: 'Clinical abstraction',
      enumerations: [
        { code: 'secret-general-code', label: 'general anesthesia' },
      ],
    });
    fixture.componentRef.setInput('pathNodes', [
      { code: 'stroke', label: 'Stroke 3.7' },
      { code: 'acute', label: 'Acute treatment' },
      { code: 'anaesthesia', label: 'Anaesthesia type' },
    ]);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Anaesthesia type');
    expect(text).toContain('Type of anesthesia');
    expect(text).toContain('nominal');
    expect(text).toContain('N/A');
    expect(text).toContain('Clinical abstraction');
    expect(text).toContain('general anesthesia');
    expect(text).not.toContain('Value');
    expect(text).not.toContain('SQL type');
    expect(text).not.toContain('Categorical');
    expect(text).not.toContain('text');
    expect(text).not.toContain('acute_treat_evt_anaesth');
    expect(text).not.toContain('secret-general-code');
  });

  it('renders selected group summary metadata', () => {
    const fixture = TestBed.createComponent(MetadataInfoPanelComponent);
    fixture.componentRef.setInput('selectedNode', {
      label: 'Vitals',
      code: 'vitals',
      children: [
        { label: 'Blood pressure', code: 'bp', type: 'continuous' },
        {
          label: 'Metabolic',
          code: 'metabolic',
          children: [
            { label: 'Glucose', code: 'glucose', type: 'continuous' },
          ],
        },
      ],
    });
    fixture.componentRef.setInput('groupInfo', { groupCount: 2, hasGroups: true });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Group');
    expect(text).toContain('Vitals');
    expect(text).toContain('Child groups');
    expect(text).toContain('Direct variables');
    expect(text).toContain('Total variables');
    expect(text).toContain('Chart groups');
  });

  describe('flat inspector rendering', () => {
    function renderFlat(flat: boolean): { host: HTMLElement; labels: HTMLElement[] } {
      const fixture = TestBed.createComponent(MetadataInfoPanelComponent);
      fixture.componentRef.setInput('selectedNode', {
        label: 'Anaesthesia type',
        code: 'acute_treat_evt_anaesth',
        type: 'nominal',
      });
      fixture.componentRef.setInput('pathNodes', [
        { code: 'stroke', label: 'Stroke 3.7' },
        { code: 'acute', label: 'Acute treatment' },
        { code: 'anaesthesia', label: 'Anaesthesia type' },
      ]);
      fixture.componentRef.setInput('flat', flat);
      fixture.detectChanges();

      const host = fixture.nativeElement as HTMLElement;
      return { host, labels: Array.from(host.querySelectorAll<HTMLElement>('.metadata-block h4')) };
    }

    it('drops the card surface from the blocks and marks the panel flat', () => {
      const { host, labels } = renderFlat(true);

      expect(host.querySelector('.metadata-info-panel')!.classList.contains('is-flat')).toBe(true);
      expect(labels.length).toBeGreaterThan(0);
      const blocks = Array.from(host.querySelectorAll<HTMLElement>('.metadata-block'));
      for (const block of blocks) {
        expect(block.classList.contains('metadata-block-card')).toBe(false);
      }
    });

    it('keeps the card surface when flat is not requested', () => {
      const { host } = renderFlat(false);

      expect(host.querySelector('.metadata-info-panel')!.classList.contains('is-flat')).toBe(false);
      const blocks = Array.from(host.querySelectorAll<HTMLElement>('.metadata-block'));
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(block.classList.contains('metadata-block-card')).toBe(true);
      }
    });

    it('renders block labels sentence-case, a level below the inspector section titles', () => {
      const { labels } = renderFlat(true);

      expect(labels.map((label) => label.textContent?.trim())).toEqual(['Path', 'Metadata']);
      for (const label of labels) {
        expect(label.tagName).toBe('H4');
        expect(getComputedStyle(label).textTransform).toBe('none');
      }
    });

    it('reads the hierarchy path as one breadcrumb line that wraps', () => {
      const { host } = renderFlat(true);

      const path = host.querySelector<HTMLElement>('.metadata-path')!;
      const nodes = Array.from(path.querySelectorAll('span')).map((span) => span.textContent?.trim());
      expect(nodes).toEqual(['Stroke 3.7', 'Acute treatment', 'Anaesthesia type']);
      // A separator between the nodes, none after the current one.
      expect(path.querySelectorAll('i').length).toBe(nodes!.length - 1);
      const spans = Array.from(path.querySelectorAll('span'));
      expect(spans.at(-1)!.classList.contains('current')).toBe(true);
      expect(getComputedStyle(spans[0]).display).toBe('inline');
    });
  });
});
