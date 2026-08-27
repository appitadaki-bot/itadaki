import {
  type ImageEditParams,
  VARIANT_WIDTHS,
  defaultCrop,
} from '@itadaki/catalog/domain';
import sharp from 'sharp';
import { detectImageType, validateUpload } from './image-intake';
import {
  STORED_ORIGINAL_MAX_BYTES,
  STORED_ORIGINAL_MAX_SIDE,
  renderImageSet,
  shrinkOriginal,
} from './image-renderer';

jest.setTimeout(60_000);

/**
 * A landscape test image filled with fine checkerboard noise. High-frequency
 * detail is what makes blur measurable: a flat colour has the same standard
 * deviation whether or not it has been defocused.
 */
async function makeSource(width = 900, height = 600): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  const block = 8;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      const on = (Math.floor(x / block) + Math.floor(y / block)) % 2 === 0;
      pixels[offset] = on ? 245 : 25;
      pixels[offset + 1] = on ? 235 : 35;
      pixels[offset + 2] = on ? 210 : 60;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}


const params = (overrides: Partial<ImageEditParams> = {}): ImageEditParams => ({
  crop: defaultCrop(),
  ...overrides,
});

describe('magic byte detection', () => {
  it('identifies a real JPEG', async () => {
    expect(detectImageType(await makeSource(64, 64))).toBe('jpeg');
  });

  it('identifies a real PNG', async () => {
    const png = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    expect(detectImageType(png)).toBe('png');
  });

  it('identifies a real WebP', async () => {
    const webp = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#fff' },
    })
      .webp()
      .toBuffer();
    expect(detectImageType(webp)).toBe('webp');
  });

  it('rejects a text file renamed as an image', () => {
    const fake = Buffer.from('<?php system($_GET["c"]); ?>                ', 'utf-8');
    expect(detectImageType(fake)).toBe('unknown');
    const result = validateUpload(fake);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('UNSUPPORTED_TYPE');
  });

  it('rejects an empty file', () => {
    expect(validateUpload(Buffer.alloc(0)).isErr()).toBe(true);
  });

  it('rejects a file over the size limit', () => {
    const huge = Buffer.alloc(16 * 1024 * 1024);
    huge.set([0xff, 0xd8, 0xff], 0);
    const result = validateUpload(huge);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('TOO_LARGE');
  });

  it('accepts a genuine image', async () => {
    expect(validateUpload(await makeSource(64, 64)).isOk()).toBe(true);
  });
});

describe('renderImageSet', () => {
  it('emits every width in every format', async () => {
    const rendered = await renderImageSet(await makeSource(), params());
    expect(rendered.variants).toHaveLength(12);

    for (const width of [1200, 600, 300, 80]) {
      for (const format of ['avif', 'webp', 'jpeg']) {
        expect(
          rendered.variants.some((v) => v.width === width && v.format === format),
        ).toBe(true);
      }
    }
  });

  it('renders every variant as a square', async () => {
    const rendered = await renderImageSet(await makeSource(), params());

    for (const variant of rendered.variants) {
      const meta = await sharp(variant.data).metadata();
      expect(meta.width).toBe(variant.width);
      expect(meta.height).toBe(variant.width);
    }
  });

  it('produces a decodable image per format', async () => {
    const rendered = await renderImageSet(await makeSource(), params());
    const at600 = rendered.variants.filter((v) => v.width === 600);

    for (const variant of at600) {
      const meta = await sharp(variant.data).metadata();
      expect(meta.width).toBe(600);
      expect(variant.data.length).toBeGreaterThan(0);
    }
  });

  it('emits an inline LQIP placeholder', async () => {
    const rendered = await renderImageSet(await makeSource(), params());
    expect(rendered.lqip.startsWith('data:image/webp;base64,')).toBe(true);
    // Small enough to inline without bloating the document.
    expect(rendered.lqip.length).toBeLessThan(3000);
  });

  it('honours an inset crop', async () => {
    const full = await renderImageSet(await makeSource(), params());
    const cropped = await renderImageSet(
      await makeSource(),
      params({ crop: { x: 0.05, y: 0.1, size: 0.3 } }),
    );

    const pick = (set: typeof full) =>
      set.variants.find((v) => v.width === 300 && v.format === 'jpeg')?.data;

    const a = pick(full);
    const b = pick(cropped);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    // Different framing must yield different pixels.
    expect(Buffer.compare(a as Buffer, b as Buffer)).not.toBe(0);
  });

  it('strips EXIF metadata from the output', async () => {
    const withExif = await sharp(await makeSource())
      .withMetadata({ exif: { IFD0: { Copyright: 'test', Software: 'itadaki' } } })
      .jpeg()
      .toBuffer();

    const rendered = await renderImageSet(withExif, params());
    const variant = rendered.variants.find((v) => v.width === 600 && v.format === 'jpeg');
    const meta = await sharp(variant?.data as Buffer).metadata();

    expect(meta.exif).toBeUndefined();
  });
});

/**
 * El original se guarda para poder reencuadrar después, no para servirse: la
 * foto que sale de un teléfono pesaba megas que nadie descargaba nunca.
 */
describe('el original que se guarda', () => {
  /** Un degradado suave comprime como una foto; el damero del resto del
   *  archivo es ruido puro y no representa lo que sube un restaurante. */
  async function makePhoto(width: number, height: number): Promise<Buffer> {
    const pixels = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 3;
        pixels[offset] = Math.round((x / width) * 255);
        pixels[offset + 1] = Math.round((y / height) * 255);
        pixels[offset + 2] = 140;
      }
    }
    return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
  }

  it('achica la foto grande y la deja dentro de la medida', async () => {
    const grande = await makePhoto(4000, 3000);
    const guardado = await shrinkOriginal(grande);

    const { width, height } = await sharp(guardado).metadata();
    expect(Math.max(width ?? 0, height ?? 0)).toBeLessThanOrEqual(STORED_ORIGINAL_MAX_SIDE);
    expect(guardado.length).toBeLessThan(grande.length);
  });

  /** El tope de píxeles manda: una foto que no comprime bien no puede quedar
   *  guardada entera sólo porque el reencode no le gane en bytes. */
  it('respeta la medida aunque la foto comprima mal', async () => {
    const ruidosa = await makeSource(4000, 3000);

    const { width, height } = await sharp(await shrinkOriginal(ruidosa)).metadata();
    expect(Math.max(width ?? 0, height ?? 0)).toBeLessThanOrEqual(STORED_ORIGINAL_MAX_SIDE);
  });

  /** Con 2560 de lado, un recorte a la mitad todavía supera la variante de 1200. */
  it('deja margen para reencuadrar más cerrado que la variante más grande', () => {
    expect(STORED_ORIGINAL_MAX_SIDE / 2).toBeGreaterThan(VARIANT_WIDTHS[0]);
  });

  it('no toca la que ya entra y pesa poco', async () => {
    const chica = await makeSource(900, 600);
    expect(chica.length).toBeLessThan(STORED_ORIGINAL_MAX_BYTES);

    expect(await shrinkOriginal(chica)).toBe(chica);
  });

  it('hornea la orientación en vez de dejarla en los metadatos', async () => {
    // Vertical con la marca de "rotala 90°": lo que manda un teléfono de lado.
    const acostada = await sharp(await makeSource(4000, 3000))
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const { width, height } = await sharp(await shrinkOriginal(acostada)).metadata();
    expect((height ?? 0) > (width ?? 0)).toBe(true);
  });

  it('devuelve lo que vino cuando no es una imagen', async () => {
    const basura = Buffer.from('esto no es una foto');
    expect(await shrinkOriginal(basura)).toBe(basura);
  });
});
