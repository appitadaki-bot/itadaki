import {
  type Encuadre,
  ENCUADRE_ENTERO,
  type ImageSet,
  type ImageVariant,
  VARIANT_FORMATS,
  VARIANT_WIDTHS,
  recorteEnPixeles,
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

/*
 * Cuánta memoria se le deja tomar a libvips.
 *
 * Por defecto cachea lo que ya decodificó y reparte cada operación entre
 * tantos hilos como núcleos tenga la máquina, cada uno con su copia. Eso está
 * pensado para un servidor de imágenes; acá la API entera vive en 512 MB y
 * quedarse sin memoria no degrada nada: mata el proceso, y con él la subida y
 * cualquier pedido que estuviera en curso.
 *
 * Una foto por vez tarda un poco más y no se nota: subir la foto de un plato
 * es algo que pasa mientras se carga la carta, no en el medio del servicio.
 */
sharp.cache({ memory: 48 });
sharp.concurrency(1);

/**
 * Cuánto se esfuerza el encoder de AVIF.
 *
 * Es de lejos lo más caro de toda la subida: con el valor de fábrica —4— la
 * variante de 1200 tardaba entre 200 ms y 1,6 s según cuánto detalle tuviera
 * la foto, más que todo el resto del trabajo junto. En 2 baja a 85–140 ms y
 * el archivo crece unos pocos kilobytes, con AVIF todavía bastante más chico
 * que el WebP del mismo cuadro.
 *
 * Medido en una máquina de escritorio; el servidor tiene una décima de
 * procesador, así que allá esa diferencia se multiplica y es la que el dueño
 * espera mirando la pantalla.
 */
const AVIF_EFFORT = 2;

const MIME_BY_FORMAT: Record<(typeof VARIANT_FORMATS)[number], string> = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
};

/**
 * El color con el que se rellena lo que le falta a la foto para ser cuadrada.
 *
 * Es el crema de las superficies de la app —`--itadaki-surface`— así que el
 * relleno no se lee como un marco: la foto termina y sigue la tarjeta.
 */
const RELLENO = { r: 252, g: 244, b: 230, alpha: 1 };

/**
 * Arma el cuadrado maestro con la parte de la foto que se eligió.
 *
 * Por defecto es la foto entera: el cuadrado la contiene y lo que sobra se
 * rellena. Antes eso no era una opción sino la única salida —el recorte se
 * tomaba contra el lado corto, así que una apaisada perdía los costados
 * siempre— y el editor sólo dejaba elegir qué mitad del plato se perdía.
 *
 * Ahora el encuadre puede pasarse de los bordes, y las dos cosas son el mismo
 * cálculo: la foto entera es el cuadrado del lado más largo, centrado. Lo que
 * cae afuera se agrega como relleno antes de recortar, en vez de ser un caso
 * aparte.
 *
 * Las tarjetas de la carta son cuadradas en las tres apps, y este es el único
 * lugar donde eso se resuelve: con CSS, cada una lo recortaría a su manera.
 *
 * Se renderiza en el servidor desde el original, nunca desde un canvas del
 * navegador: así la foto guardada conserva su calidad.
 */
async function renderMaster(original: Buffer, size: number, encuadre: Encuadre): Promise<Buffer> {
  const metadata = await sharp(original).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width === 0 || height === 0) {
    throw new Error('could not read image dimensions');
  }

  const recorte = recorteEnPixeles(encuadre, width, height);

  // Lo que el cuadrado se pasa de cada borde. Se agrega primero, para que el
  // recorte de después caiga siempre adentro de una imagen que ya existe.
  const margen = {
    left: Math.max(0, -recorte.left),
    top: Math.max(0, -recorte.top),
    right: Math.max(0, recorte.left + recorte.lado - width),
    bottom: Math.max(0, recorte.top + recorte.lado - height),
  };

  const hayMargen = margen.left + margen.top + margen.right + margen.bottom > 0;
  const base = hayMargen
    ? sharp(await sharp(original).extend({ ...margen, background: RELLENO }).png().toBuffer())
    : sharp(original);

  return base
    .extract({
      left: recorte.left + margen.left,
      top: recorte.top + margen.top,
      width: recorte.lado,
      height: recorte.lado,
    })
    .resize(size, size, { fit: 'cover' })
    .flatten({ background: RELLENO })
    .png()
    .toBuffer();
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
  encuadre: Encuadre = ENCUADRE_ENTERO,
): Promise<RenderedImage> {
  const largest = VARIANT_WIDTHS[0];
  const master = await renderMaster(original, largest, encuadre);

  const variants: RenderedVariant[] = [];
  for (const width of VARIANT_WIDTHS) {
    const resized = await sharp(master).resize(width, width, { fit: 'cover' }).png().toBuffer();

    for (const format of VARIANT_FORMATS) {
      const encoder = sharp(resized);
      const data =
        format === 'avif'
          ? await encoder.avif({ quality: 55, effort: AVIF_EFFORT }).toBuffer()
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
