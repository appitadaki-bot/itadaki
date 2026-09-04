/**
 * Si este error es "la app cambió abajo de tus pies".
 *
 * Cuando se publica una versión nueva, los archivos de las pantallas cambian
 * de nombre. Un teléfono que tenía la app abierta desde antes sigue pidiendo
 * los de la versión vieja: el servidor devuelve el `index.html` por el rewrite
 * de SPA, el navegador esperaba JavaScript, y la pantalla no carga.
 *
 * Le pasa a alguien sentado en la mesa, a mitad de la cena, y lo único que ve
 * es que la app dejó de andar. Recargar lo arregla, pero eso hay que saberlo.
 */
export function esVersionVieja(error: unknown): boolean {
  const mensaje = error instanceof Error ? error.message : String(error);

  return (
    mensaje.includes('Failed to fetch dynamically imported module') ||
    mensaje.includes('error loading dynamically imported module') ||
    mensaje.includes('Importing a module script failed') ||
    (mensaje.includes('Failed to load module script') && mensaje.includes('MIME type'))
  );
}

/** Para no recargar en bucle si el problema no era ése. */
export const MARCA = 'itadaki.recargado-por-version';

/**
 * Decide si vale la pena recargar.
 *
 * Una sola vez por sesión del navegador: si después de recargar vuelve a
 * fallar, el problema es otro y recargar de nuevo dejaría la pantalla
 * parpadeando sin llegar nunca a mostrar el error de verdad.
 */
export function hayQueRecargar(error: unknown, yaSeIntento: boolean): boolean {
  return esVersionVieja(error) && !yaSeIntento;
}
