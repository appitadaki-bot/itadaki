import { Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import { HORAS_DE_DEMO } from '@itadaki/identity/domain';
import { Public } from './auth';
import { RateLimit } from './rate-limit.guard';
import { DemoService } from './demo.service';

/**
 * El restaurante de prueba que se crea desde la landing.
 *
 * Sin cuenta, sin mail y sin tarjeta: el que quiere ver la app toca un botón
 * y entra. Pedirle algo antes es perder a la mitad en la puerta, y lo que se
 * muestra no es secreto — es el producto.
 *
 * Lo que acota el abuso no es el límite por IP, que se saltea cambiando de
 * red: es el tope de cuántos pueden vivir a la vez, más las dos horas de
 * vida. Con eso, pidan lo que pidan, la base nunca crece más allá del tope.
 */
@Controller('demo')
export class DemoController {
  constructor(private readonly demos: DemoService) {}

  @Public()
  @RateLimit('demo')
  @Post()
  async crear() {
    const hecho = await this.demos.crear(new Date());

    if (!hecho.ok) {
      if (hecho.error.kind === 'SIN_LUGAR') {
        // 503 y no 429: no es que este visitante pidió de más, es que ahora
        // mismo no hay lugar. La pantalla le dice que vuelva en un rato.
        throw new HttpException(
          { kind: 'SIN_LUGAR', tope: hecho.error.tope },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw new HttpException({ kind: 'NO_SE_PUDO' }, HttpStatus.BAD_GATEWAY);
    }

    const { demo } = hecho;

    return {
      tenantId: demo.tenantId,
      expiraEn: demo.expiraEn.toISOString(),
      horas: HORAS_DE_DEMO,
      tableToken: demo.tableToken,
      accesos: demo.accesos,
    };
  }
}
