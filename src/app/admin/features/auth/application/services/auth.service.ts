import { Injectable } from '@angular/core';
import { AuthRepository } from '../../domain/repositories/auth.repository';
import { LoginCommand } from '../dto/login.command';
import { Observable } from 'rxjs';
import { Result } from '@/app/shared/utils/result';

@Injectable()
export class AuthService {
  constructor(private readonly authRepository: AuthRepository) {}

  login(command: LoginCommand): Observable<Result> {
    return this.authRepository.login(command.email, command.password);
  }
}
