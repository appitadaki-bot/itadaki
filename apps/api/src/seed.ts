import 'reflect-metadata';
import { TENANT_ID, sembrarCarta } from '@itadaki/catalog/infra';
import { Client } from 'pg';
import { applyMigrations } from './migrate';
import { conexionPostgres } from './db-url';

/**
 * Applies the schema and loads the sample menu.
 *
 * Runs as the owner role because migrations need DDL; the API itself connects
 * as the unprivileged app role so row level security applies to it.
 */
const ADMIN_URL = process.env['DATABASE_ADMIN_URL'] ?? 'postgres://itadaki:itadaki@localhost:5433/itadaki';

async function main(): Promise<void> {
  const client = new Client(conexionPostgres(ADMIN_URL));
  await client.connect();

  const migraciones = await applyMigrations(client);
  for (const archivo of migraciones.aplicadas) {
    console.log(`  ${archivo}`);
  }
  console.log(`schema applied · ${migraciones.salteadas.length} ya estaban`);

  // Set before any write: row level security applies to everyone who is not a
  // superuser, which on a hosted database is the only user there is. Scoping
  // afterwards let this pass locally and fail on Render.
  await client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', TENANT_ID]);

  // The demo tenant, before anything references it.
  //
  // Migration 002 backfills tenants from existing products, which covers a
  // database that already had data but leaves a brand new one empty — and
  // every catalog row below has a foreign key to this table.
  await client.query(
    `INSERT INTO tenants (id, name, slug)
     VALUES ($1, $2, $1)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_ID, 'Restaurante demo'],
  );

  // La carta de ejemplo, la misma que recibe un restaurante de prueba de la
  // landing. Vive en un solo lugar: si se escribiera dos veces, una de las
  // dos iba a quedar vieja.
  await sembrarCarta(client, TENANT_ID);

  const counts = await client.query<{ table_name: string; total: string }>(
    `SELECT 'categories' AS table_name, count(*)::text AS total FROM categories
     UNION ALL SELECT 'products', count(*)::text FROM products
     UNION ALL SELECT 'modifier_groups', count(*)::text FROM modifier_groups`,
  );
  for (const row of counts.rows) {
    console.log(`  ${row.table_name}: ${row.total}`);
  }

  await client.end();
  console.log('seed complete');
}

void main().catch((error: unknown) => {
  console.error('seed failed', error);
  process.exit(1);
});
