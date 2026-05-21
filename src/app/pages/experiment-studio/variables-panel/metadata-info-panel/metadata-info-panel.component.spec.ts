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
      sql_type: 'text',
      isCategorical: true,
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
        { label: 'Blood pressure', code: 'bp', type: 'real' },
        {
          label: 'Metabolic',
          code: 'metabolic',
          children: [
            { label: 'Glucose', code: 'glucose', type: 'real' },
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
});
