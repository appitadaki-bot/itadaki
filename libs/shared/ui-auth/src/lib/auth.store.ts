import { Injectable, computed, signal } from '@angular/core';

export interface StaffProfile {
  readonly id: string;
  readonly displayName: string;
  readonly role: string;
  readonly tenantId: string;
  readonly permissions: readonly string[];
}

const STORAGE_KEY = 'itadaki.staff-session';

/**
 * Holds the staff session for a back-office app.
 *
 * The token carries the tenant, so no screen ever asks which restaurant it is
 * looking at — that question is answered once, at login.
 */
/**
 * Si la dirección trae una credencial de un solo uso.
 *
 * Los dos links que llegan por mail: el de recuperar contraseña y el de
 * confirmar la casilla al registrarse. Los dos tienen que poder usarse en un
 * navegador donde ya hay alguien adentro — es lo más común, porque el mail se
 * abre en el mismo teléfono.
 */
function hayCredencialEnLaUrl(): boolean {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const recuperar = (params.get('reset') ?? '') !== '';
  const verificar =
    (params.get('t') ?? '') !== '' && (globalThis.location?.pathname ?? '').includes('/verificar');

  return recuperar || verificar;
}

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private baseUrl = '';

  readonly token = signal<string | null>(null);
  readonly profile = signal<StaffProfile | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly ready = signal(false);

  readonly signedIn = computed(() => this.token() !== null && this.profile() !== null);

  configure(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  /** Restores a stored session and confirms it is still valid server-side. */
  async restore(): Promise<void> {
    /*
     * Un link del mail gana sobre la sesión que haya guardada.
     *
     * Quien abre "recuperar contraseña" en un navegador donde ya había entrado
     * caía directo en el panel: la sesión vieja se restauraba antes de que
     * nadie mirara la dirección, y la pantalla de elegir contraseña nunca
     * llegaba a aparecer. Se pedía el link, se tocaba, y no pasaba nada — con
     * la contraseña sin cambiar y sin ninguna señal de por qué.
     *
     * Peor en el caso que el link existe para resolver: alguien que perdió su
     * contraseña, o que sospecha que alguien más la tiene. Quedarse con la
     * sesión abierta es exactamente lo contrario de lo que vino a hacer.
     */
    if (hayCredencialEnLaUrl()) {
      this.signOut();
      this.ready.set(true);
      return;
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) {
      this.ready.set(true);
      return;
    }

    this.token.set(saved);
    try {
      const response = await fetch(`${this.baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${saved}` },
      });

      if (response.ok) {
        this.profile.set((await response.json()) as StaffProfile);
      } else {
        // Expired or revoked: drop it rather than keep a token that 401s.
        this.signOut();
      }
    } catch {
      // Offline: keep the token and let the next request decide.
    } finally {
      this.ready.set(true);
    }
  }

  /**
   * Registers a restaurant and signs its owner straight in.
   *
   * The server returns a session with the account, so there is no reason to
   * bounce someone who just typed their password back to a login form.
   */
  /**
   * Confirma el mail del link y deja al dueño adentro.
   *
   * Es el momento en que alguien probó que la casilla es suya, y desde que el
   * alta dejó de iniciar sesión es también la única puerta de quien se acaba
   * de registrar.
   */
  async verificarMail(token: string): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);

    try {
      const response = await fetch(`${this.baseUrl}/auth/verificar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        // El link vale tres días y se puede haber abierto dos veces: no es un
        // error de quien lo abre, así que se explica y se ofrece entrar.
        this.error.set('Ese link ya no vale. Entrá con tu mail y contraseña.');
        return false;
      }

      const sesion = (await response.json()) as { token: string; user: StaffProfile };
      this.token.set(sesion.token);
      this.profile.set(sesion.user);
      localStorage.setItem(STORAGE_KEY, sesion.token);
      return true;
    } catch {
      this.error.set('No pudimos conectar con el servidor');
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  async signUp(restaurant: string, email: string, password: string): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);

    try {
      const response = await fetch(`${this.baseUrl}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant, email, password }),
      });

      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { kind?: string } | null;
        this.error.set(
          detail?.kind === 'PASSWORD_TOO_SHORT'
              ? 'La contraseña necesita al menos 8 caracteres'
              : detail?.kind === 'PASSWORD_TOO_COMMON'
                ? 'Esa contraseña es de las primeras que prueban; elegí otra'
              : detail?.kind === 'INVALID_EMAIL'
                ? 'Revisá el email'
                : detail?.kind === 'NAME_TOO_SHORT' || detail?.kind === 'NAME_NOT_USABLE'
                  ? 'Poné el nombre del restaurante'
                  : 'No pudimos crear la cuenta',
        );
        return false;
      }

      /*
       * El alta ya no inicia sesión: se entra por el link del mail.
       *
       * Es lo que permite que el servidor conteste igual para un mail libre y
       * para uno que ya tiene cuenta. Antes, entrar directo sólo en el primer
       * caso delataba cuál era cuál, y con eso se podía recorrer una lista de
       * direcciones para saber qué restaurantes usan Itadaki.
       */
      return true;
    } catch {
      this.error.set('No pudimos conectar con el servidor');
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  /** Asks for a reset link. Always reports success: the server does not say
   *  whether the address exists, and neither should the UI. */
  async requestReset(email: string): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fetch(`${this.baseUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      return true;
    } catch {
      this.error.set('No pudimos conectar con el servidor');
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  /** Sets a new password from a reset link. */
  async resetPassword(token: string, password: string): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const response = await fetch(`${this.baseUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { kind?: string } | null;
        this.error.set(
          detail?.kind === 'PASSWORD_TOO_SHORT'
            ? 'La contraseña necesita al menos 8 caracteres'
            : detail?.kind === 'PASSWORD_TOO_COMMON'
              ? 'Esa contraseña es de las primeras que prueban; elegí otra'
              : 'El link venció o ya se usó. Pedí uno nuevo.',
        );
        return false;
      }

      /*
       * El servidor devuelve la sesión: cambiar la contraseña también entra.
       *
       * Acaba de probar que la casilla es suya, y hacerle escribir de nuevo el
       * mail y la contraseña que eligió hace dos segundos no protege nada.
       *
       * Si viniera sin sesión —una versión anterior de la API— queda en el
       * formulario, que es lo que hacía antes.
       */
      const sesion = (await response.json().catch(() => null)) as
        | { token?: string; user?: StaffProfile }
        | null;

      if (sesion?.token !== undefined && sesion.user !== undefined) {
        this.token.set(sesion.token);
        this.profile.set(sesion.user);
        localStorage.setItem(STORAGE_KEY, sesion.token);
      }
      return true;
    } catch {
      this.error.set('No pudimos conectar con el servidor');
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  /** Which sign-in providers the server has configured. */
  async providers(): Promise<{ google: { clientId: string } | null }> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/providers`);
      if (!response.ok) return { google: null };
      return (await response.json()) as { google: { clientId: string } | null };
    } catch {
      return { google: null };
    }
  }

  /**
   * Exchanges a Google ID token for a session.
   *
   * `needsRestaurant` means the address is new and the caller has to ask for a
   * restaurant name before trying again.
   */
  async signInWithGoogle(
    idToken: string,
    restaurant?: string,
  ): Promise<'ok' | 'needs-restaurant' | 'failed'> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const response = await fetch(`${this.baseUrl}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(restaurant === undefined ? { idToken } : { idToken, restaurant }),
      });

      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { kind?: string } | null;
        if (detail?.kind === 'NEEDS_RESTAURANT') return 'needs-restaurant';
        this.error.set(
          detail?.kind === 'GOOGLE_NOT_CONFIGURED'
            ? 'El acceso con Google no está configurado'
            : 'No pudimos entrar con Google',
        );
        return 'failed';
      }

      const session = (await response.json()) as { token: string; user: StaffProfile };
      this.token.set(session.token);
      this.profile.set(session.user);
      localStorage.setItem(STORAGE_KEY, session.token);
      return 'ok';
    } catch {
      this.error.set('No pudimos conectar con el servidor');
      return 'failed';
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Entrar con usuario y PIN, para el personal sin mail de trabajo.
   *
   * El local viene del link que el dueño compartió, así que quien entra
   * escribe dos cosas y no tres.
   */
  async signInConPin(local: string, usuario: string, pin: string): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);

    try {
      const response = await fetch(`${this.baseUrl}/auth/login-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ local, usuario, pin }),
      });

      if (!response.ok) {
        const detalle = (await response.json().catch(() => null)) as { kind?: string } | null;

        // La cuenta trabada sí dice qué pasa: quien lo ve es casi siempre
        // alguien que se equivocó, y dejarlo probando a ciegas no protege
        // nada — el que ataca ya sabe que agotó los intentos.
        this.error.set(
          detalle?.kind === 'CUENTA_TRABADA'
            ? 'Demasiados intentos. Esperá unos minutos o pedile un PIN nuevo a tu encargado.'
            : 'Usuario o PIN incorrectos',
        );
        return false;
      }

      const session = (await response.json()) as { token: string; user: StaffProfile };
      this.token.set(session.token);
      this.profile.set(session.user);
      localStorage.setItem(STORAGE_KEY, session.token);
      return true;
    } catch {
      this.error.set('No pudimos conectar con el servidor');
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  async signIn(email: string, password: string): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);

    try {
      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        this.error.set('Email o contraseña incorrectos');
        return false;
      }

      const session = (await response.json()) as { token: string; user: StaffProfile };
      this.token.set(session.token);
      this.profile.set(session.user);
      localStorage.setItem(STORAGE_KEY, session.token);
      return true;
    } catch {
      this.error.set('No pudimos conectar con el servidor');
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  signOut(): void {
    this.token.set(null);
    this.profile.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  can(permission: string): boolean {
    return this.profile()?.permissions.includes(permission) ?? false;
  }

  /** Authorization header for an authenticated request, empty when signed out. */
  headers(): Record<string, string> {
    const token = this.token();
    return token === null ? {} : { Authorization: `Bearer ${token}` };
  }

  /**
   * Signs out when the API says the session is gone.
   *
   * Staff screens live on tablets that nobody watches: a session that expires
   * mid-service otherwise leaves the board frozen on its last good data, which
   * reads exactly like a quiet night. Turning that into the login screen is
   * what tells the kitchen the tickets stopped arriving.
   *
   * Returns whether the response was the end of the session, so a caller can
   * skip parsing a body that is not there.
   */
  expired(response: { status: number }): boolean {
    if (response.status !== 401) return false;
    if (this.signedIn()) {
      this.signOut();
      // A revoked account and an expired session both land here; saying so is
      // kinder than a bare login screen when someone was let go mid-shift.
      this.error.set('Tu sesión terminó. Volvé a entrar.');
    }
    return true;
  }

  /**
   * `fetch` with the session attached and expiry handled in one place.
   *
   * A screen with a dozen calls cannot be trusted to remember the 401 check at
   * every one of them, so it happens here instead. Callers still see the
   * response and decide what to render; by then an expired session has already
   * become the login screen.
   */
  async apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(url, {
      ...init,
      headers: { ...this.headers(), ...(init.headers ?? {}) },
    });
    this.expired(response);
    return response;
  }
}
