import { Injectable } from '@nestjs/common';
import { type Interesado } from '@itadaki/identity/domain';
import {
  InMemoryInteresadoStore,
  PostgresInteresadoStore,
  type InteresadoStoreError,
} from '@itadaki/identity/infra';
import { type Result } from '@itadaki/shared/domain';
import { database } from './database';

@Injectable()
export class InteresadosService {
  private readonly store =
    process.env['USE_POSTGRES'] !== 'false'
      ? new PostgresInteresadoStore(database)
      : new InMemoryInteresadoStore();

  async registrar(interesado: Interesado): Promise<Result<Interesado, InteresadoStoreError>> {
    // El id se arma acá y no en la base: sirve para nombrarlo en un mensaje
    // ("el interesado tal") sin tener que ir a buscarlo.
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return this.store.guardar(id, interesado);
  }
}
