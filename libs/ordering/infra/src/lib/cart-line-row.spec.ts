import { type CartLine } from '@itadaki/ordering/domain';
import { cartLineFromRow, cartLineToRow } from './cart-line-row';

/**
 * La marca de "traer primero" se perdía en las dos direcciones: no se
 * serializaba al guardar y no se leía al releer. El resultado en pantalla era
 * un interruptor que se encendía y volvía solo, porque la respuesta del PATCH
 * traía la sesión ya releída de la base.
 *
 * Lo que se prueba acá es la ida y vuelta completa. Un campo nuevo que se
 * agregue a la línea y se olvide en uno de los dos lados falla en este test y
 * no en la mesa de un restaurante.
 */
describe('una línea del carrito guardada y releída', () => {
  const linea: CartLine = {
    id: 'l1',
    dinerId: 'd1',
    quantity: 2,
    notes: 'sin cebolla',
    primero: true,
    product: {
      productId: 'empanadas',
      name: 'Empanadas de carne',
      unitPrice: { amountInMinorUnits: 340_000, currency: 'ARS' },
      capturedAt: new Date('2026-08-26T20:00:00.000Z'),
    },
    modifiers: [],
  } as unknown as CartLine;

  it('conserva la marca de traer primero', () => {
    expect(cartLineFromRow(cartLineToRow(linea)).primero).toBe(true);
  });

  it('conserva lo demás de la línea', () => {
    const vuelta = cartLineFromRow(cartLineToRow(linea));

    expect(vuelta.id).toBe('l1');
    expect(vuelta.quantity).toBe(2);
    expect(vuelta.notes).toBe('sin cebolla');
    expect(vuelta.product.name).toBe('Empanadas de carne');
    expect(vuelta.product.unitPrice.amountInMinorUnits).toBe(340_000);
  });

  it('una línea sin marcar vuelve sin marca', () => {
    const sinMarca = { ...linea, primero: undefined } as unknown as CartLine;
    expect(cartLineFromRow(cartLineToRow(sinMarca)).primero).toBeUndefined();
  });

  /** Las líneas guardadas antes de que la marca existiera no la tienen. */
  it('lee una fila vieja, sin el campo', () => {
    const fila = cartLineToRow(linea);
    const { primero: _sacada, ...vieja } = fila;

    expect(cartLineFromRow(vieja as typeof fila).primero).toBeUndefined();
  });

  it('desmarcada explícitamente sigue desmarcada', () => {
    const apagada = { ...linea, primero: false } as unknown as CartLine;
    expect(cartLineFromRow(cartLineToRow(apagada)).primero).toBe(false);
  });
});
