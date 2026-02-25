import { Injectable } from '@angular/core';
import { User } from '../models/user.interface';

@Injectable({
  providedIn: 'root'
})
export class TermsService {
  private readonly redirectKey = 'tos_redirect_url';

  hasAgreed(user: User | null | undefined): boolean {
    return Boolean(user?.agreeNDA);
  }

  setRedirectUrl(url: string): void {
    if (!url) {
      return;
    }
    localStorage.setItem(this.redirectKey, url);
  }

  consumeRedirectUrl(): string | null {
    const url = localStorage.getItem(this.redirectKey);
    localStorage.removeItem(this.redirectKey);
    return url;
  }
}
