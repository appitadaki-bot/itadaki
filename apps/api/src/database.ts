import { Database } from '@itadaki/shared/persistence';
import { conexionPostgres } from './db-url';

const CONNECTION =
  process.env['DATABASE_URL'] ??
  'postgres://itadaki_app:itadaki_app@localhost:5433/itadaki';

/**
 * Single pool for the process. When Postgres is unreachable the API falls back
 * to the in-memory adapters so the app still runs for a demo — the fallback is
 * announced at boot rather than failing silently.
 */
export const database = new Database(conexionPostgres(CONNECTION));

/** Si la base contesta, y si no, por qué — para poder decirlo en el log. */
export async function estadoDeLaBase(): Promise<{ ok: boolean; motivo: string | null }> {
  return database.healthy();
}

export async function databaseAvailable(): Promise<boolean> {
  return (await database.healthy()).ok;
}
