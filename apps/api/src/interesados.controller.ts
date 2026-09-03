import { Body, Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import { COMO_TIENE_LA_CARTA, validarInteresado } from '@itadaki/identity/domain';
import { z } from 'zod';
import { Public } from './auth';
import { InteresadosService } from './interesados.service';

const schema = z.object({
  local: z.string().min(1).max(120),
  nombre: z.string().min(1).max(120),
  whatsapp: z.string().min(1).max(120),
  email: z.string().max(200).optional(),
  mesas: z.number().int().min(1).max(500).nullish(),
  carta: z.enum(COMO_TIENE_LA_CARTA),
  cartaLink: z.string().max(500).optional(),
});

/**
 * Quien deja sus datos para que le armemos la carta.
 *
 * No crea la cuenta. El alta automática dejaba al dueño entrando a un panel
 * vacío justo cuando la landing le había prometido la carta ya cargada; ahora
 * la cuenta se crea cuando hay algo adentro.
 */
@Controller('interesados')
export class InteresadosController {
  constructor(private readonly interesados: InteresadosService) {}

  @Public()
  @Post()
  async registrar(@Body() body: unknown) {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error.issues, HttpStatus.BAD_REQUEST);
    }

    const validado = validarInteresado({
      local: parsed.data.local,
      nombre: parsed.data.nombre,
      whatsapp: parsed.data.whatsapp,
      email: parsed.data.email ?? null,
      mesas: parsed.data.mesas ?? null,
      carta: parsed.data.carta,
      cartaLink: parsed.data.cartaLink ?? null,
    });

    if (validado.isErr()) {
      throw new HttpException(validado.error, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const guardado = await this.interesados.registrar(validado.value);
    if (guardado.isErr()) {
      throw new HttpException(guardado.error, HttpStatus.BAD_GATEWAY);
    }

    // Nada del interesado vuelve: quien lo mandó ya sabe lo que escribió, y
    // devolverlo sólo sirve para que un formulario ajeno lo lea.
    return { ok: true };
  }
}
