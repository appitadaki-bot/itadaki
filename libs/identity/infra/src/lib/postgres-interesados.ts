import { type Interesado } from '@itadaki/identity/domain';
import { type Result, err, ok } from '@itadaki/shared/domain';
import { type Database } from '@itadaki/shared/persistence';

export type InteresadoStoreError = { readonly kind: 'NO_SE_PUDO'; readonly detail: string };

/**
 * Guarda a los que dejaron sus datos antes de tener cuenta.
 *
 * `unscoped` porque todavía no hay restaurante: la tabla vive fuera del
 * aislamiento por local, igual que el registro de migraciones.
 */
export class PostgresInteresadoStore {
  constructor(private readonly db: Database) {}

  async guardar(
    id: string,
    interesado: Interesado,
  ): Promise<Result<Interesado, InteresadoStoreError>> {
    try {
      await this.db.unscoped(async (client) => {
        await client.query(
          `INSERT INTO interesados
             (id, local, nombre, whatsapp, email, mesas, carta_como, carta_link)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            id,
            interesado.local,
            interesado.nombre,
            interesado.whatsapp,
            interesado.email,
            interesado.mesas,
            interesado.carta,
            interesado.cartaLink,
          ],
        );
      });
      return ok(interesado);
    } catch (error) {
      return err({ kind: 'NO_SE_PUDO', detail: String(error) });
    }
  }
}
