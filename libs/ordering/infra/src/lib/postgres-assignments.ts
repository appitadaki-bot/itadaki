import { type TableAssignment } from '@itadaki/ordering/domain';
import { type Result, err, ok } from '@itadaki/shared/domain';
import { type Database } from '@itadaki/shared/persistence';

export type AssignmentError = { readonly kind: 'STORAGE_FAILURE'; readonly detail: string };

interface Row {
  table_id: string;
  staff_id: string;
}

/** Qué mozo atiende qué mesa, en Postgres. */
export class PostgresAssignmentStore {
  constructor(private readonly db: Database) {}

  async list(tenantId: string): Promise<Result<readonly TableAssignment[], AssignmentError>> {
    try {
      const rows = await this.db.withTenant(tenantId, async (client) => {
        const result = await client.query<Row>(
          'SELECT table_id, staff_id FROM table_assignments ORDER BY table_id',
        );
        return result.rows;
      });
      return ok(rows.map((row) => ({ tableId: row.table_id, staffId: row.staff_id })));
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /**
   * Suma un mozo a una mesa, sin sacar a los que ya estaban.
   *
   * Antes reemplazaba, y eso obligaba a rehacer el reparto cada vez que dos
   * personas compartían un sector. Asignar dos veces al mismo no duplica: la
   * clave incluye al mozo.
   */
  async assign(
    tenantId: string,
    tableId: string,
    staffId: string,
  ): Promise<Result<void, AssignmentError>> {
    try {
      await this.db.withTenant(tenantId, async (client) => {
        await client.query(
          `INSERT INTO table_assignments (tenant_id, table_id, staff_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (tenant_id, table_id, staff_id) DO UPDATE
             SET assigned_at = now()`,
          [tenantId, tableId, staffId],
        );
      });
      return ok(undefined);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /**
   * Saca a un mozo de una mesa, o a todos si no se dice cuál.
   *
   * Sin mozo es "que la vea todo el salón"; con mozo es sacarlo a él y dejar
   * a los demás, que es lo que hace falta cuando una mesa es compartida.
   */
  async clear(
    tenantId: string,
    tableId: string,
    staffId?: string,
  ): Promise<Result<void, AssignmentError>> {
    try {
      await this.db.withTenant(tenantId, async (client) => {
        if (staffId === undefined) {
          await client.query('DELETE FROM table_assignments WHERE table_id = $1', [tableId]);
          return;
        }
        await client.query(
          'DELETE FROM table_assignments WHERE table_id = $1 AND staff_id = $2',
          [tableId, staffId],
        );
      });
      return ok(undefined);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }
}
