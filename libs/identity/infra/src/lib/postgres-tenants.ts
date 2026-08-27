import {
  type Role,
  type StaffUser,
  type Tenant,
  type TrialInput,
  trialEndFor,
} from '@itadaki/identity/domain';
import { type Result, err, ok } from '@itadaki/shared/domain';
import { type Database } from '@itadaki/shared/persistence';
import { type PoolClient } from 'pg';

export type TenantError =
  | { readonly kind: 'EMAIL_TAKEN'; readonly email: string }
  | { readonly kind: 'STORAGE_FAILURE'; readonly detail: string };

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  active: boolean;
}

export interface SignUpInput {
  readonly tenantId: string;
  readonly name: string;
  readonly slug: string;
  readonly currency: string;
  readonly staff: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly passwordHash: string;
    readonly role: Role;
  };
}

/** Postgres unique-violation; the email index is the one signup can trip. */
const UNIQUE_VIOLATION = '23505';

export class PostgresTenantStore {
  constructor(private readonly db: Database) {}

  /** Trial state for one restaurant, read on every panel request. */
  async subscriptionFor(tenantId: string): Promise<Result<TrialInput, TenantError>> {
    try {
      const rows = await this.db.unscoped(async (client) => {
        const result = await client.query<{
          trial_ends_at: string | null;
          paid: boolean;
          paid_until: string | null;
          estrenado: boolean;
        }>('SELECT trial_ends_at, paid, paid_until, estrenado FROM tenants WHERE id = $1', [
          tenantId,
        ]);
        return result.rows;
      });

      const row = rows[0];
      if (row === undefined) {
        return err({ kind: 'STORAGE_FAILURE', detail: `unknown tenant ${tenantId}` });
      }

      /*
       * Está al día si le regalamos el servicio, o si su mes pago no venció.
       *
       * `paid` a secas es la cortesía —una cuenta nuestra, un local al que le
       * damos acceso— y no vence. `paid_until` es lo que mueve el cobrador, y
       * vence solo: si dejan de entrar los pagos, la fecha queda atrás sin que
       * nadie tenga que hacer nada. Sin eso, un aviso de baja perdido dejaba
       * al restaurante con servicio gratis para siempre.
       */
      const hasta = row.paid_until === null ? null : new Date(row.paid_until);
      const alDia = row.paid || (hasta !== null && hasta > new Date());

      return ok({
        trialEndsAt: row.trial_ends_at === null ? null : new Date(row.trial_ends_at),
        paid: alDia,
        estrenado: row.estrenado,
      });
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /** Extends a trial or marks a restaurant paid. Operations, not self-service. */
  async setSubscription(
    tenantId: string,
    update: { trialEndsAt?: Date; paid?: boolean; paidUntil?: Date | null; plan?: string },
  ): Promise<Result<void, TenantError>> {
    try {
      await this.db.unscoped(async (client) => {
        await client.query(
          `UPDATE tenants
              SET trial_ends_at = COALESCE($2, trial_ends_at),
                  paid = COALESCE($3, paid),
                  paid_until = CASE WHEN $5 THEN $4 ELSE paid_until END,
                  plan = COALESCE($6, plan)
            WHERE id = $1`,
          [
            tenantId,
            update.trialEndsAt ?? null,
            update.paid ?? null,
            update.paidUntil ?? null,
            // `paidUntil: null` significa "cortalo", que es distinto de no
            // mandarlo. Sin esta bandera, COALESCE no puede distinguirlos.
            'paidUntil' in update,
            update.plan ?? null,
          ],
        );
      });
      return ok(undefined);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /**
   * Guarda que un aviso del cobrador ya se aplicó.
   *
   * Devuelve `false` si ya estaba: el cobrador reintenta hasta que le
   * contestamos que sí, y a veces manda el mismo aviso dos veces igual. Sin
   * esto, un reintento de un cobro aprobado sumaría otro mes gratis.
   */
  async registrarAviso(
    referencia: string,
    tenantId: string,
    estado: string,
  ): Promise<Result<boolean, TenantError>> {
    try {
      const nuevo = await this.db.unscoped(async (client) => {
        const result = await client.query(
          `INSERT INTO billing_events (reference, tenant_id, status)
           VALUES ($1, $2, $3)
           ON CONFLICT (reference) DO NOTHING`,
          [referencia, tenantId, estado],
        );
        return (result.rowCount ?? 0) > 0;
      });
      return ok(nuevo);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /** Hasta cuándo está pago, para poder sumarle el mes nuevo encima. */
  async pagoHasta(tenantId: string): Promise<Result<Date | null, TenantError>> {
    try {
      const rows = await this.db.unscoped(async (client) => {
        const result = await client.query<{ paid_until: string | null }>(
          'SELECT paid_until FROM tenants WHERE id = $1',
          [tenantId],
        );
        return result.rows;
      });
      const valor = rows[0]?.paid_until;
      return ok(valor === undefined || valor === null ? null : new Date(valor));
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /**
   * Arranca el trial, la primera vez y sólo la primera.
   *
   * El `WHERE estrenado = false` es lo que lo hace seguro de llamar en cada
   * pedido: dos mesas pidiendo al mismo tiempo intentan las dos, y la segunda
   * no encuentra fila que actualizar. Sin esa condición, cada pedido correría
   * la fecha treinta días hacia adelante y el trial no se terminaría nunca.
   */
  async estrenar(tenantId: string, ahora: Date): Promise<Result<boolean, TenantError>> {
    try {
      const arrancado = await this.db.unscoped(async (client) => {
        const result = await client.query(
          `UPDATE tenants
              SET estrenado = true,
                  estrenado_at = $2,
                  trial_ends_at = $3
            WHERE id = $1 AND estrenado = false`,
          [tenantId, ahora, trialEndFor(ahora)],
        );
        return (result.rowCount ?? 0) > 0;
      });
      return ok(arrancado);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /**
   * Deja pendiente la verificación del mail de alguien del personal.
   *
   * Se guarda el hash y no el token: una base filtrada no puede alcanzar para
   * verificar la cuenta de otro, por el mismo motivo por el que las
   * contraseñas tampoco se guardan en claro.
   */
  async pedirVerificacion(
    email: string,
    digest: string,
    expiraEn: Date,
  ): Promise<Result<void, TenantError>> {
    try {
      await this.db.unscoped(async (client) => {
        /*
         * Recorrer los restaurantes, no un UPDATE suelto.
         *
         * Con RLS en FORCE la política alcanza también al dueño de la tabla,
         * así que una consulta sin `app.tenant_id` en alcance no ve ninguna
         * fila — y no falla: reporta cero filas y sigue. Eso es lo que hacía
         * que el token no se guardara y el mail nunca saliera, sin dejar
         * ningún error.
         *
         * El directorio de restaurantes no está filtrado, así que se camina y
         * se fija el alcance en cada vuelta. El mail es único en toda la base,
         * de modo que a lo sumo una vuelta toca una fila.
         */
        await this.porCadaLocal(client, async () => {
          const hecho = await client.query(
            `UPDATE staff_users
                SET verify_digest = $2, verify_expires_at = $3
              WHERE lower(email) = lower($1)`,
            [email, digest, expiraEn],
          );
          return (hecho.rowCount ?? 0) > 0 ? true : null;
        });
      });
      return ok(undefined);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /**
   * Recorre los restaurantes con el alcance puesto, y lo suelta al terminar.
   *
   * Tres consultas de este archivo necesitan lo mismo: buscar por mail o por
   * token sin saber de qué restaurante es. El directorio de `tenants` no está
   * filtrado, así que se camina y se fija `app.tenant_id` en cada vuelta.
   *
   * El `finally` es el punto. Estas consultas corren sin transacción, así que
   * el alcance se fija en la conexión y no muere sola: sin soltarlo, la
   * conexión vuelve al pool marcada con el último restaurante recorrido y la
   * próxima petición que la reciba —si no fija el suyo— lee filas ajenas. Un
   * `return` en medio del bucle, que es lo normal acá porque el mail es único,
   * salteaba cualquier limpieza escrita después.
   */
  private async porCadaLocal<T>(
    client: PoolClient,
    paso: (local: string) => Promise<T | null>,
  ): Promise<T | null> {
    try {
      const locales = await client.query<{ id: string }>('SELECT id FROM tenants');

      for (const local of locales.rows) {
        await client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', local.id]);

        const hallado = await paso(local.id);
        if (hallado !== null) return hallado;
      }

      return null;
    } finally {
      await client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', '']);
    }
  }

  /**
   * Marca el mail como verificado, si el token sirve.
   *
   * Devuelve el restaurante para poder mandar a la persona a su panel. El
   * token se borra al usarlo: un link de verificación vale una sola vez, así
   * que reenviarlo a otro no sirve de nada.
   *
   * La condición del vencimiento va en el SQL y no después: un token vencido
   * no tiene que llegar a coincidir con nada.
   */
  async verificarMail(digest: string, ahora: Date): Promise<Result<string | null, TenantError>> {
    try {
      const tenantId = await this.db.unscoped(async (client) => {
        // Mismo recorrido: sin alcance, el UPDATE no encuentra la fila aunque
        // el token sea correcto.
        return this.porCadaLocal(client, async () => {
          const result = await client.query<{ tenant_id: string }>(
            `UPDATE staff_users
                SET email_verified_at = $2,
                    verify_digest = NULL,
                    verify_expires_at = NULL
              WHERE verify_digest = $1
                AND verify_expires_at > $2
              RETURNING tenant_id`,
            [digest, ahora],
          );
          return result.rows[0]?.tenant_id ?? null;
        });
      });
      return ok(tenantId);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /** Si el mail de esta persona ya está confirmado. */
  async mailVerificado(email: string): Promise<Result<boolean, TenantError>> {
    try {
      const verificado = await this.db.unscoped(async (client) => {
        const hallado = await this.porCadaLocal(client, async () => {
          const result = await client.query<{ email_verified_at: string | null }>(
            'SELECT email_verified_at FROM staff_users WHERE lower(email) = lower($1)',
            [email],
          );
          const fila = result.rows[0];
          return fila === undefined ? null : fila.email_verified_at !== null;
        });

        // Un mail que no está en ninguna parte se trata como verificado: no
        // hay nada que reenviarle, y decir lo contrario haría que el endpoint
        // de reenvío revele qué direcciones existen.
        return hallado ?? true;
      });
      return ok(verificado);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /**
   * El descuento por pagar en efectivo, en puntos porcentuales enteros.
   *
   * Lo lee la pantalla de la cuenta en cada cálculo, así que devuelve cero
   * ante cualquier problema: un fallo de lectura no puede inventar un
   * descuento que el local no ofrece, ni cobrarle de más a nadie.
   */
  async descuentoEnEfectivo(tenantId: string): Promise<Result<number, TenantError>> {
    try {
      const puntos = await this.db.unscoped(async (client) => {
        const result = await client.query<{ cash_discount_percent: number }>(
          'SELECT cash_discount_percent FROM tenants WHERE id = $1',
          [tenantId],
        );
        return result.rows[0]?.cash_discount_percent ?? 0;
      });
      return ok(puntos);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /** Lo cambia el dueño desde el panel. Cero es no ofrecerlo. */
  async guardarDescuento(tenantId: string, puntos: number): Promise<Result<void, TenantError>> {
    try {
      await this.db.unscoped(async (client) => {
        await client.query('UPDATE tenants SET cash_discount_percent = $2 WHERE id = $1', [
          tenantId,
          puntos,
        ]);
      });
      return ok(undefined);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /**
   * El link de reseñas del local, y cuántas veces se ofreció y se tocó.
   *
   * Un fallo de lectura devuelve el link en null, que apaga el pedido: mejor
   * no ofrecer la reseña que mandar a un cliente conforme a un link roto.
   */
  async resenas(
    tenantId: string,
  ): Promise<Result<{ url: string | null; asks: number; taps: number }, TenantError>> {
    try {
      const fila = await this.db.unscoped(async (client) => {
        const result = await client.query<{
          google_review_url: string | null;
          review_asks: number;
          review_taps: number;
        }>(
          'SELECT google_review_url, review_asks, review_taps FROM tenants WHERE id = $1',
          [tenantId],
        );
        return result.rows[0];
      });

      return ok({
        url: fila?.google_review_url ?? null,
        asks: fila?.review_asks ?? 0,
        taps: fila?.review_taps ?? 0,
      });
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /** Lo pega el dueño desde el panel. `null` deja de ofrecerlo. */
  async guardarResenas(tenantId: string, url: string | null): Promise<Result<void, TenantError>> {
    try {
      await this.db.unscoped(async (client) => {
        await client.query('UPDATE tenants SET google_review_url = $2 WHERE id = $1', [
          tenantId,
          url,
        ]);
      });
      return ok(undefined);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /**
   * Suma uno al contador de veces que se ofreció, o que se tocó.
   *
   * `UPDATE ... + 1` en vez de leer y escribir: dos mesas que cierran a la vez
   * se pisarían si el número viajara al servidor de aplicación y volviera.
   */
  async contarResena(tenantId: string, cual: 'ask' | 'tap'): Promise<Result<void, TenantError>> {
    // El nombre de la columna no puede ir como parámetro, así que se arma
    // desde un literal y nunca desde lo que llegó por la red: `cual` está
    // acotado a dos valores por el tipo, y acá se traduce a uno de dos
    // nombres fijos.
    const columna = cual === 'ask' ? 'review_asks' : 'review_taps';
    try {
      await this.db.unscoped(async (client) => {
        await client.query(
          `UPDATE tenants SET ${columna} = ${columna} + 1 WHERE id = $1`,
          [tenantId],
        );
      });
      return ok(undefined);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /** Slugs already in use, so signup can pick a free one. */
  async takenSlugs(prefix: string): Promise<Result<ReadonlySet<string>, TenantError>> {
    try {
      const rows = await this.db.unscoped(async (client) => {
        const result = await client.query<{ slug: string }>(
          'SELECT slug FROM tenants WHERE slug = $1 OR slug LIKE $1 || $2',
          [prefix, '-%'],
        );
        return result.rows;
      });
      return ok(new Set(rows.map((row) => row.slug)));
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /**
   * Creates the restaurant and its first owner together.
   *
   * Both statements share one transaction: a restaurant with no account to
   * sign into is unreachable, and would silently hold its slug forever.
   */
  async signUp(input: SignUpInput): Promise<Result<{ tenant: Tenant; owner: StaffUser }, TenantError>> {
    try {
      return await this.db.unscoped(async (client) => {
        try {
          await client.query('BEGIN');

          // Sin fecha: el reloj arranca con el primer pedido de una mesa, no
          // acá. Quien se anota y recibe la carta cargada dos días después no
          // puede perder esos dos días de los treinta.
          const tenant = await client.query<TenantRow>(
            `INSERT INTO tenants (id, name, slug, currency, trial_ends_at)
             VALUES ($1,$2,$3,$4,$5)
             RETURNING id, name, slug, currency, timezone, active`,
            [input.tenantId, input.name, input.slug, input.currency, null],
          );

          // RLS is on staff_users, so the insert needs the tenant in scope.
          await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', input.tenantId]);

          await client.query(
            `INSERT INTO staff_users (tenant_id, id, email, display_name, password_hash, role, active)
             VALUES ($1,$2,$3,$4,$5,$6,true)`,
            [
              input.tenantId,
              input.staff.id,
              input.staff.email,
              input.staff.displayName,
              input.staff.passwordHash,
              input.staff.role,
            ],
          );

          await client.query('COMMIT');

          const row = tenant.rows[0];
          if (row === undefined) {
            return err({ kind: 'STORAGE_FAILURE', detail: 'tenant insert returned no row' });
          }

          return ok({
            tenant: {
              id: row.id,
              name: row.name,
              slug: row.slug,
              currency: row.currency,
              timezone: row.timezone,
              active: row.active,
            },
            owner: {
              id: input.staff.id,
              tenantId: input.tenantId,
              email: input.staff.email,
              displayName: input.staff.displayName,
              role: input.staff.role,
              active: true,
            },
          });
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);

          // The email index is global, so this is the collision worth naming.
          const code = (error as { code?: string }).code;
          if (code === UNIQUE_VIOLATION) {
            return err({ kind: 'EMAIL_TAKEN', email: input.staff.email });
          }
          return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
        }
      });
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }
}
