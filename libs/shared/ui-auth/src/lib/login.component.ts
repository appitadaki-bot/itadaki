import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { AuthStore } from './auth.store';

/** Sign-in screen shared by the admin panel and the kitchen display. */
@Component({
  selector: 'itd-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './login.component.css',
  template: `
    <main class="screen">
      @if (mode() === 'reset') {
        <form class="card" (submit)="submitReset($event)">
          <header class="head">
            <p class="eyebrow">{{ context() }}</p>
            <h1 class="title">ITADAKI</h1>
            <p class="lede">Elegí tu contraseña nueva.</p>
          </header>

          <label class="field">
            <span>Contraseña nueva</span>
            <input
              type="password"
              autocomplete="new-password"
              required
              [value]="password()"
              (input)="onPassword($event)"
            />
            <small class="hint">Mínimo 8 caracteres</small>
          </label>

          <!-- Repetirla, que el alta tampoco pide pero acá importa más: el
               link vale una sola vez, así que un error de tipeo deja a alguien
               afuera de su propio restaurante con la contraseña que ya no
               recordaba y el link gastado. -->
          <label class="field">
            <span>Repetila</span>
            <input
              type="password"
              autocomplete="new-password"
              required
              [value]="repetida()"
              (input)="onRepetida($event)"
            />
          </label>

          @if (noCoinciden()) {
            <p class="error" role="alert">Las dos contraseñas tienen que ser iguales</p>
          } @else if (auth.error(); as message) {
            <p class="error" role="alert">{{ message }}</p>
          }

          <button
            type="submit"
            class="cta"
            [disabled]="auth.busy() || password() === '' || repetida() === '' || noCoinciden()"
          >
            {{ auth.busy() ? 'Guardando…' : 'Guardar y entrar' }}
          </button>
        </form>
      } @else if (auth.localesParaElegir().length > 0) {
      <!-- Trabaja en varios restaurantes: elige en cuál entra hoy.
           Después de verificar el PIN y no antes: preguntarlo antes diría en
           qué locales trabaja alguien con sólo escribir su usuario. -->
      <section class="card">
        <header class="head">
          <p class="eyebrow">{{ context() }}</p>
          <h1 class="title">¿Dónde entrás hoy?</h1>
          <p class="lede">Trabajás en más de un restaurante con Itadaki.</p>
        </header>

        <div class="locales">
          @for (uno of auth.localesParaElegir(); track uno.id) {
            <button type="button" class="local" (click)="entrarEn(uno.id)">
              <span class="local-nombre">{{ uno.nombre }}</span>
              <span class="local-puesto">{{ puestoDe(uno.role) }}</span>
            </button>
          }
        </div>
      </section>
      } @else if (conPin()) {
      <!-- El personal entra con usuario y PIN. El usuario es único en toda la
           base, así que no hace falta saber de qué restaurante es. -->
      <form class="card" (submit)="entrarConPin($event)">
        <header class="head">
          <p class="eyebrow">{{ context() }}</p>
          <h1 class="title">ITADAKI</h1>
          <p class="lede">Entrá con el usuario y el PIN que te dieron.</p>
        </header>

        <label class="field">
          <span>Usuario</span>
          <input
            name="usuario"
            type="text"
            autocomplete="username"
            autocapitalize="none"
            maxlength="30"
            required
            placeholder="Ej: nico"
            [value]="usuario()"
            (input)="onUsuario($event)"
          />
        </label>

        <label class="field">
          <span>PIN</span>
          <!-- Teclado numérico y seis dígitos: se tipea de parado, con una
               mano ocupada. -->
          <input
            name="pin"
            type="password"
            inputmode="numeric"
            autocomplete="current-password"
            maxlength="6"
            required
            placeholder="000000"
            [value]="pin()"
            (input)="onPin($event)"
          />
        </label>

        @if (auth.error(); as error) {
          <p class="error" role="alert">{{ error }}</p>
        }

        <button class="cta" type="submit" [disabled]="auth.busy()">
          {{ auth.busy() ? 'Entrando…' : 'Entrar' }}
        </button>

        <!-- No hay "olvidé mi PIN": el personal no tiene mail de trabajo, así
             que no hay a dónde mandar un link. Se lo pide a quien lo dio de
             alta, que está en el mismo local. -->
        <p class="switch">
          ¿Perdiste el PIN? Pedile uno nuevo a tu encargado.
        </p>

        <p class="switch">
          <button type="button" class="link" (click)="conPin.set(false)">
            Entrar con mail y contraseña
          </button>
        </p>
      </form>
      } @else if (mailMandado()) {
      <!-- El alta salió y lo que falta está en la casilla.
           Reemplaza al formulario en vez de ponerse encima: dejar los campos
           invitaría a intentar de nuevo creyendo que no funcionó.

           Dice lo mismo tenga o no cuenta ese mail, que es justamente lo que
           impide averiguar qué direcciones están registradas. Quien ya tenía
           cuenta recibe un aviso distinto en su casilla. -->
      <section class="card">
        <header class="head">
          <p class="eyebrow">{{ context() }}</p>
          <h1 class="title">Revisá tu mail</h1>
          <p class="lede">
            Te mandamos un link a <strong>{{ email() }}</strong> para entrar a tu
            restaurante. Si no lo ves, mirá en spam.
          </p>
        </header>
        <p class="switch">
          <button type="button" class="link" (click)="volverAEmpezar()">
            Usar otro mail
          </button>
        </p>
      </section>
      } @else {
      <form class="card" (submit)="submit($event)">
        <header class="head">
          <p class="eyebrow">{{ context() }}</p>
          <h1 class="title">ITADAKI</h1>
          <p class="lede">
            {{
              registering()
                ? 'Creá la cuenta de tu restaurante. Es gratis y toma un minuto.'
                : 'Ingresá con tu cuenta del restaurante.'
            }}
          </p>
        </header>

        @if (registering()) {
          <label class="field">
            <span>Nombre del restaurante</span>
            <input
              name="restaurant"
              type="text"
              autocomplete="organization"
              maxlength="60"
              required
              placeholder="Ej: Parrilla Don José"
              [value]="restaurant()"
              (input)="onRestaurant($event)"
            />
          </label>
        }

        <label class="field">
          <span>Email</span>
          <input
            name="email"
            type="email"
            autocomplete="username"
            required
            [value]="email()"
            (input)="onEmail($event)"
          />
        </label>

        <label class="field">
          <span>Contraseña</span>
          <input
            name="password"
            type="password"
            [attr.autocomplete]="registering() ? 'new-password' : 'current-password'"
            required
            [value]="password()"
            (input)="onPassword($event)"
          />
          @if (registering()) {
            <small class="hint">Mínimo 8 caracteres</small>
          }
        </label>

        @if (resetSent()) {
          <p class="notice" role="status">
            Si ese email tiene cuenta, le mandamos un link para cambiar la contraseña.
          </p>
        }

        @if (auth.error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }

        <button type="submit" class="cta" [disabled]="auth.busy() || !filled()">
          {{ busyLabel() }}
        </button>

        @if (!registering()) {
          <button
            type="button"
            class="link forgot"
            [disabled]="auth.busy()"
            (click)="forgot()"
          >
            Olvidé mi contraseña
          </button>
        }

        @if (googleClientId(); as clientId) {
          <div class="divider"><span>o</span></div>
          <div class="google-slot" #googleSlot></div>
          @if (needsRestaurant()) {
            <p class="notice" role="status">
              Es tu primera vez acá. Escribí el nombre de tu restaurante arriba y
              volvé a tocar el botón de Google.
            </p>
          }
        }

        @if (allowSignUp()) {
        <p class="switch">
          @if (registering()) {
            ¿Ya tenés cuenta?
            <button type="button" class="link" (click)="setMode(false)">Entrar</button>
          } @else {
            ¿Todavía no tenés cuenta?
            <button type="button" class="link" (click)="setMode(true)">
              Registrá tu restaurante
            </button>
          }
        </p>
        }
      </form>
      }
    </main>
  `,
})
export class LoginComponent {
  /** Shown above the title, e.g. "Administración" or "Cocina". */
  readonly context = input('Acceso del personal');

  /** Hidden where signing up makes no sense, e.g. the kitchen display. */
  readonly allowSignUp = input(true);

  protected readonly auth = inject(AuthStore);
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly restaurant = signal('');
  protected readonly registering = signal(false);

  /**
   * El alta salió y hay un mail en camino.
   *
   * Reemplaza al formulario en vez de ponerse encima: lo que hay que hacer
   * ahora está en la casilla, no en esta pantalla, y dejar los campos
   * invitaría a intentar de nuevo creyendo que no funcionó.
   */
  protected readonly mailMandado = signal(false);

  /** La contraseña repetida, para no quedar afuera por un error de tipeo. */
  protected readonly repetida = signal('');

  /**
   * Si las dos no coinciden.
   *
   * Callado mientras se está escribiendo la segunda: marcar en rojo desde la
   * primera letra es decirle a alguien que se equivocó antes de que termine.
   */
  protected readonly noCoinciden = computed(
    () => this.repetida() !== '' && this.password() !== this.repetida(),
  );
  protected readonly resetSent = signal(false);
  protected readonly needsRestaurant = signal(false);
  protected readonly googleClientId = signal<string | null>(null);
  /** 'reset' when the page was opened from a reset link. */
  protected readonly mode = signal<'auth' | 'reset'>('auth');

  /**
   * De qué restaurante es quien entra, sacado del link.
   *
   * El dueño comparte `.../parrilla-don-pepe` y el slug es el id del local:
   * no hay nada que crear ni administrar, y el mozo escribe dos datos en vez
   * de tres.
   */
  protected readonly local = signal('');

  /** Si se muestra la pantalla de usuario y PIN. */
  protected readonly conPin = signal(false);

  protected readonly usuario = signal('');
  protected readonly pin = signal('');

  protected onUsuario(evento: Event): void {
    this.usuario.set((evento.target as HTMLInputElement).value);
  }

  /** Sólo dígitos: quien lo dicta a veces lo separa, "48 13 02". */
  protected onPin(evento: Event): void {
    this.pin.set((evento.target as HTMLInputElement).value.replace(/\D/g, ''));
  }

  /** Entra al local elegido, con el PIN que ya se verificó. */
  protected async entrarEn(local: string): Promise<void> {
    await this.auth.signInConPin(this.usuario().trim(), this.pin(), local);
  }

  /** El puesto, como se lee. */
  protected puestoDe(role: string): string {
    const puestos: Record<string, string> = {
      OWNER: 'Dueño',
      MANAGER: 'Encargado',
      WAITER: 'Mozo',
      KITCHEN: 'Cocina',
    };
    return puestos[role] ?? role;
  }

  protected async entrarConPin(evento: Event): Promise<void> {
    evento.preventDefault();
    if (this.auth.busy()) return;

    await this.auth.signInConPin(this.usuario().trim(), this.pin());
  }

  private readonly googleSlot = viewChild<ElementRef<HTMLElement>>('googleSlot');
  private resetToken = '';

  constructor() {
    /*
     * El salón y la cocina son del personal: ahí se entra con usuario y PIN.
     *
     * Antes esto dependía de que la dirección trajera el nombre del local, y
     * sin ese tramo la pantalla pedía mail y contraseña — que el mozo no
     * tiene. Un mozo que entraba a salon.itadaki.app quedaba trabado en un
     * formulario que no podía completar.
     *
     * Desde que el usuario es único en toda la base, el local ya no hace
     * falta para entrar: "nico" identifica a una persona, y si trabaja en
     * varios lugares elige después de poner el PIN.
     *
     * Se decide por `allowSignUp`, que ya distingue las apps del personal del
     * panel del dueño: donde no se puede registrar un restaurante, quien entra
     * es alguien del equipo.
     */
    if (!this.allowSignUp()) {
      this.conPin.set(true);
    }

    // El local del link, cuando viene: no hace falta para entrar, pero sirve
    // para los links viejos que ya se repartieron.
    const tramo = globalThis.location.pathname.split('/').filter(Boolean)[0] ?? '';
    if (/^[a-z0-9-]{2,60}$/.test(tramo)) {
      this.local.set(tramo);
      this.conPin.set(true);
    }

    const params = new URLSearchParams(globalThis.location.search);
    const token = params.get('reset');
    if (token !== null && token !== '') {
      this.resetToken = token;
      this.mode.set('reset');
      // Keep the token out of the address bar and out of any shared screenshot.
      const clean = new URL(globalThis.location.href);
      clean.searchParams.delete('reset');
      globalThis.history.replaceState({}, '', clean.toString());
    }

    /*
     * El link del mail de alta.
     *
     * Desde que el alta dejó de iniciar sesión —para no delatar qué mails ya
     * tienen cuenta— ésta es la única puerta del dueño recién registrado, así
     * que además de verificar tiene que dejarlo adentro.
     */
    const verificacion = params.get('t');
    if (globalThis.location.pathname.includes('/verificar') && verificacion) {
      void this.verificarElMail(verificacion);
      // Fuera de la barra de direcciones: es una credencial de un solo uso, y
      // ahí queda en el historial y en cualquier captura de pantalla.
      const limpio = new URL(globalThis.location.href);
      limpio.searchParams.delete('t');
      globalThis.history.replaceState({}, '', limpio.toString());
    }

    void this.setUpGoogle();
  }

  /**
   * Verifica el mail y entra.
   *
   * Un token vencido o ya usado no es un error del que lo abre —el link vale
   * tres días y se puede haber abierto dos veces— así que se explica en vez de
   * dejarlo en una pantalla rota.
   */
  private async verificarElMail(token: string): Promise<void> {
    const entro = await this.auth.verificarMail(token);
    if (!entro) {
      this.mailMandado.set(false);
    }
  }

  /**
   * Loads Google's script only when a client id is configured.
   *
   * Nothing is requested from Google when sign-in is off, so a deployment
   * without it stays free of third-party calls.
   */
  private async setUpGoogle(): Promise<void> {
    const providers = await this.auth.providers();
    if (providers.google === null) return;

    this.googleClientId.set(providers.google.clientId);
    await loadGoogleScript();

    // The slot only exists after the signal above renders it.
    setTimeout(() => {
      const slot = this.googleSlot()?.nativeElement;
      const google = (globalThis as unknown as { google?: GoogleAccounts }).google;
      if (slot === undefined || google === undefined) return;

      google.accounts.id.initialize({
        client_id: providers.google?.clientId ?? '',
        callback: (response) => void this.onGoogleCredential(response.credential),
      });
      google.accounts.id.renderButton(slot, {
        theme: 'outline',
        size: 'large',
        width: 280,
        text: 'continue_with',
        locale: 'es',
      });
    });
  }

  private async onGoogleCredential(idToken: string): Promise<void> {
    const restaurant = this.restaurant().trim();
    const result = await this.auth.signInWithGoogle(
      idToken,
      restaurant === '' ? undefined : restaurant,
    );

    if (result === 'needs-restaurant') {
      // First time with this address: switch to the signup form so the
      // restaurant field is visible, and say why.
      this.registering.set(true);
      this.needsRestaurant.set(true);
    }
  }

  protected async forgot(): Promise<void> {
    const email = this.email().trim();
    if (email === '') {
      this.auth.error.set('Escribí tu email y volvé a tocar');
      return;
    }

    const sent = await this.auth.requestReset(email);
    if (sent) this.resetSent.set(true);
  }

  protected async submitReset(event: Event): Promise<void> {
    event.preventDefault();
    if (this.password() === '' || this.auth.busy()) return;

    if (this.noCoinciden() || this.repetida() === '') return;

    const nueva = this.password();
    const done = await this.auth.resetPassword(this.resetToken, nueva);
    if (!done) return;

    this.resetSent.set(false);
    this.auth.error.set(null);

    // El store ya guardó la sesión que devolvió el servidor. Si no vino
    // ninguna, esto deja el formulario listo con la contraseña nueva.
    if (!this.auth.signedIn()) {
      this.mode.set('auth');
    }

    this.password.set('');
    this.repetida.set('');
  }

  protected filled(): boolean {
    const credentials = this.email().trim() !== '' && this.password() !== '';
    return this.registering() ? credentials && this.restaurant().trim() !== '' : credentials;
  }

  protected busyLabel(): string {
    if (this.auth.busy()) return this.registering() ? 'Creando…' : 'Entrando…';
    return this.registering() ? 'Crear mi restaurante' : 'Entrar';
  }

  protected setMode(registering: boolean): void {
    this.registering.set(registering);
    this.resetSent.set(false);
    this.needsRestaurant.set(false);
    // An error from the other mode would read as a comment on this one.
    this.auth.error.set(null);
  }

  protected onEmail(event: Event): void {
    this.email.set((event.target as HTMLInputElement).value);
  }

  protected onRepetida(event: Event): void {
    this.repetida.set((event.target as HTMLInputElement).value);
  }

  protected onPassword(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  protected onRestaurant(event: Event): void {
    this.restaurant.set((event.target as HTMLInputElement).value);
  }

  /** Vuelve al formulario, para quien se equivocó de dirección. */
  protected volverAEmpezar(): void {
    this.mailMandado.set(false);
    this.password.set('');
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.filled() || this.auth.busy()) return;

    if (this.registering()) {
      const salio = await this.auth.signUp(
        this.restaurant().trim(),
        this.email().trim(),
        this.password(),
      );
      // El alta ya no entra al panel: se entra por el link del mail. Eso es lo
      // que permite que el servidor conteste igual tenga o no cuenta ese mail.
      if (salio) this.mailMandado.set(true);
      return;
    }
    await this.auth.signIn(this.email().trim(), this.password());
  }
}

interface GoogleAccounts {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (response: { credential: string }) => void;
      }): void;
      renderButton(target: HTMLElement, options: Record<string, unknown>): void;
    };
  };
}

let scriptPromise: Promise<void> | null = null;

/** Loaded once per page, however many times the login screen mounts. */
function loadGoogleScript(): Promise<void> {
  if (scriptPromise !== null) return scriptPromise;

  scriptPromise = new Promise<void>((resolve) => {
    const existing = document.querySelector('script[data-itadaki-google]');
    if (existing !== null) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset['itadakiGoogle'] = 'true';
    script.addEventListener('load', () => resolve());
    // Resolve on failure too: the caller checks for the global before using it.
    script.addEventListener('error', () => resolve());
    document.head.appendChild(script);
  });

  return scriptPromise;
}
