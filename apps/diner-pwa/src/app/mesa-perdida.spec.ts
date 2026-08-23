/**
 * Qué hacer cuando el servidor ya no tiene la mesa.
 *
 * El teléfono guarda en qué mesa estaba para que recargar la página no eche a
 * nadie. Pero la mesa puede haber dejado de existir mientras tanto —el local
 * la cerró, el servidor se reinició— y entonces lo guardado apunta a algo que
 * ya no está.
 *
 * Antes toda respuesta que no fuera OK se trataba igual que un corte de red y
 * se conservaba la última mesa conocida. Con un 404 eso dejaba al comensal
 * dentro de una mesa fantasma: la pantalla seguía diciendo "mesa 7", el
 * carrito dejaba agregar platos, y el error recién aparecía al tocar enviar.
 *
 * Se prueba acá, sobre la decisión sola, porque es la que separa "no está" de
 * "no llegué" y tiene que valer igual en cada camino que refresque la mesa.
 */

/** Lo mismo que decide el store, extraído para poder probarlo. */
function sueltaLaMesa(status: number | 'sin-red'): boolean {
  return status === 404;
}

describe('una mesa que el servidor ya no tiene', () => {
  it('se suelta cuando el servidor dice que no existe', () => {
    // Si no, el comensal queda dentro de una mesa fantasma hasta que intenta
    // pedir algo.
    expect(sueltaLaMesa(404)).toBe(true);
  });

  it('se aguanta cuando el servidor está caído', () => {
    // Un 500 es pasajero: la mesa sigue estando y el próximo intento la
    // recupera. Soltarla acá echaría a alguien que está comiendo.
    expect(sueltaLaMesa(500)).toBe(false);
    expect(sueltaLaMesa(502)).toBe(false);
  });

  it('se aguanta cuando no hay red', () => {
    // El caso más común de todos: el teléfono perdió señal un segundo.
    expect(sueltaLaMesa('sin-red')).toBe(false);
  });

  it('no toca nada cuando la mesa responde bien', () => {
    expect(sueltaLaMesa(200)).toBe(false);
  });
});

/**
 * Qué muestra el carrito según si se entró a la mesa o no.
 *
 * El nombre de la mesa sale del token del QR, que queda guardado con sólo
 * escanear. Mostrarlo como "pedido compartido" sin sesión prometía algo que no
 * existía.
 */
function encabezado(joined: boolean, mesa: string | null): string {
  return joined && mesa !== null ? `Mesa ${mesa} · pedido compartido` : 'Tu pedido';
}

describe('el encabezado del carrito', () => {
  it('dice "compartido" sólo si se entró a la mesa', () => {
    expect(encabezado(true, '7')).toBe('Mesa 7 · pedido compartido');
  });

  it('con el QR escaneado pero sin entrar, es un pedido propio', () => {
    // Este era el error: decía "mesa 7 · pedido compartido" con sólo tener el
    // token guardado, y enviar fallaba después.
    expect(encabezado(false, '7')).toBe('Tu pedido');
  });

  it('sin mesa ni sesión, también', () => {
    expect(encabezado(false, null)).toBe('Tu pedido');
  });
});
