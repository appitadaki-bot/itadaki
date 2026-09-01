import { aDondeVuelve, nombreDeLaPantalla } from './a-donde-vuelve';

/**
 * Qué dice el botón de atrás.
 *
 * Decía "La carta" en las tres pantallas, escrito a mano, mientras el botón
 * retrocedía en el historial. Quien entraba a la cuenta desde el carrito leía
 * "La carta", tocaba, y aparecía en el carrito: el botón mentía sobre a dónde
 * llevaba, y había que tocarlo dos veces para llegar a donde decía.
 */

describe('cómo se llama cada pantalla', () => {
  it('la carta', () => {
    expect(nombreDeLaPantalla('/carta')).toBe('La carta');
  });

  it('el carrito', () => {
    expect(nombreDeLaPantalla('/carrito')).toBe('El carrito');
  });

  it('ignora lo que venga después de la ruta', () => {
    // `/carrito?desde=cuenta` sigue siendo el carrito.
    expect(nombreDeLaPantalla('/carrito?desde=cuenta')).toBe('El carrito');
    expect(nombreDeLaPantalla('/carta#postres')).toBe('La carta');
  });

  it('el seguimiento del pedido', () => {
    // La ruta se llama /estado, no /pedido: con el nombre equivocado en el
    // mapa, volver desde la cuenta al seguimiento diría "La carta".
    expect(nombreDeLaPantalla('/estado')).toBe('Mi pedido');
  });

  it('la ficha de un plato cuenta como la carta', () => {
    // Es de donde se abre y a donde vuelve: nadie la piensa como otra pantalla.
    expect(nombreDeLaPantalla('/producto/e1')).toBe('La carta');
  });

  it('una ruta que no conocemos cae a la carta', () => {
    // Es la pantalla principal y a donde lleva el botón sin historial: mejor
    // que un nombre inventado.
    expect(nombreDeLaPantalla('/algo-nuevo')).toBe('La carta');
  });
});

describe('a dónde vuelve el botón', () => {
  it('a la pantalla de la que vino', () => {
    // El caso del bug: se entra a la cuenta desde el carrito.
    const vuelta = aDondeVuelve('/carrito', '/carta');

    expect(vuelta.nombre).toBe('El carrito');
    expect(vuelta.ruta).toBe('/carrito');
  });

  it('sin pantalla anterior, a la que se le indique', () => {
    // Alguien que escaneó el QR y cayó directo acá: no hay historial propio.
    const vuelta = aDondeVuelve(null, '/carta');

    expect(vuelta.nombre).toBe('La carta');
    expect(vuelta.ruta).toBe('/carta');
  });

  it('el nombre siempre coincide con la ruta', () => {
    // Es todo el punto: que el botón no diga una pantalla y lleve a otra.
    for (const anterior of ['/carta', '/carrito', '/estado', '/cuenta', null]) {
      const vuelta = aDondeVuelve(anterior, '/carta');

      expect(vuelta.nombre).toBe(nombreDeLaPantalla(vuelta.ruta));
    }
  });
});
