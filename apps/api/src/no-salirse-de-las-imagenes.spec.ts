import { DiskBlobStorage, claveSeguraDeBlob } from '@itadaki/catalog/infra';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * `GET /images/:id/:file` es público y servía cualquier archivo que el proceso
 * pudiera leer.
 *
 * La única comprobación era la extensión, y `../../../etc/passwd.jpeg` también
 * termina en `.jpeg`. El `/` llegaba igual al parámetro aunque la ruta declare
 * un solo segmento: Express compara la URL sin decodificar —`%2F` todavía no
 * es `/`— y recién después convierte el valor, ya con las barras adentro. Por
 * eso la versión obvia daba 404 y la percent-encodeada pasaba.
 *
 * En disco eso alcanzaba `/proc/self/environ`, donde están AUTH_SECRET y
 * DATABASE_URL: de leer una foto a fabricarse un token de dueño.
 */

const NOMBRE_DE_VARIANTE = /^[A-Za-z0-9_-]+\.(avif|webp|jpeg)$/;

describe('el nombre de una variante', () => {
  it('acepta los que genera el servidor', () => {
    for (const bueno of ['thumb.jpeg', 'grande.webp', 'card-2x.avif', 'a_b-1.jpeg']) {
      expect(NOMBRE_DE_VARIANTE.test(bueno)).toBe(true);
    }
  });

  it('rechaza los que se salen del directorio, aunque terminen bien', () => {
    for (const malo of [
      '../../../etc/passwd.jpeg',
      '../../proc/self/environ.jpeg',
      'sub/dir/foto.jpeg',
      '/etc/passwd.jpeg',
      '..%2Fsecreto.jpeg',
      'foto.jpeg.txt',
      'foto.png',
    ]) {
      expect(NOMBRE_DE_VARIANTE.test(malo)).toBe(false);
    }
  });
});

describe('el almacenamiento en disco', () => {
  it('no lee fuera de su directorio, aunque la clave se lo pida', async () => {
    const base = await mkdtemp(join(tmpdir(), 'itadaki-imagenes-'));
    const raiz = join(base, 'imagenes');
    await mkdir(join(raiz, 'demo', 'img1'), { recursive: true });
    await writeFile(join(base, 'secreto.txt'), 'no se tiene que poder leer');

    const disco = new DiskBlobStorage(raiz);

    await expect(disco.get('../secreto.txt')).rejects.toThrow(
      /fuera del directorio de imágenes/,
    );
    await expect(disco.get('demo/../../secreto.txt')).rejects.toThrow(
      /fuera del directorio de imágenes/,
    );
  });

  it('sigue sirviendo lo que sí es suyo', async () => {
    const base = await mkdtemp(join(tmpdir(), 'itadaki-imagenes-'));
    const raiz = join(base, 'imagenes');
    await mkdir(raiz, { recursive: true });

    const disco = new DiskBlobStorage(raiz);
    await disco.put('demo/img1/thumb.jpeg', Buffer.from('una foto'));

    expect((await disco.get('demo/img1/thumb.jpeg')).toString()).toBe('una foto');
    expect((await readFile(join(raiz, 'demo', 'img1', 'thumb.jpeg'))).toString()).toBe('una foto');
  });
});

/**
 * El bucket no resuelve rutas como el disco: la clave viaja tal cual dentro de
 * la URL, y `new URL` colapsa los `../` antes de firmar. Sin este control,
 * subir con `imageId: "../otro-local/plato"` escribía sobre la foto de otro
 * restaurante en producción, que es donde corre S3/R2 y no el disco.
 */
describe('la clave de un objeto en el bucket', () => {
  it('acepta la forma que arma el servidor', () => {
    for (const buena of ['demo/img1/original', 'demo/img1/640.webp', 'a-b/c_d/thumb.jpeg']) {
      expect(() => claveSeguraDeBlob(buena)).not.toThrow();
    }
  });

  it('rechaza la que se sale de la carpeta del restaurante', () => {
    for (const mala of [
      'demo/../otro/original',
      '../otro/img1/640.webp',
      'demo//img1/original',
      '/etc/passwd',
      'demo/img1/../../secreto',
      'demo/img\\1/original',
    ]) {
      expect(() => claveSeguraDeBlob(mala)).toThrow(/fuera del directorio de imágenes/);
    }
  });
});

/**
 * La subida y la reedición eligen el id, y ese id se concatena a la clave. El
 * GET de variantes ya lo validaba; el borde de escritura lo hacía pasar con
 * sólo un largo máximo.
 */
describe('el borde de escritura de imágenes', () => {
  const CONTROLLER = readFileSync(join(__dirname, 'images.controller.ts'), 'utf-8');

  it('valida el id que se sube con la misma forma que el que se lee', () => {
    expect(CONTROLLER).toContain('ES_UN_ID_DE_IMAGEN');
    expect(CONTROLLER).toContain('.regex(ES_UN_ID_DE_IMAGEN)');
  });

  it('valida el id de la reedición, que llega por la ruta sin schema', () => {
    const donde = CONTROLLER.indexOf('async reedit(');
    const cuerpo = CONTROLLER.slice(donde, donde + 400);
    expect(cuerpo).toContain('ES_UN_ID_DE_IMAGEN.test(imageId)');
  });
});
