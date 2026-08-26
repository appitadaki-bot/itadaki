import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import { GRACE_DAYS, type TrialInput } from '@itadaki/identity/domain';
import { type AuthedRequest, ServicioActivoGuard } from './auth';

/**
 * Cuándo se le cortan los pedidos a un local que no pagó.
 *
 * El panel se bloquea el día que vence el trial, pero las mesas siguen una
 * semana más. Cortar las dos cosas juntas puede dejar una sala llena sin poder
 * pedir en mitad de un viernes a la noche, y un restaurante al que le pasa eso
 * no vuelve — ni paga.
 *
 * Es el único corte que el comensal llega a notar, así que es el último que se
 * aplica y el que más cuidado necesita.
 */

const NOW = new Date();
const inDays = (days: number): Date => new Date(NOW.getTime() + days * 86_400_000);

class GuardDePrueba extends ServicioActivoGuard {
  constructor(marcada: boolean, trial: TrialInput | null) {
    super({ getAllAndOverride: () => marcada } as unknown as Reflector);
    this.lookUp = async () => trial;
  }
}

const contextoDe = (request: AuthedRequest): ExecutionContext =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

/** Un comensal en una mesa, que es quien pasa por acá. */
const enUnaMesa = (): AuthedRequest =>
  ({
    headers: {},
    scope: { tenantId: 't1', tableId: 'mesa-7' },
  }) as unknown as AuthedRequest;

const vencidoAyer: TrialInput = { trialEndsAt: inDays(-1), paid: false };
const enGracia: TrialInput = { trialEndsAt: inDays(-GRACE_DAYS + 1), paid: false };
const suspendido: TrialInput = { trialEndsAt: inDays(-GRACE_DAYS - 1), paid: false };
const alDia: TrialInput = { trialEndsAt: null, paid: true };

describe('cortar los pedidos de un local suspendido', () => {
  it('deja pedir el día después de vencer el trial', async () => {
    // El panel ya está bloqueado, pero la mesa que está comiendo no se entera.
    const guard = new GuardDePrueba(true, vencidoAyer);
    await expect(guard.canActivate(contextoDe(enUnaMesa()))).resolves.toBe(true);
  });

  it('deja pedir durante toda la semana de gracia', async () => {
    const guard = new GuardDePrueba(true, enGracia);
    await expect(guard.canActivate(contextoDe(enUnaMesa()))).resolves.toBe(true);
  });

  it('corta recién cuando se acabó la gracia', async () => {
    const guard = new GuardDePrueba(true, suspendido);
    await expect(guard.canActivate(contextoDe(enUnaMesa()))).rejects.toThrow(ForbiddenException);
  });

  it('un local al día pide sin problema', async () => {
    const guard = new GuardDePrueba(true, alDia);
    await expect(guard.canActivate(contextoDe(enUnaMesa()))).resolves.toBe(true);
  });

  it('no toca las rutas que no toman pedidos', async () => {
    // Ver la carta y pagar la cuenta siguen andando en un local suspendido: la
    // mesa que ya comió tiene que poder irse.
    const guard = new GuardDePrueba(false, suspendido);
    await expect(guard.canActivate(contextoDe(enUnaMesa()))).resolves.toBe(true);
  });

  it('si no se puede leer la suscripción, deja pedir', async () => {
    // Una consulta que falla no puede dejar sin servicio a un local que pagó:
    // el costo de equivocarse para el lado permisivo es una noche gratis, y
    // para el otro lado es un restaurante parado sin motivo.
    const guard = new GuardDePrueba(true, null);
    await expect(guard.canActivate(contextoDe(enUnaMesa()))).resolves.toBe(true);
  });
});
