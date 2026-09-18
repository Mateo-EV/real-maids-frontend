import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '@/app/admin/features/auth/application/services/auth.service';
import { authGuard, guestGuard } from './auth.guard';

describe('auth guards', () => {
  const authenticated = signal(false);

  beforeEach(() => {
    authenticated.set(false);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isAuthenticated: authenticated.asReadonly() } },
      ],
    });
  });

  it('redirects unauthenticated users to login and preserves the requested URL', () => {
    const router = TestBed.inject(Router);
    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/admin' } as RouterStateSnapshot),
    ) as UrlTree;

    expect(router.serializeUrl(result)).toBe('/login?returnUrl=%2Fadmin');
  });

  it('allows authenticated users into protected routes', () => {
    authenticated.set(true);

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/admin' } as RouterStateSnapshot),
    );

    expect(result).toBe(true);
  });

  it('keeps authenticated users out of the login route', () => {
    authenticated.set(true);
    const router = TestBed.inject(Router);
    const result = TestBed.runInInjectionContext(() =>
      guestGuard({} as ActivatedRouteSnapshot, { url: '/login' } as RouterStateSnapshot),
    ) as UrlTree;

    expect(router.serializeUrl(result)).toBe('/admin');
  });
});
