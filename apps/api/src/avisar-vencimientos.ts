import 'reflect-metadata';
import { ConsoleMailer, type Mailer } from '@itadaki/identity/application';
import {
  correoDeVencimiento,
  describeSubscription,
  hayQueAvisar,
  type RestauranteVencido,
} from '@itadaki/identity/domain';
import { ResendMailer } from '@itadaki/identity/infra';
import { Client } from 'pg';
import { withSslWhenRemote } from './db-url';

/**
 * Avisa por correo a los restaurantes cuya suscripción venció.
 *
 * Corre todos los días, de un cron. El panel se bloquea al vencer y las mesas
 * siguen una semana más; sin este correo, esa semana no existe para el dueño y
 * se entera cuando las mesas dejan de pedir en pleno servicio.
 *
 * Idempotente: cada restaurante recibe un solo correo por vencimiento, y la
 * marca se borra sola cuando la suscripción vuelve a moverse.
 *
 * Uso:
 *   avisar-vencimientos          manda los que correspondan
 *   avisar-vencimientos --secos  dice a quién le tocaría, sin mandar nada
 */
const ADMIN_URL =
  process.env['DATABASE_ADMIN_URL'] ?? 'postgres://itadaki:itadaki@localhost:5433/itadaki';

interface Row {
  id: string;
  name: string;
  trial_ends_at: string | null;
  paid: boolean;
  paid_until: string | null;
  cancelled_at: string | null;
  estrenado: boolean;
  vencimiento_avisado_at: string | null;
}

const fecha = (valor: string | null): Date | null => (valor === null ? null : new Date(valor));

const CONSULTA = `
  SELECT id,
         name,
         trial_ends_at,
         paid,
         paid_until,
         cancelled_at,
         estrenado,
         vencimiento_avisado_at
    FROM tenants
   WHERE active
`;

/**
 * El mail del dueño.
 *
 * Renovar es una decisión suya, no del mozo ni del cocinero. Si hay dos
 * socios, al primero que se dio de alta: mandarlo a los dos hace que cada uno
 * suponga que se ocupa el otro.
 *
 * `staff_users` tiene RLS en modo FORCE, así que hay que pararse en el
 * restaurante antes de leer: sin `app.tenant_id` la consulta no falla, devuelve
 * cero filas, y el proceso concluiría que ningún local tiene dueño.
 */
async function dueñoDe(client: Client, tenantId: string): Promise<string> {
  await client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', tenantId]);

  const { rows } = await client.query<{ email: string }>(
    `SELECT email
       FROM staff_users
      WHERE tenant_id = $1 AND role = 'OWNER' AND active
      ORDER BY created_at
      LIMIT 1`,
    [tenantId],
  );

  return rows[0]?.email ?? '';
}

function comoVencido(row: Row, email: string, ahora: Date): RestauranteVencido {
  // El mes pago vence solo: `paid` a secas es la cortesía nuestra, que no
  // vence. Es la misma cuenta que hace el panel para decidir si está al día.
  const hasta = fecha(row.paid_until);
  const alDia = row.paid || (hasta !== null && hasta > ahora);

  const estado = describeSubscription(
    {
      trialEndsAt: fecha(row.trial_ends_at),
      paid: alDia,
      cancelledAt: fecha(row.cancelled_at),
      paidUntil: hasta,
      estrenado: row.estrenado,
    },
    ahora,
  );

  return {
    tenantId: row.id,
    nombre: row.name,
    email,
    status: estado.status,
    vencioAt: estado.trialEndsAt,
    avisadoAt: fecha(row.vencimiento_avisado_at),
  };
}

function elMensajero(): Mailer {
  const resend = ResendMailer.fromEnvironment();
  if (resend !== null) return resend;

  // En producción, no mandar nada es peor que fallar: el restaurante se
  // entera del corte cuando las mesas dejan de pedir.
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'RESEND_API_KEY y MAIL_FROM son obligatorios: sin ellos nadie se entera de que su suscripción venció',
    );
  }
  return new ConsoleMailer();
}

async function main(): Promise<void> {
  const secos = process.argv.includes('--secos');
  const ahora = new Date();
  const mensajero = secos ? null : elMensajero();

  const client = new Client({ connectionString: withSslWhenRemote(ADMIN_URL) });
  await client.connect();

  let avisados = 0;
  let fallados = 0;

  try {
    const { rows } = await client.query<Row>(CONSULTA);

    for (const row of rows) {
      // El mail se busca sólo para los que lo van a necesitar: una consulta
      // por restaurante, y la mayoría está al día.
      const sinMail = comoVencido(row, '', ahora);
      if (sinMail.status !== 'EXPIRED' || sinMail.avisadoAt !== null) continue;

      const restaurante = comoVencido(row, await dueñoDe(client, row.id), ahora);

      /*
       * Un vencido sin dueño al que escribirle no se puede avisar, pero
       * tampoco se puede tapar: alguien tiene que enterarse de que ese
       * restaurante se va a cortar sin haber recibido nada.
       */
      if (restaurante.email === '') {
        console.warn(`  ${row.id}: vencido y sin dueño activo a quién avisarle`);
        continue;
      }

      if (!hayQueAvisar(restaurante) || restaurante.vencioAt === null) continue;

      const correo = correoDeVencimiento(
        { nombre: restaurante.nombre, vencioAt: restaurante.vencioAt },
        ahora,
      );

      if (mensajero === null) {
        console.log(`  ${row.id}: le tocaría a ${restaurante.email} — ${correo.subject}`);
        continue;
      }

      try {
        await mensajero.send({ to: restaurante.email, ...correo });
      } catch (error) {
        // Se sigue con los demás: que el proveedor rechace un correo no puede
        // dejar sin avisar a todo el resto.
        fallados += 1;
        console.error(`  ${row.id}: no se pudo mandar a ${restaurante.email}:`, error);
        continue;
      }

      /*
       * La marca se escribe recién después de que el correo salió. Al revés,
       * un fallo del proveedor dejaba al restaurante marcado como avisado sin
       * que nadie le hubiera avisado nada.
       */
      await client.query('UPDATE tenants SET vencimiento_avisado_at = $2 WHERE id = $1', [
        row.id,
        ahora,
      ]);
      avisados += 1;
      console.log(`  ${row.id}: avisado a ${restaurante.email}`);
    }

    console.log(
      secos ? 'nada mandado (--secos)' : `${avisados} avisados${fallados > 0 ? `, ${fallados} fallados` : ''}`,
    );
  } finally {
    await client.end();
  }

  // Que el cron lo vea rojo: si los correos no salen, hay que enterarse.
  if (fallados > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error('falló:', error);
  process.exit(1);
});
