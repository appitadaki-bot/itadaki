export interface PlatoEnSeguimiento {
  readonly key: string;
  readonly name: string;
  readonly quantity: number;
  readonly status: string;
}

/**
 * Junta en un renglón el mismo plato cuando va por el mismo estado.
 *
 * La lista sale de las comandas, plato por plato: dos empanadas pedidas en
 * comandas distintas eran dos renglones idénticos, uno arriba del otro. Con
 * seis renglones ya no se lee de un vistazo cuánto falta.
 *
 * Por nombre **y** estado: si una empanada ya está servida y la otra sigue en
 * cola, juntarlas obligaría a elegir un estado para las dos y cualquiera de
 * los dos sería mentira. Ahí van separadas, que es la información que importa.
 */
export function juntarLoMismoEnCocina<T extends PlatoEnSeguimiento>(
  platos: readonly T[],
): readonly T[] {
  const juntados = new Map<string, T>();

  for (const plato of platos) {
    const clave = `${plato.name}::${plato.status}`;
    const anterior = juntados.get(clave);

    juntados.set(
      clave,
      anterior === undefined ? plato : { ...anterior, quantity: anterior.quantity + plato.quantity },
    );
  }

  // En el orden en que aparecieron: manda el primero de cada plato, así la
  // lista sigue pareciéndose a cómo se pidió.
  return [...juntados.values()];
}

/** Cuántos platos hay contando las cantidades, no los renglones. */
export function cuantosPlatos(platos: readonly PlatoEnSeguimiento[]): number {
  return platos.reduce((total, plato) => total + plato.quantity, 0);
}
