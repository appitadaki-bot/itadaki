import {
  correoDeVencimiento,
  diasDeGraciaQueQuedan,
  finDeLaGracia,
  hayQueAvisar,
  type RestauranteVencido,
} from './aviso-de-vencimiento';
import { GRACE_DAYS, describeSubscription } from './subscription';

const DIA = 86_400_000;
const VENCIO = new Date('2026-03-10T12:00:00Z');

const vencido = (cambios: Partial<RestauranteVencido> = {}): RestauranteVencido => ({
  tenantId: 'don-pepe',
  nombre: 'Don Pepe',
  email: 'dueno@donpepe.com',
  status: 'EXPIRED',
  vencioAt: VENCIO,
  avisadoAt: null,
  ...cambios,
});

describe('a quién le toca el aviso de vencimiento', () => {
  it('al que venció y todavía no recibió nada', () => {
    expect(hayQueAvisar(vencido())).toBe(true);
  });

  it('una sola vez, aunque el proceso corra todos los días', () => {
    expect(hayQueAvisar(vencido({ avisadoAt: new Date('2026-03-10T13:00:00Z') }))).toBe(false);
  });

  it('no al que está en prueba, ni al que está al día', () => {
    expect(hayQueAvisar(vencido({ status: 'TRIAL' }))).toBe(false);
    expect(hayQueAvisar(vencido({ status: 'TRIAL_ENDING' }))).toBe(false);
    expect(hayQueAvisar(vencido({ status: 'ACTIVE' }))).toBe(false);
  });

  it('no al que ya se le terminó la gracia', () => {
    // El correo dice "te quedan N días": mandárselo a alguien ya cortado
    // sería mentirle.
    expect(hayQueAvisar(vencido({ status: 'SUSPENDED' }))).toBe(false);
  });

  it('no si no hay dueño a quién escribirle', () => {
    expect(hayQueAvisar(vencido({ email: '' }))).toBe(false);
  });

  it('no si no se sabe cuándo venció', () => {
    expect(hayQueAvisar(vencido({ vencioAt: null }))).toBe(false);
  });
});

describe('un mes pago que se termina', () => {
  const HACE_MESES = new Date('2025-11-01T12:00:00Z');
  const AYER = new Date('2026-03-09T12:00:00Z');
  const HOY = new Date('2026-03-10T12:00:00Z');

  it('cuenta desde el último pago y no desde el trial de hace meses', () => {
    // Un local que paga hace medio año tiene `trialEndsAt` viejísimo. Contra
    // esa fecha caía directo en SUSPENDED, salteándose la semana de gracia.
    const estado = describeSubscription(
      { trialEndsAt: HACE_MESES, paid: false, paidUntil: AYER },
      HOY,
    );

    expect(estado.status).toBe('EXPIRED');
    expect(estado.trialEndsAt).toEqual(AYER);
  });

  it('y recién después de la semana corta el servicio', () => {
    const estado = describeSubscription(
      { trialEndsAt: HACE_MESES, paid: false, paidUntil: AYER },
      new Date(AYER.getTime() + 8 * DIA),
    );

    expect(estado.status).toBe('SUSPENDED');
  });
});

describe('la semana de gracia', () => {
  it('termina siete días después del vencimiento', () => {
    expect(finDeLaGracia(VENCIO).getTime()).toBe(VENCIO.getTime() + GRACE_DAYS * DIA);
  });

  it('el día que vence quedan los siete', () => {
    expect(diasDeGraciaQueQuedan(VENCIO, VENCIO)).toBe(GRACE_DAYS);
  });

  it('descuenta los días que pasaron', () => {
    expect(diasDeGraciaQueQuedan(VENCIO, new Date(VENCIO.getTime() + 5 * DIA))).toBe(2);
  });

  it('nunca es negativo', () => {
    expect(diasDeGraciaQueQuedan(VENCIO, new Date(VENCIO.getTime() + 20 * DIA))).toBe(0);
  });
});

describe('qué dice el correo', () => {
  const correo = correoDeVencimiento(
    { nombre: 'Don Pepe', vencioAt: VENCIO },
    new Date(VENCIO.getTime() + 2 * DIA),
  );

  it('nombra al restaurante en el asunto', () => {
    expect(correo.subject).toContain('Don Pepe');
  });

  it('dice hasta cuándo siguen las mesas', () => {
    // Sin esto el dueño cierra el mail creyendo que ya se quedó sin sistema.
    expect(correo.subject).toContain('17 de marzo');
    expect(correo.body).toContain('17 de marzo');
  });

  it('dice cuántos días le quedan', () => {
    expect(correo.body).toContain('5 días');
  });

  it('el último día habla en singular', () => {
    const ultimo = correoDeVencimiento(
      { nombre: 'Don Pepe', vencioAt: VENCIO },
      new Date(VENCIO.getTime() + 6 * DIA),
    );
    expect(ultimo.body).toContain('1 día más');
  });

  it('dice qué hacer', () => {
    expect(correo.body).toContain('renovás');
  });
});
