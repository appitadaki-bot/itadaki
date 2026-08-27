import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { advanceOrder, clearSubmittedLines, submitOrder } from '@itadaki/ordering/application';
import {
  type DinerScope,
  Public,
  RequirePermission,
  Scope,
  TableScoped,
  TakesOrders,
  TenantId,
} from './auth';
import { RateLimit } from './rate-limit.guard';
import { CatalogService } from './catalog.service';
import { OrdersService } from './orders.service';
import { SessionsService } from './sessions.service';
import { RealtimeGateway } from './realtime.gateway';
import { advanceOrderSchema, submitOrderSchema, toOrderDto } from './contracts';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly catalog: CatalogService,
    private readonly sessions: SessionsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Kitchen board feed: everything still in play.
   *
   * La categoría se resuelve del catálogo y no del pedido guardado: mover un
   * plato de sección tiene que verse también en las comandas en curso.
   *
   * Es la categoría de la carta —entradas, parrilla, postres— y no una
   * clasificación aparte para la cocina. Había una, `station`, que nadie
   * cargaba: el importador la ponía en "frío" para todos y el tablero mostraba
   * FRÍO en el café y en la empanada. La sección ya la escribe el restaurante
   * para su carta, así que dice lo mismo sin pedir trabajo extra.
   */
  @RequirePermission('orders:read')
  @Get()
  async listActive(@TenantId() tenantId: string) {
    const result = await this.orders.store.listActive(tenantId);

    if (result.isErr()) {
      throw new HttpException('orders unavailable', HttpStatus.BAD_GATEWAY);
    }

    const catalog = await this.catalog.products.list(tenantId, {});
    const categorias = await this.catalog.categories.list(tenantId);
    const nombrePorId = new Map(
      categorias.isOk() ? categorias.value.map((categoria) => [categoria.id, categoria.name]) : [],
    );

    // Del plato a su sección, ya con el nombre que la cocina va a leer.
    const seccionPorPlato = new Map(
      catalog.isOk()
        ? catalog.value.map((product) => [product.id, nombrePorId.get(product.categoryId) ?? null])
        : [],
    );

    // The board is read by table, not by session: a cook needs "7", not a UUID.
    // Looked up per distinct session so a busy service does one query a table.
    const sessionIds = [...new Set(result.value.map((order) => order.sessionId))];
    const tables = new Map<string, string>();
    await Promise.all(
      sessionIds.map(async (sessionId) => {
        const found = await this.sessions.store.findById(tenantId, sessionId);
        if (found.isOk()) tables.set(sessionId, found.value.session.tableId);
      }),
    );

    return result.value.map((order) => {
      const dto = toOrderDto(order);
      return {
        ...dto,
        tableId: tables.get(order.sessionId) ?? null,
        items: dto.items.map((item, index) => ({
          ...item,
          // Nulo si el plato salió de la carta: la comanda vieja sigue
          // siendo válida, y la cocina la muestra sin chip.
          category: seccionPorPlato.get(order.items[index]?.product.productId ?? '') ?? null,
        })),
      };
    });
  }

  /**
   * Accepts a cart and returns the created order. An `Idempotency-Key` header
   * overrides the body's clientRequestId, so a retried POST is a no-op.
   */
  @Public()
  @RateLimit('diner')
  @TableScoped()
  @TakesOrders()
  @Post()
  async submit(
    @Body() body: unknown,
    @Scope() scope: DinerScope,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = submitOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error.issues, HttpStatus.BAD_REQUEST);
    }

    // Sending an order costs the table money, so the session has to be the one
    // the scanned QR opened — the guard proved the token, not which table it is.
    const tenantId = scope.tenantId;
    const session = await this.sessions.store.findById(tenantId, parsed.data.sessionId);
    if (session.isErr()) {
      throw new HttpException(session.error, HttpStatus.NOT_FOUND);
    }
    if (scope.tableId !== null && session.value.session.tableId !== scope.tableId) {
      throw new HttpException({ kind: 'WRONG_TABLE' }, HttpStatus.FORBIDDEN);
    }

    // Alguien más de la mesa pudo cerrar la cuenta mientras esta persona
    // seguía eligiendo. Su teléfono no se enteró, y sin este control el plato
    // entraría a la cocina para una cuenta ya pagada — comida que sale y que
    // nadie va a cobrar.
    if (session.value.session.status === 'CLOSED') {
      throw new HttpException({ kind: 'SESSION_CLOSED' }, HttpStatus.CONFLICT);
    }

    const run = submitOrder({
      orders: this.orders.store,
      pricer: this.catalog.pricer,
      events: this.realtime,
      newId: () => crypto.randomUUID(),
      now: () => new Date(),
    });

    const result = await run({
      tenantId,
      sessionId: parsed.data.sessionId,
      dinerId: parsed.data.dinerId,
      clientRequestId: idempotencyKey ?? parsed.data.clientRequestId,
      currency: 'ARS',
      lines: parsed.data.lines,
    });

    if (result.isErr()) {
      const status =
        result.error.kind === 'PRODUCT_UNAVAILABLE' ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST;
      throw new HttpException(result.error, status);
    }

    // La comanda ya está en la cocina: si el vaciado falla, el pedido vale
    // igual. Lo que no puede pasar es lo que pasaba antes — que el carrito
    // quede lleno y la mesa mande todo una segunda vez.
    if (parsed.data.lineIds.length > 0) {
      const clear = clearSubmittedLines({ sessions: this.sessions.store, events: this.realtime });
      await clear({
        tenantId,
        sessionId: parsed.data.sessionId,
        lineIds: parsed.data.lineIds,
      });
    }

    return toOrderDto(result.value);
  }

  @RequirePermission('orders:advance')
  @Patch(':id/status')
  async advance(
    @Param('id') orderId: string,
    @Body() body: unknown,
    @TenantId() tenantId: string,
  ) {
    const parsed = advanceOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error.issues, HttpStatus.BAD_REQUEST);
    }

        const run = advanceOrder({
      orders: this.orders.store,
      events: this.realtime,
      now: () => new Date(),
    });

    const result = await run({
      tenantId,
      orderId,
      next: parsed.data.next,
      actorId: parsed.data.actorId,
      itemId: parsed.data.itemId,
    });

    if (result.isErr()) {
      const status =
        result.error.kind === 'NOT_FOUND' ? HttpStatus.NOT_FOUND : HttpStatus.CONFLICT;
      throw new HttpException(result.error, status);
    }

    return toOrderDto(result.value);
  }
}
