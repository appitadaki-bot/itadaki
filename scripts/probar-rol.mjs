/**
 * Con qué rol entra la API, y si puede saltear el aislamiento.
 *
 * Es lo mismo que el servicio verifica al arrancar, para poder mirarlo desde
 * acá sin esperar un deploy de tres minutos.
 */
import pg from 'pg';

const cadena = process.env.DATABASE_URL ?? '';
if (cadena === '') {
  console.log('Poné DATABASE_URL con la cadena que va a usar la API.');
  console.log('(No cae a DATABASE_ADMIN_URL a propósito: ésa es la del rol que migra,');
  console.log(' y probarla diría que el aislamiento no sirve cuando no es la que se usa.)');
  process.exit(1);
}

const ca = (process.env.DATABASE_CA_CERT ?? '').replaceAll(String.raw`\n`, '\n').trim();
const url = new URL(cadena);
if (ca !== '') url.searchParams.delete('sslmode');

const client = new pg.Client({
  connectionString: url.toString(),
  ...(ca === '' ? {} : { ssl: { ca } }),
});

try {
  await client.connect();
  const { rows } = await client.query(
    `SELECT current_user AS rol, rolsuper AS superusuario, rolbypassrls AS saltea
       FROM pg_roles WHERE rolname = current_user`,
  );
  const r = rows[0];
  // Qué usuario pedía la cadena, para notar si el pooler entró con otro.
  console.log('en la cadena ', decodeURIComponent(new URL(cadena).username));
  console.log('rol          ', r.rol);
  console.log('superusuario ', r.superusuario);
  console.log('BYPASSRLS    ', r.saltea);
  console.log();
  console.log(
    r.superusuario || r.saltea
      ? 'NO SIRVE: con este rol un restaurante ve los datos de otro.'
      : 'Sirve: el aislamiento entre restaurantes se aplica.',
  );

  const { rows: prueba } = await client.query(
    "SELECT count(*)::int AS n FROM tenants",
  );
  console.log('lee tenants  ', prueba[0].n, 'restaurantes');
} catch (error) {
  console.log('falló:', error.code ?? '', error.message);
} finally {
  await client.end().catch(() => {});
}
