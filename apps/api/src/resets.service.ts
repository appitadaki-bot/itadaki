import { Injectable } from '@nestjs/common';
import { type Mailer } from '@itadaki/identity/application';
import { InMemoryResetStore, PostgresResetStore } from '@itadaki/identity/infra';
import { elCorreo } from './correo';
import { database } from './database';

/**
 * Composition point for password resets.
 *
 * Uses the real provider when one is configured and falls back to the console
 * otherwise, so a local install keeps working without credentials. In
 * production the fallback is refused outright: a reset flow that silently
 * prints the link to a server log looks like it works, and the person
 * locked out of their own restaurant never receives anything.
 */
@Injectable()
export class ResetsService {
  /*
   * Se elegía siempre el de Postgres, aun con `USE_POSTGRES=false`. Sin base,
   * guardar el pedido fallaba y el mail nunca salía — y la API contestaba
   * `{"sent":true}` igual, porque esa respuesta es la misma exista o no la
   * cuenta, así que todo parecía andar y no llegaba nada.
   */
  readonly store =
    process.env['USE_POSTGRES'] !== 'false'
      ? new PostgresResetStore(database)
      : new InMemoryResetStore();
  readonly mailer: Mailer = elCorreo();
}
