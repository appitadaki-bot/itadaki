/** Lo que trae la respuesta cuando el pedido no llegó a salir. */
export const SIN_CONEXION = 'SIN_CONEXION';

/**
 * La respuesta que se da cuando `fetch` no devolvió nada.
 *
 * `fetch` no falla con una respuesta: tira. La excepción salía por arriba de
 * quien llamó —que estaba mirando `response.ok`— y la pantalla se quedaba
 * igual que antes, sin aviso. Subiendo la foto de un plato eso era ver la
 * foto en el editor, no ver ningún error, e irse creyendo que quedó cargada.
 *
 * Se contesta como contestaría el servidor si pudiera, así las pantallas que
 * ya miran el `kind` del error lo cuentan sin acordarse de este caso cada una.
 *
 * 503 y no 400: lo que mandó el dueño estaba bien; el que no estaba era el
 * servidor.
 */
export function respuestaSinConexion(): Response {
  return new Response(JSON.stringify({ kind: SIN_CONEXION }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}
