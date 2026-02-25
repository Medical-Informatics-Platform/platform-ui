import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SessionStorageService {

  setItem(key: string, value: any) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage write failures (quota/private mode).
    }
  }

  getItem<T>(key: string): T | null {
    try {
      const item = sessionStorage.getItem(key);
      if (!item) return null;
      return JSON.parse(item) as T;
    } catch {
      try {
        sessionStorage.removeItem(key);
      } catch {
        // Ignore storage cleanup failures.
      }
      return null;
    }
  }

  removeItem(key: string) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Ignore storage cleanup failures.
    }
  }
}
