import { type TableCall } from '@itadaki/ordering/domain';
import { type Result, err, ok } from '@itadaki/shared/domain';
import { type CallError } from './postgres-calls';

/**
 * Los llamados de las mesas, en memoria, para levantar sin base de datos.
 *
 * El servicio de llamados iba a Postgres sin mirar `USE_POSTGRES`, así que con
 * la bandera en `false` la cocina y el salón cargaban y se quedaban en la
 * pantalla de error: lo primero que piden al abrir es la lista de llamados, y
 * eso devolvía STORAGE_FAILURE.
 */
export class InMemoryCallStore {
  /*
   * Los llamados viven en el proceso, no en la instancia.
   *
   * El timbre lo levanta el teléfono del comensal y lo lee la pantalla de la
   * cocina: si cada uno tuviera su propia lista, nadie vería nunca el llamado
   * del otro.
   */
  private static readonly shared: TableCall[] = [];

  private get calls(): TableCall[] {
    return InMemoryCallStore.shared;
  }

  /** Vacía los llamados del proceso; sirve en los tests. */
  static reset(): void {
    InMemoryCallStore.shared.length = 0;
  }

  async raise(call: TableCall): Promise<Result<TableCall, CallError>> {
    this.calls.push(call);
    return ok(call);
  }

  async listPending(tenantId: string): Promise<Result<readonly TableCall[], CallError>> {
    return ok(
      this.calls
        .filter((call) => call.tenantId === tenantId && call.status === 'PENDING')
        .sort((a, b) => a.raisedAt.getTime() - b.raisedAt.getTime()),
    );
  }

  async listForSession(
    tenantId: string,
    sessionId: string,
  ): Promise<Result<readonly TableCall[], CallError>> {
    return ok(
      this.calls
        .filter(
          (call) =>
            call.tenantId === tenantId &&
            call.sessionId === sessionId &&
            call.status === 'PENDING',
        )
        .sort((a, b) => a.raisedAt.getTime() - b.raisedAt.getTime()),
    );
  }

  async acknowledge(
    tenantId: string,
    callId: string,
    at: Date,
  ): Promise<Result<TableCall, CallError>> {
    const index = this.calls.findIndex(
      (call) => call.tenantId === tenantId && call.id === callId && call.status === 'PENDING',
    );
    // Atender dos veces el mismo llamado no es un error de almacenamiento: es
    // que otro mozo llegó primero, y por eso ya no está pendiente.
    if (index === -1) {
      return err({ kind: 'NOT_FOUND', id: callId });
    }

    const attended: TableCall = {
      ...(this.calls[index] as TableCall),
      status: 'ACKNOWLEDGED',
      acknowledgedAt: at,
    };
    this.calls[index] = attended;
    return ok(attended);
  }

  /** Cierra lo que la mesa estaba pidiendo cuando la mesa termina. */
  async closeForSession(
    tenantId: string,
    sessionId: string,
    at: Date,
  ): Promise<Result<number, CallError>> {
    let closed = 0;

    this.calls.forEach((call, index) => {
      if (call.tenantId !== tenantId || call.sessionId !== sessionId) return;
      if (call.status !== 'PENDING') return;

      this.calls[index] = { ...call, status: 'ACKNOWLEDGED', acknowledgedAt: at };
      closed += 1;
    });

    return ok(closed);
  }
}
