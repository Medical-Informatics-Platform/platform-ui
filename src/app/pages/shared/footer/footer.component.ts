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
  readonly fundingAcknowledgement =
    'This work was co-funded by the European Union’s Horizon 2020 Framework Partnership Agreement (No. 650003) for the Human Brain Project, and by the Horizon Europe research and innovation programme through the EBRAINS 2.0 project (grant agreement No. 101147319; SERI contract No. 23.00638).';
}
