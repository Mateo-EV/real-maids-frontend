import { inject, Injectable } from '@angular/core';
import { AuthRepository } from '../../domain/repositories/auth.repository';
import { Result } from '@/app/shared/utils/result';
import { Observable } from 'rxjs';
import { LoginParams } from '../../domain/params/login.params';
import { AuthInMemorySource } from '../source/auth-in-memory.source';
import { UserSession } from '../../domain/entities/user-session.entity';
import { AuthError } from '../../application/errors/auth.error';

@Injectable({ providedIn: 'root' })
export class AuthRepositoryImpl implements AuthRepository {
  private readonly source = inject(AuthInMemorySource);

  login(params: LoginParams): Observable<Result<void, AuthError>> {
    return this.source.login(params);
  }

  me(): Observable<Result<UserSession, AuthError>> {
    return this.source.me();
  }

  logout(): void {
    this.source.logout();
  }
}
