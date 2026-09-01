/**
 * Vuelve a poner lo que hay en un respaldo.
 *
 * Es el otro lado de `backup-hosted.mjs`. Un respaldo que nunca se restauró es
 * una suposición: esto existe para poder probar la vuelta completa antes de
 * necesitarla de verdad.
 *
 * Repone lo que falta y no toca lo que está. Una restauración que borra para
 * dejar la base igual al archivo es lo que hace falta cuando se perdió todo,
 * pero el caso de todos los días es otro: alguien borró un plato y lo quiere
 * de vuelta. Reponer no puede empeorar nada; vaciar sí.
 *
 *   DATABASE_ADMIN_URL='postgresql://...' npm run db:restore:hosted backups/archivo.json
 */
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const archivo = process.argv[2];
if (archivo === undefined) {
  console.error('falta el archivo: npm run db:restore:hosted backups/itadaki-....json');
  process.exit(1);
}

const conexion = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
if (conexion === undefined || conexion === '') {
  console.error('falta DATABASE_ADMIN_URL (o DATABASE_URL): no hay a qué base conectarse');
  process.exit(1);
}

const copia = JSON.parse(await readFile(archivo, 'utf8'));
const destino = new URL(conexion).hostname;

console.log(`archivo  ${archivo}`);
console.log(`  de     ${copia.origen?.host ?? '(no lo dice)'} · ${copia.generado}`);
console.log(`  a      ${destino}`);

/*
 * Restaurar en otra base que la de origen es una decisión, no un descuido.
 *
 * Cargar los datos de desarrollo sobre producción es de las cosas que no se
 * deshacen. Se puede hacer —para eso está la bandera— pero hay que escribirla.
 */
if (copia.origen?.host !== undefined && copia.origen.host !== destino && !process.argv.includes('--a-otra-base')) {
  console.error('\nEl respaldo es de otra base. Si es a propósito, agregá --a-otra-base.');
  process.exit(1);
}

const c = new pg.Client({ connectionString: conexion, ssl: { rejectUnauthorized: false } });
await c.connect();

/** Inserta las filas que falten; las que ya están se dejan como están. */
async function reponer(tabla, filas) {
  const columnas = Object.keys(filas[0]);
  const lista = columnas.map((columna) => `"${columna}"`).join(', ');
  const huecos = columnas.map((_, i) => `$${i + 1}`).join(', ');
  let puestas = 0;

  for (const fila of filas) {
    const resultado = await c.query(
      `INSERT INTO "${tabla}" (${lista}) VALUES (${huecos}) ON CONFLICT DO NOTHING`,
      columnas.map((columna) => fila[columna]),
    );
    puestas += resultado.rowCount ?? 0;
  }
  return puestas;
}

/*
 * Se intenta de nuevo hasta que deje de haber progreso.
 *
 * Las tablas se referencian entre sí —un pedido necesita su mesa, una mesa su
 * restaurante— y mantener el orden a mano se rompe la primera vez que alguien
 * agrega una tabla. Repetir mientras algo entre llega al mismo lugar sin que
 * nadie tenga que acordarse.
 */
async function reponerTodo(nombre, tablas) {
  let pendientes = Object.entries(tablas).filter(([, filas]) => filas.length > 0);
  let puestas = 0;

  while (pendientes.length > 0) {
    const fallaron = [];
    let enEstaVuelta = 0;

    for (const [tabla, filas] of pendientes) {
      try {
        enEstaVuelta += await reponer(tabla, filas);
      } catch (error) {
        fallaron.push([tabla, filas, error]);
      }
    }

    if (fallaron.length === pendientes.length) {
      console.error(`\n${nombre}: no se pudo con ${fallaron.map(([t]) => t).join(', ')}`);
      for (const [tabla, , error] of fallaron) console.error(`  ${tabla}: ${error.message}`);
      await c.end();
      process.exit(1);
    }

    puestas += enEstaVuelta;
    pendientes = fallaron.map(([tabla, filas]) => [tabla, filas]);
  }
  return puestas;
}

let total = 0;

// El esquema primero: los restaurantes cuelgan de él.
if (copia.esquema !== undefined) {
  total += await reponerTodo('esquema', copia.esquema);
}

for (const tenant of copia.tenants) {
  await c.query('SELECT set_config($1,$2,false)', ['app.tenant_id', tenant]);
  const puestas = await reponerTodo(tenant, copia.datos[tenant] ?? {});
  total += puestas;
  console.log(`  ${tenant.padEnd(28)} ${puestas} fila(s) repuesta(s)`);
}

console.log(
  total === 0
    ? '\nNo faltaba nada: la base ya tenía todo lo del respaldo.'
    : `\n${total} fila(s) repuesta(s).`,
);
await c.end();
