import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-footer',
  imports: [CommonModule, RouterModule],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  currentYear = new Date().getFullYear();
  versions = {
    frontend: (window as any).__env?.FRONTEND_VERSION || '1.0.0',
    backend: (window as any).__env?.BACKEND_VERSION || '9.0.0',
    exaflow: (window as any).__env?.EXAFLOW_VERSION || '1.0.0',
    mip: (window as any).__env?.MIP_VERSION || '9.0.0'
  };
}
