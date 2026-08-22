import { Injectable } from '@nestjs/common';
import { InMemoryStaffStore, PostgresStaffStore } from '@itadaki/identity/infra';
import { database } from './database';

/**
 * El equipo del restaurante.
 *
 * El login iba siempre contra Postgres aunque el resto corriera en memoria, así
 * que levantar el proyecto sin base dejaba el panel, la cocina y el salón
 * inalcanzables: cualquier credencial devolvía "email o contraseña
 * incorrectos", que hace buscar el error en la contraseña y no en la conexión.
 *
 * La misma bandera que el catálogo, para que un solo interruptor deje toda la
 * aplicación andando sin base.
 */
@Injectable()
export class StaffService {
  private readonly usePostgres = process.env['USE_POSTGRES'] !== 'false';

  readonly store: PostgresStaffStore | InMemoryStaffStore = this.usePostgres
    ? new PostgresStaffStore(database)
    : new InMemoryStaffStore();
}
