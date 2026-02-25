import { HttpInterceptorFn } from '@angular/common/http';

const absoluteUrlPattern = /^https?:\/\//i;

export const withCredentialsInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.withCredentials && !absoluteUrlPattern.test(req.url)) {
    return next(req.clone({ withCredentials: true }));
  }
  return next(req);
};
