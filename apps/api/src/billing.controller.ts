import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  type AvisoDePago,
  type EstadoDePago,
  efectoDe,
  nuevoVencimiento,
} from '@itadaki/identity/domain';
import { z } from 'zod';
import { Public } from './auth';
import { RateLimit } from './rate-limit.guard';
import { TenantsService } from './tenants.service';
import { log } from './logger';
import { firmaValida } from './billing-firma';

/**
 * Lo que Mercado Pago manda cuando pasa algo con un cobro.
 *
 * Se valida en vez de confiar: este endpoint es público —tiene que serlo, lo
 * llama un servidor ajeno— así que cualquiera puede mandarle cosas.
 */
const avisoSchema = z.object({
  /** Qué pasó. Lo demás del cuerpo no nos importa. */
  action: z.string().optional(),
  type: z.string().optional(),
  data: z.object({ id: z.string().min(1).max(200) }).optional(),
});

/**
 * Traduce el estado de Mercado Pago al nuestro.
 *
 * La traducción vive acá y no en el dominio: los nombres son de ellos, y el
 * día que se sume otro cobrador la regla de negocio no tiene que enterarse.
 */
function estadoDesdeMercadoPago(estado: string): EstadoDePago {
  switch (estado) {
    case 'approved':
    case 'authorized':
      return 'APROBADO';
    case 'refunded':
    case 'charged_back':
      return 'DEVUELTO';
    case 'cancelled':
    case 'paused':
      return 'CANCELADO';
    case 'rejected':
      return 'RECHAZADO';
    default:
      return 'PENDIENTE';
  }
}

/**
 * Avisos del cobrador.
 *
 * Un endpoint público que mueve plata, así que la firma no es opcional: sin
 * verificarla, cualquiera que sepa la URL se regala meses de servicio con un
 * POST. Si no hay secreto configurado el endpoint rechaza todo, en vez de
 * aceptar a ciegas — un webhook abierto es peor que uno que no anda.
 */
@Controller('billing')
export class BillingController {
  constructor(private readonly tenants: TenantsService) {}

  @Public()
  @RateLimit('diner')
  @Post('mercadopago')
  // 200 aunque no hagamos nada: un error hace que Mercado Pago reintente en
  // bucle, y lo que queremos es que deje de mandar el mismo aviso.
  @HttpCode(HttpStatus.OK)
  async mercadoPago(
    @Body() body: unknown,
    @Headers('x-signature') firma?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<{ ok: boolean }> {
    const secreto = process.env['MP_WEBHOOK_SECRET'];
    if (secreto === undefined || secreto === '') {
      log.error('llegó un aviso de cobro sin MP_WEBHOOK_SECRET configurado');
      return { ok: false };
    }

    const parsed = avisoSchema.safeParse(body);
    if (!parsed.success || parsed.data.data === undefined) {
      return { ok: false };
    }

    const pagoId = parsed.data.data.id;
    if (!firmaValida(firma, requestId, pagoId, secreto)) {
      log.warn('aviso de cobro con firma inválida', { pagoId });
      return { ok: false };
    }

    const cobro = await this.consultarCobro(pagoId);
    if (cobro === null) return { ok: false };

    const aviso: AvisoDePago = {
      tenantId: cobro.tenantId,
      estado: estadoDesdeMercadoPago(cobro.estado),
      referencia: pagoId,
    };

    // Antes de tocar nada: si este aviso ya se aplicó, no se aplica de nuevo.
    const nuevo = await this.tenants.store.registrarAviso(
      aviso.referencia,
      aviso.tenantId,
      aviso.estado,
    );
    if (nuevo.isErr() || !nuevo.value) {
      return { ok: true };
    }

    const efecto = efectoDe(aviso);
    log.info('aviso de cobro', {
      tenantId: aviso.tenantId,
      estado: aviso.estado,
      motivo: efecto.motivo,
    });

    if (efecto.cortaYa) {
      await this.tenants.store.setSubscription(aviso.tenantId, { paidUntil: null });
      return { ok: true };
    }

    if (efecto.mesesQueSuma > 0) {
      const actual = await this.tenants.store.pagoHasta(aviso.tenantId);
      const desde = actual.isOk() ? actual.value : null;
      await this.tenants.store.setSubscription(aviso.tenantId, {
        paidUntil: nuevoVencimiento(desde, efecto.mesesQueSuma, new Date()),
        plan: cobro.plan,
      });
    }

    return { ok: true };
  }

  /**
   * Le pregunta a Mercado Pago qué pasó de verdad.
   *
   * El webhook sólo trae un id: el estado se consulta, no se cree. Un aviso
   * puede llegar tarde, duplicado o fuera de orden, y el único estado que vale
   * es el que tiene el cobrador en el momento de preguntar.
   */
  private async consultarCobro(
    pagoId: string,
  ): Promise<{ tenantId: string; estado: string; plan: string } | null> {
    const token = process.env['MP_ACCESS_TOKEN'];
    if (token === undefined || token === '') {
      log.error('falta MP_ACCESS_TOKEN: no se puede confirmar el cobro');
      return null;
    }

    try {
      const respuesta = await fetch(`https://api.mercadopago.com/v1/payments/${pagoId}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!respuesta.ok) {
        log.warn('Mercado Pago no devolvió el cobro', { pagoId, status: respuesta.status });
        return null;
      }

      const cobro = (await respuesta.json()) as {
        status?: string;
        external_reference?: string;
        metadata?: { plan?: string };
      };

      // `external_reference` es lo que mandamos al crear la suscripción: sin
      // eso no sabemos de qué restaurante es el pago.
      const tenantId = cobro.external_reference;
      if (typeof tenantId !== 'string' || tenantId === '') {
        log.warn('cobro sin restaurante asociado', { pagoId });
        return null;
      }

      return {
        tenantId,
        estado: cobro.status ?? 'pending',
        plan: cobro.metadata?.plan ?? 'pro',
      };
    } catch (error) {
      log.error('no se pudo consultar el cobro', { pagoId, detail: String(error) });
      return null;
    }
  }
}
