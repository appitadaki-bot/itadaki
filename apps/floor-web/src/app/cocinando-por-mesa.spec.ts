/**
 * Lo que está en cocina, contado por mesa.
 *
 * El tablero mostraba envíos: una mesa que pidió tres veces —entrada,
 * principal, postre— aparecía en tres filas seguidas, las tres diciendo
 * "Mesa 1", cada una con su botón de liberar, y el contador arriba decía
 * "3 mesas" cuando era una sola.
 *
 * Con veinte mesas eso son cuarenta o cincuenta filas donde no se encuentra
 * nada, y un número que miente sobre cuánto salón queda por atender.
 */

interface Ticket {
  readonly id: string;
  readonly sessionId: string;
  readonly tableId: string | null;
  readonly items: ReadonlyArray<{ name: string; quantity: number; status: string }>;
}

/** Lo mismo que agrupa el store, para poder probarlo sin Angular. */
function porMesa(tickets: readonly Ticket[]) {
  const mesas = new Map<
    string,
    { tableId: string; sessionIds: string[]; items: Ticket['items'][number][] }
  >();

  for (const ticket of tickets) {
    const tableId = ticket.tableId ?? '';
    const actual = mesas.get(tableId) ?? { tableId, sessionIds: [], items: [] };
    if (!actual.sessionIds.includes(ticket.sessionId)) actual.sessionIds.push(ticket.sessionId);
    actual.items.push(...ticket.items);
    mesas.set(tableId, actual);
  }
  return [...mesas.values()];
}

const plato = (name: string) => ({ name, quantity: 1, status: 'IN_PREP' });

describe('agrupar lo que está en cocina', () => {
  it('la misma mesa que pidió tres veces es una sola fila', () => {
    // El caso exacto que se veía en pantalla: tres "Mesa 1" seguidas.
    const mesas = porMesa([
      { id: 't1', sessionId: 's1', tableId: 'mesa-1', items: [plato('Asado de tira')] },
      { id: 't2', sessionId: 's1', tableId: 'mesa-1', items: [plato('Limonada')] },
      { id: 't3', sessionId: 's1', tableId: 'mesa-1', items: [plato('Empanadas')] },
    ]);

    expect(mesas).toHaveLength(1);
    expect(mesas[0]?.tableId).toBe('mesa-1');
  });

  it('junta todos los platos de esa mesa', () => {
    // El mozo quiere saber qué espera la mesa, no en qué tanda lo pidió.
    const mesas = porMesa([
      { id: 't1', sessionId: 's1', tableId: 'mesa-1', items: [plato('Asado'), plato('Bife')] },
      { id: 't2', sessionId: 's1', tableId: 'mesa-1', items: [plato('Provoleta')] },
    ]);

    expect(mesas[0]?.items).toHaveLength(3);
  });

  it('mesas distintas siguen separadas', () => {
    const mesas = porMesa([
      { id: 't1', sessionId: 's1', tableId: 'mesa-1', items: [plato('Asado')] },
      { id: 't2', sessionId: 's2', tableId: 'mesa-7', items: [plato('Bife')] },
    ]);

    expect(mesas).toHaveLength(2);
  });

  it('guarda todas las sesiones de la mesa', () => {
    // Un grupo que se suma en tandas abre varias sesiones en la misma mesa:
    // liberar sólo una la dejaría ocupada por las otras.
    const mesas = porMesa([
      { id: 't1', sessionId: 's1', tableId: 'mesa-1', items: [plato('Asado')] },
      { id: 't2', sessionId: 's2', tableId: 'mesa-1', items: [plato('Bife')] },
    ]);

    expect(mesas).toHaveLength(1);
    expect(mesas[0]?.sessionIds).toEqual(['s1', 's2']);
  });

  it('no repite una sesión que mandó varios envíos', () => {
    const mesas = porMesa([
      { id: 't1', sessionId: 's1', tableId: 'mesa-1', items: [plato('Asado')] },
      { id: 't2', sessionId: 's1', tableId: 'mesa-1', items: [plato('Bife')] },
    ]);

    expect(mesas[0]?.sessionIds).toEqual(['s1']);
  });

  it('el contador dice cuántas mesas son de verdad', () => {
    // Decía "3 mesas" con una sola: el mozo creía tener más salón esperando
    // del que tenía.
    const mesas = porMesa([
      { id: 't1', sessionId: 's1', tableId: 'mesa-1', items: [plato('Asado')] },
      { id: 't2', sessionId: 's1', tableId: 'mesa-1', items: [plato('Bife')] },
      { id: 't3', sessionId: 's1', tableId: 'mesa-1', items: [plato('Flan')] },
    ]);

    expect(mesas.length).toBe(1);
  });

  it('aguanta veinte mesas sin multiplicarlas', () => {
    // Con envíos esto daban sesenta filas.
    const tickets = Array.from({ length: 20 }, (_, i) => [
      { id: `a${i}`, sessionId: `s${i}`, tableId: `mesa-${i}`, items: [plato('Entrada')] },
      { id: `b${i}`, sessionId: `s${i}`, tableId: `mesa-${i}`, items: [plato('Principal')] },
      { id: `c${i}`, sessionId: `s${i}`, tableId: `mesa-${i}`, items: [plato('Postre')] },
    ]).flat();

    expect(porMesa(tickets)).toHaveLength(20);
  });

  it('un envío sin mesa no rompe el agrupado', () => {
    // `tableId` puede venir nulo; caen todos juntos en vez de tirar la vista.
    const mesas = porMesa([
      { id: 't1', sessionId: 's1', tableId: null, items: [plato('Asado')] },
    ]);

    expect(mesas).toHaveLength(1);
  });
});
