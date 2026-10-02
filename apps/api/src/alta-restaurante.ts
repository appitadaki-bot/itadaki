import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { prepareTenant, uniqueSlug, validateCredentials } from '@itadaki/identity/domain';
import {
  PostgresResetStore,
  PostgresTenantStore,
  ResendMailer,
  hashPassword,
  newResetToken,
} from '@itadaki/identity/infra';
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
 * conoce —ni nosotros— y la define él desde el link que le llega por mail al
 * terminar esto: así nunca pasa por un WhatsApp ni queda en el historial de
 * nadie, y lo que no sabemos no lo podemos filtrar.
 *
 * Hace falta `RESEND_API_KEY` y `MAIL_FROM` para que el mail salga. Sin eso
 * el link se imprime acá y hay que mandarlo a mano: el alta sirve igual, pero
 * lo dice en vez de dejar a alguien esperando un correo que nunca se envió.
 */
const ADMIN_URL =
  process.env['DATABASE_ADMIN_URL'] ?? 'postgres://itadaki:itadaki@localhost:5433/itadaki';
const PANEL = process.env['ADMIN_APP_URL'] ?? 'https://admin.itadaki.app';

/**
 * Cuánto vale el link de bienvenida.
 *
 * Mucho más que la hora del de recuperar la contraseña, y por un caso
 * distinto: ese lo pidió alguien que está mirando la pantalla, éste le llega
 * sin aviso a quien habló con nosotros por WhatsApp y abre el mail cuando
 * cierra el local. Una hora lo dejaba afuera casi siempre.
 */
const DIAS_DEL_LINK = 7;

/** Por dónde se nos contesta de verdad. El remitente del mail no recibe. */
const WHATSAPP = 'https://wa.me/5492645135540';

/**
 * El logo, servido por la landing.
 *
 * Una dirección pública y no un adjunto: adjuntarlo obliga a armar el correo
 * en varias partes y queda colgando como archivo descargable en la mitad de
 * los clientes. Es el archivo de la landing, crema sobre oscuro, y por eso la
 * franja del pie va oscura — sobre blanco la palabra no se vería.
 */
const LOGO = 'https://www.itadaki.app/itadaki-logo.png';

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

    const link = await invitar(database, tenant.id, owner.id, owner.displayName, owner.email);

    console.log();
    console.log(`  Restaurante  ${tenant.name}`);
    console.log(`  Slug         ${tenant.slug}`);
    console.log(`  Dueño        ${owner.displayName} <${owner.email}>`);
    console.log();

    if (link === null) {
      console.log(`  Listo. Le mandamos el mail a ${owner.email} con el link para`);
      console.log(`  elegir su contraseña. Vale ${DIAS_DEL_LINK} días.`);
    } else {
      console.log('  OJO: no hay proveedor de correo configurado, así que el mail');
      console.log('  NO se envió. Pasale este link vos:');
      console.log();
      console.log(`    ${link}`);
    }
    console.log();
  } finally {
    await database.close();
  }
}

/**
 * La misma carta, maquetada.
 *
 * Tablas y estilos pegados a cada etiqueta porque es lo único que entienden
 * todos los clientes de correo: Outlook ignora una hoja de estilos y Gmail
 * recorta lo que va en el `<head>`.
 *
 * Nada de lo que importa vive en una imagen. Buena parte de la gente lee el
 * correo con las imágenes apagadas, y si el logo no carga el mensaje tiene
 * que seguir diciéndolo todo.
 */
function maquetado(nombre: string, link: string): string {
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#F1E7DA;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1E7DA">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:18px;overflow:hidden">

        <tr><td style="padding:36px 36px 28px;color:#2A231F">
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6">Hola ${nombre},</p>
          <p style="margin:0 0 26px;font-size:16px;line-height:1.6">
            Te dejamos armado tu restaurante en Itadaki. Entrá acá para elegir tu
            contraseña y empezar a usarlo:
          </p>
          <p style="margin:0 0 26px">
            <a href="${link}" style="display:inline-block;padding:15px 34px;border-radius:100px;background:#2E2722;color:#FAF4EA;font-size:15px;font-weight:bold;text-decoration:none">Elegir mi contraseña</a>
          </p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#4E423A">
            El link vale ${DIAS_DEL_LINK} días y se puede usar una sola vez. Después entrás
            siempre desde <a href="${PANEL}" style="color:#B43A21">${PANEL}</a> con este mismo mail.
          </p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#4E423A">
            Cualquier cosa, <a href="${WHATSAPP}" style="color:#B43A21">escribinos por WhatsApp</a>.
          </p>
        </td></tr>

        <tr><td align="center" style="padding:22px 36px 26px;background:#2E2722">
          <img src="${LOGO}" alt="Itadaki" height="22" style="display:block;height:22px;width:auto;border:0" />
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Le manda al dueño el link para elegir su contraseña.
 *
 * Es el mismo token de un solo uso que usa "Olvidé mi contraseña" y se guarda
 * igual, hasheado: una base filtrada no tiene que entregar un link que
 * funcione. Lo único distinto es cuánto vive y qué dice el texto — "pediste
 * cambiar tu contraseña" se lee raro cuando no pediste nada.
 *
 * Devuelve `null` si el mail salió, o el link si no hay proveedor de correo,
 * para que quien corre el alta lo mande a mano. Lo que no hace es fallar en
 * silencio: un alta que parece completa y deja al dueño esperando un correo
 * que nunca se envió es peor que una que avisa.
 */
async function invitar(
  database: Database,
  tenantId: string,
  userId: string,
  nombre: string,
  email: string,
): Promise<string | null> {
  const { token, digest } = newResetToken();
  const expiresAt = new Date(Date.now() + DIAS_DEL_LINK * 24 * 3_600_000);

  const guardado = await new PostgresResetStore(database).create(
    digest,
    { tenantId, userId },
    expiresAt,
  );
  if (guardado.isErr()) {
    throw new Error(`no se pudo preparar el link de bienvenida: ${guardado.error.kind}`);
  }

  const link = `${PANEL}/?reset=${encodeURIComponent(token)}`;

  // El de verdad o nada: el de consola imprimiría el mail acá y diría que lo
  // envió, que es justo el final confuso que este script tiene que evitar.
  const correo = ResendMailer.fromEnvironment();
  if (correo === null) return link;

  await correo.send({
    to: email,
    subject: 'Tu restaurante en ITADAKI ya está listo',
    body: [
      `Hola ${nombre},`,
      '',
      'Te dejamos armado tu restaurante en Itadaki. Entrá acá para elegir tu',
      'contraseña y empezar a usarlo:',
      link,
      '',
      `El link vale ${DIAS_DEL_LINK} días y se puede usar una sola vez. Después entrás`,
      `siempre desde ${PANEL} con este mismo mail.`,
      '',
      // No "respondenos acá": el remitente no recibe. Ofrecer una puerta que
      // no existe es peor que no ofrecer ninguna — quien conteste se queda
      // esperando una respuesta que nadie va a leer.
      `Cualquier cosa, escribinos por WhatsApp: ${WHATSAPP}`,
    ].join('\n'),
    html: maquetado(nombre, link),
  });

  return null;
}

void main().catch((error: unknown) => {
  console.error('falló:', error);
  process.exit(1);
});
