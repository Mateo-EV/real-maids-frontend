import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { DEMO_AUTH } from '../../auth.demo';
import { AuthInMemorySource } from './auth-in-memory.source';

describe('AuthInMemorySource', () => {
  it('creates a session for the demo credentials', async () => {
    const source = new AuthInMemorySource();

    const loginResult = await firstValueFrom(source.login(DEMO_AUTH));
    const sessionResult = await firstValueFrom(source.me());

    expect(loginResult.success).toBe(true);
    expect(sessionResult.success).toBe(true);
    if (sessionResult.success) {
      expect(sessionResult.data.email).toBe(DEMO_AUTH.email);
      expect(sessionResult.data.name).toBe(DEMO_AUTH.name);
    }
  });

  it('rejects invalid credentials', async () => {
    const source = new AuthInMemorySource();

    const result = await firstValueFrom(
      source.login({ email: 'unknown@realmaids.com', password: 'incorrecta' }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_CREDENTIALS');
    }
  });

  it('removes the active session on logout', async () => {
    const source = new AuthInMemorySource();

    await firstValueFrom(source.login(DEMO_AUTH));
    source.logout();
    const result = await firstValueFrom(source.me());

    expect(result.success).toBe(false);
  });
});
