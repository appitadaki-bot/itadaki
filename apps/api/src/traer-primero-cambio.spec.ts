/**
 * Qué toca el endpoint que modifica una línea de la mesa.
 *
 * El mismo endpoint sirve para dos cosas: cambiar la cantidad y marcar que un
 * plato salga primero. La regla que las separa es que sólo se toca lo que
 * viene declarado — si no, tocar "+" en las empanadas borraría que la mesa
 * pidió que salieran de entrada, y nadie relacionaría una cosa con la otra.
 */

/** Lo mismo que decide el caso de uso, extraído para poder probarlo. */
function marcaResultante(
  actual: boolean,
  enviado: boolean | undefined,
): boolean {
  return enviado === undefined ? actual : enviado;
}

describe('modificar una línea que ya está en la mesa', () => {
  it('cambiar la cantidad no desmarca lo pedido', () => {
    // El caso que importa: tocar "+" en un plato marcado.
    expect(marcaResultante(true, undefined)).toBe(true);
  });

  it('cambiar la cantidad tampoco lo marca solo', () => {
    expect(marcaResultante(false, undefined)).toBe(false);
  });

  it('marcarlo explícitamente lo marca', () => {
    expect(marcaResultante(false, true)).toBe(true);
  });

  it('desmarcarlo explícitamente lo desmarca', () => {
    // Quien se arrepiente tiene que poder volver atrás.
    expect(marcaResultante(true, false)).toBe(false);
  });
});
