import 'reflect-metadata';
import { ROLES, type Role, nuevoPin, validateCredentials } from '@itadaki/identity/domain';
import { hashPassword } from '@itadaki/identity/infra';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';
import { conexionPostgres } from './db-url';

/**
 * Crea una cuenta del personal, directo contra la base.
 *
 *   node create-staff.js <tenantId> <email> <password> [rol]
 *
 * Para cuando no hay por dónde entrar al panel: una base recién migrada, o un
 * local cuyo dueño perdió la contraseña. El alta normal es el panel.
 *
 * Corre con el rol dueño de la base porque también aplica la migración de
 * identidad.
 *
 * A quien entra con usuario y PIN —el salón y la cocina— le genera los dos y
 * los imprime, porque esas pantallas no piden mail. Es el mismo PIN al azar
 * que da el panel.
 */
const ADMIN_URL =
  process.env['DATABASE_ADMIN_URL'] ?? 'postgres://itadaki:itadaki@localhost:5433/itadaki';

/**
 * A qué base apunta esto, en una línea legible.
 *
 * Sin el host a la vista, `DATABASE_ADMIN_URL` sin definir manda la cuenta a
 * la base local y el script dice "cuenta creada" igual, que es verdad y a la
 * vez engañoso: quien creyó estar escribiendo en producción se entera recién
 * cuando esa persona no puede entrar, y para entonces ya no sabe por qué.
 *
 * Pasa fácil con una terminal nueva, donde la variable no viajó.
 *
 * Sin la contraseña, obviamente: esto se imprime en pantalla y queda en el
 * historial de la consola.
 */
function aDondeApunta(url: string): string {
  try {
    const { hostname, port, pathname } = new URL(url);
    return `${hostname}${port === '' ? '' : `:${port}`}${pathname}`;
  } catch {
    return '(no se pudo leer DATABASE_ADMIN_URL)';
  }
}

async function main(): Promise<void> {
  const [tenantId, email, password, rolPedido = 'OWNER'] = process.argv.slice(2);

  if (tenantId === undefined || email === undefined || password === undefined) {
    console.error(`uso: create-staff <tenantId> <email> <password> [${ROLES.join('|')}]`);
    process.exit(1);
  }

  /*
   * Los roles salen de la lista del dominio y no de una copia escrita acá.
   *
   * Esta lista decía OWNER|MANAGER|KITCHEN|WAITER y se quedó vieja cuando
   * apareció CAJA: la herramienta rechazaba un rol que la base sí aceptaba.
   */
  if (!(ROLES as readonly string[]).includes(rolPedido)) {
    console.error(`rol desconocido: ${rolPedido}. Son: ${ROLES.join(', ')}`);
    process.exit(1);
  }
  const role = rolPedido as Role;

  const checked = validateCredentials(email, password);
  if (checked.isErr()) {
    console.error('credenciales inválidas:', checked.error.kind);
    process.exit(1);
  }

  const esLocal = ADMIN_URL.includes('localhost') || ADMIN_URL.includes('127.0.0.1');
  console.log(`base: ${aDondeApunta(ADMIN_URL)}${esLocal ? '  (LOCAL)' : ''}`);
  if (esLocal && process.env['DATABASE_ADMIN_URL'] === undefined) {
    console.log('  DATABASE_ADMIN_URL no está definida, así que va a la base local.');
  }

  const client = new Client(conexionPostgres(ADMIN_URL));
  await client.connect();

  const migration = await readFile(
    join(process.cwd(), 'libs/shared/persistence/src/lib/migrations/002_tenants_and_staff.sql'),
    'utf-8',
  );
  await client.query(migration);

  // Row level security applies to whoever is not a superuser, which on a
  // hosted database is everyone. Without this the INSERT below matches no
  // policy, writes nothing, and still reports success — the account looks
  // created and then cannot log in.
  await client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', tenantId]);

  await client.query(
    `INSERT INTO tenants (id, name, slug) VALUES ($1,$1,$1) ON CONFLICT (id) DO NOTHING`,
    [tenantId],
  );

  const hash = await hashPassword(checked.value.password);
  await client.query(
    `INSERT INTO staff_users (tenant_id, id, email, display_name, password_hash, role)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (tenant_id, id) DO UPDATE SET
       password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, active = true`,
    [
      tenantId,
      checked.value.email.split('@')[0] ?? 'user',
      checked.value.email,
      checked.value.email.split('@')[0] ?? 'staff',
      hash,
      role,
    ],
  );

  // A silent no-op is the failure mode this script had; confirm the row is
  // really there rather than trusting that the INSERT ran.
  const check = await client.query<{ total: string }>(
    'SELECT count(*)::text AS total FROM staff_users WHERE email = $1',
    [checked.value.email],
  );
  if (check.rows[0]?.total === '0') {
    console.error(
      'la cuenta no se guardó: la política de aislamiento descartó la fila. ' +
        'Revisá que DATABASE_ADMIN_URL apunte a la base correcta.',
    );
    await client.end();
    process.exit(1);
  }

  console.log(`cuenta creada: ${checked.value.email} (${role}) en ${tenantId}`);

  /*
   * Y su usuario y PIN, salvo que sea el dueño.
   *
   * Todo el personal que da de alta el panel lleva usuario y PIN, incluido el
   * de caja: `entraConPin` decide qué ofrece la pantalla de login, no quién
   * tiene uno. Una cuenta creada acá sin PIN queda sin forma de entrar al
   * salón ni a la cocina, que no piden mail.
   *
   * El dueño no: entra con su mail y su contraseña, que es la que se pasó por
   * argumento.
   *
   * Se imprime una sola vez, porque lo que se guarda es el hash. Si se pierde
   * se regenera desde el panel; no hay dónde ir a leerlo.
   */
  if (role !== 'OWNER') {
    const usuario = (checked.value.email.split('@')[0] ?? 'staff')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 20);
    const pin = nuevoPin();

    await client.query(
      `UPDATE staff_users SET username = $3, pin_hash = $4, pin_intentos = 0,
              pin_trabado_hasta = NULL
        WHERE tenant_id = $1 AND email = $2`,
      [tenantId, checked.value.email, usuario, await hashPassword(pin)],
    );

    const quedo = await client.query<{ username: string | null }>(
      'SELECT username FROM staff_users WHERE tenant_id = $1 AND email = $2',
      [tenantId, checked.value.email],
    );
    if (quedo.rows[0]?.username !== usuario) {
      console.error('el usuario no se guardó: la cuenta no va a poder entrar al salón.');
      await client.end();
      process.exit(1);
    }

    console.log(`  entra al salón con  usuario: ${usuario}   PIN: ${pin}`);
    console.log('  (el PIN se muestra una sola vez; se regenera desde el panel)');
  }

  await client.end();
}

void main().catch((error: unknown) => {
  console.error('falló:', error);
  process.exit(1);
});
