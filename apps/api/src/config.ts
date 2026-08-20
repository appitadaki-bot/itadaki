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

/**
 * Si guardar una foto ahora sería tirarla.
 *
 * Sin bucket, los bytes van al disco del contenedor: Render lo borra en cada
 * redespliegue y una segunda instancia no lo ve. Con eso, subir una foto es
 * una promesa que el sistema no puede cumplir — y lo peor es que se cumple
 * durante días, hasta el deploy siguiente, cuando la carta entera se queda sin
 * imágenes y ya no hay de dónde recuperarlas.
 *
 * En desarrollo el disco está bien: no hay nada que perder y montar un bucket
 * para probar sería pedirle demasiado a quien clona el repo.
 *
 * Corta la subida y no el arranque a propósito. La API es tomar pedidos,
 * mandarlos a la cocina y cobrar; las fotos son lo de al lado. Un token vencido
 * no puede dejar a un restaurante lleno sin sistema un sábado a la noche.
 */
export function storageIsEphemeral(hasBucket: boolean, nodeEnv: string | undefined): boolean {
  return !hasBucket && nodeEnv === 'production';
}

/**
 * Un valor opcional (token, DSN, nombre de dataset) que viene del entorno.
 *
 * Mismo recorte que `urlFromEnv` y por el mismo motivo — un panel web pegado
 * a mano deja espacios o un salto de línea al final. Acá, en vez de un
 * `fallback` fijo, un valor vacío se trata como "no configurado": estas son
 * todas integraciones opcionales que la API debe poder arrancar sin tener.
 */
export function trimmedEnv(name: string): string | undefined {
  const raw = (process.env[name] ?? '').trim();
  return raw === '' ? undefined : raw;
}
