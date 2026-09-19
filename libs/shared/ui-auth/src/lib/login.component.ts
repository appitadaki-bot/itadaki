import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
  effect,
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
          <!-- El mozo trabaja en varios; soporte entra a cualquiera. La misma
               pantalla sirve para los dos, pero la frase no. -->
          <p class="lede">
            {{
              entraComoSoporte()
                ? 'Elegí el restaurante en el que vas a trabajar.'
                : 'Trabajás en más de un restaurante con Itadaki.'
            }}
          </p>
        </header>

        <div class="locales">
          @for (uno of auth.localesParaElegir(); track uno.id) {
            <button type="button" class="local" (click)="entrarEn(uno.id)">
              <span class="local-nombre">{{ uno.nombre }}</span>
              <!-- Para el mozo, su puesto en ese local. Para soporte no
                   sirve —diría "Soporte" en todas— así que va el
                   identificador, que es lo que distingue dos locales que se
                   llaman parecido. -->
              <span class="local-puesto">
                {{ entraComoSoporte() ? uno.id : puestoDe(uno.role) }}
              </span>
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

        <!-- Sólo donde el mail sigue siendo una opción.
             En el salón y la cocina no lo es: el mozo entra con usuario y
             PIN, y ofrecerle una contraseña que nadie le dictó —para un mail
             que muchas veces es inventado— lo mandaba a probar algo que no
             existe. El servidor tampoco se lo aceptaría.
             En el panel se conserva: ahí el PIN se enciende por el tramo de
             la URL, y el dueño tiene que poder volver a su mail. -->
        @if (entraConMail()) {
          <p class="switch">
            <button type="button" class="link" (click)="conPin.set(false)">
              Entrar con mail y contraseña
            </button>
          </p>
        }
      </form>
      } @else {
      <form class="card" (submit)="submit($event)">
        <header class="head">
          <!--
            La campana, no el logo entero: acá abajo ya dice ITADAKI en el
            título, y repetir la palabra dos veces seguidas se lee como un
            error. Decorativa, por lo mismo — el lector de pantalla anuncia
            el <h1> que sigue.
          -->
          <img class="marca-iso" src="itadaki-isotipo.png" alt="" width="48" height="48" />
          <p class="eyebrow">{{ context() }}</p>
          <h1 class="title">ITADAKI</h1>
          <p class="lede">Ingresá con tu cuenta del restaurante.</p>
        </header>

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
            autocomplete="current-password"
            required
            [value]="password()"
            (input)="onPassword($event)"
          />
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

        <button
          type="button"
          class="link forgot"
          [disabled]="auth.busy()"
          (click)="forgot()"
        >
          Olvidé mi contraseña
        </button>

        @if (googleClientId(); as clientId) {
          <div class="divider"><span>o</span></div>
          <div class="google-slot" #googleSlot></div>
        }

        <!-- Sin link para registrarse: las cuentas las damos de alta
             nosotros, con la carta y las mesas ya cargadas. -->
      </form>
      }
    </main>
  `,
})
export class LoginComponent {
  /** Shown above the title, e.g. "Administración" or "Cocina". */
  readonly context = input('Acceso del personal');

  /**
   * Si se puede entrar con mail y contraseña, además del PIN.
   *
   * Sí en el panel del dueño, no en el salón ni en la cocina: ahí entra el
   * equipo, con usuario y PIN. Se llamaba `allowSignUp` porque además mostraba
   * el link para registrarse, y cuando el alta dejó de estar abierta quedó
   * haciendo sólo esto — con un nombre que prometía otra cosa.
   */
  readonly entraConMail = input(true);

  protected readonly auth = inject(AuthStore);
  protected readonly email = signal('');
  protected readonly password = signal('');

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
  /** Si la lista que se está mostrando es la de soporte. */
  protected readonly entraComoSoporte = computed(() =>
    this.auth.localesParaElegir().some((uno) => uno.role === 'SOPORTE'),
  );

  protected async entrarEn(local: string): Promise<void> {
    /*
     * La misma lista sirve para dos casos.
     *
     * El mozo que trabaja en varios llegó acá con usuario y PIN; soporte, con
     * mail y contraseña. Se distingue por el rol que vino en la lista, que el
     * servidor ya mandó — no hace falta recordar por qué puerta se entró.
     */
    if (this.entraComoSoporte()) {
      /*
       * Con la clave si es la primera vez; con el token si ya había sesión.
       *
       * Al volver desde el panel —"Cambiar de restaurante"— el formulario
       * está vacío: la contraseña se escribió en la pantalla anterior y ya
       * no está. Por eso el segundo restaurante no abría nunca.
       */
      const exito = this.password() !== ''
        ? await this.auth.entrarComoSoporte(this.email().trim(), this.password(), local)
        : await this.auth.cambiarDeRestaurante(local);

      if (!exito) this.auth.error.set('No pudimos entrar a ese restaurante');
      return;
    }

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
     * Se decide por `entraConMail`, que distingue las apps del personal del
     * panel del dueño: donde no se entra con mail, quien entra es alguien del
     * equipo.
     */
    /*
     * En un `effect` y no acá suelto: en el constructor `entraConMail()`
     * todavía devuelve su valor por defecto —`true`— porque los inputs del
     * template llegan después. Leerlo directo dejaba al salón y a la cocina
     * pidiendo mail y contraseña, que es justo lo que no tienen: el cocinero
     * escribía su usuario en un campo que exige un mail y quedaba trabado.
     */
    effect(() => {
      if (!this.entraConMail()) {
        this.conPin.set(true);
      }
    });

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
    await this.auth.verificarMail(token);
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
    // Un mail sin cuenta vuelve con el aviso en `auth.error`: no hay alta acá.
    await this.auth.signInWithGoogle(idToken);
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
    return this.email().trim() !== '' && this.password() !== '';
  }

  protected busyLabel(): string {
    return this.auth.busy() ? 'Entrando…' : 'Entrar';
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


  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.filled() || this.auth.busy()) return;

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
