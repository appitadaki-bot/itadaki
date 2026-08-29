/**
 * Qué platos acaban de aparecer en la mesa.
 *
 * La mesa pide junta, pero hasta ahora eso sólo se sabía leyendo: los platos
 * de los demás aparecían en la lista sin que nada dijera que eran nuevos.
 * Marcarlos deja ver a la mesa pedir, que es lo que la app hace distinto.
 *
 * Se marcan sólo los ajenos. Lo propio ya se vio al tocarlo, y animarlo otra
 * vez cuando vuelve del servidor haría dudar de si se agregó dos veces.
 */

/**
 * Cuánto queda marcado un plato nuevo.
 *
 * Lo que tarda en mirarse: más corto se pierde si la pantalla estaba en el
 * bolsillo, más largo y sigue "nuevo" cuando ya dejó de serlo.
 */
export const MARCADO_MS = 4000;

export interface Recien {
  /** Si esta línea acaba de aparecer y es de otra persona. */
  readonly esNueva: (lineId: string) => boolean;
  /** Actualiza qué líneas hay ahora, y devuelve las que entraron. */
  readonly mirar: (lineas: ReadonlyArray<{ id: string; dinerId: string }>, yo: string | null) => void;
}

/**
 * Sigue qué líneas son nuevas entre una actualización y la siguiente.
 *
 * La primera pasada no marca nada: al abrir el carrito, todo lo que hay ya
 * estaba ahí, y animar la lista entera al entrar sería ruido, no una noticia.
 */
export function seguirRecienAgregados(ahora: () => number = Date.now): Recien {
  const marcados = new Map<string, number>();
  let conocidas: Set<string> | null = null;

  return {
    esNueva: (lineId: string): boolean => {
      const desde = marcados.get(lineId);
      return desde !== undefined && ahora() - desde < MARCADO_MS;
    },

    mirar: (lineas, yo): void => {
      const ids = new Set(lineas.map((linea) => linea.id));

      // La primera vez sólo se toma nota: no hay "antes" con qué comparar.
      if (conocidas === null) {
        conocidas = ids;
        return;
      }

      const nuevas = lineas.filter(
        (linea) => !conocidas?.has(linea.id) && linea.dinerId !== yo,
      );

      const cuando = ahora();
      for (const linea of nuevas) marcados.set(linea.id, cuando);

      // Las viejas se olvidan: sin esto el mapa crece toda la comida.
      for (const [id, desde] of marcados) {
        if (cuando - desde >= MARCADO_MS) marcados.delete(id);
      }

      conocidas = ids;
    },
  };
}
