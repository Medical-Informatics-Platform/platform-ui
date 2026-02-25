import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ErrorService {
  private errorSubject = new BehaviorSubject<string | null>(null);
  error$ = this.errorSubject.asObservable();

  // Method to set the error message
  setError(message: string): void {
    this.errorSubject.next(message);
  }

  // Method to clear the error message
  clearError(): void {
    this.errorSubject.next(null);
  }
}
