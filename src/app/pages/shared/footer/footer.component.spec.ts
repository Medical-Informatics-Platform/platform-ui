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

    expect(resourceLinks.length).toBe(3);

    const supportLink = resourceLinks.find((link) => link.textContent?.trim() === 'Support');
    const termsLink = resourceLinks.find((link) => link.textContent?.trim() === 'Terms of Use');

    expect(supportLink?.getAttribute('href')).toBe('mailto:mip@chuv.ch');
    expect(termsLink).toBeTruthy();
  });

  it('should render the EU co-funding badge', () => {
    const fundingFlag = fixture.nativeElement.querySelector('.footer-funding-item-eu .footer-funding-flag') as HTMLImageElement | null;
    const fundingText = fixture.nativeElement.querySelector('.footer-funding-item-eu .footer-funding-box-name') as HTMLElement | null;
    const fundingTooltip = fixture.nativeElement.querySelector('.footer-funding-item-eu .footer-funding-tooltip') as HTMLElement | null;

    expect(fundingFlag?.getAttribute('src')).toBe('assets/footer/eu-flag.svg');
    expect(fundingFlag?.getAttribute('alt')).toBe('European Union flag');
    expect(fundingText?.textContent).toContain('European Union');
    expect(fundingTooltip?.textContent).toContain('Human Brain Project');
    expect(fundingTooltip?.textContent).toContain('EBRAINS 2.0');
    expect(fundingTooltip?.textContent).toContain('23.00638');
  });

  it('should render the SERI co-funding mark with the shared acknowledgement text', () => {
    const seriFlag = fixture.nativeElement.querySelector('.footer-funding-item-seri .seri-mark-flag') as HTMLElement | null;
    const seriText = fixture.nativeElement.querySelector('.footer-funding-item-seri .footer-funding-box-name-seri') as HTMLElement | null;
    const seriTooltip = fixture.nativeElement.querySelector('.footer-funding-item-seri .footer-funding-tooltip') as HTMLElement | null;

    expect(seriFlag).toBeTruthy();
    expect(seriText?.textContent).toContain('State Secretariat for Education, Research and Innovation');
    expect(seriTooltip?.textContent).toContain('SERI contract No. 23.00638');
  });

  it('should render the selected CHUV blanc logo in the partner section', () => {
    const chuvLogo = fixture.nativeElement.querySelector('.chuv-logo') as HTMLImageElement | null;

    expect(chuvLogo?.getAttribute('src')).toBe('assets/footer/CHUV_Logo_Simple_BLANC.png');
  });

  it('should render only the MIP version in the footer bottom row', () => {
    const versions = fixture.nativeElement.querySelector('.footer-versions') as HTMLElement | null;
    const versionText = versions?.textContent ?? '';

    expect(versionText).toContain('MIP');
    expect(versionText).toContain('testing');
    expect(versionText).not.toContain('Frontend:');
    expect(versionText).not.toContain('Backend:');
    expect(versionText).not.toContain('Exaflow:');
  });
});
