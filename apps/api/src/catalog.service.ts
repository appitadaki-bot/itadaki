import { Injectable } from '@nestjs/common';
import {
  type CategoryReader,
  type CategoryWriter,
  type ProductReader,
  type ProductWriter,
} from '@itadaki/catalog/application';
import {
  InMemoryCategoryStore,
  InMemoryProductStore,
  PostgresCategoryStore,
  PostgresModifierStore,
  PostgresProductStore,
  PostgresBitacora,
} from '@itadaki/catalog/infra';
import { type ModifierGroup } from '@itadaki/catalog/domain';
import { type LinePricer } from '@itadaki/ordering/application';
import { CatalogLinePricer } from '@itadaki/ordering/infra';
import { database } from './database';

/**
 * Composition point for the catalog. `USE_POSTGRES` decides which adapter
 * backs the ports; nothing above infra changes either way.
 */
@Injectable()
export class CatalogService {
  private readonly usePostgres = process.env['USE_POSTGRES'] !== 'false';

  /**
   * La bitácora de la carta.
   *
   * Sin Postgres no se registra nada: una instalación local no necesita
   * auditoría y no puede quedarse sin panel por no tenerla.
   */
  readonly bitacora = this.usePostgres ? new PostgresBitacora(database) : null;

  readonly products: ProductReader & ProductWriter = this.usePostgres
    ? new PostgresProductStore(database)
    : new InMemoryProductStore();

  private readonly categoryStore = this.usePostgres
    ? new PostgresCategoryStore(database)
    : new InMemoryCategoryStore();

  readonly categories: CategoryReader = this.categoryStore;
  readonly categoryWriter: CategoryWriter = this.categoryStore;

  /**
   * Los grupos de opciones del restaurante.
   *
   * La tabla existe y el comensal sabe mostrarlos, pero el panel todavía no
   * tiene pantalla para cargarlos: hoy nadie escribe ahí. En memoria devuelve
   * vacío en vez del fixture, porque un "Punto de cocción" de ejemplo le pedía
   * al comensal una elección obligatoria que el dueño no podía cambiar.
   */
  readonly modifiers = this.usePostgres ? new PostgresModifierStore(database) : null;

  async modifierGroups(tenantId: string): Promise<readonly ModifierGroup[]> {
    if (this.modifiers === null) return [];
    const found = await this.modifiers.listForTenant(tenantId);
    return found.isOk() ? found.value : [];
  }

  readonly pricer: LinePricer = new CatalogLinePricer(this.products, (tenantId) =>
    this.modifierGroups(tenantId),
  );
}
