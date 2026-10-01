import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { TOPE_DE_DEMOS, esUnDemo, nuevoIdDeDemo, nuevoPin, venceEn } from '@itadaki/identity/domain';
import { sembrarCarta } from '@itadaki/catalog/infra';
import {
  PostgresDemos,
  PostgresStaffStore,
  PostgresTableStore,
  PostgresTenantStore,
  TABLE_TOKEN_HOURS,
  hashPassword,
  signTableToken,
} from '@itadaki/identity/infra';
import { database } from './database';
import { log } from './logger';

/** Cada cuánto pasa el trapo. Nada urgente: lo vencido ya no entra. */
const BARRER_CADA_MS = 15 * 60_000;

export interface AccesoDemo {
  readonly rol: 'OWNER' | 'KITCHEN' | 'CAJA';
  readonly usuario: string;
  readonly clave: string;
}

export interface DemoCreado {
  readonly tenantId: string;
  readonly expiraEn: Date;
  /** El link del teléfono del comensal, con el token de su mesa adentro. */
  readonly tableToken: string;
  readonly accesos: readonly AccesoDemo[];
}

export type DemoFalla =
  | { readonly kind: 'SIN_LUGAR'; readonly tope: number }
  | { readonly kind: 'NO_SE_PUDO'; readonly detail: string };

/**
 * El restaurante de prueba que se arma solo para quien quiere ver la app.
 *
 * No es un modo aparte: es un restaurante más, con su carta, su mesa y su
 * gente. Todo lo que separa a dos restaurantes de verdad —el aislamiento de
 * la base, los permisos, el token de la mesa— lo separa también de los otros
 * que estén probando al mismo tiempo, sin una línea especial. Lo único propio
 * es que vence y se borra solo.
 */
@Injectable()
export class DemoService implements OnModuleInit, OnModuleDestroy {
  /*
   * Los almacenes son `protected` a propósito: el test los reemplaza por
   * dobles y prueba el orden de las cosas —barrer, contar, crear— sin una
   * base de datos al lado. Es el mismo arreglo que usa `ServicioActivoGuard`.
   */
  protected demos = new PostgresDemos(database);
  protected tenants = new PostgresTenantStore(database);
  protected staff = new PostgresStaffStore(database);
  protected tables = new PostgresTableStore(database);

  /** La siembra de la carta, también reemplazable: toca la base directo. */
  protected sembrar: (tenantId: string) => Promise<void> = (tenantId) =>
    database.withTenant(tenantId, (client) => sembrarCarta(client, tenantId));

  private reloj: ReturnType<typeof setInterval> | null = null;

  onModuleInit(): void {
    if (process.env['USE_POSTGRES'] === 'false') return;

    // Al arrancar y cada tanto. Es el mismo patrón que el archivado de
    // pedidos y el barrido de mesas: un reloj adentro de la propia API, sin
    // tarea programada aparte que haya que pagar.
    void this.barrer();
    this.reloj = setInterval(() => void this.barrer(), BARRER_CADA_MS);
    this.reloj.unref?.();
  }

  onModuleDestroy(): void {
    if (this.reloj !== null) clearInterval(this.reloj);
    this.reloj = null;
  }

  /** Borra los vencidos. Devuelve cuántos, para el log. */
  async barrer(): Promise<number> {
    const borrados = await this.demos.barrerVencidos(new Date());
    if (borrados.isErr()) {
      log.warn('no se pudieron barrer los restaurantes de prueba', {
        error: borrados.error.detail,
      });
      return 0;
    }

    if (borrados.value.length > 0) {
      log.info('restaurantes de prueba vencidos, borrados', { total: borrados.value.length });
    }
    return borrados.value.length;
  }

  /** Cuándo vence este restaurante de prueba, o null si no es uno. */
  async vencimientoDe(tenantId: string): Promise<Date | null> {
    if (!esUnDemo(tenantId)) return null;
    const fecha = await this.demos.vencimientoDe(tenantId);
    return fecha.isOk() ? fecha.value : null;
  }

  /**
   * Arma uno nuevo, entero: restaurante, carta, mesa y tres cuentas.
   *
   * Tres y no una: lo que hay que mostrar es que las pantallas se hablan —el
   * pedido sale del teléfono, aparece en la cocina, se cobra en el salón— y
   * con una sola cuenta eso no se ve.
   */
  async crear(ahora: Date): Promise<
    { ok: true; demo: DemoCreado } | { ok: false; error: DemoFalla }
  > {
    // Primero el trapo: el que llega limpia lo que dejó el anterior, así el
    // tope no se llena de muertos aunque la instancia haya estado dormida.
    await this.barrer();

    const vivos = await this.demos.cuantosViven(ahora);
    if (vivos.isErr()) {
      return { ok: false, error: { kind: 'NO_SE_PUDO', detail: vivos.error.detail } };
    }
    if (vivos.value >= TOPE_DE_DEMOS) {
      return { ok: false, error: { kind: 'SIN_LUGAR', tope: TOPE_DE_DEMOS } };
    }

    const tenantId = nuevoIdDeDemo((n) => new Uint8Array(randomBytes(n)));
    const expiraEn = venceEn(ahora);

    try {
      const accesos = await this.armar(tenantId);
      const anotado = await this.demos.anotar(tenantId, expiraEn);
      if (anotado.isErr()) {
        // Sin fila en `demos` nadie lo barre nunca: antes de dejar basura
        // eterna, se deshace lo hecho.
        await this.demos.barrerVencidos(new Date(expiraEn.getTime() + 1));
        return { ok: false, error: { kind: 'NO_SE_PUDO', detail: anotado.error.detail } };
      }

      log.info('restaurante de prueba creado', { tenantId, expiraEn: expiraEn.toISOString() });
      return { ok: true, demo: { tenantId, expiraEn, ...accesos } };
    } catch (error) {
      return { ok: false, error: { kind: 'NO_SE_PUDO', detail: String(error) } };
    }
  }

  /** El restaurante en sí: dueño, carta, mesa y el resto del equipo. */
  private async armar(
    tenantId: string,
  ): Promise<{ tableToken: string; accesos: readonly AccesoDemo[] }> {
    const sufijo = tenantId.slice('demo-'.length);
    const claveDelDueno = `Prueba${randomBytes(4).toString('hex')}`;
    const mailDelDueno = `dueno-${sufijo}@prueba.itadaki.app`;

    const alta = await this.tenants.signUp({
      tenantId,
      name: 'Restaurante de prueba',
      slug: tenantId,
      currency: 'ARS',
      staff: {
        id: randomUUID(),
        email: mailDelDueno,
        displayName: 'Dueño de prueba',
        passwordHash: await hashPassword(claveDelDueno),
        role: 'OWNER',
      },
    });
    if (alta.isErr()) {
      throw new Error(`no se pudo crear el restaurante: ${JSON.stringify(alta.error)}`);
    }

    await this.sembrar(tenantId);

    const mesa = await this.tables.save({ tenantId, id: 'mesa-1', label: 'Mesa 1', seats: 4 });
    if (mesa.isErr()) {
      throw new Error(`no se pudo crear la mesa: ${JSON.stringify(mesa.error)}`);
    }

    const ahora = Date.now();
    const tableToken = signTableToken(
      {
        tenantId,
        tableId: mesa.value.id,
        issuedAt: ahora,
        expiresAt: ahora + TABLE_TOKEN_HOURS * 60 * 60_000,
      },
      mesa.value.secret,
    );

    const accesos: AccesoDemo[] = [
      { rol: 'OWNER', usuario: mailDelDueno, clave: claveDelDueno },
      await this.conPin(tenantId, 'KITCHEN', `cocina${sufijo}`, 'Cocina de prueba'),
      await this.conPin(tenantId, 'CAJA', `salon${sufijo}`, 'Salón de prueba'),
    ];

    return { tableToken, accesos };
  }

  /**
   * Una cuenta de las que entran con usuario y PIN.
   *
   * El mail es interno e inventado, como el de cualquier mozo: la columna es
   * única en toda la base y no puede quedar vacía. Nadie escribe ahí.
   */
  private async conPin(
    tenantId: string,
    rol: 'KITCHEN' | 'CAJA',
    usuario: string,
    nombre: string,
  ): Promise<AccesoDemo> {
    const userId = randomUUID();
    const pin = nuevoPin();

    const creado = await this.staff.create({
      id: userId,
      tenantId,
      email: `${usuario}@sin-mail.itadaki`,
      displayName: nombre,
      role: rol,
      active: true,
      // Sin contraseña utilizable: entra con su PIN, como el personal real.
      passwordHash: await hashPassword(randomUUID()),
    });
    if (creado.isErr()) {
      throw new Error(`no se pudo crear ${rol}: ${JSON.stringify(creado.error)}`);
    }

    const guardado = await this.staff.guardarPin(tenantId, userId, usuario, await hashPassword(pin));
    if (guardado.isErr()) {
      throw new Error(`no se pudo guardar el PIN de ${rol}: ${JSON.stringify(guardado.error)}`);
    }

    return { rol, usuario, clave: pin };
  }
}
