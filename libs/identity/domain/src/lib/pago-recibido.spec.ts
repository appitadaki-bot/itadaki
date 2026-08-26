import { type AvisoDePago, efectoDe, nuevoVencimiento } from './pago-recibido';

const AHORA = new Date('2026-08-23T12:00:00Z');

const aviso = (estado: AvisoDePago['estado']): AvisoDePago => ({
  tenantId: 't1',
  estado,
  referencia: 'pago-1',
});

describe('qué hace cada aviso del cobrador', () => {
  it('un cobro aprobado suma un mes', () => {
    const efecto = efectoDe(aviso('APROBADO'));

    expect(efecto.mesesQueSuma).toBe(1);
    expect(efecto.cortaYa).toBe(false);
  });

  it('un rechazo no corta nada', () => {
    // El cobrador reintenta solo. Cortarle el servicio a alguien cuya tarjeta
    // falló una vez es perder un cliente por un problema del banco.
    const efecto = efectoDe(aviso('RECHAZADO'));

    expect(efecto.mesesQueSuma).toBe(0);
    expect(efecto.cortaYa).toBe(false);
  });

  it('una devolución corta en el acto', () => {
    // Acá la plata volvió: el mes no se prestó.
    expect(efectoDe(aviso('DEVUELTO')).cortaYa).toBe(true);
  });

  it('dar de baja no quita lo ya pago', () => {
    // Quien pagó hasta fin de mes lo usa hasta fin de mes; deja de renovarse
    // y vence solo. Cortar en el acto sería quedarse con plata cobrada.
    const efecto = efectoDe(aviso('CANCELADO'));

    expect(efecto.cortaYa).toBe(false);
    expect(efecto.mesesQueSuma).toBe(0);
  });

  it('un cobro en proceso no cambia nada todavía', () => {
    const efecto = efectoDe(aviso('PENDIENTE'));

    expect(efecto.mesesQueSuma).toBe(0);
    expect(efecto.cortaYa).toBe(false);
  });

  it('cada aviso deja un motivo para el log', () => {
    // Un cobro que no entró hay que poder rastrearlo meses después.
    for (const estado of ['APROBADO', 'RECHAZADO', 'DEVUELTO', 'CANCELADO', 'PENDIENTE'] as const) {
      expect(efectoDe(aviso(estado)).motivo).not.toBe('');
    }
  });
});

describe('hasta cuándo queda pago', () => {
  it('el primer pago corre desde hoy', () => {
    const hasta = nuevoVencimiento(null, 1, AHORA);

    expect(hasta.toISOString().slice(0, 10)).toBe('2026-09-23');
  });

  it('pagar antes de que venza no pierde los días que quedaban', () => {
    // Paga el 23 de agosto teniendo hasta el 30: el mes nuevo arranca el 30,
    // no hoy. Si no, cada pago adelantado regalaría días a la empresa.
    const teniaHasta = new Date('2026-08-30T12:00:00Z');
    const hasta = nuevoVencimiento(teniaHasta, 1, AHORA);

    expect(hasta.toISOString().slice(0, 10)).toBe('2026-09-30');
  });

  it('pagar después de vencido arranca de hoy', () => {
    // No se le regalan los días que estuvo sin pagar.
    const vencioHace = new Date('2026-07-01T12:00:00Z');
    const hasta = nuevoVencimiento(vencioHace, 1, AHORA);

    expect(hasta.toISOString().slice(0, 10)).toBe('2026-09-23');
  });

  it('dos meses de una suman dos meses', () => {
    const hasta = nuevoVencimiento(null, 2, AHORA);

    expect(hasta.toISOString().slice(0, 10)).toBe('2026-10-23');
  });

  it('el 31 de enero más un mes no se va a marzo', () => {
    // Un mes desde el 31 de enero cae el 3 de marzo con `setMonth`, porque
    // febrero no tiene 31. Que quede documentado: el cliente pierde dos días,
    // no gana un mes.
    const enero31 = new Date('2026-01-31T12:00:00Z');
    const hasta = nuevoVencimiento(enero31, 1, new Date('2026-01-30T12:00:00Z'));

    expect(hasta.getMonth()).toBe(2);
  });
});
