import { inject, Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable } from 'rxjs';
import { filter, map, take, tap } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  private authService = inject(AuthService);

  constructor() { }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    // wait for intitialisationt to finish
    return this.authService.authState$.pipe(
      filter((authState) => authState.status !== 'checking'), // wait to stop checking
      take(1),
      tap((authState) => {
        if (authState.status !== 'authenticated') {
          // Always send users to dashboard after auth to avoid unintended routes
          this.authService.login(state.url);
        }
      }),
      map((authState) => authState.status === 'authenticated')
    );
  }
}
