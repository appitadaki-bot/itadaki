import { Body, Controller, Get, HttpException, HttpStatus, Post } from '@nestjs/common';
import {
  type Role,
  describeSubscription,
  normaliseEmail,
  entraConMail,
  permissionsOf,
  validateCredentials,
  validatePassword,
  estaTrabada,
  nombreDeUsuario,
  pareceUnPin,
  trasElIntento,
  esDeSoporte,
  TENANT_DE_SOPORTE,
} from '@itadaki/identity/domain';
import {
  RESET_TOKEN_MINUTES,
  digestDeVerificacion,
  digestOf,
  mailDeVerificacion,
  nuevoTokenDeVerificacion,
  hashPassword,
  isGoogleError,
  newResetToken,
  signToken,
  verifyGoogleIdToken,
  verifyPassword,
} from '@itadaki/identity/infra';
import { z } from 'zod';
import {
  ADMIN_APP_URL,
  AUTH_SECRET,
  Auth,
  type AuthContext,
  Public,
  SESSION_HOURS,
  olvidarMailConfirmado,
  RequirePermission,
} from './auth';
import { RateLimit } from './rate-limit.guard';
import { StaffService } from './staff.service';
import { TenantsService } from './tenants.service';
import { ResetsService } from './resets.service';
import { GoogleService } from './google.service';
import { log } from './logger';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly staff: StaffService,
    private readonly tenants: TenantsService,
    private readonly resets: ResetsService,
    private readonly google: GoogleService,
  ) {}

  @Public()
  @RateLimit('login')
  @Post('login')
  async login(@Body() body: unknown) {
    const parsed = z
      .object({ email: z.string().min(1).max(120), password: z.string().min(1).max(200) })
      .safeParse(body);
    if (!parsed.success) {
      throw new HttpException({ kind: 'INVALID_CREDENTIALS' }, HttpStatus.UNAUTHORIZED);
    }

    const checked = validateCredentials(parsed.data.email, parsed.data.password);
    // A malformed address and a wrong password answer identically: telling
    // them apart would let someone enumerate registered emails.
    if (checked.isErr()) {
      throw new HttpException({ kind: 'INVALID_CREDENTIALS' }, HttpStatus.UNAUTHORIZED);
    }

    const found = await this.staff.store.findByEmail(checked.value.email);
    if (found.isErr()) {
      throw new HttpException({ kind: 'INVALID_CREDENTIALS' }, HttpStatus.UNAUTHORIZED);
    }

    const matches = await verifyPassword(checked.value.password, found.value.passwordHash);
    if (!matches) {
      throw new HttpException({ kind: 'INVALID_CREDENTIALS' }, HttpStatus.UNAUTHORIZED);
    }

    /*
     * El salón y la cocina entran con usuario y PIN, no por acá.
     *
     * Se verifica la contraseña primero y se rechaza después, a propósito: al
     * revés, responder distinto antes de comprobarla diría qué mails existen
     * y con qué rol, que es justo lo que el resto del endpoint cuida.
     *
     * Y se contesta lo mismo que un dato equivocado. Decir "entrá con tu PIN"
     * sería más amable, pero le confirmaría a cualquiera que ese mail tiene
     * cuenta. Quien es del personal ya tiene su usuario y su PIN anotados del
     * alta; quien no, no tiene por qué enterarse de nada.
     */
    if (!entraConMail(found.value.role) && !esDeSoporte(found.value.role)) {
      log.warn('intento de entrar con mail desde un rol que usa PIN', {
        tenantId: found.value.tenantId,
        role: found.value.role,
      });
      throw new HttpException({ kind: 'INVALID_CREDENTIALS' }, HttpStatus.UNAUTHORIZED);
    }

    /*
     * Soporte no recibe sesión acá: recibe la lista de restaurantes.
     *
     * Se responde después de verificar la contraseña, así que esta lista no
     * le dice nada a quien no la sabe. Antes había un enlace de "entrar como
     * soporte" en la pantalla de login, y eso le anunciaba a cualquiera que
     * existe una puerta con acceso a todos los locales — información que no
     * hacía falta dar.
     *
     * Se reusa `elegirLocal`, que el login por PIN ya usa para quien trabaja
     * en varios restaurantes: es el mismo "elegí antes de entrar", y así la
     * pantalla no necesita un caso nuevo.
     */
    if (esDeSoporte(found.value.role)) {
      const locales = await this.tenants.store.buscarLocales('');
      if (locales.isErr()) {
        throw new HttpException(locales.error, HttpStatus.BAD_GATEWAY);
      }

      log.info('soporte pidió la lista de restaurantes', { userId: found.value.id });

      return {
        elegirLocal: locales.value
          .filter((local) => local.id !== TENANT_DE_SOPORTE)
          .map((local) => ({ ...local, role: found.value.role })),
      };
    }

    const expiresAt = Date.now() + SESSION_HOURS * 3_600_000;
    const token = signToken(
      {
        userId: found.value.id,
        tenantId: found.value.tenantId,
        role: found.value.role,
        displayName: found.value.displayName,
        expiresAt,
      },
      AUTH_SECRET,
    );

    return {
      token,
      expiresAt,
      user: {
        id: found.value.id,
        displayName: found.value.displayName,
        role: found.value.role,
        tenantId: found.value.tenantId,
        permissions: permissionsOf(found.value.role),
      },
    };
  }

  /**
   * Registers a restaurant and its first owner.
   *
   * Public by necessity: this is the one call made by someone who does not yet
   * have an account. It returns a session so signing up lands the owner
   * straight in the panel rather than at a login form.
   */
  /**
   * Manda el link de verificación.
   *
   * Separado del alta para que su fallo se pueda tragar sin arrastrarla: lo
   * peor que puede pasar es una cuenta sin verificar, y para eso está el
   * reenvío.
   */
  private async mandarVerificacion(email: string, restaurante: string): Promise<void> {
    try {
      const { token, digest, expiraEn } = nuevoTokenDeVerificacion();

      const guardado = await this.tenants.store.pedirVerificacion(email, digest, expiraEn);
      if (guardado.isErr()) {
        // Sin token guardado el link no verificaría nada, así que no se manda.
        // Pero queda dicho: una cuenta que nunca recibe su mail tiene que
        // dejar rastro de por qué.
        log.error('no se pudo guardar la verificación', { detail: guardado.error.kind });
        return;
      }

      const base = ADMIN_APP_URL;
      const { subject, body } = mailDeVerificacion(
        restaurante,
        `${base}/verificar?t=${encodeURIComponent(token)}`,
      );

      await this.resets.mailer.send({ to: email, subject, body });
    } catch (error) {
      // Que no se vea sólo en el log del proveedor: sin esto, una cuenta que
      // nunca recibe su mail no deja rastro de por qué.
      log.error('no se pudo mandar la verificación', { detail: String(error) });
    }
  }

  /**
   * Confirma un mail desde el link.
   *
   * Público porque lo abre alguien que quizás no tiene sesión: el link puede
   * caer en otro navegador, o en el teléfono en vez de la computadora donde se
   * anotó.
   */
  /**
   * Vuelve a mandar el link de verificación.
   *
   * Contesta lo mismo exista o no la cuenta: si dijera "ese mail no está
   * registrado", este endpoint se convierte en una forma de averiguar qué
   * restaurantes usan Itadaki, probando direcciones de a una.
   *
   * Con el límite de intentos del login, que es lo que evita que se lo use
   * para mandarle mails a alguien repetidamente.
   */
  @Public()
  @RateLimit('login')
  @Post('reenviar-verificacion')
  async reenviarVerificacion(@Body() body: unknown) {
    const parsed = z.object({ email: z.string().min(1).max(120) }).safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error.issues, HttpStatus.BAD_REQUEST);
    }

    const email = parsed.data.email.trim().toLowerCase();
    const yaEsta = await this.tenants.store.mailVerificado(email);

    // Nada que reenviar si ya está confirmado: mandar otro link sólo agrega
    // una credencial más dando vueltas en una casilla.
    if (yaEsta.isOk() && !yaEsta.value) {
      const quien = await this.staff.store.findByEmail(email);
      if (quien.isOk()) {
        // El id del restaurante es un slug —"manolo-san-telmo"— y quedaría así
        // en el asunto del mail. El nombre que puso al registrarse se lee
        // mejor, y es el que la persona reconoce.
        await this.mandarVerificacion(email, quien.value.displayName);
      }
    }

    return { enviado: true };
  }

  @Public()
  @RateLimit('login')
  @Post('verificar')
  async verificar(@Body() body: unknown) {
    const parsed = z.object({ token: z.string().min(1).max(200) }).safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error.issues, HttpStatus.BAD_REQUEST);
    }

    const verificado = await this.tenants.store.verificarMail(
      digestDeVerificacion(parsed.data.token),
      new Date(),
    );
    if (verificado.isErr()) {
      throw new HttpException(verificado.error, HttpStatus.BAD_GATEWAY);
    }

    // Un token que no coincide y uno vencido dan la misma respuesta: decir
    // cuál de los dos fue le confirma a quien prueba tokens que acertó uno.
    if (verificado.value === null) {
      throw new HttpException({ kind: 'TOKEN_INVALIDO' }, HttpStatus.BAD_REQUEST);
    }

    /*
     * Verificar el mail también entra al panel.
     *
     * Es el único momento en que alguien probó que la casilla es suya, y desde
     * que el alta dejó de iniciar sesión —para no delatar qué mails ya tienen
     * cuenta— es también la única puerta que le queda al dueño recién
     * registrado. Sin esto, verificaría y caería en la pantalla de entrada sin
     * haber estado nunca adentro.
     */
    // `verificarMail` devuelve el mail, no la fila: la sesión necesita el
    // usuario, así que se busca con lo que acaba de confirmarse.
    const quien = await this.staff.store.findByEmail(verificado.value);

    // Sin esto, el dueño confirma y sigue sin poder tocar la carta hasta que
    // venza el minuto de caché del guard — con el mail ya confirmado en la
    // base. Un minuto mirando un botón que no anda parece que no funcionó.
    if (quien.isOk()) {
      olvidarMailConfirmado(quien.value.tenantId, quien.value.id);
    }

    if (quien.isErr()) {
      // Verificado quedó, aunque no podamos abrir la sesión acá: entra con su
      // mail y contraseña, que es lo que la pantalla ofrece si esto falla.
      return { verificado: true };
    }

    return { verificado: true, ...this.sessionFor(quien.value) };
  }

  /**
   * Entrar a un restaurante como soporte, para armarle la carta.
   *
   * La promesa del alta es "cuando entres, tu carta ya va a estar cargada", y
   * eso exige entrar antes que el dueño. La alternativa era pedirle su
   * contraseña: viajaría por WhatsApp, quedaría en dos historiales, y después
   * nadie sabría si un precio lo cambió él o nosotros.
   *
   * El token que devuelve vale para **un solo** restaurante, el que se pide
   * acá. No existe una sesión que valga para todos: el tenant sale del token
   * firmado y eso es justamente lo que impide leer los datos de otro local
   * editando la URL. Para entrar a dos, se piden dos.
   *
   * Requiere la contraseña en cada pedido, aunque ya haya sesión: es una
   * llave maestra, y abrir un restaurante ajeno no puede ser algo que pase
   * por tener una pestaña abierta.
   */
  @Public()
  @RateLimit('soporte')
  @Post('soporte')
  async entrarComoSoporte(@Body() body: unknown) {
    const parsed = z
      .object({
        email: z.string().min(1).max(120),
        password: z.string().min(1).max(200),
        local: z.string().min(1).max(80),
      })
      .safeParse(body);
    if (!parsed.success) {
      throw new HttpException({ kind: 'INVALID_CREDENTIALS' }, HttpStatus.UNAUTHORIZED);
    }

    const quien = await this.staff.store.findByEmail(normaliseEmail(parsed.data.email));
    if (quien.isErr()) {
      throw new HttpException({ kind: 'INVALID_CREDENTIALS' }, HttpStatus.UNAUTHORIZED);
    }

    const acerto = await verifyPassword(parsed.data.password, quien.value.passwordHash);

    /*
     * Se verifica la contraseña antes de mirar el rol, y se contesta lo mismo
     * en los dos casos: responder distinto le diría a cualquiera qué cuentas
     * son de soporte, que es justo la lista que alguien querría para atacar.
     */
    if (!acerto || !esDeSoporte(quien.value.role) || !quien.value.active) {
      log.warn('intento de entrar como soporte', { email: parsed.data.email });
      throw new HttpException({ kind: 'INVALID_CREDENTIALS' }, HttpStatus.UNAUTHORIZED);
    }

    const local = await this.tenants.store.nombresDe([parsed.data.local]);
    if (local.isErr() || !local.value.has(parsed.data.local)) {
      throw new HttpException({ kind: 'LOCAL_DESCONOCIDO' }, HttpStatus.NOT_FOUND);
    }

    // Queda en el log qué restaurante se abrió y quién: es una llave maestra,
    // y su uso tiene que poder auditarse después.
    log.info('soporte entró a un restaurante', {
      tenantId: parsed.data.local,
      userId: quien.value.id,
    });

    const expiresAt = Date.now() + SESSION_HOURS * 3_600_000;
    const token = signToken(
      {
        userId: quien.value.id,
        // El local que se pidió, no el de la cuenta de soporte.
        tenantId: parsed.data.local,
        role: quien.value.role,
        displayName: quien.value.displayName,
        expiresAt,
      },
      AUTH_SECRET,
    );

    return {
      token,
      expiresAt,
      local: { id: parsed.data.local, nombre: local.value.get(parsed.data.local) },
      user: {
        id: quien.value.id,
        displayName: quien.value.displayName,
        role: quien.value.role,
        tenantId: parsed.data.local,
        // El nombre y no sólo el identificador: entrando como soporte, el
        // panel tiene que decir a qué restaurante se entró. Sin esto la
        // pantalla dice "Administración" y no hay forma de saber cuál es.
        tenantNombre: local.value.get(parsed.data.local),
        permissions: permissionsOf(quien.value.role),
      },
    };
  }

  /**
   * La lista de restaurantes, para quien ya tiene sesión de soporte abierta.
   *
   * La otra versión pide la contraseña porque se usa antes de entrar. Ésta
   * es para volver a elegir sin salir, y ahí la sesión vigente ya prueba
   * quién es.
   */
  @RequirePermission('menu:read')
  @Get('soporte/mis-locales')
  async misLocales(@Auth() auth: AuthContext) {
    if (!esDeSoporte(auth.role)) {
      throw new HttpException({ kind: 'FORBIDDEN' }, HttpStatus.FORBIDDEN);
    }

    const locales = await this.tenants.store.buscarLocales('');
    if (locales.isErr()) {
      throw new HttpException(locales.error, HttpStatus.BAD_GATEWAY);
    }

    return { locales: locales.value.filter((local) => local.id !== TENANT_DE_SOPORTE) };
  }

  /**
   * Cambiar de restaurante sin volver a escribir la contraseña.
   *
   * Antes, cambiar de local era salir y entrar de nuevo, y eso rompía: el
   * formulario ya se había vaciado, así que el segundo restaurante no abría
   * nunca y la pantalla quedaba muda.
   *
   * Pide la sesión de soporte que ya está abierta —no la contraseña— y emite
   * otra para el local pedido. Sigue valiendo para uno solo: lo que cambia es
   * que la prueba de identidad es el token vigente en vez de tipear la clave
   * cada vez.
   */
  @RequirePermission('menu:read')
  @Post('soporte/cambiar')
  async cambiarDeRestaurante(@Body() body: unknown, @Auth() auth: AuthContext) {
    const parsed = z.object({ local: z.string().min(1).max(80) }).safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error.issues, HttpStatus.BAD_REQUEST);
    }

    // Sólo soporte: un dueño con sesión no puede saltar a otro restaurante.
    if (!esDeSoporte(auth.role)) {
      log.warn('intento de cambiar de restaurante sin ser soporte', {
        tenantId: auth.tenantId,
        userId: auth.userId,
      });
      throw new HttpException({ kind: 'FORBIDDEN' }, HttpStatus.FORBIDDEN);
    }

    const local = await this.tenants.store.nombresDe([parsed.data.local]);
    if (local.isErr() || !local.value.has(parsed.data.local)) {
      throw new HttpException({ kind: 'LOCAL_DESCONOCIDO' }, HttpStatus.NOT_FOUND);
    }

    log.info('soporte cambió de restaurante', {
      desde: auth.tenantId,
      a: parsed.data.local,
      userId: auth.userId,
    });

    const expiresAt = Date.now() + SESSION_HOURS * 3_600_000;
    const token = signToken(
      {
        userId: auth.userId,
        tenantId: parsed.data.local,
        role: auth.role,
        displayName: auth.displayName,
        expiresAt,
      },
      AUTH_SECRET,
    );

    return {
      token,
      expiresAt,
      user: {
        id: auth.userId,
        displayName: auth.displayName,
        role: auth.role,
        tenantId: parsed.data.local,
        tenantNombre: local.value.get(parsed.data.local),
        permissions: permissionsOf(auth.role),
      },
    };
  }

  /**
   * Los restaurantes a los que soporte puede entrar.
   *
   * Pide la contraseña igual que el login, y por la misma razón: la lista de
   * quiénes son nuestros clientes no puede salir de tener una pestaña
   * abierta. Es el mismo precio que abrir un local.
   *
   * No devuelve nada de adentro de cada restaurante — sólo su nombre, que es
   * lo justo para elegir uno de una lista.
   */
  @Public()
  @RateLimit('soporte')
  @Post('soporte/locales')
  async localesParaSoporte(@Body() body: unknown) {
    const parsed = z
      .object({
        email: z.string().min(1).max(120),
        password: z.string().min(1).max(200),
        busca: z.string().max(80).default(''),
      })
      .safeParse(body);
    if (!parsed.success) {
      throw new HttpException({ kind: 'INVALID_CREDENTIALS' }, HttpStatus.UNAUTHORIZED);
    }

    const quien = await this.staff.store.findByEmail(normaliseEmail(parsed.data.email));
    if (quien.isErr()) {
      throw new HttpException({ kind: 'INVALID_CREDENTIALS' }, HttpStatus.UNAUTHORIZED);
    }

    const acerto = await verifyPassword(parsed.data.password, quien.value.passwordHash);
    if (!acerto || !esDeSoporte(quien.value.role) || !quien.value.active) {
      log.warn('pidieron la lista de locales sin ser soporte', { email: parsed.data.email });
      throw new HttpException({ kind: 'INVALID_CREDENTIALS' }, HttpStatus.UNAUTHORIZED);
    }

    const locales = await this.tenants.store.buscarLocales(parsed.data.busca.trim());
    if (locales.isErr()) {
      throw new HttpException(locales.error, HttpStatus.BAD_GATEWAY);
    }

    // El propio local de soporte no es un restaurante: no tiene carta que
    // cargar y verlo en la lista sólo confunde.
    return { locales: locales.value.filter((local) => local.id !== TENANT_DE_SOPORTE) };
  }

  /**
   * Entrar con usuario y PIN, para el personal sin mail de trabajo.
   *
   * El usuario es único en toda la base, así que identifica a la persona sin
   * necesidad del restaurante: el mozo escribe dos cosas y no tres, y el mismo
   * usuario le sirve en todos los locales donde trabaja.
   *
   * Quien trabaja en más de uno recibe la lista para elegir. Se le pregunta
   * después de verificar el PIN y no antes: preguntarlo antes le diría a
   * cualquiera en qué restaurantes trabaja esa persona con sólo escribir su
   * usuario.
   *
   * Lo que se traba es la cuenta y no la dirección de red: quien prueba PINes
   * a ciegas cambia de IP cuando quiere, pero no cambia de usuario.
   */
  @Public()
  @RateLimit('login')
  @Post('login-pin')
  async loginConPin(@Body() body: unknown) {
    const parsed = z
      .object({
        usuario: z.string().min(1).max(30),
        pin: z.string().min(1).max(20),
        /** Sólo cuando la persona trabaja en varios y ya eligió. */
        local: z.string().min(1).max(80).optional(),
      })
      .safeParse(body);
    if (!parsed.success) {
      throw new HttpException({ kind: 'INVALID_CREDENTIALS' }, HttpStatus.UNAUTHORIZED);
    }

    const usuario = nombreDeUsuario(parsed.data.usuario);
    if (usuario.isErr() || !pareceUnPin(parsed.data.pin)) {
      // Un usuario mal formado y un PIN equivocado responden igual: separarlos
      // diría cuáles usuarios existen.
      throw new HttpException({ kind: 'INVALID_CREDENTIALS' }, HttpStatus.UNAUTHORIZED);
    }

    const locales = await this.staff.store.localesDe(usuario.value);
    if (locales.isErr() || locales.value.length === 0) {
      throw new HttpException({ kind: 'INVALID_CREDENTIALS' }, HttpStatus.UNAUTHORIZED);
    }

    /*
     * Cuál de sus locales.
     *
     * Con uno solo, ése. Con varios y sin elegir, se verifica el PIN contra el
     * primero —el mismo PIN vale en todos, es la misma persona— y recién ahí
     * se le ofrece la lista.
     */
    const elegido =
      parsed.data.local === undefined
        ? locales.value[0]
        : locales.value.find((una) => una.tenantId === parsed.data.local);

    if (elegido === undefined) {
      throw new HttpException({ kind: 'INVALID_CREDENTIALS' }, HttpStatus.UNAUTHORIZED);
    }

    const persona = elegido;
    const ahora = new Date();

    if (estaTrabada(persona.trabadoHasta, ahora)) {
      // Acá sí se dice qué pasa: quien está trabado es casi siempre el mozo
      // que se equivocó, y dejarlo probando a ciegas no protege nada — el
      // atacante ya sabe que agotó los intentos.
      throw new HttpException(
        { kind: 'CUENTA_TRABADA', hasta: persona.trabadoHasta },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!persona.active) {
      throw new HttpException({ kind: 'INVALID_CREDENTIALS' }, HttpStatus.UNAUTHORIZED);
    }

    const acerto = await verifyPassword(parsed.data.pin.trim(), persona.pinHash);
    const resultado = trasElIntento(persona.intentos, acerto, ahora);

    await this.staff.store.registrarIntento(
      persona.tenantId,
      persona.id,
      acerto,
      resultado.trabadoHasta,
    );

    if (!acerto) {
      throw new HttpException({ kind: 'INVALID_CREDENTIALS' }, HttpStatus.UNAUTHORIZED);
    }

    /*
     * Trabaja en varios y todavía no eligió: se le pregunta.
     *
     * Recién acá, con el PIN ya verificado. Preguntarlo antes le diría a
     * cualquiera en qué restaurantes trabaja esa persona con sólo escribir su
     * usuario, que es justo lo que el PIN protege.
     */
    if (locales.value.length > 1 && parsed.data.local === undefined) {
      const nombres = await this.tenants.store.nombresDe(
        locales.value.map((una) => una.tenantId),
      );

      return {
        elegirLocal: locales.value.map((una) => ({
          id: una.tenantId,
          nombre: nombres.isOk() ? (nombres.value.get(una.tenantId) ?? una.tenantId) : una.tenantId,
          // El puesto cambia entre locales: mozo en uno, encargado en otro.
          role: una.role,
        })),
      };
    }

    const expiresAt = Date.now() + SESSION_HOURS * 3_600_000;
    const token = signToken(
      {
        userId: persona.id,
        tenantId: persona.tenantId,
        role: persona.role,
        displayName: persona.displayName,
        expiresAt,
      },
      AUTH_SECRET,
    );

    return {
      token,
      expiresAt,
      user: {
        id: persona.id,
        displayName: persona.displayName,
        role: persona.role,
        tenantId: persona.tenantId,
        permissions: permissionsOf(persona.role),
      },
    };
  }

  /*
   * No hay alta desde afuera.
   *
   * Existía `POST /auth/signup`, y entrar con Google con una cuenta nueva
   * también creaba un restaurante. Los clientes los damos de alta nosotros:
   * cargamos la carta y las mesas antes de que el dueño entre, así que una
   * cuenta creada sola arrancaba vacía justo cuando le habíamos prometido lo
   * contrario. Y esconder el link del panel no alcanzaba — cualquiera podía
   * llamar al endpoint directo.
   *
   * El alta es `npm run alta:restaurante`.
   */

  /** Lets the panel show or hide the Google button without guessing. */
  @Public()
  @Get('providers')
  providers() {
    return { google: this.google.enabled ? { clientId: this.google.clientId } : null };
  }

  /**
   * Signs in with a Google ID token, registering the restaurant if asked.
   *
   * An address that already has an account signs into it: Google proved the
   * person owns that mailbox, and the alternative — refusing, or creating a
   * duplicate — would strand someone outside their own restaurant.
   */
  @Public()
  @RateLimit('login')
  @Post('google')
  async google_(@Body() body: unknown) {
    if (!this.google.enabled) {
      throw new HttpException({ kind: 'GOOGLE_NOT_CONFIGURED' }, HttpStatus.NOT_IMPLEMENTED);
    }

    const parsed = z
      .object({
        idToken: z.string().min(1).max(4000),
      })
      .safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error.issues, HttpStatus.BAD_REQUEST);
    }

    const identity = verifyGoogleIdToken(parsed.data.idToken, {
      clientId: this.google.clientId,
      keys: await this.google.keys(),
      now: new Date(),
    });
    if (isGoogleError(identity)) {
      throw new HttpException({ kind: 'INVALID_GOOGLE_TOKEN' }, HttpStatus.UNAUTHORIZED);
    }

    const existing = await this.staff.store.findByEmail(identity.email);
    if (existing.isOk()) {
      return this.sessionFor(existing.value);
    }

    /*
     * Sin cuenta, no se crea una.
     *
     * Antes, con el nombre de un restaurante, esto lo daba de alta. Ahora las
     * cuentas las crea el equipo de Itadaki, así que un mail de Google que no
     * está registrado es alguien que todavía no es cliente.
     */
    throw new HttpException({ kind: 'SIN_CUENTA' }, HttpStatus.FORBIDDEN);
  }

  /** One place that mints a session, so every entry point issues the same shape. */
  private sessionFor(user: {
    id: string;
    tenantId: string;
    role: Role;
    displayName: string;
  }) {
    const expiresAt = Date.now() + SESSION_HOURS * 3_600_000;
    return {
      token: signToken(
        {
          userId: user.id,
          tenantId: user.tenantId,
          role: user.role,
          displayName: user.displayName,
          expiresAt,
        },
        AUTH_SECRET,
      ),
      expiresAt,
      user: {
        id: user.id,
        displayName: user.displayName,
        role: user.role,
        tenantId: user.tenantId,
        permissions: permissionsOf(user.role),
      },
    };
  }

  /**
   * Starts a password reset.
   *
   * Always answers the same way, whether or not the address is registered:
   * a different response for an unknown email would turn this into a way to
   * find out who has an account.
   */
  @Public()
  @RateLimit('passwordReset')
  @Post('forgot-password')
  async forgotPassword(@Body() body: unknown) {
    const parsed = z.object({ email: z.string().min(1).max(120) }).safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error.issues, HttpStatus.BAD_REQUEST);
    }

    const email = normaliseEmail(parsed.data.email);
    const found = await this.staff.store.findByEmail(email);

    if (found.isOk()) {
      const { token, digest } = newResetToken();
      const expiresAt = new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000);

      const saved = await this.resets.store.create(
        digest,
        { tenantId: found.value.tenantId, userId: found.value.id },
        expiresAt,
      );

      if (saved.isOk()) {
        const link = `${ADMIN_APP_URL}/?reset=${encodeURIComponent(token)}`;
        // Un fallo del proveedor no puede escaparse: la respuesta es la misma
        // exista o no la dirección, y un 500 sólo cuando el mail existe
        // delataba exactamente lo que ese diseño esconde. Se registra para
        // poder arreglarlo, pero quien pidió el link ve la misma pantalla.
        try {
          await this.resets.mailer.send({
          to: found.value.email,
          subject: 'Cambiá tu contraseña de ITADAKI',
          body: [
            `Hola ${found.value.displayName},`,
            '',
            'Pediste cambiar tu contraseña. Entrá acá para elegir una nueva:',
            link,
            '',
            `El link vence en ${RESET_TOKEN_MINUTES} minutos y se puede usar una sola vez.`,
            'Si no fuiste vos, ignorá este mensaje: tu contraseña sigue igual.',
            ].join('\n'),
          });
        } catch (error) {
          log.error('no se pudo enviar el link de recuperación', {
            detail: String(error),
          });
        }
      }
    }

    return { sent: true };
  }

  /** Completes a reset. The link is single-use and expires on its own. */
  @Public()
  @RateLimit('passwordReset')
  @Post('reset-password')
  async resetPassword(@Body() body: unknown) {
    const parsed = z
      .object({ token: z.string().min(1).max(200), password: z.string().min(1).max(200) })
      .safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error.issues, HttpStatus.BAD_REQUEST);
    }

    // Checked before the token is spent, so a weak password does not burn a
    // valid link and force the person to request another one.
    const checked = validatePassword(parsed.data.password);
    if (checked.isErr()) {
      throw new HttpException(checked.error, HttpStatus.BAD_REQUEST);
    }

    const consumed = await this.resets.store.consume(
      digestOf(parsed.data.token),
      await hashPassword(parsed.data.password),
      new Date(),
    );

    if (consumed.isErr()) {
      throw new HttpException({ kind: 'INVALID_TOKEN' }, HttpStatus.BAD_REQUEST);
    }

    /*
     * Cambiar la contraseña también entra.
     *
     * El botón dice "guardar y entrar" y devolvía al formulario: quien acababa
     * de probar que la casilla es suya y de elegir una contraseña tenía que
     * escribirla otra vez, con el mail incluido, sin ninguna razón visible.
     *
     * El link ya se gastó —es de un solo uso y acaba de consumirse— así que no
     * queda nada reutilizable en la dirección.
     */
    const gente = await this.staff.store.listForTenant(consumed.value.tenantId);
    const quien = gente.isOk()
      ? gente.value.find((persona) => persona.id === consumed.value.userId)
      : undefined;

    // Sin la fila no se puede armar la sesión, pero la contraseña ya quedó
    // cambiada: la pantalla cae al formulario, donde la nueva funciona.
    if (quien === undefined) {
      return { reset: true };
    }

    return { reset: true, ...this.sessionFor(quien) };
  }

  /**
   * Trial state for the signed-in restaurant.
   *
   * Its own endpoint rather than a field on `/me`: the panel polls this after
   * a failed write to explain a 403, and `/me` is cached on boot.
   */
  @Get('subscription')
  async subscription(@Auth() auth: AuthContext) {
    const found = await this.tenants.store.subscriptionFor(auth.tenantId);
    if (found.isErr()) {
      // Unknown state reads as active: never warn a paying customer by mistake.
      return { status: 'ACTIVE', trialEndsAt: null, daysLeft: null, seDioDeBaja: false };
    }

    const described = describeSubscription(found.value, new Date());
    return {
      status: described.status,
      trialEndsAt: described.trialEndsAt?.toISOString() ?? null,
      daysLeft: described.daysLeft,
      // Es lo que decide si el panel le ofrece volver o le pide que pague:
      // los dos casos llegan como SUSPENDED y sin esto son indistinguibles.
      seDioDeBaja: described.seDioDeBaja,
    };
  }

  /**
   * El restaurante se da de baja.
   *
   * La landing lo promete —"te damos de baja cuando quieras, desde tu panel"—
   * y hasta ahora la única forma era escribirnos. Prometer una salida fácil y
   * no darla es peor que no prometerla: quien quiere irse y no puede lo
   * cuenta, y con razón.
   *
   * No corta nada. El mes ya está pagado y el restaurante sigue trabajando
   * hasta que termine; lo que cambia es que no se renueva. Cortar el día que
   * alguien la pide sería quedarse con plata de un servicio que no se dio, y
   * dejar un salón sin sistema en medio del turno.
   *
   * Sólo el dueño: es quien paga y quien recibe la factura. Un encargado con
   * acceso al panel no puede dar de baja el restaurante donde trabaja.
   */
  @Post('darme-de-baja')
  async darmeDeBaja(@Auth() auth: AuthContext) {
    if (auth.role !== 'OWNER') {
      throw new HttpException({ kind: 'SOLO_EL_DUENO' }, HttpStatus.FORBIDDEN);
    }

    const hecho = await this.tenants.store.darDeBaja(auth.tenantId, new Date());
    if (hecho.isErr()) {
      throw new HttpException(hecho.error, HttpStatus.BAD_GATEWAY);
    }

    log.info('un restaurante pidió darse de baja', { tenantId: auth.tenantId });

    // Con el estado nuevo, para que el panel diga hasta cuándo tiene servicio
    // sin tener que volver a preguntar.
    return this.subscription(auth);
  }

  /**
   * Vuelve a suscribirse, después de haberse dado de baja.
   *
   * Es el mismo restaurante, con su carta, sus mesas y su historial: quien se
   * arrepiente a los tres días no tiene por qué volver a cargar todo.
   */
  @Post('reactivar')
  async reactivar(@Auth() auth: AuthContext) {
    if (auth.role !== 'OWNER') {
      throw new HttpException({ kind: 'SOLO_EL_DUENO' }, HttpStatus.FORBIDDEN);
    }

    const hecho = await this.tenants.store.reactivar(auth.tenantId);
    if (hecho.isErr()) {
      throw new HttpException(hecho.error, HttpStatus.BAD_GATEWAY);
    }

    log.info('un restaurante volvió a suscribirse', { tenantId: auth.tenantId });
    return this.subscription(auth);
  }

  /** Confirms a token is still good and returns who it belongs to. */
  @Get('me')
  me(@Auth() auth: AuthContext) {
    return {
      id: auth.userId,
      displayName: auth.displayName,
      role: auth.role,
      tenantId: auth.tenantId,
      permissions: permissionsOf(auth.role),
    };
  }
}
