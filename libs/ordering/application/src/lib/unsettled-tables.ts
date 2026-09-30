import { type Order } from '@itadaki/ordering/domain';
import {
  type CurrencyCode,
  Money,
  type MoneyError,
  type Result,
  err,
  ok,
} from '@itadaki/shared/domain';
import { type OrderReader, type OrderRepositoryError } from './ports';
import { type SessionReader } from './session-ports';

/** Una mesa ocupada, con lo que el salón necesita saber de ella. */
export interface OpenTable {
  readonly sessionId: string;
  readonly tableId: string;
  readonly diners: number;
  readonly openedAt: Date;
}

/**
 * Las mesas ocupadas ahora mismo.
 *
 * Sin el código: ese vive en la mesa, no en la sesión, y lo sirve el endpoint
 * de códigos — que las lista todas, ocupadas o no, porque el mozo lo necesita
 * antes de que exista ninguna sesión.
 */
export function listOpenTables(deps: { sessions: SessionReader }) {
  return async (tenantId: string): Promise<Result<readonly OpenTable[], OrderRepositoryError>> => {
    const open = await deps.sessions.listOpen(tenantId);
    if (open.isErr()) return err(open.error);

    return ok(
      open.value.map((state) => ({
        sessionId: state.session.id,
        tableId: state.session.tableId,
        diners: state.session.diners.length,
        openedAt: state.session.openedAt,
      })),
    );
  };
}

/** Una mesa que ya comió todo y sigue con la cuenta abierta. */
export interface UnsettledTable {
  readonly sessionId: string;
  readonly tableId: string;
  /** Lo consumido, calculado de las comandas y no del carrito. */
  readonly owed: Money;
  /** Cuándo se entregó lo último: hace cuánto que la mesa podría irse. */
  readonly since: Date | null;
  readonly diners: number;
}

/**
 * Las mesas que el salón perdería de vista.
 *
 * El tablero del mozo se arma de lo que está en cocina, así que una mesa a la
 * que ya se le entregó todo desaparece de la pantalla — y con ella el botón de
 * liberar. Comieron, no pagaron, se van, y nadie tuvo delante el aviso de ir a
 * cobrar: la sesión queda abierta en silencio hasta que el barrido la cierra.
 *
 * Una mesa entra en la lista cuando tiene algo consumido y no le queda ningún
 * plato en curso. Mientras espera comida no está: el mozo ya la ve arriba.
 *
 * ponytail: una cuenta saldada cuya sesión no se cerró (el `settle` deja eso
 * registrado como anomalía) aparece acá igual. Es un falso positivo que el
 * mozo resuelve con "Cobrada"; cruzarlo contra el store de facturación cuesta
 * una consulta por mesa y sólo cambia un caso que ya está en el log.
 */
export function listUnsettledTables(deps: {
  sessions: SessionReader;
  orders: OrderReader;
}) {
  /**
   * @param pidieronLaCuenta Sesiones que ya pidieron la cuenta.
   *
   * Esas entran aunque les quede un plato sin marcar como entregado: la mesa
   * ya dijo que terminó, y el sistema no tiene por qué saber más que ella.
   */
  return async (
    tenantId: string,
    pidieronLaCuenta: ReadonlySet<string> = new Set(),
  ): Promise<Result<readonly UnsettledTable[], OrderRepositoryError>> => {
    const open = await deps.sessions.listOpen(tenantId);
    if (open.isErr()) {
      return err(open.error);
    }

    const tables: UnsettledTable[] = [];
    for (const state of open.value) {
      const placed = await deps.orders.listBySession(tenantId, state.session.id);
      if (placed.isErr()) {
        return err(placed.error);
      }

      const pidio = pidieronLaCuenta.has(state.session.id);

      /*
       * Lo que la mesa debe.
       *
       * Normalmente es lo entregado. Pero si pidió la cuenta con un plato que
       * salió de la cocina y nadie marcó "Llevé", ese plato se cobra igual: el
       * cliente lo tiene adelante, y dejarlo afuera mostraría un total menor
       * que el de la cuenta que se le va a cobrar. Dos números distintos para
       * la misma mesa es peor que cualquiera de los dos.
       *
       * Lo que sigue en la cocina no se cobra ni siquiera entonces: eso no
       * llegó a la mesa.
       */
      const served = pidio ? servidoOEnElPase(placed.value) : servedItems(placed.value);
      if (served.length === 0) continue;

      /*
       * Algo todavía en cocina o en la barra: la mesa sigue a la vista del
       * mozo por el camino normal, y avisarle acá sería mandarlo a cobrarle a
       * alguien que está esperando el plato principal.
       *
       * Salvo que haya pedido la cuenta. Ahí la mesa ya decidió que terminó, y
       * dejarla afuera la volvía invisible: no aparecía ni para el mozo ni
       * para la caja, y a las tres horas el barrido la cerraba sin cobrar. Un
       * plato que quedó en "listo" porque nadie tocó "Llevé" alcanzaba para
       * perder la venta entera.
       */
      if (pendingItems(placed.value).length > 0 && !pidieronLaCuenta.has(state.session.id)) {
        continue;
      }

      tables.push({
        sessionId: state.session.id,
        tableId: state.session.tableId,
        owed: totalOf(served, state.session.currency),
        since: lastChangeOf(placed.value),
        diners: state.session.diners.length,
      });
    }

    // La que hace más rato que podría levantarse y salir, primero.
    return ok(
      tables.sort((a, b) => (a.since?.getTime() ?? 0) - (b.since?.getTime() ?? 0)),
    );
  };
}

interface ServedItem {
  readonly quantity: number;
  readonly unitTotal: Money;
}

/** Lo entregado y no cancelado: es lo único que la mesa realmente debe. */
function servedItems(orders: readonly Order[]): readonly ServedItem[] {
  return orders
    .filter((order) => order.status !== 'CANCELLED')
    .flatMap((order) =>
      order.items
        .filter((item) => order.statusOf(item.id) === 'DELIVERED')
        .map((item) => ({ quantity: item.quantity, unitTotal: unitWithModifiers(item) })),
    );
}

/**
 * Lo entregado, más lo que está listo esperando que alguien lo lleve.
 *
 * Para la mesa que pidió la cuenta: un plato en el pase ya salió de la cocina
 * y el mozo lo va a llevar en el camino de ir a cobrar. Contarlo acá es lo que
 * hace que el total del tablero coincida con el de la cuenta —que cobra todo
 * lo no cancelado— en vez de mostrar de menos.
 */
function servidoOEnElPase(orders: readonly Order[]): readonly ServedItem[] {
  return orders
    .filter((order) => order.status !== 'CANCELLED')
    .flatMap((order) =>
      order.items
        .filter((item) => {
          const status = order.statusOf(item.id);
          return status === 'DELIVERED' || status === 'READY';
        })
        .map((item) => ({ quantity: item.quantity, unitTotal: unitWithModifiers(item) })),
    );
}

function pendingItems(orders: readonly Order[]): readonly string[] {
  return orders
    .filter((order) => order.status !== 'CANCELLED')
    .flatMap((order) =>
      order.items
        .filter((item) => {
          const status = order.statusOf(item.id);
          return status !== 'DELIVERED' && status !== 'CANCELLED';
        })
        .map((item) => item.id),
    );
}

/**
 * Precio unitario con sus modificadores, el número congelado al pedir.
 *
 * Nunca un total de línea dividido de vuelta: eso redondea mal y la cuenta
 * termina sin cerrar por unos pesos.
 */
function unitWithModifiers(item: Order['items'][number]): Money {
  const unit = item.modifiers.reduce(
    (acc, modifier) => acc.flatMap((sum) => sum.add(modifier.priceDelta)),
    ok<Money, MoneyError>(item.product.unitPrice),
  );
  return unit.isOk() ? unit.value : item.product.unitPrice;
}

function totalOf(items: readonly ServedItem[], currency: CurrencyCode): Money {
  const total = items.reduce<Result<Money, MoneyError>>(
    (acc, item) =>
      acc.flatMap((sum) => item.unitTotal.multiply(item.quantity).flatMap((line) => sum.add(line))),
    ok(Money.zero(currency)),
  );
  return total.isOk() ? total.value : Money.zero(currency);
}

/** El último movimiento de la mesa, que es cuándo terminó de comer. */
function lastChangeOf(orders: readonly Order[]): Date | null {
  const times = orders.flatMap((order) => order.history.map((change) => change.at.getTime()));
  return times.length === 0 ? null : new Date(Math.max(...times));
}
