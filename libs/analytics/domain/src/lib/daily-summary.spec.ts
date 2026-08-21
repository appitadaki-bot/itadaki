import { Money } from '@itadaki/shared/domain';
import { type CompletedOrder } from './metrics';
import { mergeSummaries, summariseDay } from './daily-summary';

const ars = (minor: number): Money => {
  const result = Money.of(minor, 'ARS');
  if (result.isErr()) throw new Error('importe inválido en el test');
  return result.value;
};

const pedido = (
  id: string,
  hora: number,
  items: ReadonlyArray<{ productId: string; name: string; cantidad: number; totalMinor: number }>,
  minutosHastaEntregar: number | null = 12,
): CompletedOrder => {
  const placedAt = new Date(2026, 2, 12, hora, 0, 0);
  return {
    orderId: id,
    sessionId: `s-${id}`,
    placedAt,
    deliveredAt:
      minutosHastaEntregar === null
        ? null
        : new Date(placedAt.getTime() + minutosHastaEntregar * 60_000),
    items: items.map((i) => ({
      productId: i.productId,
      name: i.name,
      quantity: i.cantidad,
      lineTotal: ars(i.totalMinor),
    })),
  };
};

const DIA = new Date(2026, 2, 12);
const bife = { productId: 'bife', name: 'Bife de chorizo', cantidad: 1, totalMinor: 950_000 };
const mila = { productId: 'mila', name: 'Milanesa napolitana', cantidad: 1, totalMinor: 840_000 };

describe('resumir un día antes de borrar sus pedidos', () => {
  it('guarda cuánto se vendió', () => {
    const resumen = summariseDay(DIA, [pedido('a', 21, [bife]), pedido('b', 22, [mila])], new Set(), 'ARS');

    expect(resumen.orders).toBe(2);
    expect(resumen.revenueMinor).toBe(1_790_000);
  });

  it('no cuenta los cancelados como venta', () => {
    // Arrastrarían el ticket promedio para abajo e inflarían el conteo.
    const resumen = summariseDay(
      DIA,
      [pedido('a', 21, [bife]), pedido('b', 21, [mila])],
      new Set(['b']),
      'ARS',
    );

    expect(resumen.orders).toBe(1);
    expect(resumen.cancelled).toBe(1);
    expect(resumen.revenueMinor).toBe(950_000);
  });

  it('guarda a qué hora se llenó', () => {
    const resumen = summariseDay(
      DIA,
      [pedido('a', 21, [bife]), pedido('b', 21, [mila]), pedido('c', 13, [bife])],
      new Set(),
      'ARS',
    );

    expect(resumen.ordersByHour[21]).toBe(2);
    expect(resumen.ordersByHour[13]).toBe(1);
    expect(resumen.ordersByHour).toHaveLength(24);
  });

  it('guarda qué se vendió más, sumando repetidos', () => {
    const resumen = summariseDay(
      DIA,
      [pedido('a', 21, [bife]), pedido('b', 21, [bife]), pedido('c', 22, [mila])],
      new Set(),
      'ARS',
    );

    expect(resumen.topProducts[0]).toEqual({
      productId: 'bife',
      name: 'Bife de chorizo',
      quantity: 2,
    });
  });

  it('usa la mediana y no el promedio para la cocina', () => {
    // Una comanda que quedó abierta toda la noche porque nadie la marcó
    // arrastra el promedio y hace ver una cocina lenta que no lo es.
    const resumen = summariseDay(
      DIA,
      [
        pedido('a', 21, [bife], 10),
        pedido('b', 21, [bife], 12),
        pedido('c', 21, [bife], 600),
      ],
      new Set(),
      'ARS',
    );

    expect(resumen.medianPrepMinutes).toBe(12);
  });

  it('deja la mediana en null si nada se entregó', () => {
    const resumen = summariseDay(DIA, [pedido('a', 21, [bife], null)], new Set(), 'ARS');
    expect(resumen.medianPrepMinutes).toBeNull();
  });

  it('un día sin ventas resume en cero, no en nada', () => {
    // El día tiene que quedar guardado igual: un hueco en la serie se lee
    // como "faltan datos", no como "no se vendió".
    const resumen = summariseDay(DIA, [], new Set(), 'ARS');

    expect(resumen.orders).toBe(0);
    expect(resumen.revenueMinor).toBe(0);
    expect(resumen.topProducts).toEqual([]);
  });
});

describe('juntar varios días para una consulta de rango', () => {
  const lunes = summariseDay(
    new Date(2026, 2, 9),
    [pedido('a', 21, [bife]), pedido('b', 21, [mila])],
    new Set(),
    'ARS',
  );
  const martes = summariseDay(
    new Date(2026, 2, 10),
    [pedido('c', 22, [bife])],
    new Set(),
    'ARS',
  );

  it('suma las ventas de los días', () => {
    const total = mergeSummaries([lunes, martes]);

    expect(total?.orders).toBe(3);
    expect(total?.revenueMinor).toBe(2_740_000);
  });

  it('suma las horas pico', () => {
    const total = mergeSummaries([lunes, martes]);

    expect(total?.ordersByHour[21]).toBe(2);
    expect(total?.ordersByHour[22]).toBe(1);
  });

  it('acumula el ranking entre días', () => {
    const total = mergeSummaries([lunes, martes]);
    expect(total?.topProducts[0]?.productId).toBe('bife');
    expect(total?.topProducts[0]?.quantity).toBe(2);
  });

  it('sin días devuelve null, no un cero inventado', () => {
    // Cero ventas y "no hay datos" son cosas distintas, y confundirlas hace
    // ver un mes vacío como un mes malo.
    expect(mergeSummaries([])).toBeNull();
  });
});
