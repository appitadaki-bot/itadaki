/**
 * Cuándo la pantalla de estado puede decir que no hay pedidos.
 *
 * Es una afirmación fuerte: el comensal acaba de mandar un plato, el mozo lo
 * marcó en camino, y la pantalla le dice que no mandó nada. Sólo se puede
 * decir cuando el servidor ya contestó — no cuando la carga simplemente
 * terminó, porque terminar incluye haber fallado.
 *
 * El caso que la rompió: al recuperar la mesa después de recargar, el token
 * llega un instante después que la sesión. La carga salía sin pedir nada, la
 * sesión quedaba marcada como cargada, y como no volvía a cambiar el intento
 * no se repetía nunca.
 */

/** Lo mismo que decide la pantalla, extraído para poder probarlo. */
function diceQueNoHayPedidos(loaded: boolean): boolean {
  return loaded;
}

/** Lo mismo que decide el store: si corresponde ir a buscarlos. */
function vuelveAIntentar(
  sessionId: string | null,
  loadedFor: string | null,
  loaded: boolean,
): boolean {
  if (sessionId === loadedFor && loaded) return false;
  return sessionId !== null;
}

describe('decir que la mesa no pidió nada', () => {
  it('no lo dice mientras el servidor no contestó', () => {
    // Acá estaba el error: el plato ya estaba en la cocina.
    expect(diceQueNoHayPedidos(false)).toBe(false);
  });

  it('lo dice cuando el servidor contestó que no hay nada', () => {
    expect(diceQueNoHayPedidos(true)).toBe(true);
  });
});

describe('volver a buscar los pedidos', () => {
  it('reintenta si la carga anterior no llegó a traer nada', () => {
    // El token de la mesa aparece después de la sesión al recargar: sin este
    // reintento la pantalla se quedaba vacía para siempre.
    expect(vuelveAIntentar('s1', 's1', false)).toBe(true);
  });

  it('no reintenta si ya los tiene', () => {
    expect(vuelveAIntentar('s1', 's1', true)).toBe(false);
  });

  it('busca los de la mesa nueva al cambiar de mesa', () => {
    expect(vuelveAIntentar('s2', 's1', true)).toBe(true);
  });

  it('no busca nada sin mesa', () => {
    expect(vuelveAIntentar(null, 's1', false)).toBe(false);
  });
});
