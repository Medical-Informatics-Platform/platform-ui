import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

@Component({
  selector: 'app-header',
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  private router = inject(Router);
  authService = inject(AuthService);


  isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  login(): void {
    // Always route back to dashboard after login for a clean start
    this.authService.login();
  }

  goHome(event?: Event): void {
    event?.preventDefault();
    this.router.navigate(['/experiments-dashboard']);
  }

}
