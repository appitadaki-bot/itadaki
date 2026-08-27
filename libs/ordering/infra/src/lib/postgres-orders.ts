import {
  type OrderReader,
  type OrderRepositoryError,
  type OrderWriter,
  type SessionReader,
  type SessionState,
  type SessionWriter,
} from '@itadaki/ordering/application';
import {
  type CartLine,
  type ModifierSnapshot,
  Order,
  OrderItem,
  type OrderStatus,
  type StatusChange,
  type TableSession,
} from '@itadaki/ordering/domain';
import { type CurrencyCode, type Result, err, ok } from '@itadaki/shared/domain';
import { type Database } from '@itadaki/shared/persistence';
import {
  type CartLineRow,
  type MoneyJson,
  cartLineFromRow,
  cartLineToRow,
  fromMoney,
  toMoney,
} from './cart-line-row';

interface OrderRow {
  id: string;
  client_request_id: string;
  session_id: string;
  status: string;
  currency: string;
  items: Array<{
    id: string;
    dinerId: string;
    quantity: number;
    notes: string;
    /** Ausente en los pedidos anteriores a esto, que se leen como `false`. */
    primero?: boolean;
    product: { productId: string; name: string; unitPrice: MoneyJson; capturedAt: string };
    modifiers: Array<{ modifierId: string; name: string; priceDelta: MoneyJson }>;
  }>;
  history: Array<{ status: string; at: string; actor: string }>;
  item_status: Array<{ itemId: string; status: string }>;
}

/**
 * Orders are stored with their frozen item snapshots as JSONB. The prices in
 * those snapshots are the contract with the diner, so they are written once
 * and never recomputed from the catalog on read.
 */
/**
 * Cuántas filas puede devolver un listado como mucho.
 *
 * No son límites de negocio: son el techo de lo que una sola petición puede
 * cargar en memoria. Sin ellos, una consulta barata de escribir —"dame los
 * pedidos"— puede costar cientos de megabytes del lado del servidor el día que
 * los datos crezcan de una forma que nadie previó.
 *
 * Cada número está por encima de lo que la realidad produce, así que llegar al
 * tope significa que algo anda mal. Por eso quien llama compara la cantidad
 * contra el tope y lo dice: truncar en silencio una cuenta o un informe de
 * ventas sería peor que devolverlos lentos.
 */

/** Comandas sin entregar. Una cocina desbordada tiene decenas, no cientos. */
export const MAX_ACTIVE_ORDERS = 300;

/** Envíos de una misma mesa. Un cumpleaños de veinte pide muchas veces; no mil. */
export const MAX_SESSION_ORDERS = 200;

/**
 * Pedidos de una ventana de tiempo, para las métricas.
 *
 * Los crudos se archivan a los sesenta días, así que esto acota el pico de un
 * local muy movido dentro de esa ventana, no un historial infinito.
 */
export const MAX_ORDERS_IN_WINDOW = 20_000;

export class PostgresOrderStore implements OrderReader, OrderWriter {
  constructor(private readonly db: Database) {}

  private toOrder(row: OrderRow): Order {
    const items = row.items.map((item) => {
      const built = OrderItem.create({
        id: item.id,
        dinerId: item.dinerId,
        quantity: item.quantity,
        notes: item.notes,
        primero: item.primero ?? false,
        product: {
          productId: item.product.productId,
          name: item.product.name,
          unitPrice: toMoney(item.product.unitPrice),
          capturedAt: new Date(item.product.capturedAt),
        },
        modifiers: item.modifiers.map(
          (modifier): ModifierSnapshot => ({
            modifierId: modifier.modifierId,
            name: modifier.name,
            priceDelta: toMoney(modifier.priceDelta),
          }),
        ),
      });
      if (built.isErr()) throw new Error(`corrupt order item ${item.id}`);
      return built.value;
    });

    return Order.restore({
      id: row.id,
      clientRequestId: row.client_request_id,
      sessionId: row.session_id,
      currency: row.currency as CurrencyCode,
      status: row.status as OrderStatus,
      items,
      history: row.history.map(
        (entry): StatusChange => ({
          status: entry.status as OrderStatus,
          at: new Date(entry.at),
          actor: entry.actor,
        }),
      ),
      itemProgress: (row.item_status ?? []).map((entry) => ({
        itemId: entry.itemId,
        status: entry.status as OrderStatus,
      })),
    });
  }

  async findById(tenantId: string, orderId: string): Promise<Result<Order, OrderRepositoryError>> {
    try {
      const rows = await this.db.withTenant(tenantId, async (client) => {
        const result = await client.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [orderId]);
        return result.rows;
      });
      const row = rows[0];
      return row === undefined ? err({ kind: 'NOT_FOUND', id: orderId }) : ok(this.toOrder(row));
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  async listActive(tenantId: string): Promise<Result<readonly Order[], OrderRepositoryError>> {
    try {
      const rows = await this.db.withTenant(tenantId, async (client) => {
        const result = await client.query<OrderRow>(
          `SELECT * FROM orders
            WHERE status NOT IN ('DELIVERED','CANCELLED')
            ORDER BY created_at
            LIMIT ${MAX_ACTIVE_ORDERS}`,
        );
        return result.rows;
      });
      return ok(rows.map((row) => this.toOrder(row)));
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  async listBySession(
    tenantId: string,
    sessionId: string,
  ): Promise<Result<readonly Order[], OrderRepositoryError>> {
    try {
      const rows = await this.db.withTenant(tenantId, async (client) => {
        const result = await client.query<OrderRow>(
          `SELECT * FROM orders
            WHERE session_id = $1
            ORDER BY created_at
            LIMIT ${MAX_SESSION_ORDERS}`,
          [sessionId],
        );
        return result.rows;
      });
      return ok(rows.map((row) => this.toOrder(row)));
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  async listPlacedBetween(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<Result<readonly Order[], OrderRepositoryError>> {
    try {
      const rows = await this.db.withTenant(tenantId, async (client) => {
        const result = await client.query<OrderRow>(
          `SELECT * FROM orders
            WHERE created_at >= $1 AND created_at < $2
            ORDER BY created_at
            LIMIT ${MAX_ORDERS_IN_WINDOW}`,
          [from, to],
        );
        return result.rows;
      });
      return ok(rows.map((row) => this.toOrder(row)));
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  async findByClientRequestId(
    tenantId: string,
    clientRequestId: string,
  ): Promise<Result<Order | null, OrderRepositoryError>> {
    try {
      const rows = await this.db.withTenant(tenantId, async (client) => {
        const result = await client.query<OrderRow>(
          'SELECT * FROM orders WHERE client_request_id = $1',
          [clientRequestId],
        );
        return result.rows;
      });
      const row = rows[0];
      return ok(row === undefined ? null : this.toOrder(row));
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  async save(tenantId: string, order: Order): Promise<Result<Order, OrderRepositoryError>> {
    try {
      await this.db.withTenant(tenantId, async (client) => {
        await client.query(
          `INSERT INTO orders (tenant_id, id, client_request_id, session_id, status,
                               currency, items, history, item_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (tenant_id, id) DO UPDATE SET
             status = EXCLUDED.status,
             items = EXCLUDED.items,
             history = EXCLUDED.history,
             item_status = EXCLUDED.item_status`,
          [
            tenantId,
            order.id,
            order.clientRequestId,
            order.sessionId,
            order.status,
            order.currency,
            JSON.stringify(
              order.items.map((item) => ({
                id: item.id,
                dinerId: item.dinerId,
                quantity: item.quantity,
                notes: item.notes,
                primero: item.primero,
                product: {
                  productId: item.product.productId,
                  name: item.product.name,
                  unitPrice: fromMoney(item.product.unitPrice),
                  capturedAt: item.product.capturedAt.toISOString(),
                },
                modifiers: item.modifiers.map((modifier) => ({
                  modifierId: modifier.modifierId,
                  name: modifier.name,
                  priceDelta: fromMoney(modifier.priceDelta),
                })),
              })),
            ),
            JSON.stringify(
              order.history.map((entry) => ({
                status: entry.status,
                at: entry.at.toISOString(),
                actor: entry.actor,
              })),
            ),
            JSON.stringify(order.itemProgress),
          ],
        );
      });
      return ok(order);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }
}

interface SessionRow {
  id: string;
  tenant_id: string;
  table_id: string;
  status: string;
  currency: string;
  diners: Array<{ id: string; nickname: string; colorIndex: number; joinedAt: string }>;
  cart_lines: CartLineRow[];
  opened_at: string;
  /** Null en las sesiones abiertas antes de que existiera el código. */
  join_code: string | null;
}

export class PostgresSessionStore implements SessionReader, SessionWriter {
  constructor(private readonly db: Database) {}

  private toState(row: SessionRow): SessionState {
    const session: TableSession = {
      id: row.id,
      tenantId: row.tenant_id,
      tableId: row.table_id,
      status: row.status as TableSession['status'],
      currency: row.currency as CurrencyCode,
      openedAt: new Date(row.opened_at),
      diners: row.diners.map((diner) => ({
        id: diner.id,
        nickname: diner.nickname,
        colorIndex: diner.colorIndex,
        joinedAt: new Date(diner.joinedAt),
      })),
    };

    const lines: CartLine[] = row.cart_lines.map(cartLineFromRow);

    return { session, cart: { currency: session.currency, lines } };
  }

  async findById(
    tenantId: string,
    sessionId: string,
  ): Promise<Result<SessionState, OrderRepositoryError>> {
    try {
      const rows = await this.db.withTenant(tenantId, async (client) => {
        const result = await client.query<SessionRow>(
          'SELECT * FROM table_sessions WHERE id = $1',
          [sessionId],
        );
        return result.rows;
      });
      const row = rows[0];
      return row === undefined ? err({ kind: 'NOT_FOUND', id: sessionId }) : ok(this.toState(row));
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  async listOpen(tenantId: string): Promise<Result<readonly SessionState[], OrderRepositoryError>> {
    try {
      const rows = await this.db.withTenant(tenantId, async (client) => {
        const result = await client.query<SessionRow>(
          "SELECT * FROM table_sessions WHERE status = 'OPEN' ORDER BY opened_at",
        );
        return result.rows;
      });
      return ok(rows.map((row) => this.toState(row)));
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /**
   * Closes sessions left open long past any plausible meal.
   *
   * Tables get abandoned: a group leaves without asking for the bill, or the
   * last phone closes mid-order. Without a sweep those sessions hold their
   * table forever, because the unique index only permits one OPEN row per
   * table. Runs across every tenant, so it is unscoped by design.
   */
  /**
   * Los restaurantes activos, para recorrerlos uno por uno.
   *
   * Con RLS en FORCE una consulta sin tenant en alcance no ve ninguna fila,
   * así que cualquier tarea que abarque a todos tiene que caminar el
   * directorio —que no está filtrado— y fijar el alcance en cada vuelta.
   */
  async activeTenants(): Promise<Result<readonly string[], OrderRepositoryError>> {
    try {
      const ids = await this.db.unscoped(async (client) => {
        const result = await client.query<{ id: string }>(
          'SELECT id FROM tenants WHERE active ORDER BY id',
        );
        return result.rows.map((row) => row.id);
      });
      return ok(ids);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /**
   * Borra los pedidos de un día que ya quedó resumido.
   *
   * Exige que el resumen exista antes de borrar: sin esa condición, un error
   * al guardarlo dejaría el día sin pedidos y sin números, y eso no se puede
   * deshacer. Por eso la comprobación va en la misma consulta y no en el
   * código que la llama.
   *
   * Sólo mesas cerradas: una abierta todavía está comiendo, y su cuenta se
   * calcula con esos pedidos.
   */
  async purgeSummarised(
    tenantId: string,
    upToDay: Date,
  ): Promise<Result<number, OrderRepositoryError>> {
    try {
      const borrados = await this.db.withTenant(tenantId, async (client) => {
        const result = await client.query(
          `DELETE FROM orders o
             USING table_sessions s
            WHERE o.session_id = s.id
              AND s.status = 'CLOSED'
              AND o.created_at < $1::date
              AND EXISTS (
                SELECT 1 FROM daily_summaries d
                 WHERE d.day = o.created_at::date
              )`,
          [upToDay],
        );
        return result.rowCount ?? 0;
      });

      return ok(borrados);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /**
   * Borra el apodo de las mesas que ya terminaron.
   *
   * El apodo es el único dato del comensal que guardamos, y la política de
   * privacidad promete que no se conserva más de lo necesario. Una vez cerrada
   * la cuenta ya no cumple ninguna función: sirve para que el resto de la mesa
   * vea quién pidió qué mientras están comiendo, y después es un nombre suelto
   * en una base para siempre.
   *
   * Lo que queda es la venta —qué se pidió y cuánto salió— que es el registro
   * comercial del restaurante y no identifica a nadie: los pedidos guardan su
   * propia copia del plato y el precio, nunca el nombre.
   */
  async forgetDiners(olderThanDays: number): Promise<Result<number, OrderRepositoryError>> {
    try {
      const limpiadas = await this.db.unscoped(async (client) => {
        // Mismo recorrido que el barrido: con RLS en FORCE, una consulta sin
        // tenant en alcance no ve ninguna fila y reporta éxito igual.
        const tenants = await client.query<{ tenant_id: string }>(
          'SELECT id AS tenant_id FROM tenants WHERE active',
        );

        let total = 0;
        for (const row of tenants.rows) {
          await client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', row.tenant_id]);
          const result = await client.query(
            `UPDATE table_sessions
                SET diners = '[]'::jsonb
              WHERE status = 'CLOSED'
                AND diners <> '[]'::jsonb
                AND opened_at < now() - ($1 || ' days')::interval`,
            [olderThanDays],
          );
          total += result.rowCount ?? 0;
        }
        return total;
      });

      return ok(limpiadas);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  async closeStale(olderThanHours: number): Promise<Result<number, OrderRepositoryError>> {
    try {
      const closed = await this.db.unscoped(async (client) => {
        // Row level security is FORCE on this table, so both reads and writes
        // see nothing without a tenant in scope — an unscoped UPDATE matches
        // no rows and still reports success. The sweep therefore walks the
        // tenant directory, which is not row-filtered, and scopes each pass.
        const stale = await client.query<{ tenant_id: string }>(
          'SELECT id AS tenant_id FROM tenants WHERE active',
        );

        let total = 0;
        for (const row of stale.rows) {
          await client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', row.tenant_id]);
          const result = await client.query(
            `UPDATE table_sessions
                SET status = 'CLOSED'
              WHERE status = 'OPEN'
                AND opened_at < now() - ($1 || ' hours')::interval`,
            [olderThanHours],
          );
          total += result.rowCount ?? 0;
        }
        // Leave no tenant set on a pooled connection.
        await client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', '']);
        return total;
      });
      return ok(closed);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  async findOpenForTable(
    tenantId: string,
    tableId: string,
  ): Promise<Result<SessionState | null, OrderRepositoryError>> {
    try {
      const rows = await this.db.withTenant(tenantId, async (client) => {
        const result = await client.query<SessionRow>(
          `SELECT * FROM table_sessions WHERE table_id = $1 AND status = 'OPEN'`,
          [tableId],
        );
        return result.rows;
      });
      const row = rows[0];
      return ok(row === undefined ? null : this.toState(row));
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /**
   * Read-modify-write under a row lock.
   *
   * `withTenant` already wraps the callback in a transaction, so the
   * `FOR UPDATE` taken here is held until it commits. Concurrent writers to
   * the same table queue rather than overwrite each other — without it, two
   * diners adding a dish simultaneously lose one of them.
   */
  async mutate(
    tenantId: string,
    sessionId: string,
    change: (state: SessionState) => Result<SessionState, OrderRepositoryError>,
  ): Promise<Result<SessionState, OrderRepositoryError>> {
    try {
      return await this.db.withTenant(tenantId, async (client) => {
        const rows = await client.query<SessionRow>(
          'SELECT * FROM table_sessions WHERE id = $1 FOR UPDATE',
          [sessionId],
        );

        const row = rows.rows[0];
        if (row === undefined) {
          return err({ kind: 'NOT_FOUND', id: sessionId });
        }

        const changed = change(this.toState(row));
        if (changed.isErr()) {
          return err(changed.error);
        }

        await this.writeSession(client, tenantId, changed.value);
        return ok(changed.value);
      });
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /** The write itself, shared by `save` and the locked `mutate` path. */
  private async writeSession(
    client: { query: (text: string, values: unknown[]) => Promise<unknown> },
    tenantId: string,
    state: SessionState,
  ): Promise<void> {
    await client.query(
      `INSERT INTO table_sessions (tenant_id, id, table_id, status, currency,
                                   diners, cart_lines, opened_at, join_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (tenant_id, id) DO UPDATE SET
         status = EXCLUDED.status,
         diners = EXCLUDED.diners,
         cart_lines = EXCLUDED.cart_lines`,
      [
        tenantId,
        state.session.id,
        state.session.tableId,
        state.session.status,
        state.session.currency,
        JSON.stringify(
          state.session.diners.map((diner) => ({
            id: diner.id,
            nickname: diner.nickname,
            colorIndex: diner.colorIndex,
            joinedAt: diner.joinedAt.toISOString(),
          })),
        ),
        JSON.stringify(state.cart.lines.map(cartLineToRow)),
        state.session.openedAt,
        // La columna quedó de cuando el código vivía en la sesión. Ahora es de
        // la mesa: ver la migración 011.
        null,
      ],
    );
  }

  async save(
    tenantId: string,
    state: SessionState,
  ): Promise<Result<SessionState, OrderRepositoryError>> {
    try {
      await this.db.withTenant(tenantId, async (client) => {
        await this.writeSession(client, tenantId, state);
      });
      return ok(state);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }
}
