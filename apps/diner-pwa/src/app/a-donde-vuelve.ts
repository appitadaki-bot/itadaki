/**
 * Cómo se llama la pantalla a la que vuelve el botón de atrás.
 *
 * El botón retrocede en el historial —hace lo mismo que el del navegador— pero
 * su texto estaba escrito a mano: las tres pantallas decían "La carta". Quien
 * entraba a la cuenta desde el carrito leía "La carta", tocaba, y aparecía en
 * el carrito. El botón mentía sobre a dónde llevaba.
 *
 * Se resuelve mirando de dónde vino, no adivinando: la pantalla anterior es un
 * dato que el navegador ya tiene.
 */

/** Las pantallas del comensal, con el nombre que usa la app. */
const NOMBRES: Record<string, string> = {
  '/carta': 'La carta',
  '/carrito': 'El carrito',
  '/estado': 'Mi pedido',
  '/cuenta': 'La cuenta',
  '/producto': 'La carta',
};

/**
 * El nombre de una ruta, o el de la carta si no la conocemos.
 *
 * La carta como último recurso porque es la pantalla principal: quien entra
 * por el QR cae ahí, y es a donde el botón navega cuando no hay historial.
 */
export function nombreDeLaPantalla(ruta: string): string {
  // Sin la query ni el fragmento: `/carrito?x=1` es el carrito igual.
  const sinQuery = ruta.split('?')[0] ?? '';
  const sinFragmento = sinQuery.split('#')[0] ?? '';
  const primerTramo = sinFragmento.split('/').filter(Boolean)[0] ?? '';

  return NOMBRES[`/${primerTramo}`] ?? 'La carta';
}

/**
 * A dónde vuelve el botón, y cómo se llama.
 *
 * `anterior` es de dónde vino esta pantalla, cuando se sabe. Sin eso —alguien
 * que escaneó el QR y cayó directo acá— el botón navega a `porDefecto`, y ahí
 * el nombre tiene que ser el de esa pantalla y no el de una que nunca visitó.
 */
export function aDondeVuelve(
  anterior: string | null,
  porDefecto: string,
): { readonly ruta: string; readonly nombre: string } {
  const destino = anterior ?? porDefecto;

  return { ruta: destino, nombre: nombreDeLaPantalla(destino) };
}
