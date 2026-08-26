/**
 * Qué hacer cuando el cobrador avisa algo sobre una suscripción.
 *
 * La decisión vive acá y no en el controller para poder probarla sin red y
 * sin Mercado Pago: lo que llega por HTTP es un aviso de que algo cambió, y lo
 * único que importa es si el restaurante queda al día o no.
 *
 * Está escrito contra un aviso genérico y no contra el formato de Mercado
 * Pago a propósito. Cambiar de cobrador —o sumar otro— es traducir su aviso a
 * este tipo, no reescribir la regla.
 */

/** Lo que el cobrador dice que pasó con un cobro. */
export type EstadoDePago =
  /** Entró la plata. */
  | 'APROBADO'
  /** La tarjeta rechazó, o el cobro venció sin pagarse. */
  | 'RECHAZADO'
  /** Se devolvió lo cobrado. */
  | 'DEVUELTO'
  /** El local dio de baja la suscripción. */
  | 'CANCELADO'
  /** Todavía procesando: no dice nada todavía. */
  | 'PENDIENTE';

export interface AvisoDePago {
  /** Qué restaurante. Sale de lo que mandamos al crear la suscripción. */
  readonly tenantId: string;
  readonly estado: EstadoDePago;
  /** Identificador del cobro, para no aplicar dos veces el mismo aviso. */
  readonly referencia: string;
}

export interface EfectoDelAviso {
  /**
   * Cuántos meses de servicio suma este aviso. 0 es "no cambia nada".
   *
   * Se suma a lo que ya tenía en vez de fijar una fecha: si paga dos meses
   * seguidos, el segundo empieza donde termina el primero.
   */
  readonly mesesQueSuma: number;
  /** Si corta el servicio ya mismo, sin esperar a que venza. */
  readonly cortaYa: boolean;
  /** Por qué, para el log: un cobro que no entró hay que poder rastrearlo. */
  readonly motivo: string;
}

/** Cuánto dura un ciclo. Un mes, que es como se cobra. */
const MESES_POR_COBRO = 1;

/**
 * Hasta cuándo queda pago después de este aviso.
 *
 * Suma sobre lo que quedaba, no sobre hoy: quien paga el día 25 de un mes ya
 * pago no pierde los días que le quedaban. Si ya estaba vencido, arranca de
 * hoy — no se le regalan los días que estuvo sin pagar.
 */
export function nuevoVencimiento(
  actual: Date | null,
  meses: number,
  ahora: Date,
): Date {
  const base = actual !== null && actual > ahora ? actual : ahora;
  const nuevo = new Date(base);
  nuevo.setMonth(nuevo.getMonth() + meses);
  return nuevo;
}

/**
 * Traduce el aviso a lo que hay que guardar.
 *
 * Un cobro aprobado suma un mes. Un rechazo NO corta nada: el cobrador
 * reintenta solo, y cortarle el servicio a alguien cuya tarjeta falló una vez
 * es perder un cliente por un problema del banco. Lo único que corta en el
 * acto es una devolución, porque ahí la plata volvió.
 */
export function efectoDe(aviso: AvisoDePago): EfectoDelAviso {
  switch (aviso.estado) {
    case 'APROBADO':
      return { mesesQueSuma: MESES_POR_COBRO, cortaYa: false, motivo: 'cobro aprobado' };

    case 'DEVUELTO':
      // Se devolvió la plata: el mes no se prestó. Corta ya.
      return { mesesQueSuma: 0, cortaYa: true, motivo: 'cobro devuelto' };

    case 'CANCELADO':
      // Dar de baja no quita lo ya pago: quien pagó hasta fin de mes lo usa
      // hasta fin de mes. Simplemente deja de renovarse, y vence solo.
      return { mesesQueSuma: 0, cortaYa: false, motivo: 'suscripción dada de baja' };

    case 'RECHAZADO':
      // A propósito no toca nada: el cobrador reintenta solo, y un rechazo
      // aislado no es una baja. Si de verdad deja de pagar, el vencimiento
      // llega por su cuenta.
      return { mesesQueSuma: 0, cortaYa: false, motivo: 'cobro rechazado — se espera el reintento' };

    case 'PENDIENTE':
      return { mesesQueSuma: 0, cortaYa: false, motivo: 'cobro en proceso' };
  }
}
