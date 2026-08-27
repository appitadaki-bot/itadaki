import { Body, Controller, Get, HttpException, HttpStatus, Patch } from '@nestjs/common';
import { descuentoDe } from '@itadaki/billing/domain';
import { z } from 'zod';
import { Public, RequirePermission, Scope, TenantId, type DinerScope, TableScoped } from './auth';
import { TenantsService } from './tenants.service';

const descuentoSchema = z.object({
  /** En puntos porcentuales enteros: el dueño escribe "10", no "0.1". */
  puntos: z.number().int().min(0).max(50),
});

/**
 * Lo que el restaurante configura sobre sí mismo.
 *
 * Hoy sólo el descuento por pagar en efectivo. Vive aparte de la carta y del
 * personal porque no es ninguna de las dos cosas: es cómo cobra el local.
 */
@Controller('ajustes')
export class AjustesController {
  constructor(private readonly tenants: TenantsService) {}

  /**
   * Lo que el panel muestra en el formulario.
   *
   * Pide `menu:write` y no `menu:read`: esto lo configura quien decide los
   * precios, y un mozo no tiene por qué ver —ni tocar— con cuánto margen
   * trabaja el local.
   */
  @RequirePermission('menu:write')
  @Get()
  async ver(@TenantId() tenantId: string) {
    const puntos = await this.tenants.store.descuentoEnEfectivo(tenantId);
    if (puntos.isErr()) {
      throw new HttpException(puntos.error, HttpStatus.BAD_GATEWAY);
    }
    return { descuentoEfectivo: puntos.value };
  }

  @RequirePermission('menu:write')
  @Patch('descuento')
  async guardarDescuento(@Body() body: unknown, @TenantId() tenantId: string) {
    const parsed = descuentoSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error.issues, HttpStatus.BAD_REQUEST);
    }

    // El dominio vuelve a validarlo: el schema cuida la forma, y esto la
    // regla. Un tope que vive en dos lados se corrige en dos lados.
    const valido = descuentoDe(parsed.data.puntos / 100);
    if (valido.isErr()) {
      throw new HttpException(valido.error, HttpStatus.BAD_REQUEST);
    }

    const guardado = await this.tenants.store.guardarDescuento(tenantId, parsed.data.puntos);
    if (guardado.isErr()) {
      throw new HttpException(guardado.error, HttpStatus.BAD_GATEWAY);
    }

    return { descuentoEfectivo: parsed.data.puntos };
  }

  /**
   * Lo que la mesa necesita saber, sin sesión de personal.
   *
   * La pantalla de la cuenta lo usa para decir "pagando en efectivo ahorrás
   * X" antes de que elijan. Devuelve sólo el porcentaje: no hay nada más del
   * local que el comensal tenga que ver desde acá.
   */
  @Public()
  @TableScoped()
  @Get('publicos')
  async publicos(@Scope() scope: DinerScope) {
    const puntos = await this.tenants.store.descuentoEnEfectivo(scope.tenantId);
    // Un fallo de lectura devuelve cero en vez de un error: la cuenta tiene
    // que poder mostrarse igual, sólo que sin anunciar el descuento.
    return { descuentoEfectivo: puntos.isOk() ? puntos.value : 0 };
  }
}
