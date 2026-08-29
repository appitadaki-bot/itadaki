import { MARCADO_MS, seguirRecienAgregados } from './recien-agregado';

/**
 * Qué platos acaban de aparecer en la mesa.
 *
 * Lo que se cuida acá es no marcar de más: una lista entera animándose al
 * abrir la pantalla, o el plato propio marcado como si lo hubiera pedido
 * otro, convierten la señal en ruido y dejan de decir nada.
 */

const linea = (id: string, dinerId: string) => ({ id, dinerId });

describe('marcar los platos que acaban de aparecer', () => {
  it('no marca nada la primera vez', () => {
    // Al abrir el carrito, todo lo que hay ya estaba: animar la lista entera
    // sería ruido, no una noticia.
    const recien = seguirRecienAgregados();
    recien.mirar([linea('l1', 'otro'), linea('l2', 'otro')], 'yo');

    expect(recien.esNueva('l1')).toBe(false);
    expect(recien.esNueva('l2')).toBe(false);
  });

  it('marca lo que agregó otro', () => {
    const recien = seguirRecienAgregados();
    recien.mirar([linea('l1', 'otro')], 'yo');
    recien.mirar([linea('l1', 'otro'), linea('l2', 'otro')], 'yo');

    expect(recien.esNueva('l2')).toBe(true);
  });

  it('no marca lo propio', () => {
    // Ya se vio al tocarlo: animarlo cuando vuelve del servidor haría dudar
    // de si se agregó dos veces.
    const recien = seguirRecienAgregados();
    recien.mirar([linea('l1', 'otro')], 'yo');
    recien.mirar([linea('l1', 'otro'), linea('mio', 'yo')], 'yo');

    expect(recien.esNueva('mio')).toBe(false);
  });

  it('no marca lo que ya estaba', () => {
    const recien = seguirRecienAgregados();
    recien.mirar([linea('l1', 'otro')], 'yo');
    recien.mirar([linea('l1', 'otro'), linea('l2', 'otro')], 'yo');

    expect(recien.esNueva('l1')).toBe(false);
  });

  it('deja de marcar cuando pasa el rato', () => {
    // Sin esto, un plato queda "nuevo" el resto de la comida.
    let reloj = 1000;
    const recien = seguirRecienAgregados(() => reloj);

    recien.mirar([], 'yo');
    recien.mirar([linea('l1', 'otro')], 'yo');
    expect(recien.esNueva('l1')).toBe(true);

    reloj += MARCADO_MS + 1;
    expect(recien.esNueva('l1')).toBe(false);
  });

  it('marca varios de una vez', () => {
    // Alguien que manda tres platos juntos: los tres son noticia.
    const recien = seguirRecienAgregados();
    recien.mirar([], 'yo');
    recien.mirar([linea('a', 'otro'), linea('b', 'otro'), linea('c', 'otro')], 'yo');

    expect([recien.esNueva('a'), recien.esNueva('b'), recien.esNueva('c')]).toEqual([
      true,
      true,
      true,
    ]);
  });

  it('un plato que se borró y volvió cuenta como nuevo', () => {
    // Es lo que la mesa ve: el plato no estaba y ahora está.
    const recien = seguirRecienAgregados();
    recien.mirar([linea('l1', 'otro')], 'yo');
    recien.mirar([], 'yo');
    recien.mirar([linea('l1', 'otro')], 'yo');

    expect(recien.esNueva('l1')).toBe(true);
  });

  it('sin saber quién soy, no marca nada como propio', () => {
    // Antes de que la sesión resuelva quién es cada uno: marcar de más es
    // mejor que atribuirle a alguien un plato que no pidió.
    const recien = seguirRecienAgregados();
    recien.mirar([], null);
    recien.mirar([linea('l1', 'alguien')], null);

    expect(recien.esNueva('l1')).toBe(true);
  });
});
