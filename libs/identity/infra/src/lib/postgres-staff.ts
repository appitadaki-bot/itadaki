import { type Role, type StaffUser } from '@itadaki/identity/domain';
import { type Result, err, ok } from '@itadaki/shared/domain';
import { type Database } from '@itadaki/shared/persistence';

export type StaffError =
  | { readonly kind: 'NOT_FOUND'; readonly email: string }
  | { readonly kind: 'STORAGE_FAILURE'; readonly detail: string };

interface StaffRow {
  tenant_id: string;
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: string;
  active: boolean;
  username: string | null;
  pin_hash: string | null;
  pin_intentos: number | null;
  pin_trabado_hasta: string | null;
}

export interface StaffWithHash extends StaffUser {
  readonly passwordHash: string;
}

/** Alguien del personal que entra con usuario y PIN. */
export interface StaffConPin extends StaffUser {
  readonly username: string;
  readonly pinHash: string;
  /** Cuántos PIN fallidos seguidos lleva. */
  readonly intentos: number;
  /** Hasta cuándo está trabada la cuenta, o null si no lo está. */
  readonly trabadoHasta: Date | null;
}

export class PostgresStaffStore {
  constructor(private readonly db: Database) {}

  /**
   * Looks a user up by email alone.
   *
   * Login happens before any tenant is known, so this reads through a view
   * owned by the privileged role rather than the row-filtered table.
   */
  async findByEmail(email: string): Promise<Result<StaffWithHash, StaffError>> {
    try {
      const rows = await this.db.unscoped(async (client) => {
        const result = await client.query<StaffRow>(
          // A function rather than a table: login happens before a tenant is
          // known, so this one lookup has to see past row level security. It
          // runs SECURITY DEFINER and answers with at most the single row
          // matching that address — see migration 009.
          'SELECT * FROM staff_login_lookup_fn($1)',
          [email],
        );
        return result.rows;
      });

      const row = rows[0];
      if (row === undefined) {
        return err({ kind: 'NOT_FOUND', email });
      }

      return ok({
        id: row.id,
        tenantId: row.tenant_id,
        email: row.email,
        displayName: row.display_name,
        role: row.role as Role,
        active: row.active,
        passwordHash: row.password_hash,
      });
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  async create(user: StaffWithHash): Promise<Result<StaffUser, StaffError>> {
    try {
      await this.db.withTenant(user.tenantId, async (client) => {
        await client.query(
          `INSERT INTO staff_users (tenant_id, id, email, display_name, password_hash, role, active)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (tenant_id, id) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             password_hash = EXCLUDED.password_hash,
             role = EXCLUDED.role,
             active = EXCLUDED.active`,
          [
            user.tenantId,
            user.id,
            user.email,
            user.displayName,
            user.passwordHash,
            user.role,
            user.active,
          ],
        );
      });

      const { passwordHash: _passwordHash, ...safe } = user;
      return ok(safe);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /**
   * Turns an account's access on or off.
   *
   * Deactivating rather than deleting: orders and bills reference the person
   * who handled them, so removing the row would erase that trail.
   */
  /**
   * Whether this account may still act, for the guard on every request.
   *
   * Narrow on purpose: a signed token already carries who the person is, so
   * the only open question is whether they were let go since it was issued.
   */
  /**
   * Busca a alguien del personal por su usuario, dentro de su restaurante.
   *
   * Con el tenant en alcance, a diferencia del login por mail: ese ocurre
   * antes de saber de qué local se trata y por eso necesita la función que ve
   * por encima de RLS. Acá el local ya se sabe —viene en el link— así que la
   * búsqueda queda encerrada donde corresponde.
   */
  async findByUsername(
    tenantId: string,
    username: string,
  ): Promise<Result<StaffConPin, StaffError>> {
    try {
      const rows = await this.db.withTenant(tenantId, async (client) => {
        const result = await client.query<StaffRow>(
          'SELECT * FROM staff_users WHERE lower(username) = lower($1)',
          [username],
        );
        return result.rows;
      });

      const row = rows[0];
      if (row === undefined || row.username === null || row.pin_hash === null) {
        return err({ kind: 'NOT_FOUND', email: username });
      }

      return ok({
        id: row.id,
        tenantId: row.tenant_id,
        email: row.email,
        displayName: row.display_name,
        role: row.role as Role,
        active: row.active,
        username: row.username,
        pinHash: row.pin_hash,
        intentos: row.pin_intentos ?? 0,
        trabadoHasta: row.pin_trabado_hasta === null ? null : new Date(row.pin_trabado_hasta),
      });
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /**
   * Dónde trabaja quien usa este usuario.
   *
   * Sin el local, porque el usuario ya no depende de él: es único en toda la
   * base, así que "nico" identifica a una persona y no a una etiqueta que se
   * repite en veinte restaurantes.
   *
   * Devuelve todos sus locales y no uno: en gastronomía trabajar en dos
   * lugares es lo normal, y esa persona tiene que poder elegir en cuál entra
   * hoy con un solo usuario y un solo PIN.
   *
   * Pasa por la función que ve por encima del aislamiento, igual que el login
   * por mail: buscar quién es alguien ocurre antes de saber de qué local es.
   */
  async localesDe(username: string): Promise<Result<readonly StaffConPin[], StaffError>> {
    try {
      const rows = await this.db.unscoped(async (client) => {
        const result = await client.query<StaffRow>(
          'SELECT * FROM staff_username_lookup_fn($1)',
          [username],
        );
        return result.rows;
      });

      return ok(
        rows
          .filter((row) => row.username !== null && row.pin_hash !== null)
          .map((row) => ({
            id: row.id,
            tenantId: row.tenant_id,
            email: row.email,
            displayName: row.display_name,
            role: row.role as Role,
            active: row.active,
            username: row.username as string,
            pinHash: row.pin_hash as string,
            intentos: row.pin_intentos ?? 0,
            trabadoHasta:
              row.pin_trabado_hasta === null ? null : new Date(row.pin_trabado_hasta),
          })),
      );
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /**
   * Si un usuario ya está tomado, en cualquier restaurante.
   *
   * Global y no por local: es lo que hace que "nico" sea una identidad. El
   * alta lo consulta para sugerir uno libre en vez de fallar.
   */
  async usuarioTomado(username: string): Promise<Result<boolean, StaffError>> {
    const encontrados = await this.localesDe(username);
    return encontrados.isErr() ? err(encontrados.error) : ok(encontrados.value.length > 0);
  }

  /**
   * Guarda el resultado de un intento de PIN.
   *
   * Se traba la cuenta y no la dirección de red: quien prueba PINes a ciegas
   * cambia de IP cuando quiere, pero no cambia de usuario. El contador se
   * borra al acertar, así que el mozo que se equivocó dos veces no arrastra
   * eso todo el turno.
   */
  async registrarIntento(
    tenantId: string,
    userId: string,
    acerto: boolean,
    trabarHasta: Date | null,
  ): Promise<Result<void, StaffError>> {
    try {
      await this.db.withTenant(tenantId, async (client) => {
        if (acerto) {
          await client.query(
            'UPDATE staff_users SET pin_intentos = 0, pin_trabado_hasta = NULL WHERE id = $1',
            [userId],
          );
          return;
        }

        await client.query(
          `UPDATE staff_users
              SET pin_intentos = pin_intentos + 1,
                  pin_trabado_hasta = $2
            WHERE id = $1`,
          [userId, trabarHasta],
        );
      });
      return ok(undefined);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /** Le pone o le cambia el usuario y el PIN a alguien del personal. */
  async guardarPin(
    tenantId: string,
    userId: string,
    username: string,
    pinHash: string,
  ): Promise<Result<void, StaffError>> {
    try {
      await this.db.withTenant(tenantId, async (client) => {
        await client.query(
          `UPDATE staff_users
              SET username = $2, pin_hash = $3, pin_intentos = 0, pin_trabado_hasta = NULL
            WHERE id = $1`,
          [userId, username, pinHash],
        );
      });
      return ok(undefined);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /** El usuario que ya tiene esta persona, o null si todavía no tiene. */
  async usuarioDe(tenantId: string, userId: string): Promise<Result<string | null, StaffError>> {
    try {
      const nombre = await this.db.withTenant(tenantId, async (client) => {
        const result = await client.query<{ username: string | null }>(
          'SELECT username FROM staff_users WHERE id = $1',
          [userId],
        );
        return result.rows[0]?.username ?? null;
      });
      return ok(nombre);
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  /** Los usuarios ya tomados en este restaurante, para elegir uno libre. */
  async usuariosTomados(tenantId: string): Promise<Result<ReadonlySet<string>, StaffError>> {
    try {
      const nombres = await this.db.withTenant(tenantId, async (client) => {
        const result = await client.query<{ username: string }>(
          'SELECT username FROM staff_users WHERE username IS NOT NULL',
        );
        return result.rows.map((fila) => fila.username);
      });
      return ok(new Set(nombres));
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  async isActive(tenantId: string, userId: string): Promise<boolean> {
    try {
      return await this.db.withTenant(tenantId, async (client) => {
        const result = await client.query<{ active: boolean }>(
          'SELECT active FROM staff_users WHERE id = $1',
          [userId],
        );
        return result.rows[0]?.active ?? false;
      });
    } catch {
      // A database blip must not sign the whole restaurant out mid-service;
      // the token is still signed and unexpired, so it stands.
      return true;
    }
  }

  async setActive(
    tenantId: string,
    userId: string,
    active: boolean,
  ): Promise<Result<StaffUser, StaffError>> {
    try {
      const rows = await this.db.withTenant(tenantId, async (client) => {
        const result = await client.query<StaffRow>(
          'UPDATE staff_users SET active = $2 WHERE id = $1 RETURNING *',
          [userId, active],
        );
        return result.rows;
      });

      const row = rows[0];
      if (row === undefined) {
        return err({ kind: 'NOT_FOUND', email: userId });
      }
      return ok({
        id: row.id,
        tenantId: row.tenant_id,
        email: row.email,
        displayName: row.display_name,
        role: row.role as Role,
        active: row.active,
      });
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }

  async listForTenant(tenantId: string): Promise<Result<readonly StaffUser[], StaffError>> {
    try {
      const rows = await this.db.withTenant(tenantId, async (client) => {
        const result = await client.query<StaffRow>(
          'SELECT * FROM staff_users ORDER BY display_name',
        );
        return result.rows;
      });

      return ok(
        rows.map((row) => ({
          id: row.id,
          tenantId: row.tenant_id,
          email: row.email,
          displayName: row.display_name,
          role: row.role as Role,
          active: row.active,
        })),
      );
    } catch (error) {
      return err({ kind: 'STORAGE_FAILURE', detail: String(error) });
    }
  }
}
