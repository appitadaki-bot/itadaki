import { type Result, err, ok } from '@itadaki/shared/domain';
import { type Database } from '@itadaki/shared/persistence';

export type ResetError =
  | { readonly kind: 'INVALID_TOKEN' }
  | { readonly kind: 'STORAGE_FAILURE'; readonly detail: string };

interface ResetRow {
  token_digest: string;
  tenant_id: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
}

export interface ResetRequest {
  readonly tenantId: string;
  readonly userId: string;
}

export class PostgresResetStore {
  constructor(private readonly db: Database) {}

  /**
   * Records a reset request.
   *
   * Any earlier unused request for the same person is dropped first, so asking
   * twice does not leave two working links in an inbox.
   */
  async create(
    digest: string,
    request: ResetRequest,
    expiresAt: Date,
  ): Promise<Result<void, ResetError>> {
    try {
      await this.db.unscoped(async (client) => {
        await client.query(
          'DELETE FROM password_resets WHERE tenant_id = $1 AND user_id = $2 AND used_at IS NULL',
          [request.tenantId, request.userId],
        );
        await client.query(
          `INSERT INTO password_resets (token_digest, tenant_id, user_id, expires_at)
           VALUES ($1,$2,$3,$4)`,
          [digest, request.tenantId, request.userId, expiresAt],
        );
      });
      return ok(undefined);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /**
   * Consumes a reset token and sets the new password.
   *
   * Both happen in one transaction, and the token is claimed with a conditional
   * update: two clicks racing each other cannot both win, so a link is usable
   * exactly once.
   */
  /**
   * De quién es el token, sin gastarlo.
   *
   * Hace falta para revisar la contraseña contra el contexto —el mail y el
   * nombre del local— antes de escribirla. Revisarla después de consumir
   * llegaría tarde: el token es de un solo uso, así que rechazarla ahí dejaría
   * a alguien con el link gastado y la contraseña vieja.
   *
   * No delata nada que `consume` no diga igual, y no toca `used_at`.
   */
  async deQuienEs(digest: string, now: Date): Promise<Result<ResetRequest | null, ResetError>> {
    try {
      const fila = await this.db.unscoped(async (client) => {
        const filas = await client.query<ResetRow>(
          `SELECT tenant_id, user_id FROM password_resets
            WHERE token_digest = $1 AND used_at IS NULL AND expires_at > $2`,
          [digest, now],
        );
        return filas.rows[0] ?? null;
      });

      return ok(fila === null ? null : { tenantId: fila.tenant_id, userId: fila.user_id });
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  async consume(
    digest: string,
    passwordHash: string,
    now: Date,
  ): Promise<Result<ResetRequest, ResetError>> {
    try {
      return await this.db.unscoped(async (client) => {
        try {
          await client.query('BEGIN');

          const claimed = await client.query<ResetRow>(
            `UPDATE password_resets
                SET used_at = $2
              WHERE token_digest = $1
                AND used_at IS NULL
                AND expires_at > $2
              RETURNING *`,
            [digest, now],
          );

          const row = claimed.rows[0];
          if (row === undefined) {
            await client.query('ROLLBACK');
            return err({ kind: 'INVALID_TOKEN' });
          }

          // staff_users is row-level secured, so the tenant has to be in scope.
          await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', row.tenant_id]);
          // Y destrabada: quien se quedó afuera probando y vino a recuperarla
          // seguiría trabado con la contraseña nueva, sin entender por qué.
          const updated = await client.query(
            `UPDATE staff_users
                SET password_hash = $3, clave_intentos = 0, clave_trabada_hasta = NULL
              WHERE tenant_id = $1 AND id = $2`,
            [row.tenant_id, row.user_id, passwordHash],
          );

          if (updated.rowCount === 0) {
            // The account was removed between request and reset.
            await client.query('ROLLBACK');
            return err({ kind: 'INVALID_TOKEN' });
          }

          await client.query('COMMIT');
          return ok({ tenantId: row.tenant_id, userId: row.user_id });
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);
          return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
        }
      });
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }
}
