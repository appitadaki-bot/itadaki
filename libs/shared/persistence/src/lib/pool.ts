import { Pool, type PoolClient } from 'pg';

export interface DatabaseConfig {
  readonly connectionString: string;
  readonly maxConnections?: number;
  /**
   * La CA contra la que verificar, cuando el proveedor firma con una propia.
   *
   * Va por acá y no en la cadena porque `pg` descarta este objeto si la cadena
   * trae `sslmode`: quien la arma tiene que sacarlo.
   */
  readonly ssl?: { readonly ca: string };
}

/**
 * Connection pool that scopes every query to a tenant.
 *
 * `app.tenant_id` is set per checked-out connection and the row level
 * security policies compare against it, so a query that forgets its tenant
 * returns nothing instead of another restaurant's rows.
 */
export class Database {
  private readonly pool: Pool;

  constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      connectionString: config.connectionString,
      ...(config.ssl === undefined ? {} : { ssl: config.ssl }),
      // Row locks mean a busy table's writes queue while holding a connection,
      // so the pool has to be wider than the number of diners who might tap at
      // once. A full pool otherwise stalls requests that touch other tables.
      max: config.maxConnections ?? Number(process.env['DB_POOL_MAX'] ?? 25),
      // Fail a stuck checkout instead of hanging the request forever.
      connectionTimeoutMillis: 10_000,
    });
  }

  /**
   * Runs `work` with the tenant set for the duration of a transaction.
   * `set_config(..., true)` is transaction-local, so a pooled connection can
   * never leak one tenant's scope into the next request.
   */
  async withTenant<T>(tenantId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Admin-level access for migrations and seeding; bypasses tenant scoping. */
  async unscoped<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await work(client);
    } finally {
      client.release();
    }
  }

  /**
   * Si la base contesta, y si no, por qué.
   *
   * Devolvía sólo `true`/`false` y se tragaba el error. El arranque decía
   * "postgres UNREACHABLE — check DATABASE_URL" tanto si la contraseña estaba
   * mal, como si la base ya no existía, como si era TLS o el nombre no
   * resolvía. La causa estaba a una línea de distancia y había que ir a
   * buscarla a mano.
   */
  async healthy(): Promise<{ ok: boolean; motivo: string | null }> {
    try {
      await this.pool.query('SELECT 1');
      return { ok: true, motivo: null };
    } catch (error) {
      // El código de `pg` dice más que el texto: 28P01 es contraseña, 3D000
      // base inexistente, ENOTFOUND un host que no resuelve.
      const codigo = (error as { code?: unknown }).code;
      const detalle = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        motivo: typeof codigo === 'string' && codigo !== '' ? `${codigo}: ${detalle}` : detalle,
      };
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
