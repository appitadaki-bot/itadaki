import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TRACKING_STEPS, trackingStepOf, type OrderStatus } from '@itadaki/ordering/domain';
import { BackLinkComponent } from './back-link.component';
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
      <itd-back to="/carta" label="La carta" />
      <p class="eyebrow">
        @if (session.tableLabel(); as mesa) { mesa {{ mesa }} · }estado
        @if (session.connected()) {
          <span class="live"><span class="live-dot" aria-hidden="true"></span>En vivo</span>
        }
      </p>
      <h1 class="title">Itadakimasu!</h1>
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

      <footer class="foot">
        <a class="cta cta-link" routerLink="/carta">Seguir pidiendo</a>
        <a class="link" routerLink="/cuenta">Ver la cuenta →</a>
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

  protected readonly steps = TRACKING_STEPS;

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
