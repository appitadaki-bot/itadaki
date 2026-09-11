import { type DescuentoEnEfectivo, descuentoDe } from '@itadaki/billing/domain';
import { type Result } from '@itadaki/shared/domain';

/** Lo que hace falta de la tienda de restaurantes para leer el descuento. */
interface ConDescuento {
  descuentoEnEfectivo(tenantId: string): Promise<Result<number, unknown>>;
}

/**
 * El descuento por pagar en efectivo que ofrece este local.
 *
 * Lo leen la cuenta del comensal, el salón y el cobro, y los tres tienen que
 * decir el mismo número: si el salón mostrara uno y el cobro guardara otro,
 * la caja no cerraría.
 *
 * Cualquier problema al leerlo deja el descuento en cero: un fallo no puede
 * inventar una rebaja que el local no ofrece.
 */
export async function descuentoDelLocal(
  tenants: ConDescuento,
  tenantId: string,
): Promise<DescuentoEnEfectivo> {
  const puntos = await tenants.descuentoEnEfectivo(tenantId);
  const configurado = descuentoDe((puntos.isOk() ? puntos.value : 0) / 100);
  return configurado.isOk() ? configurado.value : { porcentaje: 0 };
}
