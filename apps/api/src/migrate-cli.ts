import 'reflect-metadata';
import { Client } from 'pg';
import { applyMigrations } from './migrate';
import { withSslWhenRemote } from './db-url';

/**
 * Pone al día el esquema de una base que ya tiene datos.
 *
 * Es lo que hay que correr contra producción: `db:seed` hace esto y además
 * carga la carta de demostración, que en la base de un restaurante de verdad
 * es basura que después alguien tiene que ir a borrar plato por plato.
 *
 * Con el rol dueño, porque las migraciones son DDL. La API se conecta con el
 * rol sin privilegios, que es lo que hace que el aislamiento por restaurante
 * también la alcance a ella.
 */
const ADMIN_URL =
  process.env['DATABASE_ADMIN_URL'] ?? 'postgres://itadaki:itadaki@localhost:5433/itadaki';

async function main(): Promise<void> {
  const client = new Client({ connectionString: withSslWhenRemote(ADMIN_URL) });
  await client.connect();

  try {
    for (const file of await applyMigrations(client)) {
      console.log(`  ${file}`);
    }
    console.log('esquema al día');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
