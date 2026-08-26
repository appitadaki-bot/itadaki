import { Money } from '@itadaki/shared/domain';
import { OrderItem } from './order-item';

/**
 * "Traer primero": lo que la mesa le pide a la cocina.
 *
 * Es una señal, no una regla. El plato no se retiene ni se manda en otro
 * envío: la cocina lo ve marcado y sigue decidiendo el orden, que es lo que
 * hace hoy sin sistema y lo que sabe hacer.
 *
 * Se probó pensando en el caso que lo originó: quien quiere la empanada de
 * entrada, sin que le traigan el principal junto.
 */

const precio = (minor: number): Money => {
  const result = Money.of(minor, 'ARS');
  if (result.isErr()) throw new Error('fixture must be valid');
  return result.value;
};

const unPlato = (primero?: boolean) =>
  OrderItem.create({
    id: 'i1',
    dinerId: 'd1',
    product: {
      productId: 'e1',
      name: 'Empanadas de carne',
      unitPrice: precio(340_000),
      capturedAt: new Date('2026-08-26T20:00:00Z'),
    },
    quantity: 1,
    ...(primero === undefined ? {} : { primero }),
  });

describe('marcar un plato para que salga primero', () => {
  it('un plato marcado lo dice', () => {
    const item = unPlato(true);
    if (item.isErr()) throw new Error('expected ok');

    expect(item.value.primero).toBe(true);
  });

  it('sin marcar, no', () => {
    const item = unPlato(false);
    if (item.isErr()) throw new Error('expected ok');

    expect(item.value.primero).toBe(false);
  });

  it('quien no lo pide come como siempre', () => {
    // El caso de la enorme mayoría: nadie tiene que elegir nada para que el
    // pedido funcione igual que antes.
    const item = unPlato();
    if (item.isErr()) throw new Error('expected ok');

    expect(item.value.primero).toBe(false);
  });

  it('no cambia el precio', () => {
    // Es una preferencia, no un adicional: cobrar por esto sería cobrar por
    // pedir bien.
    const marcado = unPlato(true);
    const normal = unPlato(false);
    if (marcado.isErr() || normal.isErr()) throw new Error('expected ok');

    const unoTotal = marcado.value.lineTotal();
    const otroTotal = normal.value.lineTotal();
    if (unoTotal.isErr() || otroTotal.isErr()) throw new Error('expected ok');

    expect(unoTotal.value.amountInMinorUnits).toBe(otroTotal.value.amountInMinorUnits);
  });

  it('la marca no se puede cambiar una vez creado el plato', () => {
    // El plato se congela al enviarse, igual que su precio: la cocina no puede
    // recibir una comanda que cambia mientras la está leyendo.
    const item = unPlato(true);
    if (item.isErr()) throw new Error('expected ok');

    expect(Object.isFrozen(item.value)).toBe(true);
  });
});
