import { UserSession } from '@/app/admin/features/auth/domain/entities/user-session.entity';
import { Result } from '@/app/shared/utils/result';
import { Observable } from 'rxjs';

export abstract class AuthRepository {
  abstract login(email: string, password: string): Observable<Result>;
  abstract me(): Observable<Result<UserSession>>;
}
