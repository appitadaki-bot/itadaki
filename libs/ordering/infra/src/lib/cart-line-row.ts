import { type CartLine } from '@itadaki/ordering/domain';
import { Money, type CurrencyCode } from '@itadaki/shared/domain';

/**
 * Cómo viaja una línea del carrito entre el dominio y la fila de la base.
 *
 * Vive en su propio archivo porque las dos direcciones tienen que decir lo
 * mismo, y cuando estaban sueltas dentro del store no lo decían: la marca de
 * "traer primero" se agregó a la línea y quedó afuera de las dos, así que se
 * encendía en pantalla y volvía sola. El campo nuevo que se olvide de un lado
 * ahora falla en un test en vez de en la mesa de un restaurante.
 */

export interface MoneyJson {
  amountInMinorUnits: number;
  currency: string;
}

export interface CartLineRow {
  id: string;
  dinerId: string;
  quantity: number;
  notes: string;
  /** Ausente en las líneas guardadas antes de que la marca existiera. */
  primero?: boolean;
  product: { productId: string; name: string; unitPrice: MoneyJson; capturedAt: string };
  modifiers: Array<{ modifierId: string; name: string; priceDelta: MoneyJson }>;
}

export const toMoney = (json: MoneyJson): Money =>
  Money.of(json.amountInMinorUnits, json.currency as CurrencyCode).unwrapOr(Money.zero('ARS'));

export const fromMoney = (money: Money): MoneyJson => ({
  amountInMinorUnits: money.amountInMinorUnits,
  currency: money.currency,
});

export function cartLineToRow(line: CartLine): CartLineRow {
  return {
    id: line.id,
    dinerId: line.dinerId,
    quantity: line.quantity,
    notes: line.notes,
    ...(line.primero === undefined ? {} : { primero: line.primero }),
    product: {
      productId: line.product.productId,
      name: line.product.name,
      unitPrice: fromMoney(line.product.unitPrice),
      capturedAt: line.product.capturedAt.toISOString(),
    },
    modifiers: line.modifiers.map((modifier) => ({
      modifierId: modifier.modifierId,
      name: modifier.name,
      priceDelta: fromMoney(modifier.priceDelta),
    })),
  };
}

export function cartLineFromRow(row: CartLineRow): CartLine {
  return {
    id: row.id,
    dinerId: row.dinerId,
    quantity: row.quantity,
    notes: row.notes,
    ...(row.primero === undefined ? {} : { primero: row.primero }),
    product: {
      productId: row.product.productId,
      name: row.product.name,
      unitPrice: toMoney(row.product.unitPrice),
      capturedAt: new Date(row.product.capturedAt),
    },
    modifiers: row.modifiers.map((modifier) => ({
      modifierId: modifier.modifierId,
      name: modifier.name,
      priceDelta: toMoney(modifier.priceDelta),
    })),
  };
}
