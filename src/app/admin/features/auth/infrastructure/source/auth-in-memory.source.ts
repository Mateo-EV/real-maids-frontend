import { Injectable } from '@angular/core';
import { LoginParams } from '../../domain/params/login.params';
import { delay, Observable } from 'rxjs';
import { Result } from '@/app/shared/utils/result';
import { UserSession } from '../../domain/entities/user-session.entity';

@Injectable({ providedIn: 'root' })
export class AuthInMemorySource {
  login(_: LoginParams): Observable<Result> {
    return new Observable<Result>((observer) => {
      observer.next(Result.success(undefined));
      observer.complete();
    }).pipe(delay(500));
  }
  me(): Observable<Result<UserSession>> {
    return new Observable<Result<UserSession>>((observer) => {
      observer.next(Result.success(UserSession.create('Mateo Rioja', 'mateo@realmaids.com')));
      observer.complete();
    }).pipe(delay(500));
  }
}
