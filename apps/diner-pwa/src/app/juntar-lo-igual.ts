export interface LineaDeCuenta {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitTotal: { readonly amountInMinorUnits: number; readonly currency: string };
}

/**
 * Junta en un renglón lo que es el mismo plato al mismo precio.
 *
 * La cuenta se arma de las comandas, en el orden en que salieron de la cocina:
 * una mesa que pidió agua tres veces a lo largo de la noche veía tres renglones
 * de agua separados por todo lo demás. Para controlar la cuenta hay que sumar
 * de memoria, que es justo lo que nadie quiere hacer cuando le traen el total.
 *
 * Se junta por nombre y precio unitario, no sólo por nombre: la misma
 * provoleta con un agregado cuesta distinto, y meterlas en un renglón
 * mostraría un precio que no es el de ninguna de las dos.
 */
export function juntarLoIgual(lineas: readonly LineaDeCuenta[]): readonly LineaDeCuenta[] {
  const juntadas = new Map<string, LineaDeCuenta>();

  for (const linea of lineas) {
    const clave = `${linea.name}::${linea.unitTotal.amountInMinorUnits}::${linea.unitTotal.currency}`;
    const anterior = juntadas.get(clave);

    juntadas.set(
      clave,
      anterior === undefined
        ? linea
        : { ...anterior, quantity: anterior.quantity + linea.quantity },
    );
  }

  // En el orden en que aparecieron: el primero de cada plato manda, así la
  // lista sigue pareciéndose a cómo se pidió.
  return [...juntadas.values()];
}
