import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiClient } from './api-client';
import { SessionStore } from './session.store';

/**
 * Covers the screen when the table stops being usable.
 *
 * A full takeover rather than a banner: both cases are terminal, and leaving
 * the cart tappable underneath invites someone to keep ordering into a table
 * that will reject every request.
 */
@Component({
  selector: 'itd-table-blocked',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .screen {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      padding: 2rem 1.75rem calc(2rem + env(safe-area-inset-bottom));
      text-align: center;
      background: var(--itadaki-surface);
    }
    .mark {
      font-size: 2.4rem;
      line-height: 1;
      margin-bottom: 0.2rem;
    }
    .title {
      font-family: var(--itadaki-font-display);
      font-weight: 800;
      font-size: 1.35rem;
      color: var(--itadaki-ink-strong);
      margin: 0;
      letter-spacing: -0.4px;
    }
    .cta {
      margin-top: 0.9rem;
      border: none;
      border-radius: var(--itadaki-radius-pill);
      background: var(--itadaki-ink);
      color: white;
      padding: 0.9rem 1.6rem;
      font-family: var(--itadaki-font-display);
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      min-height: 48px;
    }
    .lede {
      font-size: 0.9rem;
      color: var(--itadaki-ink-subtle);
      margin: 0;
      max-width: 30ch;
      line-height: 1.5;
    }
    /* La reseña primero y el "empezar de nuevo" después: es lo que le pedimos
       a alguien que ya terminó y está por guardar el teléfono. */
    .resena {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      margin-top: 1.1rem;
      border-radius: var(--itadaki-radius-pill);
      background: var(--itadaki-accent);
      color: white;
      padding: 0.9rem 1.6rem;
      font-family: var(--itadaki-font-display);
      font-size: 0.9rem;
      font-weight: 600;
      text-decoration: none;
      min-height: 48px;
    }
    .resena-nota {
      margin: 0.5rem 0 0;
      font-size: 0.78rem;
      color: var(--itadaki-ink-subtle);
    }
    /* Con contorno y no como texto suelto: en tono menor se dejaba de leer
       como algo que se puede tocar. Vacío contra el lleno de la reseña, que
       es lo que se quiere primero. */
    .despues {
      margin-top: 0.8rem;
      background: none;
      color: var(--itadaki-ink);
      border: 1px solid var(--itadaki-border);
      border-radius: var(--itadaki-radius-pill);
      padding: 0.75rem 1.4rem;
      font-family: var(--itadaki-font-display);
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      min-height: 44px;
    }

    .despues:hover {
      border-color: var(--itadaki-ink);
    }
  `],
  template: `
    @if (api.blocked(); as reason) {
      <div class="screen" role="alert">
        @if (reason === 'SESSION_CLOSED') {
          <span class="mark" aria-hidden="true">🍽️</span>
          <h1 class="title">Gochisousama!</h1>
          <p class="lede">
            La cuenta de esta mesa ya se cerró. Gracias por venir.
          </p>
          <!-- Acá y no en la cuenta: al cobrar, al comensal lo sacan de la
               cuenta y lo dejan en esta pantalla. El pedido de reseña vivía en
               la otra, así que no lo veía nunca. -->
          @if (resenaUrl(); as url) {
            <a class="resena" [href]="url" target="_blank" rel="noopener" (click)="contarResena()">
              ⭐ Dejanos tu opinión en Google
            </a>
            <p class="resena-nota">Nos ayuda muchísimo · tarda menos de un minuto</p>
          }

          <!-- Quien se queda a un café vuelve a sentarse en un toque: la mesa
               sigue siendo la misma, sólo cambió de visita. La sesión anterior
               —y su cuenta ya cobrada— no se toca; se arma una nueva y vacía. -->
          @if (session.lastNickname(); as nombre) {
            <button type="button" class="cta" (click)="seguirPidiendo()" [disabled]="volviendo()">
              {{ volviendo() ? 'Un momento…' : 'Pedir algo más, ' + nombre }}
            </button>
            <button type="button" class="despues" (click)="startOver()">Listo, gracias</button>
          } @else {
            <button type="button" class="cta" (click)="startOver()">
              Empezar de nuevo
            </button>
          }
        } @else {
          <span class="mark" aria-hidden="true">📷</span>
          <h1 class="title">Escaneá de nuevo</h1>
          <p class="lede">
            El código de tu mesa venció. Escaneá el QR otra vez para seguir
            pidiendo — no perdés nada de lo que ya enviaste.
          </p>
          <button type="button" class="cta" (click)="startOver()">
            Volver al inicio
          </button>
        }
      </div>
    }
  `,
})
export class TableBlockedComponent {
  protected readonly api = inject(ApiClient);
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  /** Dónde deja la reseña, o null si el local no las pide. */
  protected readonly resenaUrl = signal<string | null>(null);
  private yaPreguntado = false;

  /** Mientras se arma la sesión nueva, para no tocar el botón dos veces. */
  protected readonly volviendo = signal(false);

  /*
   * Se pide recién cuando la mesa se cerró.
   *
   * El token del QR sigue valiendo aunque la sesión haya terminado —resuelve
   * la mesa, no la sesión— así que desde acá todavía se puede preguntar y
   * contar. Antes no: la pantalla no existía todavía y nadie sabía si iba a
   * hacer falta.
   */
  private readonly buscarElLink = effect(() => {
    if (this.api.blocked() !== 'SESSION_CLOSED' || this.yaPreguntado) return;
    this.yaPreguntado = true;
    void this.cargarResena();
  });

  private async cargarResena(): Promise<void> {
    try {
      const respuesta = await this.api.fetch('/ajustes/publicos');
      if (!respuesta.ok) return;

      const ajustes = (await respuesta.json()) as { resenaUrl: string | null };
      if (ajustes.resenaUrl === null) return;

      this.resenaUrl.set(ajustes.resenaUrl);
      // Se ofreció de verdad: recién acá aparece en pantalla.
      void this.api.send('/ajustes/resenas/ofrecida', 'PATCH', {});
    } catch {
      // Sin link no se ofrece nada, que es lo mismo que hacía antes.
    }
  }

  /** El link ya se está abriendo; no se hace esperar a nadie por esto. */
  protected contarResena(): void {
    void this.api.send('/ajustes/resenas/tocada', 'PATCH', {});
  }

  /**
   * Clears the finished table and goes back to the start.
   *
   * Without this the screen is a dead end: the stored session keeps restoring
   * on every reload, and the only escape is clearing site data by hand.
   */
  protected startOver(): void {
    this.session.forget();
    void this.router.navigate(['/bienvenida']);
  }

  /**
   * Vuelve a sentarse en la misma mesa con el mismo nombre, para pedir algo
   * más después de haber pagado.
   *
   * Si falla —el token de la mesa venció mientras tanto, por ejemplo— cae al
   * camino de siempre en vez de dejar el botón sin efecto.
   */
  protected async seguirPidiendo(): Promise<void> {
    this.volviendo.set(true);
    const entro = await this.session.resumeAtTable();
    this.volviendo.set(false);

    if (entro) {
      void this.router.navigate(['/carta']);
    } else {
      this.startOver();
    }
  }
}
