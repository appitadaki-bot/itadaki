/**
 * Lo que queda registrado cuando alguien toca la carta.
 *
 * Existía una auditoría de precios que nadie llamaba, y sólo cubría precios.
 * Un plato que desaparece o una importación que reemplaza setenta no dejaban
 * rastro, y son cambios con la misma consecuencia: el comensal ve otra cosa.
 */

export const ENTIDADES = ['PLATO', 'CATEGORIA', 'CARTA'] as const;
export type Entidad = (typeof ENTIDADES)[number];

export const ACCIONES = ['CREO', 'CAMBIO', 'BORRO', 'IMPORTO'] as const;
export type Accion = (typeof ACCIONES)[number];

export interface CambioEnLaCarta {
  readonly entidad: Entidad;
  /** Null cuando el cambio es de la carta entera. */
  readonly entidadId: string | null;
  readonly accion: Accion;
  /** Cómo se leía antes y cómo queda. Null cuando no aplica. */
  readonly antes: string | null;
  readonly despues: string | null;
}

/**
 * Cómo se lee un cambio en el panel.
 *
 * Se arma acá y no en la pantalla para que el registro sea el mismo mire
 * quien lo mire: la fila guardada ya dice lo que pasó, sin depender de cómo
 * lo formatee cada vista.
 */
export function comoSeLee(cambio: CambioEnLaCarta): string {
  const que =
    cambio.entidad === 'CARTA'
      ? 'la carta'
      : cambio.entidad === 'CATEGORIA'
        ? 'una categoría'
        : 'un plato';

  switch (cambio.accion) {
    case 'CREO':
      return `agregó ${que}${cambio.despues === null ? '' : `: ${cambio.despues}`}`;
    case 'BORRO':
      return `borró ${que}${cambio.antes === null ? '' : `: ${cambio.antes}`}`;
    case 'IMPORTO':
      return `importó ${que}${cambio.despues === null ? '' : ` (${cambio.despues})`}`;
    case 'CAMBIO':
      // El antes y el después juntos: "cambió un plato: $12.000 → $14.000"
      // dice en un renglón lo que dos columnas separadas obligan a cruzar.
      return cambio.antes !== null && cambio.despues !== null
        ? `cambió ${que}: ${cambio.antes} → ${cambio.despues}`
        : `cambió ${que}`;
  }
}

/**
 * El precio, como se escribe en el registro.
 *
 * En pesos enteros: la carta no usa centavos y "$12.000" se lee de un
 * vistazo, que es lo que hace falta al revisar una lista de cambios.
 */
export function precioComoTexto(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(minorUnits / 100);
}

/**
 * Qué cambió de un plato, en palabras.
 *
 * Devuelve null cuando no cambió nada que valga registrar: guardar una fila
 * por cada guardado sin cambios llenaría la bitácora de ruido y haría que
 * nadie la lea.
 */
export function queCambioDelPlato(
  antes: { nombre: string; precioMinor: number; currency: string; disponible: boolean },
  despues: { nombre: string; precioMinor: number; currency: string; disponible: boolean },
): { antes: string; despues: string } | null {
  const partes: Array<{ antes: string; despues: string }> = [];

  if (antes.nombre !== despues.nombre) {
    partes.push({ antes: antes.nombre, despues: despues.nombre });
  }

  if (antes.precioMinor !== despues.precioMinor) {
    partes.push({
      antes: precioComoTexto(antes.precioMinor, antes.currency),
      despues: precioComoTexto(despues.precioMinor, despues.currency),
    });
  }

  if (antes.disponible !== despues.disponible) {
    partes.push({
      antes: antes.disponible ? 'disponible' : 'sin stock',
      despues: despues.disponible ? 'disponible' : 'sin stock',
    });
  }

  if (partes.length === 0) return null;

  return {
    antes: partes.map((p) => p.antes).join(' · '),
    despues: partes.map((p) => p.despues).join(' · '),
  };
}
