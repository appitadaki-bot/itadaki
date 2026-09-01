/**
 * Copia la base entera a un archivo JSON, restaurante por restaurante.
 *
 * Las tablas tienen RLS en modo FORCE, así que una consulta sin `app.tenant_id`
 * devuelve cero filas — también para el dueño de la base. Un respaldo que sale
 * vacío y parece correcto es peor que no tenerlo: se descubre el día que hay
 * que restaurar. Por eso se recorre tenant por tenant y se cuenta al final.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import pg from 'pg';

if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL === '') {
  console.error('falta DATABASE_URL: sin eso no hay a qué base conectarse');
  process.exit(1);
}

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const { rows: tablas } = await c.query(
  `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
);

// Los tenants se leen con un scope especial: la tabla se filtra por su propio id.
await c.query("SELECT set_config('app.tenant_id','__login__',false)");
let tenants;
try {
  const { rows } = await c.query('SELECT id FROM tenants');
  tenants = rows.map((r) => r.id);
} catch {
  // Si ni la lista de restaurantes se puede leer, lo que sigue sale vacío.
  tenants = [];
}

if (tenants.length === 0) {
  console.error('no se pudo listar los restaurantes: el respaldo saldría vacío');
  process.exit(1);
}

const copia = { generado: new Date().toISOString(), tenants, datos: {} };
let total = 0;

for (const tenant of tenants) {
  await c.query('SELECT set_config($1,$2,false)', ['app.tenant_id', tenant]);
  copia.datos[tenant] = {};

  for (const { tablename } of tablas) {
    const { rows } = await c.query(`SELECT * FROM "${tablename}"`);
    if (rows.length === 0) continue;
    copia.datos[tenant][tablename] = rows;
    total += rows.length;
  }

  const tablasConDatos = Object.keys(copia.datos[tenant]).length;
  const filas = Object.values(copia.datos[tenant]).reduce((s, r) => s + r.length, 0);
  console.log(`  ${tenant.padEnd(28)} ${tablasConDatos} tablas · ${filas} filas`);
}

if (total === 0) {
  console.error('\nel respaldo salió vacío: algo está mal, no se guarda');
  process.exit(1);
}

const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const destino = `backups/itadaki-${sello}.json`;
// La carpeta está en .gitignore, así que en un clon nuevo no existe.
await mkdir('backups', { recursive: true });
await writeFile(destino, JSON.stringify(copia, null, 2), 'utf8');
console.log(`\n${total} filas en total -> ${destino}`);
await c.end();
