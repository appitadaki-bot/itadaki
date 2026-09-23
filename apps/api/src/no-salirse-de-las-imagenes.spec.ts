import { DiskBlobStorage } from '@itadaki/catalog/infra';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
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
