import { createHash } from 'node:crypto';

/**
 * La misma clave para el mismo envío, venga del teléfono que venga.
 *
 * El carrito es de la mesa, no de cada persona. Con una clave inventada por
 * cada teléfono, dos comensales tocando "enviar" al mismo tiempo mandaban las
 * mismas líneas con claves distintas: el servidor las tomaba por dos pedidos
 * y la cocina cocinaba todo dos veces.
 *
 * Derivada de la mesa y de las líneas que se envían, ordenadas: dos envíos
 * simultáneos del mismo carrito dan la misma clave, y el segundo recibe la
 * comanda que creó el primero en vez de crear otra.
 *
 * Lo que se agrega después son líneas nuevas, con ids nuevos, así que una
 * segunda ronda de lo mismo —dos empanadas más— da otra clave y entra como
 * corresponde.
 */
export function claveDeEnvio(sessionId: string, lineIds: readonly string[]): string {
  const ordenados = [...lineIds].sort().join('|');
  return createHash('sha256').update(`${sessionId}::${ordenados}`).digest('hex').slice(0, 32);
}
