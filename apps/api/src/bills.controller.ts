import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { closeBill } from '@itadaki/billing/application';
import { type SessionState, closeTable } from '@itadaki/ordering/application';
import {
  type Bill,
  type SplitStrategy,
  aplicaA,
  billSubtotal,
  descuentoDe,
  montoDelDescuento,
  MEDIOS_DE_COBRO,
  byDinerSplit,
  byItemSplit,
  customSplit,
  displayIn,
  distributeTip,
  isSettled,
  equalSplit,
  singlePayerSplit,
  tipAmount,
  totalWithTip,
  type Tip,
} from '@itadaki/billing/domain';
import { Money, type CurrencyCode, type MoneyError, ok } from '@itadaki/shared/domain';
import { z } from 'zod';
import { InMemoryTableStore, PostgresTableStore } from '@itadaki/identity/infra';
import { type DinerScope, Public, RequirePermission, Scope, TableScoped } from './auth';
import { database } from './database';
import { BillsService } from './bills.service';
import { SessionsService } from './sessions.service';
import { OrdersService } from './orders.service';
import { CallsService } from './calls.service';
import { TenantsService } from './tenants.service';
import { RealtimeGateway } from './realtime.gateway';
import { toMoneyDto } from './contracts';
import { log } from './logger';
import { MAX_SESSION_ORDERS } from '@itadaki/ordering/infra';

const splitSchema = z.object({
  kind: z.enum(['SINGLE_PAYER', 'EQUAL', 'BY_DINER', 'BY_ITEM', 'CUSTOM_AMOUNT']),
  // Cómo piensan pagar: sólo el efectivo lleva descuento.
  paymentMethod: z.enum(['CARD', 'CASH', 'COUNTER', 'UNDECIDED']).optional(),
  payerId: z.string().min(1).optional(),
  parts: z.number().int().min(1).max(20).optional(),
  assignments: z
    .array(z.object({ lineId: z.string().min(1), payerIds: z.array(z.string().min(1)).min(1) }))
    .optional(),
  amounts: z
    .array(z.object({ payerId: z.string().min(1), amountInMinorUnits: z.number().int().min(0) }))
    .optional(),
  tip: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('NONE') }),
      z.object({ kind: z.literal('PERCENTAGE'), percent: z.number().min(0).max(1) }),
      z.object({ kind: z.literal('FIXED'), amountInMinorUnits: z.number().int().min(0) }),
    ])
    .default({ kind: 'NONE' }),
  displayCurrency: z.enum(['ARS', 'USD', 'EUR', 'BRL']).optional(),
});

function strategyFor(
  input: z.infer<typeof splitSchema>,
  bill: Bill,
): SplitStrategy {
  switch (input.kind) {
    case 'SINGLE_PAYER':
      // Sin payerId no hay a quién cobrarle. El '' cae en NO_PAYERS, que es
      // la respuesta correcta: falta elegir quién paga, no es un error de
      // cálculo.
      return singlePayerSplit(input.payerId ?? '');
    case 'EQUAL':
      return equalSplit(input.parts ?? bill.participants.length);
    case 'BY_DINER':
      return byDinerSplit();
    case 'BY_ITEM':
      return byItemSplit(input.assignments ?? []);
    case 'CUSTOM_AMOUNT':
      return customSplit(input.amounts ?? []);
  }
}

@Controller('bills')
export class BillsController {
  constructor(
    private readonly bills: BillsService,
    private readonly sessions: SessionsService,
    private readonly orders: OrdersService,
    private readonly realtime: RealtimeGateway,
    private readonly calls: CallsService,
    private readonly tenants: TenantsService,
  ) {}

  /** Cobrar termina la mesa, y una mesa que termina estrena código. */
  /*
   * `USE_POSTGRES=false` levanta la app sin base de datos, y un store que no
   * mira la bandera devuelve STORAGE_FAILURE en la primera llamada.
   */
  private readonly tables =
    process.env['USE_POSTGRES'] !== 'false'
      ? new PostgresTableStore(database)
      : new InMemoryTableStore();

  /**
   * Confirms the session belongs to the caller's table.
   *
   * A bill is money, so this never trusts `?tenant=`: `TableScopeGuard` has
   * already required a signed QR or a staff session. Mirrors
   * `SessionsController.sessionInScope`.
   */
  private async sessionInScope(scope: DinerScope, sessionId: string): Promise<SessionState> {
    const found = await this.sessions.store.findById(scope.tenantId, sessionId);
    if (found.isErr()) {
      throw new HttpException(found.error, HttpStatus.NOT_FOUND);
    }

    if (scope.tableId !== null && found.value.session.tableId !== scope.tableId) {
      throw new HttpException({ kind: 'WRONG_TABLE' }, HttpStatus.FORBIDDEN);
    }

    return found.value;
  }

  /**
   * Raises the bill for a table.
   *
   * Billed from what the table sent to the kitchen, never from the cart. A dish
   * chosen but not yet sent is not owed for: the comensal is still deciding,
   * and the kitchen never heard about it. It joins the bill the moment someone
   * hits "enviar el pedido", whether or not the kitchen has finished it.
   */
  @Public()
  @TableScoped()
  @Post('close/:sessionId')
  async close(@Param('sessionId') sessionId: string, @Scope() scope: DinerScope) {
    return this.describe(await this.raiseBill(scope, sessionId), 'ARS');
  }

  /**
   * Arma la cuenta de la mesa con lo que consumió.
   *
   * La levantan dos caminos: el comensal al abrir la pantalla de la cuenta, y
   * el mozo al cobrar una mesa que nunca la pidió — que pasa siempre con la
   * gente que come, paga en efectivo y se va sin tocar el teléfono. Antes ese
   * cobro no tenía documento y la mesa se liberaba sin registrar la plata.
   */
  private async raiseBill(scope: DinerScope, sessionId: string) {
    const tenantId = scope.tenantId;
    const state = await this.sessionInScope(scope, sessionId);

    const placed = await this.orders.store.listBySession(tenantId, sessionId);
    if (placed.isErr()) {
      throw new HttpException(placed.error, HttpStatus.BAD_GATEWAY);
    }

    // Acá el tope sería plata: una cuenta armada sobre una lista recortada
    // cobra de menos. Doscientos envíos en una sola mesa no pasa —ni un
    // cumpleaños de veinte llega— así que si pasa hay que mirarlo, no
    // redondearlo.
    if (placed.value.length >= MAX_SESSION_ORDERS) {
      log.error('la cuenta se armó sobre una lista de envíos recortada', {
        tenantId,
        sessionId,
        tope: MAX_SESSION_ORDERS,
      });
    }

    // Cancelled dishes were never served, so they are not owed for.
    const orderedLines = placed.value
      .filter((order) => order.status !== 'CANCELLED')
      .flatMap((order) =>
        order.items
          .filter((item) => order.statusOf(item.id) !== 'CANCELLED')
          .map((item) => {
            // Unit price plus its modifier deltas — the frozen figure, never
            // a line total divided back down, which would round badly.
            const unit = item.modifiers.reduce(
              (acc, modifier) => acc.flatMap((sum) => sum.add(modifier.priceDelta)),
              ok<Money, MoneyError>(item.product.unitPrice),
            );
            return {
              id: item.id,
              dinerId: item.dinerId,
              name: item.product.name,
              quantity: item.quantity,
              unitTotal: unit.isOk() ? unit.value : item.product.unitPrice,
            };
          }),
      );

    // Lo que sigue en el carrito no entra: todavía no se envió a la cocina, así
    // que la mesa no lo debe. Aparece en la cuenta recién cuando alguien toca
    // "enviar el pedido" y pasa a ser una orden.

    const run = closeBill({
      bills: this.bills.store,
      rates: this.bills.rates,
      newId: () => crypto.randomUUID(),
      now: () => new Date(),
    });

    const result = await run({
      tenantId,
      sessionId,
      currency: state.session.currency,
      participants: state.session.diners.map((diner) => ({
        id: diner.id,
        nickname: diner.nickname,
        colorIndex: diner.colorIndex,
      })),
      lines: orderedLines,
    });

    if (result.isErr()) {
      throw new HttpException(result.error, HttpStatus.CONFLICT);
    }
    return result.value;
  }

  @Public()
  @TableScoped()
  @Get(':sessionId')
  async read(
    @Param('sessionId') sessionId: string,
    @Scope() scope: DinerScope,
    @Query('display') display?: string,
  ) {
    await this.sessionInScope(scope, sessionId);

    const found = await this.bills.store.findBySession(scope.tenantId, sessionId);
    if (found.isErr()) {
      throw new HttpException(found.error, HttpStatus.NOT_FOUND);
    }
    return this.describe(found.value, (display as CurrencyCode) ?? 'ARS');
  }

  /**
   * Freezes the bill once the table has paid.
   *
   * Until this is called the bill keeps following the shared cart, so a coffee
   * ordered after asking for the bill still gets charged. After it, the
   * document is immutable — a reprint has to match what was paid.
   *
   * Cobrar es un acto del local, así que va detrás de `orders:advance` — el
   * mismo permiso que libera una mesa. Antes alcanzaba con el token de la mesa:
   * cualquiera sentado ahí cerraba su propia cuenta sin pagar, y quien le
   * hubiera sacado una foto al QR podía hacerlo desde su casa. El comensal
   * ahora avisa que pagó, y el mozo es quien lo confirma.
   */
  @RequirePermission('orders:advance')
  @TableScoped()
  @Post(':sessionId/settle')
  async settle(
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
    @Scope() scope: DinerScope,
  ) {
    /*
     * Con qué se cobró, según el mozo.
     *
     * Opcional a propósito: el botón viejo no lo manda, y una mesa cobrada
     * sin declararlo tiene que poder cerrarse igual. Queda en `null`, que es
     * "nadie lo dijo" — distinto de inventar un medio de pago.
     */
    const cobro = z
      // Del vocabulario y no de una lista escrita a mano: agregar un medio
      // en un solo lugar tiene que alcanzar, o el mozo elige uno que el
      // servidor rechaza.
      .object({ cobradoCon: z.enum(MEDIOS_DE_COBRO).optional() })
      .safeParse(body ?? {});

    // Un medio que no existe se rechaza en vez de guardarse como "nadie lo
    // dijo": el mozo declaró algo, y responderle 201 dejándolo en null le hace
    // creer que quedó registrado. El hueco en las métricas aparecería recién
    // a fin de mes, cuando ya no se puede reconstruir con qué se cobró.
    //
    // No mandar nada sigue siendo válido: es el caso de la mesa que se cobra
    // sin declarar, y ahí el null es deliberado.
    if (!cobro.success) {
      throw new HttpException(cobro.error.issues, HttpStatus.BAD_REQUEST);
    }

    const cobradoCon = cobro.data.cobradoCon ?? null;

    const state = await this.sessionInScope(scope, sessionId);

    // La mesa que nunca pidió la cuenta igual consumió: se arma acá y se cobra,
    // en vez de liberarla sin registrar la plata.
    const found = await this.bills.store.findBySession(scope.tenantId, sessionId);
    const bill = found.isErr() ? await this.raiseBill(scope, sessionId) : found.value;

    if (isSettled(bill)) {
      return this.describe(bill, 'ARS');
    }

    /*
     * El descuento se recalcula acá, no se cree lo que mande el cliente.
     *
     * Es plata: aceptar un monto del teléfono del mozo dejaría que cualquiera
     * declare el descuento que quiera. Se calcula igual que en la pantalla de
     * la cuenta, desde el porcentaje que el dueño configuró.
     */
    const puntos = await this.tenants.store.descuentoEnEfectivo(scope.tenantId);
    const configurado = descuentoDe((puntos.isOk() ? puntos.value : 0) / 100);
    const descuento = configurado.isOk() ? configurado.value : { porcentaje: 0 };

    const consumo = billSubtotal(bill);
    const rebaja =
      aplicaA(cobradoCon) && consumo.isOk()
        ? montoDelDescuento(descuento, consumo.value)
        : ok(Money.zero(bill.currency));

    const settled = await this.bills.store.save(scope.tenantId, {
      ...bill,
      status: 'SETTLED',
      cobradoCon,
      descuentoMinor: rebaja.isOk() ? rebaja.value.amountInMinorUnits : 0,
    });
    if (settled.isErr()) {
      throw new HttpException(settled.error, HttpStatus.BAD_GATEWAY);
    }

    // Paying is what ends the meal, so the table is released here. Without it
    // the session stays OPEN and the next group to scan that QR would join it.
    const closed = await closeTable({
      sessions: this.sessions.store,
      events: this.realtime,
      calls: this.calls.store,
    })({ tenantId: scope.tenantId, sessionId });

    if (closed.isErr()) {
      // The bill is paid either way; a stuck session is for staff to clear,
      // not a reason to tell the table their payment failed.
      console.error('bill settled but table stayed open', sessionId, closed.error);
    }

    // Código nuevo para el grupo que viene: el que se acaba de ir se lo lleva
    // sabido, y sin renovarlo podría sentarse de nuevo desde afuera.
    const rotated = await this.tables.rotateJoinCode(scope.tenantId, state.session.tableId);
    if (rotated.isErr()) {
      console.error('bill settled but table code stayed', sessionId, rotated.error);
    }

    return this.describe(settled.value, 'ARS');
  }

  /** Computes a split without persisting it: the table can try options freely. */
  @Public()
  @TableScoped()
  @Post(':sessionId/split')
  async split(
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
    @Scope() scope: DinerScope,
  ) {
    const parsed = splitSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error.issues, HttpStatus.BAD_REQUEST);
    }

    await this.sessionInScope(scope, sessionId);

    const found = await this.bills.store.findBySession(scope.tenantId, sessionId);
    if (found.isErr()) {
      throw new HttpException(found.error, HttpStatus.NOT_FOUND);
    }

    const bill = found.value;
    const subtotal = billSubtotal(bill);
    if (subtotal.isErr()) {
      throw new HttpException(subtotal.error, HttpStatus.CONFLICT);
    }

    const tip: Tip =
      parsed.data.tip.kind === 'FIXED'
        ? {
            kind: 'FIXED',
            amount:
              Money.of(parsed.data.tip.amountInMinorUnits, bill.currency).unwrapOr(
                Money.zero(bill.currency),
              ),
          }
        : parsed.data.tip;

    /*
     * El descuento por pagar en efectivo, si el local lo ofrece.
     *
     * Va antes de la propina a propósito: el descuento lo pone el
     * restaurante y la propina es del mozo, pero el mozo cobra su porcentaje
     * sobre lo que la mesa realmente paga — que es lo que ocurre hoy cuando
     * el descuento se arregla de palabra.
     *
     * Cualquier problema al leerlo deja el descuento en cero: un fallo no
     * puede inventar una rebaja que el local no ofrece.
     */
    const puntos = await this.tenants.store.descuentoEnEfectivo(scope.tenantId);
    const configurado = descuentoDe((puntos.isOk() ? puntos.value : 0) / 100);
    const descuento = configurado.isOk() ? configurado.value : { porcentaje: 0 };

    const daDescuento = aplicaA(parsed.data.paymentMethod ?? null);
    const rebaja = daDescuento
      ? montoDelDescuento(descuento, subtotal.value)
      : ok(Money.zero(bill.currency));
    if (rebaja.isErr()) {
      throw new HttpException(rebaja.error, HttpStatus.CONFLICT);
    }

    const base = subtotal.value.subtract(rebaja.value);
    if (base.isErr()) {
      throw new HttpException(base.error, HttpStatus.CONFLICT);
    }

    const tipValue = tipAmount(tip, base.value);
    const grandTotal = totalWithTip(base.value, tip);
    if (tipValue.isErr() || grandTotal.isErr()) {
      throw new HttpException(tipValue.isErr() ? tipValue.error : 'tip failed', HttpStatus.BAD_REQUEST);
    }

    const shares = strategyFor(parsed.data, bill).split(bill);
    if (shares.isErr()) {
      throw new HttpException(shares.error, HttpStatus.CONFLICT);
    }

    // Tip is spread in proportion to what each payer owes, not evenly.
    const withTip = distributeTip(shares.value, tipValue.value);
    const tipped = withTip.isOk() ? withTip.value : shares.value;

    return {
      kind: parsed.data.kind,
      subtotal: toMoneyDto(subtotal.value),
      // Cuánto baja por pagar en efectivo, y cuánto ofrece el local aunque
      // todavía no hayan elegido: la pantalla lo usa para decir "pagando en
      // efectivo ahorrás X" antes de que la mesa decida.
      descuento: toMoneyDto(rebaja.value),
      descuentoOfrecido: Math.round(descuento.porcentaje * 100),
      tip: toMoneyDto(tipValue.value),
      total: toMoneyDto(grandTotal.value),
      shares: shares.value.map((share, index) => ({
        payerId: share.payerId,
        label: share.label,
        amount: toMoneyDto(share.amount),
        amountWithTip: toMoneyDto(tipped[index]?.amount ?? share.amount),
      })),
    };
  }

  private describe(bill: Bill, display: CurrencyCode) {
    const subtotal = billSubtotal(bill);
    const base = subtotal.isOk() ? subtotal.value : Money.zero(bill.currency);
    const converted = displayIn(bill, base, display);

    return {
      id: bill.id,
      sessionId: bill.sessionId,
      currency: bill.currency,
      // Drives the UI: an open bill still tracks the table, a settled one is done.
      status: bill.status,
      // Con qué se cobró y cuánto se descontó, para que el panel pueda
      // mostrarlo y las métricas contarlo.
      cobradoCon: bill.cobradoCon ?? null,
      descuentoMinor: bill.descuentoMinor ?? 0,
      closedAt: bill.closedAt.toISOString(),
      subtotal: toMoneyDto(base),
      display: converted.isOk() ? toMoneyDto(converted.value) : null,
      rates: bill.rates.map((rate) => ({
        to: rate.to,
        rate: rate.rate,
        capturedAt: rate.capturedAt.toISOString(),
      })),
      participants: bill.participants,
      lines: bill.lines.map((line) => ({
        id: line.id,
        dinerId: line.dinerId,
        name: line.name,
        quantity: line.quantity,
        unitTotal: toMoneyDto(line.unitTotal),
      })),
    };
  }
}
