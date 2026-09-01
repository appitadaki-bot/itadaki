import { type StaffUser } from '@itadaki/identity/domain';
import { type Result, err, ok } from '@itadaki/shared/domain';
import { hashPassword } from './password';
import { type StaffConPin, type StaffError, type StaffWithHash } from './postgres-staff';

/**
 * La misma que crea el seed, para que las instrucciones sirvan en los dos modos.
 *
 * Nunca sale de una máquina de desarrollo: este store sólo se usa con
 * `USE_POSTGRES=false`, que en un servidor no se activa nunca.
 */
const DEMO_PASSWORD = 'Itadaki2026Demo';

const DEMO_STAFF: ReadonlyArray<Omit<StaffWithHash, 'passwordHash'>> = [
  {
    tenantId: 'itadaki',
    id: 'dueno',
    email: 'dueno@itadaki.test',
    displayName: 'dueño',
    role: 'OWNER',
    active: true,
  },
  {
    tenantId: 'itadaki',
    id: 'cocina',
    email: 'cocina@itadaki.test',
    displayName: 'cocina',
    role: 'KITCHEN',
    active: true,
  },
  {
    tenantId: 'itadaki',
    id: 'mozo',
    email: 'mozo@itadaki.test',
    displayName: 'mozo',
    role: 'WAITER',
    active: true,
  },
];

/**
 * El equipo, para `USE_POSTGRES=false`.
 *
 * El login siempre iba contra Postgres aunque el resto corriera en memoria, así
 * que levantar el proyecto sin base dejaba el panel, la cocina y el salón
 * inalcanzables: cualquier credencial devolvía "email o contraseña
 * incorrectos", que hace buscar el error donde no está.
 *
 * Las contraseñas se cifran igual que en Postgres. Guardarlas en texto acá
 * sería una puerta distinta a la de producción, y las puertas distintas se
 * olvidan abiertas.
 */
export class InMemoryStaffStore {
  /*
   * Las filas viven en el proceso, no en la instancia.
   *
   * El alta las escribe desde el store de restaurantes y el login las lee
   * desde acá: si cada uno tuviera su propio mapa, quien acaba de crear su
   * cuenta no podría entrar con ella.
   */
  static readonly compartidas = new Map<string, StaffWithHash>();

  private get rows(): Map<string, StaffWithHash> {
    return InMemoryStaffStore.compartidas;
  }

  private static sembrado: Promise<void> | null = null;

  private get listo(): Promise<void> | null {
    return InMemoryStaffStore.sembrado;
  }

  private set listo(valor: Promise<void> | null) {
    InMemoryStaffStore.sembrado = valor;
  }

  /** Cifrar es asíncrono, así que la siembra espera a la primera consulta. */
  /**
   * Deja el personal de demostración en el mapa compartido.
   *
   * Público porque el alta también tiene que esperarlo: comprueba contra ese
   * mapa si el mail está tomado, y sin sembrar primero no encontraba a la
   * gente de la demo — así que un alta con el mail del dueño creaba un
   * restaurante duplicado en vez de avisar del intento. En Postgres no pasa
   * porque hay un índice único de verdad, y eso hacía que sólo se viera al
   * desarrollar.
   */
  async sembrar(): Promise<void> {
    if (this.listo !== null) return this.listo;

    this.listo = (async () => {
      for (const user of DEMO_STAFF) {
        const hash = await hashPassword(DEMO_PASSWORD);
        this.rows.set(user.email.toLowerCase(), { ...user, passwordHash: hash });
      }
    })();

    return this.listo;
  }

  async findByEmail(email: string): Promise<Result<StaffWithHash, StaffError>> {
    await this.sembrar();
    const found = this.rows.get(email.trim().toLowerCase());
    return found === undefined ? err({ kind: 'NOT_FOUND', email }) : ok(found);
  }

  async create(user: StaffWithHash): Promise<Result<StaffUser, StaffError>> {
    await this.sembrar();
    this.rows.set(user.email.toLowerCase(), user);
    const { passwordHash: _, ...sinHash } = user;
    return ok(sinHash);
  }

  /** Usuario y PIN de quien no entra con mail, por id de persona. */
  private static readonly pines = new Map<
    string,
    { username: string; pinHash: string; intentos: number; trabadoHasta: Date | null }
  >();

  /**
   * Dónde trabaja quien usa este usuario. Lo mismo que en Postgres.
   *
   * Todos sus locales y no uno: el usuario es único en toda la base, así que
   * la misma persona puede estar en varios, y el login necesita verlos para
   * preguntarle en cuál entra.
   */
  async localesDe(username: string): Promise<Result<readonly StaffConPin[], StaffError>> {
    await this.sembrar();

    const encontrados: StaffConPin[] = [];
    for (const [userId, datos] of InMemoryStaffStore.pines) {
      if (datos.username !== username.toLowerCase()) continue;

      const persona = [...this.rows.values()].find((u) => u.id === userId && u.active);
      if (persona === undefined) continue;

      const { passwordHash: _, ...sinHash } = persona;
      encontrados.push({ ...sinHash, ...datos });
    }

    return ok(encontrados);
  }

  /** Si un usuario ya está tomado, en cualquier restaurante. */
  async usuarioTomado(username: string): Promise<Result<boolean, StaffError>> {
    const encontrados = await this.localesDe(username);
    return encontrados.isErr() ? err(encontrados.error) : ok(encontrados.value.length > 0);
  }

  async findByUsername(
    tenantId: string,
    username: string,
  ): Promise<Result<StaffConPin, StaffError>> {
    await this.sembrar();

    for (const [userId, datos] of InMemoryStaffStore.pines) {
      if (datos.username !== username.toLowerCase()) continue;

      const persona = [...this.rows.values()].find(
        (u) => u.id === userId && u.tenantId === tenantId,
      );
      if (persona === undefined) continue;

      const { passwordHash: _, ...sinHash } = persona;
      return ok({ ...sinHash, ...datos });
    }

    return err({ kind: 'NOT_FOUND', email: username });
  }

  async registrarIntento(
    _tenantId: string,
    userId: string,
    acerto: boolean,
    trabarHasta: Date | null,
  ): Promise<Result<void, StaffError>> {
    const datos = InMemoryStaffStore.pines.get(userId);
    if (datos === undefined) return ok(undefined);

    InMemoryStaffStore.pines.set(userId, {
      ...datos,
      intentos: acerto ? 0 : datos.intentos + 1,
      trabadoHasta: acerto ? null : trabarHasta,
    });
    return ok(undefined);
  }

  async guardarPin(
    _tenantId: string,
    userId: string,
    username: string,
    pinHash: string,
  ): Promise<Result<void, StaffError>> {
    InMemoryStaffStore.pines.set(userId, {
      username,
      pinHash,
      intentos: 0,
      trabadoHasta: null,
    });
    return ok(undefined);
  }

  async usuarioDe(_tenantId: string, userId: string): Promise<Result<string | null, StaffError>> {
    return ok(InMemoryStaffStore.pines.get(userId)?.username ?? null);
  }

  async usuariosTomados(tenantId: string): Promise<Result<ReadonlySet<string>, StaffError>> {
    await this.sembrar();

    const mios = new Set<string>();
    for (const [userId, datos] of InMemoryStaffStore.pines) {
      const suyo = [...this.rows.values()].some(
        (u) => u.id === userId && u.tenantId === tenantId,
      );
      if (suyo) mios.add(datos.username);
    }
    return ok(mios);
  }

  async isActive(tenantId: string, userId: string): Promise<boolean> {
    await this.sembrar();
    return [...this.rows.values()].some(
      (u) => u.tenantId === tenantId && u.id === userId && u.active,
    );
  }

  async setActive(
    tenantId: string,
    userId: string,
    active: boolean,
  ): Promise<Result<StaffUser, StaffError>> {
    await this.sembrar();
    const found = [...this.rows.values()].find(
      (u) => u.tenantId === tenantId && u.id === userId,
    );
    if (found === undefined) return err({ kind: 'NOT_FOUND', email: userId });

    const actualizado = { ...found, active };
    this.rows.set(found.email.toLowerCase(), actualizado);
    const { passwordHash: _, ...sinHash } = actualizado;
    return ok(sinHash);
  }

  async listForTenant(tenantId: string): Promise<Result<readonly StaffUser[], StaffError>> {
    await this.sembrar();
    return ok(
      [...this.rows.values()]
        .filter((u) => u.tenantId === tenantId)
        .map(({ passwordHash: _, ...user }) => user),
    );
  }
}
