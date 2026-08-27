import {
  type ImageEditParams,
  type ImageSet,
  type ImageVariant,
  VARIANT_FORMATS,
  VARIANT_WIDTHS,
} from '@itadaki/catalog/domain';
import sharp from 'sharp';

export interface RenderedVariant {
  readonly width: number;
  readonly format: (typeof VARIANT_FORMATS)[number];
  readonly data: Buffer;
}

export interface RenderedImage {
  readonly variants: readonly RenderedVariant[];
  readonly lqip: string;
}

const MIME_BY_FORMAT: Record<(typeof VARIANT_FORMATS)[number], string> = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
};

/**
 * Renders the master square from the original plus the editor parameters.
 * The browser canvas is never uploaded: re-rendering server-side from the
 * untouched original keeps quality and makes the edit non-destructive.
 */
async function renderMaster(original: Buffer, params: ImageEditParams, size: number): Promise<Buffer> {
  const metadata = await sharp(original).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width === 0 || height === 0) {
    throw new Error('could not read image dimensions');
  }

  // The crop is a square expressed against the shorter side.
  const shortest = Math.min(width, height);
  const cropSide = Math.max(1, Math.round(params.crop.size * shortest));
  const left = Math.min(Math.max(0, Math.round(params.crop.x * width)), width - cropSide);
  const top = Math.min(Math.max(0, Math.round(params.crop.y * height)), height - cropSide);

  const base = sharp(original)
    .extract({ left, top, width: cropSide, height: cropSide })
    .resize(size, size, { fit: 'cover' });

  return base.png().toBuffer();
}

/**
 * Cuánto conserva el original que se guarda.
 *
 * El original existe para reeditar el encuadre sin degradar la foto, no para
 * servirse: nadie descarga nunca este archivo. Guardar los doce megapíxeles
 * que sale de un teléfono era el 90% del bucket para nada — la variante más
 * grande mide 1200, y un recorte a la mitad de 2560 todavía da 1280.
 *
 * El número es la perilla de esto: si algún día se recortan encuadres más
 * cerrados, sube. Bajarlo ahorra más y deja menos margen de reencuadre.
 */
export const STORED_ORIGINAL_MAX_SIDE = 2560;

/**
 * Cuándo vale la pena reencodear una foto que ya entra en la medida.
 *
 * Un PNG de mil por mil puede pesar cinco megas: la medida sola no alcanza
 * para saber si conviene tocarla.
 */
export const STORED_ORIGINAL_MAX_BYTES = 1_500_000;

/**
 * Deja el original en algo que se pueda guardar sin remordimiento.
 *
 * Baja de tamaño, hornea la orientación EXIF y suelta el resto de los
 * metadatos — que incluyen dónde se sacó la foto. Antes eso se hacía sólo
 * para las variantes y el original quedaba con el GPS adentro.
 *
 * Una foto que ya entra en la medida y pesa poco se guarda tal cual: volver a
 * comprimir lo que ya está bien sólo pierde calidad.
 *
 * Si algo falla devuelve la foto como vino. Guardarla más grande de lo ideal
 * es un problema de espacio; perder la subida es un problema del restaurante.
 */
export async function shrinkOriginal(original: Buffer): Promise<Buffer> {
  try {
    const metadata = await sharp(original).metadata();
    const side = Math.max(metadata.width ?? 0, metadata.height ?? 0);
    if (side === 0) return original;

    const cabe = side <= STORED_ORIGINAL_MAX_SIDE;
    if (cabe && original.length <= STORED_ORIGINAL_MAX_BYTES) return original;

    // `withoutEnlargement` para no inventar píxeles en una foto ya chica que
    // entró acá sólo por lo que pesa.
    const shrunk = await sharp(original)
      .rotate()
      .resize(STORED_ORIGINAL_MAX_SIDE, STORED_ORIGINAL_MAX_SIDE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer();

    // Pasada la medida gana el achicado aunque pese más: el tope de píxeles es
    // lo que acota el bucket, y una foto que no comprime bien hoy tampoco iba
    // a comprimir bien entera. Cuando entra en la medida y sólo pesaba de más,
    // en cambio, se queda el más chico de los dos.
    if (!cabe) return shrunk;
    return shrunk.length < original.length ? shrunk : original;
  } catch {
    return original;
  }
}

export async function renderImageSet(
  original: Buffer,
  params: ImageEditParams,
): Promise<RenderedImage> {
  const largest = VARIANT_WIDTHS[0];
  const master = await renderMaster(original, params, largest);

  const variants: RenderedVariant[] = [];
  for (const width of VARIANT_WIDTHS) {
    const resized = await sharp(master).resize(width, width, { fit: 'cover' }).png().toBuffer();

    for (const format of VARIANT_FORMATS) {
      const encoder = sharp(resized);
      const data =
        format === 'avif'
          ? await encoder.avif({ quality: 55 }).toBuffer()
          : format === 'webp'
            ? await encoder.webp({ quality: 72 }).toBuffer()
            : await encoder.jpeg({ quality: 80, mozjpeg: true }).toBuffer();

      variants.push({ width, format, data });
    }
  }

  // 20px blurred placeholder, inlined so the card reserves space immediately.
  const lqipBuffer = await sharp(master)
    .resize(20, 20, { fit: 'cover' })
    .blur(1.2)
    .webp({ quality: 40 })
    .toBuffer();

  return {
    variants,
    lqip: `data:image/webp;base64,${lqipBuffer.toString('base64')}`,
  };
}

/** Maps rendered files to the domain's ImageSet, given a URL per variant. */
export function toImageSet(
  rendered: RenderedImage,
  urlFor: (variant: RenderedVariant) => string,
  alt: string,
): ImageSet {
  return {
    variants: rendered.variants.map(
      (variant): ImageVariant => ({
        url: urlFor(variant),
        width: variant.width,
        format: variant.format,
      }),
    ),
    lqip: rendered.lqip,
    alt,
  };
}

export const mimeForFormat = (format: (typeof VARIANT_FORMATS)[number]): string =>
  MIME_BY_FORMAT[format];
