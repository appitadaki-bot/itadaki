/**
 * Si hace falta volver a leer la cuenta cuando la mesa cambia.
 *
 * La pantalla la leía una sola vez al abrirla. El mozo cobraba, del lado del
 * servidor la mesa quedaba cerrada, y el comensal seguía viendo el botón de
 * pagar: nunca llegaba al "gracias" ni al pedido de reseña, que viven en ese
 * estado.
 */
export function hayQueReleerLaCuenta(
  sessionId: string | undefined,
  estado: 'OPEN' | 'SETTLED' | undefined,
): boolean {
  // Sin mesa no hay qué pedir.
  if (sessionId === undefined) return false;

  // Cerrada no cambia más: seguir pidiéndola es ruido contra el servidor cada
  // vez que alguien de la mesa toca algo.
  return estado !== 'SETTLED';
}
