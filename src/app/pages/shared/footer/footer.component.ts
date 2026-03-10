import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { RuntimeEnvService } from '../../../services/runtime-env.service';

@Component({
  selector: 'app-footer',
  imports: [CommonModule, RouterModule],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  private readonly runtimeEnvService = inject(RuntimeEnvService);

  readonly currentYear = new Date().getFullYear();
  readonly versionEntries = this.runtimeEnvService.versionEntries;
}
