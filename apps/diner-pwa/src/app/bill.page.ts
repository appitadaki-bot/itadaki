import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal,
  type ElementRef,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { type PaymentMethod } from '@itadaki/ordering/domain';
import { DINER_PALETTE } from '@itadaki/shared/ui-tokens';
import { BackLinkComponent } from './back-link.component';
import { PaymentSheetComponent } from './payment-sheet.component';
import { ApiClient } from './api-client';
import { CallStore } from './call.store';
import { BillStore, type MoneyDto, type SplitKind, type TipChoice } from './bill.store';
import { SessionStore } from './session.store';
import { medirElPie } from './medir-el-pie';
import { hayQueReleerLaCuenta } from './releer-la-cuenta';

// Primera la de uno solo: es la forma más común de cerrar una mesa —el que
// invita, el que junta el efectivo y pone la tarjeta— y era la única que no
// se podía elegir. Después las que dividen, de la más simple a la más fina.
const SPLIT_LABELS: ReadonlyArray<{ kind: SplitKind; label: string; hint: string }> = [
  { kind: 'SINGLE_PAYER', label: 'Paga una persona', hint: 'uno se hace cargo de todo' },
  { kind: 'BY_DINER', label: 'Cada uno lo suyo', hint: 'pagás lo que pediste' },
  { kind: 'EQUAL', label: 'Partes iguales', hint: 'el total dividido' },
  { kind: 'BY_ITEM', label: 'Uno por uno', hint: 'elegís quién paga qué' },
];

const TIP_OPTIONS: ReadonlyArray<{ label: string; choice: TipChoice }> = [
  { label: 'Sin propina', choice: { kind: 'NONE' } },
  { label: '5%', choice: { kind: 'PERCENTAGE', percent: 0.05 } },
  { label: '10%', choice: { kind: 'PERCENTAGE', percent: 0.1 } },
  { label: '15%', choice: { kind: 'PERCENTAGE', percent: 0.15 } },
  { label: '20%', choice: { kind: 'PERCENTAGE', percent: 0.2 } },
];

const CURRENCIES = ['ARS', 'USD', 'EUR', 'BRL'] as const;

/**
 * Cómo puede pagar la mesa.
 *
 * Sólo se muestra si el local ofrece descuento en efectivo: sin eso, elegir
 * acá no cambia nada y sería un paso que no sirve. Quien no elige paga como
 * siempre, y el mozo pregunta en la mesa igual que ahora.
 */
const MEDIOS_DE_PAGO: ReadonlyArray<{ id: PaymentMethod; label: string; hint: string }> = [
  { id: 'CASH', label: 'En efectivo', hint: 'Con descuento' },
  { id: 'CARD', label: 'Con tarjeta', hint: 'Te llevan el posnet' },
];


@Component({
  selector: 'itd-bill',
  standalone: true,
  imports: [RouterLink, BackLinkComponent, PaymentSheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './bill.page.css',
  template: `
    <header class="pad">
      <itd-back to="/carta" />
      <p class="eyebrow">
        @if (session.tableLabel(); as mesa) { mesa {{ mesa }} · }cuenta
      </p>
      <h1 class="title">Gochisousama!</h1>
    </header>

    @if (store.bill(); as bill) {
      <main class="body">
        <section class="card">
          @for (line of bill.lines; track line.id) {
            <div class="line">
              <span>{{ line.quantity }}× {{ line.name }}</span>
              <span class="amount">{{ format(line.unitTotal, line.quantity) }}</span>
            </div>
          }
          <div class="line total">
            <span>total {{ bill.currency }}</span>
            <span class="amount">{{ money(bill.subtotal) }}</span>
          </div>

          @if (displayCurrency() !== bill.currency && bill.display) {
            <p class="converted">
              ≈ {{ money(bill.display) }} · cotización del momento del pedido
            </p>
          }
        </section>

        <section class="card">
          <h2 class="card-title">Ver en</h2>
          <div class="chips">
            @for (code of currencies; track code) {
              <button
                type="button"
                class="chip"
                [attr.aria-pressed]="displayCurrency() === code"
                (click)="setCurrency(code)"
              >
                {{ code }}
              </button>
            }
          </div>
        </section>

        <!-- Cómo pagan, antes de cómo dividen: el descuento en efectivo
             cambia el total, y dividir un número que después baja obliga a
             rehacer la cuenta. Sólo aparece si el local ofrece descuento —
             sin eso, elegir el medio acá no cambiaría nada y sería un paso
             que no sirve. -->
        @if (ofreceDescuento()) {
          <section class="card">
            <h2 class="card-title">Cómo pagan</h2>
            <div class="options">
              @for (medio of mediosDePago; track medio.id) {
                <button
                  type="button"
                  class="option"
                  [attr.aria-pressed]="medioElegido() === medio.id"
                  (click)="elegirMedio(medio.id)"
                >
                  <span class="option-text">
                    <span class="option-label">{{ medio.label }}</span>
                    <span class="option-hint">{{ medio.hint }}</span>
                  </span>
                  @if (medio.id === 'CASH') {
                    <span class="ahorro">-{{ store.split()?.descuentoOfrecido ?? descuentoOfrecido() }}%</span>
                  }
                </button>
              }
            </div>
          </section>
        }

        <section class="card">
          <h2 class="card-title">Cómo dividimos</h2>
          <div class="options">
            @for (option of splitOptions; track option.kind) {
              <button
                type="button"
                class="option"
                [attr.aria-pressed]="splitKind() === option.kind"
                (click)="chooseSplit(option.kind)"
              >
                <span class="option-label">{{ option.label }}</span>
                <span class="option-hint">{{ option.hint }}</span>
              </button>
            }
          </div>

          @if (splitKind() === 'SINGLE_PAYER') {
            <p class="assign-hint">¿Quién se hace cargo?</p>
            <div class="assign-people quien-paga">
              @for (person of bill.participants; track person.id) {
                <button
                  type="button"
                  class="person"
                  [style.background]="payerId() === person.id ? color(person.colorIndex) : 'transparent'"
                  [style.color]="payerId() === person.id ? 'white' : 'inherit'"
                  [attr.aria-pressed]="payerId() === person.id"
                  (click)="choosePayer(person.id)"
                >
                  {{ person.nickname }}
                </button>
              }
            </div>
          }

          @if (splitKind() === 'EQUAL') {
            <div class="stepper-row">
              <span class="stepper-label">Entre</span>
              <div class="stepper" role="group" aria-label="Cantidad de personas">
                <button type="button" class="step" (click)="changeParts(-1)" aria-label="Menos personas">–</button>
                <span class="qty">{{ parts() }}</span>
                <button type="button" class="step" (click)="changeParts(1)" aria-label="Más personas">+</button>
              </div>
              <span class="stepper-label">persona{{ parts() > 1 ? 's' : '' }}</span>
            </div>
          }

          @if (splitKind() === 'BY_ITEM') {
            <!-- Que se pueda tocar más de uno no es un error: una picada entre
                 dos se paga entre dos, y el plato se divide en partes iguales.
                 La pantalla decía "tocá un nombre", en singular, así que
                 marcar dos se leía como que algo había salido mal. -->
            <p class="assign-hint">
              Tocá quién paga cada cosa. Si la compartieron, marcá a todos y se
              divide entre ellos.
            </p>
            @for (line of bill.lines; track line.id) {
              <div class="assign" [class.pendiente]="!estaAsignado(line.id)">
                <span class="assign-name">{{ line.quantity }}× {{ line.name }}</span>
                <div class="assign-people">
                  @for (person of bill.participants; track person.id) {
                    <button
                      type="button"
                      class="person"
                      [style.background]="isAssigned(line.id, person.id) ? color(person.colorIndex) : 'transparent'"
                      [style.color]="isAssigned(line.id, person.id) ? 'white' : 'inherit'"
                      [attr.aria-pressed]="isAssigned(line.id, person.id)"
                      (click)="toggleAssign(line.id, person.id)"
                    >
                      {{ person.nickname }}
                    </button>
                  }
                </div>
              </div>
            }

            <!-- Cuántos faltan, no sólo que falta alguno: en una mesa larga el
                 comensal quedaba recorriendo la lista para encontrarlo. -->
            @if (faltanAsignar() > 0) {
              <p class="assign-falta" role="status">
                Falta{{ faltanAsignar() > 1 ? 'n' : '' }} {{ faltanAsignar() }}
                sin asignar
              </p>
            }
          }
        </section>

        <section class="card">
          <h2 class="card-title">Propina <em>(opcional)</em></h2>
          <div class="chips">
            @for (option of tipOptions; track option.label) {
              <button
                type="button"
                class="chip"
                [attr.aria-pressed]="tipLabel() === option.label"
                (click)="chooseTip(option)"
              >
                {{ option.label }}
              </button>
            }
          </div>
        </section>

        @if (store.error(); as error) {
          <p class="error" role="alert">{{ error }}</p>
        }

        @if (store.split(); as split) {
          <section class="card result">
            <h2 class="card-title">Quién paga qué</h2>
            @for (share of split.shares; track share.payerId) {
              <div class="share">
                <span class="share-name">{{ share.label }}</span>
                <span class="share-amount">{{ money(share.amountWithTip) }}</span>
              </div>
            }

            @if (split.descuento && split.descuento.amountInMinorUnits > 0) {
              <!-- En verde y con el signo menos: es lo único de esta pantalla
                   que baja el total, y hay que poder verlo sin leer. -->
              <div class="line sub ahorrado">
                <span>Descuento por pagar en efectivo</span>
                <span class="amount">-{{ money(split.descuento) }}</span>
              </div>
            }

            @if (split.tip.amountInMinorUnits > 0) {
              <div class="line sub">
                <span>Propina incluida</span>
                <span class="amount">{{ money(split.tip) }}</span>
              </div>
            }
            <div class="line total">
              <span>Total</span>
              <span class="amount">{{ money(split.total) }}</span>
            </div>
          </section>
        }
      </main>

      <footer class="foot" #pie>
        @if (bill.status === 'SETTLED') {
          <p class="settled" role="status">Cuenta cerrada · gracias!</p>

          <!-- Acá y no antes: la mesa ya pagó y la comida terminó bien. Pedir
               una reseña antes de cobrar se lee como presión, y todavía no
               saben cómo terminó la noche.

               Sólo si el local configuró su link: mandar a un cliente
               conforme a una página rota es peor que no pedirle nada. -->
          @if (resenaUrl(); as url) {
            <a
              class="cta resena"
              [href]="url"
              target="_blank"
              rel="noopener"
              (click)="contarResena()"
            >
              ⭐ Dejanos tu opinión en Google
            </a>
            <p class="resena-nota">Nos ayuda muchísimo · tarda menos de un minuto</p>
          }
        } @else if (told()) {
          <!-- Cerrar la cuenta lo hace el local. Desde acá sólo se avisa, y
               eso es lo que dice la pantalla: prometer "listo, cerrada" sería
               mentir sobre algo que todavía no pasó. -->
          <p class="settled" role="status">Le avisamos al mozo · ya se acerca</p>
        } @else {
          <!-- Bloqueado mientras la división esté a medio hacer.
               Antes el botón se podía tocar igual: la mesa elegía "por plato",
               dejaba platos sin asignar y avisaba al mozo lo mismo, que llegaba
               a cobrar una división que el servidor nunca calculó. -->
          <button
            type="button"
            class="cta"
            [disabled]="!listoParaPagar()"
            (click)="confirming.set(true)"
          >
            Pedir la cuenta
          </button>
          @if (queFalta(); as falta) {
            <p class="foot-falta">{{ falta }}</p>
          }
        }
      </footer>

      <!-- Elegir cómo pagan es una pregunta, no un tercer piso del pie: al
           abrirse ahí abajo empujaba el total fuera de la pantalla y las tres
           formas de pago competían con los botones de propina que quedaban al
           lado. La hoja es la misma que abre el timbre, para que la mesa no
           tenga que contestar dos preguntas distintas según por dónde entró. -->
      @if (confirming()) {
        <itd-payment-sheet
          [busy]="calls.busy()"
          [error]="calls.error()"
          (choose)="tell($event)"
          (close)="confirming.set(false)"
        />
      }

    } @else {
      <main class="body empty">
        @if (store.busy()) {
          <p>Abriendo la cuenta…</p>
        } @else if (!session.isJoined()) {
          <p class="muted">Unite a la mesa para ver la cuenta.</p>
          <a class="link" routerLink="/unirse">Unirme a la mesa</a>
        } @else if (store.error(); as error) {
          <!-- Que no se lea como una mesa vacía.
               Si abrir la cuenta falló —se cayó la conexión, el servidor
               contestó mal— decir "todavía no pidieron nada" es contar otra
               historia: el comensal acaba de pedir y sabe que pidió, así que
               la pantalla queda como si le mintiera. -->
          <p class="muted">{{ error }}</p>
          <!-- Reintentar sólo cuando reintentar puede funcionar. Si la mesa
               venció, el botón repetiría el mismo fallo para siempre: lo que
               hace falta es escanear el QR otra vez. -->
          @if (store.sirveReintentar()) {
            <button type="button" class="link" (click)="reintentar()">Probar de nuevo</button>
          } @else {
            <a class="link" routerLink="/carta">Ver la carta</a>
          }
        } @else {
          <!-- A bill needs something to bill: an empty table has no total. -->
          <p class="muted">Todavía no pidieron nada en esta mesa.</p>
          <a class="link" routerLink="/carta">Ver la carta</a>
        }
      </main>
    }
  `,
})
export class BillPage {
  protected readonly store = inject(BillStore);
  protected readonly session = inject(SessionStore);
  protected readonly calls = inject(CallStore);
  private readonly api = inject(ApiClient);

  protected readonly splitOptions = SPLIT_LABELS;
  protected readonly mediosDePago = MEDIOS_DE_PAGO;

  /** Qué eligió la mesa, o null mientras no elija. */
  protected readonly medioElegido = signal<PaymentMethod | null>(null);

  /** Los puntos que el local ofrece, leídos al abrir la cuenta. */
  protected readonly descuentoOfrecido = signal(0);

  /** Dónde deja la reseña, o null si el local no las pide. */
  protected readonly resenaUrl = signal<string | null>(null);

  /** Para no contar dos veces el mismo ofrecimiento. */
  private resenaContada = false;

  /**
   * Cuenta el ofrecimiento cuando el botón de verdad aparece.
   *
   * No al cargar la pantalla: la cuenta se abre mucho antes de pagarse, y
   * contar ahí infla el número con mesas que todavía están comiendo. Recién
   * cuando la cuenta está cerrada y el link existe hay algo que ofrecer.
   */
  private readonly contarOfrecimiento = effect(() => {
    const cerrada = this.store.bill()?.status === 'SETTLED';
    if (!cerrada || this.resenaUrl() === null || this.resenaContada) return;

    this.resenaContada = true;
    void this.api.send('/ajustes/resenas/ofrecida', 'PATCH', {});
  });

  /**
   * Cuenta que alguien tocó el botón.
   *
   * Se dispara sin esperar: el link ya está abriéndose en otra pestaña, y
   * hacer que el cliente espere una escritura nuestra sería cobrarle el favor
   * que nos está haciendo.
   */
  protected contarResena(): void {
    void this.api.send('/ajustes/resenas/tocada', 'PATCH', {});
  }

  protected readonly ofreceDescuento = computed(() => this.descuentoOfrecido() > 0);

  protected elegirMedio(medio: PaymentMethod): void {
    this.medioElegido.set(medio);
    this.recompute();
  }
  protected readonly tipOptions = TIP_OPTIONS;
  protected readonly currencies = CURRENCIES;

  protected readonly splitKind = signal<SplitKind>('BY_DINER');
  protected readonly parts = signal(2);
  protected readonly tipLabel = signal('Sin propina');
  protected readonly displayCurrency = signal<string>('ARS');
  private readonly assignments = signal<ReadonlyMap<string, readonly string[]>>(new Map());

  private tip: TipChoice = { kind: 'NONE' };

  protected readonly sessionId = computed(() => this.session.session()?.id ?? null);

  private readonly pie = viewChild<ElementRef<HTMLElement>>('pie');

  constructor() {
    medirElPie(this.pie);

    // El descuento del local, para saber si mostrar la elección del medio.
    void this.cargarDescuento();

    /*
     * Cuando el mozo cobra, la mesa se entera.
     *
     * La cuenta se leía una sola vez al abrirla y ahí se quedaba: el mozo
     * cobraba, del lado del servidor quedaba cerrada, y el comensal seguía
     * viendo el botón de pagar. Nunca llegaba a ver el "gracias" ni el pedido
     * de reseña, que viven justamente en ese estado.
     *
     * Ya cerrada no hay nada más que mirar, así que se deja de pedir.
     */
    const dejarDeEscuchar = this.session.onSessionChanged(() => {
      const id = this.session.session()?.id;
      if (id === undefined || !hayQueReleerLaCuenta(id, this.store.bill()?.status)) return;
      void this.store.close(id);
    });
    inject(DestroyRef).onDestroy(dejarDeEscuchar);
  }

  /**
   * Abre la cuenta apenas se sabe qué mesa es.
   *
   * Un `effect` y no una línea en el constructor: al entrar por un link o al
   * recargar, la sesión se restaura pidiéndosela al servidor, así que en el
   * momento en que se construye esta pantalla todavía no está. El constructor
   * leía `session()?.id`, lo encontraba vacío y se iba con un `return` sin
   * volver a mirar — la mesa aparecía un instante después, ya con su pedido, y
   * la pantalla seguía diciendo "todavía no pidieron nada".
   *
   * Abrir la cuenta es idempotente del lado del servidor: una que ya existe
   * vuelve igual en vez de emitirse de nuevo. Aun así se pide una sola vez por
   * mesa, porque el efecto también corre cuando la sesión cambia por otras
   * razones —alguien más se suma, llega un plato— y eso son varias veces
   * durante una comida.
   */
  private readonly abrirLaCuenta = effect(() => {
    const id = this.session.session()?.id;
    if (id === undefined || id === this.pedidaPara) return;

    this.pedidaPara = id;
    void this.store.close(id).then(() => {
      this.parts.set(this.store.bill()?.participants.length ?? 2);
      this.recompute();
    });
  });

  /** De qué mesa ya se pidió la cuenta, para no pedirla en cada cambio. */
  private pedidaPara: string | null = null;

  /** Vuelve a intentar abrir la cuenta, después de un fallo. */
  protected reintentar(): void {
    const id = this.session.session()?.id;
    if (id === undefined) return;

    // Se limpia la marca para que el efecto vuelva a pedirla: sin esto, el
    // botón no haría nada porque esta mesa ya figura como pedida.
    this.pedidaPara = null;
    void this.store.close(id).then(() => {
      this.pedidaPara = id;
      this.parts.set(this.store.bill()?.participants.length ?? 2);
      this.recompute();
    });
  }

  protected readonly confirming = signal(false);

  /** Ya salió el aviso al salón, para no mandar tres seguidos. */
  protected readonly told = computed(() => this.calls.waitingFor().has('BILL'));

  /**
   * Avisa que la mesa va a pagar, con qué medio.
   *
   * El mozo ve el pedido y sabe si llevar el posnet. Cerrar la cuenta es
   * después, y del lado del local: el teléfono del comensal no puede dar por
   * cobrada una cuenta — antes podía, y bastaba con tocar un botón.
   */
  protected async tell(method: PaymentMethod): Promise<void> {
    const id = this.sessionId();
    if (id === null) return;

    const done = await this.calls.raise(id, 'BILL', '', method);
    if (done) this.confirming.set(false);
  }

  protected async openBill(): Promise<void> {
    const id = this.sessionId();
    if (id === null) return;

    await this.store.close(id);
    this.parts.set(this.store.bill()?.participants.length ?? 2);
    this.recompute();
  }

  /** Quién paga, cuando paga uno solo. */
  protected readonly payerId = signal<string | null>(null);

  /** Los platos que todavía no tienen a nadie asignado. */
  protected readonly faltanAsignar = computed(() => {
    const bill = this.store.bill();
    if (bill === null || this.splitKind() !== 'BY_ITEM') return 0;

    const asignados = this.assignments();
    return bill.lines.filter((line) => (asignados.get(line.id) ?? []).length === 0).length;
  });

  /**
   * Si se puede avisar al mozo.
   *
   * Una división a medio hacer no es una cuenta: el mozo llegaría a cobrar algo
   * que el servidor nunca calculó. Las formas que no necesitan que nadie elija
   * nada —partes iguales, cada uno lo suyo— están listas siempre.
   */
  protected readonly listoParaPagar = computed(() => {
    switch (this.splitKind()) {
      case 'SINGLE_PAYER': {
        // Que siga en la mesa, no sólo que se haya elegido: si se fue después
        // de que lo eligieran, el servidor rechaza el id y el botón quedaría
        // habilitado prometiendo algo que no se puede calcular.
        const elegido = this.payerId();
        const participants = this.store.bill()?.participants ?? [];
        return elegido !== null && participants.some((person) => person.id === elegido);
      }
      case 'BY_ITEM':
        return this.faltanAsignar() === 0;
      default:
        return true;
    }
  });

  /** Por qué el botón está apagado. Sin esto quedaba gris sin motivo. */
  protected readonly queFalta = computed(() => {
    if (this.listoParaPagar()) return null;

    return this.splitKind() === 'SINGLE_PAYER'
      ? 'Elegí quién paga para poder avisar'
      : 'Asigná todo para poder avisar';
  });

  protected estaAsignado(lineId: string): boolean {
    return (this.assignments().get(lineId) ?? []).length > 0;
  }

  protected choosePayer(id: string): void {
    this.payerId.set(id);
    this.recompute();
  }

  /**
   * Cuánto descuenta el local por pagar en efectivo.
   *
   * Cualquier problema lo deja en cero, que apaga la sección entera: es mejor
   * no ofrecer un descuento que ofrecer uno que después no se aplica.
   */
  private async cargarDescuento(): Promise<void> {
    try {
      const respuesta = await this.api.fetch('/ajustes/publicos');
      if (!respuesta.ok) return;

      const ajustes = (await respuesta.json()) as {
        descuentoEfectivo: number;
        resenaUrl: string | null;
      };
      this.descuentoOfrecido.set(ajustes.descuentoEfectivo);
      this.resenaUrl.set(ajustes.resenaUrl);
    } catch {
      // Queda en cero.
    }
  }

  protected chooseSplit(kind: SplitKind): void {
    this.splitKind.set(kind);

    // Quien eligió "paga una persona" sin decir quién se queda mirando un
    // botón apagado: si hay una sola persona en la mesa, no hay nada que
    // preguntar. Con más de una, la elige el comensal.
    if (kind === 'SINGLE_PAYER' && this.payerId() === null) {
      const participants = this.store.bill()?.participants ?? [];
      if (participants.length === 1) {
        this.payerId.set(participants[0]?.id ?? null);
      }
    }

    this.recompute();
  }

  protected changeParts(delta: number): void {
    this.parts.update((current) => Math.max(1, current + delta));
    this.recompute();
  }

  protected chooseTip(option: { label: string; choice: TipChoice }): void {
    this.tipLabel.set(option.label);
    this.tip = option.choice;
    this.recompute();
  }

  protected setCurrency(code: string): void {
    this.displayCurrency.set(code);
    const id = this.sessionId();
    if (id !== null) void this.store.load(id, code);
  }

  protected isAssigned(lineId: string, payerId: string): boolean {
    return (this.assignments().get(lineId) ?? []).includes(payerId);
  }

  protected toggleAssign(lineId: string, payerId: string): void {
    this.assignments.update((current) => {
      const next = new Map(current);
      const existing = next.get(lineId) ?? [];
      next.set(
        lineId,
        existing.includes(payerId)
          ? existing.filter((id) => id !== payerId)
          : [...existing, payerId],
      );
      return next;
    });
    this.recompute();
  }

  private recompute(): void {
    const id = this.sessionId();
    if (id === null || this.store.bill() === null) return;

    // Sin todo elegido no se pide el cálculo: el servidor devolvería
    // UNASSIGNED_LINES en cada toque y la pantalla se llenaría de un error
    // rojo mientras el comensal todavía está asignando. Lo que falta ya lo
    // dice, en gris, al lado de los platos.
    if (!this.listoParaPagar()) {
      this.store.clearSplit();
      return;
    }

    const assignments =
      this.splitKind() === 'BY_ITEM'
        ? [...this.assignments().entries()]
            .filter(([, payerIds]) => payerIds.length > 0)
            .map(([lineId, payerIds]) => ({ lineId, payerIds }))
        : undefined;

    void this.store.computeSplit(
      id,
      this.splitKind(),
      this.tip,
      this.parts(),
      assignments,
      this.payerId() ?? undefined,
      this.medioElegido() ?? undefined,
    );
  }

  protected money(amount: MoneyDto): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: amount.currency,
      maximumFractionDigits: amount.currency === 'ARS' ? 0 : 2,
    }).format(amount.amountInMinorUnits / 100);
  }

  protected format(unit: MoneyDto, quantity: number): string {
    return this.money({ ...unit, amountInMinorUnits: unit.amountInMinorUnits * quantity });
  }

  protected color(index: number): string {
    return DINER_PALETTE[index % DINER_PALETTE.length] ?? DINER_PALETTE[0];
  }
}
