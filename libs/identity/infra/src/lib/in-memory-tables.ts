import { type Result, err, ok } from '@itadaki/shared/domain';
import { type RestaurantTable, type TableError } from './postgres-tables';

/** Fixed so a QR generated in one run still verifies after a restart. */
const DEMO_SECRET = 'demo-table-secret-not-for-production';

/** Fijo igual que el secreto: en memoria no hay a quién preguntarle el código. */
const DEMO_JOIN_CODE = '000000';

const DEMO_TABLES: readonly RestaurantTable[] = [
  { tenantId: 'itadaki', id: 'mesa-7', label: 'Mesa 7', seats: 4, secret: DEMO_SECRET, joinCode: DEMO_JOIN_CODE },
  { tenantId: 'itadaki', id: 'mesa-1', label: 'Mesa 1', seats: 2, secret: DEMO_SECRET, joinCode: DEMO_JOIN_CODE },
];

/**
 * Table lookup for `USE_POSTGRES=false`.
 *
 * The QR check needs a table secret, so without this the whole diner flow is
 * unreachable when running in memory — the carte loads and nothing else does.
 * Seeded with the same tables the SQL seed creates.
 */
export class InMemoryTableStore {
  /*
   * Las mesas viven en el proceso, no en la instancia.
   *
   * Cada verificacion de un QR construye un store nuevo. Con el mapa por
   * instancia eso funcionaba de casualidad —el secreto es fijo— pero una mesa
   * creada o borrada desde el panel desaparecia en cuanto se armaba otro
   * store, que es como se comporta una base de datos que no guarda nada.
   */
  private static readonly shared = new Map<string, RestaurantTable>(
    DEMO_TABLES.map((table) => [`${table.tenantId}:${table.id}`, table]),
  );

  private get rows(): Map<string, RestaurantTable> {
    return InMemoryTableStore.shared;
  }

  async find(tenantId: string, tableId: string): Promise<Result<RestaurantTable, TableError>> {
    const found = this.rows.get(`${tenantId}:${tableId}`);
    return found === undefined ? err({ kind: 'NOT_FOUND', id: tableId }) : ok(found);
  }

  async list(tenantId: string): Promise<Result<readonly RestaurantTable[], TableError>> {
    return ok([...this.rows.values()].filter((table) => table.tenantId === tenantId));
  }

  async save(
    table: Omit<RestaurantTable, 'secret' | 'joinCode'>,
  ): Promise<Result<RestaurantTable, TableError>> {
    const existing = this.rows.get(`${table.tenantId}:${table.id}`);
    const saved: RestaurantTable = {
      ...table,
      secret: DEMO_SECRET,
      joinCode: existing?.joinCode ?? DEMO_JOIN_CODE,
    };
    this.rows.set(`${table.tenantId}:${table.id}`, saved);
    return ok(saved);
  }

  async remove(tenantId: string, tableId: string): Promise<Result<void, TableError>> {
    const key = `${tenantId}:${tableId}`;
    if (!this.rows.has(key)) {
      return err({ kind: 'NOT_FOUND', id: tableId });
    }
    this.rows.delete(key);
    return ok(undefined);
  }

  /*
   * Devuelve el mismo codigo de siempre.
   *
   * En memoria no hay a quien preguntarle el codigo nuevo: el mozo lo lee de
   * una pantalla que aca no existe, asi que rotarlo dejaria la mesa
   * inaccesible hasta reiniciar.
   */
  async rotateJoinCode(tenantId: string, tableId: string): Promise<Result<string, TableError>> {
    const found = await this.find(tenantId, tableId);
    return found.isErr() ? err(found.error) : ok(found.value.joinCode ?? DEMO_JOIN_CODE);
  }

  async rotateSecret(
    tenantId: string,
    tableId: string,
  ): Promise<Result<RestaurantTable, TableError>> {
    return this.find(tenantId, tableId);
  }
}

export const DEMO_TABLE_SECRET = DEMO_SECRET;
