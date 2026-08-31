import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { type CallReason } from '@itadaki/ordering/domain';
import { CallStore } from './call.store';
import { SessionStore } from './session.store';

const OPTIONS: ReadonlyArray<{ reason: CallReason; label: string; hint: string }> = [
  { reason: 'WAITER', label: 'Llamar al mozo', hint: 'Alguien se acerca a la mesa' },
  { reason: 'BILL', label: 'Ver la cuenta', hint: 'El total, y cómo la dividen' },
  { reason: 'QUESTION', label: 'Tengo una duda', hint: 'Sobre algo de la carta' },
];


/** A qué borde se pega, y a qué altura sobre el piso de la pantalla. */
interface Placement {
  readonly side: 'left' | 'right';
  readonly bottom: number;
}

const STORAGE_KEY = 'itadaki.call-button.placement';

/** Separación del borde, la misma que tenía fijada en el CSS. */
const EDGE = 16;

/** Debajo de esto el gesto sigue siendo un toque, no un arrastre. */
const DRAG_THRESHOLD = 8;

/** Deja siempre el botón entero dentro de la pantalla, con aire arriba y abajo. */
const MIN_BOTTOM = 12;
const FAB_SIZE = 52;

function clampBottom(bottom: number): number {
  const top = globalThis.innerHeight - FAB_SIZE - MIN_BOTTOM;
  return Math.max(MIN_BOTTOM, Math.min(bottom, top));
}

/**
 * Dónde lo dejó la última vez.
 *
 * Se guarda porque mover el timbre es una decisión sobre la mesa, no sobre la
 * pantalla: quien lo corrió porque le tapaba la carta no quiere volver a
 * correrlo al pasar al carrito.
 */
function readPlacement(): Placement | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw === null || raw === undefined) return null;

    const parsed = JSON.parse(raw) as Partial<Placement>;
    if (parsed.side !== 'left' && parsed.side !== 'right') return null;
    if (typeof parsed.bottom !== 'number' || !Number.isFinite(parsed.bottom)) return null;

    // La pantalla pudo cambiar de tamaño entre sesiones — o ser otro teléfono.
    return { side: parsed.side, bottom: clampBottom(parsed.bottom) };
  } catch {
    // Storage bloqueado o JSON corrupto: vuelve a la posición por defecto.
    return null;
  }
}

function savePlacement(placement: Placement): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(placement));
  } catch {
    // Modo privado en iOS. Se movió igual, sólo no sobrevive a la recarga.
  }
}

/**
 * Raising a hand, without raising a hand.
 *
 * Floating and always reachable because the moment someone needs a waiter is
 * never predictable — it is not a step in the ordering flow.
 *
 * Se puede arrastrar: la carta y el carrito tienen contenido justo debajo, y
 * un timbre fijo terminaba tapando un precio o el botón de un plato según el
 * largo de la lista. Se pega al borde más cercano en vez de quedar suelto en
 * el medio, así nunca queda flotando sobre el texto.
 */
@Component({
  selector: 'itd-call-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './call-button.component.css',
  template: `
    @if (session.isJoined()) {
      @if (open()) {
        <div class="sheet-backdrop" (click)="open.set(false)"></div>
        <div class="sheet" role="dialog" aria-label="Llamar a alguien">
          <p class="sheet-title">¿Qué necesitás?</p>

          @for (option of options; track option.reason) {
            <!-- Lo ya pedido se puede deshacer, no queda trabado: tocar el
                 timbre por error mandaba al mozo a caminar sin motivo y la
                 única salida era esperarlo para decirle que no hacía falta. -->
            <button
              type="button"
              class="option"
              [class.on]="marcada(option.reason)"
              [disabled]="calls.busy() || blocked(option.reason)"
              (click)="pedirOCancelar(option.reason)"
            >
              <span class="option-text">
                <span class="option-label">{{ option.label }}</span>
                <span class="option-hint">
                  {{ hintFor(option) }}
                </span>
              </span>
              @if (marcada(option.reason)) {
                <span class="option-tick" aria-hidden="true">✓</span>
              }
            </button>
          }

          @if (calls.error(); as message) {
            <p class="sheet-error" role="alert">{{ message }}</p>
          }

          <button type="button" class="cancel" (click)="open.set(false)">Cerrar</button>
        </div>
      }

      <button
        type="button"
        class="fab"
        [class.waiting]="anyWaiting()"
        [class.dragging]="dragging()"
        [class.moved]="placement() !== null"
        [style.left.px]="placement()?.side === 'left' ? EDGE : null"
        [style.right.px]="placement()?.side === 'right' ? EDGE : null"
        [style.bottom.px]="placement()?.bottom ?? null"
        [attr.aria-expanded]="open()"
        aria-label="Llamar a alguien. Mantené apretado y arrastrá para moverlo"
        (pointerdown)="grab($event)"
        (pointermove)="drag($event)"
        (pointerup)="drop($event)"
        (pointercancel)="drop($event)"
        (click)="tap()"
      >
        @if (anyWaiting()) {
          <span class="fab-dot" aria-hidden="true"></span>
        }
        <span aria-hidden="true">🔔</span>
      </button>
    }
  `,
})
export class CallButtonComponent {
  protected readonly calls = inject(CallStore);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionStore);

  protected readonly options = OPTIONS;
  protected readonly open = signal(false);

  protected readonly anyWaiting = computed(() => this.calls.pending().length > 0);

  /** Dónde quedó el timbre después de moverlo, o `null` si nunca lo movieron. */
  protected readonly placement = signal<Placement | null>(readPlacement());
  protected readonly dragging = signal(false);
  protected readonly EDGE = EDGE;

  /** Dónde empezó el gesto, para saber si fue un toque o un arrastre. */
  private grabbedAt: { x: number; y: number; bottom: number } | null = null;
  private moved = false;

  /**
   * Arrastrar para correrlo, tocar para abrirlo.
   *
   * Un solo botón hace las dos cosas, así que el gesto se decide por distancia:
   * hasta `DRAG_THRESHOLD` sigue siendo un toque. Sin ese margen, el temblor
   * normal de un pulgar sobre un botón de 52px cancelaba la mitad de los toques.
   */
  protected grab(event: PointerEvent): void {
    const button = event.target as HTMLElement;
    const box = button.getBoundingClientRect();

    this.grabbedAt = {
      x: event.clientX,
      y: event.clientY,
      // Desde el borde de abajo, que es como está posicionado: leerlo del DOM
      // evita tener que resolver el `calc()` con `env()` a mano.
      bottom: globalThis.innerHeight - box.bottom,
    };
    this.moved = false;
  }

  protected drag(event: PointerEvent): void {
    const start = this.grabbedAt;
    if (start === null) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!this.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

    if (!this.moved) {
      this.moved = true;
      this.dragging.set(true);
      // Sigue al dedo aunque se salga del botón, y cierra el gesto incluso si
      // el dedo termina sobre otro elemento.
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    }

    this.placement.set({
      side: event.clientX < globalThis.innerWidth / 2 ? 'left' : 'right',
      bottom: clampBottom(start.bottom - dy),
    });
  }

  protected drop(event: PointerEvent): void {
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.grabbedAt = null;

    if (this.moved) {
      this.dragging.set(false);
      const placed = this.placement();
      if (placed !== null) savePlacement(placed);
    }
  }

  /** El `click` que cierra un arrastre no debe abrir la hoja. */
  protected tap(): void {
    if (this.moved) {
      this.moved = false;
      return;
    }
    this.toggle();
  }

  protected waiting(reason: CallReason): boolean {
    return this.calls.waitingFor().has(reason);
  }

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);

    // Refresh on open: another phone at the table may have called already.
    const sessionId = this.session.session()?.id;
    if (next && sessionId !== undefined) void this.calls.load(sessionId);
  }

  /**
   * Si la mesa todavía no pidió nada, no hay cuenta que traer.
   *
   * Sin esto el mozo caminaba hasta una mesa que no consumió, y volvía con
   * las manos vacías. Los otros llamados siguen disponibles: preguntar algo
   * antes de pedir es exactamente lo que hace alguien que recién se sienta.
   */
  protected blocked(reason: CallReason): boolean {
    if (reason === 'BILL' && !this.tableHasOrdered()) return true;
    /*
     * Ver la cuenta no es un llamado: abre una pantalla.
     *
     * Por eso no la bloquea tener otro llamado abierto —mirar el total
     * mientras el mozo viene en camino es razonable— ni se ofrece "tocá para
     * cancelar", que cancelaría un aviso que esto nunca mandó.
     */
    if (reason === 'BILL') return false;
    return this.blockedByOther(reason);
  }

  /**
   * Un llamado a la vez.
   *
   * Al mozo le llegaban tres avisos de la misma mesa y no sabía cuál atender
   * primero: cada uno pide algo distinto — acercarse, traer la cuenta,
   * responder una duda — y los tres juntos no dicen qué necesita la mesa
   * ahora. El que está pedido sigue habilitado para poder destildarlo.
   */
  private blockedByOther(reason: CallReason): boolean {
    const waiting = this.calls.waitingFor();
    return waiting.size > 0 && !waiting.has(reason);
  }

  /**
   * Si esta persona todavía no se sentó, no pidió nada.
   *
   * Mirar sólo lo que consumió la mesa dejaba pedir la cuenta a quien abrió
   * el QR desde la vereda: la mesa venía comiendo de antes, así que el total
   * daba mayor a cero aunque quien tocaba el timbre no se hubiera unido.
   *
   * El carrito sin enviar no cuenta: no arma cuenta, así que pedirla llevaría
   * al mozo a una mesa sin nada que cobrar. Recién habilita cuando algo salió
   * a cocina.
   */
  private tableHasOrdered(): boolean {
    if (!this.session.isJoined()) return false;

    const state = this.session.session();
    if (state === null) return false;

    return (state.placedTotal?.amountInMinorUnits ?? 0) > 0;
  }

  /**
   * Por qué está gris.
   *
   * Un botón deshabilitado sin motivo se lee como una app rota; con el motivo
   * al lado se lee como una regla, y además dice cómo salir de ella.
   */
  /**
   * Si la opción se muestra como pedida, con su tilde.
   *
   * Ver la cuenta nunca lo está: abre una pantalla, no manda un aviso. Si
   * quedó un llamado de cuenta viejo —hecho desde la propia pantalla de la
   * cuenta— marcar acá el tilde diría que este botón hizo algo que no hizo.
   */
  protected marcada(reason: CallReason): boolean {
    return reason !== 'BILL' && this.waiting(reason);
  }

  protected hintFor(option: { reason: CallReason; hint: string }): string {
    if (option.reason === 'BILL') {
      // No es un llamado, así que ni se cancela ni la bloquea otro.
      return this.tableHasOrdered() ? option.hint : 'Todavía no pidieron nada';
    }
    if (this.waiting(option.reason)) return 'Ya avisamos · tocá para cancelar';
    if (this.blockedByOther(option.reason)) return 'Cancelá el otro llamado primero';
    return option.hint;
  }

  /**
   * Pide o cancela, según si ya está pedido.
   *
   * Un solo botón para las dos cosas: el estado se ve en el mismo lugar
   * donde se cambia, sin una segunda fila de botones de deshacer.
   */
  protected async pedirOCancelar(reason: CallReason): Promise<void> {
    if (!this.waiting(reason)) {
      await this.raise(reason);
      return;
    }

    const sessionId = this.session.session()?.id;
    if (sessionId === undefined) return;
    await this.calls.cancel(sessionId, reason);
  }

  protected async raise(reason: CallReason): Promise<void> {
    // La hoja ya deshabilita el botón, pero la regla se comprueba también acá:
    // el paso del medio para elegir cómo pagan deja abierta una hoja que
    // sobrevive a que otro teléfono de la mesa llame mientras tanto.
    if (this.blocked(reason)) return;

    /*
     * Pedir la cuenta lleva a la pantalla de la cuenta, no avisa al mozo.
     *
     * Desde acá se avisaba derecho, y eso se saltea todo lo que la mesa
     * necesita antes: ver el total, elegir cómo dividirlo y poner propina. El
     * mozo llegaba con una cuenta sola mientras la mesa todavía discutía quién
     * paga qué — que es exactamente el momento que este producto vino a
     * resolver.
     *
     * Ahí abajo está el mismo botón de pedirla, con la forma de pago, así que
     * no se pierde ningún paso: se gana el del medio.
     */
    if (reason === 'BILL') {
      this.open.set(false);
      void this.router.navigate(['/cuenta']);
      return;
    }

    const sessionId = this.session.session()?.id;
    if (sessionId === undefined) return;

    const done = await this.calls.raise(sessionId, reason);
    // Stay open on failure so the message is readable.
    if (done) setTimeout(() => this.open.set(false), 900);
  }

}
