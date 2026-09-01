import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ROLES,
  type Role,
  nuevoPin,
  nombreDeUsuario,
  usuarioLibre,
} from '@itadaki/identity/domain';
import { hashPassword } from '@itadaki/identity/infra';
import { log } from './logger';
import { z } from 'zod';
import { Auth, type AuthContext, RequirePermission, TenantId,
  forgetActiveState,
} from './auth';
import { StaffService } from './staff.service';

/**
 * Dar de alta a alguien del equipo.
 *
 * Sólo el nombre y el puesto: el usuario y el PIN los genera el sistema. Pedir
 * un mail era pedirle al dueño algo que el mozo de diecinueve años no tiene
 * —usaría el suyo personal, no lo verificaría nunca, y quedaría dentro del
 * sistema cuando renuncie— y una contraseña que el dueño inventa se dicta peor
 * que seis dígitos.
 */
const inviteSchema = z.object({
  displayName: z.string().min(1).max(60),
  // OWNER is deliberately absent: transferring ownership is not an invite.
  role: z.enum(['MANAGER', 'KITCHEN', 'WAITER']),
  /** Opcional: si el dueño quiere elegirlo en vez de aceptar el sugerido. */
  usuario: z.string().min(1).max(30).optional(),
});

const activeSchema = z.object({ active: z.boolean() });

/** Team management for a restaurant. Gated on `staff:manage`, so owners and managers only. */
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  /** Roles the panel may offer, so the UI never invents one the API rejects. */
  /**
   * Le genera —o le regenera— usuario y PIN a alguien del personal.
   *
   * El PIN se devuelve una sola vez, en claro, para que el dueño se lo dicte.
   * Después queda hasheado y nadie puede volver a leerlo: si se pierde, se
   * genera otro. Eso es más simple que recuperarlo y evita el correo, que es
   * justamente lo que el mozo no tiene.
   */
  @RequirePermission('staff:manage')
  @Post(':id/pin')
  async generarPin(@Param('id') userId: string, @TenantId() tenantId: string) {
    const gente = await this.staff.store.listForTenant(tenantId);
    if (gente.isErr()) {
      throw new HttpException(gente.error, HttpStatus.BAD_GATEWAY);
    }

    const persona = gente.value.find((quien) => quien.id === userId);
    if (persona === undefined) {
      throw new HttpException({ kind: 'NOT_FOUND' }, HttpStatus.NOT_FOUND);
    }

    // El dueño entra con mail y contraseña: es quien cambia precios, ve la
    // facturación y da de baja gente, y un PIN de seis dígitos dictado en el
    // salón no protege eso.
    if (persona.role === 'OWNER') {
      throw new HttpException({ kind: 'DUENO_NO_USA_PIN' }, HttpStatus.BAD_REQUEST);
    }

    /*
     * El usuario se elige una sola vez y después no cambia.
     *
     * Al regenerar el PIN, el usuario que ya tenía figura entre los tomados
     * —es el suyo— así que buscar uno libre le daba "mozo2" y lo dejaba sin
     * poder entrar con el nombre que le habían dictado. Se conserva el que
     * tiene, y sólo se inventa uno cuando todavía no hay ninguno.
     */
    const suyo = await this.staff.store.usuarioDe(tenantId, userId);
    const yaTiene = suyo.isOk() ? suyo.value : null;

    // Global y no por local: el usuario identifica a la persona en toda la
    // base, así que uno libre acá tiene que estarlo en todos lados.
    const usuario = yaTiene ?? (await this.usuarioLibreGlobal(persona.displayName));

    const pin = nuevoPin();
    const guardado = await this.staff.store.guardarPin(
      tenantId,
      userId,
      usuario,
      await hashPassword(pin),
    );
    if (guardado.isErr()) {
      throw new HttpException(guardado.error, HttpStatus.BAD_GATEWAY);
    }

    log.info('PIN generado para alguien del personal', { tenantId, userId });

    // La única vez que el PIN sale en claro.
    return { usuario, pin };
  }

  @RequirePermission('staff:manage')
  @Get('roles')
  roles() {
    return ROLES.filter((role) => role !== 'OWNER');
  }

  @RequirePermission('staff:manage')
  @Get()
  async list(@TenantId() tenantId: string) {
    const found = await this.staff.store.listForTenant(tenantId);
    if (found.isErr()) {
      throw new HttpException(found.error, HttpStatus.BAD_GATEWAY);
    }
    return found.value;
  }

  /**
   * Creates an account for a colleague.
   *
   * The owner sets the first password and passes it on: a restaurant hiring a
   * cook on a Friday night needs them working now, not waiting on an email
   * that may never arrive. Password reset is still a gap — see the README.
   */
  @RequirePermission('staff:manage')
  @Post()
  async invite(@Body() body: unknown, @TenantId() tenantId: string) {
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error.issues, HttpStatus.BAD_REQUEST);
    }

    /*
     * El usuario, único en toda la base.
     *
     * Que "nico" identifique a una persona y no a una etiqueta que se repite
     * en veinte locales es lo que permite que el mismo mozo use un solo
     * usuario en los dos restaurantes donde trabaja. El costo se paga acá: el
     * segundo "nico" del sistema va a ser "nico2", y el alta lo resuelve sola.
     */
    const pedido = parsed.data.usuario ?? parsed.data.displayName;
    const usuario = await this.usuarioLibreGlobal(pedido);

    if (parsed.data.usuario !== undefined && usuario !== parsed.data.usuario) {
      // Si lo eligió a mano, no se le cambia por otro en silencio: se le dice
      // que está tomado y se le sugiere uno.
      throw new HttpException(
        { kind: 'USUARIO_TOMADO', sugerido: usuario },
        HttpStatus.CONFLICT,
      );
    }

    const userId = crypto.randomUUID();
    const created = await this.staff.store.create({
      id: userId,
      tenantId,
      /*
       * Sin mail.
       *
       * La columna existe y es única en toda la base, así que no puede quedar
       * vacía para dos personas. Se guarda una dirección interna derivada del
       * usuario: no recibe correo ni sirve para entrar —el personal entra con
       * usuario y PIN— y sólo está para que la fila sea válida.
       */
      email: `${usuario}@sin-mail.itadaki`,
      displayName: parsed.data.displayName.trim(),
      role: parsed.data.role as Role,
      active: true,
      // Sin contraseña utilizable: entra con su PIN. Un hash de algo que nadie
      // conoce es lo que hace que ese camino quede cerrado.
      passwordHash: await hashPassword(crypto.randomUUID()),
    });

    if (created.isErr()) {
      const taken = /duplicate key|unique/i.test(JSON.stringify(created.error));
      throw new HttpException(
        taken ? { kind: 'USUARIO_TOMADO', sugerido: usuario } : created.error,
        taken ? HttpStatus.CONFLICT : HttpStatus.BAD_GATEWAY,
      );
    }

    const pin = nuevoPin();
    const guardado = await this.staff.store.guardarPin(
      tenantId,
      userId,
      usuario,
      await hashPassword(pin),
    );
    if (guardado.isErr()) {
      throw new HttpException(guardado.error, HttpStatus.BAD_GATEWAY);
    }

    log.info('alta de personal con usuario y PIN', { tenantId, userId });

    // La única vez que el PIN sale en claro: el dueño lo copia y se lo pasa.
    return { ...created.value, usuario, pin };
  }

  /**
   * Un usuario libre, mirando todos los restaurantes.
   *
   * `usuarioLibre` decide la forma —minúsculas, sin acentos, con sufijo si
   * hace falta— y esto le dice qué está tomado. Se consulta de a uno porque
   * la base no deja listar usuarios ajenos, que es exactamente lo que
   * queremos: saber si "nico" existe no puede revelar dónde trabaja.
   */
  private async usuarioLibreGlobal(base: string): Promise<string> {
    const tomados = new Set<string>();

    for (let intento = 0; intento < 20; intento += 1) {
      const candidato = usuarioLibre(base, tomados);
      const ocupado = await this.staff.store.usuarioTomado(candidato);

      if (ocupado.isErr() || !ocupado.value) return candidato;
      tomados.add(candidato);
    }

    // Veinte homónimos en el sistema no va a pasar, pero devolver algo siempre
    // es mejor que un bucle sin fin.
    return usuarioLibre(`${base}${Date.now()}`, new Set());
  }

  /**
   * Suma a alguien que ya trabaja en otro restaurante.
   *
   * Es lo que hace útil que el usuario sea único: en gastronomía trabajar en
   * dos lugares es lo normal, y esa persona tiene que poder entrar a los dos
   * con un solo usuario y un solo PIN en vez de llevar dos cuentas que no se
   * conocen entre sí.
   *
   * El dueño escribe el usuario que la persona le dicta. No hay forma de
   * buscar en el padrón: saber si "nico" existe no puede revelar dónde
   * trabaja, así que el dato lo trae quien ya lo tiene.
   *
   * El PIN es el mismo: es la misma persona. Por eso acá no se genera ninguno
   * —el que ya usa le sirve— y no hay nada que dictar.
   */
  @RequirePermission('staff:manage')
  @Post('sumar')
  async sumar(@Body() body: unknown, @TenantId() tenantId: string) {
    const parsed = z
      .object({
        usuario: z.string().min(1).max(30),
        role: z.enum(['MANAGER', 'KITCHEN', 'WAITER']),
      })
      .safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error.issues, HttpStatus.BAD_REQUEST);
    }

    const limpio = nombreDeUsuario(parsed.data.usuario);
    if (limpio.isErr()) {
      throw new HttpException({ kind: 'USUARIO_NO_EXISTE' }, HttpStatus.NOT_FOUND);
    }

    const locales = await this.staff.store.localesDe(limpio.value);
    if (locales.isErr() || locales.value.length === 0) {
      // Sin decir si el usuario existe pero no lo encontramos, o si no existe:
      // es la misma respuesta, y separarlas dejaría averiguar el padrón.
      throw new HttpException({ kind: 'USUARIO_NO_EXISTE' }, HttpStatus.NOT_FOUND);
    }

    const yaEstaAca = locales.value.find((una) => una.tenantId === tenantId);
    if (yaEstaAca !== undefined) {
      throw new HttpException({ kind: 'YA_ESTA_EN_EL_EQUIPO' }, HttpStatus.CONFLICT);
    }

    // La fila de referencia: de ahí salen el nombre y el PIN, que son de la
    // persona y no del puesto que tenga en cada lugar.
    const persona = locales.value[0];
    if (persona === undefined) {
      throw new HttpException({ kind: 'USUARIO_NO_EXISTE' }, HttpStatus.NOT_FOUND);
    }

    const userId = crypto.randomUUID();
    const created = await this.staff.store.create({
      id: userId,
      tenantId,
      // Otra fila, otro mail interno: la columna es única en toda la base.
      email: `${limpio.value}+${tenantId}@sin-mail.itadaki`,
      displayName: persona.displayName,
      // El puesto es de este local: mozo acá puede ser encargado allá.
      role: parsed.data.role as Role,
      active: true,
      passwordHash: await hashPassword(crypto.randomUUID()),
    });

    if (created.isErr()) {
      throw new HttpException(created.error, HttpStatus.BAD_GATEWAY);
    }

    // El mismo usuario y el mismo PIN: es la misma persona entrando a otro
    // lugar, no una cuenta nueva.
    const guardado = await this.staff.store.guardarPin(
      tenantId,
      userId,
      limpio.value,
      persona.pinHash,
    );
    if (guardado.isErr()) {
      throw new HttpException(guardado.error, HttpStatus.BAD_GATEWAY);
    }

    log.info('se sumó alguien que ya trabajaba en otro local', { tenantId, userId });

    return { ...created.value, usuario: limpio.value, pinNuevo: false };
  }

  /** Revokes or restores access; the account itself is kept for the audit trail. */
  @RequirePermission('staff:manage')
  @Patch(':id/active')
  async setActive(
    @Param('id') userId: string,
    @Body() body: unknown,
    @TenantId() tenantId: string,
    @Auth() auth: AuthContext,
  ) {
    const parsed = activeSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error.issues, HttpStatus.BAD_REQUEST);
    }

    // Locking yourself out of your own restaurant has no undo from the UI.
    if (userId === auth.userId) {
      throw new HttpException({ kind: 'CANNOT_DEACTIVATE_SELF' }, HttpStatus.CONFLICT);
    }

    const updated = await this.staff.store.setActive(tenantId, userId, parsed.data.active);
    if (updated.isErr()) {
      throw new HttpException(updated.error, HttpStatus.NOT_FOUND);
    }

    // Takes effect now rather than whenever the cached state ages out: the
    // person doing this is standing in front of the screen expecting it to.
    forgetActiveState(tenantId, userId);
    return updated.value;
  }
}
