import { type Bill } from '@itadaki/billing/domain';
import { Money } from '@itadaki/shared/domain';
import { InMemoryBillStore } from './in-memory-bills';

/**
 * Cuánto se cobró con cada medio de pago.
 *
 * Sale de lo que declaró el mozo al cerrar la mesa, no de lo que la mesa dijo
 * que iba a pagar: el comensal declara una intención antes de que el mozo
 * llegue, y eso cambia. Un número que el dueño cruza con su caja tiene que
 * venir de quien tuvo la plata en la mano.
 */

const ayer = new Date('2026-08-26T20:00:00Z');
const hoy = new Date('2026-08-27T20:00:00Z');
const semanaPasada = new Date('2026-08-18T20:00:00Z');

const unaCuenta = (over: Partial<Bill> = {}): Bill => ({
  id: `b-${Math.random()}`,
  sessionId: `s-${Math.random()}`,
  currency: 'ARS',
  status: 'SETTLED',
  lines: [],
  participants: [],
  rates: [],
  closedAt: hoy,
  ...over,
});

describe('agrupar los cobros por medio de pago', () => {
  it('junta las cuentas del mismo medio', async () => {
    const store = new InMemoryBillStore();
    await store.save('t1', unaCuenta({ cobradoCon: 'CASH', descuentoMinor: 100_000 }));
    await store.save('t1', unaCuenta({ cobradoCon: 'CASH', descuentoMinor: 50_000 }));

    const cobros = await store.cobrosPorMedio('t1', ayer);
    if (cobros.isErr()) throw new Error('expected ok');

    const efectivo = cobros.value.find((c) => c.medio === 'CASH');
    expect(efectivo?.cuentas).toBe(2);
    expect(efectivo?.descuentoMinor).toBe(150_000);
  });

  it('separa los medios distintos', async () => {
    const store = new InMemoryBillStore();
    await store.save('t1', unaCuenta({ cobradoCon: 'CASH' }));
    await store.save('t1', unaCuenta({ cobradoCon: 'CARD' }));

    const cobros = await store.cobrosPorMedio('t1', ayer);
    if (cobros.isErr()) throw new Error('expected ok');

    expect(cobros.value).toHaveLength(2);
  });

  it('agrupa aparte las que se cobraron sin declarar', async () => {
    // Repartirlas a ojo entre las otras sería inventar un número en un
    // reporte que el dueño cruza con su caja. Un hueco declarado es mejor.
    const store = new InMemoryBillStore();
    await store.save('t1', unaCuenta({ cobradoCon: 'CASH' }));
    await store.save('t1', unaCuenta());

    const cobros = await store.cobrosPorMedio('t1', ayer);
    if (cobros.isErr()) throw new Error('expected ok');

    const sinDeclarar = cobros.value.find((c) => c.medio === null);
    expect(sinDeclarar?.cuentas).toBe(1);
  });

  it('no cuenta las cuentas abiertas', async () => {
    // Una mesa que todavía come puede cambiar: contarla adelantaría plata que
    // no entró.
    const store = new InMemoryBillStore();
    await store.save('t1', unaCuenta({ status: 'OPEN', cobradoCon: 'CASH' }));

    const cobros = await store.cobrosPorMedio('t1', ayer);
    if (cobros.isErr()) throw new Error('expected ok');

    expect(cobros.value).toEqual([]);
  });

  it('no cuenta lo anterior a la ventana', async () => {
    const store = new InMemoryBillStore();
    await store.save('t1', unaCuenta({ cobradoCon: 'CASH', closedAt: semanaPasada }));

    const cobros = await store.cobrosPorMedio('t1', ayer);
    if (cobros.isErr()) throw new Error('expected ok');

    expect(cobros.value).toEqual([]);
  });

  it('no mezcla los cobros de otro restaurante', async () => {
    const store = new InMemoryBillStore();
    await store.save('t1', unaCuenta({ cobradoCon: 'CASH' }));

    const otro = await store.cobrosPorMedio('otro-local', ayer);
    if (otro.isErr()) throw new Error('expected ok');

    expect(otro.value).toEqual([]);
  });

  it('sin cuentas cobradas no devuelve nada', async () => {
    const store = new InMemoryBillStore();
    const cobros = await store.cobrosPorMedio('t1', ayer);
    if (cobros.isErr()) throw new Error('expected ok');

    expect(cobros.value).toEqual([]);
  });
});

/**
 * Cuánta plata entró con cada medio.
 *
 * Contar cuentas no alcanza: cinco mesas en efectivo y cinco en crédito puede
 * ser el mismo número de cuentas y plata muy distinta. Y el crédito le cuesta
 * al dueño más comisión que el débito, así que la diferencia entre los dos es
 * justamente lo que quiere mirar.
 */
const unaLinea = (minor: number) => ({
  id: `l-${Math.random()}`,
  dinerId: 'd1',
  name: 'Plato',
  quantity: 1,
  unitTotal: Money.of(minor, 'ARS').unwrapOr(Money.zero('ARS')),
});

describe('cuánta plata entró con cada medio', () => {
  it('suma lo cobrado de cada cuenta', async () => {
    const store = new InMemoryBillStore();
    await store.save('t1', unaCuenta({ cobradoCon: 'CREDIT', lines: [unaLinea(300_000)] }));
    await store.save('t1', unaCuenta({ cobradoCon: 'CREDIT', lines: [unaLinea(200_000)] }));

    const cobros = await store.cobrosPorMedio('t1', ayer);
    if (cobros.isErr()) throw new Error('expected ok');

    expect(cobros.value.find((c) => c.medio === 'CREDIT')?.cobradoMinor).toBe(500_000);
  });

  it('separa crédito de débito', async () => {
    // La razón de todo esto: al dueño no le cuestan lo mismo.
    const store = new InMemoryBillStore();
    await store.save('t1', unaCuenta({ cobradoCon: 'CREDIT', lines: [unaLinea(300_000)] }));
    await store.save('t1', unaCuenta({ cobradoCon: 'DEBIT', lines: [unaLinea(100_000)] }));

    const cobros = await store.cobrosPorMedio('t1', ayer);
    if (cobros.isErr()) throw new Error('expected ok');

    expect(cobros.value.find((c) => c.medio === 'CREDIT')?.cobradoMinor).toBe(300_000);
    expect(cobros.value.find((c) => c.medio === 'DEBIT')?.cobradoMinor).toBe(100_000);
  });

  it('cuenta la transferencia aparte', async () => {
    const store = new InMemoryBillStore();
    await store.save('t1', unaCuenta({ cobradoCon: 'TRANSFER', lines: [unaLinea(250_000)] }));

    const cobros = await store.cobrosPorMedio('t1', ayer);
    if (cobros.isErr()) throw new Error('expected ok');

    expect(cobros.value.find((c) => c.medio === 'TRANSFER')?.cobradoMinor).toBe(250_000);
  });

  it('descuenta lo que el local resignó en efectivo', async () => {
    // Sin esto las métricas dirían que entró más de lo que entró, justo en
    // las cuentas donde el descuento se hizo a propósito.
    const store = new InMemoryBillStore();
    await store.save(
      't1',
      unaCuenta({ cobradoCon: 'CASH', lines: [unaLinea(500_000)], descuentoMinor: 50_000 }),
    );

    const cobros = await store.cobrosPorMedio('t1', ayer);
    if (cobros.isErr()) throw new Error('expected ok');

    const efectivo = cobros.value.find((c) => c.medio === 'CASH');
    expect(efectivo?.cobradoMinor).toBe(450_000);
    expect(efectivo?.descuentoMinor).toBe(50_000);
  });

  it('las cuentas viejas con "CARD" siguen apareciendo', async () => {
    // Cobradas cuando efectivo y tarjeta eran las únicas opciones. No se
    // puede saber si fueron crédito o débito, y adivinarlo mancharía el
    // número que el dueño cruza con su caja: se muestran como están.
    const store = new InMemoryBillStore();
    await store.save('t1', unaCuenta({ cobradoCon: 'CARD', lines: [unaLinea(400_000)] }));

    const cobros = await store.cobrosPorMedio('t1', ayer);
    if (cobros.isErr()) throw new Error('expected ok');

    expect(cobros.value.find((c) => c.medio === 'CARD')?.cobradoMinor).toBe(400_000);
  });
});
