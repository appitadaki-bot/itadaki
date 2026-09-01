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

/*
 * Sirve la misma variable con la que se migra.
 *
 * Respaldar pide el rol dueño, igual que migrar: leer todas las tablas de
 * todos los restaurantes no es algo que pueda hacer el rol de la app. Quien
 * viene de correr `db:migrate` ya tiene puesta `DATABASE_ADMIN_URL`, y pedirle
 * otra variable con el mismo valor es una trampa.
 */
const admin = process.env.DATABASE_ADMIN_URL;
const normal = process.env.DATABASE_URL;
const conexion = admin ?? normal;

if (conexion === undefined || conexion === '') {
  console.error('falta DATABASE_ADMIN_URL (o DATABASE_URL): no hay a qué base conectarse');
  process.exit(1);
}

/*
 * Las dos puestas y apuntando a bases distintas.
 *
 * Pasa seguido: se migra con una, después se cambia la otra para respaldar y
 * la primera sigue ganando. Se respalda desarrollo creyendo que es producción,
 * y el archivo queda ahí con nombre de respaldo. Mejor parar y que lo diga una
 * persona.
 */
if (admin !== undefined && normal !== undefined && admin !== normal) {
  const host = (url) => {
    try {
      return new URL(url).hostname;
    } catch {
      return '(ilegible)';
    }
  };
  console.error('DATABASE_ADMIN_URL y DATABASE_URL apuntan a bases distintas:');
  console.error(`  DATABASE_ADMIN_URL -> ${host(admin)}`);
  console.error(`  DATABASE_URL       -> ${host(normal)}`);
  console.error('Dejá una sola, o poné las dos con la base que querés respaldar.');
  process.exit(1);
}

const c = new pg.Client({
  connectionString: conexion,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

/*
 * De dónde salió esto.
 *
 * Se corre con una variable de entorno, y la variable se queda puesta de la
 * vez anterior: respaldar dos veces la misma base creyendo que son dos es
 * fácil, y el archivo no tenía cómo desmentirlo. La contraseña no se imprime;
 * el host sí, que es lo que se reconoce de un vistazo.
 */
const { rows: donde } = await c.query('SELECT current_database() AS base');
const host = new URL(conexion).hostname;
const base = donde[0]?.base ?? '(desconocida)';
console.log(`respaldando ${base} en ${host}`);
console.log('');

/*
 * Las tablas se separan en dos.
 *
 * Las que tienen `tenant_id` son de un restaurante y se leen posicionado en
 * él. El resto —`schema_migrations` es la única hoy— es del esquema y no le
 * pertenece a nadie: leerlas dentro del recorrido las guardaba una vez por
 * restaurante. Con cinco locales, la misma lista de migraciones quedaba cinco
 * veces en el archivo, y el total de filas mentía.
 */
const { rows: tablas } = await c.query(
  `SELECT t.tablename,
          EXISTS (
            SELECT 1 FROM information_schema.columns c
            WHERE c.table_schema = 'public'
              AND c.table_name = t.tablename
              AND c.column_name = 'tenant_id'
          ) AS por_restaurante
     FROM pg_tables t
    WHERE t.schemaname = 'public'
    ORDER BY t.tablename`,
);

const deCadaLocal = tablas.filter((t) => t.por_restaurante);
const delEsquema = tablas.filter((t) => !t.por_restaurante);

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

const copia = {
  generado: new Date().toISOString(),
  origen: { host, base },
  tenants,
  datos: {},
};
let total = 0;

for (const tenant of tenants) {
  await c.query('SELECT set_config($1,$2,false)', ['app.tenant_id', tenant]);
  copia.datos[tenant] = {};

  for (const { tablename } of deCadaLocal) {
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

// Una sola vez, fuera del recorrido.
copia.esquema = {};
for (const { tablename } of delEsquema) {
  const { rows } = await c.query(`SELECT * FROM "${tablename}"`);
  if (rows.length === 0) continue;
  copia.esquema[tablename] = rows;
  total += rows.length;
}
if (Object.keys(copia.esquema).length > 0) {
  console.log('');
  console.log(`  del esquema: ${Object.keys(copia.esquema).join(', ')}`);
}

const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
// El host entra en el nombre: dos archivos de la misma hora y distinto origen
// se distinguen sin abrirlos.
const apodo = host.split('.')[0]?.replace(/[^a-z0-9-]/gi, '') ?? 'base';
const destino = `backups/itadaki-${apodo}-${sello}.json`;
// La carpeta está en .gitignore, así que en un clon nuevo no existe.
await mkdir('backups', { recursive: true });
await writeFile(destino, JSON.stringify(copia, null, 2), 'utf8');
console.log(`\n${total} filas en total -> ${destino}`);
await c.end();
