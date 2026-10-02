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
      <div class="centro">
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

        <!-- El nombre del local es el título, y no un renglón adentro de una
             frase. El comensal entró a un restaurante, no a un sistema: ésta es
             la única pantalla donde el lugar puede parecer suyo, y el saludo en
             japonés —que es nuestro, no de él— le estaba ocupando el lugar.

             Sin token de mesa —alguien que abre la app sin escanear— no hay
             local que nombrar. Ahí el saludo vuelve a ser el título, porque una
             pantalla sin título se ve rota. -->
        @if (nombre(); as local) {
          <p class="saludo">Itadakimasu!</p>
          <h1 class="local">{{ local }}</h1>
        } @else {
          <h1 class="greeting">Itadakimasu!</h1>
        }

        <p class="lede">Tu mesa ya está lista. Armá tu pedido cuando quieras.</p>

        <a class="cta" routerLink="/unirse">Ingresar →</a>

        <div class="dots" aria-hidden="true">
          <span class="dot d1"></span>
          <span class="dot d2"></span>
          <span class="dot d3"></span>
        </div>
      </div>

      <!-- La marca, al pie y sobre oscuro.
           El archivo del logo es crema sobre fondo oscuro —es el de la
           landing, que es marrón— así que sobre el crema de esta pantalla la
           palabra desaparecería. La barra es lo que lo hace legible, y de paso
           lo saca de la zona del restaurante: arriba el local, acá nosotros. -->
      <footer class="marca">
        <img src="itadaki-logo.png" alt="Itadaki" width="440" height="93" />
        <span>pedí y pagá desde tu teléfono</span>
      </footer>
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
