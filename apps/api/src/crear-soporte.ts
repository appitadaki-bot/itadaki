import 'reflect-metadata';
import { validatePassword } from '@itadaki/identity/domain';
import { hashPassword } from '@itadaki/identity/infra';
import { Client } from 'pg';
import { withSslWhenRemote } from './db-url';

/**
 * Crea la cuenta con la que entramos a armarle la carta a un local nuevo.
 *
 * A mano y contra la base, no por la API: es una llave maestra que abre
 * cualquier restaurante, así que crearla tiene que costar y no puede salir
 * de un panel donde alcanza con tener una sesión.
 *
 *   node dist/api/apps/api/src/crear-soporte.js soporte@itadaki.app <clave>
 *
 * La cuenta vive en su propio tenant —`soporte`— que no es un restaurante
 * real: sólo existe para que la fila tenga dónde apoyarse. El local al que
 * entra se elige en cada login.
 */
const ADMIN_URL =
  process.env['DATABASE_ADMIN_URL'] ?? 'postgres://itadaki:itadaki@localhost:5433/itadaki';

const TENANT = 'soporte';

async function main(): Promise<void> {
  const [email, password] = process.argv.slice(2);

  if (email === undefined || password === undefined) {
    console.error('uso: crear-soporte <email> <contraseña>');
    process.exit(1);
  }

  const revisada = validatePassword(password);
  if (revisada.isErr()) {
    console.error('contraseña inválida:', revisada.error.kind);
    process.exit(1);
  }

  const client = new Client({ connectionString: withSslWhenRemote(ADMIN_URL) });
  await client.connect();

  // Row level security aplica a todo el que no sea superusuario, que en una
  // base administrada son todos. Sin esto el INSERT no coincide con ninguna
  // política, no escribe nada, y reporta éxito igual.
  await client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', TENANT]);

  await client.query(
    `INSERT INTO tenants (id, name, slug) VALUES ($1, 'Soporte Itadaki', $1)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT],
  );

  const hash = await hashPassword(password);
  const id = email.split('@')[0] ?? 'soporte';

  await client.query(
    `INSERT INTO staff_users (tenant_id, id, email, display_name, password_hash, role, active, email_verified_at)
     VALUES ($1,$2,$3,$4,$5,'SOPORTE',true, now())
     ON CONFLICT (tenant_id, id) DO UPDATE SET
       password_hash = EXCLUDED.password_hash, active = true`,
    [TENANT, id, email.toLowerCase(), id, hash],
  );

  // El INSERT silencioso es el modo en que esto falla: se confirma la fila
  // en vez de confiar en que corrió.
  const control = await client.query<{ total: string }>(
    "SELECT count(*)::text AS total FROM staff_users WHERE email = $1 AND role = 'SOPORTE'",
    [email.toLowerCase()],
  );
  if (control.rows[0]?.total === '0') {
    console.error('no se guardó: la política de aislamiento descartó la fila.');
    await client.end();
    process.exit(1);
  }

  console.log(`cuenta de soporte lista: ${email}`);
  console.log('entra con POST /auth/soporte { email, password, local }');
  await client.end();
}

void main();
