import { CATEGORIES, PRODUCTS } from './menu-fixture';

/** Lo poco que hace falta de un cliente de Postgres, para no atarse a uno. */
export interface ClienteSql {
  query(texto: string, valores?: readonly unknown[]): Promise<unknown>;
}

/**
 * Deja la carta de ejemplo adentro de un restaurante.
 *
 * La usan dos: `npm run db:seed`, que arma el restaurante demo de siempre, y
 * el alta de un restaurante de prueba desde la landing, que necesita que el
 * visitante encuentre platos y no una carta vacía —una carta vacía no
 * demuestra nada—.
 *
 * El `tenantId` va por parámetro y no sale del fixture: son los mismos platos
 * en otro restaurante, y cada copia es independiente. Tocar un precio en una
 * prueba no toca la de nadie.
 *
 * Reemplaza en vez de agregar: la carta de ejemplo es toda la carta, y
 * dejarla a medias entre dos versiones del fixture confunde más que ayudar.
 * Sólo toca las tablas de catálogo; pedidos y mesas quedan como están.
 */
export async function sembrarCarta(client: ClienteSql, tenantId: string): Promise<void> {
  // Los grupos de opciones se borran pero no se vuelven a sembrar. El panel no
  // tiene pantalla para cargarlos, así que un "Punto de cocción" de ejemplo
  // le aparecía al comensal como una elección obligatoria que el dueño no
  // podía ni cambiar ni sacar. Sembrarlos de nuevo acá los devuelve.
  await client.query('DELETE FROM modifier_groups WHERE tenant_id = $1', [tenantId]);
  await client.query('DELETE FROM products WHERE tenant_id = $1', [tenantId]);
  await client.query('DELETE FROM categories WHERE tenant_id = $1', [tenantId]);

  for (const category of CATEGORIES) {
    await client.query(
      `INSERT INTO categories (tenant_id, id, name, sort_order, window_start, window_end)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (tenant_id, id) DO UPDATE SET
         name = EXCLUDED.name,
         sort_order = EXCLUDED.sort_order`,
      [
        tenantId,
        category.id,
        category.name,
        category.sortOrder,
        category.availability?.startMinute ?? null,
        category.availability?.endMinute ?? null,
      ],
    );
  }

  for (const product of PRODUCTS) {
    await client.query(
      `INSERT INTO products (tenant_id, id, category_id, name, description, price_minor,
                             currency, allergens, diets, prep_minutes, available)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (tenant_id, id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         price_minor = EXCLUDED.price_minor,
         available = EXCLUDED.available`,
      [
        tenantId,
        product.id,
        product.categoryId,
        product.name,
        product.description,
        product.price.amountInMinorUnits,
        product.price.currency,
        product.allergens,
        product.diets,
        product.estimatedPrepMinutes,
        product.available,
      ],
    );
  }
}
