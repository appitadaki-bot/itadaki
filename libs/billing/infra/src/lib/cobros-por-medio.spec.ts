import { type Bill } from '@itadaki/billing/domain';
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
