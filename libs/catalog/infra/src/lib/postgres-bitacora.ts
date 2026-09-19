import { type CambioEnLaCarta } from '@itadaki/catalog/domain';
import { type Database } from '@itadaki/shared/persistence';

/** Quién hizo el cambio, tal como se guarda. */
export interface Actor {
  readonly id: string;
  readonly nombre: string;
  readonly rol: string;
}

export interface EntradaDeBitacora extends CambioEnLaCarta {
  readonly actor: Actor;
  readonly cuando: Date;
}

/**
 * La bitácora de la carta.
 *
 * Escribir acá nunca puede voltear la operación que se está auditando: si
 * falla el registro, el plato igual se guardó. Perder una línea de bitácora
 * es malo; dejar al dueño sin poder cambiar un precio porque la auditoría
 * tuvo un problema es peor.
 */
export class PostgresBitacora {
  constructor(private readonly db: Database) {}

  async registrar(tenantId: string, entrada: EntradaDeBitacora): Promise<void> {
    try {
      await this.db.withTenant(tenantId, async (client) => {
        await client.query(
          `INSERT INTO carta_bitacora
             (tenant_id, entidad, entidad_id, accion, antes, despues,
              actor_id, actor_nombre, actor_rol, cuando)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            tenantId,
            entrada.entidad,
            entrada.entidadId,
            entrada.accion,
            entrada.antes,
            entrada.despues,
            entrada.actor.id,
            entrada.actor.nombre,
            entrada.actor.rol,
            entrada.cuando,
          ],
        );
      });
    } catch {
      // A propósito en silencio: ver arriba.
    }
  }

  /**
   * Lo último que pasó en esta carta.
   *
   * Con tope: la bitácora crece sin límite y el panel muestra las últimas,
   * que es lo que alguien revisa cuando pregunta "¿quién tocó esto?".
   */
  async ultimos(
    tenantId: string,
    tope = 50,
  ): Promise<readonly (EntradaDeBitacora & { id: string })[]> {
    try {
      return await this.db.withTenant(tenantId, async (client) => {
        const result = await client.query<{
          id: string;
          entidad: string;
          entidad_id: string | null;
          accion: string;
          antes: string | null;
          despues: string | null;
          actor_id: string;
          actor_nombre: string;
          actor_rol: string;
          cuando: string;
        }>(
          `SELECT id::text, entidad, entidad_id, accion, antes, despues,
                  actor_id, actor_nombre, actor_rol, cuando
             FROM carta_bitacora
            ORDER BY cuando DESC
            LIMIT $1`,
          [tope],
        );

        return result.rows.map((fila) => ({
          id: fila.id,
          entidad: fila.entidad as CambioEnLaCarta['entidad'],
          entidadId: fila.entidad_id,
          accion: fila.accion as CambioEnLaCarta['accion'],
          antes: fila.antes,
          despues: fila.despues,
          actor: { id: fila.actor_id, nombre: fila.actor_nombre, rol: fila.actor_rol },
          cuando: new Date(fila.cuando),
        }));
      });
    } catch {
      // Sin bitácora la pantalla se muestra vacía, no rota.
      return [];
    }
  }
}
