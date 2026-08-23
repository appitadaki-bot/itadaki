import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { goBack } from './back';

/**
 * Volver, sin pelearse con el historial.
 *
 * Hasta ahora sólo la ficha de un plato tenía cómo volver: en el carrito, el
 * estado y la cuenta había que usar el botón del navegador o el gesto del
 * teléfono, que en una PWA agregada al inicio ni siquiera están a la vista.
 *
 * Vuelve con `Location.back()` cuando ya hay historial propio, y recién si no
 * lo hay navega a la pantalla padre. Un `routerLink` fijo era lo simple, pero
 * apila una entrada nueva: el usuario tocaba "volver", después atrás del
 * navegador, y regresaba a la pantalla de la que acababa de salir. Así el
 * botón de la app y el del navegador hacen exactamente lo mismo.
 */
@Component({
  selector: 'itd-back',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="itd-back" [attr.aria-label]="'Volver a ' + label()" (click)="back()">
      <span class="itd-back-arrow" aria-hidden="true">←</span>
      <span class="itd-back-text">{{ label() }}</span>
    </button>
  `,
  styles: `
    /*
     * Volver, con forma de botón.
     *
     * Antes era una flecha gris del mismo tono que el texto de ayuda: se leía
     * como una etiqueta y no como algo que se toca, y en el teléfono agregado
     * al inicio no hay botón del navegador que lo reemplace. Ahora tiene
     * fondo, borde y aire propio — la misma píldora del resto de la app.
     */
    .itd-back {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      margin: 0 0 0.75rem;
      padding: 0.5rem 0.95rem 0.5rem 0.75rem;
      min-height: 40px;
      border: 1px solid var(--itadaki-accent-line);
      border-radius: var(--itadaki-radius-pill);
      background: var(--itadaki-accent-tint);
      font-family: var(--itadaki-font-display);
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--itadaki-accent-deep);
      cursor: pointer;
      transition:
        color var(--itadaki-quick) var(--itadaki-ease),
        background var(--itadaki-quick) var(--itadaki-ease),
        border-color var(--itadaki-quick) var(--itadaki-ease),
        box-shadow var(--itadaki-smooth) var(--itadaki-ease),
        transform var(--itadaki-quick) var(--itadaki-ease);
    }

    .itd-back-arrow {
      font-size: 1rem;
      line-height: 1;
      transition: transform var(--itadaki-smooth) var(--itadaki-ease-out);
    }

    /* La flecha se corre hacia donde lleva: dice a dónde va antes de tocarla. */
    @media (hover: hover) {
      .itd-back:hover {
        background: var(--itadaki-accent-tint-strong);
        border-color: var(--itadaki-accent);
        box-shadow: 0 4px 12px oklch(50% 0.17 33 / 0.12);
      }

      .itd-back:hover .itd-back-arrow {
        transform: translateX(-3px);
      }
    }

    .itd-back:active {
      transform: scale(0.97);
    }

    .itd-back:active .itd-back-arrow {
      transform: translateX(-3px);
    }

    @media (prefers-reduced-motion: reduce) {
      .itd-back,
      .itd-back-arrow {
        transition: none;
      }
    }
  `,
})
export class BackLinkComponent {
  /** A dónde volver cuando no hay historial: entrar por QR abre la app acá. */
  readonly to = input.required<string>();

  /** Cómo se llama esa pantalla, para que el botón diga a dónde lleva. */
  readonly label = input.required<string>();

  private readonly location = inject(Location);
  private readonly router = inject(Router);

  protected back(): void {
    goBack(this.location, this.router, this.to());
  }
}
