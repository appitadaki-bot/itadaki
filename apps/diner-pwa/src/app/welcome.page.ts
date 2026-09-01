import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiClient } from './api-client';
import { SessionStore } from './session.store';

@Component({
  selector: 'itd-welcome',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './welcome.page.css',
  template: `
    <main class="welcome">
      <div class="bowl" aria-hidden="true">
        <span class="steam s1"></span>
        <span class="steam s2"></span>
        <span class="steam s3"></span>
      </div>

      <!-- Con sesión guardada — alguien que ya se unió y reabre la app — se
           dice la mesa. Antes de escanear el QR no se sabe cuál es, y un
           número inventado en la primera pantalla es el peor lugar para uno. -->
      <p class="table">
        @if (session.tableLabel(); as mesa) { mesa {{ mesa }} } @else { tu mesa }
      </p>
      <h1 class="greeting">Itadakimasu!</h1>
      <!-- Con el nombre del local cuando se sabe: el comensal entró a un
           restaurante, no a un sistema, y saludarlo con nuestra marca le habla
           de algo que no eligió ver. Sin token de mesa —alguien que abre la app
           sin escanear— no hay local que nombrar, y ahí se saluda sin nombre. -->
      <p class="lede">
        @if (nombre(); as local) {
          Bienvenido a {{ local }}. Tu mesa ya está lista — armá tu pedido cuando quieras.
        } @else {
          Tu mesa ya está lista — armá tu pedido cuando quieras.
        }
      </p>

      <a class="cta" routerLink="/unirse">Ver la carta →</a>

      <div class="dots" aria-hidden="true">
        <span class="dot d1"></span>
        <span class="dot d2"></span>
        <span class="dot d3"></span>
      </div>
    </main>
  `,
})
export class WelcomePage {
  protected readonly session = inject(SessionStore);
  private readonly api = inject(ApiClient);

  /** Cómo se llama el restaurante, cuando el token de la mesa deja saberlo. */
  protected readonly nombre = signal<string | null>(null);

  constructor() {
    void this.cargarNombre();
  }

  /**
   * Pide el nombre del local.
   *
   * Un fallo lo deja en nulo y el saludo va sin nombre: es exactamente lo que
   * pasa cuando alguien abre la app sin haber escaneado, así que no hace falta
   * un caso aparte. Nunca un error en pantalla — la bienvenida es lo primero
   * que se ve, y no es lugar para contarle un problema a nadie.
   */
  private async cargarNombre(): Promise<void> {
    try {
      const respuesta = await this.api.fetch('/ajustes/publicos');
      if (!respuesta.ok) return;

      const ajustes = (await respuesta.json()) as { nombre: string | null };
      this.nombre.set(ajustes.nombre);
    } catch {
      // Queda sin nombre.
    }
  }
}
