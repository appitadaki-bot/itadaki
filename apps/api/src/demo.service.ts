import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { TOPE_DE_DEMOS, esUnDemo, nuevoIdDeDemo, nuevoPin, venceEn } from '@itadaki/identity/domain';
import { CATEGORIES, PRODUCTS, sembrarCarta } from '@itadaki/catalog/infra';
import {
  InMemoryDemos,
  InMemoryStaffStore,
  InMemoryTableStore,
  InMemoryTenantStore,
  PostgresDemos,
  PostgresStaffStore,
  PostgresTableStore,
  PostgresTenantStore,
  TABLE_TOKEN_HOURS,
  hashPassword,
  signTableToken,
  signToken,
} from '@itadaki/identity/infra';
import { AUTH_SECRET } from './auth';
import { CatalogService } from './catalog.service';
import { database } from './database';
import { log } from './logger';

/** Cada cuánto pasa el trapo. Nada urgente: lo vencido ya no entra. */
const BARRER_CADA_MS = 15 * 60_000;

export interface AccesoDemo {
  readonly rol: 'OWNER' | 'KITCHEN' | 'CAJA';
  readonly usuario: string;
  readonly clave: string;
  /**
   * La sesión ya iniciada, para entrar sin pasar por el login.
   *
   * El que toca "Probar la app" no eligió este usuario ni este PIN: se los
   * acabamos de inventar nosotros. Hacerle copiar seis dígitos entre dos
   * pestañas para ver una demo es perder a la mitad en la puerta, y lo que
   * hay del otro lado es un restaurante inventado que se borra en dos horas.
   *
   * Es el mismo token que devuelve el login de verdad, firmado igual y con
   * los mismos permisos del rol. Vence cuando vence el restaurante: cuando
   * ya no hay nada que mirar, tampoco queda una llave dando vueltas.
   */
  readonly token: string;
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
  /*
   * Contra Postgres, o en memoria.
   *
   * El mismo interruptor que usan la carta, los pedidos y las mesas. Sin esto
   * el alta de un restaurante de prueba era lo único de la API que exigía una
   * base de verdad, y en una máquina sin Docker la pantalla de la demo no
   * había forma de probarla.
   */
  private readonly conPostgres = process.env['USE_POSTGRES'] !== 'false';

  protected demos = this.conPostgres ? new PostgresDemos(database) : new InMemoryDemos();
  protected tenants = this.conPostgres
    ? new PostgresTenantStore(database)
    : new InMemoryTenantStore();
  protected staff = this.conPostgres ? new PostgresStaffStore(database) : new InMemoryStaffStore();
  protected tables = this.conPostgres ? new PostgresTableStore(database) : new InMemoryTableStore();

  /** La siembra de la carta, también reemplazable: toca la base directo. */
  protected sembrar: (tenantId: string) => Promise<void> = (tenantId) =>
    this.conPostgres
      ? database.withTenant(tenantId, (client) => sembrarCarta(client, tenantId))
      : this.sembrarEnMemoria(tenantId);

  private reloj: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly catalogo: CatalogService) {}

  /**
   * La carta de ejemplo, copiada al restaurante de prueba.
   *
   * `sembrarCarta` escribe SQL, así que en memoria no sirve: se guarda por el
   * mismo store que lee la app, que es uno solo para todo el proceso. Es el
   * fixture con otro dueño, igual que contra Postgres — cada copia es
   * independiente y tocar un precio acá no toca el de nadie.
   */
  private async sembrarEnMemoria(tenantId: string): Promise<void> {
    for (const categoria of CATEGORIES) {
      await this.catalogo.categoryWriter.save({ ...categoria, tenantId });
    }
    for (const plato of PRODUCTS) {
      await this.catalogo.products.save({ ...plato, tenantId });
    }
  }

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
      const accesos = await this.armar(tenantId, expiraEn);
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
    expiraEn: Date,
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

    const mesa = await this.tables.save({ tenantId, id: 'mesa-1', label: 'Mesa 1' });
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
      {
        rol: 'OWNER',
        usuario: mailDelDueno,
        clave: claveDelDueno,
        token: this.sesionDe(alta.value.owner.id, tenantId, 'OWNER', 'Dueño de prueba', expiraEn),
      },
      await this.conPin(tenantId, 'KITCHEN', `cocina${sufijo}`, 'Cocina de prueba', expiraEn),
      await this.conPin(tenantId, 'CAJA', `salon${sufijo}`, 'Salón de prueba', expiraEn),
    ];

    return { tableToken, accesos };
  }

  /**
   * Un token de sesión igual al que da el login, sin pasar por el login.
   *
   * Se firma acá y no se pide al endpoint de login porque son tres cuentas y
   * serían tres viajes más contra una instancia que recién se despierta. El
   * secreto y el formato son los mismos: lo que se emite no es una llave
   * especial, es la de siempre con menos vida.
   */
  private sesionDe(
    userId: string,
    tenantId: string,
    role: 'OWNER' | 'KITCHEN' | 'CAJA',
    displayName: string,
    expiraEn: Date,
  ): string {
    return signToken(
      { userId, tenantId, role, displayName, expiresAt: expiraEn.getTime() },
      AUTH_SECRET,
    );
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
    expiraEn: Date,
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

    return { rol, usuario, clave: pin, token: this.sesionDe(userId, tenantId, rol, nombre, expiraEn) };
  }
}
