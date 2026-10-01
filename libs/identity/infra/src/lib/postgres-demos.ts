import { type Database } from '@itadaki/shared/persistence';
import { type Result, err, ok } from '@itadaki/shared/domain';

export interface DemoVivo {
  readonly tenantId: string;
  readonly expiraEn: Date;
}

export type DemoError = { readonly kind: 'STORAGE_FAILURE'; readonly detail: string };

interface FilaDemo {
  tenant_id: string;
  expira_en: Date;
}

/**
 * Los restaurantes de prueba, con su vencimiento.
 *
 * Se lee y se escribe sin estar adentro de ningún restaurante: contar cuántos
 * viven y cuáles vencieron son preguntas sobre todos a la vez. Por eso la
 * tabla queda afuera del aislamiento por tenant, como `tenants` misma.
 */
export class PostgresDemos {
  constructor(private readonly db: Database) {}

  async anotar(tenantId: string, expiraEn: Date): Promise<Result<void, DemoError>> {
    try {
      await this.db.unscoped(async (client) => {
        await client.query(
          `INSERT INTO demos (tenant_id, expira_en) VALUES ($1, $2)
           ON CONFLICT (tenant_id) DO UPDATE SET expira_en = EXCLUDED.expira_en`,
          [tenantId, expiraEn],
        );
      });
      return ok(undefined);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /** Cuántos hay vivos ahora mismo, para no pasarse del tope. */
  async cuantosViven(ahora: Date): Promise<Result<number, DemoError>> {
    try {
      const total = await this.db.unscoped(async (client) => {
        const rows = await client.query<{ total: string }>(
          'SELECT count(*)::text AS total FROM demos WHERE expira_en > $1',
          [ahora],
        );
        return Number(rows.rows[0]?.total ?? '0');
      });
      return ok(total);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /** Cuándo vence éste, o null si no es un demo (o ya se barrió). */
  async vencimientoDe(tenantId: string): Promise<Result<Date | null, DemoError>> {
    try {
      const fecha = await this.db.unscoped(async (client) => {
        const rows = await client.query<FilaDemo>(
          'SELECT tenant_id, expira_en FROM demos WHERE tenant_id = $1',
          [tenantId],
        );
        return rows.rows[0]?.expira_en ?? null;
      });
      return ok(fecha);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /**
   * Borra los vencidos y devuelve cuáles fueron.
   *
   * Un `DELETE` sobre `tenants` y no sobre `demos`: la 018 ató toda tabla con
   * `tenant_id` a `tenants` con `ON DELETE CASCADE`, así que esto se lleva la
   * carta, las mesas, la gente, los pedidos y la propia fila de `demos`.
   * Borrar sólo la fila de acá dejaría el restaurante entero huérfano y sin
   * nadie que se acuerde de él.
   */
  async barrerVencidos(ahora: Date): Promise<Result<readonly string[], DemoError>> {
    try {
      const borrados = await this.db.unscoped(async (client) => {
        const rows = await client.query<{ id: string }>(
          `DELETE FROM tenants
            WHERE id IN (SELECT tenant_id FROM demos WHERE expira_en <= $1)
            RETURNING id`,
          [ahora],
        );
        return rows.rows.map((row) => row.id);
      });
      return ok(borrados);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }
}
