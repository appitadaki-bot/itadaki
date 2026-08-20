/**
 * Una URL que viene de la configuración del entorno.
 *
 * Recorta los espacios y el salto de línea final, que es lo que queda cuando
 * alguien pega el valor en un panel web. No es teórico: `IMAGE_BASE_URL` quedó
 * con un salto al final y todas las fotos de la carta se guardaron apuntando a
 * `…/api/images\n/plato/300.webp`, una ruta que no existe. La foto se subía
 * bien, se renderizaba bien, y el navegador recibía 404.
 *
 * También saca la barra final, para que el que la pone y el que no terminen
 * armando la misma dirección en vez de una con `//` en el medio.
 */
export function urlFromEnv(name: string, fallback: string): string {
  const raw = (process.env[name] ?? '').trim().replace(/\/+$/, '');
  return raw === '' ? fallback : raw;
}
