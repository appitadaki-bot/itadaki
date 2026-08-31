/**
 * Saca un elemento de su lugar y lo mete en otro.
 *
 * Vive afuera del componente porque llegan dos caminos: las flechas, que
 * mueven de a un lugar, y el arrastre, que lo suelta encima de cualquiera.
 * Es la misma cuenta y conviene que sea el mismo código.
 */
export function moverEnLista<T>(lista: readonly T[], desde: number, hasta: number): T[] {
  if (desde < 0 || hasta < 0 || desde >= lista.length || hasta >= lista.length) {
    return [...lista];
  }

  const copia = [...lista];
  const [movido] = copia.splice(desde, 1);
  if (movido !== undefined) copia.splice(hasta, 0, movido);
  return copia;
}
