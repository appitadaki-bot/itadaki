import {
  TRIAL_DAYS,
  WARN_WITHIN_DAYS,
  arrancaElTrial,
  canEditConfiguration,
  canTakeOrders,
  graceDaysLeft,
  GRACE_DAYS,
  daysUntil,
  describeSubscription,
  trialEndFor,
} from './subscription';

const NOW = new Date('2026-08-07T12:00:00Z');
const inDays = (days: number): Date => new Date(NOW.getTime() + days * 86_400_000);

const describe_ = (trialEndsAt: Date | null, paid = false) =>
  describeSubscription({ trialEndsAt, paid }, NOW);

describe('trial period', () => {
  it('runs for the advertised month', () => {
    const ends = trialEndFor(NOW);
    expect(daysUntil(ends, NOW)).toBe(TRIAL_DAYS);
  });

  it('is simply TRIAL while there is plenty of time', () => {
    const result = describe_(inDays(20));
    expect(result.status).toBe('TRIAL');
    expect(result.daysLeft).toBe(20);
  });

  it('starts warning a week out, so the lock is never a surprise', () => {
    expect(describe_(inDays(WARN_WITHIN_DAYS)).status).toBe('TRIAL_ENDING');
    expect(describe_(inDays(WARN_WITHIN_DAYS + 1)).status).toBe('TRIAL');
  });

  it('still works on the last day', () => {
    const result = describe_(inDays(1));
    expect(result.status).toBe('TRIAL_ENDING');
    expect(canEditConfiguration(result)).toBe(true);
  });

  it('expires once the deadline passes', () => {
    const result = describe_(inDays(-1));
    expect(result.status).toBe('EXPIRED');
    expect(canEditConfiguration(result)).toBe(false);
  });

  it('reports how far past due it is', () => {
    expect(describe_(inDays(-10)).daysLeft).toBe(-10);
  });

  it('treats a paid restaurant as active regardless of the old deadline', () => {
    const result = describe_(inDays(-90), true);
    expect(result.status).toBe('ACTIVE');
    expect(canEditConfiguration(result)).toBe(true);
    expect(result.daysLeft).toBeNull();
  });

  it('leaves restaurants without a deadline alone', () => {
    // Rows that predate trials: locking them out would punish existing
    // customers for a migration they had no part in.
    const result = describe_(null);
    expect(result.status).toBe('ACTIVE');
    expect(canEditConfiguration(result)).toBe(true);
  });

  it('only ever gates configuration, never the diner-facing app', () => {
    // The API enforces this; the domain states it so the intent is testable.
    const expired = describe_(inDays(-1));
    expect(expired.status).toBe('EXPIRED');
    expect(canEditConfiguration(expired)).toBe(false);
  });
});

describe('daysUntil', () => {
  it('rounds up, so a deadline later today still counts as a day', () => {
    expect(daysUntil(new Date(NOW.getTime() + 3_600_000), NOW)).toBe(1);
  });

  it('is zero exactly at the deadline', () => {
    expect(daysUntil(NOW, NOW)).toBe(0);
  });

  it('goes negative once past', () => {
    expect(daysUntil(new Date(NOW.getTime() - 3_600_000), NOW)).toBe(0);
    expect(daysUntil(inDays(-2), NOW)).toBe(-2);
  });
});

describe('la semana de gracia', () => {
  it('el panel se bloquea el día que vence, pero las mesas siguen', () => {
    const vencido = describe_(inDays(-1), false);

    expect(vencido.status).toBe('EXPIRED');
    expect(canEditConfiguration(vencido)).toBe(false);
    // Lo importante: nadie queda varado a mitad de un servicio.
    expect(canTakeOrders(vencido)).toBe(true);
  });

  it('las mesas siguen todo el último día de gracia', () => {
    const casi = describe_(inDays(-GRACE_DAYS + 1), false);

    expect(canTakeOrders(casi)).toBe(true);
  });

  it('pasada la gracia se corta también el pedido', () => {
    const suspendido = describe_(inDays(-GRACE_DAYS), false);

    expect(suspendido.status).toBe('SUSPENDED');
    expect(canTakeOrders(suspendido)).toBe(false);
    expect(canEditConfiguration(suspendido)).toBe(false);
  });

  it('pagar reactiva todo, aunque haya estado suspendido', () => {
    // El caso de quien vuelve: no puede quedar castigado por haber tardado.
    const alDia = describe_(inDays(-30), true);

    expect(alDia.status).toBe('ACTIVE');
    expect(canTakeOrders(alDia)).toBe(true);
    expect(canEditConfiguration(alDia)).toBe(true);
  });

  it('cuenta los días de gracia que quedan', () => {
    expect(graceDaysLeft(describe_(inDays(-1), false))).toBe(GRACE_DAYS - 1);
    expect(graceDaysLeft(describe_(inDays(-GRACE_DAYS), false))).toBe(0);
  });

  it('quien está al día no tiene cuenta regresiva', () => {
    expect(graceDaysLeft(describe_(null, true))).toBe(GRACE_DAYS);
  });
});

describe('el reloj arranca con el primer pedido', () => {
  /** Una cuenta recién creada: existe, pero nadie pidió nada todavía. */
  const sinEstrenar = describeSubscription(
    { trialEndsAt: null, paid: false, estrenado: false },
    NOW,
  );

  it('una cuenta que nadie usó no está en trial todavía', () => {
    // Quien se anota un martes y recibe la carta el jueves no puede perder
    // dos días de los treinta.
    expect(sinEstrenar.status).toBe('SIN_ESTRENAR');
    expect(sinEstrenar.daysLeft).toBeNull();
  });

  it('sin estrenar se puede usar todo', () => {
    // Hay que poder cargar la carta y probar antes de que el reloj corra.
    expect(canEditConfiguration(sinEstrenar)).toBe(true);
    expect(canTakeOrders(sinEstrenar)).toBe(true);
  });

  it('el primer pedido es el que lo arranca', () => {
    expect(arrancaElTrial(sinEstrenar)).toBe(true);
  });

  it('el segundo pedido ya no lo reinicia', () => {
    // Con fecha puesta, el reloj ya corre: volver a arrancarlo regalaría un
    // trial nuevo con cada pedido.
    const corriendo = describeSubscription(
      { trialEndsAt: inDays(20), paid: false, estrenado: true },
      NOW,
    );

    expect(corriendo.status).toBe('TRIAL');
    expect(arrancaElTrial(corriendo)).toBe(false);
  });

  it('una cuenta vieja sin el campo sigue activa', () => {
    // `estrenado` no existía antes: una cuenta anterior a esto no puede
    // quedar bloqueada porque le falte un dato.
    const vieja = describeSubscription({ trialEndsAt: null, paid: false }, NOW);

    expect(vieja.status).toBe('ACTIVE');
    expect(arrancaElTrial(vieja)).toBe(false);
  });

  it('quien paga no vuelve a estar sin estrenar', () => {
    const pago = describeSubscription(
      { trialEndsAt: null, paid: true, estrenado: false },
      NOW,
    );

    expect(pago.status).toBe('ACTIVE');
    expect(arrancaElTrial(pago)).toBe(false);
  });
});

/**
 * Darse de baja.
 *
 * La landing promete "te damos de baja cuando quieras, desde tu panel" y eso
 * no existía: la única forma era escribirnos. Prometer una salida fácil y no
 * darla es peor que no prometerla — quien quiere irse y no puede lo cuenta.
 *
 * Lo que se cuida acá es que la baja no corte el servicio. El mes ya está
 * pagado, así que el restaurante sigue trabajando hasta que termine: cortar el
 * día que alguien la pide sería quedarse con plata de un servicio que no se
 * dio, y dejar un salón sin sistema en medio del turno.
 */
describe('darse de baja', () => {
  const AHORA = new Date('2026-09-01T12:00:00Z');
  const enQuinceDias = new Date('2026-09-16T12:00:00Z');
  const ayer = new Date('2026-08-31T12:00:00Z');

  it('sigue tomando pedidos hasta que termine el mes pagado', () => {
    const estado = describeSubscription(
      { trialEndsAt: null, paid: true, cancelledAt: AHORA, paidUntil: enQuinceDias },
      AHORA,
    );

    expect(canTakeOrders(estado)).toBe(true);
  });

  it('dice cuántos días le quedan', () => {
    // Es lo que el panel necesita para explicar hasta cuándo tiene servicio.
    const estado = describeSubscription(
      { trialEndsAt: null, paid: true, cancelledAt: AHORA, paidUntil: enQuinceDias },
      AHORA,
    );

    expect(estado.daysLeft).toBe(15);
  });

  it('se distingue de una cuenta activa', () => {
    // El panel tiene que poder decir "no se renueva" sin inventarlo.
    const estado = describeSubscription(
      { trialEndsAt: null, paid: true, cancelledAt: AHORA, paidUntil: enQuinceDias },
      AHORA,
    );

    expect(estado.status).toBe('DADO_DE_BAJA');
  });

  it('cuando se acaba lo pagado, ahí sí se suspende', () => {
    const estado = describeSubscription(
      { trialEndsAt: null, paid: true, cancelledAt: ayer, paidUntil: ayer },
      AHORA,
    );

    expect(estado.status).toBe('SUSPENDED');
    expect(canTakeOrders(estado)).toBe(false);
  });

  it('quien está en prueba conserva los días que le quedaban', () => {
    // Se cortaba en el acto: la baja miraba sólo `paidUntil`, que en una
    // prueba es null. Pedir no renovar no es pedir que te corten hoy.
    const estado = describeSubscription(
      { trialEndsAt: enQuinceDias, paid: false, cancelledAt: AHORA, paidUntil: null },
      AHORA,
    );

    expect(estado.status).toBe('DADO_DE_BAJA');
    expect(estado.daysLeft).toBe(15);
    expect(canTakeOrders(estado)).toBe(true);
  });

  it('y cuando termina la prueba, ahí sí se corta', () => {
    const estado = describeSubscription(
      { trialEndsAt: ayer, paid: false, cancelledAt: ayer, paidUntil: null },
      AHORA,
    );

    expect(estado.status).toBe('SUSPENDED');
  });

  it('una cuenta de cortesía sigue andando después de la baja', () => {
    // `paid` a secas es el servicio que damos nosotros: no tiene vencimiento
    // contra el cual esperar, así que tampoco tiene por qué cortarse hoy.
    const estado = describeSubscription(
      { trialEndsAt: null, paid: true, cancelledAt: AHORA, paidUntil: null },
      AHORA,
    );

    expect(estado.status).toBe('DADO_DE_BAJA');
    expect(canTakeOrders(estado)).toBe(true);
  });

  it('manda la fecha más lejana de las dos', () => {
    // Quien pagó después de la prueba tiene las dos fechas; vale la del mes
    // pago, que es la que todavía no venció.
    const estado = describeSubscription(
      { trialEndsAt: ayer, paid: false, cancelledAt: AHORA, paidUntil: enQuinceDias },
      AHORA,
    );

    expect(estado.status).toBe('DADO_DE_BAJA');
    expect(estado.daysLeft).toBe(15);
  });

  it('sin nada que respetar, la baja corta enseguida', () => {
    // Una cuenta que nunca arrancó: sin prueba corriendo ni mes pagado, no
    // hay nada que esperar.
    const estado = describeSubscription(
      { trialEndsAt: null, paid: false, cancelledAt: AHORA, paidUntil: null },
      AHORA,
    );

    expect(estado.status).toBe('SUSPENDED');
  });

  it('sin baja pedida, nada cambia', () => {
    // El caso de siempre: que agregar esto no toque a quien no lo usó.
    const estado = describeSubscription({ trialEndsAt: null, paid: true }, AHORA);

    expect(estado.status).toBe('ACTIVE');
  });
});

/**
 * Quién puede volver desde el panel, y quién no.
 *
 * `SUSPENDED` se llega por dos caminos que no se parecen en nada: el que se
 * dio de baja y se le terminó el mes, y el que dejó de pagar. Al primero la
 * puerta tiene que abrirle para los dos lados —se fue desde el panel, tiene
 * que poder volver desde el panel—; al segundo no, porque nunca se fue.
 *
 * Antes los dos veían el mismo cartel de "escribinos y lo resolvemos", y
 * quien se había dado de baja se quedaba sin forma de volver solo.
 */
describe('volver a suscribirse', () => {
  const hace = (dias: number, desde: Date): Date =>
    new Date(desde.getTime() + dias * 24 * 60 * 60 * 1000);

  const ahora = new Date('2026-09-05T12:00:00Z');

  it('quien se dio de baja y todavía tiene mes queda DADO_DE_BAJA', () => {
    const sub = describeSubscription(
      { trialEndsAt: null, paid: true, paidUntil: hace(10, ahora), cancelledAt: hace(-2, ahora) },
      ahora,
    );

    expect(sub.status).toBe('DADO_DE_BAJA');
    expect(sub.seDioDeBaja).toBe(true);
  });

  /** El caso que no tenía salida: se dio de baja y se le venció el mes. */
  it('y sigue marcado como tal cuando se le termina el mes', () => {
    const sub = describeSubscription(
      { trialEndsAt: null, paid: true, paidUntil: hace(-3, ahora), cancelledAt: hace(-40, ahora) },
      ahora,
    );

    expect(sub.status).toBe('SUSPENDED');
    // Lo que hace que el panel le ofrezca volver en vez de "escribinos".
    expect(sub.seDioDeBaja).toBe(true);
  });

  /** Quien dejó de pagar sin avisar no se dio de baja: le falta pagar. */
  it('quien dejó de pagar no figura como dado de baja', () => {
    const sub = describeSubscription(
      { trialEndsAt: hace(-40, ahora), paid: false, paidUntil: null, cancelledAt: null },
      ahora,
    );

    expect(sub.status).toBe('SUSPENDED');
    expect(sub.seDioDeBaja).toBe(false);
  });

  it('ni el que está al día', () => {
    const sub = describeSubscription(
      { trialEndsAt: null, paid: true, paidUntil: hace(20, ahora), cancelledAt: null },
      ahora,
    );

    expect(sub.status).toBe('ACTIVE');
    expect(sub.seDioDeBaja).toBe(false);
  });

  it('ni el que está en el trial', () => {
    const sub = describeSubscription(
      { trialEndsAt: hace(5, ahora), paid: false, paidUntil: null, cancelledAt: null },
      ahora,
    );

    expect(sub.seDioDeBaja).toBe(false);
  });
});
