import { Controller, Get, Query } from '@nestjs/common';
import {
  empiezaElDia,
  medianPrepMinutes,
  ordersByHour,
  mergeSummaries,
  rankProducts,
  zonaValida,
  type CompletedOrder,
} from '@itadaki/analytics/domain';
import { lineTotal } from '@itadaki/ordering/domain';
import { Money } from '@itadaki/shared/domain';
import { RequirePermission, TenantId } from './auth';
import { BillsService } from './bills.service';
import { TenantsService } from './tenants.service';
import { PostgresSummaryStore } from '@itadaki/ordering/infra';
import { database } from './database';
import { OrdersService } from './orders.service';
import { toMoneyDto } from './contracts';
import { MAX_ORDERS_IN_WINDOW } from '@itadaki/ordering/infra';
import { log } from './logger';

@Controller('metrics')
export class MetricsController {
  private readonly summaries = new PostgresSummaryStore(database);

  constructor(
    private readonly orders: OrdersService,
    private readonly bills: BillsService,
    private readonly tenants: TenantsService,
  ) {}

  /**
   * La zona del restaurante, con un respaldo razonable.
   *
   * Casi todos los locales están en Argentina, así que ése es el respaldo: una
   * métrica con el huso equivocado por unas horas es mejor que una pantalla
   * que no carga porque falta un dato de configuración.
   */
  private async zonaDelLocal(tenantId: string): Promise<string> {
    const encontrada = await this.tenants.store.zonaDe(tenantId);
    const zona = encontrada.isOk() ? encontrada.value : null;

    return zona !== null && zonaValida(zona) ? zona : 'America/Argentina/Buenos_Aires';
  }

  /** Lo que suma un pedido, en unidades menores. */
  private totalDe(order: CompletedOrder): number {
    return order.items.reduce((suma, item) => suma + item.lineTotal.amountInMinorUnits, 0);
  }

  /**
   * Sales figures for a window, defaulting to the last 30 days.
   *
   * Reads placed orders rather than the active board: a delivered order is the
   * sale, and the board drops it the moment the plate goes out — reporting on
   * that alone showed a restaurant zero revenue at the end of every service.
   */
  @RequirePermission('metrics:read')
  @Get()
  async summary(
    @TenantId() tenantId: string,
    @Query('days') days?: string,
  ) {
    const to = new Date();

    /*
     * "Hoy" no son las últimas veinticuatro horas.
     *
     * Un mozo que mira las métricas un martes a las nueve de la noche quiere
     * ver el servicio de hoy; las últimas veinticuatro le meterían adentro la
     * noche del lunes, que fue otro turno con otra caja.
     *
     * Y el día es el del local, no el del servidor: la API corre en Oregon y
     * el restaurante está en San Juan. Sin la zona, el almuerzo aparecería en
     * el día equivocado.
     */
    const esHoy = days === 'hoy';

    const window = esHoy ? 1 : Math.min(Math.max(Number(days ?? 30) || 30, 1), 365);
    const from = esHoy
      ? empiezaElDia(to, await this.zonaDelLocal(tenantId))
      : new Date(to.getTime() - window * 86_400_000);

    const placed = await this.orders.store.listPlacedBetween(tenantId, from, to);
    const orders = placed.isOk() ? placed.value : [];

    // Un informe de ventas recortado muestra una caída que no existió, y nadie
    // sospecha del informe. Los pedidos crudos se archivan a los sesenta días,
    // así que llegar a veinte mil dentro de la ventana es un local enorme o
    // algo escribiendo de más.
    if (orders.length >= MAX_ORDERS_IN_WINDOW) {
      log.error('las métricas se calcularon sobre una lista recortada', {
        tenantId,
        dias: window,
        tope: MAX_ORDERS_IN_WINDOW,
      });
    }

    /*
     * Los días viejos ya no tienen pedidos: se resumieron y se borraron.
     * Sin sumar esos resúmenes, pedir "los últimos 90 días" devolvería sólo
     * los últimos 60 y el panel mostraría una caída de ventas que no existió.
     */
    const archivados = await this.summaries.between(tenantId, from, to);
    const resumidos = archivados.isOk() ? mergeSummaries(archivados.value) : null;

    const completed: CompletedOrder[] = orders.map((order) => ({
      orderId: order.id,
      sessionId: order.sessionId,
      placedAt: order.history.find((entry) => entry.status === 'SENT')?.at ?? new Date(),
      deliveredAt: order.history.find((entry) => entry.status === 'DELIVERED')?.at ?? null,
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

    // Cancelled orders are not sales; they would drag the average ticket down
    // and inflate the count.
    const sales = completed.filter((_, index) => orders[index]?.status !== 'CANCELLED');
    const soldRanking = rankProducts(sales, 'ARS');

    /*
     * Lo vivo más lo archivado.
     *
     * Los pedidos de los últimos sesenta días se recorren enteros; los
     * anteriores llegan como un resumen por día. Un panel que mirara sólo lo
     * vivo mostraría una caída de ventas el día que corre el archivado.
     */
    const horasVivas = ordersByHour(sales);
    const horas = horasVivas.map(
      (cuantos, hora) => cuantos + (resumidos?.ordersByHour[hora] ?? 0),
    );

    const pedidos = sales.length + (resumidos?.orders ?? 0);
    const facturado =
      sales.reduce((suma, venta) => suma + this.totalDe(venta), 0) + (resumidos?.revenueMinor ?? 0);

    // El ticket se recalcula sobre el total: promediar dos promedios da otro
    // número, y uno que no cierra con las ventas que se muestran al lado.
    const ticket = pedidos === 0 ? null : Money.of(Math.round(facturado / pedidos), 'ARS');

    /*
     * Cómo se cobró, según el mozo.
     *
     * Va aparte del resto porque mide otra cosa: los pedidos cuentan lo que
     * salió de la cocina, y esto lo que entró en la caja. Un fallo al leerlo
     * deja la lista vacía en vez de tumbar la pantalla entera — el resto de
     * las métricas sirve igual.
     */
    const cobros = await this.bills.store.cobrosPorMedio(tenantId, from);

    return {
      windowDays: window,
      // Para que la pantalla sepa qué está mostrando sin adivinarlo por el
      // número de días: "hoy" y "1 día" no son lo mismo.
      periodo: esHoy ? 'hoy' : `${window}d`,
      orders: pedidos,
      cobros: cobros.isOk()
        ? cobros.value.map((fila) => ({
            medio: fila.medio,
            cuentas: fila.cuentas,
            cobrado: toMoneyDto(
              Money.of(fila.cobradoMinor, 'ARS').unwrapOr(Money.zero('ARS')),
            ),
            descuento: toMoneyDto(
              Money.of(fila.descuentoMinor, 'ARS').unwrapOr(Money.zero('ARS')),
            ),
          }))
        : [],
      averageTicket: ticket !== null && ticket.isOk() ? toMoneyDto(ticket.value) : null,
      medianPrepMinutes: medianPrepMinutes(sales) ?? resumidos?.medianPrepMinutes ?? null,
      ordersByHour: horas,
      cancelled: completed.length - sales.length + (resumidos?.cancelled ?? 0),
      topProducts: soldRanking.slice(0, 5).map((entry) => ({
        productId: entry.productId,
        name: entry.name,
        unitsSold: entry.unitsSold,
        revenue: toMoneyDto(entry.revenue),
      })),
      bottomProducts: soldRanking.slice(-3).reverse().map((entry) => ({
        productId: entry.productId,
        name: entry.name,
        unitsSold: entry.unitsSold,
        revenue: toMoneyDto(entry.revenue),
      })),
    };
  }
}
