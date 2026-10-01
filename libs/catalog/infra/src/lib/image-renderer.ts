import {
  type Encuadre,
  ENCUADRE_ENTERO,
  type ImageSet,
  type ImageVariant,
  VARIANT_FORMATS,
  VARIANT_WIDTHS,
  recorteEnPixeles,
} from '@itadaki/catalog/domain';
import sharp, { type OutputInfo, type Sharp } from 'sharp';

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

/*
 * El tipo de archivo de cada variante.
 *
 * `avif` ya no se genera —se explica en `VARIANT_FORMATS`— pero se sigue
 * sirviendo: las fotos cargadas antes tienen sus archivos en el bucket y sus
 * URLs guardadas en la base.
 */
const MIME_BY_FORMAT: Record<string, string> = {
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
async function renderMaster(
  original: Buffer,
  size: number,
  encuadre: Encuadre,
): Promise<{ data: Buffer; info: OutputInfo }> {
  const metadata = await sharp(original).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width === 0 || height === 0) {
    throw new Error('could not read image dimensions');
  }

  const recorte = recorteEnPixeles(encuadre, width, height);

  /*
   * Primero el pedazo que existe, después el relleno de lo que falta.
   *
   * El orden importa y no es el que uno escribe: sharp aplica el recorte
   * antes que el agregado de bordes, en la tubería, sin importar en qué orden
   * se los pida. Pedirle "agregá borde y después recortá" lo hacía recortar
   * la foto original —el cuadrado se le iba afuera— y fallaba con
   * `bad extract area`.
   *
   * Así que se recorta lo que cae adentro de la foto, se lo lleva a la
   * proporción que le toca dentro del cuadrado final, y lo que sobraba por
   * cada borde se agrega como relleno ya en píxeles de salida. Una sola
   * tubería: materializar el extendido en un PNG para volver a abrirlo
   * costaba una decodificación y una codificación de una imagen grande
   * —cuatro segundos y medio, medido contra el servidor—.
   */
  const dentro = {
    left: Math.max(0, recorte.left),
    top: Math.max(0, recorte.top),
    right: Math.min(width, recorte.left + recorte.lado),
    bottom: Math.min(height, recorte.top + recorte.lado),
  };

  const anchoDentro = Math.max(1, dentro.right - dentro.left);
  const altoDentro = Math.max(1, dentro.bottom - dentro.top);
  const escala = size / recorte.lado;

  const anchoSalida = Math.max(1, Math.min(size, Math.round(anchoDentro * escala)));
  const altoSalida = Math.max(1, Math.min(size, Math.round(altoDentro * escala)));

  const izquierda = Math.max(0, Math.min(size - anchoSalida, Math.round((dentro.left - recorte.left) * escala)));
  const arriba = Math.max(0, Math.min(size - altoSalida, Math.round((dentro.top - recorte.top) * escala)));

  return sharp(original)
    .extract({ left: dentro.left, top: dentro.top, width: anchoDentro, height: altoDentro })
    .resize(anchoSalida, altoSalida, { fit: 'fill' })
    .extend({
      left: izquierda,
      top: arriba,
      right: size - anchoSalida - izquierda,
      bottom: size - altoSalida - arriba,
      background: RELLENO,
    })
    .flatten({ background: RELLENO })
    .raw()
    .toBuffer({ resolveWithObject: true });
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

  /*
   * El maestro viaja en píxeles crudos, no en PNG.
   *
   * Cada medida lo volvía a abrir, así que un PNG en el medio son una
   * codificación y cuatro decodificaciones de una imagen de 1200×1200 que no
   * sale de la memoria. Crudo pesa más, pero no se guarda ni se manda: se usa
   * y se tira.
   */
  const desdeElMaestro = (datos: { data: Buffer; info: OutputInfo }): Sharp =>
    sharp(datos.data, {
      raw: { width: datos.info.width, height: datos.info.height, channels: datos.info.channels },
    });

  const variants: RenderedVariant[] = [];
  for (const width of VARIANT_WIDTHS) {
    const resized = await desdeElMaestro(master)
      .resize(width, width, { fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    for (const format of VARIANT_FORMATS) {
      const encoder = desdeElMaestro(resized);
      const data =
        format === 'webp'
          ? await encoder.webp({ quality: 72 }).toBuffer()
          : await encoder.jpeg({ quality: 80, mozjpeg: true }).toBuffer();

      variants.push({ width, format, data });
    }
  }

  // 20px blurred placeholder, inlined so the card reserves space immediately.
  const lqipBuffer = await desdeElMaestro(master)
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

export const mimeForFormat = (format: string): string =>
  MIME_BY_FORMAT[format] ?? 'application/octet-stream';
