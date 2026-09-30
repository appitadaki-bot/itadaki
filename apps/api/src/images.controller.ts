import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { reeditImage, uploadImage } from '@itadaki/catalog/application/server';
import { mimeForFormat, validateUpload } from '@itadaki/catalog/infra';
import { type Response } from 'express';
import { z } from 'zod';
import { Public, RequirePermission, TenantId } from './auth';
import { ImagesService } from './images.service';

/**
 * El id que elige el cliente termina concatenado en la clave del archivo
 * (`tenant/imageId/original`), así que un `../` lo saca de la carpeta del
 * restaurante y lo mete en la de otro. El GET de variantes ya valida el id
 * con esta forma; la subida y la reedición lo hacían pasar con sólo un largo
 * máximo, que es el borde por donde se escribía encima de la foto ajena.
 */
const ES_UN_ID_DE_IMAGEN = /^[A-Za-z0-9_-]+$/;

/**
 * Qué parte de la foto entra en el cuadrado.
 *
 * Opcional: sin esto entra entera, que es como abre el editor y lo que pasa
 * cuando el dueño no toca nada.
 */
const encuadreSchema = z.object({
  cx: z.number().min(0).max(1),
  cy: z.number().min(0).max(1),
  lado: z.number().gt(0).max(1),
});

const uploadSchema = z.object({
  imageId: z.string().min(1).max(64).regex(ES_UN_ID_DE_IMAGEN),
  alt: z.string().max(200).default(''),
  /** Base64 payload; the real type is checked against magic bytes, not this. */
  data: z.string().min(1),
  encuadre: encuadreSchema.optional(),
});

const reeditSchema = z.object({
  alt: z.string().max(200).optional(),
  encuadre: encuadreSchema.optional(),
});

/**
 * Lo único que se acepta como nombre de variante: letras, números, guiones y
 * una de las tres extensiones que el servidor genera.
 */
const NOMBRE_DE_VARIANTE = /^[A-Za-z0-9_-]+\.(avif|webp|jpeg)$/;

@Controller('images')
export class ImagesController {
  constructor(private readonly images: ImagesService) {}

  @RequirePermission('menu:write')
  @Post()
  async upload(@Body() body: unknown, @TenantId() tenantId: string) {
    // Sin dónde guardarla, aceptar la foto es prometer algo que no se cumple:
    // se ve bien hasta el despliegue siguiente y ahí desaparece, sin que nadie
    // la haya borrado y sin nada de dónde recuperarla.
    if (this.images.ephemeral) {
      throw new HttpException({ kind: 'SIN_ALMACENAMIENTO' }, HttpStatus.SERVICE_UNAVAILABLE);
    }

    const parsed = uploadSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error.issues, HttpStatus.BAD_REQUEST);
    }

    const buffer = Buffer.from(parsed.data.data, 'base64');
    const accepted = validateUpload(buffer);
    if (accepted.isErr()) {
      throw new HttpException(accepted.error, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const run = uploadImage({ images: this.images.store, renderer: this.images.renderer });
    const result = await run({
      tenantId: tenantId,
      imageId: parsed.data.imageId,
      original: buffer,
      alt: parsed.data.alt,
      ...(parsed.data.encuadre === undefined ? {} : { encuadre: parsed.data.encuadre }),
    });

    if (result.isErr()) {
      throw new HttpException(result.error, HttpStatus.UNPROCESSABLE_ENTITY);
    }
    return { id: result.value.id, imageSet: result.value.imageSet };
  }

  /** Re-renders from the stored original: no re-upload, no generational loss. */
  @RequirePermission('menu:write')
  @Post(':id/reedit')
  async reedit(@Param('id') imageId: string, @Body() body: unknown, @TenantId() tenantId: string) {
    // El id viene por la ruta, sin schema que lo filtre: reeditar lee y vuelve
    // a escribir el original y las variantes con esa clave, así que un `../`
    // acá pisa la foto de otro local igual que en la subida.
    if (!ES_UN_ID_DE_IMAGEN.test(imageId)) {
      throw new HttpException({ kind: 'INVALID_IMAGE_ID' }, HttpStatus.BAD_REQUEST);
    }

    const parsed = reeditSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error.issues, HttpStatus.BAD_REQUEST);
    }

    const run = reeditImage({ images: this.images.store, renderer: this.images.renderer });
    const result = await run({
      tenantId: tenantId,
      imageId,
      ...(parsed.data.alt === undefined ? {} : { alt: parsed.data.alt }),
      ...(parsed.data.encuadre === undefined ? {} : { encuadre: parsed.data.encuadre }),
    });

    if (result.isErr()) {
      const status = result.error.kind === 'NOT_FOUND' ? HttpStatus.NOT_FOUND : HttpStatus.UNPROCESSABLE_ENTITY;
      throw new HttpException(result.error, status);
    }
    return { id: result.value.id, imageSet: result.value.imageSet };
  }

  @RequirePermission('menu:read')
  @Get(':id')
  async describe(@Param('id') imageId: string, @TenantId() tenantId: string) {
    const found = await this.images.store.findById(tenantId, imageId);
    if (found.isErr()) {
      throw new HttpException(found.error, HttpStatus.NOT_FOUND);
    }
    return { id: found.value.id, imageSet: found.value.imageSet };
  }

  /** Serves a rendered variant straight from the store. */
  @Public()
  @Get(':id/:file')
  async variant(
    @Param('id') imageId: string,
    @Param('file') file: string,
    @Res() response: Response,
    @TenantId({ publicFallback: true }) tenantId: string,
  ): Promise<void> {
    /*
     * Un nombre de archivo y nada más.
     *
     * Mirar sólo la extensión no alcanzaba: `../../../etc/passwd.jpeg` también
     * termina en `.jpeg`. Y el `/` llega hasta acá aunque la ruta declare un
     * solo segmento, porque Express compara la URL sin decodificar —`%2F` no
     * es `/` todavía— y recién después convierte el parámetro, ya con las
     * barras adentro.
     *
     * Por eso se enumera lo que vale en vez de descartar `..`: contra una
     * lista de lo prohibido siempre queda otra forma de escribir lo mismo.
     */
    if (!NOMBRE_DE_VARIANTE.test(file) || !ES_UN_ID_DE_IMAGEN.test(imageId)) {
      throw new HttpException('unsupported variant', HttpStatus.BAD_REQUEST);
    }

    const extension = file.split('.').pop() ?? '';

    const bytes = await this.images.store.readVariant(tenantId, imageId, file);
    if (bytes.isErr()) {
      throw new HttpException(bytes.error, HttpStatus.NOT_FOUND);
    }

    response.setHeader('Content-Type', mimeForFormat(extension as 'avif' | 'webp' | 'jpeg'));
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.send(bytes.value);
  }
}
