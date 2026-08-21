import { type DailySummary } from '@itadaki/analytics/domain';
import { type Result, err, ok } from '@itadaki/shared/domain';
import { type Database } from '@itadaki/shared/persistence';

export type SummaryError = { readonly kind: 'STORAGE_FAILURE'; readonly detail: string };

interface Row {
  day: Date;
  orders: number;
  cancelled: number;
  revenue_minor: string;
  currency: string;
  median_prep_minutes: number | null;
  orders_by_hour: number[];
  top_products: { productId: string; name: string; quantity: number }[];
}

const toSummary = (row: Row): DailySummary => ({
  day: row.day,
  orders: row.orders,
  cancelled: row.cancelled,
  // bigint llega como texto desde Postgres.
  revenueMinor: Number(row.revenue_minor),
  currency: row.currency,
  medianPrepMinutes: row.median_prep_minutes,
  ordersByHour: row.orders_by_hour ?? [],
  topProducts: row.top_products ?? [],
});

/**
 * Los resúmenes diarios de venta.
 *
 * Viven acá y no en una biblioteca propia porque se escriben en la misma
 * operación que borra los pedidos: resumir y limpiar es una sola cosa, y
 * separarlas dejaría abierta la posibilidad de borrar sin haber resumido.
 */
export class PostgresSummaryStore {
  constructor(private readonly db: Database) {}

  /**
   * Guarda el resumen de un día.
   *
   * Reescribe si ya existía: recalcular un día es válido, y así un barrido que
   * corre dos veces deja el mismo resultado en vez de duplicar.
   */
  async save(tenantId: string, summary: DailySummary): Promise<Result<void, SummaryError>> {
    try {
      await this.db.withTenant(tenantId, async (client) => {
        await client.query(
          `INSERT INTO daily_summaries
             (tenant_id, day, orders, cancelled, revenue_minor, currency,
              median_prep_minutes, orders_by_hour, top_products)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (tenant_id, day) DO UPDATE SET
             orders = EXCLUDED.orders,
             cancelled = EXCLUDED.cancelled,
             revenue_minor = EXCLUDED.revenue_minor,
             currency = EXCLUDED.currency,
             median_prep_minutes = EXCLUDED.median_prep_minutes,
             orders_by_hour = EXCLUDED.orders_by_hour,
             top_products = EXCLUDED.top_products`,
          [
            tenantId,
            summary.day,
            summary.orders,
            summary.cancelled,
            summary.revenueMinor,
            summary.currency,
            summary.medianPrepMinutes,
            JSON.stringify(summary.ordersByHour),
            JSON.stringify(summary.topProducts),
          ],
        );
      });
      return ok(undefined);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /** Los días de un rango, para responder una consulta del panel. */
  async between(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<Result<readonly DailySummary[], SummaryError>> {
    try {
      const rows = await this.db.withTenant(tenantId, async (client) => {
        const result = await client.query<Row>(
          `SELECT * FROM daily_summaries
            WHERE day >= $1::date AND day <= $2::date
            ORDER BY day`,
          [from, to],
        );
        return result.rows;
      });
      return ok(rows.map(toSummary));
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }
}
