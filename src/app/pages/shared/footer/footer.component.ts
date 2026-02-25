import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-footer',
  imports: [CommonModule, RouterModule],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css'
})
export class FooterComponent {
  currentYear = new Date().getFullYear();
  versions = {
    frontend: (window as any).__env?.FRONTEND_VERSION || '10.0.1',
    backend: (window as any).__env?.BACKEND_VERSION || '8.2.0',
    exaflow: (window as any).__env?.EXAFLOW_VERSION || '0.28.0',
    mip: (window as any).__env?.MIP_VERSION || '9.0.0'
  };
}
