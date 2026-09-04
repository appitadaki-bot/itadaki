import { esVersionVieja, hayQueRecargar } from './version-nueva';

describe('reconocer que la app cambió abajo de los pies', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://mesa.itadaki.app/chunk-3HSLRY5E.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
    'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".',
  ])('reconoce: %s', (mensaje) => {
    expect(esVersionVieja(new Error(mensaje))).toBe(true);
  });

  /** Un error de verdad tiene que llegar a la pantalla, no provocar una recarga. */
  it.each([
    'Cannot read properties of undefined',
    'NetworkError when attempting to fetch resource',
    'Failed to load module script: something else entirely',
  ])('no confunde con: %s', (mensaje) => {
    expect(esVersionVieja(new Error(mensaje))).toBe(false);
  });

  it('aguanta lo que no es un Error', () => {
    expect(esVersionVieja('Failed to fetch dynamically imported module: x')).toBe(true);
    expect(esVersionVieja(null)).toBe(false);
  });
});

describe('cuándo recargar', () => {
  const cambioLaVersion = new Error('Failed to fetch dynamically imported module: x');

  it('recarga la primera vez', () => {
    expect(hayQueRecargar(cambioLaVersion, false)).toBe(true);
  });

  /** Si ya se recargó y vuelve a fallar, el problema es otro. */
  it('no vuelve a recargar', () => {
    expect(hayQueRecargar(cambioLaVersion, true)).toBe(false);
  });

  it('no recarga por cualquier error', () => {
    expect(hayQueRecargar(new Error('otra cosa'), false)).toBe(false);
  });
});
