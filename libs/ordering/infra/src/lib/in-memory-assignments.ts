import { type TableAssignment } from '@itadaki/ordering/domain';
import { type Result, ok } from '@itadaki/shared/domain';
import { type AssignmentError } from './postgres-assignments';

/**
 * Qué mozo atiende qué mesa, en memoria, para levantar sin base de datos.
 *
 * Arranca vacío a propósito: una mesa sin mozo asignado la ve todo el salón,
 * que es el estado en el que empieza un turno.
 */
export class InMemoryAssignmentStore {
  /** tenant → pares "mesa mozo". El par en la clave es lo que evita duplicados. */
  private readonly pairs = new Map<string, Set<string>>();

  private setFor(tenantId: string): Set<string> {
    const existing = this.pairs.get(tenantId);
    if (existing !== undefined) return existing;

    const created = new Set<string>();
    this.pairs.set(tenantId, created);
    return created;
  }

  async list(tenantId: string): Promise<Result<readonly TableAssignment[], AssignmentError>> {
    const rows = [...this.setFor(tenantId)]
      .map((pair) => {
        const [tableId = '', staffId = ''] = pair.split(' ');
        return { tableId, staffId };
      })
      .sort((a, b) => a.tableId.localeCompare(b.tableId, 'es', { numeric: true }));

    return ok(rows);
  }

  /** Suma un mozo sin sacar a los que ya estaban: una mesa puede ser compartida. */
  async assign(
    tenantId: string,
    tableId: string,
    staffId: string,
  ): Promise<Result<void, AssignmentError>> {
    this.setFor(tenantId).add(`${tableId} ${staffId}`);
    return ok(undefined);
  }

  /** Sin mozo saca a todos; con mozo saca sólo a ése y deja a los demás. */
  async clear(
    tenantId: string,
    tableId: string,
    staffId?: string,
  ): Promise<Result<void, AssignmentError>> {
    const pairs = this.setFor(tenantId);

    if (staffId === undefined) {
      for (const pair of [...pairs]) {
        if (pair.startsWith(`${tableId} `)) pairs.delete(pair);
      }
      return ok(undefined);
    }

    pairs.delete(`${tableId} ${staffId}`);
    return ok(undefined);
  }
}
