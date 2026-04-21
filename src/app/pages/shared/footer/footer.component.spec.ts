import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { FooterComponent } from './footer.component';
import { RuntimeEnvService } from '../../../services/runtime-env.service';

describe('FooterComponent', () => {
  let component: FooterComponent;
  let fixture: ComponentFixture<FooterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FooterComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: RuntimeEnvService,
          useValue: {
            versionEntries: [
              { label: 'MIP', value: 'testing' },
            ],
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the resources list with support as a mailto link', () => {
    const resourceLinks = Array.from(
      fixture.nativeElement.querySelectorAll('.footer-links a'),
    ) as HTMLAnchorElement[];

    expect(resourceLinks.length).toBe(4);

    const supportLink = resourceLinks.find((link) => link.textContent?.trim() === 'Support');
    const termsLink = resourceLinks.find((link) => link.textContent?.trim() === 'Terms of Use');

    expect(supportLink?.getAttribute('href')).toBe('mailto:mip@chuv.ch');
    expect(termsLink).toBeTruthy();
  });

  it('should render the EU co-funding badge', () => {
    const fundingFlag = fixture.nativeElement.querySelector('.footer-funding-flag') as HTMLImageElement | null;
    const fundingText = fixture.nativeElement.querySelector('.footer-funding') as HTMLElement | null;

    expect(fundingFlag?.getAttribute('src')).toBe('assets/eu-flag.svg');
    expect(fundingFlag?.getAttribute('alt')).toBe('European Union flag');
    expect(fundingText?.textContent).toContain('Co-funded by');
    expect(fundingText?.textContent).toContain('the European Union');
  });

  it('should render only the MIP version in the footer bottom row', () => {
    const versions = fixture.nativeElement.querySelector('.footer-versions') as HTMLElement | null;
    const versionText = versions?.textContent ?? '';

    expect(versionText).toContain('MIP: testing');
    expect(versionText).not.toContain('Frontend:');
    expect(versionText).not.toContain('Backend:');
    expect(versionText).not.toContain('Exaflow:');
  });
});
