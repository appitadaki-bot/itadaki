import { Body, Controller, Get, HttpException, HttpStatus, Patch } from '@nestjs/common';
import { medianPrepMinutes, type CompletedOrder } from '@itadaki/analytics/domain';
import { descuentoDe } from '@itadaki/billing/domain';
import { linkDeResena } from '@itadaki/identity/domain';
import { z } from 'zod';
import { Public, RequirePermission, Scope, TenantId, type DinerScope, TableScoped } from './auth';
import { OrdersService } from './orders.service';
import { TenantsService } from './tenants.service';

/**
 * Cuántos días de historial se miran para decir cuánto tarda la cocina.
 *
 * Dos semanas: suficiente para que una noche mala no mueva el número, y
 * corto para que una cocina que sumó gente lo refleje pronto.
 */
const DIAS_DE_HISTORIAL = 14;

const descuentoSchema = z.object({
  /** En puntos porcentuales enteros: el dueño escribe "10", no "0.1". */
  puntos: z.number().int().min(0).max(50),
});

/**
 * Lo que el restaurante configura sobre sí mismo.
 *
 * Hoy sólo el descuento por pagar en efectivo. Vive aparte de la carta y del
 * personal porque no es ninguna de las dos cosas: es cómo cobra el local.
 */
@Controller('ajustes')
export class AjustesController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly orders: OrdersService,
  ) {}

  /**
   * Lo que el panel muestra en el formulario.
   *
   * Pide `menu:write` y no `menu:read`: esto lo configura quien decide los
   * precios, y un mozo no tiene por qué ver —ni tocar— con cuánto margen
   * trabaja el local.
   */
  @RequirePermission('menu:write')
  @Get()
  async ver(@TenantId() tenantId: string) {
    const puntos = await this.tenants.store.descuentoEnEfectivo(tenantId);
    if (puntos.isErr()) {
      throw new HttpException(puntos.error, HttpStatus.BAD_GATEWAY);
    }
    const resenas = await this.tenants.store.resenas(tenantId);

    return {
      descuentoEfectivo: puntos.value,
      resenaUrl: resenas.isOk() ? resenas.value.url : null,
      // Cuántas veces se ofreció y cuántas se tocó: es lo único que podemos
      // medir sin permiso de Google sobre la ficha, y responde la pregunta
      // que importa — si el botón sirve o lo ignoran.
      resenaOfrecidas: resenas.isOk() ? resenas.value.asks : 0,
      resenaTocadas: resenas.isOk() ? resenas.value.taps : 0,
    };
  }

  @RequirePermission('menu:write')
  @Patch('resenas')
  async guardarResenas(@Body() body: unknown, @TenantId() tenantId: string) {
    const parsed = z.object({ url: z.string().max(500) }).safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error.issues, HttpStatus.BAD_REQUEST);
    }

    // Vacío es dejar de pedirlas, que es distinto de un link mal escrito.
    if (parsed.data.url.trim() === '') {
      const borrado = await this.tenants.store.guardarResenas(tenantId, null);
      if (borrado.isErr()) {
        throw new HttpException(borrado.error, HttpStatus.BAD_GATEWAY);
      }
      return { resenaUrl: null };
    }

    const valido = linkDeResena(parsed.data.url);
    if (valido.isErr()) {
      throw new HttpException(valido.error, HttpStatus.BAD_REQUEST);
    }

    const guardado = await this.tenants.store.guardarResenas(tenantId, valido.value);
    if (guardado.isErr()) {
      throw new HttpException(guardado.error, HttpStatus.BAD_GATEWAY);
    }
    return { resenaUrl: valido.value };
  }

  /**
   * Cuenta que alguien tocó el botón de reseñar.
   *
   * Lo llama el teléfono del comensal, así que no puede pedir sesión. Es un
   * contador y nada más: lo peor que puede hacer alguien que lo llame de más
   * es inflar su propia estadística.
   */
  /**
   * Cuenta que la mesa vio el pedido de reseña.
   *
   * Lo llama la pantalla al mostrarlo, y no el servidor al cerrar la mesa,
   * porque lo que interesa medir es cuántas personas lo vieron: una mesa de
   * cuatro con el pedido en cuatro teléfonos son cuatro oportunidades, no
   * una. El porcentaje de tocadas sobre eso es lo que dice si sirve.
   */
  @Public()
  @TableScoped()
  @Patch('resenas/ofrecida')
  async resenaOfrecida(@Scope() scope: DinerScope) {
    await this.tenants.store.contarResena(scope.tenantId, 'ask');
    return { ok: true };
  }

  @Public()
  @TableScoped()
  @Patch('resenas/tocada')
  async resenaTocada(@Scope() scope: DinerScope) {
    await this.tenants.store.contarResena(scope.tenantId, 'tap');
    return { ok: true };
  }

  @RequirePermission('menu:write')
  @Patch('descuento')
  async guardarDescuento(@Body() body: unknown, @TenantId() tenantId: string) {
    const parsed = descuentoSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error.issues, HttpStatus.BAD_REQUEST);
    }

    // El dominio vuelve a validarlo: el schema cuida la forma, y esto la
    // regla. Un tope que vive en dos lados se corrige en dos lados.
    const valido = descuentoDe(parsed.data.puntos / 100);
    if (valido.isErr()) {
      throw new HttpException(valido.error, HttpStatus.BAD_REQUEST);
    }

    const guardado = await this.tenants.store.guardarDescuento(tenantId, parsed.data.puntos);
    if (guardado.isErr()) {
      throw new HttpException(guardado.error, HttpStatus.BAD_GATEWAY);
    }

    return { descuentoEfectivo: parsed.data.puntos };
  }

  /**
   * Lo que la mesa necesita saber, sin sesión de personal.
   *
   * La pantalla de la cuenta lo usa para decir "pagando en efectivo ahorrás
   * X" antes de que elijan, y la bienvenida para saludar con el nombre del
   * restaurante.
   *
   * Sólo lo que el comensal ya sabe por estar sentado ahí: cómo se llama el
   * lugar y qué descuento anuncia. Pide el token de la mesa, así que esto no
   * es un directorio de restaurantes que se pueda recorrer desde afuera.
   */
  @Public()
  @TableScoped()
  @Get('publicos')
  async publicos(@Scope() scope: DinerScope) {
    const puntos = await this.tenants.store.descuentoEnEfectivo(scope.tenantId);
    // Un fallo de lectura devuelve cero en vez de un error: la cuenta tiene
    // que poder mostrarse igual, sólo que sin anunciar el descuento.
    const resenas = await this.tenants.store.resenas(scope.tenantId);

    // Cómo se llama el local, para la pantalla de bienvenida: el comensal
    // entró a un restaurante, no a un sistema, y "Bienvenido a ITADAKI" le
    // habla de una marca que no eligió ver.
    const nombres = await this.tenants.store.nombresDe([scope.tenantId]);

    return {
      nombre: nombres.isOk() ? (nombres.value.get(scope.tenantId) ?? null) : null,
      descuentoEfectivo: puntos.isOk() ? puntos.value : 0,
      // Sin link no se ofrece nada: mejor eso que mandar a un cliente
      // conforme a una página rota.
      resenaUrl: resenas.isOk() ? resenas.value.url : null,
      // Cuánto tarda este local, para poder contestar "¿cuánto falta?".
      ...(await this.cuantoTarda(scope.tenantId)),
    };
  }

  /**
   * Cuánto tarda la cocina de este local, medido.
   *
   * Sale de lo que ya pasó y no de un número configurado: el dueño pondría el
   * que le gustaría tener, y la mesa lo leería como una promesa incumplida
   * cada noche ocupada.
   *
   * Se miran los últimos días y no toda la historia: una cocina que mejoró
   * —o que sumó gente— no tiene por qué arrastrar cómo tardaba hace meses.
   *
   * Un fallo devuelve nulos y la pantalla no dice nada, que es exactamente lo
   * que hace cuando el local todavía no tiene historial.
   */
  private async cuantoTarda(
    tenantId: string,
  ): Promise<{ habitualMinutos: number | null; pedidosMedidos: number }> {
    const desde = new Date(Date.now() - DIAS_DE_HISTORIAL * 24 * 60 * 60_000);
    const pedidos = await this.orders.store.listPlacedBetween(tenantId, desde, new Date());

    if (pedidos.isErr()) {
      return { habitualMinutos: null, pedidosMedidos: 0 };
    }

    // Sólo los que llegaron a la mesa: un pedido cancelado no midió ninguna
    // espera, y contarlo como cero acortaría el número para todos.
    const completados: CompletedOrder[] = pedidos.value
      .filter((order) => order.status !== 'CANCELLED')
      .map((order) => ({
        orderId: order.id,
        sessionId: order.sessionId,
        // Del historial, como en las métricas: el pedido no guarda la fecha
        // suelta, la deja anotada en el paso que la produjo.
        placedAt: order.history.find((entry) => entry.status === 'SENT')?.at ?? new Date(),
        deliveredAt: order.history.find((entry) => entry.status === 'DELIVERED')?.at ?? null,
        // La mediana sólo mira las fechas: cargar los platos y sus precios
        // acá sería trabajo para un número que no los usa.
        items: [],
      }));

    const medidos = completados.filter((order) => order.deliveredAt !== null).length;

    return { habitualMinutos: medianPrepMinutes(completados), pedidosMedidos: medidos };
  }
}
