import { Money, type MoneyError, type Result, err, ok } from '@itadaki/shared/domain';
import { type PaymentMethod } from '@itadaki/ordering/domain';
import { type MedioDeCobro } from './medio-de-cobro';

/**
 * El descuento que el local hace por pagar en efectivo.
 *
 * Es una práctica común acá: el restaurante se ahorra la comisión de la
 * tarjeta y comparte parte de eso con quien paga en efectivo. Hasta ahora eso
 * se arreglaba de palabra en la mesa, así que el comensal se enteraba —o no—
 * cuando ya había decidido cómo pagar.
 *
 * Cero significa que el local no lo ofrece, que es lo que pasa por defecto:
 * esto no aparece hasta que alguien lo configura.
 */
export interface DescuentoEnEfectivo {
  /** Del 0 al 1. 0.1 es diez por ciento. */
  readonly porcentaje: number;
}

export type DescuentoError = { readonly kind: 'PORCENTAJE_INVALIDO'; readonly recibido: number };

/** Más que esto no es un descuento, es un error de tipeo. */
const MAXIMO = 0.5;

/**
 * Valida lo que el dueño escribió en el panel.
 *
 * El tope no es una regla del negocio sino una red: quien quiso poner 10 y
 * puso 100 se entera acá, y no cuando la primera mesa paga casi nada.
 */
export function descuentoDe(porcentaje: number): Result<DescuentoEnEfectivo, DescuentoError> {
  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > MAXIMO) {
    return err({ kind: 'PORCENTAJE_INVALIDO', recibido: porcentaje });
  }
  return ok({ porcentaje });
}

/**
 * Si este medio de pago se lleva el descuento.
 *
 * Sólo el efectivo. `COUNTER` es pagar en la caja al salir, y ahí el local no
 * sabe todavía con qué van a pagar —puede ser tarjeta— así que prometer el
 * descuento sería prometer algo que quizás no corresponda cuando llegue el
 * momento. `UNDECIDED` es literalmente "no sabemos".
 */
export function aplicaA(metodo: MedioDeCobro | 'CARD' | PaymentMethod | null): boolean {
  return metodo === 'CASH';
}

/**
 * Cuánto se descuenta de un consumo.
 *
 * Sobre el consumo y nunca sobre el total con propina: el descuento lo pone
 * el restaurante y la propina es del mozo. Calcularlo sobre el total le
 * sacaría plata al mozo por una decisión que tomó el dueño.
 */
export function montoDelDescuento(
  descuento: DescuentoEnEfectivo,
  consumo: Money,
): Result<Money, MoneyError> {
  if (descuento.porcentaje === 0) {
    return ok(Money.zero(consumo.currency));
  }
  return consumo.multiply(descuento.porcentaje);
}

/**
 * El consumo ya con el descuento restado.
 *
 * Sobre esto se calcula después la propina, así que el mozo cobra su
 * porcentaje sobre lo que la mesa realmente paga — que es lo que ocurre hoy
 * cuando el descuento se arregla de palabra.
 */
export function consumoConDescuento(
  descuento: DescuentoEnEfectivo,
  consumo: Money,
): Result<Money, MoneyError> {
  return montoDelDescuento(descuento, consumo).flatMap((monto) => consumo.subtract(monto));
}
