import { juntarIguales } from './juntar-iguales';

/**
 * Juntar los platos iguales de una comanda.
 *
 * La cocina hace comida, no lleva la cuenta de quién pidió qué. El caso que lo
 * originó: una mesa con dos empanadas de dos comensales distintos, que en la
 * pantalla aparecían como dos líneas de una — obligando al cocinero a sumar de
 * memoria y haciendo la comanda el doble de larga.
 */

const plato = (over: Partial<Parameters<typeof juntarIguales>[0][number]> = {}) => ({
  id: 'i1',
  orderId: 'o1',
  status: 'SENT',
  name: 'Empanadas de carne',
  quantity: 1,
  notes: '',
  category: 'Entradas',
  ...over,
});

describe('juntar los platos iguales', () => {
  it('dos platos iguales son uno con la cantidad sumada', () => {
    const juntos = juntarIguales([plato({ id: 'a' }), plato({ id: 'b' })]);

    expect(juntos).toHaveLength(1);
    expect(juntos[0]?.quantity).toBe(2);
  });

  it('conserva los ids de las dos líneas', () => {
    // El cocinero avanza cada plato por su id: al tocar "aceptar" sobre dos
    // empanadas juntas hay que avanzar las dos, o una queda atrás sin que
    // nadie lo note.
    const juntos = juntarIguales([plato({ id: 'a' }), plato({ id: 'b' })]);

    expect(juntos[0]?.ids).toEqual([
      { orderId: 'o1', id: 'a' },
      { orderId: 'o1', id: 'b' },
    ]);
  });

  it('suma las cantidades, no las líneas', () => {
    const juntos = juntarIguales([
      plato({ id: 'a', quantity: 2 }),
      plato({ id: 'b', quantity: 3 }),
    ]);

    expect(juntos[0]?.quantity).toBe(5);
  });

  it('una nota distinta es otro plato', () => {
    // "Sin sal" es otra cosa para quien lo cocina.
    const juntos = juntarIguales([plato({ id: 'a' }), plato({ id: 'b', notes: 'sin sal' })]);

    expect(juntos).toHaveLength(2);
  });

  it('lo marcado para salir primero no se junta con lo que no', () => {
    // Juntarlos haría que la cocina vea dos "primero" donde la mesa pidió uno.
    const juntos = juntarIguales([plato({ id: 'a', primero: true }), plato({ id: 'b' })]);

    expect(juntos).toHaveLength(2);
  });

  it('un plato que ya salió no se junta con uno pendiente', () => {
    // Dos empanadas de las cuales una ya se sirvió no son dos pendientes.
    const juntos = juntarIguales([
      plato({ id: 'a', status: 'DELIVERED' }),
      plato({ id: 'b', status: 'SENT' }),
    ]);

    expect(juntos).toHaveLength(2);
  });

  it('platos distintos quedan separados', () => {
    const juntos = juntarIguales([plato({ id: 'a' }), plato({ id: 'b', name: 'Flan casero' })]);

    expect(juntos.map((p) => p.name)).toEqual(['Empanadas de carne', 'Flan casero']);
  });

  it('respeta el orden en que llegaron', () => {
    // La comanda se lee de arriba abajo: reordenar es hacer buscar de nuevo.
    const juntos = juntarIguales([
      plato({ id: 'a', name: 'Flan casero' }),
      plato({ id: 'b' }),
      plato({ id: 'c', name: 'Flan casero' }),
    ]);

    expect(juntos.map((p) => p.name)).toEqual(['Flan casero', 'Empanadas de carne']);
    expect(juntos[0]?.quantity).toBe(2);
  });

  it('una comanda vacía no rompe nada', () => {
    expect(juntarIguales([])).toEqual([]);
  });
});
