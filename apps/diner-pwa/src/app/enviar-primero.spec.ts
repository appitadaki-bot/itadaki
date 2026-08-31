/**
 * Que "traer primero" sobreviva al envío.
 *
 * El switch guardaba bien en la mesa y la cocina sabía mostrarlo, pero entre
 * una cosa y la otra se perdía: los dos caminos que mandan a la cocina arman
 * la lista de líneas campo por campo, y ninguno copiaba éste. Todo parecía
 * andar hasta que el plato llegaba a la cocina sin la marca.
 *
 * Se prueba el armado del cuerpo, que es donde estaba el agujero. Copiar
 * campo por campo es lo que permite que el servidor nunca reciba un precio
 * inventado por el teléfono, así que la solución no es mandar la línea entera
 * — es acordarse de cada campo, y esto es lo que se acuerda por nosotros.
 */

interface LineaDeLaMesa {
  readonly productId: string;
  readonly quantity: number;
  readonly notes: string;
  readonly primero?: boolean;
}

/** Lo mismo que arma el carrito compartido antes de mandar. */
function aEnviar(lineas: readonly LineaDeLaMesa[]) {
  return lineas.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    notes: line.notes,
    modifierIds: [],
    primero: line.primero ?? false,
  }));
}

const empanadas: LineaDeLaMesa = { productId: 'e1', quantity: 2, notes: '', primero: true };
const bife: LineaDeLaMesa = { productId: 'a1', quantity: 1, notes: '' };

describe('mandar el pedido a la cocina', () => {
  it('lleva la marca del plato que va primero', () => {
    // El bug: el switch se prendía, se guardaba, y se perdía justo al mandar.
    expect(aEnviar([empanadas])[0]?.primero).toBe(true);
  });

  it('el plato sin marcar llega sin marca', () => {
    expect(aEnviar([bife])[0]?.primero).toBe(false);
  });

  it('en un pedido mezclado, cada plato lleva lo suyo', () => {
    // El caso real: la empanada de entrada y el principal en el mismo envío.
    const enviado = aEnviar([empanadas, bife]);

    expect(enviado.map((l) => l.primero)).toEqual([true, false]);
  });

  it('una línea sin el campo no rompe el envío', () => {
    // Las que quedaron guardadas antes de que esto existiera.
    const vieja: LineaDeLaMesa = { productId: 'm1', quantity: 1, notes: '' };

    expect(aEnviar([vieja])[0]?.primero).toBe(false);
  });

  it('sigue mandando lo que ya mandaba', () => {
    // Al sumar un campo es fácil romper otro sin notarlo.
    const enviado = aEnviar([empanadas])[0];

    expect(enviado?.productId).toBe('e1');
    expect(enviado?.quantity).toBe(2);
  });
});
