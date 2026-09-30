import { Money } from '@itadaki/shared/domain';
import { Order } from './order';
import { OrderItem, type ProductSnapshot } from './order-item';
import { type OrderStatus } from './order-status';

/**
 * Anular un plato, esté donde esté.
 *
 * La caja saca un plato de la cuenta cuando nunca llegó a la mesa, y eso se
 * descubre al pagar — con el plato ya marcado como entregado. Avanzar no
 * sirve: `READY` y `DELIVERED` son el final del camino de la cocina, y con
 * razón, porque el estado cuenta lo que la cocina hizo.
 *
 * Sin esto, sacarlo de la cuenta lo sacaba sólo de la cuenta: el comensal lo
 * seguía viendo en su teléfono, la cocina lo mostraba como entregado y el mozo
 * lo tenía en el pase. Tres pantallas contando tres cosas distintas del mismo
 * plato, y la única que decía la verdad era la que el cliente no ve.
 */

const AT = new Date('2026-09-30T20:00:00Z');

const ars = (minor: number): Money => {
  const result = Money.of(minor, 'ARS');
  if (result.isErr()) throw new Error('fixture must be valid');
  return result.value;
};

const snapshot: ProductSnapshot = {
  productId: 'p1',
  name: 'Milanesa napolitana',
  unitPrice: ars(400000),
  capturedAt: AT,
};

const item = (id: string): OrderItem => {
  const result = OrderItem.create({ id, dinerId: 'd1', product: snapshot, quantity: 1 });
  if (result.isErr()) throw new Error('fixture must be valid');
  return result.value;
};

/** Un pedido con un plato por estado, para probar desde dónde se puede anular. */
const pedidoCon = (estados: readonly OrderStatus[]): Order =>
  Order.restore({
    id: 'o1',
    clientRequestId: 'req-1',
    sessionId: 's1',
    currency: 'ARS',
    items: estados.map((_, i) => item(`i${i}`)),
    status: 'SENT',
    history: [],
    itemProgress: estados.map((status, i) => ({ itemId: `i${i}`, status })),
  });

describe('anular un plato', () => {
  it('se puede aunque ya esté entregado', () => {
    // Es el caso real: se descubre al pagar, no antes.
    const anulado = pedidoCon(['DELIVERED']).anularItem('i0', 'caja', AT);

    expect(anulado.isOk()).toBe(true);
    if (anulado.isErr()) return;
    expect(anulado.value.statusOf('i0')).toBe('CANCELLED');
  });

  it('y también mientras se está cocinando', () => {
    const anulado = pedidoCon(['IN_PREP']).anularItem('i0', 'mozo', AT);
    expect(anulado.isOk() && anulado.value.statusOf('i0')).toBe('CANCELLED');
  });

  it('pero no dos veces', () => {
    // Anular lo ya anulado no significa nada, y dejarlo pasar esconde que
    // alguien tocó dos veces creyendo que la primera no había entrado.
    expect(pedidoCon(['CANCELLED']).anularItem('i0', 'caja', AT).isErr()).toBe(true);
  });

  it('ni sobre un plato que no está en el pedido', () => {
    expect(pedidoCon(['DELIVERED']).anularItem('no-existe', 'caja', AT).isErr()).toBe(true);
  });

  it('no toca a los demás platos del envío', () => {
    const anulado = pedidoCon(['DELIVERED', 'IN_PREP']).anularItem('i0', 'caja', AT);
    expect(anulado.isOk() && anulado.value.statusOf('i1')).toBe('IN_PREP');
  });
});

describe('el estado del envío después de anular', () => {
  it('sigue al más atrasado de los que quedan en pie', () => {
    // Con uno anulado y el resto entregado, el envío está entregado. Tomar el
    // mínimo contando el anulado dejaría el ticket colgado en el tablero.
    const anulado = pedidoCon(['SENT', 'DELIVERED']).anularItem('i0', 'caja', AT);
    expect(anulado.isOk() && anulado.value.status).toBe('DELIVERED');
  });

  it('y queda cancelado sólo si no sobrevive ninguno', () => {
    const anulado = pedidoCon(['DELIVERED']).anularItem('i0', 'caja', AT);
    expect(anulado.isOk() && anulado.value.status).toBe('CANCELLED');
  });
});
