import { Injectable } from '@nestjs/common';
import { InMemoryTenantStore, PostgresTenantStore } from '@itadaki/identity/infra';
import { database } from './database';

/** Signup writes to real tables, so there is no in-memory variant. */
@Injectable()
export class TenantsService {
  /*
   * Sin esto el alta fallaba a medias en local: la cuenta se creaba pero
   * guardar el token de verificación fallaba, así que el mail nunca salía.
   */
  readonly store =
    process.env['USE_POSTGRES'] !== 'false'
      ? new PostgresTenantStore(database)
      : new InMemoryTenantStore();
}
