/**
 * Free trial state for a restaurant.
 *
 * There is no billing yet, so this is deliberately small: a date, and what the
 * app should do on either side of it. Adding plans later means adding fields
 * here, not rethinking the checks scattered through the API.
 */

/** How long a new restaurant gets before the panel locks. */
export const TRIAL_DAYS = 30;

/** When the warning starts. Enough notice that the lock is never a surprise. */
export const WARN_WITHIN_DAYS = 7;

/**
 * Cuánto siguen tomando pedidos las mesas después de que venció el trial.
 *
 * El panel se bloquea el día 31, pero las mesas siguen una semana más. Cortar
 * las dos cosas juntas puede dejar una sala llena sin poder pedir en mitad de
 * un viernes a la noche, y un restaurante al que le pasa eso no vuelve — ni
 * paga. La semana alcanza para que el dueño vea el aviso, entienda qué pasa y
 * decida, sin que el corte lo agarre de sorpresa en pleno servicio.
 */
export const GRACE_DAYS = 7;

export type SubscriptionStatus =
  /** La cuenta existe pero nadie pidió todavía: el reloj no arrancó. */
  | 'SIN_ESTRENAR'
  /** Inside the free trial, nothing restricted. */
  | 'TRIAL'
  /** Trial is nearly over; the panel warns but still works. */
  | 'TRIAL_ENDING'
  /** Trial ran out. The panel is read-only; diners are unaffected. */
  | 'EXPIRED'
  /** Se acabó también la gracia: no se toman más pedidos. */
  | 'SUSPENDED'
  /** Paid, or granted by us. Full access. */
  | 'ACTIVE';

export interface Subscription {
  readonly status: SubscriptionStatus;
  /** Null once paid: an active subscription has no trial deadline. */
  readonly trialEndsAt: Date | null;
  /** Negative once past due; null when paid. */
  readonly daysLeft: number | null;
}

export interface TrialInput {
  readonly trialEndsAt: Date | null;
  readonly paid: boolean;
  /**
   * Si el restaurante ya usó el sistema alguna vez.
   *
   * El trial arranca con el primer pedido de una mesa, no al crear la cuenta:
   * quien se anota un martes y recibe la carta cargada el jueves perdía dos
   * días de los treinta, y el que más esperaba era justamente el que más
   * ganas tenía. Mide uso, no calendario.
   */
  readonly estrenado?: boolean;
}

const DAY = 86_400_000;

/** Whole days from `now` to `deadline`; 0 means it runs out today. */
export function daysUntil(deadline: Date, now: Date): number {
  // `|| 0` normalises the -0 that Math.ceil returns just past a deadline,
  // which would otherwise reach the UI as "-0 días".
  return Math.ceil((deadline.getTime() - now.getTime()) / DAY) || 0;
}

export function trialEndFor(startedAt: Date): Date {
  return new Date(startedAt.getTime() + TRIAL_DAYS * DAY);
}

export function describeSubscription(input: TrialInput, now: Date): Subscription {
  if (input.paid) {
    return { status: 'ACTIVE', trialEndsAt: null, daysLeft: null };
  }

  if (input.trialEndsAt === null) {
    /*
     * Sin fecha, dos casos distintos.
     *
     * Una cuenta nueva que nadie estrenó todavía: el reloj no arrancó y no
     * hay nada que restringir. Y un restaurante creado antes de que
     * existieran los trials, que se trata como activo — nunca castigar a
     * alguien por una migración nuestra.
     *
     * `estrenado` viene sin definir en el segundo caso, y por eso el default
     * es el permisivo: una cuenta vieja no puede quedar bloqueada porque le
     * falte un campo.
     */
    return {
      status: input.estrenado === false ? 'SIN_ESTRENAR' : 'ACTIVE',
      trialEndsAt: null,
      daysLeft: null,
    };
  }

  const daysLeft = daysUntil(input.trialEndsAt, now);

  // Tres cortes, del más lejano al más cercano: aviso, panel bloqueado, y
  // recién después de la gracia el servicio suspendido.
  const status: SubscriptionStatus =
    daysLeft <= -GRACE_DAYS
      ? 'SUSPENDED'
      : daysLeft <= 0
        ? 'EXPIRED'
        : daysLeft <= WARN_WITHIN_DAYS
          ? 'TRIAL_ENDING'
          : 'TRIAL';

  return { status, trialEndsAt: input.trialEndsAt, daysLeft };
}

/**
 * Si las mesas todavía pueden pedir.
 *
 * Se corta una semana después que el panel, no junto con él: el dueño ya vio
 * el panel bloqueado y tuvo siete días para decidir. Cortar las mesas es lo
 * único que el comensal llega a notar, así que es lo último que se corta.
 */
export function canTakeOrders(subscription: Subscription): boolean {
  return subscription.status !== 'SUSPENDED';
}

/**
 * Si este pedido es el que arranca el reloj.
 *
 * Lo pregunta quien toma el primer pedido de una mesa: hasta ese momento la
 * cuenta existe pero el trial no empezó.
 */
export function arrancaElTrial(subscription: Subscription): boolean {
  return subscription.status === 'SIN_ESTRENAR';
}

/** Cuántos días quedan de gracia; 0 o menos significa suspendido. */
export function graceDaysLeft(subscription: Subscription): number {
  if (subscription.daysLeft === null) return GRACE_DAYS;
  return Math.max(0, GRACE_DAYS + subscription.daysLeft);
}

/**
 * Whether the restaurant may still change its own configuration.
 *
 * Only the owner's panel is gated. Diners keep ordering and the kitchen keeps
 * receiving: an expired trial must never strand a room full of people
 * mid-service, and a restaurant that gets burned that way does not come back.
 */
export function canEditConfiguration(subscription: Subscription): boolean {
  return subscription.status !== 'EXPIRED' && subscription.status !== 'SUSPENDED';
}
