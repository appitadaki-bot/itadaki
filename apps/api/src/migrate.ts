import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type Client } from 'pg';

/**
 * Aplica el esquema, y nada más.
 *
 * Vive aparte del sembrado porque contra una base con un restaurante adentro
 * lo único que hay que correr es esto: `db:seed` termina cargando la carta de
 * demostración, que en producción es basura con la que después hay que pelear.
 *
 * Cada archivo corre entero y en orden de nombre en cada despliegue, así que
 * una migración tiene que poder repetirse sin romperse: `IF NOT EXISTS`,
 * `DROP CONSTRAINT IF EXISTS` antes de crearla, y así.
 */
export async function applyMigrations(client: Client): Promise<readonly string[]> {
  // Del código fuente y no del compilado: `tsc` no copia los `.sql`, y el
  // esquema es algo que el repositorio tiene, no algo que el build produce.
  const dir = join(process.cwd(), 'libs/shared/persistence/src/lib/migrations');
  const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();

  for (const file of files) {
    await client.query(await readFile(join(dir, file), 'utf-8'));
  }

  return files;
}
