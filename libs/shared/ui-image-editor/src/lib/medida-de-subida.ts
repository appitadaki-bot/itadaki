/**
 * Hasta dónde se achica la foto antes de mandarla.
 *
 * Es la misma medida con la que el servidor guarda el original, así que
 * achicarla acá no pierde nada que allá se fuera a conservar: la variante más
 * grande de la carta mide 1200.
 */
export const LADO_MAXIMO = 2560;

/**
 * Cuándo no vale la pena tocar la foto.
 *
 * Una que ya entra en la medida y pesa poco se manda tal cual: volver a
 * comprimir lo que ya está bien sólo pierde calidad, y el ahorro sería de
 * unos pocos kilobytes.
 */
export const PESO_QUE_YA_ESTA_BIEN = 1_500_000;

export interface MedidaDeSubida {
  readonly width: number;
  readonly height: number;
}

/**
 * A qué medida conviene achicar una foto antes de subirla, o `null` si va
 * como está.
 *
 * Una foto de teléfono sale de doce megapíxeles y pesa cuatro o cinco megas.
 * Viaja en base64, que le suma un tercio, y del otro lado el servidor la
 * decodifica entera para achicarla a esto mismo. Dos de las tres cosas que
 * hacen esperar al dueño —la subida y el primer decodificado— se van si la
 * foto sale del teléfono ya en la medida final.
 */
export function medidaDeSubida(
  width: number,
  height: number,
  bytes: number,
  ladoMaximo = LADO_MAXIMO,
): MedidaDeSubida | null {
  const lado = Math.max(width, height);
  if (lado === 0) return null;
  if (lado <= ladoMaximo && bytes <= PESO_QUE_YA_ESTA_BIEN) return null;

  // Nunca agrandar: una foto chica que pesa de más se reencoda en su medida.
  const escala = Math.min(1, ladoMaximo / lado);

  return {
    width: Math.max(1, Math.round(width * escala)),
    height: Math.max(1, Math.round(height * escala)),
  };
}
