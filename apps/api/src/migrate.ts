import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type Client } from 'pg';
import { type MigracionAplicada, modificadas, pendientes } from './migraciones-pendientes';

/**
 * Aplica el esquema, y nada más.
 *
 * Vive aparte del sembrado porque contra una base con un restaurante adentro
 * lo único que hay que correr es esto: `db:seed` termina cargando la carta de
 * demostración, que en producción es basura con la que después hay que pelear.
 *
 * Cada archivo se aplica una sola vez en la vida de una base. Antes corrían
 * todos en cada despliegue, y eso hacía que un archivo viejo se reaplicara
 * sobre datos que nacieron después: una restricción de pagos rechazando un
 * valor que ella misma autorizó dos archivos más adelante, una función cuyo
 * tipo de retorno ya había cambiado, un UPDATE marcando verificadas cuentas
 * que estaban esperando su mail. Tres veces, con tres síntomas que no se
 * parecían a su causa.
 */

const DIRECTORIO = 'libs/shared/persistence/src/lib/migrations';

/**
 * El registro de lo aplicado.
 *
 * No es una migración: tiene que existir antes de poder leer cuáles corrieron.
 * Por eso se crea acá y no en un `.sql`.
 */
const CREAR_REGISTRO = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       text        PRIMARY KEY,
    checksum   text        NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

const huella = (sql: string): string =>
  createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);

export interface ResultadoMigracion {
  /** Las que se aplicaron en esta corrida. */
  readonly aplicadas: readonly string[];
  /** Las que ya estaban y no se volvieron a tocar. */
  readonly salteadas: readonly string[];
  /** Las que cambiaron después de haberse aplicado, que no vuelven a correr. */
  readonly modificadas: readonly string[];
}

export async function applyMigrations(client: Client): Promise<ResultadoMigracion> {
  // Del código fuente y no del compilado: `tsc` no copia los `.sql`, y el
  // esquema es algo que el repositorio tiene, no algo que el build produce.
  const dir = join(process.cwd(), DIRECTORIO);
  const archivos = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();

  const contenidos = new Map<string, string>();
  for (const archivo of archivos) {
    contenidos.set(archivo, await readFile(join(dir, archivo), 'utf-8'));
  }

  await client.query(CREAR_REGISTRO);

  const registradas = await client.query<MigracionAplicada>(
    'SELECT name, checksum FROM schema_migrations',
  );

  const faltan = pendientes(archivos, registradas.rows);
  const huellas = new Map([...contenidos].map(([name, sql]) => [name, huella(sql)]));

  for (const archivo of faltan) {
    const sql = contenidos.get(archivo) ?? '';

    // Cada una en su propia transacción: si falla, no queda a medias ni
    // registrada, y el próximo intento la vuelve a encontrar pendiente.
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
        [archivo, huellas.get(archivo)],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }

  return {
    aplicadas: faltan,
    salteadas: archivos.filter((archivo) => !faltan.includes(archivo)),
    modificadas: modificadas(huellas, registradas.rows),
  };
}
