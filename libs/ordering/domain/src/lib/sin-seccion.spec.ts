import { type BoardTicket, groupByTable } from './table-board';

/**
 * Un plato cuya sección ya no existe.
 *
 * Pasa cuando alguien saca un plato de la carta con su comanda todavía en
 * cocina: el pedido sigue siendo válido y hay que cocinarlo igual, así que se
 * muestra sin chip en vez de desaparecer o inventarle una sección.
 */
const plato = (
  id: string,
  category: string | null,
  name = 'plato',
): BoardTicket['items'][number] => ({ id, status: 'SENT', name, quantity: 1, notes: '', category });

const comanda = (items: BoardTicket['items']): BoardTicket => ({
  id: 'o1',
  sessionId: 's1',
  tableId: 'mesa-1',
  status: 'SENT',
  placedAt: '2026-08-26T21:00:00.000Z',
  items,
});

describe('un plato sin sección en el tablero', () => {
  it('entra en la tarjeta como cualquier otro', () => {
    const cards = groupByTable([comanda([plato('i1', null, 'empanadas')])]);

    expect(cards[0]?.items).toHaveLength(1);
    expect(cards[0]?.items[0]?.category).toBeNull();
  });

  it('convive con los que sí la tienen', () => {
    const cards = groupByTable([
      comanda([plato('i1', null, 'empanadas'), plato('i2', 'Parrilla', 'bife')]),
    ]);

    expect(cards[0]?.items.map((i) => i.category)).toEqual([null, 'Parrilla']);
  });
});
