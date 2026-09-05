import { Injectable } from '@nestjs/common';
import {
  correoDeInteresado,
  destinatariosDelAviso,
  type Interesado,
} from '@itadaki/identity/domain';
import {
  InMemoryInteresadoStore,
  PostgresInteresadoStore,
  type InteresadoStoreError,
} from '@itadaki/identity/infra';
import { type Result } from '@itadaki/shared/domain';
import { elCorreo } from './correo';
import { database } from './database';
import { log } from './logger';

@Injectable()
export class InteresadosService {
  private readonly store =
    process.env['USE_POSTGRES'] !== 'false'
      ? new PostgresInteresadoStore(database)
      : new InMemoryInteresadoStore();

  async registrar(interesado: Interesado): Promise<Result<Interesado, InteresadoStoreError>> {
    // El id se arma acá y no en la base: sirve para nombrarlo en un mensaje
    // ("el interesado tal") sin tener que ir a buscarlo.
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const guardado = await this.store.guardar(id, interesado);

    if (guardado.isOk()) await this.avisar(id, interesado);
    return guardado;
  }

  /**
   * Nos avisa que hay alguien esperando.
   *
   * Después de guardar y sin poder voltear el alta: el interesado ya está en
   * la base, y contestarle un error porque nuestro proveedor de correo tuvo un
   * mal día lo haría llenar el formulario de nuevo para nada.
   *
   * Uno por dirección en vez de un correo con varios destinatarios: así cada
   * uno lo recibe aunque otra dirección de la lista esté mal escrita.
   */
  private async avisar(id: string, interesado: Interesado): Promise<void> {
    const destinatarios = destinatariosDelAviso(process.env['INTERESADOS_EMAIL'] ?? '');
    if (destinatarios.length === 0) {
      log.warn('sin INTERESADOS_EMAIL — nadie se entera de que hay un interesado nuevo', { id });
      return;
    }

    const correo = correoDeInteresado(interesado, id);

    for (const destinatario of destinatarios) {
      try {
        await elCorreo().send({ to: destinatario, ...correo });
      } catch (error) {
        // El interesado está guardado: lo peor que pasa es tener que mirar la
        // tabla a mano, y para eso hace falta saber que el aviso no salió.
        log.error('no se pudo avisar de un interesado', { id, destinatario, error: String(error) });
      }
    }
  }
}
