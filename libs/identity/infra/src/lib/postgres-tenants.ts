import {
  type Role,
  type StaffUser,
  type Tenant,
  type TrialInput,
  trialEndFor,
} from '@itadaki/identity/domain';
import { type Result, err, ok } from '@itadaki/shared/domain';
import { type Database } from '@itadaki/shared/persistence';

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
        }>('SELECT trial_ends_at, paid, paid_until FROM tenants WHERE id = $1', [tenantId]);
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

          // The trial clock starts at signup, not at first use: otherwise a
          // restaurant that registers and comes back in March gets a free month
          // whenever it happens to start.
          const tenant = await client.query<TenantRow>(
            `INSERT INTO tenants (id, name, slug, currency, trial_ends_at)
             VALUES ($1,$2,$3,$4,$5)
             RETURNING id, name, slug, currency, timezone, active`,
            [input.tenantId, input.name, input.slug, input.currency, trialEndFor(new Date())],
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
