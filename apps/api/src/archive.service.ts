import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { summariseDay } from '@itadaki/analytics/domain';
import { type CompletedOrder } from '@itadaki/analytics/domain';
import { Money } from '@itadaki/shared/domain';
import { lineTotal } from '@itadaki/ordering/domain';
import {
  PostgresOrderStore,
  PostgresSessionStore,
  PostgresSummaryStore,
} from '@itadaki/ordering/infra';
import { database } from './database';
import { log } from './logger';

/**
 * Cuántos días de pedidos se conservan enteros.
 *
 * Sesenta: cubre dos ciclos de facturación, así que un cobro que se discute
 * el mes siguiente todavía tiene su comanda. Pasado ese plazo lo que se
 * consulta son los números, no qué pidió la mesa 4 un martes.
 *
 * A esta altura el pedido ya no tiene ningún dato personal —el apodo se borra
 * a los 30 días— así que lo que queda es el registro comercial del
 * restaurante. Acortarlo más no reduce riesgo, le saca una herramienta.
 */
const KEEP_ORDERS_DAYS = Number(process.env['KEEP_ORDERS_DAYS'] ?? 60);

/** Cada cuánto corre. Una vez por día alcanza: no es una tarea urgente. */
const EVERY_MS = 24 * 60 * 60_000;

/**
 * Resume los días viejos y borra sus pedidos.
 *
 * Las métricas se calculan recorriendo los pedidos, así que borrarlos borra
 * los números; y no borrarlos deja la base creciendo para siempre. Un
 * restaurante de 40 mesas hace unos 200 pedidos por día: 70.000 al año, cada
 * uno con sus renglones.
 *
 * Guardar el resumen antes de borrar deja una fila por día. Lo que se pierde
 * es el detalle —qué pidió la mesa 4 el 12 de marzo— que es justamente lo que
 * ya no le sirve a nadie y sí conviene no conservar.
 */
@Injectable()
export class ArchiveService implements OnModuleInit, OnModuleDestroy {
  private readonly orders = new PostgresOrderStore(database);
  // El recorrido de restaurantes y el borrado viven con las sesiones: las dos
  // operaciones cruzan tenants y tocan table_sessions.
  private readonly sessions = new PostgresSessionStore(database);
  private readonly summaries = new PostgresSummaryStore(database);
  private timer: ReturnType<typeof setInterval> | null = null;

  onModuleInit(): void {
    void this.run();
    this.timer = setInterval(() => void this.run(), EVERY_MS);
    // Nunca mantener vivo el proceso sólo por esto.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Un día por vez, del más viejo al más nuevo.
   *
   * Resumir y borrar van juntos y en ese orden: el borrado exige que el
   * resumen exista, así que un fallo a mitad deja el día sin borrar y se
   * reintenta mañana, en vez de dejarlo sin pedidos y sin números.
   */
  private async run(): Promise<void> {
    const corte = new Date();
    corte.setDate(corte.getDate() - KEEP_ORDERS_DAYS);
    corte.setHours(0, 0, 0, 0);

    const tenants = await this.sessions.activeTenants();
    if (tenants.isErr()) return;

    for (const tenantId of tenants.value) {
      await this.archiveTenant(tenantId, corte);
    }
  }

  private async archiveTenant(tenantId: string, corte: Date): Promise<void> {
    const viejos = await this.orders.listPlacedBetween(tenantId, new Date(0), corte);
    if (viejos.isErr() || viejos.value.length === 0) return;

    // Agrupa por día: el resumen es por jornada, no por pedido.
    const porDia = new Map<string, typeof viejos.value>();
    for (const order of viejos.value) {
      // El momento del pedido sale de su historial: el Order no expone la
      // fecha de la fila, y el SENT es cuando de verdad salió a la cocina.
      const cuando = order.history.find((e) => e.status === 'SENT')?.at ?? new Date();
      const dia = new Date(cuando);
      dia.setHours(0, 0, 0, 0);
      const clave = dia.toISOString().slice(0, 10);
      porDia.set(clave, [...(porDia.get(clave) ?? []), order]);
    }

    let resumidos = 0;

    for (const [clave, delDia] of [...porDia.entries()].sort()) {
      const dia = new Date(`${clave}T00:00:00`);
      const cancelados = new Set(
        delDia.filter((o) => o.status === 'CANCELLED').map((o) => o.id),
      );

      const completos: CompletedOrder[] = delDia.map((order) => ({
        orderId: order.id,
        sessionId: order.sessionId,
        placedAt: order.history.find((e) => e.status === 'SENT')?.at ?? new Date(),
        deliveredAt: order.history.find((e) => e.status === 'DELIVERED')?.at ?? null,
        items: order.items.map((item) => {
          const total = lineTotal({ ...item, id: item.id, dinerId: item.dinerId });
          return {
            productId: item.product.productId,
            name: item.product.name,
            quantity: item.quantity,
            lineTotal: total.isOk() ? total.value : Money.zero(order.currency),
          };
        }),
      }));

      const guardado = await this.summaries.save(
        tenantId,
        summariseDay(dia, completos, cancelados, delDia[0]?.currency ?? 'ARS'),
      );

      // Si el resumen no se guardó, no se borra nada de ese día: mañana se
      // vuelve a intentar con los pedidos todavía ahí.
      if (guardado.isErr()) {
        log.warn('no se pudo resumir un día, sus pedidos quedan', { tenantId, dia: clave });
        return;
      }
      resumidos += 1;
    }

    const borrados = await this.sessions.purgeSummarised(tenantId, corte);

    if (borrados.isOk() && borrados.value > 0) {
      log.info('pedidos archivados', {
        tenantId,
        dias: resumidos,
        pedidos: borrados.value,
      });
    }
  }
}
