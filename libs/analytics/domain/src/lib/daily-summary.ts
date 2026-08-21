/**
 * El resumen de un día de ventas.
 *
 * Las métricas se calculan recorriendo los pedidos, así que borrarlos borra
 * los números. Y no borrarlos deja la base creciendo para siempre con
 * comandas de hace un año que nadie va a volver a abrir.
 *
 * La salida es guardar el resumen antes de borrar: una fila por día en vez de
 * cientos de pedidos con sus renglones. Lo que se pierde es el detalle —qué
 * pidió la mesa 4 el 12 de marzo— y eso es justamente lo que ya no le sirve a
 * nadie y sí es un dato que conviene no conservar.
 */
import { type Money } from '@itadaki/shared/domain';
import { type CompletedOrder } from './metrics';

export interface DailySummary {
  /** El día que resume, a medianoche. */
  readonly day: Date;
  readonly orders: number;
  readonly cancelled: number;
  /** Suma de lo vendido, sin los cancelados. */
  readonly revenueMinor: number;
  readonly currency: string;
  /** Mediana de preparación, o null si ningún pedido llegó a entregarse. */
  readonly medianPrepMinutes: number | null;
  /** Cuántos pedidos entraron en cada hora, 24 posiciones. */
  readonly ordersByHour: readonly number[];
  /** Lo más vendido del día, con su cantidad. */
  readonly topProducts: readonly { productId: string; name: string; quantity: number }[];
}

/** Cuántos productos del ranking se guardan por día. */
const TOP_PRODUCTS = 10;

/**
 * Resume un día.
 *
 * Recibe los pedidos ya filtrados por fecha: quién decide el corte es el
 * llamador, porque el huso horario del restaurante no lo sabe el dominio.
 */
export function summariseDay(
  day: Date,
  orders: readonly CompletedOrder[],
  cancelledIds: ReadonlySet<string>,
  currency: string,
): DailySummary {
  const vendidos = orders.filter((order) => !cancelledIds.has(order.orderId));

  let revenueMinor = 0;
  const porProducto = new Map<string, { name: string; quantity: number }>();
  const porHora = Array.from({ length: 24 }, () => 0);
  const preparaciones: number[] = [];

  for (const order of vendidos) {
    porHora[order.placedAt.getHours()] = (porHora[order.placedAt.getHours()] ?? 0) + 1;

    if (order.deliveredAt !== null) {
      const minutos = (order.deliveredAt.getTime() - order.placedAt.getTime()) / 60_000;
      if (minutos >= 0) preparaciones.push(minutos);
    }

    for (const item of order.items) {
      revenueMinor += item.lineTotal.amountInMinorUnits;

      const actual = porProducto.get(item.productId);
      if (actual === undefined) {
        porProducto.set(item.productId, { name: item.name, quantity: item.quantity });
      } else {
        actual.quantity += item.quantity;
      }
    }
  }

  return {
    day,
    orders: vendidos.length,
    cancelled: orders.length - vendidos.length,
    revenueMinor,
    currency,
    medianPrepMinutes: mediana(preparaciones),
    ordersByHour: porHora,
    topProducts: [...porProducto.entries()]
      .map(([productId, datos]) => ({ productId, ...datos }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, TOP_PRODUCTS),
  };
}

/**
 * La mediana, no el promedio.
 *
 * Una comanda que quedó abierta toda la noche porque nadie la marcó entregada
 * arrastra el promedio a cuarenta minutos y hace ver una cocina lenta que no
 * lo es. La mediana la ignora.
 */
function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;

  const ordenados = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);

  const valor =
    ordenados.length % 2 === 0
      ? ((ordenados[medio - 1] ?? 0) + (ordenados[medio] ?? 0)) / 2
      : (ordenados[medio] ?? 0);

  return Math.round(valor);
}

/** Junta varios días para responder una consulta de rango. */
export function mergeSummaries(dias: readonly DailySummary[]): Omit<DailySummary, 'day'> | null {
  if (dias.length === 0) return null;

  const porHora = Array.from({ length: 24 }, () => 0);
  const porProducto = new Map<string, { name: string; quantity: number }>();
  const medianas: number[] = [];

  let orders = 0;
  let cancelled = 0;
  let revenueMinor = 0;

  for (const dia of dias) {
    orders += dia.orders;
    cancelled += dia.cancelled;
    revenueMinor += dia.revenueMinor;

    for (const [hora, cuantos] of dia.ordersByHour.entries()) {
      porHora[hora] = (porHora[hora] ?? 0) + cuantos;
    }

    // La mediana de medianas no es la mediana real, pero es lo que queda una
    // vez borrados los pedidos: guardar cada tiempo sería guardar el detalle.
    if (dia.medianPrepMinutes !== null) medianas.push(dia.medianPrepMinutes);

    for (const producto of dia.topProducts) {
      const actual = porProducto.get(producto.productId);
      if (actual === undefined) {
        porProducto.set(producto.productId, { name: producto.name, quantity: producto.quantity });
      } else {
        actual.quantity += producto.quantity;
      }
    }
  }

  return {
    orders,
    cancelled,
    revenueMinor,
    currency: dias[0]?.currency ?? 'ARS',
    medianPrepMinutes: mediana(medianas),
    ordersByHour: porHora,
    topProducts: [...porProducto.entries()]
      .map(([productId, datos]) => ({ productId, ...datos }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, TOP_PRODUCTS),
  };
}

export type { Money };
