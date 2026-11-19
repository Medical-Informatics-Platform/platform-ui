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

  it('renders methodology and enumeration labels without raw codes', () => {
    const fixture = TestBed.createComponent(MetadataInfoPanelComponent);
    fixture.componentRef.setInput('selectedNode', {
      label: 'Anaesthesia type',
      code: 'acute_treat_evt_anaesth',
      type: 'nominal',
      sql_type: 'text',
      isCategorical: true,
      methodology: 'Clinical abstraction',
      enumerations: [
        { code: 'secret-general-code', label: 'general anesthesia' },
      ],
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Clinical abstraction');
    expect(text).toContain('general anesthesia');
    expect(text).not.toContain('acute_treat_evt_anaesth');
    expect(text).not.toContain('secret-general-code');
  });

  it('leaves type, units and path to the inspector header', () => {
    const fixture = TestBed.createComponent(MetadataInfoPanelComponent);
    fixture.componentRef.setInput('selectedNode', { label: 'Age', code: 'age', type: 'real', units: 'years' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });

  it('shows eight enumerations, then all of them on request, and resets on a new selection', () => {
    const levels = Array.from({ length: 12 }, (_, i) => ({ code: `l${i}`, label: `Level ${i}` }));
    const fixture = TestBed.createComponent(MetadataInfoPanelComponent);
    fixture.componentRef.setInput('selectedNode', { label: 'Site', code: 'site', enumerations: levels });
    fixture.detectChanges();

    const items = () => fixture.nativeElement.querySelectorAll('.enumeration-list li').length;
    const more = () => fixture.nativeElement.querySelector('.metadata-more-btn') as HTMLButtonElement;
    expect(items()).toBe(8);
    expect(more().textContent?.trim()).toBe('Show all 12');

    more().click();
    fixture.detectChanges();
    expect(items()).toBe(12);
    expect(more().getAttribute('aria-expanded')).toBe('true');

    fixture.componentRef.setInput('selectedNode', { label: 'Arm', code: 'arm', enumerations: levels });
    fixture.detectChanges();
    expect(items()).toBe(8);
  });
});
