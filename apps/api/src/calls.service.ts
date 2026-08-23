import { Injectable } from '@nestjs/common';
import { InMemoryCallStore, PostgresCallStore } from '@itadaki/ordering/infra';
import { database } from './database';

/**
 * Donde viven los llamados de las mesas.
 *
 * En produccion, Postgres: el timbre lo toca un telefono y lo tiene que ver
 * una pantalla en la cocina, asi que el estado no puede quedarse en un proceso.
 * En memoria alcanza para levantar la app sin base de datos, donde todo corre
 * en el mismo proceso.
 */
@Injectable()
export class CallsService {
  /*
   * Sin esto la cocina y el salon no abrian: lo primero que piden al arrancar
   * es la lista de llamados, y este servicio iba a Postgres aunque
   * `USE_POSTGRES` dijera lo contrario.
   */
  readonly store =
    process.env['USE_POSTGRES'] !== 'false'
      ? new PostgresCallStore(database)
      : new InMemoryCallStore();
}
