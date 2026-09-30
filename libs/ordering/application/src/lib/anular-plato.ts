import { type Order, type OrderError } from '@itadaki/ordering/domain';
import { type Result, err } from '@itadaki/shared/domain';
import {
  type OrderEventPublisher,
  type OrderReader,
  type OrderRepositoryError,
  type OrderWriter,
} from './ports';

export interface AnularPlatoCommand {
  readonly tenantId: string;
  readonly sessionId: string;
  /** El id del plato, tal como lo nombra la cuenta y el pedido. */
  readonly itemId: string;
  readonly actorId: string;
}

export type AnularPlatoError = OrderRepositoryError | OrderError;

/**
 * Anula un plato en el pedido donde esté.
 *
 * Lo llama la caja al sacar un plato de la cuenta. Sin esto, ese plato salía
 * sólo de la cuenta: el comensal lo seguía viendo en su teléfono, la cocina lo
 * mostraba como entregado y el mozo lo tenía en el pase. Tres pantallas
 * contando tres cosas distintas sobre el mismo plato, y la única que decía la
 * verdad era la que el cliente no ve.
 *
 * Busca por sesión y no por envío porque quien lo pide tiene el id de una
 * línea de la cuenta, y una mesa puede haber pedido varias veces. El id del
 * plato es el mismo en los dos lados.
 */
export function anularPlato(deps: {
  orders: OrderReader & OrderWriter;
  events: OrderEventPublisher;
  now: () => Date;
}) {
  return async (command: AnularPlatoCommand): Promise<Result<Order, AnularPlatoError>> => {
    const placed = await deps.orders.listBySession(command.tenantId, command.sessionId);
    if (placed.isErr()) {
      return err(placed.error);
    }

    const dueño = placed.value.find((order) =>
      order.items.some((item) => item.id === command.itemId),
    );
    if (dueño === undefined) {
      return err({ kind: 'ITEM_NOT_FOUND', itemId: command.itemId });
    }

    const anulado = dueño.anularItem(command.itemId, command.actorId, deps.now());
    if (anulado.isErr()) {
      return err(anulado.error);
    }

    const saved = await deps.orders.save(command.tenantId, anulado.value);
    if (saved.isErr()) {
      return err(saved.error);
    }

    // Para que las tres pantallas se enteren sin esperar al próximo refresco:
    // el comensal está mirando su teléfono justo cuando esto pasa.
    await deps.events.orderChanged({
      tenantId: command.tenantId,
      orderId: saved.value.id,
      sessionId: saved.value.sessionId,
      status: saved.value.status,
    });

    return saved;
  };
}
