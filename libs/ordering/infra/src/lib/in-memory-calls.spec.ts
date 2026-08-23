import { type TableCall } from '@itadaki/ordering/domain';
import { InMemoryCallStore } from './in-memory-calls';

const AT = new Date('2026-01-01T22:00:00Z');

function unLlamado(overrides: Partial<TableCall> = {}): TableCall {
  return {
    id: 'c1',
    tenantId: 'itadaki',
    sessionId: 's1',
    tableId: 'mesa-7',
    reason: 'WAITER',
    status: 'PENDING',
    note: '',
    paymentMethod: null,
    raisedAt: AT,
    acknowledgedAt: null,
    ...overrides,
  };
}

describe('llamados en memoria', () => {
  beforeEach(() => InMemoryCallStore.reset());

  it('el llamado que levanta un teléfono lo ve la pantalla de la cocina', async () => {
    // Dos instancias distintas a propósito: en la app son objetos separados.
    await new InMemoryCallStore().raise(unLlamado());

    const visto = await new InMemoryCallStore().listPending('itadaki');
    if (visto.isErr()) throw new Error('expected ok');

    expect(visto.value).toHaveLength(1);
  });

  it('no muestra los llamados de otro local', async () => {
    const store = new InMemoryCallStore();
    await store.raise(unLlamado());

    const otro = await store.listPending('otro-local');
    if (otro.isErr()) throw new Error('expected ok');

    expect(otro.value).toEqual([]);
  });

  it('los ordena por hora: el que espera hace más rato va primero', async () => {
    const store = new InMemoryCallStore();
    await store.raise(unLlamado({ id: 'tarde', raisedAt: new Date('2026-01-01T22:10:00Z') }));
    await store.raise(unLlamado({ id: 'temprano', raisedAt: new Date('2026-01-01T22:00:00Z') }));

    const found = await store.listPending('itadaki');
    if (found.isErr()) throw new Error('expected ok');

    expect(found.value.map((call) => call.id)).toEqual(['temprano', 'tarde']);
  });

  it('atendido deja de estar pendiente', async () => {
    const store = new InMemoryCallStore();
    await store.raise(unLlamado());
    await store.acknowledge('itadaki', 'c1', AT);

    const found = await store.listPending('itadaki');
    if (found.isErr()) throw new Error('expected ok');

    expect(found.value).toEqual([]);
  });

  it('atenderlo dos veces avisa que ya no está, en vez de hacerlo de nuevo', async () => {
    // Dos mozos tocando el mismo llamado: el segundo tiene que enterarse.
    const store = new InMemoryCallStore();
    await store.raise(unLlamado());
    await store.acknowledge('itadaki', 'c1', AT);

    const otraVez = await store.acknowledge('itadaki', 'c1', AT);
    expect(otraVez.isErr()).toBe(true);
  });

  it('un mozo de otro local no puede atender este llamado', async () => {
    const store = new InMemoryCallStore();
    await store.raise(unLlamado());

    const ajeno = await store.acknowledge('otro-local', 'c1', AT);
    expect(ajeno.isErr()).toBe(true);
  });

  it('cerrar la mesa apaga sus llamados y sólo los suyos', async () => {
    const store = new InMemoryCallStore();
    await store.raise(unLlamado({ id: 'c1' }));
    await store.raise(unLlamado({ id: 'c2', reason: 'BILL' }));
    await store.raise(unLlamado({ id: 'c3', sessionId: 'otra-mesa' }));

    const cerrados = await store.closeForSession('itadaki', 's1', AT);
    if (cerrados.isErr()) throw new Error('expected ok');
    expect(cerrados.value).toBe(2);

    const quedan = await store.listPending('itadaki');
    if (quedan.isErr()) throw new Error('expected ok');
    expect(quedan.value.map((call) => call.id)).toEqual(['c3']);
  });

  it('la mesa sólo ve sus propios llamados', async () => {
    const store = new InMemoryCallStore();
    await store.raise(unLlamado({ id: 'c1' }));
    await store.raise(unLlamado({ id: 'c2', sessionId: 'otra-mesa' }));

    const found = await store.listForSession('itadaki', 's1');
    if (found.isErr()) throw new Error('expected ok');

    expect(found.value.map((call) => call.id)).toEqual(['c1']);
  });
});
