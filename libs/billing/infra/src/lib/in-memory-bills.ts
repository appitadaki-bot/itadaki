import {
  type BillReader,
  type BillRepositoryError,
  type BillWriter,
  type CobroPorMedio,
  type ExchangeRateProvider,
} from '@itadaki/billing/application';
import { type Bill, isSettled } from '@itadaki/billing/domain';
import { type CurrencyCode, type ExchangeRate, type Result, err, ok } from '@itadaki/shared/domain';

export class InMemoryBillStore implements BillReader, BillWriter {
  private readonly rows = new Map<string, Bill>();

  private key(tenantId: string, sessionId: string): string {
    return `${tenantId}/${sessionId}`;
  }

  /** Las cuentas de un restaurante, sin ver las de los demás. */
  private *deTenant(tenantId: string): Generator<Bill> {
    const prefijo = `${tenantId}/`;
    for (const [clave, bill] of this.rows) {
      if (clave.startsWith(prefijo)) yield bill;
    }
  }

  async findBySession(
    tenantId: string,
    sessionId: string,
  ): Promise<Result<Bill, BillRepositoryError>> {
    const found = this.rows.get(this.key(tenantId, sessionId));
    return found === undefined ? err({ kind: 'NOT_FOUND', id: sessionId }) : ok(found);
  }

  /** Mirrors the Postgres guard: a settled bill is never overwritten. */
  /** Lo mismo que en Postgres: agrupar las cerradas por medio de pago. */
  async cobrosPorMedio(
    tenantId: string,
    desde: Date,
  ): Promise<Result<readonly CobroPorMedio[], BillRepositoryError>> {
    const juntos = new Map<string | null, { cuentas: number; descuentoMinor: number }>();

    for (const bill of this.deTenant(tenantId)) {
      if (bill.status !== 'SETTLED' || bill.closedAt < desde) continue;

      const medio = bill.cobradoCon ?? null;
      const previo = juntos.get(medio) ?? { cuentas: 0, descuentoMinor: 0 };
      juntos.set(medio, {
        cuentas: previo.cuentas + 1,
        descuentoMinor: previo.descuentoMinor + (bill.descuentoMinor ?? 0),
      });
    }

    return ok([...juntos.entries()].map(([medio, datos]) => ({ medio, ...datos })));
  }

  async save(tenantId: string, bill: Bill): Promise<Result<Bill, BillRepositoryError>> {
    const key = this.key(tenantId, bill.sessionId);
    const existing = this.rows.get(key);
    if (existing !== undefined && isSettled(existing) && bill.status !== 'SETTLED') {
      return ok(existing);
    }

    this.rows.set(key, bill);
    return ok(bill);
  }
}

/**
 * Static rates standing in for a live feed. Swapping in a BCRA client changes
 * this class alone; the frozen-rate guarantee lives in the bill, not here.
 */
export class StaticExchangeRates implements ExchangeRateProvider {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async ratesFor(base: CurrencyCode): Promise<readonly ExchangeRate[]> {
    if (base !== 'ARS') return [];

    const capturedAt = this.now();
    return [
      { from: 'ARS', to: 'USD', rate: 0.00068, source: 'static', capturedAt },
      { from: 'ARS', to: 'EUR', rate: 0.00063, source: 'static', capturedAt },
      { from: 'ARS', to: 'BRL', rate: 0.0037, source: 'static', capturedAt },
    ];
  }
}
