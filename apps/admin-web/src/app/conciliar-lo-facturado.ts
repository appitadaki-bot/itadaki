/**
 * Por qué lo facturado y lo cobrado no dan lo mismo.
 *
 * Son dos cosas distintas: facturado es lo que salió de la cocina, cobrado es
 * lo que entró en la caja. La diferencia tiene tres causas y ninguna es un
 * error, pero mostrar los dos números sin explicar el hueco hace pensar que
 * desapareció plata — y quien mira esto cruza el número con su caja.
 */
export interface CobroMinimo {
  readonly cobrado: { readonly amountInMinorUnits: number };
  readonly descuento: { readonly amountInMinorUnits: number };
}

export interface Conciliacion {
  /** Lo que entró, ya con el descuento restado. */
  readonly cobrado: number;
  /** Lo que el local resignó por pagar en efectivo. */
  readonly descuento: number;
  /** Pedidos servidos cuya mesa todavía no cerró la cuenta. */
  readonly sinCerrar: number;
  /** Si los tres pedazos explican el total. */
  readonly cierra: boolean;
}

export function conciliar(
  facturadoMinor: number,
  cobros: readonly CobroMinimo[],
): Conciliacion {
  const cobrado = cobros.reduce((suma, c) => suma + c.cobrado.amountInMinorUnits, 0);
  const descuento = cobros.reduce((suma, c) => suma + c.descuento.amountInMinorUnits, 0);

  /*
   * Lo que falta son mesas abiertas, salvo que dé negativo.
   *
   * Da negativo cuando se cobró en esta ventana algo pedido antes: una mesa
   * que quedó abierta de ayer y se cerró hoy. Ahí el hueco no se explica con
   * lo que hay a mano, y decir "menos cero" sería inventar prolijidad.
   */
  const resto = facturadoMinor - cobrado - descuento;
  return {
    cobrado,
    descuento,
    sinCerrar: Math.max(0, resto),
    cierra: resto >= 0,
  };
}
