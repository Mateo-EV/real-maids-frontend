import { Result } from '@/app/shared/utils/result';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { LoginParams } from '../../domain/params/login.params';
import { AUTH_REPOSITORY, AuthRepository } from '../../domain/repositories/auth.repository';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly authRepository = inject<AuthRepository>(AUTH_REPOSITORY);

  login(params: LoginParams): Observable<Result> {
    return this.authRepository.login(params);
  }
}
