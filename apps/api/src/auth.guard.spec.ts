import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import { type Permission } from '@itadaki/identity/domain';
import { signToken } from '@itadaki/identity/infra';
import {
  AUTH_SECRET,
  type AuthedRequest,
  AuthGuard,
  forgetActiveState,
  PERMISSION,
  stillEmployed,
} from './auth';

/**
 * `AuthGuard` no tenía test propio — sólo la función `stillEmployed` que usa
 * por dentro (ver `revocation.spec.ts`). Este archivo cubre los cuatro
 * rechazos que quedan logueados: `sin sesión`, `sesión inválida`, `acceso
 * revocado` y `permiso insuficiente`.
 */
class TestableGuard extends AuthGuard {
  constructor(permission: Permission | undefined) {
    super({
      getAllAndOverride: (key: string) => (key === PERMISSION ? permission : undefined),
    } as unknown as Reflector);
  }
}

const contextFor = (request: AuthedRequest): ExecutionContext =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const requestWith = (authorization?: string): AuthedRequest =>
  ({
    headers: authorization === undefined ? {} : { authorization },
    url: '/api/orders',
  }) as unknown as AuthedRequest;

const inHours = (hours: number): number => Date.now() + hours * 3_600_000;

describe('AuthGuard', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('logs a request with no token at all', async () => {
    const guard = new TestableGuard(undefined);

    await expect(guard.canActivate(contextFor(requestWith()))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0]?.[0] as string;
    expect(line).toContain('sin sesión');
    expect(line).toContain('"path":"/api/orders"');
  });

  it('logs a forged or malformed token', async () => {
    const guard = new TestableGuard(undefined);

    await expect(
      guard.canActivate(contextFor(requestWith('Bearer not-a-real-token'))),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0]?.[0] as string;
    expect(line).toContain('sesión inválida');
    expect(line).toContain('"path":"/api/orders"');
  });

  it('logs when a deactivated account keeps trying', async () => {
    const tenantId = 'itadaki';
    const userId = 'u-revoked';
    forgetActiveState(tenantId, userId);
    // Precarga la caché de 60s que ya usa el guard, sin tocar Postgres.
    await stillEmployed(tenantId, userId, async () => false);

    const token = signToken(
      { userId, tenantId, role: 'WAITER', displayName: 'Beto', expiresAt: inHours(1) },
      AUTH_SECRET,
    );
    const guard = new TestableGuard(undefined);

    await expect(
      guard.canActivate(contextFor(requestWith(`Bearer ${token}`))),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0]?.[0] as string;
    expect(line).toContain('acceso revocado');
    expect(line).toContain('"tenantId":"itadaki"');
    expect(line).toContain('"userId":"u-revoked"');

    forgetActiveState(tenantId, userId);
  });

  it('logs when a valid session lacks the permission it asked for', async () => {
    const tenantId = 'itadaki';
    const userId = 'u-forbidden';
    forgetActiveState(tenantId, userId);
    await stillEmployed(tenantId, userId, async () => true);

    const token = signToken(
      { userId, tenantId, role: 'KITCHEN', displayName: 'Cocinero', expiresAt: inHours(1) },
      AUTH_SECRET,
    );
    // KITCHEN no tiene 'staff:manage' — ver libs/identity/domain/src/lib/role.ts.
    const guard = new TestableGuard('staff:manage');

    await expect(
      guard.canActivate(contextFor(requestWith(`Bearer ${token}`))),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0]?.[0] as string;
    expect(line).toContain('permiso insuficiente');
    expect(line).toContain('"permission":"staff:manage"');
    expect(line).toContain('"userId":"u-forbidden"');

    forgetActiveState(tenantId, userId);
  });
});
