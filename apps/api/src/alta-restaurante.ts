import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { prepareTenant, uniqueSlug, validateCredentials } from '@itadaki/identity/domain';
import { PostgresTenantStore, hashPassword } from '@itadaki/identity/infra';
import { Database } from '@itadaki/shared/persistence';
import { conexionPostgres } from './db-url';

/**
 * Da de alta un restaurante con su dueño.
 *
 * Es la única forma de crear una cuenta: el alta desde el panel se cerró
 * porque los clientes los damos de alta nosotros, con la carta y las mesas ya
 * cargadas. Una cuenta que se creaba sola arrancaba vacía justo cuando le
 * habíamos prometido lo contrario.
 *
 * Uso:
 *   npm run alta:restaurante -- "Nombre del restaurante" dueno@mail.com "Nombre del dueño"
 *
 * El dueño no recibe contraseña de nosotros. Se crea con una al azar que nadie
 * conoce, y la define él entrando al panel y tocando "Olvidé mi contraseña":
 * así nunca pasa por un WhatsApp ni queda en el historial de nadie, y de paso
 * el link del mail prueba que la casilla es suya.
 */
const ADMIN_URL =
  process.env['DATABASE_ADMIN_URL'] ?? 'postgres://itadaki:itadaki@localhost:5433/itadaki';
const PANEL = process.env['ADMIN_APP_URL'] ?? 'https://admin.itadaki.app';

async function main(): Promise<void> {
  const [restaurante, email, nombreDelDueno] = process.argv.slice(2);

  if (restaurante === undefined || email === undefined) {
    console.error('uso: alta:restaurante -- "Nombre del restaurante" dueno@mail.com ["Nombre del dueño"]');
    process.exit(1);
  }

  const nombre = prepareTenant(restaurante);
  if (nombre.isErr()) {
    console.error('nombre de restaurante inválido:', nombre.error.kind);
    process.exit(1);
  }

  // Una contraseña que nadie va a saber: el dueño define la suya.
  const alAzar = randomBytes(32).toString('base64url');
  const credenciales = validateCredentials(email, alAzar);
  if (credenciales.isErr()) {
    console.error('mail inválido:', credenciales.error.kind);
    process.exit(1);
  }

  const database = new Database(conexionPostgres(ADMIN_URL));
  const tenants = new PostgresTenantStore(database);

  try {
    const tomados = await tenants.takenSlugs(nombre.value.slug);
    if (tomados.isErr()) throw new Error(tomados.error.kind);
    const slug = uniqueSlug(nombre.value.slug, tomados.value);

    const creado = await tenants.signUp({
      tenantId: slug,
      name: nombre.value.name,
      slug,
      currency: 'ARS',
      staff: {
        id: randomUUID(),
        email: credenciales.value.email,
        displayName: nombreDelDueno?.trim() || credenciales.value.email.split('@')[0] || 'dueño',
        passwordHash: await hashPassword(credenciales.value.password),
        role: 'OWNER',
      },
    });

    if (creado.isErr()) {
      console.error(
        creado.error.kind === 'EMAIL_TAKEN'
          ? `${credenciales.value.email} ya tiene cuenta en Itadaki.`
          : `no se pudo crear: ${creado.error.kind}`,
      );
      process.exitCode = 1;
      return;
    }

    const { tenant, owner } = creado.value;

    /*
     * Verificado de entrada.
     *
     * El alta la hace el equipo con un mail que el dueño nos dio, así que no
     * hay nada que probar con un link de bienvenida. Y el primer paso del
     * dueño —"Olvidé mi contraseña"— igual manda un link a esa casilla.
     */
    await database.withTenant(tenant.id, async (client) => {
      await client.query('UPDATE staff_users SET email_verified_at = now() WHERE id = $1', [
        owner.id,
      ]);
    });

    console.log();
    console.log(`  Restaurante  ${tenant.name}`);
    console.log(`  Slug         ${tenant.slug}`);
    console.log(`  Dueño        ${owner.displayName} <${owner.email}>`);
    console.log();
    console.log('  Lo que tiene que hacer el dueño:');
    console.log(`    1. Entrar a ${PANEL}`);
    console.log(`    2. Poner ${owner.email} y tocar "Olvidé mi contraseña"`);
    console.log('    3. Abrir el link del mail y elegir su contraseña');
    console.log();
  } finally {
    await database.close();
  }
}

void main().catch((error: unknown) => {
  console.error('falló:', error);
  process.exit(1);
});
