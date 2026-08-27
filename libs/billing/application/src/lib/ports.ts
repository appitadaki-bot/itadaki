import { type Bill } from '@itadaki/billing/domain';
import { type CurrencyCode, type ExchangeRate, type Result } from '@itadaki/shared/domain';

export type BillRepositoryError =
  | { readonly kind: 'NOT_FOUND'; readonly id: string }
  | { readonly kind: 'STORAGE_FAILURE'; readonly detail: string };

/** Lo que se cobró con cada medio de pago, para las métricas. */
export interface CobroPorMedio {
  /** `null` en las cuentas que se cobraron sin declarar con qué. */
  readonly medio: string | null;
  readonly cuentas: number;
  readonly descuentoMinor: number;
}

export interface BillReader {
  findBySession(tenantId: string, sessionId: string): Promise<Result<Bill, BillRepositoryError>>;

  cobrosPorMedio(
    tenantId: string,
    desde: Date,
  ): Promise<Result<readonly CobroPorMedio[], BillRepositoryError>>;
}

export interface BillWriter {
  save(tenantId: string, bill: Bill): Promise<Result<Bill, BillRepositoryError>>;
}

/**
 * Supplies the rate to freeze onto a bill. Kept behind a port so the source
 * (BCRA, a provider, a manual override) can change without touching billing.
 */
export interface ExchangeRateProvider {
  ratesFor(base: CurrencyCode): Promise<readonly ExchangeRate[]>;
}
