import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import { type Permission, type TrialInput, trialEndFor } from '@itadaki/identity/domain';
import { type AuthedRequest, TrialGuard } from './auth';

const NOW = new Date();
const inDays = (days: number): Date => new Date(NOW.getTime() + days * 86_400_000);

class TestableGuard extends TrialGuard {
  constructor(permission: Permission | undefined, trial: TrialInput | null) {
    super({ getAllAndOverride: () => permission } as unknown as Reflector);
    this.lookUp = async () => trial;
  }
}

const contextFor = (request: AuthedRequest): ExecutionContext =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const signedIn = (method = 'POST'): AuthedRequest =>
  ({
    headers: {},
    method,
    auth: { userId: 'u1', tenantId: 't1', role: 'OWNER', displayName: 'Ana' },
  }) as unknown as AuthedRequest;

const expired: TrialInput = { trialEndsAt: inDays(-1), paid: false };
const running: TrialInput = { trialEndsAt: inDays(10), paid: false };

describe('TrialGuard', () => {
  it('blocks menu edits once the trial is over', async () => {
    const guard = new TestableGuard('menu:write', expired);
    await expect(guard.canActivate(contextFor(signedIn()))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('blocks team changes once the trial is over', async () => {
    const guard = new TestableGuard('staff:manage', expired);
    await expect(guard.canActivate(contextFor(signedIn()))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  /*
   * `GET /staff` pide `staff:manage`, el mismo permiso que dar de alta: el
   * guard lo bloqueaba junto con las escrituras. El panel de un local vencido
   * recibía la lista vacía y avisaba que las mesas habían quedado sin mozo
   * "porque ya no trabaja acá" — no se había borrado a nadie, no se los pudo
   * leer.
   */
  it('deja leer al equipo aunque la cuenta esté vencida', async () => {
    const guard = new TestableGuard('staff:manage', expired);
    await expect(guard.canActivate(contextFor(signedIn('GET')))).resolves.toBe(true);
  });

  it('deja leer la carta aunque la cuenta esté vencida', async () => {
    const guard = new TestableGuard('menu:write', expired);
    await expect(guard.canActivate(contextFor(signedIn('GET')))).resolves.toBe(true);
  });

  it('sigue bloqueando todo lo que cambia algo', async () => {
    for (const metodo of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const guard = new TestableGuard('staff:manage', expired);
      await expect(guard.canActivate(contextFor(signedIn(metodo)))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    }
  });

  it('sin método declarado, se trata como escritura', async () => {
    // El lado seguro de equivocarse: dejar pasar una escritura sería peor.
    const guard = new TestableGuard('staff:manage', expired);
    const sinMetodo = { headers: {}, auth: { tenantId: 't1' } } as unknown as AuthedRequest;
    await expect(guard.canActivate(contextFor(sinMetodo))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('still lets the owner read their own menu', async () => {
    const guard = new TestableGuard('menu:read', expired);
    await expect(guard.canActivate(contextFor(signedIn()))).resolves.toBe(true);
  });

  it('never stops the kitchen from working', async () => {
    // The whole point of gating configuration only: an expired trial must not
    // strand a room full of diners mid-service.
    for (const permission of ['orders:read', 'orders:advance'] as Permission[]) {
      const guard = new TestableGuard(permission, expired);
      await expect(guard.canActivate(contextFor(signedIn()))).resolves.toBe(true);
    }
  });

  it('never stops a bill from being closed', async () => {
    const guard = new TestableGuard('bills:close', expired);
    await expect(guard.canActivate(contextFor(signedIn()))).resolves.toBe(true);
  });

  it('leaves diner routes alone — they carry no permission at all', async () => {
    const guard = new TestableGuard(undefined, expired);
    await expect(guard.canActivate(contextFor(signedIn()))).resolves.toBe(true);
  });

  it('allows edits while the trial is running', async () => {
    const guard = new TestableGuard('menu:write', running);
    await expect(guard.canActivate(contextFor(signedIn()))).resolves.toBe(true);
  });

  it('allows edits for a paid restaurant with a long-past trial', async () => {
    const guard = new TestableGuard('menu:write', { trialEndsAt: inDays(-90), paid: true });
    await expect(guard.canActivate(contextFor(signedIn()))).resolves.toBe(true);
  });

  it('allows edits when no trial was ever recorded', async () => {
    const guard = new TestableGuard('menu:write', { trialEndsAt: null, paid: false });
    await expect(guard.canActivate(contextFor(signedIn()))).resolves.toBe(true);
  });

  it('fails open when the lookup itself fails', async () => {
    // A database blip must not lock a paying restaurant out of its own panel.
    const guard = new TestableGuard('menu:write', null);
    await expect(guard.canActivate(contextFor(signedIn()))).resolves.toBe(true);
  });

  it('allows edits on the final day of the trial', async () => {
    const guard = new TestableGuard('menu:write', { trialEndsAt: inDays(1), paid: false });
    await expect(guard.canActivate(contextFor(signedIn()))).resolves.toBe(true);
  });

  it('gives a brand new restaurant the full month', async () => {
    const guard = new TestableGuard('menu:write', {
      trialEndsAt: trialEndFor(NOW),
      paid: false,
    });
    await expect(guard.canActivate(contextFor(signedIn()))).resolves.toBe(true);
  });
});
