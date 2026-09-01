import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  DestroyRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  TRACKING_STEPS,
  type EstadoDeLaEspera,
  estadoDeLaEspera,
  minutosEsperando,
  redondearEspera,
  trackingStepOf,
  type OrderStatus,
} from '@itadaki/ordering/domain';
import { ApiClient } from './api-client';
import { BackLinkComponent } from './back-link.component';
import { CallStore } from './call.store';
import { medirElPie } from './medir-el-pie';
import { SessionStore } from './session.store';
import { TrackingStore, type TrackedOrder } from './tracking.store';

const STEP_LABELS: Record<string, { title: string; hint: string }> = {
  SENT: { title: 'Pedido enviado', hint: 'la cocina ya lo recibió' },
  ACCEPTED: { title: 'Confirmado', hint: 'lo tienen anotado' },
  IN_PREP: { title: 'En cocina', hint: 'lo están preparando' },
  READY: { title: 'Listo', hint: 'sale para tu mesa' },
};

@Component({
  selector: 'itd-tracking',
  standalone: true,
  imports: [RouterLink, BackLinkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './tracking.page.css',
  template: `
    <header class="pad">
      <!-- La mesa arriba a la derecha, en su rincón: es dónde estás sentado,
           no de qué trata la pantalla. "Estado" sobraba — el título y la línea
           de tiempo ya lo dicen. -->
      <!-- Volver y la cuenta en la misma fila, como en el carrito: son las
           dos salidas de esta pantalla, una hacia atrás y otra hacia el final. -->
      <div class="head-row">
        <itd-back to="/carta" />
        <a class="ir-a-la-cuenta" routerLink="/cuenta">Ver la cuenta →</a>
      </div>

      <!-- La mesa como título: "Itadakimasu!" es lindo pero no dice nada que
           la persona necesite mientras espera su comida, y ocupaba el lugar
           más visible de la pantalla. -->
      <h1 class="title">
        @if (session.tableLabel(); as mesa) { Mesa {{ mesa }} } @else { Tu pedido }
        @if (session.connected()) {
          <span class="live"><span class="live-dot" aria-hidden="true"></span>En vivo</span>
        }
      </h1>
    </header>

    @if (store.hasOrders()) {
      <main class="body">
        <!-- Un estado para todo el pedido, y el detalle por plato debajo.
             Una línea de tiempo completa por plato convertía una mesa de
             cinco platos en una pantalla larguísima donde no se entendía
             cómo venía el pedido en conjunto. -->
        <section class="card">
          <ol class="timeline">
            @for (step of steps; track step; let index = $index) {
              <li
                class="rung"
                [class.done]="index < overallStep()"
                [class.active]="index === overallStep()"
                [attr.aria-current]="index === overallStep() ? 'step' : null"
              >
                <span class="dot" aria-hidden="true"></span>
                <span class="rung-text">
                  <span class="rung-title">{{ label(step).title }}</span>
                  <span class="rung-hint">{{ label(step).hint }}</span>
                </span>
              </li>
            }
          </ol>

          <!-- Cuánto suele tardar acá.
               Sale de lo que este local tardó de verdad las últimas dos
               semanas, no de un número configurado: el dueño pondría el que
               le gustaría tener, y la mesa lo leería como una promesa rota
               cada noche ocupada. Sin historial suficiente no se dice nada. -->
          @if (espera(); as e) {
            @if (e.kind === 'EN_HORA') {
              <p class="espera" role="status">
                Acá suelen tardar unos {{ redondear(e.habitualMinutos) }} minutos
              </p>
            } @else if (e.kind === 'DEMORADO') {
              <!-- No una cuenta regresiva: contar los minutos de más convierte
                   cada uno en una falta. Se dice una vez y se ofrece hacer
                   algo, que es lo que la mesa quiere a esa altura. -->
              <div class="demorado" role="status">
                <p class="demorado-texto">
                  Está tardando más de lo habitual. Ya podés preguntarle al mozo.
                </p>
                <button type="button" class="demorado-cta" (click)="llamarAlMozo()">
                  Llamar al mozo
                </button>
              </div>
            }
          }

          @if (readyCount() > 0 && readyCount() < dishes().length) {
            <p class="partial" role="status">
              {{ readyCount() }} de {{ dishes().length }} ya salieron
            </p>
          }
        </section>

        <section class="card">
          <h2 class="dishes-title">Tu pedido</h2>
          <ul class="dishes">
            @for (dish of dishes(); track dish.key) {
              <li class="dish" [attr.data-status]="dish.status">
                <span class="dish-qty">{{ dish.quantity }}</span>
                <span class="dish-name">{{ dish.name }}</span>
                <span class="dish-state">{{ dishState(dish.status) }}</span>
              </li>
            }
          </ul>
        </section>

        @for (order of store.cancelled(); track order.id) {
          <section class="card cancelled">
            <h2 class="card-title">Pedido cancelado</h2>
            <p class="items">{{ itemSummary(order) }}</p>
            <p class="cancel-note">Hablá con el mozo si fue un error</p>
          </section>
        }

        @if (!store.allDelivered() && store.minutesRemaining() > 0) {
          <section class="card eta">
            <span class="eta-label">Llega en aproximadamente</span>
            <span class="eta-value">{{ store.minutesRemaining() }} min</span>
          </section>
        }
      </main>

      <footer class="foot" #pie>
        <a class="cta cta-link" routerLink="/carta">Seguir pidiendo</a>
      </footer>
    } @else {
      <!-- "No mandaste nada" solo cuando el servidor ya contesto.
           Antes bastaba con que la carga terminara, sin importar si habia
           funcionado: si el token de la mesa todavia no habia llegado, la
           pantalla afirmaba que no habia pedidos mientras el plato ya estaba
           en la cocina. Mientras no se sepa, se espera. -->
      <main class="body empty">
        @if (store.loaded()) {
          <p class="muted">Todavía no mandaste ningún pedido.</p>
          <a class="cta cta-link" routerLink="/carta">Ver la carta →</a>
        } @else {
          <p class="muted">Buscando tu pedido…</p>
        }
      </main>
    }
  `,
})
export class TrackingPage {
  protected readonly store = inject(TrackingStore);
  protected readonly session = inject(SessionStore);

  private readonly pie = viewChild<ElementRef<HTMLElement>>('pie');

  constructor() {
    // El pie pasó a tener dos botones: sin medirlo, el timbre se para encima
    // del segundo.
    medirElPie(this.pie);

    void this.cargarHabitual();

    // Cada minuto: es la resolución de lo que se muestra, y más seguido sería
    // despertar la pantalla para recalcular el mismo texto.
    const reloj = setInterval(() => this.ahora.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  protected readonly steps = TRACKING_STEPS;

  private readonly api = inject(ApiClient);
  private readonly calls = inject(CallStore);

  /** Cuánto tarda este local y sobre cuántos pedidos se midió. */
  private readonly habitual = signal<{ minutos: number | null; medidos: number }>({
    minutos: null,
    medidos: 0,
  });

  /**
   * Un reloj propio para que el texto cambie solo.
   *
   * Sin esto, la mesa que deja la pantalla abierta sigue viendo "en hora"
   * media hora después de que dejó de estarlo: los datos del pedido no
   * cambian mientras la cocina no lo toque, así que nada volvería a
   * calcular la espera.
   */
  private readonly ahora = signal(new Date());

  /**
   * En qué estado está la espera de la mesa.
   *
   * Se mide desde el plato que se pidió primero y sigue sin llegar: es el que
   * lleva esperando más, y el que hace que la mesa mire el reloj.
   */
  protected readonly espera = computed<EstadoDeLaEspera | null>(() => {
    const pendientes = this.dishes().filter((dish) => dish.status !== 'DELIVERED');
    if (pendientes.length === 0) return null;

    const masViejo = pendientes
      .map((dish) => dish.pedidoEn)
      .filter((fecha): fecha is Date => fecha !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    if (masViejo === undefined) return null;

    const { minutos, medidos } = this.habitual();
    return estadoDeLaEspera({
      habitualMinutos: minutos,
      pedidosMedidos: medidos,
      esperandoMinutos: minutosEsperando(masViejo, this.ahora()),
    });
  });

  protected readonly redondear = redondearEspera;

  /**
   * Llama al mozo por la demora.
   *
   * El mismo llamado que el timbre: la cocina no necesita otro canal, y para
   * el mozo es la misma mesa levantando la mano.
   */
  protected async llamarAlMozo(): Promise<void> {
    const sessionId = this.session.session()?.id;
    if (sessionId === undefined) return;

    await this.calls.raise(sessionId, 'WAITER', 'La mesa pregunta por su pedido');
  }

  /**
   * Cuánto tarda la cocina de este local.
   *
   * Un fallo lo deja en nulo y la pantalla no dice nada, que es lo mismo que
   * hace un local sin historial: no decir nada es mejor que estimar mal algo
   * que la mesa va a usar para decidir si sigue esperando.
   */
  private async cargarHabitual(): Promise<void> {
    try {
      const respuesta = await this.api.fetch('/ajustes/publicos');
      if (!respuesta.ok) return;

      const ajustes = (await respuesta.json()) as {
        habitualMinutos: number | null;
        pedidosMedidos: number;
      };
      this.habitual.set({ minutos: ajustes.habitualMinutos, medidos: ajustes.pedidosMedidos });
    } catch {
      // Queda en nulo y no se muestra estimación.
    }
  }

  // Cargar y seguir el socket es cosa del store, que lo hace para toda la
  // mesa: si dependiera de esta pantalla, sólo sabría del pedido quien la
  // hubiera abierto.

  /**
   * Every dish the table is waiting on, each with its own progress.
   *
   * Flattened across orders: a diner thinks in dishes, not in the batches they
   * happened to be sent in.
   */
  protected readonly dishes = computed(() =>
    this.store.active().flatMap((order) =>
      order.items.map((item) => ({
        key: `${order.id}:${item.id}`,
        name: item.name,
        quantity: item.quantity,
        status: item.status,
        step: trackingStepOf(item.status as OrderStatus),
        placedAt: this.placedAt(order),
        // La fecha cruda: la de arriba ya es el texto que se muestra.
        pedidoEn: order.placedAt === null ? null : new Date(order.placedAt),
      })),
    ),
  );

  /**
   * En qué paso está el pedido en conjunto: el del plato más atrasado.
   *
   * Es lo que la mesa quiere saber de un vistazo — "¿ya viene?" — sin tener
   * que leer el estado de cada plato uno por uno.
   */
  protected readonly overallStep = computed(() => {
    const pasos = this.dishes().map((dish) => dish.step);
    return pasos.length === 0 ? 0 : Math.min(...pasos);
  });

  /** Cuántos platos ya salieron de la cocina, para el "2 de 5". */
  protected readonly readyCount = computed(
    () => this.dishes().filter((dish) => dish.status === 'READY' || dish.status === 'DELIVERED').length,
  );

  /** El estado de un plato en dos palabras, al lado de su nombre. */
  protected dishState(status: string): string {
    if (status === 'DELIVERED') return 'servido';
    if (status === 'READY') return 'ya sale';
    if (status === 'IN_PREP') return 'preparando';
    if (status === 'ACCEPTED') return 'en cola';
    return 'enviado';
  }

  protected label(step: string): { title: string; hint: string } {
    return STEP_LABELS[step] ?? { title: step, hint: '' };
  }

  protected itemSummary(order: TrackedOrder): string {
    return order.items.map((item) => `${item.quantity}× ${item.name}`).join(' · ');
  }

  protected placedAt(order: TrackedOrder): string | null {
    if (order.placedAt === null) return null;
    return new Intl.DateTimeFormat('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(order.placedAt));
  }
}
