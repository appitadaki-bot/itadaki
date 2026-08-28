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
  usuarioLibre,
  validateCredentials,
} from '@itadaki/identity/domain';
import { hashPassword } from '@itadaki/identity/infra';
import { log } from './logger';
import { z } from 'zod';
import { Auth, type AuthContext, RequirePermission, TenantId,
  forgetActiveState,
} from './auth';
import { StaffService } from './staff.service';

const inviteSchema = z.object({
  email: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
  displayName: z.string().min(1).max(60),
  // OWNER is deliberately absent: transferring ownership is not an invite.
  role: z.enum(['MANAGER', 'KITCHEN', 'WAITER']),
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

    let usuario = yaTiene;
    if (usuario === null) {
      const tomados = await this.staff.store.usuariosTomados(tenantId);
      usuario = usuarioLibre(persona.displayName, tomados.isOk() ? tomados.value : new Set());
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

    const checked = validateCredentials(parsed.data.email, parsed.data.password);
    if (checked.isErr()) {
      throw new HttpException(checked.error, HttpStatus.BAD_REQUEST);
    }

    const created = await this.staff.store.create({
      id: crypto.randomUUID(),
      tenantId,
      email: checked.value.email,
      displayName: parsed.data.displayName.trim(),
      role: parsed.data.role as Role,
      active: true,
      passwordHash: await hashPassword(checked.value.password),
    });

    if (created.isErr()) {
      // The email index spans every restaurant, so this is the likely clash.
      const taken = /duplicate key|unique/i.test(JSON.stringify(created.error));
      throw new HttpException(
        taken ? { kind: 'EMAIL_TAKEN', email: checked.value.email } : created.error,
        taken ? HttpStatus.CONFLICT : HttpStatus.BAD_GATEWAY,
      );
    }
    return created.value;
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
