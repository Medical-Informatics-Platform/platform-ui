import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from "../../services/auth.service";

@Component({
  selector: 'app-account-page',
  imports: [CommonModule, RouterModule],
  templateUrl: './account-page.component.html',
  styleUrls: ['./account-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccountPageComponent {
  public authService = inject(AuthService);
  private location = inject(Location);

  userName = computed(() => this.authService.authState().user?.fullname ?? '');
  userEmail = computed(() => this.authService.authState().user?.email ?? '');

  constructor() { }

  signOut(): void {
    this.authService.logout();
  }

  goBack(): void {
    this.location.back();
  }
}
