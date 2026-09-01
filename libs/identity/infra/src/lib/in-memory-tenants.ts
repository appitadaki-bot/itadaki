import { type Tenant, type TrialInput } from '@itadaki/identity/domain';
import { type Result, err, ok } from '@itadaki/shared/domain';
import { InMemoryStaffStore } from './in-memory-staff';
import { type SignUpInput, type TenantError } from './postgres-tenants';

interface Fila {
  readonly tenant: Tenant;
  trialEndsAt: Date | null;
  paid: boolean;
  paidUntil: Date | null;
  estrenado: boolean;
  plan: string | null;
  /** Puntos porcentuales de descuento por pagar en efectivo. */
  descuento: number;
}

/**
 * Los restaurantes, en memoria, para levantar sin base de datos.
 *
 * El alta y la verificación del mail iban a Postgres aunque el resto corriera
 * en memoria, así que registrarse en local fallaba en silencio: la cuenta se
 * creaba a medias y el mail de verificación nunca salía, porque guardar su
 * token fallaba primero.
 */
export class InMemoryTenantStore {
  /** Compartidas entre instancias: cada guard construye su propio store. */
  private static readonly locales = new Map<string, Fila>();

  /** Los ajustes de los locales que no están en el mapa, como el sembrado. */
  private static readonly ajustes = new Map<string, number>();

  /** Las reseñas: link y contadores, por local. */
  private static readonly resenasPorLocal = new Map<
    string,
    { url: string | null; asks: number; taps: number }
  >();

  /** Los avisos de cobro ya aplicados, para no aplicar dos veces el mismo. */
  private static readonly avisos = new Set<string>();

  /** email → token pendiente de verificación. */
  private static readonly verificaciones = new Map<
    string,
    { digest: string; expiraEn: Date }
  >();

  /** Qué mails ya se confirmaron. */
  private static readonly verificados = new Set<string>();

  /** Vacía todo; sirve en los tests, donde el estado se filtraría entre casos. */
  static reset(): void {
    InMemoryTenantStore.locales.clear();
    InMemoryTenantStore.ajustes.clear();
    InMemoryTenantStore.resenasPorLocal.clear();
    InMemoryTenantStore.avisos.clear();
    InMemoryTenantStore.verificaciones.clear();
    InMemoryTenantStore.verificados.clear();
    InMemoryStaffStore.compartidas.clear();
  }

  async subscriptionFor(tenantId: string): Promise<Result<TrialInput, TenantError>> {
    const fila = InMemoryTenantStore.locales.get(tenantId);
    if (fila === undefined) {
      // El local sembrado no está en este mapa: se trata como al día, que es
      // lo que hace falta para probar sin registrarse cada vez.
      return ok({ trialEndsAt: null, paid: true, estrenado: true });
    }

    const alDia = fila.paid || (fila.paidUntil !== null && fila.paidUntil > new Date());
    return ok({
      trialEndsAt: fila.trialEndsAt,
      paid: alDia,
      estrenado: fila.estrenado,
    });
  }

  async setSubscription(
    tenantId: string,
    update: { trialEndsAt?: Date; paid?: boolean; paidUntil?: Date | null; plan?: string },
  ): Promise<Result<void, TenantError>> {
    const fila = InMemoryTenantStore.locales.get(tenantId);
    if (fila === undefined) return ok(undefined);

    if (update.trialEndsAt !== undefined) fila.trialEndsAt = update.trialEndsAt;
    if (update.paid !== undefined) fila.paid = update.paid;
    // `paidUntil: null` significa cortarlo, que es distinto de no mandarlo.
    if ('paidUntil' in update) fila.paidUntil = update.paidUntil ?? null;
    if (update.plan !== undefined) fila.plan = update.plan;

    return ok(undefined);
  }

  async registrarAviso(
    referencia: string,
    _tenantId: string,
    _estado: string,
  ): Promise<Result<boolean, TenantError>> {
    if (InMemoryTenantStore.avisos.has(referencia)) return ok(false);
    InMemoryTenantStore.avisos.add(referencia);
    return ok(true);
  }

  async pagoHasta(tenantId: string): Promise<Result<Date | null, TenantError>> {
    return ok(InMemoryTenantStore.locales.get(tenantId)?.paidUntil ?? null);
  }

  async estrenar(tenantId: string, ahora: Date): Promise<Result<boolean, TenantError>> {
    const fila = InMemoryTenantStore.locales.get(tenantId);
    if (fila === undefined || fila.estrenado) return ok(false);

    fila.estrenado = true;
    fila.trialEndsAt = new Date(ahora.getTime() + 30 * 86_400_000);
    return ok(true);
  }

  async pedirVerificacion(
    email: string,
    digest: string,
    expiraEn: Date,
  ): Promise<Result<void, TenantError>> {
    InMemoryTenantStore.verificaciones.set(email.toLowerCase(), { digest, expiraEn });
    return ok(undefined);
  }

  async verificarMail(digest: string, ahora: Date): Promise<Result<string | null, TenantError>> {
    for (const [email, pendiente] of InMemoryTenantStore.verificaciones) {
      if (pendiente.digest !== digest) continue;
      // Un token vencido no verifica nada, igual que en Postgres.
      if (pendiente.expiraEn <= ahora) return ok(null);

      InMemoryTenantStore.verificaciones.delete(email);
      InMemoryTenantStore.verificados.add(email);

      // El mail y no el local: verificar también abre la sesión, y con el
      // local solo no se sabe cuál de las personas abrió el link.
      return ok(email);
    }
    return ok(null);
  }

  /** Cómo se llaman estos restaurantes. Lo mismo que en Postgres. */
  async nombresDe(ids: readonly string[]): Promise<Result<Map<string, string>, TenantError>> {
    const nombres = new Map<string, string>();
    for (const id of ids) {
      const local = InMemoryTenantStore.locales.get(id);
      if (local !== undefined) nombres.set(id, local.tenant.name);
    }
    return ok(nombres);
  }

  async mailVerificado(email: string): Promise<Result<boolean, TenantError>> {
    return ok(InMemoryTenantStore.verificados.has(email.toLowerCase()));
  }

  async descuentoEnEfectivo(tenantId: string): Promise<Result<number, TenantError>> {
    const fila = InMemoryTenantStore.locales.get(tenantId);
    if (fila !== undefined) return ok(fila.descuento);
    return ok(InMemoryTenantStore.ajustes.get(tenantId) ?? 0);
  }

  /**
   * Guarda el descuento, incluso del local sembrado.
   *
   * El de demostración no está en este mapa —nadie lo registró— así que sin
   * esto guardar no hacía nada y el ajuste se perdía en silencio, que es
   * justo lo que hace imposible probarlo.
   */
  async guardarDescuento(tenantId: string, puntos: number): Promise<Result<void, TenantError>> {
    const fila = InMemoryTenantStore.locales.get(tenantId);

    if (fila === undefined) {
      InMemoryTenantStore.ajustes.set(tenantId, puntos);
      return ok(undefined);
    }

    fila.descuento = puntos;
    return ok(undefined);
  }

  async resenas(
    tenantId: string,
  ): Promise<Result<{ url: string | null; asks: number; taps: number }, TenantError>> {
    return ok(
      InMemoryTenantStore.resenasPorLocal.get(tenantId) ?? { url: null, asks: 0, taps: 0 },
    );
  }

  async guardarResenas(tenantId: string, url: string | null): Promise<Result<void, TenantError>> {
    const previo = InMemoryTenantStore.resenasPorLocal.get(tenantId) ?? {
      url: null,
      asks: 0,
      taps: 0,
    };
    InMemoryTenantStore.resenasPorLocal.set(tenantId, { ...previo, url });
    return ok(undefined);
  }

  async contarResena(tenantId: string, cual: 'ask' | 'tap'): Promise<Result<void, TenantError>> {
    const previo = InMemoryTenantStore.resenasPorLocal.get(tenantId) ?? {
      url: null,
      asks: 0,
      taps: 0,
    };
    InMemoryTenantStore.resenasPorLocal.set(tenantId, {
      ...previo,
      asks: previo.asks + (cual === 'ask' ? 1 : 0),
      taps: previo.taps + (cual === 'tap' ? 1 : 0),
    });
    return ok(undefined);
  }

  async takenSlugs(prefix: string): Promise<Result<ReadonlySet<string>, TenantError>> {
    const usados = new Set(
      [...InMemoryTenantStore.locales.values()]
        .map((fila) => fila.tenant.slug)
        .filter((slug) => slug.startsWith(prefix)),
    );
    return ok(usados);
  }

  async signUp(
    input: SignUpInput,
  ): Promise<Result<{ tenant: Tenant; owner: import('@itadaki/identity/domain').StaffUser }, TenantError>> {
    const email = input.staff.email.toLowerCase();

    // Con el personal de demostración ya cargado: el mapa se llena la primera
    // vez que alguien lo consulta, y sin esto un alta antes del primer login
    // no veía a la gente de la demo.
    await new InMemoryStaffStore().sembrar();

    // El índice de mails es global en Postgres, así que acá también.
    if (InMemoryStaffStore.compartidas.has(email)) {
      return err({ kind: 'EMAIL_TAKEN', email: input.staff.email });
    }

    const tenant: Tenant = {
      id: input.tenantId,
      name: input.name,
      slug: input.slug,
      currency: input.currency,
      timezone: 'America/Argentina/Buenos_Aires',
      active: true,
    };

    InMemoryTenantStore.locales.set(tenant.id, {
      tenant,
      // Sin fecha: el reloj arranca con el primer pedido, igual que en Postgres.
      trialEndsAt: null,
      paid: false,
      paidUntil: null,
      estrenado: false,
      plan: null,
      descuento: 0,
    });

    const owner = {
      id: input.staff.id,
      tenantId: input.tenantId,
      email: input.staff.email,
      displayName: input.staff.displayName,
      role: input.staff.role,
      active: true,
    };

    InMemoryStaffStore.compartidas.set(email, {
      ...owner,
      passwordHash: input.staff.passwordHash,
    });

    return ok({ tenant, owner });
  }
}
