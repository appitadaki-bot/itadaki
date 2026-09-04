import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Qué pedidos toca el service worker.
 *
 * En producción esto se rompió así: la app carga sus tipografías de Google, el
 * worker interceptaba ese pedido y lo volvía a emitir con `fetch()`. Eso cambia
 * con qué regla de la CSP se mide —una fuente entra por `font-src`, que la
 * permite; un `fetch()` pasa a `connect-src`, que no— y el navegador la
 * bloqueaba. La mesa quedaba sin poder entrar.
 *
 * La regla que lo evita es no meterse con lo que no es nuestro. Lo que el
 * worker tiene que sostener sin señal es la aplicación, y eso sale todo del
 * mismo origen.
 */

/** Lo mismo que decide el worker, para poder probarlo sin un navegador. */
function loManeja(href: string, origen: string): boolean {
  return new URL(href).origin === origen;
}

const NUESTRO = 'https://mesa.itadaki.app';

describe('el service worker sólo toca lo del mismo origen', () => {
  it('deja pasar las tipografías de Google', () => {
    // El caso exacto que rompió producción.
    expect(
      loManeja('https://fonts.gstatic.com/s/onest/v11/gNMKW3F-SZuj7xmf-HY.woff2', NUESTRO),
    ).toBe(false);
  });

  it('deja pasar la hoja de estilos de Google Fonts', () => {
    expect(loManeja('https://fonts.googleapis.com/css2?family=Onest', NUESTRO)).toBe(false);
  });

  it('deja pasar lo de Google para entrar con cuenta', () => {
    expect(loManeja('https://accounts.google.com/gsi/client', NUESTRO)).toBe(false);
  });

  it('sigue manejando la aplicación', () => {
    // Que es lo que tiene que andar sin señal.
    expect(loManeja(`${NUESTRO}/unirse`, NUESTRO)).toBe(true);
    expect(loManeja(`${NUESTRO}/main-ABC123.js`, NUESTRO)).toBe(true);
  });

  it('no se confunde con un dominio que empieza igual', () => {
    // "mesa.itadaki.app.otrositio.com" no es nuestro.
    expect(loManeja('https://mesa.itadaki.app.otrositio.com/x', NUESTRO)).toBe(false);
  });

  it('distingue http de https en el mismo host', () => {
    // El origen incluye el esquema: son orígenes distintos.
    expect(loManeja('http://mesa.itadaki.app/unirse', NUESTRO)).toBe(false);
  });
});

describe('los tres workers llevan la guarda', () => {
  // Se rompió en el del comensal, pero los tres tenían el mismo agujero: sin
  // esto, arreglar uno solo deja los otros dos esperando el mismo bug.
  it.each(['diner-pwa', 'kds-web', 'floor-web'])('%s', (app) => {
    const sw = readFileSync(join(__dirname, `../../${app}/src/sw.js`), 'utf-8').replace(/\r\n/g, "\n");

    expect(sw).toContain('url.origin !== self.location.origin');
  });
});
