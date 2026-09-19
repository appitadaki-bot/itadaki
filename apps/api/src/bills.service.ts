import { Injectable } from '@nestjs/common';
import {
  type BillReader,
  type BillWriter,
  type ExchangeRateProvider,
} from '@itadaki/billing/application';
import {
  InMemoryBillStore,
  PostgresBillStore,
  PostgresCierres,
  StaticExchangeRates,
} from '@itadaki/billing/infra';
import { database } from './database';
import { log } from './logger';

@Injectable()
export class BillsService {
  readonly store: BillReader & BillWriter =
    process.env['USE_POSTGRES'] !== 'false'
      ? new PostgresBillStore(database)
      : new InMemoryBillStore();

  readonly rates: ExchangeRateProvider = new StaticExchangeRates();

  /**
   * Quién cerró cada mesa.
   *
   * Sin base —una demo local— no se registra nada: no hay dónde, y la
   * alternativa sería negarse a cobrar por no poder auditar.
   */
  readonly cierres =
    process.env['USE_POSTGRES'] !== 'false'
      ? new PostgresCierres(database, (detalle) =>
          log.error('no se pudo registrar quién cerró la mesa', { detalle }),
        )
      : null;
}
