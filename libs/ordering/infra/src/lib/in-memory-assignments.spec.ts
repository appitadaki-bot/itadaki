import { InMemoryAssignmentStore } from './in-memory-assignments';

describe('asignaciones en memoria', () => {
  it('arranca sin nadie asignado: la mesa la ve todo el salón', async () => {
    const store = new InMemoryAssignmentStore();
    const found = await store.list('itadaki');
    if (found.isErr()) throw new Error('expected ok');

    expect(found.value).toEqual([]);
  });

  it('suma un mozo sin sacar al que ya estaba', async () => {
    const store = new InMemoryAssignmentStore();
    await store.assign('itadaki', 'm1', 'ana');
    await store.assign('itadaki', 'm1', 'beto');

    const found = await store.list('itadaki');
    if (found.isErr()) throw new Error('expected ok');

    expect(found.value).toHaveLength(2);
  });

  it('asignar dos veces al mismo no lo duplica', async () => {
    const store = new InMemoryAssignmentStore();
    await store.assign('itadaki', 'm1', 'ana');
    await store.assign('itadaki', 'm1', 'ana');

    const found = await store.list('itadaki');
    if (found.isErr()) throw new Error('expected ok');

    expect(found.value).toHaveLength(1);
  });

  it('sacar a un mozo deja a los demás en la mesa', async () => {
    const store = new InMemoryAssignmentStore();
    await store.assign('itadaki', 'm1', 'ana');
    await store.assign('itadaki', 'm1', 'beto');
    await store.clear('itadaki', 'm1', 'ana');

    const found = await store.list('itadaki');
    if (found.isErr()) throw new Error('expected ok');

    expect(found.value).toEqual([{ tableId: 'm1', staffId: 'beto' }]);
  });

  it('sin decir cuál, saca a todos de esa mesa y sólo de esa', async () => {
    const store = new InMemoryAssignmentStore();
    await store.assign('itadaki', 'm1', 'ana');
    await store.assign('itadaki', 'm1', 'beto');
    await store.assign('itadaki', 'm2', 'cami');
    await store.clear('itadaki', 'm1');

    const found = await store.list('itadaki');
    if (found.isErr()) throw new Error('expected ok');

    expect(found.value).toEqual([{ tableId: 'm2', staffId: 'cami' }]);
  });

  it('no mezcla los mozos de otro local', async () => {
    const store = new InMemoryAssignmentStore();
    await store.assign('itadaki', 'm1', 'ana');

    const otro = await store.list('otro-local');
    if (otro.isErr()) throw new Error('expected ok');

    expect(otro.value).toEqual([]);
  });
});
