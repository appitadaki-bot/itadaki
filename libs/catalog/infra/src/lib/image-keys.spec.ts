import { VARIANT_FORMATS, VARIANT_WIDTHS } from '@itadaki/catalog/domain';
import { imageKeys } from './postgres-images';

/**
 * Los archivos de una foto, para poder borrarla entera.
 *
 * Se calculan y no se leen del registro: ahí lo que hay son URLs públicas, con
 * el restaurante colgando como parámetro, y volver de una URL a su clave sería
 * adivinar. Si mañana se agrega un ancho o un formato, esta cuenta lo incluye
 * sola — y si no lo incluyera, esos archivos quedarían para siempre.
 */
describe('qué archivos componen una foto', () => {
  const claves = imageKeys('itadaki', 'flan-casero');

  it('incluye el original', () => {
    expect(claves).toContain('itadaki/flan-casero/original');
  });

  it('incluye cada ancho en cada formato', () => {
    for (const width of VARIANT_WIDTHS) {
      for (const format of VARIANT_FORMATS) {
        expect(claves).toContain(`itadaki/flan-casero/${width}.${format}`);
      }
    }
  });

  it('no cuenta ninguno dos veces', () => {
    expect(new Set(claves).size).toBe(claves.length);
  });

  /** El original más los doce que se sirven. */
  it('son trece archivos', () => {
    expect(claves).toHaveLength(1 + VARIANT_WIDTHS.length * VARIANT_FORMATS.length);
  });

  it('separa por restaurante, para no borrar la foto de otro', () => {
    const ajena = imageKeys('otro-restaurante', 'flan-casero');
    expect(claves.some((clave) => ajena.includes(clave))).toBe(false);
  });
});
