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

/** Lo mismo, contando cuentas: es lo que hace falta para un promedio. */
export interface CobroConCuentas extends CobroMinimo {
  readonly cuentas: number;
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

/**
 * Lo facturado: la plata que entró, ya con el descuento restado.
 *
 * Antes se calculaba sumando lo que salió de la cocina. Una mesa de $146.000
 * que pagó $131.400 en efectivo aparecía como $146.000 facturados, y el número
 * no coincidía con la caja que el dueño cruza contra esto.
 *
 * Entra también lo cobrado sin declarar con qué medio: es plata que entró
 * igual, y dejarla afuera haría que el total dijera de menos.
 */
export function laPlataQueEntro(cobros: readonly CobroMinimo[]): number {
  return cobros.reduce((suma, cobro) => suma + cobro.cobrado.amountInMinorUnits, 0);
}

/**
 * Cuánto dejó cada cuenta que se cobró.
 *
 * Sobre lo cobrado y sobre las cuentas cerradas, no sobre lo que salió de la
 * cocina: al lado de "Facturado" tienen que hablar de la misma plata. Con una
 * mesa de $146.000 que pagó $131.400, un ticket promedio de $146.000 no
 * coincide con nada que el dueño pueda cruzar.
 *
 * Null mientras no se cobró ninguna cuenta. Cero sería decir que las mesas
 * dejan cero, y lo que pasa es que todavía no cerró ninguna.
 */
export function elTicketPromedio(cobros: readonly CobroConCuentas[]): number | null {
  const cuentas = cobros.reduce((suma, cobro) => suma + cobro.cuentas, 0);
  if (cuentas === 0) return null;

  return Math.round(laPlataQueEntro(cobros) / cuentas);
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
