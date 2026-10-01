import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { demoVencido, esUnDemo } from '@itadaki/identity/domain';
import { type AuthedRequest } from './auth';
import { DemoService } from './demo.service';

/**
 * Cuánto se recuerda un vencimiento antes de volver a preguntarlo.
 *
 * Es una lectura por pedido si no se guarda nada, y la fecha no se mueve: lo
 * único que cambia es el reloj. Un minuto de memoria deja la ventana de error
 * en un minuto sobre dos horas, que no le importa a nadie, y le saca a la
 * base una consulta por cada toque de cada pantalla.
 */
const RECORDAR_MS = 60_000;

interface Recordado {
  readonly expiraEn: Date | null;
  readonly leidoEn: number;
}

/**
 * Corta el paso cuando el restaurante de prueba venció.
 *
 * Vencer y borrarse son dos cosas distintas, y ésta es la que importa:
 * cumplido el plazo no entra nadie, aunque las filas sigan ahí esperando al
 * barrido. Si dependiera del borrado, una instancia dormida un fin de semana
 * dejaría demos usables de hace tres días.
 *
 * Mira cualquier pedido, no sólo los que toman pedidos: el panel, la cocina y
 * el salón de una prueba vencida tienen que quedar afuera igual.
 */
@Injectable()
export class DemoVigenteGuard implements CanActivate {
  constructor(private readonly demos: DemoService) {}

  private readonly recordados = new Map<string, Recordado>();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const tenantId = request.auth?.tenantId ?? request.scope?.tenantId;

    // Lo que no es de prueba no tiene nada que mirar acá: el camino normal no
    // paga ni una consulta más por esto.
    if (tenantId === undefined || !esUnDemo(tenantId)) return true;

    const expiraEn = await this.vencimiento(tenantId);

    /*
     * Sin fila es vencido, no "no sé".
     *
     * El barrido borra el restaurante entero y con él su fila, así que no
     * encontrarla significa que ya se lo llevó. Dar por bueno lo que no se
     * encuentra sería dejar entrar justo al caso que esto cuida.
     */
    if (expiraEn === null || demoVencido(expiraEn, new Date())) {
      throw new ForbiddenException({ kind: 'DEMO_VENCIDO' });
    }

    return true;
  }

  private async vencimiento(tenantId: string): Promise<Date | null> {
    const ahora = Date.now();
    const recordado = this.recordados.get(tenantId);
    if (recordado !== undefined && ahora - recordado.leidoEn < RECORDAR_MS) {
      return recordado.expiraEn;
    }

    const expiraEn = await this.demos.vencimientoDe(tenantId);
    this.recordados.set(tenantId, { expiraEn, leidoEn: ahora });

    // La memoria no crece para siempre: con dos horas de vida, lo que quedó
    // viejo acá no vuelve a preguntarse nunca.
    if (this.recordados.size > 500) {
      for (const [id, dato] of this.recordados) {
        if (ahora - dato.leidoEn > RECORDAR_MS) this.recordados.delete(id);
      }
    }

    return expiraEn;
  }
}
