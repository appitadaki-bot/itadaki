import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type PaymentMethod } from '@itadaki/ordering/domain';
import { DINER_PALETTE } from '@itadaki/shared/ui-tokens';
import { BackLinkComponent } from './back-link.component';
import { PaymentSheetComponent } from './payment-sheet.component';
import { CallStore } from './call.store';
import { BillStore, type MoneyDto, type SplitKind, type TipChoice } from './bill.store';
import { SessionStore } from './session.store';

// Primera la de uno solo: es la forma más común de cerrar una mesa —el que
// invita, el que junta el efectivo y pone la tarjeta— y era la única que no
// se podía elegir. Después las que dividen, de la más simple a la más fina.
const SPLIT_LABELS: ReadonlyArray<{ kind: SplitKind; label: string; hint: string }> = [
  { kind: 'SINGLE_PAYER', label: 'Paga una persona', hint: 'uno se hace cargo de todo' },
  { kind: 'BY_DINER', label: 'Cada uno lo suyo', hint: 'pagás lo que pediste' },
  { kind: 'EQUAL', label: 'Partes iguales', hint: 'el total dividido' },
  { kind: 'BY_ITEM', label: 'Por plato', hint: 'elegís quién paga qué' },
];

const TIP_OPTIONS: ReadonlyArray<{ label: string; choice: TipChoice }> = [
  { label: 'Sin propina', choice: { kind: 'NONE' } },
  { label: '5%', choice: { kind: 'PERCENTAGE', percent: 0.05 } },
  { label: '10%', choice: { kind: 'PERCENTAGE', percent: 0.1 } },
  { label: '15%', choice: { kind: 'PERCENTAGE', percent: 0.15 } },
  { label: '20%', choice: { kind: 'PERCENTAGE', percent: 0.2 } },
];

const CURRENCIES = ['ARS', 'USD', 'EUR', 'BRL'] as const;


@Component({
  selector: 'itd-bill',
  standalone: true,
  imports: [RouterLink, BackLinkComponent, PaymentSheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './bill.page.css',
  template: `
    <header class="pad">
      <itd-back to="/carta" label="la carta" />
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
              Tocá quién paga cada plato. Si lo compartieron, marcá a todos y se
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
                plato{{ faltanAsignar() > 1 ? 's' : '' }} por asignar
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

      <footer class="foot">
        @if (bill.status === 'SETTLED') {
          <p class="settled" role="status">Cuenta cerrada · gracias!</p>
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

  protected readonly splitOptions = SPLIT_LABELS;
  protected readonly tipOptions = TIP_OPTIONS;
  protected readonly currencies = CURRENCIES;

  protected readonly splitKind = signal<SplitKind>('BY_DINER');
  protected readonly parts = signal(2);
  protected readonly tipLabel = signal('Sin propina');
  protected readonly displayCurrency = signal<string>('ARS');
  private readonly assignments = signal<ReadonlyMap<string, readonly string[]>>(new Map());

  private tip: TipChoice = { kind: 'NONE' };

  protected readonly sessionId = computed(() => this.session.session()?.id ?? null);

  constructor() {
    const id = this.session.session()?.id;
    if (id === undefined) return;

    // Opening this screen *is* asking for the bill — a diner who tapped "ver la
    // cuenta" should not land on a second button that says the same thing.
    // Raising one is idempotent server-side, so an existing bill comes back
    // unchanged rather than being reissued.
    void this.store.close(id).then(() => {
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
      : 'Asigná todos los platos para poder avisar';
  });

  protected estaAsignado(lineId: string): boolean {
    return (this.assignments().get(lineId) ?? []).length > 0;
  }

  protected choosePayer(id: string): void {
    this.payerId.set(id);
    this.recompute();
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
