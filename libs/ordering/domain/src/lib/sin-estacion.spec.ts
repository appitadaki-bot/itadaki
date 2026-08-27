import { type BoardTicket, groupByTable } from './table-board';

/**
 * Un plato sin estación asignada.
 *
 * Toda carta importada entra así: el archivo del que se importa no dice a qué
 * parte de la cocina va cada cosa. Antes se le ponía "frío" para poder
 * guardarlo, y el cocinero leía FRÍO en el café, en la empanada y en el
 * helado — una respuesta inventada que se usa para decidir.
 */
const plato = (
  id: string,
  station: string | null,
  name = 'plato',
): BoardTicket['items'][number] => ({ id, status: 'SENT', name, quantity: 1, notes: '', station });

const comanda = (items: BoardTicket['items']): BoardTicket => ({
  id: 'o1',
  sessionId: 's1',
  tableId: 'mesa-1',
  status: 'SENT',
  placedAt: '2026-08-26T21:00:00.000Z',
  items,
});

describe('un plato sin estación en el tablero', () => {
  it('entra en la tarjeta como cualquier otro', () => {
    const cards = groupByTable([comanda([plato('i1', null, 'empanadas')])]);

    expect(cards[0]?.items).toHaveLength(1);
    expect(cards[0]?.items[0]?.station).toBeNull();
  });

  it('convive con los que sí la tienen', () => {
    const cards = groupByTable([
      comanda([plato('i1', null, 'empanadas'), plato('i2', 'GRILL', 'bife')]),
    ]);

    expect(cards[0]?.items.map((i) => i.station)).toEqual([null, 'GRILL']);
  });
});
