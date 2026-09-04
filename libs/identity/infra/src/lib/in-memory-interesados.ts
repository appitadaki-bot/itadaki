import { type Interesado } from '@itadaki/identity/domain';
import { type Result, ok } from '@itadaki/shared/domain';
import { type InteresadoStoreError } from './postgres-interesados';

/**
 * Para correr sin base: los deja en memoria y los escribe en el log.
 *
 * El log no es un detalle: en desarrollo alguien va a probar el formulario, y
 * un alta que parece funcionar sin dejar rastro es la clase de cosa que se
 * descubre cuando ya pasó un cliente de verdad.
 */
export class InMemoryInteresadoStore {
  private readonly registrados: Interesado[] = [];

  async guardar(
    id: string,
    interesado: Interesado,
  ): Promise<Result<Interesado, InteresadoStoreError>> {
    this.registrados.push(interesado);
    console.log(`[interesado] ${interesado.local} · ${interesado.whatsapp} · carta ${interesado.carta}`);
    return ok(interesado);
  }

  todos(): readonly Interesado[] {
    return this.registrados;
  }
}
