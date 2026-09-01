import { type Result, err, ok } from '@itadaki/shared/domain';
import { InMemoryStaffStore } from './in-memory-staff';
import { type ResetError, type ResetRequest } from './postgres-resets';

/**
 * Los pedidos de recuperación, sin base de datos.
 *
 * Faltaba: `ResetsService` armaba siempre el de Postgres, aun con
 * `USE_POSTGRES=false`. Sin base, guardar el pedido fallaba y el mail nunca
 * salía — la API contestaba `{"sent":true}` igual, porque esa respuesta es la
 * misma exista o no la cuenta, así que el flujo entero parecía andar y no
 * llegaba nada.
 *
 * Eso hacía que la recuperación de contraseña no se pudiera probar en local,
 * que es justamente donde hay que probarla antes de tocar producción.
 */
export class InMemoryResetStore {
  /**
   * Compartido entre instancias, como el del personal.
   *
   * Nest arma un servicio por módulo y el pedido se guarda en uno y se consume
   * desde otro: con el mapa por instancia, el link siempre saldría vencido.
   */
  private static readonly pedidos = new Map<
    string,
    { request: ResetRequest; expiresAt: Date; usado: boolean }
  >();

  async create(
    digest: string,
    request: ResetRequest,
    expiresAt: Date,
  ): Promise<Result<void, ResetError>> {
    // Como en Postgres: pedirlo dos veces no deja dos links vivos en la
    // casilla, porque el viejo se descarta.
    for (const [clave, pedido] of InMemoryResetStore.pedidos) {
      if (
        pedido.request.userId === request.userId &&
        pedido.request.tenantId === request.tenantId &&
        !pedido.usado
      ) {
        InMemoryResetStore.pedidos.delete(clave);
      }
    }

    InMemoryResetStore.pedidos.set(digest, { request, expiresAt, usado: false });
    return ok(undefined);
  }

  async consume(
    digest: string,
    passwordHash: string,
    now: Date,
  ): Promise<Result<ResetRequest, ResetError>> {
    const pedido = InMemoryResetStore.pedidos.get(digest);

    // Un token que no existe, uno vencido y uno ya usado dan el mismo error:
    // decir cuál fue le confirma a quien prueba tokens que acertó uno.
    if (pedido === undefined || pedido.usado || pedido.expiresAt <= now) {
      return err({ kind: 'INVALID_TOKEN' });
    }

    // Se marca antes de tocar nada: dos toques del mismo link no pueden ganar
    // los dos, igual que la actualización condicional de Postgres.
    pedido.usado = true;

    const persona = [...InMemoryStaffStore.compartidas.values()].find(
      (fila) => fila.id === pedido.request.userId,
    );
    if (persona === undefined) {
      return err({ kind: 'INVALID_TOKEN' });
    }

    InMemoryStaffStore.compartidas.set(persona.email.toLowerCase(), {
      ...persona,
      passwordHash,
    });

    return ok(pedido.request);
  }
}
