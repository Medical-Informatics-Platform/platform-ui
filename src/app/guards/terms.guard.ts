import { inject, Injectable } from '@angular/core';
import { CanActivate, Router, RouterStateSnapshot, ActivatedRouteSnapshot } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { TermsService } from '../services/terms.service';

@Injectable({ providedIn: 'root' })
export class TermsGuard implements CanActivate {
  private termsService = inject(TermsService);
  private authService = inject(AuthService);
  private router = inject(Router);

  constructor() { }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    const currentAuthState = this.authService.authState();
    if (currentAuthState.status === 'authenticated' && this.termsService.hasAgreed(currentAuthState.user)) {
      return of(true);
    }

    return this.authService.onAuthResolved().pipe(
      take(1),
      map((authState) => {
        if (this.termsService.hasAgreed(authState.user)) {
          return true;
        }
        if (state.url && state.url !== '/terms') {
          this.termsService.setRedirectUrl(state.url);
        }
        this.router.navigate(['/terms']);
        return false;
      })
    );
  }
}
