import { FooterComponent } from './pages/shared/footer/footer.component';
import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { HeaderComponent } from './pages/shared/header/header.component';
import { RouterModule } from '@angular/router';
import { AuthService } from './services/auth.service';

@Component({
    selector: 'app-root',
    imports: [HeaderComponent, FooterComponent, RouterModule],
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  authService = inject(AuthService);
  title = 'fl-platform';

  ngOnInit() {
    this.authService.initialize();
  }

}
