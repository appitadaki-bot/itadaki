import { apiUrl } from '@itadaki/shared/domain';
import {
  ChangeDetectionStrategy,
  Component,
  type OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { AuthStore, LoginComponent } from '@itadaki/shared/ui-auth';
import {
  type BoardLayout,
  type CardBatch,
  type OrderStatus,
  type PlatoJunto,
  type TableCard,
  canTransition,
  groupByTable,
  juntarIguales,
  layoutFor,
  splitByUrgency,
} from '@itadaki/ordering/domain';
import { KdsStore, type TicketDto } from './kds.store';

interface Column {
  readonly status: string;
  readonly label: string;
  readonly next: string | null;
  readonly action: string;
}

/*
 * En mayúscula: esta pantalla se mira de lejos y de reojo, y una palabra en
 * caja alta se reconoce por su forma antes de leerse.
 */
const COLUMNS: readonly Column[] = [
  { status: 'SENT', label: 'NUEVO', next: 'ACCEPTED', action: 'ACEPTAR' },
  { status: 'ACCEPTED', label: 'ACEPTADO', next: 'IN_PREP', action: 'EMPEZAR' },
  { status: 'IN_PREP', label: 'EN PREPARACIÓN', next: 'READY', action: 'MARCAR LISTO' },
  /*
   * La cocina llega hasta acá y no más.
   *
   * Marcar "entregado" desde la cocina daba por servido un plato que todavía
   * está en la barra: el mozo lo perdía de su lista antes de llevarlo, y la
   * mesa figuraba servida sin que nadie hubiera caminado hasta ella. Quien
   * entrega es quien lo declara, desde el salón.
   */
  { status: 'READY', label: 'LISTO PARA SERVIR', next: null, action: 'ESPERANDO AL MOZO' },
];

/** Minutes a ticket may wait before the board flags it. */
const API_URL = apiUrl();

/** En el teléfono entra menos: tres mesas abiertas llenan la pantalla. */
const FEED_OPEN = 3;

const SLA_WARNING = 8;
const SLA_LATE = 15;

@Component({
  selector: 'itd-kds',
  standalone: true,
  imports: [LoginComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './kds.component.css',
  template: `
    @if (!auth.ready()) {
      <p class="booting">Cargando…</p>
    } @else if (!auth.signedIn()) {
      <!-- Kitchen staff are created by the owner; signing up here would make
           a second restaurant by mistake. -->
      <itd-login context="Cocina" [allowSignUp]="false" />
    } @else {
    <header class="head">
      <div class="head-left">
        <!-- Sin título: la pantalla muestra pedidos entrando, y decirlo arriba
             ocupa el lugar que necesitan las comandas. En una cocina lo que se
             mira son las tarjetas. -->
        <p class="eyebrow">KDS · COCINA EN VIVO</p>
      </div>

      <!-- Sin chips de filtro: una cocina que no separa por puesto los tenía
           ocupando el ancho de la pantalla sin usarlos nunca. El filtro por
           sección sigue existiendo por dentro, en "todas". -->

      <div class="head-right">
        <p class="live" [class.off]="!store.connected()">
          <span class="dot" aria-hidden="true"></span>
          {{ store.connected() ? 'En vivo' : 'Reconectando…' }}
        </p>
        @if (store.pending(); as pending) {
          <!-- Says the taps are safe, not that something broke: they go out
               on their own as soon as there is signal again. -->
          <p class="queued" role="status">
            {{ pending }} sin enviar · se mandan solos
          </p>
        }
        <button type="button" class="signout" (click)="auth.signOut()">Salir</button>
      </div>
    </header>

    @if (layout() !== 'list') {
    <div class="board" [attr.data-layout]="layout()">
      @for (column of visibleColumns(); track column.status) {
        <section class="col" [attr.data-status]="column.status">
          <header class="col-head">
            <h2 class="col-name">{{ column.label }}</h2>
            <span class="col-count">{{ countFor(column.status) }}</span>
          </header>

          <div class="tickets">
            @for (ticket of openFor(column.status); track ticket.key) {
              <article class="ticket" [attr.data-sla]="slaOf(ticket)">
                <header class="ticket-head">
                  <span class="ticket-table">
                    <span class="table-word">Mesa</span>
                    <span class="table-number">{{ tableNumber(ticket) }}</span>
                  </span>
                  <span class="ticket-time">{{ waited(ticket) }}</span>
                </header>

                <!-- Un bloque por envío, cada uno con su estado.
                     Juntarlos bajo el estado de la mesa mentía: lo que la
                     cocina ya había aceptado volvía a verse como nuevo en
                     cuanto alguien de la mesa agregaba un plato. -->
                @for (batch of visibleBatches(ticket); track batch.orderId) {
                  @if (ticket.batches.length > 1) {
                    <div class="batch-head">
                      <span class="batch-name">{{ batch.number }}º envío</span>
                      <span class="batch-stage" [attr.data-status]="batch.status">
                        {{ columnLabel(batch.status) }}
                      </span>
                      <span class="batch-time">{{ waitedSince(batch.placedAt) }}</span>
                    </div>
                  }

                  <ul class="ticket-items">
                    @for (item of batchItems(batch); track item.ids[0]!.orderId + item.ids[0]!.id) {
                      <li class="ticket-item" [attr.data-item-status]="item.status">
                        <span class="qty">{{ item.quantity }}</span>
                        <!-- La estación cierra el bloque del plato, debajo del
                             nombre y de la nota: es un dato del plato, no una
                             acción. Al lado del nombre se leía como parte de él. -->
                        <span class="item-body">
                          <span class="item-name">
                            {{ item.name }}
                            <!-- Pegado al nombre y no al pie de la tarjeta: es
                                 de este plato y no del pedido entero, y en una
                                 comanda de cinco líneas hay que ver cuál. -->
                            @if (item.primero) {
                              <span class="item-primero">Primero</span>
                            }
                          </span>
                          @if (item.notes !== '') {
                            <span class="item-note">{{ item.notes }}</span>
                          }
                          <!-- Sin chip cuando el plato ya no está en la carta:
                               la comanda vale igual y hay que cocinarla. -->
                          @if (item.category !== null) {
                            <span class="item-section">{{ item.category }}</span>
                          }
                        </span>
                        <!-- Sólo la acción contra el margen derecho, siempre en
                             el mismo lugar: el botón entre medio se corría según
                             lo largo que fuera el nombre.

                             Each dish carries its own stage: a cook can send the
                             empanadas out while the roast is still cooking. -->
                        <span class="item-side">
                          @if (nextFor(item.status); as step) {
                            <button
                              type="button"
                              class="item-btn"
                              (click)="advanceJunto(item, step.next)"
                            >
                              {{ step.action }}
                            </button>
                          } @else {
                            <!-- READY no es entregado: el plato está en la
                                 barra esperando que el mozo lo lleve. -->
                            <span class="item-done">{{ doneLabel(item.status) }}</span>
                          }
                        </span>
                      </li>
                    }
                  </ul>

                  <!-- Con varios envíos, el botón del envío es el que sirve:
                       aceptar lo que acaba de entrar sin tocar lo que ya
                       está en la plancha. -->
                  @if (ticket.batches.length > 1) {
                    @if (nextFor(batch.status); as step) {
                      <button
                        type="button"
                        class="batch-btn"
                        (click)="advanceBatch(batch, step.next)"
                      >
                        {{ step.action }} {{ batch.number }}º ENVÍO →
                      </button>
                    }
                  }
                }

                @if (column.next !== null) {
                  <button type="button" class="ticket-btn" (click)="advanceCard(ticket, column.next)">
                    {{ column.action }} TODO →
                  </button>
                }
              </article>
            } @empty {
              <p class="empty">Sin pedidos</p>
            }

            <!-- Las que esperan atrás. Siguen a la vista — el cocinero ve
                 cuántas mesas tiene y hace cuánto esperan — pero como una
                 línea cada una, y se abren al tocarlas. -->
            @for (ticket of foldedFor(column.status); track ticket.key) {
              @if (expanded().has(ticket.key)) {
                <article class="ticket" [attr.data-sla]="slaOf(ticket)">
                  <header class="ticket-head">
                    <span class="ticket-table">
                      <span class="table-word">Mesa</span>
                      <span class="table-number">{{ tableNumber(ticket) }}</span>
                    </span>
                    <button type="button" class="fold-btn" (click)="toggle(ticket.key)">
                      plegar
                    </button>
                  </header>

                  <ul class="ticket-items">
                    @for (item of visibleItems(ticket); track item.ids[0]!.orderId + item.ids[0]!.id) {
                      <li class="ticket-item" [attr.data-item-status]="item.status">
                        <span class="qty">{{ item.quantity }}</span>
                        <span class="item-body">
                          <span class="item-name">{{ item.name }}</span>
                          @if (item.notes !== '') {
                            <span class="item-note">{{ item.notes }}</span>
                          }
                        </span>
                        <span class="item-side">
                          @if (nextFor(item.status); as step) {
                            <button
                              type="button"
                              class="item-btn"
                              (click)="advanceJunto(item, step.next)"
                            >
                              {{ step.action }}
                            </button>
                          }
                        </span>
                      </li>
                    }
                  </ul>

                  @if (column.next !== null) {
                    <button
                      type="button"
                      class="ticket-btn"
                      (click)="advanceCard(ticket, column.next)"
                    >
                      {{ column.action }} TODO →
                    </button>
                  }
                </article>
              } @else {
                <button
                  type="button"
                  class="folded"
                  [attr.data-sla]="slaOf(ticket)"
                  (click)="toggle(ticket.key)"
                >
                  <span class="folded-table">mesa {{ tableNumber(ticket) }}</span>
                  <span class="folded-count">{{ ticket.items.length }} platos</span>
                  <span class="folded-time">{{ waited(ticket) }}</span>
                </button>
              }
            }
          </div>
        </section>
      }
    </div>
    }

    @if (layout() === 'tabs') {
      <!-- Tablet vertical: cuatro columnas ahí quedan ilegibles, así que se
           ve una etapa por vez a pantalla completa. Los contadores en las
           solapas mantienen la vista de conjunto que las columnas daban. -->
      <nav class="tabs" aria-label="Etapa">
        @for (column of columns; track column.status) {
          <button
            type="button"
            class="tab"
            [class.on]="activeColumn() === column.status"
            [attr.data-status]="column.status"
            (click)="activeColumn.set(column.status)"
          >
            {{ column.label }}
            <span class="tab-count">{{ countFor(column.status) }}</span>
          </button>
        }
      </nav>
    }

    @if (layout() === 'list') {
      <!-- Teléfono: una sola lista por orden de llegada. Sin etapas, porque
           apilarlas dejaba "listo" al final del scroll — justo lo que el
           cocinero necesita ver primero. -->
      <div class="feed">
        @for (card of feedOpen(); track card.key) {
          <article class="feed-card" [attr.data-sla]="slaOf(card)">
            <header class="feed-head">
              <span class="feed-table">mesa {{ tableNumber(card) }}</span>
              <span class="feed-stage" [attr.data-status]="card.status">
                {{ columnLabel(card.status) }}
              </span>
              <span class="feed-time">{{ waited(card) }}</span>
            </header>

            @for (batch of visibleBatches(card); track batch.orderId) {
              @if (card.batches.length > 1) {
                <div class="batch-head">
                  <span class="batch-name">{{ batch.number }}º envío</span>
                  <span class="batch-stage" [attr.data-status]="batch.status">
                    {{ columnLabel(batch.status) }}
                  </span>
                  <span class="batch-time">{{ waitedSince(batch.placedAt) }}</span>
                </div>
              }

              <ul class="ticket-items">
                @for (item of batchItems(batch); track item.ids[0]!.orderId + item.ids[0]!.id) {
                  <li class="ticket-item" [attr.data-item-status]="item.status">
                    <span class="qty">{{ item.quantity }}</span>
                    <span class="item-body">
                      <span class="item-name">{{ item.name }}</span>
                      @if (item.notes !== '') {
                        <span class="item-note">{{ item.notes }}</span>
                      }
                    </span>
                  </li>
                }
              </ul>

              @if (card.batches.length > 1) {
                @if (nextFor(batch.status); as step) {
                  <button type="button" class="batch-btn" (click)="advanceBatch(batch, step.next)">
                    {{ step.action }} {{ batch.number }}º ENVÍO →
                  </button>
                }
              }
            }

            @if (nextStepFor(card); as step) {
              <button type="button" class="ticket-btn" (click)="advanceCard(card, step.next)">
                {{ step.action }} TODO →
              </button>
            }
          </article>
        } @empty {
          <p class="empty">Sin pedidos</p>
        }

        <!-- Las que esperan atrás: una línea cada una, igual que en la
             tablet. Mostrarlas enteras daba cinco pantallas de scroll. -->
        @for (card of feedFolded(); track card.key) {
          @if (expanded().has(card.key)) {
            <article class="feed-card" [attr.data-sla]="slaOf(card)">
              <header class="feed-head">
                <span class="feed-table">mesa {{ tableNumber(card) }}</span>
                <button type="button" class="fold-btn" (click)="toggle(card.key)">Plegar</button>
              </header>
              <ul class="ticket-items">
                @for (item of visibleItems(card); track item.ids[0]!.orderId + item.ids[0]!.id) {
                  <li class="ticket-item" [attr.data-item-status]="item.status">
                    <span class="qty">{{ item.quantity }}</span>
                    <span class="item-body"><span class="item-name">{{ item.name }}</span></span>
                  </li>
                }
              </ul>
              @if (nextStepFor(card); as step) {
                <button type="button" class="ticket-btn" (click)="advanceCard(card, step.next)">
                  {{ step.action }} TODO →
                </button>
              }
            </article>
          } @else {
            <button
              type="button"
              class="folded"
              [attr.data-sla]="slaOf(card)"
              (click)="toggle(card.key)"
            >
              <span class="folded-table">mesa {{ tableNumber(card) }}</span>
              <span class="folded-count">{{ card.items.length }} platos</span>
              <span class="folded-time">{{ waited(card) }}</span>
            </button>
          }
        }
      </div>
    }

    }
  `,
})
export class KdsComponent implements OnDestroy {
  protected readonly auth = inject(AuthStore);
  protected readonly store = inject(KdsStore);
  protected readonly columns = COLUMNS;

  /** null es "todas": una sección de la carta podría llamarse igual. */
  protected readonly activeSection = signal<string | null>(null);

  /** Las secciones que hay algo pidiendo ahora, en orden alfabético. */
  protected readonly sections = computed<readonly string[]>(() =>
    [
      ...new Set(
        this.store
          .tickets()
          .flatMap((ticket) => ticket.items)
          .map((item) => item.category)
          .filter((category): category is string => category !== null),
      ),
    ].sort((a, b) => a.localeCompare(b, 'es')),
  );

  /**
   * Qué tan ancha está la pantalla, para elegir cómo mostrar el tablero.
   *
   * La tablet fija de la cocina y el celular del cocinero de un local chico
   * no son el mismo caso: en columnas, un teléfono apila las cuatro etapas y
   * deja "listo" al final del scroll — justo lo que hay que sacar.
   */
  private readonly width = signal(
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  );
  protected readonly layout = computed<BoardLayout>(() => layoutFor(this.width()));

  /** En pestañas y en lista se ve una etapa por vez; ésta es la que se ve. */
  protected readonly activeColumn = signal(COLUMNS[0]?.status ?? 'SENT');
  private readonly tick = signal(Date.now());
  private readonly timer: ReturnType<typeof setInterval>;

  /**
   * Only tickets with at least one item for the active section. A grill screen
   * showing drinks is noise the cook has to filter by eye.
   */
  private readonly visible = computed<readonly TicketDto[]>(() => {
    const section = this.activeSection();
    if (section === null) return this.store.tickets();

    // Los platos sin sección entran en todas las pantallas. Esconderlos en
    // todas seria peor que mostrarlos de mas: nadie los cocina y nadie se
    // entera, que es como se pierde un pedido.
    return this.store
      .tickets()
      .filter((ticket) =>
        ticket.items.some((item) => item.category === section || item.category === null),
      );
  });

  /**
   * Una tarjeta por mesa, no por envío.
   *
   * Una mesa que agrega el postre aparecía dos veces en la pantalla, a veces
   * en columnas distintas, y el cocinero tenía que reconstruirla a ojo.
   */
  private readonly cards = computed(() => groupByTable(this.visible()));

  private readonly byStatus = computed(() => {
    const grouped = new Map<string, TableCard[]>();
    for (const card of this.cards()) {
      const bucket = grouped.get(card.status) ?? [];
      bucket.push(card);
      grouped.set(card.status, bucket);
    }
    return grouped;
  });

  constructor() {
    this.auth.configure(API_URL);

    // Girar la tablet cambia el layout, así que el ancho se sigue mirando.
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.width.set(window.innerWidth));
    }
    void this.auth.restore().then(() => {
      if (this.auth.signedIn()) this.store.connect();
    });

    // Connect once a sign-in completes.
    effect(() => {
      if (this.auth.signedIn()) this.store.connect();
    });
    // Elapsed time drives the SLA colour, so the board has to re-read the
    // clock even when no event arrives.
    this.timer = setInterval(() => this.tick.set(Date.now()), 20_000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    this.store.disconnect();
  }

  protected selectSection(section: string | null): void {
    this.activeSection.set(section);
  }

  /**
   * Lo que se atiende ahora, abierto con sus platos y sus botones.
   *
   * Con veinte mesas activas el tablero medía ocho pantallas de alto, y el
   * cocinero perdía de vista la primera — que es la que hay que sacar.
   */
  protected openFor(status: string): readonly TableCard[] {
    return this.split(status).open;
  }

  /** Las que esperan atrás: una línea cada una, para no ocupar la pantalla. */
  protected foldedFor(status: string): readonly TableCard[] {
    return this.split(status).folded;
  }

  private split(status: string): { open: readonly TableCard[]; folded: readonly TableCard[] } {
    const cards = this.byStatus().get(status) ?? [];
    return splitByUrgency(cards, (card) => this.minutesWaiting(card), SLA_LATE);
  }

  /**
   * Todo el tablero en una sola lista, para el teléfono.
   *
   * Sin etapas: el cocinero baja y va sacando, con el estado a la vista en
   * cada tarjeta. Apilar las cuatro columnas dejaba "listo" al final del
   * scroll, que es justo lo que hay que ver primero.
   */
  /**
   * La lista del teléfono: lo urgente abierto, el resto plegado.
   *
   * Mismo criterio que en columnas. Mostrar las catorce mesas enteras daba
   * cinco pantallas de scroll — peor que el layout que vino a reemplazar.
   * En una pantalla chica se abren menos, porque entra menos.
   */
  private readonly feedSplit = computed(() =>
    splitByUrgency(this.cards(), (card) => this.minutesWaiting(card), SLA_LATE, FEED_OPEN),
  );

  protected readonly feedOpen = computed(() => this.feedSplit().open);
  protected readonly feedFolded = computed(() => this.feedSplit().folded);

  /**
   * Las etapas que se ven ahora.
   *
   * En columnas están las cuatro; en pestañas, sólo la elegida — que es lo
   * que hace que entre en una tablet vertical sin achicarse hasta ser
   * ilegible.
   */
  protected readonly visibleColumns = computed(() =>
    this.layout() === 'tabs'
      ? COLUMNS.filter((column) => column.status === this.activeColumn())
      : COLUMNS,
  );

  /** El paso siguiente de una tarjeta, para el botón de la lista. */
  protected nextStepFor(card: TableCard): { next: string; action: string } | null {
    return this.nextFor(card.status);
  }

  protected columnLabel(status: string): string {
    return COLUMNS.find((column) => column.status === status)?.label ?? status;
  }

  /** Todas las mesas de esa columna: el contador del encabezado las cuenta
   *  a todas, estén abiertas o plegadas. */
  protected countFor(status: string): number {
    return (this.byStatus().get(status) ?? []).length;
  }

  /** Las mesas plegadas que el cocinero abrió a mano. */
  protected readonly expanded = signal(new Set<string>());

  protected toggle(key: string): void {
    this.expanded.update((abiertas) => {
      const siguiente = new Set(abiertas);
      if (!siguiente.delete(key)) siguiente.add(key);
      return siguiente;
    });
  }

  /**
   * Avanza los platos de la mesa que están justo un paso atrás.
   *
   * Sólo esos: antes intentaba mover todo lo que no estuviera ya en ese
   * estado, incluido lo que iba más adelante, y el servidor rechazaba esas
   * transiciones — el botón hacía menos de lo que decía, sin avisar.
   *
   * Recorre plato por plato porque una tarjeta puede juntar varios envíos, y
   * cada uno es una comanda distinta del lado del servidor.
   */
  protected async advanceCard(card: TableCard, next: string): Promise<void> {
    await this.advanceItems(card.items, next);
  }

  /** Avanza un envío solo, sin tocar lo que la mesa ya tiene en marcha. */
  protected async advanceBatch(batch: CardBatch, next: string): Promise<void> {
    await this.advanceItems(batch.items, next);
  }

  /**
   * Avanza un plato junto: todas las líneas que lo componen.
   *
   * Al tocar "aceptar" sobre dos empanadas juntas hay que avanzar las dos, o
   * una queda atrás sin que nadie lo note — y la mesa recibe una sola.
   */
  protected async advanceJunto(plato: PlatoJunto, next: string): Promise<void> {
    for (const { orderId, id } of plato.ids) {
      if (canTransition(plato.status as OrderStatus, next as OrderStatus)) {
        await this.store.advanceItem(orderId, id, next);
      }
    }
  }

  private async advanceItems(items: TableCard['items'], next: string): Promise<void> {
    for (const item of items) {
      // La misma regla que aplica el servidor, para no mandar lo que va a
      // rechazar: un plato en preparación no vuelve a aceptado.
      if (canTransition(item.status as OrderStatus, next as OrderStatus)) {
        await this.store.advanceItem(item.orderId, item.id, next);
      }
    }
  }

  /**
   * Los platos de una comanda, filtrados por sección y juntados los iguales.
   *
   * La cocina hace comida, no lleva la cuenta de quién pidió qué: dos
   * empanadas son dos empanadas, vengan del mismo comensal o de dos.
   * Separadas obligan a sumar de memoria y hacen la comanda el doble de larga.
   */
  protected visibleItems(card: TableCard): readonly PlatoJunto[] {
    const section = this.activeSection();
    // Sin sección propia se ve en todas las pantallas: un plato que el dueño
    // todavía no clasificó no puede desaparecer de la cocina.
    const suyos =
      section === null
        ? card.items
        : card.items.filter((i) => i.category === section || i.category === null);
    return juntarIguales(suyos);
  }

  /** Lo mismo para un envío suelto dentro de la comanda. */
  protected batchItems(batch: { items: TableCard['items'] }): readonly PlatoJunto[] {
    return juntarIguales(batch.items);
  }

  /**
   * The number alone, rendered large — it is what a cook scans the board for.
   * A readable table id ('mesa-7') gives up its number; a generated session id
   * falls back to a short prefix so the ticket is still identifiable.
   */
  /** The one step a dish can take from where it is, or null once delivered. */
  /** Qué decir de un plato que ya no tiene botón en este tablero. */
  protected doneLabel(status: string): string {
    return status === 'READY' ? 'en la barra' : 'entregado';
  }

  protected nextFor(status: string): { next: string; action: string } | null {
    const step = COLUMNS.find((column) => column.status === status);
    return step?.next === null || step === undefined
      ? null
      : { next: step.next, action: step.action };
  }

  protected async advanceItem(orderId: string, itemId: string, next: string): Promise<void> {
    await this.store.advanceItem(orderId, itemId, next);
  }

  protected tableNumber(card: TableCard): string {
    // `key` ya trae la sesión cuando la comanda no dice de qué mesa es.
    const source = card.tableId ?? card.key;
    const digits = /(\d+)\s*$/.exec(source);
    if (digits !== null) return digits[1] ?? source;
    return source.length > 12 ? source.slice(0, 4) : source;
  }

  private minutesWaiting(card: TableCard): number {
    return this.minutesSince(card.placedAt);
  }

  private minutesSince(placedAt: string | null): number {
    if (placedAt === null) return 0;
    return (this.tick() - new Date(placedAt).getTime()) / 60_000;
  }

  protected slaOf(card: TableCard): 'ok' | 'warning' | 'late' {
    const minutes = this.minutesWaiting(card);
    if (minutes >= SLA_LATE) return 'late';
    if (minutes >= SLA_WARNING) return 'warning';
    return 'ok';
  }

  protected waited(card: TableCard): string {
    return this.waitedSince(card.placedAt);
  }

  /** Hace cuánto entró un envío, que no es lo mismo que hace cuánto espera la mesa. */
  protected waitedSince(placedAt: string | null): string {
    if (placedAt === null) return 'ahora';
    const minutes = Math.floor(this.minutesSince(placedAt));
    if (minutes < 1) return 'recién';
    return `${minutes} min`;
  }

  /**
   * Los envíos de la mesa con platos para esta pantalla.
   *
   * En una pantalla de parrilla, un envío que sólo trajo bebidas no es un
   * bloque vacío: directamente no está.
   */
  protected visibleBatches(card: TableCard): readonly CardBatch[] {
    const section = this.activeSection();
    if (section === null) return card.batches;

    return card.batches
      .map((batch) => ({
        ...batch,
        items: batch.items.filter((item) => item.category === section || item.category === null),
      }))
      .filter((batch) => batch.items.length > 0);
  }

  protected advance(orderId: string, next: string): void {
    void this.store.advance(orderId, next);
  }
}
