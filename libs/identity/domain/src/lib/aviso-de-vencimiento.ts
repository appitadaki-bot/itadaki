import { GRACE_DAYS, type SubscriptionStatus } from './subscription';

/**
 * El correo que avisa que la suscripción venció y arrancó la semana de gracia.
 *
 * El corte no es de un día para el otro: el panel se bloquea al vencer, pero
 * las mesas siguen pidiendo una semana más. Sin este aviso esa semana no
 * existe para el dueño — se entera cuando el sábado a la noche las mesas dejan
 * de pedir, que es el peor momento posible y ya sin margen para hacer nada.
 *
 * Vive en el dominio y no en el script que lo manda para poder probar qué dice
 * y a quién se le manda sin base de datos ni proveedor de correo.
 */

const DIA = 86_400_000;

export interface RestauranteVencido {
  readonly tenantId: string;
  readonly nombre: string;
  /** A quién avisarle: el dueño. Vacío si la cuenta no tiene uno activo. */
  readonly email: string;
  readonly status: SubscriptionStatus;
  /** Cuándo venció. Null en las cuentas que nunca arrancaron el reloj. */
  readonly vencioAt: Date | null;
  /** Cuándo se le avisó, si ya se le avisó. */
  readonly avisadoAt: Date | null;
}

/**
 * A quién le toca el aviso.
 *
 * Sólo a quien está dentro de la semana de gracia: el correo dice "te quedan
 * N días" y mandárselo a alguien que ya está cortado sería mentirle. Y una
 * sola vez —de ahí `avisadoAt`—, porque esto corre todos los días y nadie
 * quiere el mismo mail siete veces.
 */
export function hayQueAvisar(restaurante: RestauranteVencido): boolean {
  return (
    restaurante.status === 'EXPIRED' &&
    restaurante.avisadoAt === null &&
    restaurante.email !== '' &&
    restaurante.vencioAt !== null
  );
}

/** Hasta cuándo las mesas siguen pidiendo. */
export function finDeLaGracia(vencioAt: Date): Date {
  return new Date(vencioAt.getTime() + GRACE_DAYS * DIA);
}

/** Cuántos días de gracia le quedan, contando hoy. */
export function diasDeGraciaQueQuedan(vencioAt: Date, ahora: Date): number {
  const quedan = Math.ceil((finDeLaGracia(vencioAt).getTime() - ahora.getTime()) / DIA);
  return Math.max(0, quedan);
}

export interface CorreoDeVencimiento {
  readonly subject: string;
  readonly body: string;
}

function enCriollo(fecha: Date): string {
  return fecha.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

/**
 * Qué dice el correo.
 *
 * Tres cosas y en este orden: qué dejó de andar, qué sigue andando y hasta
 * cuándo, y qué hacer. Sin la segunda el dueño cierra el mail creyendo que ya
 * se quedó sin sistema en pleno servicio; sin la tercera sabe que tiene un
 * problema y no cómo resolverlo.
 */
export function correoDeVencimiento(
  restaurante: { nombre: string; vencioAt: Date },
  ahora: Date,
): CorreoDeVencimiento {
  const dias = diasDeGraciaQueQuedan(restaurante.vencioAt, ahora);
  const corte = enCriollo(finDeLaGracia(restaurante.vencioAt));

  return {
    subject: `${restaurante.nombre}: tu suscripción venció, las mesas siguen hasta el ${corte}`,
    body: [
      `Hola, ${restaurante.nombre}.`,
      '',
      'Se venció la suscripción a itadaki. El panel quedó de sólo lectura: podés',
      'seguir viendo todo, pero no cambiar la carta ni los precios.',
      '',
      `Las mesas siguen pidiendo con normalidad ${dias} ${dias === 1 ? 'día' : 'días'} más, hasta el ${corte}.`,
      'Nadie se va a quedar sin poder pedir en medio de un servicio.',
      '',
      'Para que siga todo andando, entrá a tu panel y renovás desde ahí. Si algo',
      'no cuadra o querés hablarlo, respondé este correo y lo vemos.',
      '',
      'Gracias por usar itadaki.',
    ].join('\n'),
  };
}
