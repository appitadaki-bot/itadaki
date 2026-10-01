import { type Result, ok } from '@itadaki/shared/domain';
import { type DemoError } from './postgres-demos';

/**
 * Los restaurantes de prueba, en memoria, para levantar sin base de datos.
 *
 * El resto de la API ya corre así con `USE_POSTGRES=false` —la carta, los
 * pedidos, las mesas, la gente—, y el alta de un restaurante de prueba era lo
 * único que seguía necesitando Postgres sí o sí. En una máquina sin Docker
 * eso dejaba la pantalla de la demo sin forma de probarse.
 */
export class InMemoryDemos {
  /** Compartidos entre instancias: cada servicio construye el suyo. */
  private static readonly vencimientos = new Map<string, Date>();

  async anotar(tenantId: string, expiraEn: Date): Promise<Result<void, DemoError>> {
    InMemoryDemos.vencimientos.set(tenantId, expiraEn);
    return ok(undefined);
  }

  async cuantosViven(ahora: Date): Promise<Result<number, DemoError>> {
    let vivos = 0;
    for (const expiraEn of InMemoryDemos.vencimientos.values()) {
      if (expiraEn > ahora) vivos += 1;
    }
    return ok(vivos);
  }

  async vencimientoDe(tenantId: string): Promise<Result<Date | null, DemoError>> {
    return ok(InMemoryDemos.vencimientos.get(tenantId) ?? null);
  }

  /**
   * Borra los vencidos y devuelve cuáles fueron.
   *
   * Sólo se olvida de ellos: contra Postgres esto borra el restaurante entero
   * y la cascada se lleva la carta, las mesas y los pedidos. Acá no hay
   * cascada que seguir, y lo que queda colgado se va con el proceso.
   */
  async barrerVencidos(ahora: Date): Promise<Result<readonly string[], DemoError>> {
    const borrados: string[] = [];
    for (const [tenantId, expiraEn] of InMemoryDemos.vencimientos) {
      if (expiraEn <= ahora) {
        InMemoryDemos.vencimientos.delete(tenantId);
        borrados.push(tenantId);
      }
    }
    return ok(borrados);
  }
}
