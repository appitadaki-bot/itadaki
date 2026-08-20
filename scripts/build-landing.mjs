/**
 * Arma la landing lista para publicar.
 *
 * Es HTML plano: no hay nada que compilar. Lo único que hace falta es copiar
 * las páginas legales al lado, porque el pie las enlaza con /legal/... y sin
 * ellas esos enlaces darían 404 justo en la página donde alguien se da de alta.
 */
import { cp, mkdir, rm } from 'node:fs/promises';

const SALIDA = 'dist/landing';

await rm(SALIDA, { recursive: true, force: true });
await mkdir(SALIDA, { recursive: true });

await cp('apps/landing', SALIDA, { recursive: true });
await cp('apps/admin-web/src/legal', `${SALIDA}/legal`, {
  recursive: true,
  filter: (origen) => !origen.endsWith('.md'),
});

// eslint-disable-next-line no-undef -- script de Node, corre fuera del navegador
console.log('landing lista en', SALIDA);
