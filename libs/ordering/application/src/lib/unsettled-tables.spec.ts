import { type Order, type TableSession } from '@itadaki/ordering/domain';
import { Money, type Result, err, ok } from '@itadaki/shared/domain';
import { type OrderEvent, type OrderEventPublisher, type OrderReader, type OrderRepositoryError, type OrderWriter } from './ports';
import { type SessionReader, type SessionState } from './session-ports';
import { type LinePricer, type PricedLine, type SubmitOrderError, type SubmitOrderLine, submitOrder } from './submit-order';
import { advanceOrder } from './advance-order';
import { listUnsettledTables } from './unsettled-tables';

/**
 * Una mesa que ya comió todo y no pagó salía del tablero del mozo: el tablero
 * se arma de lo que está en cocina, y ahí ya no queda nada. Se levantaban y se
 * iban sin que nadie tuviera el aviso delante.
 */

const AT = new Date('2026-08-15T20:00:00Z');

const ars = (minor: number): Money => {
  const result = Money.of(minor, 'ARS');
  if (result.isErr()) throw new Error('fixture must be valid');
  return result.value;
};

class FakeOrderStore implements OrderReader, OrderWriter {
  readonly rows = new Map<string, Order>();

  async findById(_tenantId: string, orderId: string): Promise<Result<Order, OrderRepositoryError>> {
    const found = this.rows.get(orderId);
    return found === undefined ? err({ kind: 'NOT_FOUND', id: orderId }) : ok(found);
  }

  async listActive(): Promise<Result<readonly Order[], OrderRepositoryError>> {
    return ok([...this.rows.values()]);
  }

  async listBySession(
    _tenantId: string,
    sessionId: string,
  ): Promise<Result<readonly Order[], OrderRepositoryError>> {
    return ok([...this.rows.values()].filter((order) => order.sessionId === sessionId));
  }

  async listPlacedBetween(): Promise<Result<readonly Order[], OrderRepositoryError>> {
    return ok([...this.rows.values()]);
  }

  async findByClientRequestId(
    _tenantId: string,
    clientRequestId: string,
  ): Promise<Result<Order | null, OrderRepositoryError>> {
    return ok([...this.rows.values()].find((o) => o.clientRequestId === clientRequestId) ?? null);
  }

  async save(_tenantId: string, order: Order): Promise<Result<Order, OrderRepositoryError>> {
    this.rows.set(order.id, order);
    return ok(order);
  }
}

class FakePricer implements LinePricer {
  async price(_tenantId: string, line: SubmitOrderLine): Promise<Result<PricedLine, SubmitOrderError>> {
    return ok({
      product: { productId: line.productId, name: line.productId, unitPrice: ars(10_000), capturedAt: AT },
      modifiers: [],
    });
  }
}

const noEvents: OrderEventPublisher = {
  async orderChanged(_event: OrderEvent): Promise<void> {
    /* el tablero no importa acá */
  },
};

const sessionAt = (id: string, tableId: string): TableSession => ({
  id,
  tenantId: 't1',
  tableId,
  status: 'OPEN',
  currency: 'ARS',
  openedAt: AT,
  diners: [
    { id: 'd1', nickname: 'Esteban', colorIndex: 0, joinedAt: AT },
    { id: 'd2', nickname: 'Lucía', colorIndex: 1, joinedAt: AT },
  ],
});

const sessionsWith = (states: readonly SessionState[]): SessionReader => ({
  findById: async (_tenantId, sessionId) => {
    const found = states.find((state) => state.session.id === sessionId);
    return found === undefined ? err({ kind: 'NOT_FOUND', id: sessionId }) : ok(found);
  },
  findOpenForTable: async () => ok(null),
  listOpen: async () => ok(states.filter((state) => state.session.status === 'OPEN')),
});

/** Manda una comanda y la lleva hasta donde diga `upTo`. */
const orderFor = async (
  store: FakeOrderStore,
  sessionId: string,
  quantity: number,
  upTo: readonly ('ACCEPTED' | 'IN_PREP' | 'READY' | 'DELIVERED')[],
): Promise<Order> => {
  let counter = store.rows.size * 10;
  const submit = submitOrder({
    orders: store,
    pricer: new FakePricer(),
    events: noEvents,
    newId: () => `id-${(counter += 1)}`,
    now: () => AT,
  });

  const created = await submit({
    tenantId: 't1',
    sessionId,
    dinerId: 'd1',
    clientRequestId: `req-${counter}`,
    currency: 'ARS',
    lines: [{ productId: 'gyoza', quantity, notes: '', modifierIds: [] }],
  });
  if (created.isErr()) throw new Error('fixture must submit');

  const advance = advanceOrder({ orders: store, events: noEvents, now: () => AT });
  for (const next of upTo) {
    const moved = await advance({ tenantId: 't1', orderId: created.value.id, next, actorId: 'mozo' });
    if (moved.isErr()) throw new Error(`fixture must advance to ${next}`);
  }

  const final = await store.findById('t1', created.value.id);
  if (final.isErr()) throw new Error('fixture must exist');
  return final.value;
};

const ALL_THE_WAY = ['ACCEPTED', 'IN_PREP', 'READY', 'DELIVERED'] as const;

describe('listUnsettledTables', () => {
  it('lista la mesa que recibió todo y sigue abierta, con lo que debe', async () => {
    const store = new FakeOrderStore();
    await orderFor(store, 's1', 2, ALL_THE_WAY);

    const sessions = sessionsWith([
      { session: sessionAt('s1', 'mesa-01'), cart: { currency: 'ARS', lines: [] } },
    ]);

    const run = listUnsettledTables({ sessions, orders: store });
    const result = await run('t1');

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.tableId).toBe('mesa-01');
    expect(result.value[0]?.owed.amountInMinorUnits).toBe(20_000);
    expect(result.value[0]?.diners).toBe(2);
  });

  it('no molesta con la mesa que todavía espera un plato', async () => {
    const store = new FakeOrderStore();
    await orderFor(store, 's1', 1, ALL_THE_WAY);
    await orderFor(store, 's1', 1, ['ACCEPTED', 'IN_PREP']);

    const sessions = sessionsWith([
      { session: sessionAt('s1', 'mesa-01'), cart: { currency: 'ARS', lines: [] } },
    ]);

    const run = listUnsettledTables({ sessions, orders: store });
    const result = await run('t1');

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toHaveLength(0);
  });

  it('ignora la mesa recién sentada, sin nada consumido', async () => {
    const sessions = sessionsWith([
      { session: sessionAt('s9', 'mesa-09'), cart: { currency: 'ARS', lines: [] } },
    ]);

    const run = listUnsettledTables({ sessions, orders: new FakeOrderStore() });
    const result = await run('t1');

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toHaveLength(0);
  });

  it('no cobra lo cancelado', async () => {
    const store = new FakeOrderStore();
    await orderFor(store, 's1', 1, ALL_THE_WAY);
    const cancelled = await orderFor(store, 's1', 3, ['CANCELLED' as 'ACCEPTED']);
    expect(cancelled.status).toBe('CANCELLED');

    const sessions = sessionsWith([
      { session: sessionAt('s1', 'mesa-01'), cart: { currency: 'ARS', lines: [] } },
    ]);

    const run = listUnsettledTables({ sessions, orders: store });
    const result = await run('t1');

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value[0]?.owed.amountInMinorUnits).toBe(10_000);
  });

  /*
   * El plato que se cocinó y nadie marcó como entregado.
   *
   * Pasa todo el tiempo: el mozo lo lleva a la mesa y se olvida de tocar
   * "Llevé". Antes eso dejaba a la mesa afuera de esta lista, o sea invisible
   * para el mozo y para la caja, y a las tres horas el barrido la cerraba sin
   * cobrar. Un toque que nadie dio alcanzaba para perder la venta entera.
   */
  describe('cuando la mesa ya pidió la cuenta', () => {
    it('aparece aunque quede un plato sin marcar como entregado', async () => {
      const store = new FakeOrderStore();
      await orderFor(store, 's1', 1, ALL_THE_WAY);
      // Éste llegó al pase y ahí quedó.
      await orderFor(store, 's1', 1, ['ACCEPTED', 'IN_PREP', 'READY']);

      const sessions = sessionsWith([
        { session: sessionAt('s1', 'mesa-01'), cart: { currency: 'ARS', lines: [] } },
      ]);

      const run = listUnsettledTables({ sessions, orders: store });

      const sinPedirla = await run('t1');
      expect(sinPedirla.isOk()).toBe(true);
      if (sinPedirla.isErr()) return;
      expect(sinPedirla.value).toHaveLength(0);

      const pidiendola = await run('t1', new Set(['s1']));
      expect(pidiendola.isOk()).toBe(true);
      if (pidiendola.isErr()) return;
      expect(pidiendola.value).toHaveLength(1);
    });

    it('y cobra ese plato, que ya está en la mesa', async () => {
      const store = new FakeOrderStore();
      await orderFor(store, 's1', 1, ALL_THE_WAY);
      await orderFor(store, 's1', 1, ['ACCEPTED', 'IN_PREP', 'READY']);

      const sessions = sessionsWith([
        { session: sessionAt('s1', 'mesa-01'), cart: { currency: 'ARS', lines: [] } },
      ]);

      const run = listUnsettledTables({ sessions, orders: store });
      const soloEntregado = await run('t1', new Set());
      const conElDelPase = await run('t1', new Set(['s1']));

      expect(soloEntregado.isOk() && conElDelPase.isOk()).toBe(true);
      if (soloEntregado.isErr() || conElDelPase.isErr()) return;

      // Sin pedir la cuenta no aparece; lo que se compara es el total contra
      // el de un solo plato entregado.
      const unoSolo = new FakeOrderStore();
      await orderFor(unoSolo, 's2', 1, ALL_THE_WAY);
      const base = await listUnsettledTables({
        sessions: sessionsWith([
          { session: sessionAt('s2', 'mesa-02'), cart: { currency: 'ARS', lines: [] } },
        ]),
        orders: unoSolo,
      })('t1');
      if (base.isErr()) return;

      const conDos = conElDelPase.value[0]?.owed.amountInMinorUnits ?? 0;
      const conUno = base.value[0]?.owed.amountInMinorUnits ?? 0;
      expect(conDos).toBe(conUno * 2);
    });

    it('pero no cobra lo que sigue en la cocina', async () => {
      const store = new FakeOrderStore();
      await orderFor(store, 's1', 1, ALL_THE_WAY);
      // Todavía cocinándose: eso no llegó a la mesa y no se cobra.
      await orderFor(store, 's1', 1, ['ACCEPTED', 'IN_PREP']);

      const sessions = sessionsWith([
        { session: sessionAt('s1', 'mesa-01'), cart: { currency: 'ARS', lines: [] } },
      ]);

      const conCuenta = await listUnsettledTables({ sessions, orders: store })(
        't1',
        new Set(['s1']),
      );
      if (conCuenta.isErr()) return;

      const unoSolo = new FakeOrderStore();
      await orderFor(unoSolo, 's2', 1, ALL_THE_WAY);
      const base = await listUnsettledTables({
        sessions: sessionsWith([
          { session: sessionAt('s2', 'mesa-02'), cart: { currency: 'ARS', lines: [] } },
        ]),
        orders: unoSolo,
      })('t1');
      if (base.isErr()) return;

      expect(conCuenta.value[0]?.owed.amountInMinorUnits).toBe(
        base.value[0]?.owed.amountInMinorUnits,
      );
    });
  });
});
