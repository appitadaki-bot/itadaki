/**
 * Cuánto falta para que llegue la comida.
 *
 * La pregunta que la mesa se hace a los diez minutos y que hoy sólo se puede
 * contestar levantando la mano. El sistema ya sabe la respuesta: mide cuánto
 * tarda de verdad cada pedido en ese restaurante.
 *
 * Se dice en lenguaje de espera y no como una promesa —"suele tardar unos 20
 * minutos", no "faltan 7"— porque una cuenta regresiva convierte cada minuto
 * en una falta cuando la cocina se atrasa, y la cocina se atrasa. Un rango
 * honesto envejece bien; un número exacto se vuelve mentira sola.
 */

/**
 * Cuántos pedidos hacen falta para hablar de "lo normal".
 *
 * Con menos, la mediana es la anécdota de unas pocas mesas: un local que abrió
 * ayer diría veinte minutos porque el único pedido que tuvo salió en veinte.
 * Callarse es mejor que inventar el número que la mesa va a usar para decidir
 * si esperar.
 */
export const PEDIDOS_PARA_ESTIMAR = 12;

/**
 * Cuánto puede pasarse antes de que sea "está tardando".
 *
 * La mitad más de lo habitual. Más apretado convierte cualquier noche ocupada
 * en una alarma —y la mesa que ve "demorado" cada vez deja de creerle—; más
 * ancho llega cuando la mesa ya se cansó de esperar sola.
 */
export const DE_MAS_PARA_DEMORADO = 1.5;

export type EstadoDeLaEspera =
  /** Sin datos suficientes: no se dice nada. */
  | { readonly kind: 'SIN_DATOS' }
  /** Dentro de lo habitual. */
  | { readonly kind: 'EN_HORA'; readonly habitualMinutos: number }
  /** Se pasó de lo habitual: la espera dejó de ser normal. */
  | { readonly kind: 'DEMORADO'; readonly habitualMinutos: number; readonly esperandoMinutos: number };

/**
 * En qué estado está esta espera.
 *
 * `habitualMinutos` es la mediana de lo que tarda ese local, y no un promedio:
 * un pedido que quedó olvidado tres horas corre el promedio para todos los
 * demás, y la mesa vería un número que no describe ninguna espera real.
 */
export function estadoDeLaEspera(input: {
  readonly habitualMinutos: number | null;
  readonly pedidosMedidos: number;
  readonly esperandoMinutos: number;
}): EstadoDeLaEspera {
  const { habitualMinutos, pedidosMedidos, esperandoMinutos } = input;

  if (habitualMinutos === null || habitualMinutos <= 0) {
    return { kind: 'SIN_DATOS' };
  }
  if (pedidosMedidos < PEDIDOS_PARA_ESTIMAR) {
    return { kind: 'SIN_DATOS' };
  }

  if (esperandoMinutos > habitualMinutos * DE_MAS_PARA_DEMORADO) {
    return { kind: 'DEMORADO', habitualMinutos, esperandoMinutos };
  }

  return { kind: 'EN_HORA', habitualMinutos };
}

/**
 * El número redondeado como se dice en voz alta.
 *
 * A los cinco minutos: nadie dice "diecisiete minutos", dice "un cuarto de
 * hora". Y un número redondo se lee como lo que es —una referencia— mientras
 * que "17" se lee como una promesa que alguien midió.
 */
export function redondearEspera(minutos: number): number {
  return Math.max(5, Math.round(minutos / 5) * 5);
}

/** Cuántos minutos hace que se envió el pedido. */
export function minutosEsperando(enviadoEn: Date, ahora: Date): number {
  return Math.max(0, (ahora.getTime() - enviadoEn.getTime()) / 60_000);
}
